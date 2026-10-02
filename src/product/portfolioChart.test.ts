import { describe, expect, it } from "vitest";
import { chartEquitySeries, formatChartDeltaUsdt } from "./portfolioChart";

describe("portfolioChart honesty", () => {
  it("does not invent a decorative +0.3% ramp on flat balance", () => {
    const now = Date.now();
    const series = chartEquitySeries([{ ts: now, equityUsdt: 0.3 }], 0.3);
    expect(series).toHaveLength(2);
    expect(series[0]!.equityUsdt).toBeCloseTo(0.3, 8);
    expect(series[1]!.equityUsdt).toBeCloseTo(0.3, 8);
    const chgPct =
      series[0]!.equityUsdt > 0
        ? ((series[1]!.equityUsdt - series[0]!.equityUsdt) / series[0]!.equityUsdt) * 100
        : 0;
    expect(Math.abs(chgPct)).toBeLessThan(1e-9);
  });

  it("formatChartDeltaUsdt keeps micro PnL visible", () => {
    expect(formatChartDeltaUsdt(0.00045)).toMatch(/\+0\.00045/);
    expect(formatChartDeltaUsdt(0.00045)).toMatch(/USDT/);
    expect(formatChartDeltaUsdt(0)).toMatch(/\+0/);
  });
});
