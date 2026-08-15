import { describe, expect, it } from "vitest";
import {
  clampTickMid,
  clipBarWicks,
  isPriceDiscontinuity,
  logicalRangeToIndices,
  maxJumpFracForTf,
  robustPriceRange,
  sanitizeCandleExtremes,
} from "./chartScale";
import { seedCandles, upsertTick } from "./candles";
import type { Candle } from "./types";

function bar(t: number, o: number, h: number, l: number, c: number): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: 100 };
}

describe("maxJumpFracForTf", () => {
  it("keeps short TFs tight and daily wider", () => {
    expect(maxJumpFracForTf("1m")).toBeLessThanOrEqual(0.02);
    expect(maxJumpFracForTf("15m")).toBeLessThanOrEqual(0.06);
    expect(maxJumpFracForTf("1D")).toBeGreaterThan(maxJumpFracForTf("1m"));
  });
});

describe("clampTickMid", () => {
  it("caps runaway oracle jumps", () => {
    expect(clampTickMid(0.001, 0.0004, 0.18)).toBeCloseTo(0.0004 * 1.18, 10);
    expect(clampTickMid(0.0001, 0.0004, 0.18)).toBeCloseTo(0.0004 * 0.82, 10);
    expect(clampTickMid(0.00041, 0.0004, 0.18)).toBeCloseTo(0.00041, 10);
    // Default jump is tight — large catch-up is clamped
    expect(clampTickMid(0.00063, 0.0005)).toBeCloseTo(0.0005 * 1.04, 10);
  });

  it("detects discontinuity past max jump", () => {
    expect(isPriceDiscontinuity(0.0006, 0.0009, 0.015)).toBe(true);
    expect(isPriceDiscontinuity(0.000905, 0.0009, 0.015)).toBe(false);
  });
});

describe("clipBarWicks / sanitizeCandleExtremes", () => {
  it("clips a mile-long wick toward the body", () => {
    const spiked = clipBarWicks(bar(1, 0.0004, 0.0004, 0.000001, 0.0004));
    expect(spiked.low).toBeGreaterThan(0.000001);
    expect(spiked.low).toBeLessThan(0.0004);
    expect(spiked.high).toBeGreaterThanOrEqual(0.0004);
  });

  it("flattens a cliff body vs previous close", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      const px = 0.0009;
      candles.push(bar(1_700_000_000 + i * 60, px, px * 1.0002, px * 0.9998, px));
    }
    // Screenshot-class cliff: last bar body 0.0009 → 0.0006
    candles.push(bar(1_700_000_000 + 30 * 60, 0.0009, 0.0009, 0.0006, 0.0006));
    const cleaned = sanitizeCandleExtremes(candles);
    const tip = cleaned[cleaned.length - 1]!;
    expect(Math.abs(tip.close - tip.open) / tip.open).toBeLessThan(0.15);
    expect(tip.low / 0.0009).toBeGreaterThan(0.85);

    const range = robustPriceRange(cleaned)!;
    const span = range.maxValue - range.minValue;
    const mid = (range.maxValue + range.minValue) / 2;
    expect(span / mid).toBeLessThan(0.2);
  });

  it("removes series-squashing spike so robust range stays tight", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      const px = 0.0004 + i * 1e-7;
      candles.push(bar(1_700_000_000 + i * 60, px, px * 1.001, px * 0.999, px));
    }
    candles[20] = bar(candles[20]!.time, 0.00041, 0.00042, 1e-12, 0.00041);
    const cleaned = sanitizeCandleExtremes(candles);
    const lows = cleaned.map((c) => c.low);
    expect(Math.min(...lows)).toBeGreaterThan(0.0002);

    const range = robustPriceRange(cleaned, 0, cleaned.length - 1)!;
    const span = range.maxValue - range.minValue;
    const mid = (range.maxValue + range.minValue) / 2;
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

  it("does not expand Y-axis for outlier last close", () => {
    const candles = Array.from({ length: 40 }, (_, i) => {
      const px = 0.0009;
      return bar(i, px, px * 1.0001, px * 0.9999, px);
    });
    candles[39] = bar(39, 0.0009, 0.0009, 0.00055, 0.00055);
    // Without sanitize — range must still ignore the cliff last.close
    const range = robustPriceRange(candles)!;
    expect(range.minValue).toBeGreaterThan(0.00075);
  });
});

describe("logicalRangeToIndices", () => {
  it("clamps to series bounds", () => {
    expect(logicalRangeToIndices(-5, 100, 40)).toEqual({ fromIdx: 0, toIdx: 39 });
    expect(logicalRangeToIndices(2.2, 8.7, 40)).toEqual({ fromIdx: 2, toIdx: 9 });
  });
});

describe("upsertTick 1m cliff", () => {
  it("does not paint a ±33% body on 1m when oracle jumps", () => {
    const seeded = seedCandles("HMC_USDT", "1m", 0.0009);
    const last = seeded[seeded.length - 1]!;
    expect(last.close).toBeCloseTo(0.0009, 5);
    const next = upsertTick(seeded, "1m", 0.0006, "HMC_USDT", last.close);
    const tip = next[next.length - 1]!;
    const bodyFrac = Math.abs(tip.close - tip.open) / tip.open;
    expect(bodyFrac).toBeLessThan(0.03);
    expect(tip.close / last.close).toBeGreaterThan(0.97);
    expect(tip.low / last.close).toBeGreaterThan(0.97);
  });
});
