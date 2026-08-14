/**
 * Lab server matching bridge — place/cancel/list + sync fills/balances/book into demo state.
 * Gated by isLabApiEnabled() + session CSRF. Never flips isLiveMode().
 */

import type { BookLevel, DemoState, MarketSnapshot, Order, OrderSide, PairId, Trade } from "../types";
import { isLabApiEnabled } from "../config/integration";
import {
  apiPairToId,
  apiPriceToDisplay,
  buildPlaceOrderBody,
  cancelExchangeOrder,
  fetchExchangeBalances,
  fetchExchangeBook,
  getLabSessionMeta,
  listExchangeFills,
  listExchangeOrders,
  mergeApiBalancesIntoWallet,
  minorToDisplay,
  pairIdToApi,
  postExchangeOrder,
  postLabCounterparty,
  formatExchangeReject,
  type ApiBookLevel,
  type ApiFill,
  type ApiOrder,
  type ExchangeApiError,
} from "./exchangeApi";
import { activeVipTier } from "../fees";
import { recordTradeLedger } from "../ledger";

/** True when loopback API is opted in and fixture/session is connected. */
export function useLabMatching(): boolean {
  return isLabApiEnabled() && getLabSessionMeta().hasCsrf;
}

export type LabBookCache = {
  pairId: PairId;
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
  fingerprint: string;
};

let labBookCache: LabBookCache | null = null;

export function getLabBookCache(pairId?: PairId): LabBookCache | null {
  if (!labBookCache) return null;
  if (pairId && labBookCache.pairId !== pairId) return null;
  return labBookCache;
}

export function clearLabBookCache(): void {
  labBookCache = null;
}

/** Test-only: seed L2 cache without HTTP. */
export function seedLabBookCacheForTest(cache: LabBookCache): void {
  labBookCache = cache;
}

/** Best bid/ask mid from cached lab L2 (0 if empty). Prefer this over pool-oracle mid for lab risk. */
export function labBookMid(pairId?: PairId): number {
  const book = getLabBookCache(pairId);
  if (!book) return 0;
  const bid = book.bids[0]?.price ?? 0;
  const ask = book.asks[0]?.price ?? 0;
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  return bid > 0 ? bid : ask > 0 ? ask : 0;
}

/**
 * Market slip ceiling (buy) / floor (sell) anchored to lab book mid.
 * Pool-oracle mid can sit outside the API ±price_band of lab MM ref — that rejects market orders.
 */
export function labMarketSlipHint(
  side: OrderSide,
  pairId: PairId,
  fallbackMid: number,
  slipFrac = 0.02,
): number {
  const mid = labBookMid(pairId) || fallbackMid;
  if (!(mid > 0) || !(slipFrac >= 0)) return 0;
  return side === "buy" ? mid * (1 + slipFrac) : mid * (1 - slipFrac);
}

function apiLevelsToBook(levels: ApiBookLevel[]): BookLevel[] {
  const out: BookLevel[] = [];
  for (const l of levels) {
    const price = apiPriceToDisplay(Number(l.price));
    const amountBase = minorToDisplay(Number(l.qty));
    if (!(price > 0) || !(amountBase > 0)) continue;
    out.push({ price, amountBase, totalQuote: price * amountBase });
  }
  return out;
}

function bookFingerprint(bids: ApiBookLevel[], asks: ApiBookLevel[]): string {
  const fmt = (xs: ApiBookLevel[]) => xs.map((l) => `${l.price}:${l.qty}:${l.n ?? 0}`).join(",");
  return `${fmt(bids)}|${fmt(asks)}`;
}

/** Fetch live lab L2 for pair; updates module cache. Returns whether fingerprint changed. */
export async function refreshLabBook(pairId: PairId): Promise<{ ok: boolean; changed: boolean; note?: string }> {
  if (!isLabApiEnabled()) return { ok: false, changed: false, note: "lab API not enabled" };
  const res = await fetchExchangeBook(pairIdToApi(pairId));
  if (!res.ok) return { ok: false, changed: false, note: res.message };
  const fp = bookFingerprint(res.bids, res.asks);
  const changed = !labBookCache || labBookCache.pairId !== pairId || labBookCache.fingerprint !== fp;
  labBookCache = {
    pairId,
    bids: apiLevelsToBook(res.bids),
    asks: apiLevelsToBook(res.asks),
    ts: res.ts ? Date.parse(res.ts) || Date.now() : Date.now(),
    fingerprint: fp,
  };
  return { ok: true, changed };
}

