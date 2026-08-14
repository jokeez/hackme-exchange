/** Shared order/trade enum sanitizers for loadState + parseDemoImport (FE-H01). */
import type { Order, OrderKind, OrderSide, PairId, Trade } from "./types";
import { sanitizeDomId } from "./sanitize";
import { uid } from "./id";

/** Cap per-trade notional on import — blocks VIP tier farming via fake history. */
export const MAX_IMPORT_TRADE_QUOTE = 1_000_000;

const PAIR_IDS = new Set<PairId>(["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"]);
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
