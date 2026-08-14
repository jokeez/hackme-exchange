import { describe, expect, it } from "vitest";
import {
  clampTickMid,
  clipBarWicks,
  logicalRangeToIndices,
  robustPriceRange,
  sanitizeCandleExtremes,
} from "./chartScale";
import type { Candle } from "./types";

function bar(t: number, o: number, h: number, l: number, c: number): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: 100 };
}

describe("clampTickMid", () => {
  it("caps runaway oracle jumps", () => {
    expect(clampTickMid(0.001, 0.0004, 0.18)).toBeCloseTo(0.0004 * 1.18, 10);
    expect(clampTickMid(0.0001, 0.0004, 0.18)).toBeCloseTo(0.0004 * 0.82, 10);
    expect(clampTickMid(0.00041, 0.0004, 0.18)).toBeCloseTo(0.00041, 10);
    // Default jump allowance covers post-idle catch-up (~26%)
    expect(clampTickMid(0.00063, 0.0005)).toBeCloseTo(0.00063, 10);
  });
});

describe("clipBarWicks / sanitizeCandleExtremes", () => {
  it("clips a mile-long wick toward the body", () => {
    const spiked = clipBarWicks(bar(1, 0.0004, 0.0004, 0.000001, 0.0004));
    expect(spiked.low).toBeGreaterThan(0.000001);
    expect(spiked.low).toBeLessThan(0.0004);
    expect(spiked.high).toBeGreaterThanOrEqual(0.0004);
  });

  it("removes series-squashing spike so robust range stays tight", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      const px = 0.0004 + i * 1e-7;
      candles.push(bar(1_700_000_000 + i * 60, px, px * 1.001, px * 0.999, px));
    }
    // Corrupt print: low near zero
    candles[20] = bar(candles[20]!.time, 0.00041, 0.00042, 1e-12, 0.00041);
    const cleaned = sanitizeCandleExtremes(candles);
    const lows = cleaned.map((c) => c.low);
    expect(Math.min(...lows)).toBeGreaterThan(0.0002);

    const range = robustPriceRange(cleaned, 0, cleaned.length - 1)!;
    const span = range.maxValue - range.minValue;
    const mid = (range.maxValue + range.minValue) / 2;
    // Visible span should stay in the same order of magnitude as price (~few %)
    expect(span / mid).toBeLessThan(0.25);
  });
});

describe("robustPriceRange", () => {
  it("ignores percentile outliers", () => {
    const candles = Array.from({ length: 50 }, (_, i) => {
      const px = 100 + Math.sin(i / 5);
      return bar(i, px, px + 0.5, px - 0.5, px);
    });
    candles[10] = bar(10, 100, 10_000, 0.01, 100);
    const range = robustPriceRange(candles)!;
    expect(range.maxValue).toBeLessThan(200);
    expect(range.minValue).toBeGreaterThan(50);
  });
});

describe("logicalRangeToIndices", () => {
  it("clamps to series bounds", () => {
    expect(logicalRangeToIndices(-5, 100, 40)).toEqual({ fromIdx: 0, toIdx: 39 });
    expect(logicalRangeToIndices(2.2, 8.7, 40)).toEqual({ fromIdx: 2, toIdx: 9 });
  });
});
