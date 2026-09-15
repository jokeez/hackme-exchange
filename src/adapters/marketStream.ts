/**
 * Unified market stream — WebSocket when API advertises it, else consolidated poll / local emit.
 * Replaces duplicate labBookTimer + scattered book/tape refresh timers.
 */

import type { PairId } from "../types";
import { INTEGRATION } from "../config/integration";
import { exchangeHealth, type HealthResponse } from "./exchangeApi";
import { getLabSessionMeta, listExchangeFills, listExchangeOrders, pairIdToApi, fetchExchangeBalances, mergeApiBalancesIntoWallet } from "./exchangeApi";
import { mergeServerFills, mergeServerOpenOrders, refreshLabBook } from "./labMatching";
import type { DemoState, MarketSnapshot } from "../types";

export type StreamTransport = "ws" | "poll" | "local" | "idle";

export type MarketStreamEvent =
  | { type: "book"; pairId: PairId; changed: boolean }
  | { type: "tape" }
  | { type: "trades" }
  | { type: "transport"; transport: StreamTransport };

export type MarketStreamHandlers = {
  onEvent?: (ev: MarketStreamEvent) => void;
};

export type MarketStreamOptions = {
  getActivePair: () => PairId;
  isSpotView: () => boolean;
  useLab: () => boolean;
  getState?: () => DemoState;
  getMarket?: () => MarketSnapshot | null;
  saveState?: () => void;
};

type WsMsg =
  | { type: "book"; pair?: string; changed?: boolean }
  | { type: "tape" | "trades" | "ping" }
  | { type: "fill" };

function wsBaseFromApiOrigin(origin: string): string {
  const u = origin.replace(/\/$/, "");
  if (u.startsWith("https://")) return u.replace(/^https:/, "wss:");
  if (u.startsWith("http://")) return u.replace(/^http:/, "ws:");
  return `wss://${u}`;
}