function mapApiStatus(status: string): Order["status"] {
  const s = status.toLowerCase();
  if (s === "filled") return "filled";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "partial" || s === "open" || s === "armed" || s === "triggered") return s === "triggered" ? "triggered" : "open";
  return "open";
}

export function apiOrderToDemo(o: ApiOrder): Order | null {
  const pairId = apiPairToId(o.pair);
  if (!pairId) return null;
  const side = String(o.side).toLowerCase() === "sell" ? "sell" : "buy";
  const typ = String(o.type).toLowerCase();
  const kind: Order["kind"] =
    typ === "market"
      ? "market"
      : typ === "stop_limit" || typ === "stoplimit"
        ? "stop_limit"
        : typ === "stop_market" || typ === "stopmarket"
          ? "stop_market"
          : typ === "trailing_stop" || typ === "trailing"
            ? "trailing_stop"
            : typ === "oco"
              ? "oco"
              : "limit";
  const amountBase = minorToDisplay(o.qty);
  const remaining = minorToDisplay(o.remaining ?? o.qty);
  const filledBase = Math.max(0, amountBase - remaining);
  const stopPrice =
    typeof (o as ApiOrder & { stop_price?: number }).stop_price === "number"
      ? apiPriceToDisplay((o as ApiOrder & { stop_price?: number }).stop_price!)
      : undefined;
  const trailBps = (o as ApiOrder & { trail_bps?: number }).trail_bps;
  const ocoGroup = (o as ApiOrder & { oco_group?: string }).oco_group;
  return {
    id: o.id,
    pairId,
    side,
    kind,
    price: apiPriceToDisplay(o.price),
    stopPrice,
    trailPct: trailBps && trailBps > 0 ? trailBps / 100 : undefined,
    amountBase,
    filledBase,
    status: mapApiStatus(o.status),
    timeInForce: "GTC",
    source: "lab",
    ocoGroupId: ocoGroup,
    createdAt: o.created_at ? Date.parse(o.created_at) || Date.now() : Date.now(),
  };
}

/** Merge server open orders (incl. OCO/trailing armed). Drop local paper dupes of same id. */
export function mergeServerOpenOrders(state: DemoState, serverOrders: ApiOrder[]): void {
  const mapped = serverOrders
    .map(apiOrderToDemo)
    .filter((o): o is Order => !!o && (o.status === "open" || o.status === "triggered"));
  const serverIds = new Set(mapped.map((o) => o.id));
  const paperKeep = state.orders.filter(
    (o) =>
      (o.status === "open" || o.status === "triggered") &&
      o.source !== "lab" &&
      !serverIds.has(o.id),
  );
  const closedKeep = state.orders.filter((o) => o.status === "filled" || o.status === "cancelled").slice(0, 40);
  state.orders = [...mapped, ...paperKeep, ...closedKeep].slice(0, 80);
}

