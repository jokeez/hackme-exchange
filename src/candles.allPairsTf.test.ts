/**
 * Matrix: every listed pair × every TIMEFRAME — sticky Soft-MM must finalize
 * distinct closed closes (no «шильдики» glued to Last) and tip tracks mid.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  healFlatPaperBars,
  seedAllTimeframes,
  upsertTick,
} from "./candles";
import { PAIRS } from "./pairs";
import { TIMEFRAMES, type PairId, type Timeframe } from "./types";

const PAIR_IDS = PAIRS.map((p) => p.id as PairId);
const STICKY: Record<string, number> = {
  HMC_USDT: 0.05279729,
  SUP_USDT: 0.25008,
  HMC_SUP: 0.20001,
  // Soft-MM REF ≈ 7.4e-5 BTC/HMC (not the old micro 7.4e-10 peg).
  HMC_BTC: 0.00074074,
  SUP_BTC: 0.00370370,
};

function stickyMid(pairId: PairId): number {
  return STICKY[pairId] ?? 0.05;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("all pairs × sticky mid finalize (1m base)", () => {
  for (const pairId of PAIR_IDS) {
    it(`${pairId}: rollover yields diverse closed closes; tip ≈ Last`, () => {
      const mid = stickyMid(pairId);
      // Must be 1m-aligned — misaligned seed forks gap steps.
      const t0 = Math.floor(1_810_000_000 / 60) * 60;
      vi.useFakeTimers();
      vi.setSystemTime(t0 * 1000);
      let series = [
        {
          time: t0,
          open: mid * 0.99,
          high: mid * 1.01,
          low: mid * 0.98,
          close: mid,
          volume: 100,
        },
      ];
      for (let i = 1; i <= 18; i++) {
        vi.setSystemTime((t0 + i * 60) * 1000 + 12_000);
        series = upsertTick(series, "1m", mid, pairId, mid);
      }
      vi.useRealTimers();

      const closed = series.slice(0, -1);
      expect(closed.length).toBeGreaterThan(10);
      const unique = new Set(closed.map((c) => c.close.toFixed(10)));
      expect(unique.size).toBeGreaterThan(5);
      const glued = closed.filter((c) => Math.abs(c.close - mid) / mid < 0.00005).length;
      expect(glued).toBeLessThan(closed.length * 0.5);
      const tip = series[series.length - 1]!;
      expect(Math.abs(tip.close - mid) / mid).toBeLessThan(0.002);
      // Contiguity
      for (let i = 1; i < series.length; i++) {
        expect(series[i]!.time - series[i - 1]!.time).toBe(60);
      }
    });
  }
});

describe("all pairs × all TIMEFRAMES via applyMid sticky", () => {
  for (const pairId of PAIR_IDS) {
    it(`${pairId}: every TF tip ≈ mid; closed 1m not all glued`, () => {
      const mid = stickyMid(pairId);
      let all = seedAllTimeframes(pairId, mid, 1_820_000_000_000);
      let prev = mid;
      // Walk a few sticky ticks (same mid) so tip updates without inventing cliffs.
      for (let i = 0; i < 8; i++) {
        all = applyMidToPairCandles(all, pairId, mid, prev, { syntheticVolume: false });
        prev = mid;
      }
      for (const tf of TIMEFRAMES) {
        const series = all[tf];
        expect(series?.length, `${pairId} ${tf}`).toBeGreaterThan(0);
        const tip = series![series!.length - 1]!;
        expect(Math.abs(tip.close - mid) / mid, `${pairId} ${tf} tip`).toBeLessThan(0.002);
        expect(tip.high).toBeGreaterThanOrEqual(Math.max(tip.open, tip.close) - 1e-15);
        expect(tip.low).toBeLessThanOrEqual(Math.min(tip.open, tip.close) + 1e-15);
      }
      const base = all[CANDLE_BASE_TF]!;
      const closed = base.slice(0, -1);
      if (closed.length >= 8) {
        const unique = new Set(closed.slice(-40).map((c) => c.close.toFixed(10)));
        // Seeded history already has diverse closes; sticky tip must not flatten the tail.
        expect(unique.size).toBeGreaterThan(3);
      }
    });
  }
});

describe("healFlatPaperBars on every pair (шильдики comb)", () => {
  for (const pairId of PAIR_IDS) {
    it(`${pairId}: stuck-close comb gets distinct closes`, () => {
      const mid = stickyMid(pairId);
      const t0 = 1_700_100_000;
      const comb = Array.from({ length: 24 }, (_, i) => ({
        time: t0 + i * 60,
        open: mid * (1 + ((i % 5) - 2) * 0.0008),
        high: mid * 1.002,
        low: mid * 0.998,
        close: mid, // glued Last
        volume: 10,
      }));
      const healed = healFlatPaperBars(pairId, "1m", comb, mid, (t0 + 23 * 60) * 1000 + 20_000);
      const closed = healed.slice(0, -1);
      const unique = new Set(closed.map((c) => c.close.toFixed(10)));
      expect(unique.size).toBeGreaterThan(6);
      expect(Math.abs(healed[healed.length - 1]!.close - mid) / mid).toBeLessThan(0.002);
    });
  }
});

describe("higher TF aggregation tip parity across pairs", () => {
  const sampleTf: Timeframe[] = ["5m", "15m", "1H", "1D"];
  for (const pairId of PAIR_IDS) {
    it(`${pairId}: coarser TF tip close matches 1m tip`, () => {
      const mid = stickyMid(pairId);
      let all = seedAllTimeframes(pairId, mid);
      all = applyMidToPairCandles(all, pairId, mid * 1.001, mid);
      const tip1m = all["1m"]![all["1m"]!.length - 1]!.close;
      for (const tf of sampleTf) {
        const tip = all[tf]![all[tf]!.length - 1]!.close;
        expect(Math.abs(tip - tip1m) / tip1m, `${pairId} ${tf}`).toBeLessThan(1e-6);
      }
    });
  }
});

describe("applyMid backfills holes on every pair", () => {
  for (const pairId of PAIR_IDS) {
    it(`${pairId}: gapped 1m becomes contiguous after applyMid`, () => {
      const mid = stickyMid(pairId);
      const t0 = Math.floor(Date.now() / 1000 / 60) * 60 - 30 * 60;
      const gapped = [
        {
          time: t0,
          open: mid * 0.99,
          high: mid * 1.01,
          low: mid * 0.98,
          close: mid * 0.995,
          volume: 10,
        },
        // skip 10 minutes
        {
          time: t0 + 12 * 60,
          open: mid,
          high: mid * 1.002,
          low: mid * 0.998,
          close: mid,
          volume: 10,
        },
      ];
      const next = applyMidToPairCandles({ "1m": gapped }, pairId, mid, mid, {
        syntheticVolume: false,
      });
      const base = next["1m"]!;
      expect(base.length).toBeGreaterThan(10);
      for (let i = 1; i < base.length; i++) {
        expect(base[i]!.time - base[i - 1]!.time).toBe(60);
      }
      for (const tf of TIMEFRAMES) {
        const series = next[tf]!;
        expect(series?.length, tf).toBeGreaterThan(0);
        // Tip tracks Last within a few bps; gap flat-fill + tip texture can sit ~55 bps off.
        const tipTol = pairId.endsWith("_BTC") ? 0.01 : 0.008;
        expect(Math.abs(series[series.length - 1]!.close - mid) / mid).toBeLessThan(tipTol);
      }
    });
  }
});
