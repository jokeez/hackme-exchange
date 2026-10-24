/**
 * Spike / flying-gap regression: impossible highs must not crush Y-scale;
 * display soft-bridges opens without rewriting durable closed OHLC in state.
 */
import { describe, expect, it } from "vitest";
import {
  CANDLE_BASE_TF,
  hydrateLiveCandlesFromPrints,
  isPlausibleTapePrice,
  paintLiveDayRangeExtremes,
  tfPaintsDayRangeLegend,
} from "./candles";
import { displayCapCandles, isDisplayOutlierPx, paintedCandleHealth } from "./chartScale";
import type { Candle } from "./types";

const nowMs = Date.UTC(2026, 9, 24, 18, 0, 0);
const sec = 60;
const tipBucket = Math.floor(nowMs / 1000 / sec) * sec;

function bar(t: number, o: number, h: number, l: number, c: number, v = 2): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: v };
}

function quietPath(n: number, px: number): Candle[] {
  const out: Candle[] = [];
  for (let i = n; i >= 1; i--) {
    const t = tipBucket - i * sec;
    out.push(bar(t, px, px * 1.002, px * 0.998, px));
  }
  return out;
}

function countOpenJumps(series: Candle[], thresh = 0.002): number {
  let n = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.close;
    const open = series[i]!.open;
    if (prev > 0 && Math.abs(open - prev) / prev > thresh) n++;
  }
  return n;
}

describe("spike clamp + display open bridges", () => {
  it("rejects minors-leak / sci tape prices", () => {
    expect(isPlausibleTapePrice(0.071, 0.07)).toBe(true);
    expect(isPlausibleTapePrice(0.096, 0.07)).toBe(true);
    expect(isPlausibleTapePrice(8311700, 0.07)).toBe(false);
    expect(isPlausibleTapePrice(1.0, 0.07)).toBe(false);
    expect(isDisplayOutlierPx(8311700, 0.07)).toBe(true);
    expect(isDisplayOutlierPx(1.0, 0.072)).toBe(true);
    expect(isDisplayOutlierPx(0.083, 0.072)).toBe(false);
  });

  it("dayRange legend paint is daily+ only", () => {
    expect(tfPaintsDayRangeLegend("1m")).toBe(false);
    expect(tfPaintsDayRangeLegend("1H")).toBe(false);
    expect(tfPaintsDayRangeLegend("1D")).toBe(true);
    expect(tfPaintsDayRangeLegend("1W")).toBe(true);
  });

  it("paintLiveDayRangeExtremes rejects minors dayHi", () => {
    const tip = 0.071;
    const series = [
      ...quietPath(5, tip),
      bar(tipBucket, tip, tip, tip, tip, 0),
    ];
    const painted = paintLiveDayRangeExtremes(series, { high: 8311700, low: 0.06 });
    expect(painted[painted.length - 1]!.high).toBeLessThan(1);
    expect(painted[painted.length - 1]!.high).toBeCloseTo(tip, 8);
  });

  it("injecting high=1.0 into durable does not crush painted Y-scale", () => {
    const tip = 0.071;
    const durable = quietPath(80, tip);
    const poisonAt = tipBucket - 20 * sec;
    const hit = durable.find((c) => c.time === poisonAt)!;
    hit.high = 1.0;
    const all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tipBucket * 1000, price: tip, amountBase: 1 }],
      tip,
      nowMs,
      null,
      { high: tip * 1.05, low: tip * 0.95, open: tip },
      durable,
    );
    const base = all[CANDLE_BASE_TF]!;
    // State may still carry the poison high (immutable durable) …
    const poisoned = base.find((c) => c.time === poisonAt);
    expect(poisoned?.high).toBeGreaterThan(0.5);
    // … but display paint must clamp the skyscraper.
    const painted = displayCapCandles(base, "1m");
    const maxH = Math.max(...painted.map((c) => c.high));
    expect(maxH).toBeLessThan(tip * 3);
    const health = paintedCandleHealth(painted, tip, "1m");
    expect(health.spanFrac).toBeLessThan(0.5);
    expect(health.tipDrift).toBeLessThan(0.01);
  });

  it("minors print is ignored so tip stays on Last", () => {
    const tip = 0.071;
    const durable = quietPath(40, tip);
    const all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [
        { ts: tipBucket * 1000, price: 8311700, amountBase: 1 },
        { ts: tipBucket * 1000 + 100, price: tip, amountBase: 1 },
      ],
      tip,
      nowMs,
      null,
      undefined,
      durable,
    );
    const tipBar = all[CANDLE_BASE_TF]!.at(-1)!;
    expect(tipBar.close).toBeCloseTo(tip, 8);
    expect(tipBar.high).toBeLessThan(tip * 2);
  });

  it("displayCap soft-bridges open gaps without rewriting state closes", () => {
    const tip = 0.069;
    // Flying islands: adjacent durable clusters at different prices.
    const durable: Candle[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        bar(tipBucket - 200 * sec + i * sec, 0.072, 0.073, 0.071, 0.072),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        bar(tipBucket - 100 * sec + i * sec, 0.078, 0.079, 0.077, 0.078),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        bar(tipBucket - 40 * sec + i * sec, 0.065, 0.066, 0.064, 0.065),
      ),
    ];
    const all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tipBucket * 1000, price: tip, amountBase: 1 }],
      tip,
      nowMs,
      null,
      undefined,
      durable,
    );
    const base = all[CANDLE_BASE_TF]!;
    const durableT = new Set(durable.map((c) => c.time));
    // State: durable closes immutable.
    for (const raw of durable) {
      const hit = base.find((c) => c.time === raw.time)!;
      expect(hit.close).toBeCloseTo(raw.close, 10);
      expect(hit.high).toBeCloseTo(raw.high, 10);
    }
    // Display: opens soft-bridged — no island-class open cliffs (state may still gap).
    const painted = displayCapCandles(base, "1m");
    expect(countOpenJumps(painted, 0.05)).toBe(0);
    // Painted closes still match state for durable buckets.
    for (const t of durableT) {
      if (t >= tipBucket) continue;
      const s = base.find((c) => c.time === t)!;
      const p = painted.find((c) => c.time === t)!;
      expect(p.close).toBeCloseTo(s.close, 10);
    }
  });

  it("1m tip does not inherit ticker dayHigh skyscraper after hydrate", () => {
    const tip = 0.071;
    const dayHi = 0.096;
    const durable = quietPath(60, tip);
    const all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tipBucket * 1000, price: tip, amountBase: 1 }],
      tip,
      nowMs,
      null,
      { high: dayHi, low: tip * 0.9, open: tip },
      durable,
    );
    const tip1m = all[CANDLE_BASE_TF]!.at(-1)!;
    // 1m tip must not carry the full 24h high wick (that crushed Y-scale).
    expect(tip1m.high).toBeLessThan(dayHi * 0.99);
    expect(tip1m.high).toBeLessThanOrEqual(tip * 1.08);
    const tip1d = all["1D"]!.at(-1)!;
    expect(tip1d.high).toBeGreaterThanOrEqual(dayHi * 0.999);
  });
});
