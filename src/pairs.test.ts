import { describe, expect, it } from "vitest";
import { LANES, PAIRS, pairById, pairRegistry } from "./pairs";
import { allPairs, isValidPairId } from "./registry";

describe("pairs / registry consistency", () => {
  it("PAIRS mirrors registry length and ids", () => {
    const reg = allPairs();
    expect(PAIRS).toHaveLength(reg.length);
    expect(PAIRS.map((p) => p.id)).toEqual(reg.map((p) => p.id));
  });

  it("pairById returns meta without wallet helpers", () => {
    const meta = pairById("HMC_USDT");
    expect(meta.label).toContain("HMC");
    expect(meta.base).toBe("HMC");
    expect(meta.quote).toBe("USDT");
    expect(meta).not.toHaveProperty("midPrice");
  });

  it("pairRegistry exposes bookStepPreset", () => {
    expect(pairRegistry("HMC_BTC").bookStepPreset).toBe("btc");
    expect(pairRegistry("HMC_SUP").bookStepPreset).toBe("cross");
  });

  it("LANES cover primary/companion/cross/btc", () => {
    expect(LANES.map((l) => l.id)).toEqual(["primary", "companion", "cross", "btc"]);
  });

  it("isValidPairId guards", () => {
    expect(isValidPairId("HMC_USDT")).toBe(true);
    expect(isValidPairId("ETH_USDT")).toBe(false);
  });
});