/** Map a fill to the local account's trade row (side/fee from taker vs maker). */
export function apiFillToTrade(f: ApiFill, account: string): Trade | null {
  const pairId = apiPairToId(f.pair);
  if (!pairId) return null;
  const roleHint = (f as ApiFill & { role?: string }).role;
  const isTaker =
    roleHint === "taker" || (!!f.taker_account && f.taker_account === account);
  const isMaker =
    roleHint === "maker" || (!!f.maker_account && f.maker_account === account);
  if (!isTaker && !isMaker) return null;
  const takerSide = String(f.taker_side || "buy").toLowerCase() === "sell" ? "sell" : "buy";
  let side: OrderSide = takerSide;
  if (isMaker) side = takerSide === "buy" ? "sell" : "buy";
  const feeQuote = isTaker ? Number(f.taker_fee_quote ?? 0) : Number(f.maker_fee_quote ?? 0);
  const feeHmcMinor = isTaker ? Number(f.taker_fee_hmc ?? 0) : Number(f.maker_fee_hmc ?? 0);
  const feePaidInHmc = feeHmcMinor > 0;
  return {
    id: f.id,
    pairId,
    side,
    price: apiPriceToDisplay(f.price),
    amountBase: minorToDisplay(f.qty),
    amountQuote: minorToDisplay(f.quote),
    feeQuote: minorToDisplay(feeQuote),
    feeHmc: minorToDisplay(feeHmcMinor),
    feeRole: isTaker ? "taker" : "maker",
    feePaidInHmc,
    ts: f.created_at ? Date.parse(f.created_at) || Date.now() : Date.now(),
  };
}

/** Upsert fills into trade history (newest first). Optionally mirror into Account ledger. */
export function mergeServerFills(
  state: DemoState,
  fills: ApiFill[],
  account: string,
  market?: MarketSnapshot | null,
): number {
  const existing = new Set(state.trades.map((t) => t.id));
  let added = 0;
  const mapped: Trade[] = [];
  for (const f of fills) {
    const t = apiFillToTrade(f, account);
    if (!t || existing.has(t.id)) continue;
    mapped.push(t);
    added++;
  }
  if (mapped.length) {
    state.trades = [...mapped, ...state.trades].slice(0, 200);
    if (market) {
      const vip = activeVipTier(state, market);
      for (const t of mapped) {
        const marker = `lab:${t.id}`;
        if (state.ledger.some((e) => e.note?.includes(marker))) continue;
        recordTradeLedger(
          state,
          market,
          t.pairId,
          t.side,
          t.amountBase,
          t.amountQuote,
          {
            role: t.feeRole,
            bps: t.feeRole === "maker" ? vip.makerBps : vip.takerBps,
            feeQuote: t.feeQuote,
            feeHmc: t.feeHmc,
            paidInHmc: t.feePaidInHmc,
            vipName: vip.name,
            hmcDiscountPct: t.feePaidInHmc ? state.feeConfig.hmcDiscountPct : 0,
          },
          t.feeRole === "maker" ? "limit" : "market",
          t.id,
        );
      }
    }
  }
  return added;
}

export type LabPlaceResult =
  | { ok: true; order: Order; fillCount: number; note: string }
  | { ok: false; reason: string };

export async function placeLabOrder(
  state: DemoState,
  pairId: PairId,
  side: OrderSide,
  type: "limit" | "market" | "stop_limit" | "stop_market" | "oco" | "trailing_stop",
  amountBase: number,
  priceDisplay?: number,
  stopDisplay?: number,
  opts?: {
    stopLimitDisplay?: number;
    trailPct?: number;
    market?: MarketSnapshot | null;
    postOnly?: boolean;
    timeInForce?: "GTC" | "IOC" | "FOK";
    /** Only send pay_fee_in_hmc when health advertises support. */
    payFeeInHmc?: boolean;
  },
): Promise<LabPlaceResult> {
  if (!useLabMatching()) {
    return { ok: false, reason: "Lab matching requires Connect DEMO/LAB fixture" };
  }
  const { market: marketSnap, payFeeInHmc, postOnly, timeInForce, ...placeOpts } = opts ?? {};
  const body = buildPlaceOrderBody(pairId, side, type, amountBase, priceDisplay, stopDisplay, {
    ...placeOpts,
    payFeeInHmc: !!payFeeInHmc,
    postOnly,
    timeInForce,
  });
  if ("error" in body) return { ok: false, reason: body.error };

  const res = await postExchangeOrder(body);
  if (!res.ok) {
    return { ok: false, reason: formatExchangeReject(res) };
  }

  const demoOrder = apiOrderToDemo(res.order);
  const account = getLabSessionMeta().address;
  const fillCount = mergeServerFills(state, res.fills, account, marketSnap ?? null);
  await syncLabBalancesAndBook(state, marketSnap ?? null);
  const cancelledEmpty = type === "market" && fillCount === 0 && demoOrder?.status === "cancelled";
  const note =
    type === "stop_limit" || type === "stop_market" || type === "trailing_stop" || type === "oco"
      ? `Lab ${type} armed · synced`
      : fillCount > 0
        ? `Lab ${type} · ${fillCount} fill(s) · synced balances`
        : cancelledEmpty
          ? `Lab market cancelled · no fill within slip / book`
          : `Lab ${type} ${demoOrder?.status ?? "accepted"} · open on server book`;
  return {
    ok: true,
    order: demoOrder ?? {
      id: res.order.id,
      pairId,
      side,
      kind:
        type === "market"
          ? "market"
          : type === "oco"
            ? "oco"
            : type === "trailing_stop"
              ? "trailing_stop"
              : type === "stop_limit"
                ? "stop_limit"
                : type === "stop_market"
                  ? "stop_market"
                  : "limit",
      price: priceDisplay ?? 0,
      stopPrice: stopDisplay,
      amountBase,
      filledBase: 0,
      status: "open",
      createdAt: Date.now(),
    },
    fillCount,
    note,
  };
}

