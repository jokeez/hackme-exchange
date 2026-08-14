import { describe, expect, it } from "vitest";
import { buildMarket, midForPair, tickerFromMarket } from "./market";
import { sampleMarket } from "./testFixtures";

describe("buildMarket", () => {
  it("derives mids from pool/work/sup inputs", () => {
    const m = buildMarket(
      { hashrate: 88e9, workers: 5, block_height: 155000, status: "ok" },
      { pool_hashrate_gh_s: 88, reward_per_m: 0.00021, workers_online: 5 },
      { economics: { total_minted_sup: 0.05, max_supply_sup: 21_000_000 } },
      0.00042,
      67_500,
    );
    expect(m.hmcUsdt).toBeGreaterThan(0);
    expect(m.supUsdt).toBeGreaterThan(0);
    expect(m.hmcSup).toBeCloseTo(m.hmcUsdt / m.supUsdt, 8);
    expect(m.hmcBtc).toBeCloseTo(m.hmcUsdt / 67_500, 12);
    expect(m.blockHeight).toBe(155000);
  });

  it("uses fallbacks when optional fields missing", () => {
    const m = buildMarket({}, {}, {}, 0.00042);
    expect(m.poolGh).toBeGreaterThan(0);
    expect(m.hmcUsdt).toBeGreaterThan(0);
  });
});

describe("midForPair / tickerFromMarket", () => {
  const m = sampleMarket();

  it("resolves each pair mid", () => {
    expect(midForPair(m, "HMC_USDT")).toBe(0.00043);
    expect(midForPair(m, "SUP_USDT")).toBe(0.000047);
    expect(midForPair(m, "HMC_SUP")).toBe(9.1);
    expect(midForPair(m, "HMC_BTC")).toBe(6.4e-9);
    expect(midForPair(m, "SUP_BTC")).toBe(7e-10);
  });

  it("builds ticker with bid < mid < ask", () => {
    const tk = tickerFromMarket(m, "HMC_USDT");
    expect(tk.pairId).toBe("HMC_USDT");
    expect(tk.bid).toBeLessThan(tk.mid);
    expect(tk.ask).toBeGreaterThan(tk.mid);
    expect(tk.spreadBps).toBeGreaterThanOrEqual(8);
    expect(tk.spreadBps).toBeLessThanOrEqual(36);
    expect(tk.source).toBe("live");
  });
});
