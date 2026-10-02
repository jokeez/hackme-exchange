import { describe, expect, it } from "vitest";
import { priceGutterPanLogicalDelta, shiftLogicalRangeByPx, shiftPriceRangeByPx } from "./chart";

describe("mobile price gutter pan", () => {
  it("maps px drag to logical bar delta", () => {
    expect(priceGutterPanLogicalDelta(80, 8)).toBe(10);
    expect(priceGutterPanLogicalDelta(-40, 8)).toBe(-5);
    expect(priceGutterPanLogicalDelta(10, 0)).toBe(10);
  });

  it("shifts visible logical range with finger drag", () => {
    const start = { from: 100, to: 200 };
    expect(shiftLogicalRangeByPx(start, 80, 8)).toEqual({ from: 90, to: 190 });
    expect(shiftLogicalRangeByPx(start, -80, 8)).toEqual({ from: 110, to: 210 });
  });

  it("shiftPriceRangeByPx moves window with vertical drag", () => {
    const base = { from: 100, to: 200 };
    // Content follows finger: drag up → lower prices; drag down → higher prices.
    const up = shiftPriceRangeByPx(base, -50, 400);
    expect(up.from).toBeLessThan(base.from);
    expect(up.from).toBeCloseTo(100 - (50 / 400) * 100, 8);
    const down = shiftPriceRangeByPx(base, 50, 400);
    expect(down.from).toBeGreaterThan(base.from);
    expect(down.from).toBeCloseTo(100 + (50 / 400) * 100, 8);
  });

  it("freePan clamp preserves translated mid (no spring back to ref)", async () => {
    const { clampVisiblePriceRange } = await import("./chart");
    const ref = 0.05;
    // mid 0.12 is outside soft-pull (±100% of ref) but inside freePan hard bounds
    const shifted = { from: 0.11, to: 0.13 };
    const free = clampVisiblePriceRange(shifted, ref, 400, { manual: true, freePan: true });
    expect(free.from).toBeCloseTo(0.11, 8);
    expect(free.to).toBeCloseTo(0.13, 8);
    const sprung = clampVisiblePriceRange(shifted, ref, 400, { manual: true });
    expect(sprung.from).toBeCloseTo(0.09, 8); // mid pulled to ref*2=0.1, span 0.02
    expect(sprung.to).toBeCloseTo(0.11, 8);
  });
});
