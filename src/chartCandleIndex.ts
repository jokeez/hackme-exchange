import type { Candle } from "./types";

/** Exact time match on a time-sorted candle series (O(log n)). */
export function candleAtTime(candles: readonly Candle[], time: number): Candle | undefined {
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = candles[mid]!.time;
    if (ct === time) return candles[mid];
    if (ct < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** Closest bar by time on a sorted series (O(log n)). */
export function nearestCandle(candles: readonly Candle[], time: number): Candle | null {
  const n = candles.length;
  if (!n) return null;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  const right = candles[lo];
  const left = candles[lo - 1];
  if (!right) return left ?? null;
  if (!left) return right;
  return Math.abs(right.time - time) < Math.abs(left.time - time) ? right : left;
}
