import { describe, expect, it } from "vitest";
import {
  chartPriceFormatter,
  formatGh,
  formatNum,
  formatPct,
  formatPrice,
  formatPriceCompact,
  formatRewardPerM,
  formatVol,
  formatVolBase,
} from "./format";

describe("formatPrice", () => {
  it("returns dash for non-finite / non-positive", () => {
    expect(formatPrice(NaN)).toBe("—");
    expect(formatPrice(Infinity)).toBe("—");
    expect(formatPrice(0)).toBe("—");
    expect(formatPrice(-1)).toBe("—");
  });

  it("uses fewer decimals for large prices", () => {
    expect(formatPrice(1234.5678)).toBe("1234.57");
    expect(formatPrice(1.23456)).toBe("1.2346");
  });

  it("shows more decimals for micro prices", () => {
    expect(formatPrice(0.05)).toBe("0.050000");
    expect(formatPrice(0.050051)).toBe("0.050051");
    expect(formatPrice(0.01)).toBe("0.010000");
    expect(formatPrice(0.00043)).toMatch(/^0\.00043/);
    expect(formatPrice(6.4e-9).length).toBeGreaterThan(8);
  });

  it("formatPriceCompact keeps min tick depth on reference mids", () => {
    expect(formatPriceCompact(0.05)).toBe("0.05000");
    expect(formatPriceCompact(0.01)).toBe("0.01000");
  });

  it("formatPriceCompact keeps market rows shorter than full precision", () => {
    expect(formatPriceCompact(0.0000627524).length).toBeLessThanOrEqual(formatPrice(0.0000627524).length);
    expect(formatPriceCompact(0.00052669)).toMatch(/^0\.000/);
    expect(formatPriceCompact(8.3931)).toBe("8.3931");
    expect(formatPriceCompact(0)).toBe("—");
  });

  it("formatPriceCompact uses subscript zeros for BTC-scale mids (no e-notation)", () => {
    const hmcBtc = formatPriceCompact(8.3483e-9);
    const supBtc = formatPriceCompact(9.9466e-10);
    expect(hmcBtc.startsWith("0.0")).toBe(true);
    expect(supBtc.startsWith("0.0")).toBe(true);
    expect(/[\u2080-\u2089]/.test(hmcBtc)).toBe(true);
    expect(/[\u2080-\u2089]/.test(supBtc)).toBe(true);
    expect(hmcBtc).not.toMatch(/e/i);
    expect(supBtc).not.toMatch(/e/i);
    expect(hmcBtc.length).toBeLessThan(14);
    expect(supBtc.length).toBeLessThan(14);
  });

  it("never uses scientific notation for chart formatter", () => {
    const s = chartPriceFormatter(6.4123e-9);
    expect(s).not.toMatch(/e/i);
    expect(s).not.toBe("—");
  });
});

describe("formatNum / formatPct", () => {
  it("formats numbers with locale separators", () => {
    expect(formatNum(1234.5, 1)).toContain("1");
    expect(formatNum(NaN)).toBe("—");
  });

  it("adds + for positive pct", () => {
    expect(formatPct(1.5)).toBe("+1.50%");
    expect(formatPct(-2)).toBe("-2.00%");
    expect(formatPct(NaN)).toBe("—");
  });
});

describe("formatVol / formatVolBase / formatGh / formatRewardPerM", () => {
  it("scales volumes with K/M", () => {
    expect(formatVol(0)).toBe("0");
    expect(formatVol(500)).toBe("500");
    expect(formatVol(12_500)).toMatch(/K$/);
    expect(formatVol(2_500_000)).toMatch(/M$/);
  });

  it("appends base asset to vol", () => {
    expect(formatVolBase(0, "HMC")).toBe("0 HMC");
    expect(formatVolBase(2500, "HMC")).toMatch(/HMC$/);
    expect(formatVolBase(3_000_000, "SUP")).toMatch(/M SUP$/);
  });

  it("formats hashrate GH/TH", () => {
    expect(formatGh(12.5)).toMatch(/GH\/s$/);
    expect(formatGh(2500)).toMatch(/TH\/s$/);
    expect(formatGh(NaN)).toBe("—");
  });

  it("formats reward per M with adaptive precision", () => {
    expect(formatRewardPerM(0)).toBe("—");
    expect(formatRewardPerM(0.00021)).toMatch(/^0\.00021/);
    expect(formatRewardPerM(5e-8).length).toBeGreaterThan(5);
  });
});
