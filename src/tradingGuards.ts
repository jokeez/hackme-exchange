/**
 * Lab soft-public trading guards (min notional + soft price band).
 * Paper defaults: 1 whole quote · ±15% band.
 * Soft MM API default: 1e6 minor (0.01 quote); legacy API: 1e8 (1 whole).
 * Health/API overrides when present — never invent an MM-seeded badge.
 */

import { MINOR_UNIT_SCALE, type HealthResponse } from "./adapters/exchangeApi";
export { formatExchangeReject as formatOrderReject } from "./adapters/exchangeApi";

/** Display-unit min notional (1 whole quote ≈ 1 USDT). */
export const DEFAULT_MIN_NOTIONAL_QUOTE = 1;

/** Soft band around mid/ref (±15%). */
export const DEFAULT_PRICE_BAND_BPS = 1500;

export type TradingGuards = {
  minNotionalQuote: number;
  priceBandBps: number;
  /** True only when health/API explicitly reports lab MM seed active. */
  labMmSeeded: boolean;
  /** Raw health flag for lab MM enabled (optional). */
  labMmEnabled: boolean;
  /** Server convert charges taker (prefer POST /convert when session). */
  convertFeeServer: boolean;
  /** Server accepts pay_fee_in_hmc on orders/convert. */
  hmcFeePayServer: boolean;
  /** Optional server HMC discount pct (default 25 when pay enabled). */
  hmcDiscountPctServer: number | null;
};

export const DEFAULT_TRADING_GUARDS: TradingGuards = {
  minNotionalQuote: DEFAULT_MIN_NOTIONAL_QUOTE,
  priceBandBps: DEFAULT_PRICE_BAND_BPS,
  labMmSeeded: false,
  labMmEnabled: false,
  convertFeeServer: false,
  hmcFeePayServer: false,
  hmcDiscountPctServer: null,
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function truthy(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "on" || s === "yes" || s === "seeded";
  }
  return false;
}

/**
 * Feature / capability flag: accepts bool/1, classic truthy strings, or non-empty
 * hint strings (e.g. fees.pay_fee_in_hmc: "POST /orders…", convert_fee: "taker").
 */