export async function cancelLabOrder(
  state: DemoState,
  orderId: string,
): Promise<{ ok: true; note: string } | { ok: false; reason: string }> {
  if (!useLabMatching()) return { ok: false, reason: "Lab session required" };
  const res = await cancelExchangeOrder(orderId);
  if (!res.ok) {
    // Fall back: may be a local paper order id
    return { ok: false, reason: res.message };
  }
  await syncLabBalancesAndBook(state);
  return { ok: true, note: "Lab order cancelled · balances synced" };
}

/**
 * DEMO/LAB fill helper — bot places opposite side via second fixture wallet (server-side).
 * Self-trade still blocked. Label clearly in UI.
 */
export async function runLabCounterpartyCross(
  state: DemoState,
  pairId: PairId,
  orderId?: string,
  market?: MarketSnapshot | null,
): Promise<{ ok: true; note: string; fillCount: number } | { ok: false; reason: string }> {
  if (!useLabMatching()) return { ok: false, reason: "Lab session required — Connect DEMO/LAB fixture" };
  const body: { pair: string; order_id?: string } = { pair: pairIdToApi(pairId) };
  if (orderId) body.order_id = orderId;
  const res = await postLabCounterparty(body);
  if (!res.ok) return { ok: false, reason: res.message };
  const account = getLabSessionMeta().address;
  const fillCount = mergeServerFills(state, res.fills, account, market ?? null);
  await syncLabBalancesAndBook(state, market ?? null);
  return {
    ok: true,
    fillCount,
    note: `DEMO/LAB bot crossed · ${fillCount} fill(s) · bot ${res.bot_address.slice(0, 14)}…`,
  };
}

export async function syncLabBalancesAndBook(
  state: DemoState,
  market?: MarketSnapshot | null,
): Promise<{ ok: true; note: string } | ExchangeApiError> {
  if (!isLabApiEnabled()) {
    return { ok: false, status: 0, code: "disabled", message: "lab API not enabled" };
  }
  const bal = await fetchExchangeBalances();
  if (!bal.ok) return bal;
  state.wallet = mergeApiBalancesIntoWallet(state.wallet, bal.balances ?? [], { labAuthoritative: true });

  const orders = await listExchangeOrders();
  if (orders.ok) mergeServerOpenOrders(state, orders.orders);

  const fills = await listExchangeFills(50);
  let added = 0;
  if (fills.ok) added = mergeServerFills(state, fills.fills, bal.address, market ?? null);

  await refreshLabBook(state.activePair);

  const openN = orders.ok ? orders.orders.length : 0;
  const book = getLabBookCache(state.activePair);
  const depth = book ? book.bids.length + book.asks.length : 0;
  return {
    ok: true,
    note: `Lab sync · ${bal.address.slice(0, 14)}… · ${openN} open · +${added} fill(s) · book ${depth} lvl`,
  };
}
