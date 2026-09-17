import { afterEach, describe, expect, it, vi } from "vitest";
import {
  barCountForTf,
  candlesAreContiguous,
  CHART_GENESIS_UNIX,
  ensureContiguousCandles,
  MAX_CANDLES,
  maxBarsSinceGenesis,
  prependOlderCandles,
  sanitizeCandleVolumes,
  seedCandles,
  stats24h,
  trimCandlesToGenesis,
  upsertTick,
} from "./candles";
import type { Candle } from "./types";

describe("barCountForTf", () => {
  it("returns deep history on short TFs but never past genesis span", () => {
    expect(barCountForTf("30s")).toBeGreaterThanOrEqual(1000);
    expect(barCountForTf("1m")).toBeGreaterThanOrEqual(1000);
    expect(barCountForTf("15m")).toBeGreaterThanOrEqual(500);
    expect(barCountForTf("1D")).toBeLessThanOrEqual(maxBarsSinceGenesis("1D"));
    expect(barCountForTf("1D")).toBeLessThanOrEqual(365);
  });
});

describe("chart genesis floor", () => {
  it("CHART_GENESIS_UNIX is 2026-05-18 UTC", () => {
    expect(CHART_GENESIS_UNIX).toBe(Math.floor(Date.parse("2026-05-18T00:00:00.000Z") / 1000));
  });

  it("seedCandles never starts before genesis", () => {
    for (const tf of ["1H", "1D", "1W"] as const) {
      const candles = seedCandles("HMC_USDT", tf, 0.0004);
      expect(candles.length).toBeGreaterThan(0);
      expect(candles[0].time).toBeGreaterThanOrEqual(CHART_GENESIS_UNIX);
    }
  });

  it("prependOlderCandles stops at genesis (no Nov/Dec invent)", () => {
    const base = seedCandles("HMC_USDT", "1D", 0.0004, 5);
    let grown = base;
    for (let i = 0; i < 80; i++) {
      const next = prependOlderCandles(grown, "HMC_USDT", "1D", 40);
      if (next.length === grown.length) break;
      grown = next;
    }
    expect(grown[0].time).toBeGreaterThanOrEqual(CHART_GENESIS_UNIX);
    expect(grown[0].time).toBeGreaterThanOrEqual(Date.parse("2026-05-01T00:00:00.000Z") / 1000);
  });

  it("1H prepend cannot invent months before May 2026", () => {
    const base = seedCandles("HMC_USDT", "1H", 0.0004, 24);
    let grown = base;
    for (let i = 0; i < 40; i++) {
      const next = prependOlderCandles(grown, "HMC_USDT", "1H", 200);
      if (next.length === grown.length) break;
      grown = next;
    }
    expect(grown[0].time).toBeGreaterThanOrEqual(CHART_GENESIS_UNIX);
  });
});

describe("seedCandles", () => {
  it("seeds contiguous OHLC with last close ≈ mid", () => {
    const mid = 0.05;
    const candles = seedCandles("HMC_USDT", "15m", mid, 20);
    expect(candles).toHaveLength(20);
    expect(candles[candles.length - 1].close).toBeCloseTo(mid, 12);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.volume).toBeGreaterThan(0);
    }
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].time).toBeGreaterThan(candles[i - 1].time);
    }
  });

  it("24h change stays mild around reference mid (no fake −12% dump)", () => {
    const mid = 0.05;
    const candles = seedCandles("HMC_USDT", "15m", mid, 200);
    const s = stats24h(candles, "15m");
    expect(candles[candles.length - 1]!.close).toBeCloseTo(mid, 12);
    expect(Math.abs(s.changePct)).toBeLessThan(5);
    expect(s.high / mid).toBeLessThan(1.08);
    expect(s.low / mid).toBeGreaterThan(0.92);
  });

  it("is deterministic for the same pair/tf/time/mid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00.000Z"));
    const a = seedCandles("HMC_USDT", "15m", 0.00043, 20);
    const b = seedCandles("HMC_USDT", "15m", 0.00043, 20);
    expect(b).toEqual(a);
  });

  it("matches across fresh clients at the same wall clock (no local fork)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    const mid = 0.05;
    const a = seedCandles("HMC_USDT", "1m", mid, 120);
    const b = seedCandles("HMC_USDT", "1m", mid, 120);
    expect(b).toEqual(a);
    const tip = a[a.length - 1]!;
    expect(tip.close).toBeCloseTo(mid, 12);
    // Different pairs keep aligned bucket times
    const sup = seedCandles("SUP_USDT", "1m", 0.01, 120);
    expect(sup.map((c) => c.time)).toEqual(a.map((c) => c.time));
  });
});

