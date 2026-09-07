import { describe, expect, it } from "vitest";
import {
  aggregateCandles,
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  deriveAllTimeframes,
  prependOlderCandles,
  seedAllTimeframes,
  seedCandles,
} from "./candles";
import { TIMEFRAMES, type Timeframe } from "./types";

describe("multi-TF aggregation (one market)", () => {
  it("seedAllTimeframes: every TF tip close ≈ mid", () => {
    const mid = 0.00063371;
    const all = seedAllTimeframes("HMC_USDT", mid);
    for (const tf of TIMEFRAMES) {
      const series = all[tf]!;
      expect(series.length).toBeGreaterThan(0);
      expect(series[series.length - 1]!.close).toBeCloseTo(mid, 8);
    }
  });

  it("5m OHLC matches 1m range for the same bucket (exchange aggregation)", () => {
    const mid = 0.00055;
    const base = seedCandles("HMC_USDT", "1m", mid, 120);
    const m5 = aggregateCandles(base, "1m", "5m");
    expect(m5.length).toBeGreaterThan(5);
    for (const bar of m5.slice(0, -1)) {
      const children = base.filter((c) => c.time >= bar.time && c.time < bar.time + 300);
      expect(children.length).toBeGreaterThan(0);
      expect(bar.open).toBeCloseTo(children[0]!.open, 12);
      expect(bar.close).toBeCloseTo(children[children.length - 1]!.close, 12);
      // High/low = extremes of child prints (CEX rule) — may soft-clip pathological only.
      const childHigh = Math.max(...children.map((c) => c.high));
      const childLow = Math.min(...children.map((c) => c.low));
      expect(bar.high).toBeLessThanOrEqual(childHigh + 1e-15);
      expect(bar.low).toBeGreaterThanOrEqual(childLow - 1e-15);
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close) - 1e-15);
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close) + 1e-15);
    }
  });

  it("1D tip tracks 1m tip after live mid walks", () => {
    let all = seedAllTimeframes("HMC_USDT", 0.0007);
    let prev = 0.0007;
    for (const target of [0.00068, 0.00066, 0.00065, 0.00064, 0.00063371]) {
      all = applyMidToPairCandles(all, "HMC_USDT", target, prev);
      prev = target;
    }
    const tip1m = all["1m"]![all["1m"]!.length - 1]!;
    const tip5m = all["5m"]![all["5m"]!.length - 1]!;
    const tip1d = all["1D"]![all["1D"]!.length - 1]!;
    expect(tip5m.close).toBeCloseTo(tip1m.close, 10);
    expect(tip1d.close).toBeCloseTo(tip1m.close, 10);
    // Body still sane on daily
    expect(Math.abs(tip1d.close - tip1d.open) / tip1d.open).toBeLessThan(0.08);
  });

  it("deriveAllTimeframes pads 1D to a CEX-like history length", () => {
    const base = seedCandles("HMC_USDT", CANDLE_BASE_TF, 0.0005, 60);
    const all = deriveAllTimeframes(base, "HMC_USDT");
    expect(all["1D"]!.length).toBeGreaterThan(30);
    expect(all["1D"]![all["1D"]!.length - 1]!.close).toBeCloseTo(all["1m"]![all["1m"]!.length - 1]!.close, 10);
  });

  it("deriveAllTimeframes covers every TIMEFRAMES key", () => {
    const base = seedCandles("HMC_USDT", CANDLE_BASE_TF, 0.0005, 60);
    const all = deriveAllTimeframes(base, "HMC_USDT");
    for (const tf of TIMEFRAMES) {
      expect(all[tf]?.length).toBeGreaterThan(0);
    }
  });

  it("switching TF does not invent a different last price", () => {
    const all = seedAllTimeframes("SUP_USDT", 0.000051);
    const closes = TIMEFRAMES.map((tf) => all[tf]![all[tf]!.length - 1]!.close);
    const max = Math.max(...closes);
    const min = Math.min(...closes);
    expect((max - min) / min).toBeLessThan(1e-9);
  });

  it("intraday wicks stay CEX-proportioned (exist, but do not dwarf bodies)", () => {
    const mid = 0.050063;
    const all = seedAllTimeframes("HMC_USDT", mid);
    for (const tf of ["30s", "5m", "15m", "1H", "1D"] as const) {
      const candles = all[tf]!;
      expect(candles.length).toBeGreaterThan(10);
      let maxBeyondFrac = 0;
      let withWick = 0;
      for (const c of candles.slice(-80)) {
        const bodyMid = (c.open + c.close) / 2;
        if (!(bodyMid > 0)) continue;
        const up = (c.high - Math.max(c.open, c.close)) / bodyMid;
        const dn = (Math.min(c.open, c.close) - c.low) / bodyMid;
        maxBeyondFrac = Math.max(maxBeyondFrac, up, dn);
        if (up > 1e-9 || dn > 1e-9) withWick += 1;
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close) - 1e-15);
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close) + 1e-15);
      }
      // Real exchanges have wicks; paper desk must too (not body-only).
      expect(withWick).toBeGreaterThan(5);
      // Intraday soft visual budget; higher TFs may stack child extremes (CEX-correct).
      const softCap = tf === "1D" || tf === "1H" ? 0.12 : 0.035;
      expect(maxBeyondFrac).toBeLessThanOrEqual(softCap);
    }
  });

  it("prepend on 1m then derive keeps higher-TF history + tip", () => {
    const mid = 0.0005;
    let all = seedAllTimeframes("HMC_USDT", mid);
    const before5 = all["5m"]!.length;
    const tipBefore = all["5m"]![all["5m"]!.length - 1]!.close;
    const first5Before = all["5m"]![0]!.time;
    const nextBase = prependOlderCandles(all[CANDLE_BASE_TF]!, "HMC_USDT", CANDLE_BASE_TF, 120);
    expect(nextBase.length).toBeGreaterThan(all[CANDLE_BASE_TF]!.length);
    all = deriveAllTimeframes(nextBase, "HMC_USDT", all);
    // Already padded to barCountForTf — length stays capped, tip must not jump.
    expect(all["5m"]!.length).toBeGreaterThanOrEqual(before5);
    expect(all["5m"]![all["5m"]!.length - 1]!.close).toBeCloseTo(tipBefore, 8);
    expect(all["5m"]![0]!.time).toBeLessThanOrEqual(first5Before);
  });
});
