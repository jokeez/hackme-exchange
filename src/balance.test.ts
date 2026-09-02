import { describe, expect, it } from "vitest";
import {
  assertOrderFunds,
  freeBalance,
  fundsImmediateFill,
  maxBuyBaseAmount,
  maxOrderBaseAmount,
  maxSellBaseAmount,
  reservedBalances,
} from "./balance";
import { placeOco, placeOrder } from "./orders";
import { baseState, sampleMarket } from "./testFixtures";

describe("balance reservation", () => {
  const market = sampleMarket();

  it("reserves quote for open buy limits", () => {
    const s = baseState({ wallet: { usdt: 1000, hmc: 0, sup: 0, btc: 0 } });
    placeOrder(s, "HMC_USDT", "buy", "limit", 100_000, 0.0004, undefined, undefined, "GTC", false, market);
    const reserved = reservedBalances(s, market);
    expect(reserved.usdt).toBeGreaterThan(0);
    expect(freeBalance(s, "usdt", market)).toBeLessThan(1000);
  });

  it("blocks second buy when combined reservation exceeds wallet", () => {
    const s = baseState({ wallet: { usdt: 50, hmc: 0, sup: 0, btc: 0 } });
    const first = placeOrder(s, "HMC_USDT", "buy", "limit", 100_000, 0.0004, undefined, undefined, "GTC", false, market);
    expect("id" in first).toBe(true);
    const second = placeOrder(s, "HMC_USDT", "buy", "limit", 100_000, 0.0004, undefined, undefined, "GTC", false, market);
    expect(second).toEqual({ ok: false, reason: expect.stringContaining("reserved") });
  });

  it("assertOrderFunds respects reserved base on sells", () => {
    const s = baseState({ wallet: { usdt: 1000, hmc: 1000, sup: 0, btc: 0 } });
    placeOrder(s, "HMC_USDT", "sell", "limit", 900, 0.0005, undefined, undefined, "GTC", false, market);
    const check = assertOrderFunds(s, market, "HMC_USDT", "sell", 200, 0.0005, "limit");
    expect(check.ok).toBe(false);
  });

  it("OCO reserves once per group (not TP+SL double)", () => {
    const s = baseState({ wallet: { usdt: 1000, hmc: 5000, sup: 0, btc: 0 } });
    const oco = placeOco(s, "HMC_USDT", "sell", 1000, 0.0005, 0.0003, 0.00029, market);
    expect("tp" in oco).toBe(true);
    const reserved = reservedBalances(s, market);
    expect(reserved.hmc).toBe(1000);
    expect(freeBalance(s, "hmc", market)).toBe(4000);
  });

  it("buy OCO reserves max(TP, SL) quote once", () => {
    const s = baseState({ wallet: { usdt: 200, hmc: 0, sup: 0, btc: 0 } });
    const oco = placeOco(s, "HMC_USDT", "buy", 100_000, 0.0004, 0.00055, 0.0005, market);
    expect("tp" in oco).toBe(true);
    const reserved = reservedBalances(s, market);
    // SL @ 0.0005 is the pricier leg: 50 USDT + fee, not TP+SL summed
    expect(reserved.usdt).toBeGreaterThan(50);
    expect(reserved.usdt).toBeLessThan(100); // not double ~100+
  });

  it("maxBuyBaseAmount at 100% passes assertOrderFunds (fee haircut)", () => {
    const s = baseState({
      wallet: { usdt: 100, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = 0.0004;
    const naive = Math.floor(100 / price);
    expect(assertOrderFunds(s, market, "HMC_USDT", "buy", naive, price, "limit").ok).toBe(false);
    const amt = maxBuyBaseAmount(s, market, "HMC_USDT", price, "limit", 1);
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThan(naive);
    expect(assertOrderFunds(s, market, "HMC_USDT", "buy", amt, price, "limit")).toEqual({ ok: true });
    const placed = placeOrder(s, "HMC_USDT", "buy", "limit", amt, price, undefined, undefined, "GTC", false, market);
    expect("id" in placed).toBe(true);
  });

  it("maxBuyBaseAmount respects payFeesInHmc (quote can be 100%)", () => {
    const s = baseState({
      wallet: { usdt: 40, hmc: 1_000_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const price = 0.0004;
    const amt = maxBuyBaseAmount(s, market, "HMC_USDT", price, "market", 1);
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThanOrEqual(Math.floor(40 / price));
    expect(assertOrderFunds(s, market, "HMC_USDT", "buy", amt, price, "market")).toEqual({ ok: true });
  });

  it("sell + payFeesInHmc rejects when leftover HMC cannot cover fee", () => {
    const s = baseState({
      wallet: { usdt: 1000, hmc: 100, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    // Selling all HMC leaves 0 for fee
    const check = assertOrderFunds(s, market, "HMC_USDT", "sell", 100, 0.0005, "market");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/HMC for fee/i);
  });
});

describe("100% pct sizing (buy + sell)", () => {
  it("buy 100% at ~0.05 mid places successfully (screenshot regression)", () => {
    const m = sampleMarket({ hmcUsdt: 0.050007 });
    const s = baseState({
      wallet: { usdt: 10_000, hmc: 100_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    placeOrder(s, "HMC_USDT", "sell", "limit", 50_000, 0.050128, undefined, undefined, "GTC", false, m);
    const price = 0.04999997;
    const free = freeBalance(s, "usdt", m);
    const naive = Math.floor(free / price);
    expect(assertOrderFunds(s, m, "HMC_USDT", "buy", naive, price, "limit").ok).toBe(false);

    const amt = maxOrderBaseAmount(s, m, "HMC_USDT", "buy", price, "limit", 1, m.hmcUsdt);
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThan(naive);
    expect(assertOrderFunds(s, m, "HMC_USDT", "buy", amt, price, "limit").ok).toBe(true);
    const placed = placeOrder(s, "HMC_USDT", "buy", "limit", amt, price, undefined, undefined, "GTC", false, m);
    expect("id" in placed).toBe(true);
  });

  it("buy 100% marketable limit sizes with taker fees and places", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const s = baseState({
      wallet: { usdt: 10_000, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = 0.05; // crosses mid → immediate taker
    expect(fundsImmediateFill("limit", "buy", price, m.hmcUsdt)).toBe(true);
    const makerSized = maxBuyBaseAmount(s, m, "HMC_USDT", price, "limit", 1); // no mid → maker
    const takerSized = maxBuyBaseAmount(s, m, "HMC_USDT", price, "limit", 1, m.hmcUsdt);
    expect(takerSized).toBeLessThanOrEqual(makerSized);
    expect(assertOrderFunds(s, m, "HMC_USDT", "buy", takerSized, price, "limit", true).ok).toBe(true);
    const placed = placeOrder(s, "HMC_USDT", "buy", "limit", takerSized, price, undefined, undefined, "GTC", false, m);
    expect("id" in placed).toBe(true);
    if ("id" in placed) expect(placed.status).toBe("filled");
  });

  it("sell 100% respects open-order reserve", () => {
    const m = sampleMarket();
    const s = baseState({
      wallet: { usdt: 1_000, hmc: 10_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    placeOrder(s, "HMC_USDT", "sell", "limit", 6_000, 0.055, undefined, undefined, "GTC", false, m);
    const price = 0.051;
    const free = freeBalance(s, "hmc", m);
    expect(free).toBe(4_000);
    const amt = maxSellBaseAmount(s, m, "HMC_USDT", price, "limit", 1, m.hmcUsdt);
    expect(amt).toBe(free);
    expect(assertOrderFunds(s, m, "HMC_USDT", "sell", amt, price, "limit").ok).toBe(true);
    expect(assertOrderFunds(s, m, "HMC_USDT", "sell", amt + 1, price, "limit").ok).toBe(false);
    const placed = placeOrder(s, "HMC_USDT", "sell", "limit", amt, price, undefined, undefined, "GTC", false, m);
    expect("id" in placed).toBe(true);
  });

  it("sell 100% with payFeesInHmc leaves room for fee", () => {
    const m = sampleMarket();
    const s = baseState({
      wallet: { usdt: 1_000, hmc: 5_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const price = 0.05;
    const naive = Math.floor(freeBalance(s, "hmc", m));
    expect(assertOrderFunds(s, m, "HMC_USDT", "sell", naive, price, "market").ok).toBe(false);
    const amt = maxSellBaseAmount(s, m, "HMC_USDT", price, "market", 1, m.hmcUsdt);
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThan(naive);
    expect(assertOrderFunds(s, m, "HMC_USDT", "sell", amt, price, "market").ok).toBe(true);
  });

  it("maxOrderBaseAmount pct fractions stay within free funds", () => {
    const m = sampleMarket();
    const s = baseState({
      wallet: { usdt: 250, hmc: 8_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = 0.05;
    for (const pct of [0.25, 0.5, 0.75, 1]) {
      const buy = maxOrderBaseAmount(s, m, "HMC_USDT", "buy", price, "limit", pct, m.hmcUsdt);
      const sell = maxOrderBaseAmount(s, m, "HMC_USDT", "sell", price, "limit", pct, m.hmcUsdt);
      expect(assertOrderFunds(s, m, "HMC_USDT", "buy", buy, price, "limit").ok).toBe(true);
      expect(assertOrderFunds(s, m, "HMC_USDT", "sell", sell, price, "limit").ok).toBe(true);
    }
  });
});

describe("executeFill respects open-order reservations", () => {
  const market = sampleMarket();

  it("blocks market fill that would spend reserved quote", async () => {
    const { executeFill } = await import("./execution");
    const s = baseState({ wallet: { usdt: 100, hmc: 10_000, sup: 0, btc: 0 } });
    const price = 0.0004;
    // Reserve ~88 USDT — leaves <20 free; market buy for 20+ should fail.
    placeOrder(s, "HMC_USDT", "buy", "limit", 220_000, price, undefined, undefined, "GTC", false, market);
    expect(freeBalance(s, "usdt", market)).toBeLessThan(20);
    const res = executeFill(s, market, "HMC_USDT", "buy", price, 50_000, price * 50_000, "market");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/reserved|Insufficient/i);
  });

  it("resting limit fill excludes its own reservation", async () => {
    const { executeFill } = await import("./execution");
    const s = baseState({ wallet: { usdt: 100, hmc: 0, sup: 0, btc: 0 } });
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 100_000, 0.0004, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    if (!("id" in o)) return;
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.0004, 100_000, 40, "limit", false, false, o.id);
    expect(res.ok).toBe(true);
  });
});