describe("prependOlderCandles", () => {
  it("extends history to the left without gaps", () => {
    const base = seedCandles("HMC_USDT", "15m", 0.0004, 10);
    const grown = prependOlderCandles(base, "HMC_USDT", "15m", 5);
    expect(grown.length).toBe(15);
    expect(grown[grown.length - 1].time).toBe(base[base.length - 1].time);
    for (let i = 1; i < grown.length; i++) {
      expect(grown[i].time).toBeGreaterThan(grown[i - 1].time);
    }
  });

  it("is deterministic for the same existing history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00.000Z"));
    const base = seedCandles("HMC_USDT", "15m", 0.0004, 10);
    const first = prependOlderCandles(base, "HMC_USDT", "15m", 5);
    const second = prependOlderCandles(base, "HMC_USDT", "15m", 5);
    expect(second).toEqual(first);
  });

  it("respects MAX_CANDLES cap", () => {
    const base = seedCandles("HMC_USDT", "1m", 0.0004, 50);
    const grown = prependOlderCandles(base, "HMC_USDT", "1m", MAX_CANDLES);
    expect(grown.length).toBeLessThanOrEqual(MAX_CANDLES);
  });

  it("returns same array when already at MAX_CANDLES", () => {
    const base = seedCandles("HMC_USDT", "1m", 0.0004, MAX_CANDLES);
    const grown = prependOlderCandles(base, "HMC_USDT", "1m", 200);
    expect(grown).toBe(base);
  });
});

describe("trimCandlesToGenesis", () => {
  it("drops bars before genesis", () => {
    const junk = [
      { time: CHART_GENESIS_UNIX - 86400, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: CHART_GENESIS_UNIX + 86400, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ];
    const out = trimCandlesToGenesis(junk, "1D");
    expect(out).toHaveLength(1);
    expect(out[0].time).toBeGreaterThanOrEqual(CHART_GENESIS_UNIX);
  });
});

describe("upsertTick", () => {
  it("updates last candle in same bucket", () => {
    const seeded = seedCandles("HMC_USDT", "15m", 0.0004, 5);
    const before = seeded.length;
    const ref = seeded[seeded.length - 1]!.close;
    const target = ref * 1.02; // within 15m jump band
    const next = upsertTick(seeded, "15m", target, "HMC_USDT");
    expect(next.length).toBeGreaterThanOrEqual(before);
    expect(next[next.length - 1].close).toBeCloseTo(target, 12);
    expect(next[next.length - 1].high).toBeGreaterThanOrEqual(target);
  });

  it("blends when prevMid provided", () => {
    const seeded = seedCandles("SUP_USDT", "1m", 0.00005, 3);
    const ref = seeded[seeded.length - 1]!.close;
    const target = ref * 1.01;
    const a = upsertTick(seeded, "1m", target, "SUP_USDT", ref);
    const last = a[a.length - 1];
    expect(last.close).toBeCloseTo(target, 12);
    expect(last.volume).toBeGreaterThan(0);
  });

  it("keeps open continuous with previous close on oracle jump", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
    const seeded = seedCandles("HMC_USDT", "1m", 0.05, 8);
    const prev = seeded[seeded.length - 1]!.close;
    let series = seeded;
    const seededLen = seeded.length;
    let mid = prev;
    for (const step of [0.92, 0.9, 0.88]) {
      mid = prev * step;
      series = upsertTick(series, "1m", mid, "HMC_USDT", series[series.length - 1]!.close);
    }
    // Continuity for bars introduced / extended by upsert (seed path is paper-clock open≠tip mid).
    for (let i = Math.max(1, seededLen - 1); i < series.length; i++) {
      expect(series[i]!.open).toBeCloseTo(series[i - 1]!.close, 6);
    }
    vi.useRealTimers();
  });
});

describe("stats24h", () => {
  it("empty / short series → zeros", () => {
    expect(stats24h([])).toEqual({ changePct: 0, high: 0, low: 0, vol: 0, refOpen: 0, refClose: 0 });
  });

  it("computes change high low vol on slice", () => {
    const candles: Candle[] = [
      { time: 1, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
      { time: 2, open: 100.5, high: 102, low: 100, close: 101.5, volume: 20 },
      { time: 3, open: 101.5, high: 103, low: 101, close: 102.5, volume: 30 },
    ];
    const s = stats24h(candles, "15m");
    expect(s.changePct).toBeCloseTo(((102.5 - 100) / 100) * 100, 5);
    expect(s.high).toBeGreaterThanOrEqual(102.5);
    expect(s.low).toBeLessThanOrEqual(100);
    expect(s.vol).toBe(60);
  });
});

describe("sanitizeCandleVolumes", () => {
  it("caps HMC volumes at 500k", () => {
    const out = sanitizeCandleVolumes(
      [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 999_999 }],
      "HMC_USDT",
    );
    expect(out[0].volume).toBe(500_000);
  });

  it("caps non-HMC at 200k", () => {
    const out = sanitizeCandleVolumes(
      [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 400_000 }],
      "SUP_USDT",
    );
    expect(out[0].volume).toBe(200_000);
  });
});

