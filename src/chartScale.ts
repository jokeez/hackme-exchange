import type { Candle, Timeframe } from "./types";

/**
 * TradingView / LWC practice: never let a single wick or corrupt print
 * dominate the Y-axis. Clip bar highs/lows relative to the body, then
 * optionally tighten absolute outliers vs a robust mid of the series.
 */

/** Max wick beyond body as fraction of body mid.
 * Paper desk: keep near-zero so candles look “closed” (body fills OHLC) like CEX 1D —
 * long decorative wicks on 5m/15m read as unfinished spikes. */
export const MAX_WICK_FRAC = 0;

/**
 * Legacy default jump — prefer {@link maxJumpFracForTf}.
 * Kept for callers that pass an explicit maxJump.
 */
export const MAX_BAR_JUMP_FRAC = 0.04;

/** Soft absolute band around series median close (± fraction). */
export const MAX_SERIES_DEV_FRAC = 0.35;

/** Per-tick max close jump vs previous close (fraction). */
export function maxJumpFracForTf(tf: Timeframe | string): number {
  switch (tf) {
    case "30s":
      return 0.008;
    case "1m":
      return 0.01;
    case "3m":
      return 0.015;
    case "5m":
      return 0.02;
    case "15m":
      return 0.025;
    case "1H":
      return 0.03;
    case "2H":
      return 0.035;
    case "4H":
      return 0.04;
    case "1D":
      return 0.03;
    case "1W":
      return 0.05;
    default:
      return MAX_BAR_JUMP_FRAC;
  }
}

/**
 * Max |close−open|/open inside one bar.
 * Stops multi-tick walks (esp. 1D) from painting −30% bodies that squash the pane.
 */
/** Visible wick cap per TF — paper candles stay body-closed on every resolution. */
export function maxWickFracForTf(_tf: Timeframe | string): number {
  return MAX_WICK_FRAC;
}

export function maxBodyFracForTf(tf: Timeframe | string): number {
  switch (tf) {
    case "30s":
      return 0.016;
    case "1m":
      return 0.02;
    case "3m":
      return 0.024;
    case "5m":
      return 0.025;
    case "15m":
      return 0.03;
    case "1H":
      return 0.04;
    case "2H":
      return 0.045;
    case "4H":
      return 0.05;
    case "1D":
      return 0.05;
    case "1W":
      return 0.08;
    default:
      return 0.03;
  }
}

