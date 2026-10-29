/**
 * Live Soft-MM SoT: mid ticks must not mutate closed OHLC or invent tip walk.
 * Closed bars come from durable `/candles`; tip from last trade only.
 */
import { describe, expect, it } from "vitest";
import {
  applyLiveTradeTipToPairCandles,
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  hydrateLiveCandlesFromPrints,
  mergeDurableApiCandlesIntoBase,
  type CandlePrint,
} from "./candles";
import { resolveCandleTip } from "./priceSoT";
import type { Candle } from "./types";

function closedPath(nowMs: number, n = 120, px0 = 0.05, px1 = 0.07): Candle[] {
  const tip = Math.floor(nowMs / 1000 / 60) * 60;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const t = tip - (n - i) * 60;
    const frac = i / Math.max(1, n - 1);
    const px = px0 + (px1 - px0) * frac;
    out.push({
      time: t,
      open: px,
      high: px * 1.001,
      low: px * 0.999,
      close: px,
      volume: i % 5 === 0 ? 3 : 1,
    });
  }
  return out;
}

describe("resolveCandleTip — trade only", () => {
  it("ignores Soft-MM mid jumps (no book mid input)", () => {
    expect(
      resolveCandleTip({
        tape: 0.064,
        tipClose: 0.064,
      }),
    ).toBeCloseTo(0.064, 8);
    // No tape → tip/api hold, never invent mid.
    expect(resolveCandleTip({ tipClose: 0.07, apiLast: 0.071 })).toBeCloseTo(0.071, 8);
    expect(resolveCandleTip({})).toBe(0);
  });
});

describe("applyLiveTradeTipToPairCandles SoT", () => {
  const nowMs = Date.UTC(2026, 9, 29, 12, 0, 30);

  it("mid tick (fromTrade=false) does not change closed OHLC", () => {
    const path = closedPath(nowMs);
    const tipBucket = path[path.length - 1]!.time;
    const snap = new Map(path.filter((c) => c.time < tipBucket).map((c) => [c.time, { ...c }]));
    const all = applyLiveTradeTipToPairCandles({ [CANDLE_BASE_TF]: path }, "HMC_USDT", 0.08, {
      fromTrade: false,
      nowMs,
    });
    const base = all[CANDLE_BASE_TF]!;
    for (const c of base) {
      if (c.time >= tipBucket) continue;
      const prev = snap.get(c.time);
      if (!prev) continue;
      expect(c.open).toBeCloseTo(prev.open, 12);
      expect(c.high).toBeCloseTo(prev.high, 12);
      expect(c.low).toBeCloseTo(prev.low, 12);
      expect(c.close).toBeCloseTo(prev.close, 12);
    }
  });

  it("book mid change without trade leaves tip at last trade (no mid walk)", () => {
    const path = closedPath(nowMs, 30, 0.06, 0.064);
    path[path.length - 1] = {
      ...path[path.length - 1]!,
      open: 0.064,
      high: 0.064,
      low: 0.064,
      close: 0.064,
      volume: 2,
    };
    // Simulate Soft-MM mid jump 0.064 → 0.073 while last trade stays 0.064.
    const afterMid = applyLiveTradeTipToPairCandles(
      { [CANDLE_BASE_TF]: path },
      "HMC_USDT",
      0.064, // last trade — NOT the new mid
      { fromTrade: false, nowMs },
    );
    const tip = afterMid[CANDLE_BASE_TF]!.at(-1)!;
    expect(tip.close).toBeCloseTo(0.064, 10);
    expect(tip.close).toBeLessThan(0.07);
  });

  it("new trade updates tip OHLC + volume only", () => {
    const path = closedPath(nowMs, 20, 0.06, 0.065);
    const closed = path.slice(0, -1).map((c) => ({ ...c }));
    const after = applyLiveTradeTipToPairCandles(
      { [CANDLE_BASE_TF]: path },
      "HMC_USDT",
      0.072,
      { fromTrade: true, amountBase: 12, nowMs },
    );
    const base = after[CANDLE_BASE_TF]!;
    for (let i = 0; i < closed.length; i++) {
      expect(base[i]!.close).toBeCloseTo(closed[i]!.close, 12);
    }
    const tip = base.at(-1)!;
    expect(tip.close).toBeCloseTo(0.072, 10);
    expect(tip.volume).toBeGreaterThanOrEqual(12);
  });

  it("applyMid liveTradeSoT delegates without heal/texture rewrite of closed bars", () => {
    const path = closedPath(nowMs, 40, 0.05, 0.06);
    const y = path[10]!;
    const next = applyMidToPairCandles({ [CANDLE_BASE_TF]: path }, "HMC_USDT", 0.08, 0.06, {
      liveTradeSoT: true,
      nowMs,
    });
    const kept = next[CANDLE_BASE_TF]!.find((c) => c.time === y.time)!;
    expect(kept.close).toBeCloseTo(y.close, 12);
  });
});

