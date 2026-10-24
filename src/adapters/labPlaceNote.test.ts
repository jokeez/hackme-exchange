import { describe, expect, it } from "vitest";
import { fillStatsFromApi, labPlaceNote } from "./labMatching";
import type { ApiFill } from "./exchangeApi";

describe("labPlaceNote thin-book UX", () => {
  it("warns on market cancel with zero fills (not silent ok)", () => {
    const r = labPlaceNote("market", 0, 0, 100, "canceled");
    expect(r.liquidityWarn).toBe(true);
    expect(r.note.toLowerCase()).toMatch(/insufficient liquidity/);
  });

  it("marks partial market when book exhausted", () => {
    const r = labPlaceNote("market", 3, 49.08, 500, "canceled");
    expect(r.partialLiquidity).toBe(true);
    expect(r.note.toLowerCase()).toMatch(/partial fill/);
    expect(r.note).toMatch(/49/);
  });

  it("keeps full-fill note without liquidity warn", () => {
    const r = labPlaceNote("market", 1, 10, 10, "filled");
    expect(r.liquidityWarn).toBeFalsy();
    expect(r.partialLiquidity).toBeFalsy();
    expect(r.note).toMatch(/1 fill/);
  });
});

describe("fillStatsFromApi", () => {
  it("computes VWAP from minors", () => {
    const fills: ApiFill[] = [
      {
        id: "a",
        pair: "HMC/USDT",
        price: 7_000_000,
        qty: 100_000_000,
        quote: 7_000_000,
        taker_side: "buy",
        taker_account: "HMC-x",
        maker_account: "HMC-y",
      },
      {
        id: "b",
        pair: "HMC/USDT",
        price: 8_000_000,
        qty: 100_000_000,
        quote: 8_000_000,
        taker_side: "buy",
        taker_account: "HMC-x",
        maker_account: "HMC-y",
      },
    ];
    const s = fillStatsFromApi(fills);
    expect(s.filledBase).toBeCloseTo(2, 8);
    expect(s.vwap).toBeCloseTo(0.075, 8);
  });
});
