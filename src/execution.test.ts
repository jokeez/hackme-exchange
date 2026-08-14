import { describe, expect, it } from "vitest";
import { executeFill } from "./execution";
import { baseState, sampleMarket } from "./testFixtures";

describe("executeFill", () => {
  const market = sampleMarket();

  it("rejects non-positive amount", () => {
    const s = baseState();
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.00043, 0, 0, "market");
    expect(res.ok).toBe(false);
  });

  it("records a single trade with fee metadata", () => {
    const s = baseState();
    const beforeTrades = s.trades.length;
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.00043, 1000, 0.43, "market");
    expect(res.ok).toBe(true);
    expect(s.trades.length).toBe(beforeTrades + 1);
    expect(s.trades[0].feeQuote).toBeGreaterThan(0);
    expect(s.trades[0].feeRole).toBe("taker");
    expect(s.ledger.some((e) => e.kind === "trade")).toBe(true);
    expect(s.ledger.some((e) => e.kind === "fee")).toBe(true);
  });

  it("fails when quote balance insufficient", () => {
    const s = baseState({ wallet: { usdt: 0.01, hmc: 0, sup: 0, btc: 0 } });
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.00043, 100_000, 43, "market");
    expect(res.ok).toBe(false);
  });

  it("fails sell without base", () => {
    const s = baseState({ wallet: { usdt: 1000, hmc: 0, sup: 0, btc: 0 } });
    const res = executeFill(s, market, "HMC_USDT", "sell", 0.00043, 100, 0.043, "market");
    expect(res.ok).toBe(false);
  });

  it("rolls back wallet when HMC fee fails after trade (sell)", () => {
    const s = baseState({ wallet: { usdt: 0, hmc: 1000, sup: 0, btc: 0 } });
    s.feeConfig.payFeesInHmc = true;
    const walletBefore = { ...s.wallet };
    const tradesBefore = s.trades.length;
    const res = executeFill(s, market, "HMC_USDT", "sell", 0.00043, 1000, 0.43, "market");
    expect(res.ok).toBe(false);
    expect(s.wallet).toEqual(walletBefore);
    expect(s.trades.length).toBe(tradesBefore);
  });

  it("rolls back wallet when HMC fee fails after buy (non-HMC pair)", () => {
    const s = baseState({ wallet: { usdt: 1000, hmc: 0, sup: 0, btc: 0 } });
    s.feeConfig.payFeesInHmc = true;
    const walletBefore = { ...s.wallet };
    const tradesBefore = s.trades.length;
    const res = executeFill(s, market, "SUP_USDT", "buy", market.supUsdt, 100, 100 * market.supUsdt, "market");
    expect(res.ok).toBe(false);
    expect(s.wallet).toEqual(walletBefore);
    expect(s.trades.length).toBe(tradesBefore);
  });

  it("HMC fee payment path still fills", () => {
    const s = baseState();
    s.feeConfig.payFeesInHmc = true;
    const hmcBefore = s.wallet.hmc;
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.00043, 1000, 0.43, "limit", false, false);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.fee.paidInHmc).toBe(true);
      expect(s.wallet.hmc).toBeLessThan(hmcBefore + 1000); // +base - feeHmc
      expect(s.trades[0].feeHmc).toBeGreaterThan(0);
      expect(s.trades[0].feeHmc).toBeCloseTo(res.fee.feeHmc, 8);
    }
  });

  it("fills at trade history cap without wiping history", () => {
    const s = baseState();
    s.trades = Array.from({ length: 200 }, (_, i) => ({
      id: `old-${i}`,
      pairId: "HMC_USDT" as const,
      side: "buy" as const,
      price: 0.0004,
      amountBase: 1,
      amountQuote: 0.0004,
      feeQuote: 0,
      feeHmc: 0,
      feeRole: "taker" as const,
      feePaidInHmc: false,
      ts: i,
    }));
    const walletUsdt = s.wallet.usdt;
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.00043, 1000, 0.43, "market");
    expect(res.ok).toBe(true);
    expect(s.trades.length).toBe(200);
    expect(s.trades[0].id).not.toMatch(/^old-/);
    expect(s.trades.some((t) => t.id === "old-199")).toBe(false); // oldest dropped
    expect(s.wallet.usdt).toBeLessThan(walletUsdt);
  });
});
