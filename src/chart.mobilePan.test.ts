import { describe, expect, it } from "vitest";
import { priceGutterPanLogicalDelta, shiftLogicalRangeByPx } from "./chart";

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
});
