import type { Candle, Timeframe } from "./types";

/**
 * TradingView / LWC practice: never let a single wick or corrupt print
 * dominate the Y-axis. Clip bar highs/lows relative to the body, then
 * optionally tighten absolute outliers vs a robust mid of the series.
 *
 * Exchange OHLC rules (Binance / CME-style):
 * - Open = first print in the bucket
 * - High = max print in the bucket (upper wick tip)
 * - Low  = min print in the bucket (lower wick tip)
 * - Close = last print in the bucket
 * Wicks are real traded extremes — not decoration. Higher TFs aggregate
 * child highs/lows; they must NOT be body-collapsed.
 */

/** Soft default wick-beyond-body cap (± of body mid). Prefer {@link maxWickFracForTf}. */
export const MAX_WICK_FRAC = 0.012;

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
/**
 * Max wick BEYOND the body as a fraction of body mid.
 * Calibrated so calm liquid spot looks CEX-like: wicks exist, but do not dwarf
 * the body into a “spike forest” on every bar.
 */
export function maxWickFracForTf(tf: Timeframe | string): number {
  switch (tf) {
    case "30s":
      return 0.0025;
    case "1m":
      return 0.0032;
    case "3m":
      return 0.0045;
    case "5m":
      return 0.006;
    case "15m":
      return 0.0075;
    case "1H":
      return 0.011;
    case "2H":
      return 0.014;
    case "4H":
      return 0.018;
    case "1D":
      return 0.025;
    case "1W":
      return 0.04;
    default:
      return MAX_WICK_FRAC;
  }
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

/**
 * Display-only body cap — Soft-MM cliffs only (not quiet CEX tape).
 * Kept near state maxBody so real Soft-MM / print moves paint as readable
 * bodies (hammer / engulfing / marubozu), not Renko hairlines.
 */
export function paintMaxBodyFracForTf(tf: Timeframe | string): number {
  switch (tf) {
    case "30s":
      return 0.012;
    case "1m":
      return 0.016;
    case "3m":
      return 0.02;
    case "5m":
      return 0.022;
    case "15m":
      return 0.028;
    case "1H":
      return 0.035;
    case "2H":
      return 0.04;
    case "4H":
      return 0.045;
    case "1D":
      return 0.05;
    case "1W":
      return 0.07;
    default:
      return 0.025;
  }
}

/**
 * Max Y-span (fraction of mid) before tip-anchoring.
 * Binance/TV keep several % of visible Soft-MM breathe — not a 1.2% tip window
 * that flattens history into a dashed ruler at the bottom of the pane.
 */
export function paintMaxSpanFracForTf(tf: Timeframe | string): number {
  switch (tf) {
    case "30s":
      return 0.045;
    case "1m":
      return 0.055;
    case "3m":
      return 0.065;
    case "5m":
      return 0.08;
    case "15m":
      return 0.1;
    case "1H":
      return 0.14;
    case "2H":
      return 0.16;
    case "4H":
      return 0.2;
    case "1D":
      return 0.28;
    case "1W":
      return 0.4;
    default:
      return 0.1;
  }
}

/**
 * Clamp a robust range so Soft-MM cliffs cannot squash the pane, while normal
 * multi-hour Soft-MM breathe still fills the viewport (CEX desk).
 */
export function clampPaintPriceSpan(
  range: PriceRange,
  tipClose: number,
  maxSpanFrac: number,
): PriceRange {
  let minValue = range.minValue;
  let maxValue = range.maxValue;
  if (!(maxValue > minValue)) return range;
  const tip = finitePos(tipClose) ? tipClose : (minValue + maxValue) / 2;
  // Always keep Last on-screen.
  if (tip < minValue) minValue = tip;
  if (tip > maxValue) maxValue = tip;
  const mid = (minValue + maxValue) / 2;
  const maxSpan = Math.max(Math.abs(mid) * maxSpanFrac, Math.abs(tip) * maxSpanFrac, 1e-12);
  let span = maxValue - minValue;
  if (span <= maxSpan) return { minValue, maxValue };
  // Extreme cliff only: tip-centered window (still wide enough for real bodies).
  const above = maxSpan * 0.45;
  const below = maxSpan - above;
  return { minValue: tip - below, maxValue: tip + above };
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
  // Absolute pad around open so body + modest wick can exist without barcode spikes.
  const pad = Math.max(maxBody, maxWick) * 1.15;
  const hiCap = open * (1 + pad);
  const loCap = open * Math.max(1e-6, 1 - pad);
  let high = Math.max(open, close, finitePos(c.high) ? c.high : close);
  let low = Math.min(open, close, finitePos(c.low) ? c.low : close);
  high = Math.min(high, hiCap);
  low = Math.max(low, loCap);
  high = Math.max(high, open, close);
  low = Math.min(low, open, close);
  return clipBarWicks({ ...c, open, high, low, close }, maxWick);
}

/**
 * Clip wick length beyond the body (exchange high/low still ≥ body).
 * Cap is ± maxWickFrac of body mid — does not force a minimum wick.
 */
export function clipBarWicks(c: Candle, maxWickFrac = MAX_WICK_FRAC): Candle {
  if (!finitePos(c.open) || !finitePos(c.close)) return c;
  const open = c.open;
  const close = c.close;
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);
  const bodyMid = (open + close) / 2;
  const cap = Math.max(bodyMid * Math.max(0, maxWickFrac), 0);
  let high = Math.max(bodyHigh, finitePos(c.high) ? c.high : bodyHigh);
  let low = Math.min(bodyLow, finitePos(c.low) ? c.low : bodyLow);
  high = Math.min(high, bodyHigh + cap);
  low = Math.max(low, Math.max(bodyMid * 1e-6, bodyLow - cap));
  if (high < bodyHigh) high = bodyHigh;
  if (low > bodyLow) low = bodyLow;
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
 * Robust visible range: body-weighted percentiles so mile wicks / dump cliffs
 * don't squash the pane into «island» hairlines with blank strips between.
 * Last close is included only when it sits near the percentile band.
 */
export function robustPriceRange(
  candles: Candle[],
  fromIdx = 0,
  toIdx?: number,
  loPct = 0.05,
  hiPct = 0.95,
): PriceRange | null {
  if (!candles.length) return null;
  const start = Math.max(0, Math.floor(fromIdx));
  const end = Math.min(candles.length - 1, Math.floor(toIdx ?? candles.length - 1));
  if (end < start) return null;

  // Prefer open/close (bodies). Admit high/low only when they sit near the body
  // — otherwise Soft-MM needles expand Y and every quiet bar becomes invisible.
  const bodySamples: number[] = [];
  const wickSamples: number[] = [];
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    if (finitePos(c.open)) bodySamples.push(c.open);
    if (finitePos(c.close)) bodySamples.push(c.close);
    if (finitePos(c.high)) wickSamples.push(c.high);
    if (finitePos(c.low)) wickSamples.push(c.low);
  }
  if (bodySamples.length < 4) {
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

  bodySamples.sort((a, b) => a - b);
  const at = (arr: number[], p: number) => {
    const i = Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))));
    return arr[i]!;
  };
  let minValue = at(bodySamples, loPct);
  let maxValue = at(bodySamples, hiPct);
  const bodySpan = Math.max(maxValue - minValue, maxValue * 0.002);
  // Allow modest wick extension (~35% of body span) — not full needle extremes.
  const wickPad = bodySpan * 0.35;
  for (const w of wickSamples) {
    if (w >= minValue - wickPad && w <= maxValue + wickPad) {
      minValue = Math.min(minValue, w);
      maxValue = Math.max(maxValue, w);
    }
  }
  const last = candles[end]!;
  // Always keep Last on-scale — excluding tip after Soft-MM breathe painted the
  // empty-top / flat-bottom screenshot (Yday + tip islands).
  if (finitePos(last.close)) {
    minValue = Math.min(minValue, last.close);
    maxValue = Math.max(maxValue, last.close);
  }
  if (finitePos(last.open)) {
    minValue = Math.min(minValue, last.open);
    maxValue = Math.max(maxValue, last.open);
  }
  if (!(maxValue > minValue)) {
    const pad = Math.max(Math.abs(maxValue) * 0.002, 1e-12);
    return { minValue: maxValue - pad, maxValue: maxValue + pad };
  }
  const pad = (maxValue - minValue) * 0.06;
  return { minValue: minValue - pad, maxValue: maxValue + pad };
}