function finitePos(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

/** Clamp a live tick mid so one oracle glitch cannot paint a mile-long body. */
export function clampTickMid(mid: number, refClose: number, maxJump = MAX_BAR_JUMP_FRAC): number {
  if (!finitePos(mid)) return refClose > 0 ? refClose : mid;
  if (!finitePos(refClose)) return mid;
  const lo = refClose * (1 - maxJump);
  const hi = refClose * (1 + maxJump);
  return Math.min(hi, Math.max(lo, mid));
}

/** True when |mid−ref|/ref exceeds the allowed jump (oracle discontinuity). */
export function isPriceDiscontinuity(
  mid: number,
  refClose: number,
  maxJump = MAX_BAR_JUMP_FRAC,
): boolean {
  if (!finitePos(mid) || !finitePos(refClose)) return false;
  return Math.abs(mid - refClose) / refClose > maxJump;
}

/**
 * Keep OHLC coherent with open: close/high/low cannot run away and squash the chart.
 * Used after each tip update and during sanitize.
 */
export function constrainBarToOpen(c: Candle, maxBody = 0.05, maxWick = MAX_WICK_FRAC): Candle {
  if (!finitePos(c.open)) return clipBarWicks(c, maxWick);
  const open = c.open;
  const close = clampTickMid(finitePos(c.close) ? c.close : open, open, maxBody);
  if (!(maxWick > 0)) {
    return {
      ...c,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
    };
  }
  // Wick pad tracks body cap but stays tighter than the body itself (no barcode tape).
  const wickPad = Math.min(maxBody * 0.65, maxWick * 1.35);
  const hiCap = open * (1 + wickPad);
  const loCap = open * Math.max(1e-6, 1 - wickPad);
  let high = Math.max(open, close, finitePos(c.high) ? c.high : close);
  let low = Math.min(open, close, finitePos(c.low) ? c.low : close);
  high = Math.min(high, hiCap);
  low = Math.max(low, loCap);
  high = Math.max(high, open, close);
  low = Math.min(low, open, close);
  return clipBarWicks({ ...c, open, high, low, close }, maxWick);
}

/** Clip one bar's high/low to a sane wick around the body. */
export function clipBarWicks(c: Candle, maxWickFrac = MAX_WICK_FRAC): Candle {
  if (!finitePos(c.open) || !finitePos(c.close)) return c;
  const open = c.open;
  const close = c.close;
  if (!(maxWickFrac > 0)) {
    return {
      ...c,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
    };
  }
  const bodyMid = (open + close) / 2;
  const wick = Math.max(bodyMid * maxWickFrac, Math.abs(close - open) * 0.5);
  let high = Math.max(open, close, finitePos(c.high) ? c.high : bodyMid);
  let low = Math.min(open, close, finitePos(c.low) ? c.low : bodyMid);
  high = Math.min(high, bodyMid + wick);
  low = Math.max(low, Math.max(bodyMid * 1e-6, bodyMid - wick));
  if (high < Math.max(open, close)) high = Math.max(open, close);
  if (low > Math.min(open, close)) low = Math.min(open, close);
  return { ...c, open, high, low, close };
}

/**
 * Heal series: clip insane wicks, absolute outliers vs median, body vs open,
 * and bar-to-bar jumps (stops multi-tick 1D cliffs from surviving into LWC).
 *
 * For future live matching fills, pass `{ clipJumps: false }` so real large
 * moves are not silently squashed — clip stays on for synthetic oracle history.
 */
export function sanitizeCandleExtremes(
  candles: Candle[],
  maxBodyJump = 0.08,
  opts?: { clipJumps?: boolean; maxWick?: number },
): Candle[] {
  const clipJumps = opts?.clipJumps !== false;
  const maxWick = opts?.maxWick ?? MAX_WICK_FRAC;
  if (!candles.length) return candles;
  if (candles.length === 1) return [constrainBarToOpen(clipBarWicks(candles[0]!, maxWick), maxBodyJump, maxWick)];

  const closes = candles.map((c) => c.close).filter(finitePos).sort((a, b) => a - b);
  const med = median(closes) || candles[candles.length - 1]!.close;
  if (!finitePos(med)) return candles.map((c) => constrainBarToOpen(clipBarWicks(c, maxWick), maxBodyJump, maxWick));
  const absLo = med * (1 - MAX_SERIES_DEV_FRAC);
  const absHi = med * (1 + MAX_SERIES_DEV_FRAC);

  const out: Candle[] = [];
  let prevClose = 0;
  for (const raw of candles) {
    let c = { ...raw };
    if (clipJumps && finitePos(c.close) && (c.close < absLo || c.close > absHi)) {
      c.close = Math.min(absHi, Math.max(absLo, c.close));
    }
    if (clipJumps && finitePos(c.open) && (c.open < absLo || c.open > absHi)) {
      c.open = Math.min(absHi, Math.max(absLo, c.open));
    }
    if (!finitePos(c.open)) c.open = finitePos(c.close) ? c.close : med;
    if (!finitePos(c.close)) c.close = finitePos(c.open) ? c.open : med;

    if (clipJumps && finitePos(prevClose) && isPriceDiscontinuity(c.open, prevClose, maxBodyJump)) {
      c.open = prevClose;
    }
    c = constrainBarToOpen(c, maxBodyJump, maxWick);
    if (clipJumps) {
      c.high = Math.min(c.high, absHi * 1.02);
      c.low = Math.max(c.low, absLo * 0.98);
    }
    if (c.high < Math.max(c.open, c.close)) c.high = Math.max(c.open, c.close);
    if (c.low > Math.min(c.open, c.close)) c.low = Math.min(c.open, c.close);
    out.push(c);
    prevClose = c.close;
  }
  return out;
}

export type PriceRange = { minValue: number; maxValue: number };

/**
 * Robust visible range: use percentiles of OHLC so extreme wicks don't squash the pane.
 * Last close is included only when it sits near the percentile band (no cliff expansion).
 */
export function robustPriceRange(
  candles: Candle[],
  fromIdx = 0,
  toIdx?: number,
  loPct = 0.02,
  hiPct = 0.98,
): PriceRange | null {
  if (!candles.length) return null;
  const start = Math.max(0, Math.floor(fromIdx));
  const end = Math.min(candles.length - 1, Math.floor(toIdx ?? candles.length - 1));
  if (end < start) return null;

  const samples: number[] = [];
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    if (finitePos(c.low)) samples.push(c.low);
    if (finitePos(c.high)) samples.push(c.high);
    if (finitePos(c.open)) samples.push(c.open);
    if (finitePos(c.close)) samples.push(c.close);
  }
  if (samples.length < 4) {
    const closes = candles.slice(start, end + 1).map((c) => c.close).filter(finitePos);
    if (!closes.length) return null;
    const mn = Math.min(...closes);
    const mx = Math.max(...closes);
    if (!(mx > mn)) {
      const pad = Math.max(Math.abs(mx) * 0.002, 1e-12);
      return { minValue: mx - pad, maxValue: mx + pad };
    }
    return { minValue: mn, maxValue: mx };
  }

  samples.sort((a, b) => a - b);
  const at = (p: number) => {
    const i = Math.min(samples.length - 1, Math.max(0, Math.floor(p * (samples.length - 1))));
    return samples[i]!;
  };
  let minValue = at(loPct);
  let maxValue = at(hiPct);
  const last = candles[end]!;
  if (finitePos(last.close)) {
    const span = Math.max(maxValue - minValue, maxValue * 0.002);
    const bandLo = minValue - span * 0.25;
    const bandHi = maxValue + span * 0.25;
    if (last.close >= bandLo && last.close <= bandHi) {
      minValue = Math.min(minValue, last.close);
      maxValue = Math.max(maxValue, last.close);
    }
  }
  if (!(maxValue > minValue)) {
    const pad = Math.max(Math.abs(maxValue) * 0.002, 1e-12);
    return { minValue: maxValue - pad, maxValue: maxValue + pad };
  }
  const pad = (maxValue - minValue) * 0.04;
  return { minValue: minValue - pad, maxValue: maxValue + pad };
}

/** Logical range → candle indices (LWC logical coords ≈ bar index). */
export function logicalRangeToIndices(
  from: number,
  to: number,
  length: number,
): { fromIdx: number; toIdx: number } {
  const fromIdx = Math.max(0, Math.floor(from));
  const toIdx = Math.min(length - 1, Math.ceil(to));
  return { fromIdx, toIdx: Math.max(fromIdx, toIdx) };
}
