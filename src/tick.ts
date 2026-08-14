import type { PairId } from "./types";
import { getPair } from "./registry";

/** Round price to pair tick (decimals from registry). */
export function roundToTick(price: number, pairId: PairId): number {
  if (!Number.isFinite(price) || price <= 0) return price;
  const d = getPair(pairId).decimals;
  const f = 10 ** d;
  return Math.round(price * f) / f;
}

/** Format for order form inputs — fixed decimals, no float noise. */
export function tickInputValue(price: number, pairId: PairId): string {
  if (!Number.isFinite(price) || price <= 0) return "0";
  const d = getPair(pairId).decimals;
  return roundToTick(price, pairId).toFixed(d);
}
