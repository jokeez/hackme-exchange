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
import { calcFee } from "./fees";
import { notionalMeetsMin } from "./money";
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
    const naive = freeBalance(s, "hmc", m);
    expect(assertOrderFunds(s, m, "HMC_USDT", "sell", naive, price, "market").ok).toBe(false);
    const amt = maxSellBaseAmount(s, m, "HMC_USDT", price, "market", 1, m.hmcUsdt);
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThan(naive);
    expect(assertOrderFunds(s, m, "HMC_USDT", "sell", amt, price, "market").ok).toBe(true);
  });

  it("sell 100% of 1 HMC with payFeesInHmc still sizes (fractional, not floor→0)", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const s = baseState({
      wallet: { usdt: 50, hmc: 1, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const price = 0.2003;
    expect(freeBalance(s, "hmc", m)).toBe(1);
    // Whole-unit floor would return 0 and toast "Avbl 0 HMC" while chip shows 1.
    const amt = maxSellBaseAmount(s, m, "HMC_SUP", price, "limit", 1, price);
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThan(1);
    expect(assertOrderFunds(s, m, "HMC_SUP", "sell", amt, price, "limit").ok).toBe(true);
  });

  it("buy 100% of ~0.199 SUP sizes fractionally (not floor→0)", () => {
    const m = sampleMarket({ hmcUsdt: 0.05, supUsdt: 0.05 });
    const s = baseState({
      wallet: { usdt: 0, hmc: 0, sup: 0.199, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = 0.2003;
    expect(freeBalance(s, "sup", m)).toBeCloseTo(0.199, 6);
    // Whole-unit floor(0.199/0.2003)=0 while Avbl chip shows 0.199 SUP.
    const amt = maxBuyBaseAmount(s, m, "HMC_SUP", price, "market", 1, price);
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThan(1);
    expect(assertOrderFunds(s, m, "HMC_SUP", "buy", amt, price, "market").ok).toBe(true);
  });

  it("buy 100% of dust USDT still passes at slip-padded ask", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const s = baseState({
      wallet: { usdt: 0.0495, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const ask = 0.051;
    const slip = ask * 1.02;
    const amt = maxBuyBaseAmount(s, m, "HMC_USDT", slip, "market", 1, ask);
    expect(amt).toBeGreaterThan(0);
    expect(assertOrderFunds(s, m, "HMC_USDT", "buy", amt, slip, "market", true).ok).toBe(true);
    // Best-ask-only size would overshoot once fee+slip apply.
    const naive = maxBuyBaseAmount(s, m, "HMC_USDT", ask, "market", 1, ask);
    expect(assertOrderFunds(s, m, "HMC_USDT", "buy", naive, slip, "market", true).ok).toBe(false);
  });

  it("buy with payFeesInHmc and 0 HMC sizes via quote-fee fallback (assert still blocks HMC path)", () => {
    const m = sampleMarket({ hmcUsdt: 0.05, supUsdt: 0.05 });
    const s = baseState({
      wallet: { usdt: 0, hmc: 0, sup: 0.199, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const price = 0.2003;
    const minN = 0.01;
    // % sizing must not collapse to 0 — quote fees cover when HMC Avbl is 0.
    const amt = maxBuyBaseAmount(s, m, "HMC_SUP", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    expect(amt).toBeGreaterThan(0.01);
    expect(notionalMeetsMin(price, amt, minN)).toBe(true);
    expect(
      assertOrderFunds(s, m, "HMC_SUP", "buy", amt, price, "market", true, undefined, undefined, {
        honorPayFeesInHmc: false,
      }).ok,
    ).toBe(true);
    // Strict HMC fee path still rejects (toggle on, no free HMC).
    const probe = assertOrderFunds(s, m, "HMC_SUP", "buy", 0.5, price, "market");
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.reason).toMatch(/HMC for fee/i);
    const probeFee = calcFee(s, m, "HMC_SUP", price * 0.5, "taker");
    expect(probeFee.feeHmc).toBeGreaterThan(0);
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

  it("buy 100% at exactly min notional with fees returns 0 (clear below-min path)", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const minN = 0.01;
    const s = baseState({
      wallet: { usdt: minN, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = 0.05;
    // Fee-safe 100% of exactly-min leaves dust under min — must not return a float-dust size.
    const amt = maxBuyBaseAmount(s, m, "HMC_USDT", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    expect(amt).toBe(0);
  });

  it("buy 100% just below min notional returns 0", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const minN = 0.01;
    const s = baseState({
      wallet: { usdt: 0.009999, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const amt = maxBuyBaseAmount(s, m, "HMC_USDT", 0.05, "market", 1, 0.05, {
      minNotionalQuote: minN,
      notionalPrice: 0.05,
    });
    expect(amt).toBe(0);
  });

  it("buy 100% just above min notional with fees sizes ≥ min", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const minN = 0.01;
    const s = baseState({
      wallet: { usdt: 0.0105, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = 0.05;
    const amt = maxBuyBaseAmount(s, m, "HMC_USDT", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    expect(amt).toBeGreaterThan(0);
    expect(notionalMeetsMin(price, amt, minN)).toBe(true);
    expect(assertOrderFunds(s, m, "HMC_USDT", "buy", amt, price, "market").ok).toBe(true);
  });

  it("buy 100% at exactly min with payFeesInHmc meets min when HMC covers fee", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const minN = 0.01;
    const s = baseState({
      wallet: { usdt: minN, hmc: 1_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const price = 0.05;
    const amt = maxBuyBaseAmount(s, m, "HMC_USDT", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    expect(amt).toBeGreaterThan(0);
    expect(notionalMeetsMin(price, amt, minN)).toBe(true);
    expect(assertOrderFunds(s, m, "HMC_USDT", "buy", amt, price, "market").ok).toBe(true);
  });

  it("sell 100% just below min notional returns 0", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const minN = 0.01;
    const price = 0.05;
    const s = baseState({
      wallet: { usdt: 0, hmc: 0.19, sup: 0, btc: 0 }, // 0.19 * 0.05 = 0.0095 < 0.01
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const amt = maxSellBaseAmount(s, m, "HMC_USDT", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    expect(amt).toBe(0);
  });

  it("sell 100% at exactly min notional sizes full free base", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const minN = 0.01;
    const price = 0.05;
    const s = baseState({
      wallet: { usdt: 0, hmc: 0.2, sup: 0, btc: 0 }, // 0.2 * 0.05 = 0.01
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const amt = maxSellBaseAmount(s, m, "HMC_USDT", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    expect(amt).toBe(0.2);
    expect(notionalMeetsMin(price, amt, minN)).toBe(true);
  });

  it("sell 100% with payFeesInHmc at min falls back to quote fees (full base)", () => {
    const m = sampleMarket({ hmcUsdt: 0.05 });
    const minN = 0.01;
    const price = 0.05;
    const s = baseState({
      wallet: { usdt: 0, hmc: 0.2, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const amt = maxSellBaseAmount(s, m, "HMC_USDT", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    // HMC fee-pay would haircut under min; quote-fee fallback keeps full 0.2 at exact min.
    expect(amt).toBe(0.2);
    expect(notionalMeetsMin(price, amt, minN)).toBe(true);
    expect(
      assertOrderFunds(s, m, "HMC_USDT", "sell", amt, price, "market", true, undefined, undefined, {
        honorPayFeesInHmc: false,
      }).ok,
    ).toBe(true);
    // Strict HMC path still needs leftover — full 0.2 fails.
    expect(assertOrderFunds(s, m, "HMC_USDT", "sell", 0.2, price, "market").ok).toBe(false);
    const sFat = baseState({
      wallet: { usdt: 0, hmc: 0.25, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const fat = maxSellBaseAmount(sFat, m, "HMC_USDT", price, "market", 1, price, {
      minNotionalQuote: minN,
      notionalPrice: price,
    });
    expect(fat).toBeGreaterThan(0);
    expect(notionalMeetsMin(price, fat, minN)).toBe(true);
    expect(assertOrderFunds(sFat, m, "HMC_USDT", "sell", fat, price, "market").ok).toBe(true);
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