describe("cross-device durable merge", () => {
  it("two devices with same server candles converge on closed OHLC", () => {
    const nowMs = Date.UTC(2026, 9, 29, 15, 0, 0);
    const tipBucket = Math.floor(nowMs / 1000 / 60) * 60;
    const server: Candle[] = [];
    for (let i = 0; i < 200; i++) {
      const t = tipBucket - (200 - i) * 60;
      const px = 0.05 + (i / 199) * 0.02;
      server.push({ time: t, open: px, high: px * 1.001, low: px * 0.999, close: px, volume: 5 });
    }
    const deviceATip: Candle[] = [
      { time: tipBucket, open: 0.07, high: 0.071, low: 0.069, close: 0.0705, volume: 1 },
    ];
    const deviceBTip: Candle[] = [
      { time: tipBucket, open: 0.07, high: 0.072, low: 0.068, close: 0.071, volume: 2 },
    ];
    const a = mergeDurableApiCandlesIntoBase(deviceATip, server, tipBucket);
    const b = mergeDurableApiCandlesIntoBase(deviceBTip, server, tipBucket);
    for (const s of server) {
      if (s.time >= tipBucket) continue;
      const ca = a.find((c) => c.time === s.time)!;
      const cb = b.find((c) => c.time === s.time)!;
      expect(ca.open).toBeCloseTo(cb.open, 12);
      expect(ca.close).toBeCloseTo(cb.close, 12);
      expect(ca.open).toBeCloseTo(s.open, 12);
    }
  });

  it("hydrate prefers durable closed bars and does not reseed on tip mid", () => {
    const nowMs = Date.UTC(2026, 9, 29, 15, 30, 0);
    const tipBucket = Math.floor(nowMs / 1000 / 60) * 60;
    const durable: Candle[] = [];
    for (let i = 0; i < 90; i++) {
      const t = tipBucket - (90 - i) * 60;
      durable.push({
        time: t,
        open: 0.055,
        high: 0.056,
        low: 0.054,
        close: 0.055,
        volume: 4,
      });
    }
    const prints: CandlePrint[] = [
      { ts: tipBucket * 1000, price: 0.08, amountBase: 2 },
    ];
    const a = hydrateLiveCandlesFromPrints("HMC_USDT", prints, 0.08, nowMs, null, undefined, durable);
    const b = hydrateLiveCandlesFromPrints("HMC_USDT", prints, 0.08, nowMs, null, undefined, durable);
    const sampleT = durable[20]!.time;
    expect(a[CANDLE_BASE_TF]!.find((c) => c.time === sampleT)!.close).toBeCloseTo(0.055, 12);
    expect(b[CANDLE_BASE_TF]!.find((c) => c.time === sampleT)!.close).toBeCloseTo(0.055, 12);
    // Mid tip argument must not rewrite durable closed path into 0.08-era seed.
    expect(a[CANDLE_BASE_TF]!.find((c) => c.time === sampleT)!.close).toBeLessThan(0.06);
  });
});
