/**
 * Lab server matching bridge — place/cancel/list + sync fills/balances/book into demo state.
 * Gated by isLabApiEnabled() + session CSRF. Never flips isLiveMode().
 */

import type { BookLevel, DemoState, MarketSnapshot, Order, OrderSide, PairId, Trade } from "../types";
import { isDeskConnectEnabled, isExchangeApiWired, isLabLoopbackApi } from "../config/integration";
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
import { cancelOrder } from "../store";
import { isDeskMatchingLive } from "../settingsModal";

/**
 * True when loopback lab matching client is live (CSRF session).
 * Public desk Connect must NOT flip this — Spot stays paper while matching HOLD.
 */
export function useLabMatching(): boolean {
  return isLabLoopbackApi() && getLabSessionMeta().hasCsrf;
}

/** Raw `/health.matching` from last desk/lab health poll (`ok` | `disabled` | …).
 * `null` = not polled yet — desk builds should not paint a paper ladder before first health. */
let deskMatchingRaw: string | null = null;

/** Feed from health poll — do not pass UI labels like "HOLD".
 * Pass `null` to reset to pre-health pending (tests / cold-start). */
export function setDeskMatchingStatus(raw: string | undefined | null): void {
  if (raw === null) {
    deskMatchingRaw = null;
    return;
  }
  const v = (raw ?? "").trim().toLowerCase();
  deskMatchingRaw = v || "disabled";
}

export function getDeskMatchingStatus(): string {
  return deskMatchingRaw ?? "disabled";
}

/** True until the first /health matching field arrives. */
export function isDeskMatchingStatusPending(): boolean {
  return deskMatchingRaw === null;
}

/**
 * Public desk live matching — only when health says `ok` + Connect CSRF.
 * Stays false on HOLD so Spot remains paper until Matching GO.
 */
export function useDeskMatching(): boolean {
  return (
    isDeskConnectEnabled() &&
    isDeskMatchingLive(deskMatchingRaw ?? "") &&
    getLabSessionMeta().hasCsrf
  );
}

/**
 * Public L2 book is available without a session when health advertises matching ok.
 * Chart/book use this; placing orders still requires useDeskMatching().
 * Before the first health poll, stay optimistic so cold load never flashes a demo ladder.
 */
export function usePublicDeskBook(): boolean {
  if (!isDeskConnectEnabled()) return false;
  if (deskMatchingRaw === null) return true;
  return isDeskMatchingLive(deskMatchingRaw);
}

/** Lab loopback OR desk live matching (post Matching GO). */
export function useServerMatching(): boolean {
  return useLabMatching() || useDeskMatching();
}

/** Any live L2 source (session matching or public desk book). */
export function useLiveBook(): boolean {
  return useServerMatching() || usePublicDeskBook();
}

/** FE-M02: address remembered after reload but CSRF gone — freeze paper matching. */
export function isLabSessionStale(): boolean {
  if (!isLabLoopbackApi()) return false;
  const m = getLabSessionMeta();
  return !!m.address && !m.hasCsrf;
}

export type LabBookCache = {
  pairId: PairId;
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
  fingerprint: string;
};

/** Per-pair L2 — public desk book is available without Connect; keep each pair warm. */
const labBookByPair = new Map<PairId, LabBookCache>();

export function getLabBookCache(pairId?: PairId): LabBookCache | null {
  if (pairId) return labBookByPair.get(pairId) ?? null;
  // Legacy: most recently written pair (tests / callers without pair).
  let latest: LabBookCache | null = null;
  for (const c of labBookByPair.values()) {
    if (!latest || c.ts >= latest.ts) latest = c;
  }
  return latest;
}

export function clearLabBookCache(): void {
  labBookByPair.clear();
}

/** Test-only: seed L2 cache without HTTP. */
export function seedLabBookCacheForTest(cache: LabBookCache): void {
  labBookByPair.set(cache.pairId, cache);
}

