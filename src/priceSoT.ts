/**
 * Single source of truth helpers for desk “Last” across header / chart tip /
 * order form / markets. Soft-MM tape can diverge from live BBO — prefer book
 * when the print is stale or far from mid.
 */

/** Relative |a−b|/ref — 0 when either side is non-positive. */
export function priceDriftFrac(a: number, b: number): number {
  if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(a - b) / Math.max(a, b);
}

/** True when two prices agree within `tolFrac` (default 50 bps). */
export function pricesAligned(a: number, b: number, tolFrac = 0.005): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return priceDriftFrac(a, b) <= tolFrac;
}

export type DeskLastInputs = {
  /** Last public print (tape). */
  tape?: number;
  /** Tape age in ms (Date.now() − printTs). */
  tapeAgeMs?: number;
  /** Soft-MM / L2 mid (two-sided BBO). */
  labMid?: number;
  /** Durable /tickers last. */
  apiLast?: number;
  /** Forming candle tip close (last resort only). */
  tipClose?: number;
  /** Previous tick mid. */
  prevMid?: number;
};

/**
 * Desk Last for toolbar, chart tip, markets, and undirtied limit defaults.
 * Prefer fresh tape; when tape↔BBO desyncs, Soft-MM mid wins so tip/header
 * cannot stick to a stale synthetic print while the book has moved.
 */
export function resolveDeskLast(input: DeskLastInputs): number {
  const tape = input.tape && input.tape > 0 && Number.isFinite(input.tape) ? input.tape : 0;
  const lab = input.labMid && input.labMid > 0 && Number.isFinite(input.labMid) ? input.labMid : 0;
  const api = input.apiLast && input.apiLast > 0 && Number.isFinite(input.apiLast) ? input.apiLast : 0;
  const tip = input.tipClose && input.tipClose > 0 && Number.isFinite(input.tipClose) ? input.tipClose : 0;
  const prev = input.prevMid && input.prevMid > 0 && Number.isFinite(input.prevMid) ? input.prevMid : 0;
  const ageMs =
    input.tapeAgeMs != null && Number.isFinite(input.tapeAgeMs) ? Math.max(0, input.tapeAgeMs) : Number.POSITIVE_INFINITY;

  const tapeFresh = tape > 0 && ageMs < 45_000;
  if (tapeFresh && lab > 0) {
    // Fresh print far from live BBO → Soft-MM mid is the tradeable Last.
    if (priceDriftFrac(tape, lab) > 0.05) return lab;
    return tape;
  }
  if (tapeFresh) return tape;

  if (tape > 0 && lab > 0) {
    // Stale print already far from Soft-MM — don't drag Last for minutes.
    if (priceDriftFrac(tape, lab) > 0.05) return lab;
    // Near-aligned stale tape: blend gently toward Soft-MM.
    const w = Math.min(1, Math.max(0, (ageMs - 45_000) / (3 * 60_000)));
    return tape * (1 - w) + lab * w;
  }
  if (lab > 0) return lab;
  if (api > 0) return api;
  if (tape > 0) return tape;
  if (tip > 0) return tip;
  if (prev > 0) return prev;
  return 0;
}

/**
 * Limit form auto-resync: when the user has not dirtied the input, keep price
 * within `tolFrac` of desk Last (resting offset applied by caller).
 */
export function limitFormNeedsResync(
  formPrice: number,
  deskLast: number,
  dirty: boolean,
  tolFrac = 0.02,
): boolean {
  if (dirty) return false;
  if (!(deskLast > 0) || !Number.isFinite(deskLast)) return false;
  if (!(formPrice > 0) || !Number.isFinite(formPrice)) return true;
  return priceDriftFrac(formPrice, deskLast) > tolFrac;
}

/** Pin forming tip close to desk Last (mutate series tip in place). */
export function pinTipCloseToLast<T extends { close: number; high: number; low: number; open: number }>(
  series: T[] | undefined,
  deskLast: number,
): boolean {
  if (!series?.length || !(deskLast > 0) || !Number.isFinite(deskLast)) return false;
  const tip = series[series.length - 1]!;
  if (pricesAligned(tip.close, deskLast, 1e-12)) {
    tip.close = deskLast;
    tip.high = Math.max(tip.high, tip.open, deskLast);
    tip.low = Math.min(tip.low, tip.open, deskLast);
    return false;
  }
  tip.close = deskLast;
  tip.high = Math.max(tip.high, tip.open, deskLast);
  tip.low = Math.min(tip.low, tip.open, deskLast);
  return true;
}
