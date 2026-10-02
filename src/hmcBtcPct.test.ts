/**
 * HMC/BTC percent sizing must use available quote/base (not leave amount stuck).
 */
import { describe, expect, it } from "vitest";
import { maxOrderBaseAmount } from "./balance";
import { baseState, sampleMarket } from "./testFixtures";

describe("HMC/BTC pct sizing", () => {
  it("buy 50% of BTC avail fills non-zero HMC amount", () => {
    const s = baseState({ wallet: { usdt: 0, hmc: 0, sup: 0, btc: 0.15 } });
    const m = sampleMarket();
    const price = 0.00000074;
    const amt = maxOrderBaseAmount(s, m, "HMC_BTC", "buy", price, "limit", 0.5, price);
    expect(amt).toBeGreaterThan(10_000);
    expect(amt * price).toBeLessThanOrEqual(0.15 * 0.5 * 1.01);
  });

  it("sell 50% of HMC avail fills half inventory", () => {
    const s = baseState({ wallet: { usdt: 0, hmc: 50_000, sup: 0, btc: 0 } });
    const m = sampleMarket();
    const price = 0.00000074;
    const amt = maxOrderBaseAmount(s, m, "HMC_BTC", "sell", price, "limit", 0.5, price);
    expect(amt).toBe(25_000);
  });

  it("zero avail returns 0 for pct sizing", () => {
    const s = baseState({ wallet: { usdt: 0, hmc: 0, sup: 0, btc: 0 } });
    const m = sampleMarket();
    expect(maxOrderBaseAmount(s, m, "HMC_BTC", "buy", 0.00000074, "limit", 1, 0.00000074)).toBe(0);
    expect(maxOrderBaseAmount(s, m, "HMC_BTC", "sell", 0.00000074, "limit", 1, 0.00000074)).toBe(0);
  });
});
