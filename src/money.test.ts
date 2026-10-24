import { describe, expect, it } from "vitest";
import {
  ceilToMinor,
  floorToMinor,
  fromMinor,
  minBaseForNotional,
  notionalMeetsMin,
  notionalMinor,
  pctOfBalance,
  pctOfBalancePercent,
  toMinor,
} from "./money";

describe("money minor units", () => {
  it("round-trips common quote dust without float shrinkage", () => {
    expect(toMinor(0.01)).toBe(1_000_000);
    expect(fromMinor(1_000_000)).toBe(0.01);
    expect(floorToMinor(0.01)).toBe(0.01);
    expect(pctOfBalance(0.01, 1)).toBe(0.01);
    expect(pctOfBalancePercent(0.01, 100)).toBe(0.01);
  });

  it("pct presets stay on minor grid (no 0.009999… dust)", () => {
    const avail = 0.01;
    expect(pctOfBalancePercent(avail, 25)).toBe(0.0025);
    expect(pctOfBalancePercent(avail, 50)).toBe(0.005);
    expect(pctOfBalancePercent(avail, 75)).toBe(0.0075);
    expect(pctOfBalancePercent(avail, 100)).toBe(0.01);
    // Classic float pitfall if done as avail * pct / 100 in IEEE:
    expect(String((avail * 100) / 100)).toBe("0.01");
    expect(pctOfBalance(1 / 3, 1)).toBe(floorToMinor(1 / 3));
  });

  it("minBaseForNotional ceils so notional ≥ min", () => {
    const min = 0.01;
    const price = 0.05;
    const base = minBaseForNotional(min, price);
    expect(base).toBe(0.2);
    expect(notionalMeetsMin(price, base, min)).toBe(true);
    expect(notionalMeetsMin(price, 0.1998, min)).toBe(false);
  });

  it("snap recovers 0.01 − ε so 100% is not dust under min", () => {
    const dusty = 0.01 - Number.EPSILON * 8;
    expect(pctOfBalance(dusty, 1)).toBe(0.01);
    expect(String(pctOfBalance(dusty, 1))).not.toMatch(/0\.00999/);
  });

  it("notionalMinor matches integer product path near min", () => {
    expect(notionalMinor(0.05, 0.2)).toBe(toMinor(0.01));
    expect(notionalMeetsMin(0.05, 0.1998, 0.01)).toBe(false);
    expect(ceilToMinor(0.01 / 0.05)).toBe(0.2);
  });
});
