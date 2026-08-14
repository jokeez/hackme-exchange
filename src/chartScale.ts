import type { Candle } from "./types";

/**
 * TradingView / LWC practice: never let a single wick or corrupt print
 * dominate the Y-axis. Clip bar highs/lows relative to the body, then
 * optionally tighten absolute outliers vs a robust mid of the series.
 */

/** Max wick beyond body as fraction of body mid (e.g. 0.06 = ±6%). */
export const MAX_WICK_FRAC = 0.06;

/** Max close jump vs previous close per bar (fraction). Allows catch-up after idle gaps. */
export const MAX_BAR_JUMP_FRAC = 0.35;

/** Soft absolute band around series median close (± fraction). */
export const MAX_SERIES_DEV_FRAC = 0.45;

function finitePos(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

/** Clamp a live tick mid so one oracle glitch cannot paint a mile-long wick. */
export function clampTickMid(mid: number, refClose: number, maxJump = MAX_BAR_JUMP_FRAC): number {
  if (!finitePos(mid)) return refClose > 0 ? refClose : mid;
  if (!finitePos(refClose)) return mid;
  const lo = refClose * (1 - maxJump);
  const hi = refClose * (1 + maxJump);
  return Math.min(hi, Math.max(lo, mid));
}

/** Clip one bar's high/low to a sane wick around the body. */
export function clipBarWicks(c: Candle, maxWickFrac = MAX_WICK_FRAC): Candle {
  if (!finitePos(c.open) || !finitePos(c.close)) return c;
  let open = c.open;
  let close = c.close;
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
 * Heal series: clip insane wicks and absolute outliers vs median close.
 * Live tick jumps are clamped in upsertTick; here we fix corrupt storage / seeds.
 */
export function sanitizeCandleExtremes(candles: Candle[]): Candle[] {
  if (!candles.length) return candles;
  if (candles.length === 1) return [clipBarWicks(candles[0]!)];

  const closes = candles.map((c) => c.close).filter(finitePos).sort((a, b) => a - b);
  const med = median(closes) || candles[candles.length - 1]!.close;
  if (!finitePos(med)) return candles.map((c) => clipBarWicks(c));
  const absLo = med * (1 - MAX_SERIES_DEV_FRAC);
  const absHi = med * (1 + MAX_SERIES_DEV_FRAC);

  return candles.map((raw) => {
    let c = { ...raw };
    if (finitePos(c.close) && (c.close < absLo || c.close > absHi)) {
      c.close = Math.min(absHi, Math.max(absLo, c.close));
    }
    if (finitePos(c.open) && (c.open < absLo || c.open > absHi)) {
      c.open = Math.min(absHi, Math.max(absLo, c.open));
    }
    if (!finitePos(c.open)) c.open = finitePos(c.close) ? c.close : med;
    if (!finitePos(c.close)) c.close = finitePos(c.open) ? c.open : med;
    c = clipBarWicks(c);
    c.high = Math.min(c.high, absHi * 1.02);
    c.low = Math.max(c.low, absLo * 0.98);
    if (c.high < Math.max(c.open, c.close)) c.high = Math.max(c.open, c.close);
    if (c.low > Math.min(c.open, c.close)) c.low = Math.min(c.open, c.close);
    return c;
  });
}

export type PriceRange = { minValue: number; maxValue: number };

/**
 * Robust visible range: use percentiles of OHLC so extreme wicks don't squash the pane.
 * Mirrors common TradingView "ignore outliers" / scale-to-body behaviour.
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
  // Always include last close so live price stays on-scale
  const last = candles[end]!;
  if (finitePos(last.close)) {
    minValue = Math.min(minValue, last.close);
    maxValue = Math.max(maxValue, last.close);
  }
  if (!(maxValue > minValue)) {
    const pad = Math.max(Math.abs(maxValue) * 0.002, 1e-12);
    return { minValue: maxValue - pad, maxValue: maxValue + pad };
  }
  // Small pad so candles aren't flush with the edge
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