/** Best bid/ask mid from cached lab L2 (0 if empty). Prefer this over pool-oracle mid for lab risk. */
export function labBookMid(pairId?: PairId): number {
  const book = getLabBookCache(pairId);
  if (!book) return 0;
  const bid = book.bids[0]?.price ?? 0;
  const ask = book.asks[0]?.price ?? 0;
  // Require both sides — one-sided BBO during Soft-MM refresh jumps tip ±spread and paints spike forests.
  if (!(bid > 0) || !(ask > 0)) return 0;
  if (ask < bid) return 0;
  return (bid + ask) / 2;
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

function sortBookLevels(levels: BookLevel[], side: "bids" | "asks"): BookLevel[] {
  return [...levels].sort((a, b) => side === "bids" ? b.price - a.price : a.price - b.price);
}

function bookFingerprint(bids: ApiBookLevel[], asks: ApiBookLevel[]): string {
  const fmt = (xs: ApiBookLevel[]) => xs.map((l) => `${l.price}:${l.qty}:${l.n ?? 0}`).join(",");
  return `${fmt(bids)}|${fmt(asks)}`;
}

/** Fetch live lab L2 for pair; updates module cache. Returns whether fingerprint changed. */
export async function refreshLabBook(pairId: PairId): Promise<{ ok: boolean; changed: boolean; note?: string }> {
  if (!isExchangeApiWired()) return { ok: false, changed: false, note: "lab API not enabled" };
  const res = await fetchExchangeBook(pairIdToApi(pairId));
  if (!res.ok) return { ok: false, changed: false, note: res.message };
  const bids = sortBookLevels(apiLevelsToBook(res.bids), "bids");
  const asks = sortBookLevels(apiLevelsToBook(res.asks), "asks");
  // Keep last good ladder on empty/partial Soft-MM blinks — empty wipe flash looks like "demo book".
  if (!bids.length && !asks.length) {
    const prev = labBookByPair.get(pairId);
    if (prev && (prev.bids.length || prev.asks.length)) {
      return { ok: true, changed: false, note: "kept prior book (empty poll)" };
    }
  }
  const fp = bookFingerprint(res.bids, res.asks);
  const prev = labBookByPair.get(pairId);
  const changed = !prev || prev.fingerprint !== fp;
  labBookByPair.set(pairId, {
    pairId,
    bids,
    asks,
    ts: res.ts ? Date.parse(res.ts) || Date.now() : Date.now(),
    fingerprint: fp,
  });
  return { ok: true, changed };
}

/** Warm public L2 for soft-MM pairs (no session required). */
export async function refreshLabBooks(pairIds: PairId[]): Promise<void> {
  await Promise.all(pairIds.map((id) => refreshLabBook(id)));
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
  if (!useServerMatching()) {
    return {
      ok: false,
      reason: isDeskConnectEnabled()
        ? "Public matching HOLD — Connect does not enable live book yet"
        : "Lab matching requires Connect DEMO/LAB fixture",
    };
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
): Promise<{ ok: true; note: string; syncPending?: boolean } | { ok: false; reason: string }> {
  if (!useServerMatching()) {
    return {
      ok: false,
      reason: isDeskConnectEnabled()
        ? "Public matching HOLD — cannot cancel server orders"
        : "Lab session required",
    };
  }
  // Short timeout — cancel UI must never wait on a hung DELETE.
  const res = await cancelExchangeOrder(orderId, 4_000);
  if (!res.ok) {
    // Fall back: may be a local paper order id
    return { ok: false, reason: res.message };
  }
  // Mark local row cancelled immediately (incl. OCO siblings). Full ledger sync is
  // slow and used to freeze the Cancel button for many seconds — run it in background.
  cancelOrder(state, orderId);
  return { ok: true, note: "Lab order cancelled", syncPending: true };
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
  if (!isExchangeApiWired()) {
    return { ok: false, status: 0, code: "disabled", message: "lab API not enabled" };
  }
  const bal = await fetchExchangeBalances();
  if (!bal.ok) return bal;
  // HOLD desk: never treat empty ledger as authoritative — keeps paper Spot funds.
  const authoritative = useServerMatching();
  state.wallet = mergeApiBalancesIntoWallet(state.wallet, bal.balances ?? [], {
    labAuthoritative: authoritative,
  });

  // Public desk HOLD: balances probe only — skip order/fill that hammers 503.
  // Still refresh public L2 when matching edge is GO (no CSRF required for /book).
  if (!useServerMatching()) {
    let bookNote = "";
    if (usePublicDeskBook()) {
      const bookRes = await refreshLabBook(state.activePair);
      const book = getLabBookCache(state.activePair);
      const depth = book ? book.bids.length + book.asks.length : 0;
      bookNote = bookRes.ok ? ` · live book ${depth} lvl` : "";
    }
    const holdNote = isDeskConnectEnabled()
      ? usePublicDeskBook()
        ? `Desk sync · ${bal.address.slice(0, 14)}… · matching live · Connect to trade${bookNote}`
        : `Desk sync · ${bal.address.slice(0, 14)}… · matching HOLD · paper Spot kept`
      : `API sync · ${bal.address.slice(0, 14)}… · matching off`;
    return { ok: true, note: holdNote };
  }

  const orders = await listExchangeOrders();
  if (orders.ok) mergeServerOpenOrders(state, orders.orders);

  const fills = await listExchangeFills(50);
  let added = 0;
  if (fills.ok) added = mergeServerFills(state, fills.fills, bal.address, market ?? null);

  await refreshLabBook(state.activePair);

  const openN = orders.ok ? orders.orders.length : 0;
  const book = getLabBookCache(state.activePair);
  const depth = book ? book.bids.length + book.asks.length : 0;
  const lane = useDeskMatching() ? "Desk" : "Lab";
  return {
    ok: true,
    note: `${lane} sync · ${bal.address.slice(0, 14)}… · ${openN} open · +${added} fill(s) · book ${depth} lvl`,
  };
}

/** Light sync — open orders + recent fills + book; refreshes balances when fills land. */
export async function syncLabOrdersFillsLight(
  state: DemoState,
  market?: MarketSnapshot | null,
): Promise<
  | { ok: true; note: string; changed: boolean; bookChanged: boolean }
  | ExchangeApiError
> {
  if (!isExchangeApiWired()) {
    return { ok: false, status: 0, code: "disabled", message: "lab API not enabled" };
  }
  if (!useServerMatching()) {
    if (usePublicDeskBook()) {
      const bookRes = await refreshLabBook(state.activePair);
      return {
        ok: true,
        note: bookRes.ok ? "desk public book" : "desk book refresh failed",
        changed: false,
        bookChanged: !!bookRes.changed,
      };
    }
    return {
      ok: true,
      note: isDeskConnectEnabled() ? "desk HOLD — skip matching stream" : "matching off — skip stream",
      changed: false,
      bookChanged: false,
    };
  }
  const account = getLabSessionMeta().address;
  const ordersBefore = state.orders.filter((o) => o.status === "open" || o.status === "triggered").length;
  const tradesBefore = state.trades.length;

  const orders = await listExchangeOrders();
  if (orders.ok) mergeServerOpenOrders(state, orders.orders);

  const fills = await listExchangeFills(30);
  let added = 0;
  if (fills.ok) added = mergeServerFills(state, fills.fills, account, market ?? null);

  // Always refresh balances — deposit credits (node-watch) land without fills.
  const prevWallet = { ...state.wallet };
  const bal = await fetchExchangeBalances();
  let balChanged = false;
  if (bal.ok) {
    state.wallet = mergeApiBalancesIntoWallet(state.wallet, bal.balances ?? [], { labAuthoritative: true });
    balChanged =
      prevWallet.usdt !== state.wallet.usdt ||
      prevWallet.hmc !== state.wallet.hmc ||
      prevWallet.sup !== state.wallet.sup ||
      prevWallet.btc !== state.wallet.btc;
  }

  const bookRes = await refreshLabBook(state.activePair);
  const ordersAfter = state.orders.filter((o) => o.status === "open" || o.status === "triggered").length;
  const changed =
    ordersAfter !== ordersBefore || state.trades.length !== tradesBefore || added > 0 || balChanged;
  return {
    ok: true,
    note: balChanged
      ? `Desk ledger · balances updated · ${ordersAfter} open · +${added} fill(s)`
      : `Lab stream · ${ordersAfter} open · +${added} fill(s)`,
    changed,
    bookChanged: bookRes.changed,
  };
}
