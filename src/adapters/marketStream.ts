/**
 * Unified market stream — WebSocket when API advertises it, else consolidated poll / local emit.
 * Replaces duplicate labBookTimer + scattered book/tape refresh timers.
 */

import type { DemoState, MarketSnapshot, OrderSide, PairId } from "../types";
import { INTEGRATION } from "../config/integration";
import {
  exchangeHealth,
  type HealthResponse,
  getLabSessionMeta,
  listExchangeFills,
  listExchangeOrders,
  pairIdToApi,
  apiPairToId,
  fetchExchangeBalances,
  mergeApiBalancesIntoWallet,
  rememberLedgerHolds,
  fetchPublicTrades,
  apiPriceToDisplay,
  minorToDisplay,
} from "./exchangeApi";
import { mergeServerFills, mergeServerOpenOrders, refreshLabBook, refreshServerVip } from "./labMatching";
import { marketTradeToPrint, type TapePrint } from "../tape";

export type StreamTransport = "ws" | "poll" | "local" | "idle";

export type MarketStreamEvent =
  | { type: "book"; pairId: PairId; changed: boolean }
  | { type: "tape" }
  | { type: "trades" }
  | { type: "transport"; transport: StreamTransport }
  | { type: "public_tape"; pairId: PairId; prints: TapePrint[] };

export type MarketStreamHandlers = {
  onEvent?: (ev: MarketStreamEvent) => void;
};

export type MarketStreamOptions = {
  getActivePair: () => PairId;
  isSpotView: () => boolean;
  /** Live public L2 and/or session matching — polls /book without requiring Connect. */
  useLiveBook: () => boolean;
  /** CSRF session — sync fills/orders (requires Connect). */
  useSession?: () => boolean;
  /** @deprecated use useLiveBook */
  useLab?: () => boolean;
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
  private tabId = `t${Math.random().toString(36).slice(2, 10)}`;
  private bookLeaderKey = "hackme-ex-book-poll-leader-v1";
  private isBookLeader = true;
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

  private liveBookOn(): boolean {
    return this.opts.useLiveBook?.() ?? this.opts.useLab?.() ?? false;
  }

  private sessionOn(): boolean {
    return this.opts.useSession?.() ?? this.opts.useLab?.() ?? false;
  }

  private async bootTransport(): Promise<void> {
    if (!this.opts.isSpotView()) {
      this.setTransport("idle");
      return;
    }
    if (this.liveBookOn()) {
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
          // WS alone may stay quiet — pull tape/book once so 24h Vol + L2 paint immediately.
          void this.syncPublicTrades(pair);
          void refreshLabBook(pair).then((r) => {
            this.handlers.onEvent?.({ type: "book", pairId: pair, changed: r.changed });
          });
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
        void this.syncPublicTrades(this.opts.getActivePair());
        if (this.sessionOn()) {
          void this.syncFillsLight().then((changed) => {
            this.handlers.onEvent?.({ type: "tape" });
            if (changed) this.handlers.onEvent?.({ type: "trades" });
          });
        } else {
          this.handlers.onEvent?.({ type: "tape" });
        }
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

  /** Backoff when GET /book returns 429 — do not stampede the soft-launch cap. */
  private bookBackoffUntil = 0;
  private bookPollMs = 1_500;

  private pollIntervalMs(): number {
    // Soft-launch book cap is per-IP; 220ms polling burned the budget and blanked L2/tape.
    const base = document.visibilityState === "visible" ? this.bookPollMs : Math.max(this.bookPollMs * 2, 4_000);
    return Math.max(800, base);
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

  private reschedulePoll(): void {
    if (!this.pollTimer || !this.running) return;
    clearInterval(this.pollTimer);
    this.pollTimer = window.setInterval(() => void this.pollTick(), this.pollIntervalMs());
  }

  private claimBookPollLeader(): boolean {
    const now = Date.now();
    try {
      const raw = localStorage.getItem(this.bookLeaderKey);
      const parsed = raw ? (JSON.parse(raw) as { id?: string; at?: number }) : null;
      const stale = !parsed?.id || !parsed.at || now - parsed.at > 4_500;
      if (stale || parsed.id === this.tabId) {
        localStorage.setItem(this.bookLeaderKey, JSON.stringify({ id: this.tabId, at: now }));
        this.isBookLeader = true;
        return true;
      }
      this.isBookLeader = false;
      return false;
    } catch {
      this.isBookLeader = true;
      return true;
    }
  }

  private async pollTick(): Promise<void> {
    if (!this.running || !this.opts.isSpotView() || !this.liveBookOn()) return;
    const pairId = this.opts.getActivePair();
    const now = Date.now();
    const leader = this.claimBookPollLeader();

    // Public tape: leader every tick; followers every 3rd to cut multi-tab stampede.
    this.fillTick += 1;
    if (leader || this.fillTick % 3 === 0) {
      await this.syncPublicTrades(pairId);
    }

    if (leader && now >= this.bookBackoffUntil) {
      const book = await refreshLabBook(pairId);
      if (!book.ok && /rate.?limit|too many book/i.test(book.note ?? "")) {
        this.bookPollMs = Math.min(6_000, Math.max(2_000, this.bookPollMs * 1.5));
        this.bookBackoffUntil = now + this.bookPollMs;
        this.reschedulePoll();
      } else if (book.ok) {
        if (this.bookPollMs > 1_500) {
          this.bookPollMs = Math.max(1_500, this.bookPollMs * 0.85);
          this.reschedulePoll();
        }
        if (book.changed) this.handlers.onEvent?.({ type: "book", pairId, changed: true });
      }
    }

    // Session fills/orders need Connect CSRF.
    if (!this.sessionOn()) return;
    if (this.fillTick % 3 === 0) {
      const changed = await this.syncFillsLight();
      this.handlers.onEvent?.({ type: "tape" });
      if (changed) this.handlers.onEvent?.({ type: "trades" });
    }
  }

  private async syncPublicTrades(pairId: PairId): Promise<void> {
    const res = await fetchPublicTrades(pairIdToApi(pairId), 500, 12_000, undefined, { window: "24h" });
    if (!res.ok) return;
    const prints: TapePrint[] = [];
    for (const t of res.trades) {
      const pid = apiPairToId(t.pair) ?? pairId;
      if (pid !== pairId) continue;
      const side: OrderSide = String(t.taker_side || "").toLowerCase() === "sell" ? "sell" : "buy";
      const price = apiPriceToDisplay(Number(t.price));
      const amountBase = minorToDisplay(Number(t.qty));
      if (!(price > 0) || !(amountBase > 0)) continue;
      const ts = t.created_at ? Date.parse(t.created_at) || Date.now() : Date.now();
      prints.push(marketTradeToPrint(pid, { id: t.id, price, amountBase, side, ts }));
    }
    this.handlers.onEvent?.({ type: "public_tape", pairId, prints });
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
          rememberLedgerHolds(bal.balances ?? []);
        }
      }
      await refreshServerVip(added > 0);
    }
    if (changed) this.opts.saveState?.();
    return changed;
  }
}
export function createMarketStream(handlers: MarketStreamHandlers, opts: MarketStreamOptions): MarketStream {
  return new MarketStream(handlers, opts);
}
