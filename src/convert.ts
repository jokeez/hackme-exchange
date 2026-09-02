/** Convert desk helpers — routes, flip, asset labels for swap UX. */
import type { DemoState, MarketSnapshot, Wallet } from "./types";
import { midForPair } from "./market";
import type { PairId } from "./types";
import { applyFeeToWallet, calcFee, formatBps, type FeeQuote } from "./fees";

export type ConvertRoute =
  | "HMC_USDT"
  | "USDT_HMC"
  | "SUP_USDT"
  | "USDT_SUP"
  | "HMC_SUP"
  | "SUP_HMC"
  | "HMC_BTC"
  | "BTC_HMC"
  | "SUP_BTC"
  | "BTC_SUP";

export type RouteDef = { from: keyof Wallet; to: keyof Wallet; pair: PairId; invert: boolean };

const ROUTES: Record<ConvertRoute, RouteDef> = {
  HMC_USDT: { from: "hmc", to: "usdt", pair: "HMC_USDT", invert: false },
  USDT_HMC: { from: "usdt", to: "hmc", pair: "HMC_USDT", invert: true },
  SUP_USDT: { from: "sup", to: "usdt", pair: "SUP_USDT", invert: false },
  USDT_SUP: { from: "usdt", to: "sup", pair: "SUP_USDT", invert: true },
  HMC_SUP: { from: "hmc", to: "sup", pair: "HMC_SUP", invert: false },
  SUP_HMC: { from: "sup", to: "hmc", pair: "HMC_SUP", invert: true },
  HMC_BTC: { from: "hmc", to: "btc", pair: "HMC_BTC", invert: false },
  BTC_HMC: { from: "btc", to: "hmc", pair: "HMC_BTC", invert: true },
  SUP_BTC: { from: "sup", to: "btc", pair: "SUP_BTC", invert: false },
  BTC_SUP: { from: "btc", to: "sup", pair: "SUP_BTC", invert: true },
};

export const CONVERT_ASSETS: { key: keyof Wallet; symbol: string; name: string }[] = [
  { key: "hmc", symbol: "HMC", name: "HackMe Coin" },
  { key: "sup", symbol: "SUP", name: "Superior Companion" },
  { key: "usdt", symbol: "USDT", name: "Tether USD" },
  { key: "btc", symbol: "BTC", name: "Bitcoin" },
];

export function convertRouteDef(route: ConvertRoute): RouteDef | null {
  return ROUTES[route] ?? null;
}

export function routeForAssets(from: keyof Wallet, to: keyof Wallet): ConvertRoute | null {
  for (const [id, r] of Object.entries(ROUTES) as [ConvertRoute, RouteDef][]) {
    if (r.from === from && r.to === to) return id;
  }
  return null;
}

export function flipRoute(route: ConvertRoute): ConvertRoute | null {
  const r = ROUTES[route];
  if (!r) return null;
  return routeForAssets(r.to, r.from);
}

export function assetSymbol(key: keyof Wallet): string {
  return CONVERT_ASSETS.find((a) => a.key === key)?.symbol ?? String(key).toUpperCase();
}

/**
 * Rate line for Convert desk.
 * `mid` is always quote-per-base for the pair (same as oracle / ConvertMid).
 * Invert routes (quote→base) still show `1 FROM ≈ (1/mid) TO` — never swap legs.
 */
export function convertRateLabel(
  fromSym: string,
  toSym: string,
  mid: number,
  invert: boolean,
  format: (n: number) => string,
): string {
  if (!(mid > 0) || !Number.isFinite(mid)) return "—";
  if (invert) {
    const inv = 1 / mid;
    if (!(inv > 0) || !Number.isFinite(inv)) return "—";
    return `1 ${fromSym} ≈ ${format(inv)} ${toSym}`;
  }
  return `1 ${fromSym} ≈ ${format(mid)} ${toSym}`;
}

/** Pair quote asset symbol for fee lines (never literal "quote"). */
export function pairQuoteSym(pair: PairId | string): string {
  const id = String(pair).toUpperCase();
  if (id.endsWith("_USDT") || id.endsWith("/USDT")) return "USDT";
  if (id.endsWith("_BTC") || id.endsWith("/BTC")) return "BTC";
  if (id.endsWith("_SUP") || id.endsWith("/SUP")) return "SUP";
  if (id.endsWith("_HMC") || id.endsWith("/HMC")) return "HMC";
  return "USDT";
}

