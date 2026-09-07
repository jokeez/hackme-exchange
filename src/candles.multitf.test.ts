import { describe, expect, it, vi } from "vitest";
import {
  aggregateCandles,
  applyMidToPairCandles,
  applyPaperClockToPairCandles,
  CANDLE_BASE_TF,
  deriveAllTimeframes,
  expandToFinerTf,
  reaggregateLiveBarsFromBase,
  seedAllTimeframes,
  tipBarFromPaperClock,
} from "./candles";
import { paperPairMid } from "./market";
import { TF_SEC, TIMEFRAMES, type Timeframe } from "./types";

const COARSER_TFS = TIMEFRAMES.filter((tf) => TF_SEC[tf] > TF_SEC[CANDLE_BASE_TF]);

function assertOhlcValid(c: { open: number; high: number; low: number; close: number }, label: string) {
  expect(c.high, label).toBeGreaterThanOrEqual(Math.max(c.open, c.close) - 1e-12);
  expect(c.low, label).toBeLessThanOrEqual(Math.min(c.open, c.close) + 1e-12);
}

describe("multi-TF CEX audit (all timeframes)", () => {
  it("seeded series: contiguous steps + OHLC invariants on every TF", () => {
    const all = seedAllTimeframes("HMC_USDT", 0.00063371);
    for (const tf of TIMEFRAMES) {
      const series = all[tf]!;
      expect(series.length, tf).toBeGreaterThan(5);
      const sec = TF_SEC[tf];
      for (let i = 1; i < series.length; i++) {
        const prev = series[i - 1]!;
        const cur = series[i]!;
        expect(cur.time - prev.time, `${tf} gap @${i}`).toBe(sec);
        expect(cur.open, `${tf} open @${i}`).toBeCloseTo(prev.close, 7);
        assertOhlcValid(cur, `${tf} @${i}`);
      }
    }
  });

  it("completed coarser bars match 1m aggregation in the overlapping window", () => {
    const all = seedAllTimeframes("SUP_USDT", 0.000051);
    const m1 = all[CANDLE_BASE_TF]!;
    for (const tf of COARSER_TFS) {
      const coarse = all[tf]!;
      const dstSec = TF_SEC[tf];
      // Skip live bucket — only audit closed bars fully covered by 1m children.
      for (const bar of coarse.slice(0, -1)) {
        const children = m1.filter((c) => c.time >= bar.time && c.time < bar.time + dstSec);
        if (children.length < dstSec / TF_SEC[CANDLE_BASE_TF]) continue;
        expect(bar.open, `${tf} open t=${bar.time}`).toBeCloseTo(children[0]!.open, 10);
        expect(bar.close, `${tf} close t=${bar.time}`).toBeCloseTo(children[children.length - 1]!.close, 10);
        const childHigh = Math.max(...children.map((c) => c.high));
        const childLow = Math.min(...children.map((c) => c.low));
        expect(bar.high, `${tf} high t=${bar.time}`).toBeGreaterThanOrEqual(childHigh - 1e-10);
        expect(bar.low, `${tf} low t=${bar.time}`).toBeLessThanOrEqual(childLow + 1e-10);
      }
    }
  });

  it("live ticks: tip close matches 1m on every TF; live bar tracks 1m extremes", () => {
    let all = seedAllTimeframes("HMC_USDT", 0.0007);
    let prev = 0.0007;
    for (const target of [0.00068, 0.00066, 0.00065, 0.00063371]) {
      all = applyMidToPairCandles(all, "HMC_USDT", target, prev);
      prev = target;
    }
    const tip1m = all[CANDLE_BASE_TF]![all[CANDLE_BASE_TF]!.length - 1]!;
    for (const tf of TIMEFRAMES) {
      const tip = all[tf]![all[tf]!.length - 1]!;
      expect(tip.close, tf).toBeCloseTo(tip1m.close, 10);
      assertOhlcValid(tip, `${tf} live`);
    }
    for (const tf of COARSER_TFS) {
      const tip = all[tf]![all[tf]!.length - 1]!;
      const dstSec = TF_SEC[tf];
      const children = all[CANDLE_BASE_TF]!.filter(
        (c) => Math.floor(c.time / dstSec) * dstSec === tip.time,
      );
      if (!children.length) continue;
      const childHigh = Math.max(...children.map((c) => c.high));
      const childLow = Math.min(...children.map((c) => c.low));
      expect(tip.high).toBeGreaterThanOrEqual(childHigh - 1e-10);
      expect(tip.low).toBeLessThanOrEqual(childLow + 1e-10);
    }
  });

  it("deriveAllTimeframes extends 1m before aggregating (wider real overlap)", () => {
    const all = seedAllTimeframes("HMC_USDT", 0.0005);
    const m1Len = all[CANDLE_BASE_TF]!.length;
    expect(m1Len).toBeGreaterThan(500);
    const m5 = all["5m"]!;
    const firstAggT = m5.find((b) => {
      const kids = all[CANDLE_BASE_TF]!.filter((c) => c.time >= b.time && c.time < b.time + 300);
      return kids.length >= 5;
    });
    expect(firstAggT).toBeTruthy();
  });

  it("reaggregateLiveBarsFromBase rebuilds forming 1D from intraday 1m", () => {
    const all = seedAllTimeframes("HMC_USDT", 0.0006);
    const base = all[CANDLE_BASE_TF]!;
    const tip1m = base[base.length - 1]!;
    tip1m.high = tip1m.close * 1.02;
    tip1m.low = tip1m.close * 0.98;
    reaggregateLiveBarsFromBase(all, base);
    const tip1d = all["1D"]![all["1D"]!.length - 1]!;
    expect(tip1d.high).toBeGreaterThanOrEqual(tip1m.high - 1e-10);
    expect(tip1d.low).toBeLessThanOrEqual(tip1m.low + 1e-10);
  });

  it("all pairs seed without cross-TF tip drift", () => {
    const pairs = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"] as const;
    for (const pairId of pairs) {
      const mid = pairId === "HMC_SUP" ? 5 : pairId.includes("BTC") ? 0.01 / 67_500 : 0.05;
      const all = seedAllTimeframes(pairId, mid);
      const tip1m = all[CANDLE_BASE_TF]![all[CANDLE_BASE_TF]!.length - 1]!.close;
      for (const tf of COARSER_TFS) {
        expect(all[tf]![all[tf]!.length - 1]!.close, `${pairId} ${tf}`).toBeCloseTo(tip1m, 8);
      }
      // 30s forming half may trail 1m tip mid-minute — still inside the 1m bar.
      const tip30 = all["30s"]![all["30s"]!.length - 1]!;
      const bar1m = all[CANDLE_BASE_TF]![all[CANDLE_BASE_TF]!.length - 1]!;
      expect(tip30.close).toBeGreaterThanOrEqual(Math.min(bar1m.open, bar1m.close) - 1e-12);
      expect(tip30.close).toBeLessThanOrEqual(Math.max(bar1m.open, bar1m.close, tip1m) + 1e-12);
    }
  });

  it("aggregateCandles preserves ±1.5% child wick extremes exactly", () => {
    const mid = 0.05;
    const t0 = Math.floor(Date.now() / 1000 / 300) * 300; // align to 5m bucket
    const kids = Array.from({ length: 5 }, (_, i) => {
      const o = mid * (1 + (i - 2) * 0.001);
      const c = mid * (1 + (i - 1.5) * 0.001);
      return {
        time: t0 + i * 60,
        open: o,
        high: Math.max(o, c) * 1.015,
        low: Math.min(o, c) * 0.985,
        close: c,
        volume: 10,
      };
    });
    const m5 = aggregateCandles(kids, "1m", "5m");
    expect(m5.length).toBe(1);
    const bar = m5[0]!;
    const childHigh = Math.max(...kids.map((k) => k.high));
    const childLow = Math.min(...kids.map((k) => k.low));
    expect(bar.high).toBeCloseTo(childHigh, 12);
    expect(bar.low).toBeCloseTo(childLow, 12);
    expect(bar.open).toBeCloseTo(kids[0]!.open, 12);
    expect(bar.close).toBeCloseTo(kids[kids.length - 1]!.close, 12);
  });

  it("reaggregate + finalize keeps tip H/L ≥ spiked 1m children", () => {
    const all = seedAllTimeframes("HMC_USDT", 0.0006);
    const base = all[CANDLE_BASE_TF]!;
    const tip1m = { ...base[base.length - 1]! };
    tip1m.high = tip1m.close * 1.02;
    tip1m.low = tip1m.close * 0.98;
    base[base.length - 1] = tip1m;
    reaggregateLiveBarsFromBase(all, base);
    for (const tf of ["5m", "15m", "1H", "1D"] as const) {
      const tip = all[tf]![all[tf]!.length - 1]!;
      expect(tip.high).toBeGreaterThanOrEqual(tip1m.high - 1e-12);
      expect(tip.low).toBeLessThanOrEqual(tip1m.low + 1e-12);
      expect(tip.close).toBeCloseTo(tip1m.close, 10);
    }
  });

  it("30s halves recover parent 1m high/low", () => {
    const mid = 0.05;
    const t0 = Math.floor(Date.now() / 1000 / 60) * 60 - 60;
    const parent = {
      time: t0,
      open: mid,
      high: mid * 1.02,
      low: mid * 0.98,
      close: mid * 1.005,
      volume: 100,
    };
    const halves = expandToFinerTf([parent], "1m", "30s");
    expect(halves.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...halves.map((h) => h.high))).toBeCloseTo(parent.high, 12);
    expect(Math.min(...halves.map((h) => h.low))).toBeCloseTo(parent.low, 12);
  });

  it("upsert tip does not shrink established high after flat close", () => {
    const mid = 0.05;
    const t0 = Math.floor(Date.now() / 1000 / 60) * 60;
    // Within 1m wick pad (0.45%) — must survive mean-revert close.
    const hi = mid * 1.004;
    const lo = mid * 0.996;
    const base = [
      {
        time: t0,
        open: mid,
        high: hi,
        low: lo,
        close: mid * 1.001,
        volume: 10,
      },
    ];
    const next = applyMidToPairCandles({ "1m": base }, "HMC_USDT", mid, mid * 1.001);
    const tip = next["1m"]!.find((c) => c.time === t0) ?? next["1m"]![next["1m"]!.length - 1]!;
    if (tip.time === t0) {
      expect(tip.high).toBeGreaterThanOrEqual(hi - 1e-12);
      expect(tip.low).toBeLessThanOrEqual(lo + 1e-12);
    }
    expect(tip.high).toBeGreaterThanOrEqual(Math.max(tip.open, tip.close) - 1e-12);
    expect(tip.low).toBeLessThanOrEqual(Math.min(tip.open, tip.close) + 1e-12);
  });

  it("tip OHLC is identical for late-joining clients (no path-dependent H/L)", () => {
    vi.useFakeTimers();
    const t0 = Date.parse("2026-09-07T12:00:00.000Z");
    vi.setSystemTime(t0);
    const early = applyPaperClockToPairCandles({}, "HMC_USDT", t0);
    // Simulate early client ticking through the minute
    for (let i = 1; i <= 40; i++) {
      vi.setSystemTime(t0 + i * 700);
      Object.assign(early, applyPaperClockToPairCandles(early, "HMC_USDT", t0 + i * 700));
    }
    const lateJoinMs = t0 + 40 * 700;
    const late = applyPaperClockToPairCandles({}, "HMC_USDT", lateJoinMs);
    const tipA = early[CANDLE_BASE_TF]![early[CANDLE_BASE_TF]!.length - 1]!;
    const tipB = late[CANDLE_BASE_TF]![late[CANDLE_BASE_TF]!.length - 1]!;
    expect(tipB).toEqual(tipA);
    expect(tipA.close).toBe(paperPairMid("HMC_USDT", lateJoinMs));
    // Coarser tips also match
    expect(late["15m"]![late["15m"]!.length - 1]).toEqual(early["15m"]![early["15m"]!.length - 1]);
    vi.useRealTimers();
  });

  it("tipBarFromPaperClock is pure for fixed nowMs", () => {
    const nowMs = Date.parse("2026-09-07T12:00:33.000Z");
    const t = Math.floor(nowMs / 1000 / 60) * 60;
    const mid = paperPairMid("SUP_USDT", nowMs);
    const a = tipBarFromPaperClock("SUP_USDT", "1m", t, nowMs, mid);
    const b = tipBarFromPaperClock("SUP_USDT", "1m", t, nowMs, mid);
    expect(b).toEqual(a);
    expect(a.close).toBe(mid);
    expect(a.high).toBeGreaterThanOrEqual(Math.max(a.open, a.close));
    expect(a.low).toBeLessThanOrEqual(Math.min(a.open, a.close));
  });

  it("expandToFinerTf respects injected nowMs (no future half-bar)", () => {
    const parentT = Math.floor(Date.parse("2026-09-07T12:00:00.000Z") / 1000);
    const parent = {
      time: parentT,
      open: 0.05,
      high: 0.051,
      low: 0.049,
      close: 0.0502,
      volume: 100,
    };
    // Mid-minute: only first 30s half should exist
    const midMinute = parentT * 1000 + 20_000;
    const halves = expandToFinerTf([parent], "1m", "30s", midMinute);
    expect(halves).toHaveLength(1);
    expect(halves[0]!.time).toBe(parentT);
    const endMinute = parentT * 1000 + 59_000;
    const both = expandToFinerTf([parent], "1m", "30s", endMinute);
    expect(both).toHaveLength(2);
  });
});
