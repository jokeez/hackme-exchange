import { describe, expect, it } from "vitest";
import {
  aggregateCandles,
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  deriveAllTimeframes,
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

  it("5m OHLC matches 1m range for the same bucket", () => {
    const mid = 0.00055;
    const base = seedCandles("HMC_USDT", "1m", mid, 120);
    const m5 = aggregateCandles(base, "1m", "5m");
    expect(m5.length).toBeGreaterThan(5);
    for (const bar of m5.slice(0, -1)) {
      const children = base.filter((c) => c.time >= bar.time && c.time < bar.time + 300);
      expect(children.length).toBeGreaterThan(0);
      expect(bar.open).toBeCloseTo(children[0]!.open, 12);
      expect(bar.close).toBeCloseTo(children[children.length - 1]!.close, 12);
      expect(bar.high).toBeCloseTo(Math.max(...children.map((c) => c.high)), 12);
      expect(bar.low).toBeCloseTo(Math.min(...children.map((c) => c.low)), 12);
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

  it("deriveAllTimeframes covers every TIMEFRAMES key", () => {
    const base = seedCandles("HMC_USDT", CANDLE_BASE_TF, 0.0005, 60);
    const all = deriveAllTimeframes(base);
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
});