/** Lab-friendly default size when a route chip is picked (avoids silent min_notional / qty max). */
export function convertChipDefaultAmount(route: ConvertRoute): string | null {
  switch (route) {
    case "HMC_BTC":
      return "2000"; // soft mid ~5e-6 BTC/HMC × min notional ~0.01 BTC
    case "HMC_SUP":
      return "50";
    case "BTC_HMC":
    case "BTC_SUP":
      return "0.001";
    case "SUP_BTC":
      return "500";
    case "SUP_USDT":
    case "SUP_HMC":
      return "100";
    case "USDT_SUP":
    case "USDT_HMC":
      return "1";
    case "HMC_USDT":
      return "100";
    default:
      return null;
  }
}

/** Quote notional for convert fee (spot taker parity — quote asset of the pair). */
export function convertQuoteNotional(amountFrom: number, got: number, invert: boolean): number {
  return invert ? amountFrom : got;
}

export type ConvertPreview = {
  route: ConvertRoute;
  from: keyof Wallet;
  to: keyof Wallet;
  pair: PairId;
  amountFrom: number;
  got: number;
  quoteNotional: number;
  fee: FeeQuote;
  feeLabel: string;
  mid: number;
};

/**
 * Non-mutating convert preview at oracle mid + VIP taker fee
 * (same schedule as spot; optional HMC fee-pay discount).
 */
export function previewConvert(
  state: DemoState,
  market: MarketSnapshot,
  route: ConvertRoute,
  amountFrom: number,
): ConvertPreview | { ok: false; reason: string } {
  if (!Number.isFinite(amountFrom) || amountFrom <= 0) return { ok: false, reason: "Amount must be > 0" };
  const r = ROUTES[route];
  if (!r) return { ok: false, reason: "Unknown route" };
  const mid = midForPair(market, r.pair);
  if (!(mid > 0)) return { ok: false, reason: "No mid" };
  const got = r.invert ? amountFrom / mid : amountFrom * mid;
  if (!Number.isFinite(got) || got <= 0) return { ok: false, reason: "Invalid rate" };
  const quoteNotional = convertQuoteNotional(amountFrom, got, r.invert);
  const fee = calcFee(state, market, r.pair, quoteNotional, "taker");
  return {
    route,
    from: r.from,
    to: r.to,
    pair: r.pair,
    amountFrom,
    got,
    quoteNotional,
    fee,
    feeLabel: `Taker ${formatBps(fee.bps)} · ${fee.vipName}`,
    mid,
  };
}

/** Net receive after quote-side taker fee (USDT/BTC/SUP legs); HMC-fee routes credit gross. */
export function convertNetReceive(preview: Pick<ConvertPreview, "got" | "fee" | "to" | "pair">): number {
  const { got, fee, to, pair } = preview;
  if (fee.paidInHmc) return got;
  if (to === "usdt") return Math.max(0, got - fee.feeQuote);
  if (pair.endsWith("_BTC") && to === "btc") return Math.max(0, got - fee.feeQuote);
  if (pair.endsWith("_SUP") && to === "sup") return Math.max(0, got - fee.feeQuote);
  return got;
}

export function convert(
  state: DemoState,
  market: MarketSnapshot,
  route: ConvertRoute,
  amountFrom: number,
): { ok: true; got: number; fee: FeeQuote } | { ok: false; reason: string } {
  const prev = previewConvert(state, market, route, amountFrom);
  if ("ok" in prev && prev.ok === false) return prev;
  const p = prev as ConvertPreview;
  if (state.wallet[p.from] < amountFrom) {
    return { ok: false, reason: "Insufficient balance" };
  }
  // Pre-check fee so we don't leave a half-applied convert.
  if (p.fee.paidInHmc) {
    const need = p.fee.feeHmc + (p.from === "hmc" ? amountFrom : 0);
    if (state.wallet.hmc < need) {
      return { ok: false, reason: "Insufficient HMC for fee" };
    }
  }
  state.wallet[p.from] -= amountFrom;
  state.wallet[p.to] += p.got;
  const feeRes = applyFeeToWallet(state, p.pair, p.fee);
  if (!feeRes.ok) {
    state.wallet[p.from] += amountFrom;
    state.wallet[p.to] -= p.got;
    return feeRes;
  }
  return { ok: true, got: p.got, fee: p.fee };
}

