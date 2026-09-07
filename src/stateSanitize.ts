/** Shared order/trade/candle sanitizers for loadState + parseDemoImport (FE-H01). */
import type { Candle, DemoState, Order, OrderKind, OrderSide, PairId, Timeframe, Trade } from "./types";
import { TIMEFRAMES } from "./types";
import { sanitizeDomId } from "./sanitize";
import { uid } from "./id";

/** Cap per-trade notional on import — blocks VIP tier farming via fake history. */
export const MAX_IMPORT_TRADE_QUOTE = 1_000_000;

/** Per-series candle cap on import/load (matches chart soft cap / candles.MAX_CANDLES). */
export const MAX_IMPORT_CANDLES_PER_SERIES = 5000;

/** Hard total across all pairs×TFs — stops nested candle bombs inside 2MB JSON. */
export const MAX_IMPORT_CANDLE_TOTAL = 12_000;

/** Max volume on a single imported bar. */
export const MAX_IMPORT_CANDLE_VOLUME = 5_000_000;

const PAIR_IDS = new Set<PairId>(["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"]);
const TF_SET = new Set<string>(TIMEFRAMES);
const ORDER_SIDES = new Set<OrderSide>(["buy", "sell"]);
const ORDER_KINDS = new Set<OrderKind>([
  "market",
  "limit",
  "stop_limit",
  "stop_market",
  "trailing_stop",
  "oco",
]);

function sanitizePairId(raw: unknown, fallback: PairId = "HMC_USDT"): PairId {
  return typeof raw === "string" && PAIR_IDS.has(raw as PairId) ? (raw as PairId) : fallback;
}

function finitePos(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** One OHLC bar — drop NaN/Infinity/negative spikes that would crash LWC. */
export function sanitizeImportedCandle(raw: unknown): Candle | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const time = typeof o.time === "number" && Number.isFinite(o.time) ? o.time : NaN;
  if (!(time > 0)) return null;
  let open = finitePos(o.open) ? o.open : NaN;
  let high = finitePos(o.high) ? o.high : NaN;
  let low = finitePos(o.low) ? o.low : NaN;
  let close = finitePos(o.close) ? o.close : NaN;
  if (!Number.isFinite(open) && Number.isFinite(close)) open = close;
  if (!Number.isFinite(close) && Number.isFinite(open)) close = open;
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
  if (!Number.isFinite(high)) high = Math.max(open, close);
  if (!Number.isFinite(low)) low = Math.min(open, close);
  // Clamp absurd magnitudes (DoS via axis range).
  const MAX_PX = 1e9;
  open = Math.min(MAX_PX, open);
  close = Math.min(MAX_PX, close);
  high = Math.min(MAX_PX, Math.max(open, close, high));
  low = Math.max(1e-12, Math.min(open, close, low));
  if (high < Math.max(open, close)) high = Math.max(open, close);
  if (low > Math.min(open, close)) low = Math.min(open, close);
  const volume =
    typeof o.volume === "number" && Number.isFinite(o.volume) && o.volume >= 0
      ? Math.min(MAX_IMPORT_CANDLE_VOLUME, o.volume)
      : 0;
  return { time, open, high, low, close, volume };
}

/**
 * Cap + heal candle maps from import / localStorage.
 * Unknown pair/TF keys dropped; series truncated; total bars hard-capped.
 */
export function sanitizeImportedCandles(raw: unknown): DemoState["candles"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: DemoState["candles"] = {};
  let total = 0;
  for (const pid of Object.keys(src)) {
    if (!PAIR_IDS.has(pid as PairId)) continue;
    if (total >= MAX_IMPORT_CANDLE_TOTAL) break;
    const byTf = src[pid];
    if (!byTf || typeof byTf !== "object" || Array.isArray(byTf)) continue;
    const next: Partial<Record<Timeframe, Candle[]>> = {};
    for (const tf of Object.keys(byTf as object)) {
      if (!TF_SET.has(tf)) continue;
      if (total >= MAX_IMPORT_CANDLE_TOTAL) break;
      const arr = Array.isArray((byTf as Record<string, unknown>)[tf])
        ? ((byTf as Record<string, unknown>)[tf] as unknown[])
        : [];
      const slice = arr.slice(-MAX_IMPORT_CANDLES_PER_SERIES);
      const clean: Candle[] = [];
      for (const item of slice) {
        if (total >= MAX_IMPORT_CANDLE_TOTAL) break;
        const c = sanitizeImportedCandle(item);
        if (!c) continue;
        clean.push(c);
        total += 1;
      }
      if (clean.length) next[tf as Timeframe] = clean;
    }
    if (Object.keys(next).length) out[pid as PairId] = next;
  }
  return out;
}

