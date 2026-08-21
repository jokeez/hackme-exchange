import { describe, expect, it } from "vitest";
import { allPairs, getPair, midForPairId, walletKeyForPair } from "./registry";
import { sampleMarket } from "./testFixtures";

const market = sampleMarket();

describe("registry", () => {
  it("lists all pairs", () => {
    expect(allPairs().length).toBe(5);
    expect(allPairs().map((p) => p.id)).toContain("HMC_USDT");
  });

  it("resolves mid prices from oracle snapshot", () => {
    expect(midForPairId(market, "HMC_USDT")).toBe(0.05);
    expect(midForPairId(market, "HMC_BTC")).toBeCloseTo(market.hmcBtc, 14);
  });

  it("maps wallet keys per pair leg", () => {
    expect(walletKeyForPair("HMC_USDT", "base")).toBe("hmc");
    expect(walletKeyForPair("HMC_USDT", "quote")).toBe("usdt");
    expect(walletKeyForPair("SUP_BTC", "quote")).toBe("btc");
  });

  it("falls back to first pair for unknown id", () => {
    expect(getPair("HMC_USDT" as const).base).toBe("HMC");
  });
});
