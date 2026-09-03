import { describe, expect, it } from "vitest";
import {
  aggregateCandles,
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  deriveAllTimeframes,
  reaggregateLiveBarsFromBase,
  seedAllTimeframes,
} from "./candles";
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
        expect(cur.open, `${tf} open @${i}`).toBeCloseTo(prev.close, 10);
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
      const closes = TIMEFRAMES.map((tf) => all[tf]![all[tf]!.length - 1]!.close);
      const max = Math.max(...closes);
      const min = Math.min(...closes);
      expect((max - min) / Math.max(min, 1e-18), pairId).toBeLessThan(1e-8);
    }
  });
});