export function sanitizeImportedTrade(t: Trade): Trade {
  const amountQuote = Math.min(
    typeof t.amountQuote === "number" && Number.isFinite(t.amountQuote) ? Math.max(0, t.amountQuote) : 0,
    MAX_IMPORT_TRADE_QUOTE,
  );
  const amountBase = Math.min(
    typeof t.amountBase === "number" && Number.isFinite(t.amountBase) ? Math.max(0, t.amountBase) : 0,
    MAX_IMPORT_TRADE_QUOTE,
  );
  const ts = typeof t.ts === "number" && Number.isFinite(t.ts) ? t.ts : Date.now();
  return {
    id: sanitizeDomId(t.id, uid()),
    pairId: sanitizePairId(t.pairId),
    side: ORDER_SIDES.has(t.side) ? t.side : "buy",
    price: typeof t.price === "number" && Number.isFinite(t.price) ? Math.max(0, t.price) : 0,
    amountQuote,
    amountBase,
    ts,
    feeQuote: typeof t.feeQuote === "number" && Number.isFinite(t.feeQuote) ? Math.max(0, t.feeQuote) : 0,
    feeHmc: typeof t.feeHmc === "number" && Number.isFinite(t.feeHmc) ? Math.max(0, t.feeHmc) : 0,
    feeRole: t.feeRole === "maker" ? "maker" : "taker",
    feePaidInHmc: !!t.feePaidInHmc,
  };
}

export function sanitizeImportedOrder(o: Order): Order | null {
  const id = sanitizeDomId(o.id);
  if (!id) return null;
  const side = ORDER_SIDES.has(o.side) ? o.side : null;
  const kind = ORDER_KINDS.has(o.kind) ? o.kind : null;
  if (!side || !kind) return null;
  return {
    id,
    pairId: sanitizePairId(o.pairId),
    side,
    kind,
    price: typeof o.price === "number" && Number.isFinite(o.price) ? Math.max(0, o.price) : 0,
    amountBase:
      typeof o.amountBase === "number" && Number.isFinite(o.amountBase) ? Math.max(0, o.amountBase) : 0,
    filledBase:
      typeof o.filledBase === "number" && Number.isFinite(o.filledBase) ? Math.max(0, o.filledBase) : 0,
    status:
      o.status === "open" ||
      o.status === "triggered" ||
      o.status === "filled" ||
      o.status === "cancelled"
        ? o.status
        : "cancelled",
    source: o.source === "lab" ? "lab" : "paper",
    createdAt: typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now(),
    stopPrice: typeof o.stopPrice === "number" && Number.isFinite(o.stopPrice) ? o.stopPrice : undefined,
    trailPct: typeof o.trailPct === "number" && Number.isFinite(o.trailPct) ? o.trailPct : undefined,
    trailAnchor:
      typeof o.trailAnchor === "number" && Number.isFinite(o.trailAnchor) ? o.trailAnchor : undefined,
    timeInForce:
      o.timeInForce === "IOC" || o.timeInForce === "FOK" || o.timeInForce === "GTC" ? o.timeInForce : undefined,
    postOnly: o.postOnly ? true : undefined,
    ocoGroupId: o.ocoGroupId ? sanitizeDomId(o.ocoGroupId) || undefined : undefined,
    ocoRole: o.ocoRole === "tp" || o.ocoRole === "sl" ? o.ocoRole : undefined,
  };
}