describe("1D contiguity / gap abuse", () => {
  const day = 86_400;

  it("seedCandles 1D series is strictly contiguous", () => {
    const candles = seedCandles("HMC_USDT", "1D", 0.00055, 40);
    expect(candlesAreContiguous(candles, "1D")).toBe(true);
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].time - candles[i - 1].time).toBe(day);
    }
  });

  it("ensureContiguousCandles fills 23→25→31 style skips", () => {
    const t0 = Math.floor(Date.parse("2026-07-23T00:00:00.000Z") / 1000);
    const sparse: Candle[] = [
      { time: t0, open: 1, high: 1.1, low: 0.9, close: 1, volume: 10 },
      { time: t0 + 2 * day, open: 1, high: 1.2, low: 0.8, close: 1.05, volume: 20 }, // 25th
      { time: t0 + 8 * day, open: 1.05, high: 1.3, low: 1, close: 1.1, volume: 30 }, // 31st
    ];
    const healed = ensureContiguousCandles(sparse, "1D", { pairId: "HMC_USDT" });
    expect(candlesAreContiguous(healed, "1D")).toBe(true);
    expect(healed).toHaveLength(9); // 23..31 inclusive
    expect(healed[0].time).toBe(t0);
    expect(healed[healed.length - 1].time).toBe(t0 + 8 * day);
    // Gap days are flat bridges from prior close
    expect(healed[1].time).toBe(t0 + day); // 24th
    expect(healed[1].close).toBe(1);
    expect(healed[1].volume).toBe(0);
  });

  it("upsertTick fills multi-day idle gap on 1D", () => {
    const nowB = Math.floor(Date.now() / 1000 / day) * day;
    const old: Candle[] = [
      {
        time: nowB - 5 * day,
        open: 0.0005,
        high: 0.00052,
        low: 0.00048,
        close: 0.0005,
        volume: 100,
      },
    ];
    // 1D tick jump ~3% — stay inside band from 0.0005
    const target = 0.000515;
    const next = upsertTick(old, "1D", target, "HMC_USDT");
    expect(candlesAreContiguous(next, "1D")).toBe(true);
    expect(next[next.length - 1].time).toBe(nowB);
    expect(next[next.length - 1].close).toBeCloseTo(target, 12);
    expect(next.length).toBeGreaterThanOrEqual(6); // 5 gap days + live (or bridged)
  });

  it("dedupes duplicate bucket abuse and merges OHLC", () => {
    const t = Math.floor(Date.parse("2026-06-01T00:00:00.000Z") / 1000);
    const duped: Candle[] = [
      { time: t, open: 1, high: 1.1, low: 0.9, close: 1.0, volume: 5 },
      { time: t, open: 1.0, high: 1.5, low: 0.8, close: 1.2, volume: 7 },
      { time: t + day, open: 1.2, high: 1.3, low: 1.1, close: 1.25, volume: 3 },
    ];
    const healed = ensureContiguousCandles(duped, "1D");
    expect(healed).toHaveLength(2);
    expect(healed[0].high).toBe(1.5);
    expect(healed[0].low).toBe(0.8);
    expect(healed[0].close).toBe(1.2);
    expect(healed[0].volume).toBe(12);
  });

  it("unsorted / shuffled input becomes ordered contiguous", () => {
    const t = Math.floor(Date.parse("2026-06-10T00:00:00.000Z") / 1000);
    const shuffled: Candle[] = [
      { time: t + 2 * day, open: 3, high: 3, low: 3, close: 3, volume: 1 },
      { time: t, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: t + day, open: 2, high: 2, low: 2, close: 2, volume: 1 },
    ];
    const healed = ensureContiguousCandles(shuffled, "1D");
    expect(candlesAreContiguous(healed, "1D")).toBe(true);
    expect(healed.map((c) => c.close)).toEqual([1, 2, 3]);
  });

  it("drops pre-genesis junk and does not invent Nov 2025", () => {
    const junk: Candle[] = [
      { time: CHART_GENESIS_UNIX - 10 * day, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: CHART_GENESIS_UNIX + day, open: 1, high: 1, low: 1, close: 1.1, volume: 1 },
      { time: CHART_GENESIS_UNIX + 3 * day, open: 1.1, high: 1.2, low: 1, close: 1.15, volume: 1 },
    ];
    const healed = ensureContiguousCandles(junk, "1D");
    expect(healed[0].time).toBeGreaterThanOrEqual(CHART_GENESIS_UNIX);
    expect(candlesAreContiguous(healed, "1D")).toBe(true);
    expect(healed).toHaveLength(3); // day+1, +2 gap, +3
  });

  it("caps enormous synthetic span at MAX_CANDLES", () => {
    const end = Math.floor(Date.now() / 1000 / 60) * 60;
    const start = end - MAX_CANDLES * 2 * 60;
    const sparse: Candle[] = [
      { time: start, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: end, open: 1, high: 1, low: 1, close: 2, volume: 1 },
    ];
    const healed = ensureContiguousCandles(sparse, "1m", { fillToNow: false });
    expect(healed.length).toBeLessThanOrEqual(MAX_CANDLES);
    expect(candlesAreContiguous(healed, "1m")).toBe(true);
    expect(healed[healed.length - 1].time).toBe(end);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