/** Deterministic ∈ [-1,1] from bar time — display breathe only (not trading state). */
function paintNoise(time: number, salt: number): number {
  let x = (Math.imul(time ^ salt, 0x9e3779b9) >>> 0) / 0x100000000;
  x = x * 2 - 1;
  return x;
}

/**
 * CEX desk paint for every TF / pair (Binance · Bybit · CME OHLC):
 * - open bridges prior close (24/7 crypto continuity)
 * - high/low = real traded extremes (clipped Soft-MM mile needles only)
 * - tip close = Last
 * - sticky Soft-MM peg dojis get micro body+wick so bars look like candles,
 *   not a dashed ruler
 *
 * No backward tip-walk Renko — that squashed history into flat hairlines.
 */
function displayCapCex(candles: Candle[], tf: Timeframe | string): Candle[] {
  const maxBody = Math.max(paintMaxBodyFracForTf(tf), maxBodyFracForTf(tf) * 0.85);
  const maxWick = maxWickFracForTf(tf);
  // Tip may sit far from week/day open after Soft-MM breathe — allow wider tip wick clip.
  const tipWick = Math.max(maxWick, paintMaxSpanFracForTf(tf) * 0.35);
  // Quiet-tape breathe — enough for hammer / doji / marubozu silhouette, not Renko steps.
  const minBody = Math.min(maxBody * 0.22, 0.0018);
  const tipIdx = candles.length - 1;
  const tipClose = finitePos(candles[tipIdx]!.close)
    ? candles[tipIdx]!.close
    : finitePos(candles[tipIdx]!.open)
      ? candles[tipIdx]!.open
      : 0;
  if (!(tipClose > 0)) return candles;

  const out: Candle[] = new Array(candles.length);
  let prevClose = finitePos(candles[0]!.open) ? candles[0]!.open : candles[0]!.close;
  for (let i = 0; i < candles.length; i++) {
    const raw = candles[i]!;
    // Binance/CME spot: next bar opens at prior close (24/7 crypto; no session gap invent).
    let open = finitePos(prevClose) ? prevClose : finitePos(raw.open) ? raw.open : tipClose;
    let close = i === tipIdx ? tipClose : finitePos(raw.close) ? raw.close : open;

    // Closed bars: body-cap Soft-MM cliffs. Tip: Last wins — never invent tip open island.
    if (i !== tipIdx && Math.abs(close - open) / Math.max(open, 1e-12) > maxBody) {
      const sign = close >= open ? 1 : -1;
      close = open * (1 + sign * maxBody);
    }

    // Sticky Soft-MM peg (O≈C, H≈L): synthesize CEX-quiet body + wick so the pane
    // shows real candles (patterns sheet), not flat horizontal dashes.
    const midRef = Math.max(Math.abs(open), Math.abs(close), 1e-12);
    const bodyLo = Math.min(open, close);
    const dumpNeedle =
      finitePos(raw.low) &&
      bodyLo > 0 &&
      (bodyLo - raw.low) / bodyLo > Math.max(maxWick * 2.5, 0.006);
    // Peg / doji: flat body — ignore modest Soft-MM H/L (0.1% ceiling band).
    const flatTape = Math.abs(close - open) / midRef < minBody * 0.55 && !dumpNeedle;
    if (flatTape && i !== tipIdx) {
      const n = paintNoise(raw.time, 0x71c4);
      const sign = n >= 0 ? 1 : -1;
      close = open * (1 + sign * minBody * (0.7 + 0.3 * Math.abs(n)));
    }
    // Forming bar: open always bridges prior close — widen wicks only (CEX).

    // Preserve child high/low (true wicks), then clip Soft-MM mile needles.
    let high = Math.max(open, close, finitePos(raw.high) ? raw.high : close);
    let low = Math.min(open, close, finitePos(raw.low) ? raw.low : open);
    if (flatTape) {
      const wickPad = Math.max(midRef * maxWick, midRef * minBody * 0.35, 1e-12);
      high = Math.max(high, Math.max(open, close) + wickPad * (0.25 + 0.55 * Math.abs(paintNoise(raw.time, 0x4111))));
      low = Math.min(
        low,
        Math.min(open, close) - wickPad * (0.25 + 0.55 * Math.abs(paintNoise(raw.time, 0x1010))),
      );
      low = Math.max(low, midRef * 1e-6);
    }

    let painted: Candle;
    if (i === tipIdx) {
      painted = clipBarWicks({ ...raw, open, high, low, close: tipClose }, tipWick);
      painted = {
        ...painted,
        open,
        close: tipClose,
        high: Math.max(painted.high, open, tipClose),
        low: Math.min(painted.low, open, tipClose),
      };
    } else {
      painted = constrainBarToOpen(
        clipBarWicks({ ...raw, open, high, low, close }, maxWick),
        maxBody,
        maxWick,
      );
    }
    out[i] = {
      ...painted,
      volume: raw.volume > 0 ? raw.volume : Math.max(Math.abs(open) * 0.02, 1e-6),
    };
    prevClose = out[i]!.close;
  }
  return out;
}

/**
 * Display-only OHLC for LWC — CEX aggregation paint on every TF / pair / ticker.
 * State/cache untouched. Tip close always = Last.
 */
export function displayCapCandles(candles: Candle[], tf: Timeframe | string): Candle[] {
  if (candles.length < 2) return candles;
  return displayCapCex(candles, tf);
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