export const CONVERT_ROUTES: { id: ConvertRoute; label: string; desc: string }[] = [
  { id: "HMC_USDT", label: "HMC → USDT", desc: "Sell mined HMC to stables (demo)" },
  { id: "USDT_HMC", label: "USDT → HMC", desc: "Buy HMC at oracle mid" },
  { id: "SUP_USDT", label: "SUP → USDT", desc: "Companion utility → stables" },
  { id: "USDT_SUP", label: "USDT → SUP", desc: "Accumulate SUP from stables" },
  { id: "HMC_SUP", label: "HMC → SUP", desc: "Ecosystem cross — no external CEX" },
  { id: "SUP_HMC", label: "SUP → HMC", desc: "Rotate companion → mine coin" },
  { id: "HMC_BTC", label: "HMC → BTC", desc: "Bridge lane → BTC (demo ref)" },
  { id: "BTC_HMC", label: "BTC → HMC", desc: "Enter HMC from BTC bridge" },
  { id: "SUP_BTC", label: "SUP → BTC", desc: "Companion → BTC bridge" },
  { id: "BTC_SUP", label: "BTC → SUP", desc: "Enter SUP from BTC" },
];

/** Short fee line for Convert cards (bps + optional HMC + estimated charge). */
export function convertFeeHintLine(preview: ConvertPreview): string {
  const fee = preview.fee;
  if (!(fee.feeQuote > 0) && !(fee.feeHmc > 0)) {
    return `Taker ${formatBps(fee.bps)} · ${fee.vipName}`;
  }
  if (fee.paidInHmc) {
    return `${preview.feeLabel} · est ${formatFeeAmt(fee.feeHmc)} HMC`;
  }
  const quoteSym = preview.pair.endsWith("_USDT")
    ? "USDT"
    : preview.pair.endsWith("_BTC")
      ? "BTC"
      : preview.pair.endsWith("_SUP")
        ? "SUP"
        : "quote";
  return `${preview.feeLabel} · est ${formatFeeAmt(fee.feeQuote)} ${quoteSym}`;
}

/**
 * Map lab `POST /convert` fee fields (minor units) into a FeeQuote for local ledger.
 * When `paid_in_hmc`, server returns fee_quote=0 — rebuild quote USDT value from HMC × mid.
 */
export function feeQuoteFromLabConvert(
  api: {
    fee_quote?: number;
    fee_hmc?: number;
    fee_bps?: number;
    paid_in_hmc?: boolean;
  },
  opts: {
    feeQuoteDisplay: number;
    feeHmcDisplay: number;
    hmcUsdt: number;
    vipName: string;
    hmcDiscountPct: number;
    fallbackTakerBps: number;
  },
): FeeQuote | null {
  const paidInHmc = !!api.paid_in_hmc && opts.feeHmcDisplay > 0;
  const feeHmc = paidInHmc ? opts.feeHmcDisplay : 0;
  const feeQuote = paidInHmc
    ? opts.hmcUsdt > 0
      ? feeHmc * opts.hmcUsdt
      : 0
    : opts.feeQuoteDisplay;
  if (!(feeQuote > 0) && !(feeHmc > 0)) return null;
  return {
    role: "taker",
    bps: typeof api.fee_bps === "number" && api.fee_bps > 0 ? api.fee_bps : opts.fallbackTakerBps,
    feeQuote: feeQuote > 0 ? feeQuote : feeHmc * (opts.hmcUsdt || 0),
    feeHmc,
    paidInHmc,
    vipName: opts.vipName,
    hmcDiscountPct: paidInHmc ? opts.hmcDiscountPct : 0,
  };
}

/** Toast suffix for paper/lab convert — quote asset or HMC. */
export function formatConvertFeeToast(fee: FeeQuote, pair: PairId): string {
  if (!(fee.feeQuote > 0) && !(fee.feeHmc > 0)) return "";
  if (fee.paidInHmc) return ` · fee ${formatFeeAmt(fee.feeHmc)} HMC`;
  return ` · fee ${formatFeeAmt(fee.feeQuote)} ${pairQuoteSym(pair)}`;
}

/** Toast suffix for lab convert — quote fee or HMC fee (never silent when fee charged). */
export function formatLabConvertFeeToast(
  api: {
    fee_quote?: number;
    fee_hmc?: number;
    paid_in_hmc?: boolean;
    feeQuoteDisplay?: number;
    feeHmcDisplay?: number;
  },
  quoteAsset = "USDT",
): string {
  const fq = api.feeQuoteDisplay ?? 0;
  const fh = api.feeHmcDisplay ?? 0;
  if (api.paid_in_hmc && fh > 0) {
    return ` · fee ${formatFeeAmt(fh)} HMC`;
  }
  if (fq > 0) {
    return ` · fee ${formatFeeAmt(fq)} ${quoteAsset}`;
  }
  return "";
}

function formatFeeAmt(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return "0";
  if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, "");
  if (n >= 0.0001) return n.toFixed(6).replace(/\.?0+$/, "");
  return n.toFixed(10).replace(/\.?0+$/, "");
}
