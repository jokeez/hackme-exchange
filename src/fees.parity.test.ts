/**
 * Fee schedule parity — SPA VIP_TIERS must match API internal/fees (ECONOMICS).
 */
import { describe, expect, it } from "vitest";
import { VIP_TIERS } from "./fees";

/** Canonical API schedule (hackme-exchange-api/internal/fees/fees.go). */
const API_TIERS = [
  { name: "VIP3", makerBps: 2, takerBps: 4, minVolUsdt: 10_000_000 },
  { name: "VIP2", makerBps: 4, takerBps: 6, minVolUsdt: 1_000_000 },
  { name: "VIP1", makerBps: 6, takerBps: 8, minVolUsdt: 100_000 },
  { name: "Regular", makerBps: 8, takerBps: 10, minVolUsdt: 0 },
] as const;

describe("Matching GO fee parity", () => {
  it("VIP tiers match API Regular/VIP1/2/3 bps + volume floors", () => {
    const spa = [...VIP_TIERS].sort((a, b) => b.minVolUsdt - a.minVolUsdt);
    expect(spa).toHaveLength(API_TIERS.length);
    for (let i = 0; i < API_TIERS.length; i++) {
      const a = API_TIERS[i]!;
      const s = spa[i]!;
      expect(s.makerBps).toBe(a.makerBps);
      expect(s.takerBps).toBe(a.takerBps);
      expect(s.minVolUsdt).toBe(a.minVolUsdt);
    }
  });
});
