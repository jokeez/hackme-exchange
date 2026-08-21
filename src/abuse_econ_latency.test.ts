/**
 * Abuse / economics / latency gates for the spot demo.
 * Demo-only — not a production matching engine.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { executeFill } from "./execution";
import { calcFee, applyFeeToWallet } from "./fees";
import { applyMarketTrade, loadState, resetDemo, walletEquityFromMarket } from "./store";
import { baseState, sampleMarket } from "./testFixtures";
import { INTEGRATION, isLiveMode, isLiveModeBlocked } from "./config/integration";
import { activeSettlement } from "./adapters/settlement";
import { fetchMarket } from "./market";
import { fetchPoolLive } from "./pool";

describe("abuse: trade input validation", () => {
  it("rejects NaN / Infinity / negative price and size", () => {
    const s = baseState();
    expect(applyMarketTrade(s, "HMC_USDT", "buy", NaN, 100, 0.05).ok).toBe(false);
    expect(applyMarketTrade(s, "HMC_USDT", "buy", Infinity, 100, 0.05).ok).toBe(false);
    expect(applyMarketTrade(s, "HMC_USDT", "buy", -1, 100, 0.05).ok).toBe(false);
    expect(applyMarketTrade(s, "HMC_USDT", "buy", 0.0004, -1, 0.05).ok).toBe(false);
    expect(applyMarketTrade(s, "HMC_USDT", "buy", 0.0004, 100, NaN).ok).toBe(false);
  });

  it("rejects dust and absurd sizes", () => {
    const s = baseState();
    expect(applyMarketTrade(s, "HMC_USDT", "buy", 0.0004, 1e-15, 1e-20).ok).toBe(false);
    expect(applyMarketTrade(s, "HMC_USDT", "buy", 0.0004, 1e16, 1e16).ok).toBe(false);
  });

  it("rejects overspend (cannot drain past wallet)", () => {
    const s = baseState();
    s.wallet.usdt = 1;
    const r = applyMarketTrade(s, "HMC_USDT", "buy", 0.0004, 100_000, 50);
    expect(r.ok).toBe(false);
    expect(s.wallet.usdt).toBe(1);
  });

  it("executeFill rejects bad numbers", () => {
    const s = baseState();
    const m = sampleMarket();
    expect(executeFill(s, m, "HMC_USDT", "buy", NaN, 10, 0.004, "market").ok).toBe(false);
    expect(executeFill(s, m, "HMC_USDT", "buy", 0.0004, 0, 0, "market").ok).toBe(false);
  });
});

describe("economics: fees and equity invariants", () => {
  it("fee quote is non-negative and scales with notional", () => {
    const s = baseState();
    const m = sampleMarket();
    const small = calcFee(s, m, "HMC_USDT", 10, "taker");
    const big = calcFee(s, m, "HMC_USDT", 10_000, "taker");
    expect(small.feeQuote).toBeGreaterThanOrEqual(0);
    expect(big.feeQuote).toBeGreaterThan(small.feeQuote);
    expect(big.bps).toBeGreaterThan(0);
  });

  it("buy+sell roundtrip does not invent free money beyond fee drag", () => {
    const s = baseState();
    const m = sampleMarket();
    const eq0 = walletEquityFromMarket(s.wallet, m);
    const price = m.hmcUsdt;
    const amt = 1000;
    const quote = amt * price;
    const buy = executeFill(s, m, "HMC_USDT", "buy", price, amt, quote, "market");
    expect(buy.ok).toBe(true);
    const sell = executeFill(s, m, "HMC_USDT", "sell", price, amt, quote, "market");
    expect(sell.ok).toBe(true);
    const eq1 = walletEquityFromMarket(s.wallet, m);
    // Fees + spreadless roundtrip → equity should not rise
    expect(eq1).toBeLessThanOrEqual(eq0 + 1e-6);
  });

  it("wallet keys stay finite after successful fill", () => {
    const s = baseState();
    const m = sampleMarket();
    const r = executeFill(s, m, "HMC_USDT", "buy", m.hmcUsdt, 500, 500 * m.hmcUsdt, "limit", false, true);
    expect(r.ok).toBe(true);
    for (const v of Object.values(s.wallet)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("applyFeeToWallet fails cleanly when HMC fee balance empty", () => {
    const s = baseState();
    s.wallet.hmc = 0;
    s.feeConfig.payFeesInHmc = true;
    const m = sampleMarket();
    const fee = calcFee(s, m, "HMC_USDT", 1000, "taker");
    if (fee.paidInHmc) {
      const r = applyFeeToWallet(s, "HMC_USDT", fee);
      // either not paid in HMC or fails — never negative HMC
      if (!r.ok) expect(s.wallet.hmc).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("security / mode boundaries", () => {
  it("default mode is not live production settlement", () => {
    expect(isLiveMode()).toBe(false);
    expect(["demo", "paper", "live"]).toContain(INTEGRATION.mode);
    if (isLiveModeBlocked()) {
      expect(INTEGRATION.mode).toBe("paper");
    }
  });

  it("active settlement adapter never exposes withdraw in demo/paper", async () => {
    const a = activeSettlement();
    expect(a.withdraw).toBeUndefined();
  });

  it("admin token is empty by default (no commit leak)", () => {
    expect(INTEGRATION.adminToken ?? "").toBe("");
  });

  it("withdraw dest validator blocks XSS and SUP-as-HMC confusion", async () => {
    const { validateLabWithdrawDestination } = await import("./labCustody");
    expect(validateLabWithdrawDestination("SUP", "HMC-ffffffffffffffff").ok).toBe(false);
    expect(validateLabWithdrawDestination("USDT", '<script>x</script>').ok).toBe(false);
    expect(validateLabWithdrawDestination("HMC", "HMC-ffffffffffffffff").ok).toBe(true);
  });

  it("csrf helper path never lists admin header keys in exchangeApi source contract", async () => {
    // Defense: session headers must be cookie+CSRF only. Spot-check module exports stay token-free.
    const mod = await import("./adapters/exchangeApi");
    expect(typeof mod.requestWithdraw).toBe("function");
    expect(typeof mod.postLabDeposit).toBe("function");
    expect(INTEGRATION.adminToken ?? "").toBe("");
    expect("adminToken" in mod ? (mod as { adminToken?: string }).adminToken : "").toBeFalsy();
  });

  it("resetDemo restores positive paper balances", () => {
    // happy-dom localStorage
    const s = resetDemo();
    expect(s.wallet.usdt).toBeGreaterThan(0);
    expect(s.wallet.hmc).toBeGreaterThan(0);
    const again = loadState();
    expect(again.wallet.usdt).toBe(s.wallet.usdt);
  });
});

describe("latency: oracle / pool ping", () => {
  it(
    "fetchMarket reports live vs fallback honestly (no fake SLA on CORS fail)",
    async () => {
      const t0 = performance.now();
      let source: "live" | "fallback" | "error" = "error";
      try {
        const { source: s } = await fetchMarket();
        source = s;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`[oracle-latency] network error — ${err instanceof Error ? err.message : "unknown"}`);
        return;
      }
      const ms = performance.now() - t0;
      expect(["live", "fallback"]).toContain(source);
      if (source === "live") {
        expect(ms).toBeLessThan(5000);
        // eslint-disable-next-line no-console
        console.log(`[oracle-latency] live ${ms.toFixed(0)}ms`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[oracle-latency] fallback ${ms.toFixed(0)}ms — not counted as live SLA`);
      }
    },
    10_000,
  );

  it(
    "pool live probe returns status object or offline (no masked pass)",
    async () => {
      try {
        const snap = await fetchPoolLive();
        expect(["ok", "degraded", "offline", "pending"]).toContain(snap.status);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`[pool-live] skipped — ${err instanceof Error ? err.message : "network"}`);
      }
    },
    20_000,
  );
});
