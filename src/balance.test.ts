import { describe, expect, it } from "vitest";
import { assertOrderFunds, freeBalance, maxBuyBaseAmount, reservedBalances } from "./balance";
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
    expect(amt).toBe(Math.floor(40 / price));
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
