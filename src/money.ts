/**
 * Integer minor-unit (1e8) helpers for balances / % sizing.
 * Avoids binary-float dust like 0.01 → 0.00999999999999 on 100% chips.
 */

export const MONEY_SCALE = 100_000_000; // 1e8

/** Display → integer minor (nearest). Non-finite / ≤0 → 0. */
export function toMinor(display: number): number {
  if (!Number.isFinite(display) || display <= 0) return 0;
  return Math.round(display * MONEY_SCALE);
}

/** Integer minor → display. */
export function fromMinor(minor: number): number {
  if (!Number.isFinite(minor) || minor <= 0) return 0;
  return minor / MONEY_SCALE;
}

/**
 * Snap display to nearest minor (recovers 0.01 − ε float dust from balance math).
 * Prefer this over raw floor for “100% of available”.
 */
export function snapToMinor(display: number): number {
  return fromMinor(toMinor(display));
}

/** Floor display to a whole minor unit (never exceeds a clean input). */
export function floorToMinor(display: number): number {
  if (!Number.isFinite(display) || display <= 0) return 0;
  return Math.floor(display * MONEY_SCALE + 1e-12) / MONEY_SCALE;
}

/** Ceil display to a whole minor unit. */
export function ceilToMinor(display: number): number {
  if (!Number.isFinite(display) || display <= 0) return 0;
  return Math.ceil(display * MONEY_SCALE - 1e-12) / MONEY_SCALE;
}

/**
 * `pct` in [0, 1] of available, in integer minor units so 100% never emits
 * 0.009999… dust and 25/50/75 stay on the grid.
 */
export function pctOfBalance(avail: number, pct: number): number {
  const p = Math.min(1, Math.max(0, pct));
  if (!(avail > 0) || p <= 0) return 0;
  // Round-snap first: freeBalance float dust must not shrink 100% under min notional.
  const availM = toMinor(avail);
  if (availM <= 0) return 0;
  if (p >= 1) return fromMinor(availM);
  const bps = Math.round(p * 10_000);
  return fromMinor(Math.floor((availM * bps) / 10_000));
}

/** Same as pctOfBalance but `pctPercent` is 0–100 (Convert desk chips). */
export function pctOfBalancePercent(avail: number, pctPercent: number): number {
  const pct = Math.min(100, Math.max(0, Math.round(pctPercent)));
  if (!(avail > 0) || pct <= 0) return 0;
  const availM = toMinor(avail);
  if (availM <= 0) return 0;
  if (pct >= 100) return fromMinor(availM);
  return fromMinor(Math.floor((availM * pct) / 100));
}

/** Smallest base qty (minor-floored ceil) whose quote notional meets `minNotional`. */
export function minBaseForNotional(minNotional: number, price: number): number {
  if (!(minNotional > 0) || !(price > 0) || !Number.isFinite(minNotional) || !Number.isFinite(price)) {
    return 0;
  }
  return ceilToMinor(minNotional / price);
}

/**
 * Quote notional in minor units: round(price×qty) via integer multiply.
 * Uses BigInt so large HMC notionals do not lose precision past MAX_SAFE_INTEGER.
 */
export function notionalMinor(price: number, amountBase: number): number {
  if (!(price > 0) || !(amountBase > 0)) return 0;
  const pm = toMinor(price);
  const am = toMinor(amountBase);
  if (pm <= 0 || am <= 0) return 0;
  const scale = BigInt(MONEY_SCALE);
  return Number((BigInt(pm) * BigInt(am) + scale / 2n) / scale);
}

/** True when price×qty meets min notional in minor units (no float edge rejects). */
export function notionalMeetsMin(price: number, amountBase: number, minNotional: number): boolean {
  if (!(minNotional > 0)) return true;
  return notionalMinor(price, amountBase) >= toMinor(minNotional);
}