function featureOn(v: unknown): boolean {
  if (truthy(v)) return true;
  if (typeof v === "number" && Number.isFinite(v) && v !== 0) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s || s === "0" || s === "false" || s === "off" || s === "no" || s === "disabled") {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Pull optional guard fields from /health without inventing MM state.
 * Accepts flat or nested shapes the API may expose.
 */
export function parseHealthTradingGuards(health: HealthResponse | Record<string, unknown> | null | undefined): TradingGuards {
  const out: TradingGuards = { ...DEFAULT_TRADING_GUARDS };
  if (!health || typeof health !== "object") return out;
  const h = health as Record<string, unknown>;
  const trading =
    h.trading && typeof h.trading === "object" ? (h.trading as Record<string, unknown>) : null;
  const risk = h.risk && typeof h.risk === "object" ? (h.risk as Record<string, unknown>) : null;
  const labMmObj =
    h.lab_mm && typeof h.lab_mm === "object" ? (h.lab_mm as Record<string, unknown>) : null;

  const minMinor =
    num(trading?.min_notional) ??
    num(risk?.min_notional) ??
    num(h.min_notional) ??
    num(h.min_notional_quote_minor);
  if (minMinor !== undefined && minMinor >= 0) {
    out.minNotionalQuote = minMinor / MINOR_UNIT_SCALE;
  }
  const minDisplay = num(trading?.min_notional_quote) ?? num(h.min_notional_quote);
  if (minDisplay !== undefined && minDisplay >= 0) {
    out.minNotionalQuote = minDisplay;
  }

  const band =
    num(trading?.price_band_bps) ??
    num(risk?.price_band_bps) ??
    num(risk?.band_bps) ??
    num(h.price_band_bps) ??
    num(h.band_bps);
  if (band !== undefined && band >= 0) {
    out.priceBandBps = Math.floor(band);
  }

  // MM seeded: only when an explicit flag is present (never invent when absent).
  if (labMmObj) {
    out.labMmEnabled = truthy(labMmObj.enabled ?? labMmObj.on ?? labMmObj.active);
    const explicitSeeded = labMmObj.seeded ?? labMmObj.mm_seeded ?? labMmObj.seed;
    if (explicitSeeded !== undefined) {
      out.labMmSeeded = truthy(explicitSeeded);
    } else if (out.labMmEnabled) {
      // API health uses lab_mm.enabled (+ address/levels) when the seed MM is live.
      out.labMmSeeded = true;
    }
  } else if (typeof h.lab_mm === "boolean" || typeof h.lab_mm === "string" || typeof h.lab_mm === "number") {
    out.labMmEnabled = truthy(h.lab_mm);
  }
  if (truthy(h.mm_seeded) || truthy(trading?.mm_seeded) || truthy(h.lab_mm_seeded)) {
    out.labMmSeeded = true;
  }
  if (truthy(trading?.lab_mm) || truthy(h.lab_mm_enabled)) {
    out.labMmEnabled = true;
  }
  // Some APIs may only expose enabled=true after a successful seed.
  if (out.labMmEnabled && truthy(h.mm_seeded ?? trading?.seeded)) {
    out.labMmSeeded = true;
  }

  const fees = h.fees && typeof h.fees === "object" ? (h.fees as Record<string, unknown>) : null;
  const features =
    h.features && typeof h.features === "object" ? (h.features as Record<string, unknown>) : null;
  if (
    featureOn(h.convert_fee) ||
    featureOn(features?.convert_fee) ||
    featureOn(fees?.convert_fee) ||
    (num(fees?.convert_taker_bps) !== undefined && (num(fees?.convert_taker_bps) as number) > 0)
  ) {
    out.convertFeeServer = true;
  }
  // Server HMC fee-pay: explicit flags, pay_fee_in_hmc hint (string|bool), or discount pct present.
  if (
    featureOn(h.hmc_fee_pay) ||
    featureOn(features?.hmc_fee_pay) ||
    featureOn(fees?.hmc_fee_pay) ||
    featureOn(fees?.pay_fee_in_hmc) ||
    featureOn(h.pay_fee_in_hmc)
  ) {
    out.hmcFeePayServer = true;
  }
  const disc = num(fees?.hmc_discount_pct) ?? num(fees?.hmc_fee_discount_pct);
  if (disc !== undefined && disc >= 0) {
    out.hmcDiscountPctServer = disc;
    out.hmcFeePayServer = true;
  }

  return out;
}

/**
 * Public fee-collection address from /health (if present).
 * Accepts string address or `{ address, note? }` (live API shape).
 * Returns null when missing/blank — callers hide the UI row.
 */
export function parseHealthFeeWallet(
  health: HealthResponse | Record<string, unknown> | null | undefined,
): string | null {
  if (!health || typeof health !== "object") return null;
  const raw = (health as Record<string, unknown>).fee_wallet;
  let addr = "";
  if (typeof raw === "string") {
    addr = raw.trim();
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const a = (raw as Record<string, unknown>).address;
    if (typeof a === "string") addr = a.trim();
  }
  return addr || null;
}

export type PaperGuardCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Client-side paper/synthetic checks mirroring API defaults.
 * `price` may be 0 for market (uses mid for notional / skips band).
 */
export function validatePaperTradingGuards(
  opts: {
    side: "buy" | "sell";
    kind: "market" | "limit" | "stop_limit" | "stop_market" | "trailing_stop" | "oco" | string;
    amountBase: number;
    price: number;
    mid: number;
    quoteSymbol?: string;
    guards?: Partial<TradingGuards>;
  },
): PaperGuardCheck {
  const g = { ...DEFAULT_TRADING_GUARDS, ...opts.guards };
  const amt = opts.amountBase;
  const mid = opts.mid;
  const quote = opts.quoteSymbol || "USDT";
  if (!(amt > 0) || !Number.isFinite(amt)) {
    return { ok: false, reason: "Amount must be > 0" };
  }

  const isMarket = opts.kind === "market" || opts.kind === "stop_market" || opts.kind === "trailing_stop";
  const px = isMarket ? (opts.price > 0 ? opts.price : mid) : opts.price;
  if (!(px > 0) || !Number.isFinite(px)) {
    return { ok: false, reason: "Invalid price" };
  }

  if (g.minNotionalQuote > 0) {
    const notional = px * amt;
    if (notional < g.minNotionalQuote) {
      return {
        ok: false,
        reason: `Min notional ${g.minNotionalQuote} ${quote} (got ${notional.toPrecision(4)})`,
      };
    }
  }

  // Soft band for priced orders (limit / stop-limit limit price).
  const checkBand =
    opts.kind === "limit" || opts.kind === "stop_limit" || opts.kind === "oco";
  if (checkBand && g.priceBandBps > 0 && mid > 0 && opts.price > 0) {
    const lo = mid * (10_000 - g.priceBandBps) / 10_000;
    const hi = mid * (10_000 + g.priceBandBps) / 10_000;
    if (opts.price < lo || opts.price > hi) {
      return {
        ok: false,
        reason: `Price outside ±${(g.priceBandBps / 100).toFixed(0)}% band of mid (allowed ${lo.toPrecision(6)}–${hi.toPrecision(6)})`,
      };
    }
  }

  return { ok: true };
}
