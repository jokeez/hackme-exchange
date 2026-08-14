import { describe, expect, it } from "vitest";
import { allPairs, getPair, midForPairId, walletKeyForPair } from "./registry";

const market = {
  hmcUsdt: 0.00043,
  supUsdt: 0.000047,
  hmcSup: 9.1,
  hmcBtc: 6.4e-9,
  supBtc: 7e-10,
  poolGh: 88,
  rewardPerM: 0.00021,
  workers: 5,
  supMinted: 0.05,
  supMax: 21_000_000,
  blockHeight: 155000,
  btcUsd: 67_500,
  targetMod: 1,
  totalPayoutHmc: 1000,
};

describe("registry", () => {
  it("lists all pairs", () => {
    expect(allPairs().length).toBe(5);
    expect(allPairs().map((p) => p.id)).toContain("HMC_USDT");
  });

  it("resolves mid prices from oracle snapshot", () => {
    expect(midForPairId(market, "HMC_USDT")).toBe(0.00043);
    expect(midForPairId(market, "HMC_BTC")).toBe(6.4e-9);
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