function streamUrlFromHealth(health: HealthResponse, pairId: PairId): string | null {
  const streams = health.streams;
  if (!streams) return null;
  const raw = streams.market || streams.book || streams.l2;
  if (!raw || typeof raw !== "string") return null;
  if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
    return raw.includes("{pair}") ? raw.replace("{pair}", pairIdToApi(pairId)) : raw;
  }
  const base = INTEGRATION.exchangeApiOrigin?.replace(/\/$/, "") || "";
  if (!base) return null;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${wsBaseFromApiOrigin(base)}${path}?pair=${encodeURIComponent(pairIdToApi(pairId))}`;
}

export class MarketStream {
  private handlers: MarketStreamHandlers;
  private opts: MarketStreamOptions;
  private transport: StreamTransport = "idle";
  private pollTimer: number | undefined;
  private ws: WebSocket | null = null;
  private wsBackoff = 1000;
  private wsDisabled = false;
  private fillTick = 0;
  private running = false;
  private paperNotify: (() => void) | null = null;

  constructor(handlers: MarketStreamHandlers, opts: MarketStreamOptions) {
    this.handlers = handlers;
    this.opts = opts;
  }

  getTransport(): StreamTransport {
    return this.transport;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.bootTransport();
  }

  stop(): void {
    this.running = false;
    this.setTransport("idle");
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    document.removeEventListener("visibilitychange", this.onVis);
    this.closeWs();
    this.paperNotify = null;
  }

  /** Paper mode: call from microTick when synthetic book/tape may have changed. */
  notifyLocalBookTape(): void {
    if (!this.running || this.transport !== "local") return;
    this.handlers.onEvent?.({ type: "book", pairId: this.opts.getActivePair(), changed: true });
    this.handlers.onEvent?.({ type: "tape" });
  }

  private setTransport(t: StreamTransport): void {
    if (this.transport === t) return;
    this.transport = t;
    this.handlers.onEvent?.({ type: "transport", transport: t });
  }

  private async bootTransport(): Promise<void> {
    if (!this.opts.isSpotView()) {
      this.setTransport("idle");
      return;
    }
    if (this.opts.useLab()) {
      const wsOk = await this.tryWebSocket();
      if (wsOk) return;
      this.startPoll();
      return;
    }
    this.setTransport("local");
  }

  private async tryWebSocket(): Promise<boolean> {
    if (this.wsDisabled || typeof WebSocket === "undefined") return false;
    const health = await exchangeHealth(2_500);
    if (!("ok" in health) || !health.ok) return false;
    const pair = this.opts.getActivePair();
    const url = streamUrlFromHealth(health, pair);
    if (!url) return false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      try {
        this.closeWs();
        const ws = new WebSocket(url);
        this.ws = ws;
        const failTimer = window.setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            finish(false);
          }
        }, 3_000);

        ws.onopen = () => {
          clearTimeout(failTimer);
          this.wsBackoff = 1000;
          this.setTransport("ws");
          if (this.pollTimer) clearInterval(this.pollTimer);
          this.pollTimer = undefined;
          finish(true);
        };
        ws.onmessage = (ev) => this.onWsMessage(String(ev.data));
        ws.onerror = () => {
          clearTimeout(failTimer);
          finish(false);
        };
        ws.onclose = () => {
          clearTimeout(failTimer);
          if (this.transport === "ws") {
            this.setTransport("poll");
            this.scheduleWsReconnect();
          }
          if (!settled) finish(false);
        };
      } catch {
        finish(false);
      }
    });
  }

  private scheduleWsReconnect(): void {
    if (!this.running || this.wsDisabled) return;
    window.setTimeout(() => {
      if (!this.running) return;
      void this.tryWebSocket().then((ok) => {
        if (!ok && this.transport !== "ws") this.startPoll();
      });
    }, this.wsBackoff);
    this.wsBackoff = Math.min(this.wsBackoff * 1.8, 30_000);
  }

  private onWsMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as WsMsg;
      if (msg.type === "ping") return;
      if (msg.type === "book") {
        const pairId = this.opts.getActivePair();
        void refreshLabBook(pairId).then((r) => {
          this.handlers.onEvent?.({ type: "book", pairId, changed: r.changed });
        });
        return;
      }
      if (msg.type === "tape" || msg.type === "trades" || msg.type === "fill") {
        void this.syncFillsLight().then((changed) => {
          this.handlers.onEvent?.({ type: "tape" });
          if (changed) this.handlers.onEvent?.({ type: "trades" });
        });
      }
    } catch {
      /* ignore malformed */
    }
  }

  private closeWs(): void {
    if (!this.ws) return;
    try {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private pollIntervalMs(): number {
    return document.visibilityState === "visible" ? 220 : 900;
  }

  private startPoll(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.setTransport("poll");
    const run = () => void this.pollTick();
    this.pollTimer = window.setInterval(run, this.pollIntervalMs());
    void this.pollTick();
    document.addEventListener("visibilitychange", this.onVis);
  }

  private onVis = (): void => {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = window.setInterval(() => void this.pollTick(), this.pollIntervalMs());
    void this.pollTick();
  };

  private async pollTick(): Promise<void> {
    if (!this.running || !this.opts.isSpotView() || !this.opts.useLab()) return;
    const pairId = this.opts.getActivePair();
    const book = await refreshLabBook(pairId);
    if (book.changed) this.handlers.onEvent?.({ type: "book", pairId, changed: true });

    this.fillTick += 1;
    if (this.fillTick % 3 === 0) {
      const changed = await this.syncFillsLight();
      this.handlers.onEvent?.({ type: "tape" });
      if (changed) this.handlers.onEvent?.({ type: "trades" });
    }
  }

  private async syncFillsLight(): Promise<boolean> {
    const state = this.opts.getState?.();
    if (!state) return false;
    const orders = await listExchangeOrders();
    let changed = false;
    if (orders.ok) {
      const before = state.orders.length;
      mergeServerOpenOrders(state, orders.orders);
      if (state.orders.length !== before) changed = true;
    }
    const fills = await listExchangeFills(30);
    if (fills.ok) {
      const account = getLabSessionMeta().address;
      const added = mergeServerFills(state, fills.fills, account, this.opts.getMarket?.() ?? null);
      if (added > 0) {
        changed = true;
        const bal = await fetchExchangeBalances();
        if (bal.ok) {
          state.wallet = mergeApiBalancesIntoWallet(state.wallet, bal.balances ?? [], { labAuthoritative: true });
        }
      }
    }
    if (changed) this.opts.saveState?.();
    return changed;
  }
}
export function createMarketStream(handlers: MarketStreamHandlers, opts: MarketStreamOptions): MarketStream {
  return new MarketStream(handlers, opts);
}
