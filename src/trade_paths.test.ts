import { describe, expect, it } from "vitest";
import { assertOrderFunds, maxBuyBaseAmount } from "./balance";
import { convert } from "./convert";
import { calcFee, previewFeeRole } from "./fees";
import { placeOrder, placeOco } from "./orders";
import { baseState, sampleMarket } from "./testFixtures";

/**
 * Max coverage of paper buy/sell paths + fee consistency (prod-readiness gate).
 * Lab HTTP paths are covered by scripts/lab-smoke.ts separately.
 */
describe("trade paths + fees", () => {
  const market = sampleMarket();

  it("limit buy/sell with fee-aware sizing", () => {
    const s = baseState({
      wallet: { usdt: 500, hmc: 50_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = market.hmcUsdt;
    const buyAmt = maxBuyBaseAmount(s, market, "HMC_USDT", price, "limit", 0.5);
    const buy = placeOrder(s, "HMC_USDT", "buy", "limit", buyAmt, price, undefined, undefined, "GTC", false, market);
    expect("id" in buy).toBe(true);
    const sell = placeOrder(s, "HMC_USDT", "sell", "limit", 1000, price * 1.05, undefined, undefined, "GTC", false, market);
    expect("id" in sell).toBe(true);
  });

  it("limit buy at 100% sized amount succeeds", () => {
    const s = baseState({
      wallet: { usdt: 80, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const price = 0.00042;
    const amt = maxBuyBaseAmount(s, market, "HMC_USDT", price, "limit", 1);
    expect(assertOrderFunds(s, market, "HMC_USDT", "buy", amt, price, "limit").ok).toBe(true);
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", amt, price, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
  });

  it("stop_limit + oco place without funds errors when sized", () => {
    const s = baseState({ wallet: { usdt: 1000, hmc: 10_000, sup: 0, btc: 0 } });
    const stop = placeOrder(s, "HMC_USDT", "sell", "stop_limit", 500, 0.00048, 0.0005, undefined, "GTC", false, market);
    expect("id" in stop).toBe(true);
    const oco = placeOco(s, "HMC_USDT", "sell", 400, 0.00055, 0.0004, 0.00039, market);
    expect("tp" in oco).toBe(true);
  });

  it("convert path charges fee (proceeds ≤ raw mid)", () => {
    const s = baseState({
      wallet: { usdt: 100, hmc: 10_000, sup: 1000, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    const before = s.wallet.usdt;
    const res = convert(s, market, "HMC_USDT", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(s.wallet.usdt).toBeGreaterThan(before);
      const raw = 1000 * market.hmcUsdt;
      expect(s.wallet.usdt - before).toBeLessThanOrEqual(raw + 1e-9);
      expect(res.fee.feeQuote).toBeGreaterThan(0);
    }
  });

  it("previewFeeRole matches calcFee role for market vs limit", () => {
    const s = baseState();
    const q = 10;
    const mFee = calcFee(s, market, "HMC_USDT", q, previewFeeRole("market"));
    const lFee = calcFee(s, market, "HMC_USDT", q, previewFeeRole("limit"));
    expect(mFee.role).toBe("taker");
    expect(lFee.role).toBe("maker");
    expect(mFee.bps).toBeGreaterThanOrEqual(lFee.bps);
  });
});
