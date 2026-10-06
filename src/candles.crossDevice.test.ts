/**
 * Cross-device / cross-TF candle convergence — same prints+tip must paint the same OHLC
 * regardless of divergent session caches or client A vs B.
 */
import { describe, expect, it } from "vitest";
import {
  CANDLE_BASE_TF,
  hydrateLiveCandlesFromPrints,
  pinAllTfTipsToBase,
  seedAllTimeframes,
  type CandlePrint,
} from "./candles";
import { PAIRS } from "./pairs";
import { TIMEFRAMES, type Candle, type PairId } from "./types";

const PAIR_IDS = PAIRS.map((p) => p.id as PairId);

function poisonedCache(tip: number, bucketStart: number): Candle[] {
  // Divergent device cache: wrong opens around the print window.
  return Array.from({ length: 30 }, (_, i) => {
    const t = bucketStart - (30 - i) * 60;
    const skew = 1 + ((i % 7) - 3) * 0.04;
    const mid = tip * skew;
    return {
      time: t,
      open: mid * 0.99,
      high: mid * 1.08,
      low: mid * 0.92,
      close: mid,
      volume: 1,
    };
  });
}

describe("cross-device live hydrate converges", () => {
  for (const pairId of PAIR_IDS) {
    it(`${pairId}: divergent caches + same prints → identical print buckets & TF tips`, () => {
      const tip = pairId.endsWith("_BTC") ? 0.00074 : pairId.startsWith("SUP") ? 0.25 : 0.052;
      const nowMs = 1_820_000_000_000;
      const tipBucket = Math.floor(nowMs / 1000 / 60) * 60;
      const prints: CandlePrint[] = [];
      for (let i = 0; i < 40; i++) {
        const ts = (tipBucket - 20 * 60 + i * 30) * 1000;
        const px = tip * (1 + Math.sin(i / 3) * 0.01);
        prints.push({ ts, price: px, amountBase: 1 + (i % 5) });
      }
      const cacheA = poisonedCache(tip * 1.2, tipBucket - 60);
      const cacheB = poisonedCache(tip * 0.75, tipBucket - 60);

      const a = hydrateLiveCandlesFromPrints(pairId, prints, tip, nowMs, cacheA);
      const b = hydrateLiveCandlesFromPrints(pairId, prints, tip, nowMs, cacheB);

      const baseA = a[CANDLE_BASE_TF]!;
      const baseB = b[CANDLE_BASE_TF]!;
      expect(baseA.length).toBeGreaterThan(10);
      expect(baseB.length).toBe(baseA.length);

      // Print-covered buckets must match exactly (open/high/low/close).
      const printTimes = new Set(
        prints.map((p) => Math.floor(p.ts / 1000 / 60) * 60),
      );
      for (const t of printTimes) {
        const ca = baseA.find((c) => c.time === t);
        const cb = baseB.find((c) => c.time === t);
        expect(ca, `${pairId} missing ${t}`).toBeTruthy();
        expect(cb, `${pairId} missing ${t}`).toBeTruthy();
        expect(ca!.open).toBeCloseTo(cb!.open, 10);
        expect(ca!.high).toBeCloseTo(cb!.high, 10);
        expect(ca!.low).toBeCloseTo(cb!.low, 10);
        expect(ca!.close).toBeCloseTo(cb!.close, 10);
      }

      // Every TF tip close matches 1m tip on both devices.
      const tip1m = baseA[baseA.length - 1]!.close;
      for (const tf of TIMEFRAMES) {
        expect(a[tf]![a[tf]!.length - 1]!.close).toBeCloseTo(tip1m, 10);
        expect(b[tf]![b[tf]!.length - 1]!.close).toBeCloseTo(tip1m, 10);
      }
    });
  }
});

describe("paper seedAllTimeframes device parity", () => {
  for (const pairId of PAIR_IDS) {
    it(`${pairId}: same mid+now → identical tips on all TFs`, () => {
      const mid = pairId.endsWith("_BTC") ? 0.00074074 : 0.05279729;
      const now = 1_820_000_000_000;
      const a = seedAllTimeframes(pairId, mid, now);
      const b = seedAllTimeframes(pairId, mid, now);
      for (const tf of TIMEFRAMES) {
        const ta = a[tf]![a[tf]!.length - 1]!;
        const tb = b[tf]![b[tf]!.length - 1]!;
        expect(ta.close).toBeCloseTo(tb.close, 12);
        expect(ta.open).toBeCloseTo(tb.open, 12);
        expect(ta.time).toBe(tb.time);
      }
    });
  }
});

describe("pinAllTfTipsToBase", () => {
  it("forces every TF tip to 1m close", () => {
    const mid = 0.05;
    const all = seedAllTimeframes("HMC_USDT", mid);
    const base = all["1m"]!;
    base[base.length - 1]!.close = 0.06111;
    pinAllTfTipsToBase(all, base);
    for (const tf of TIMEFRAMES) {
      expect(all[tf]![all[tf]!.length - 1]!.close).toBeCloseTo(0.06111, 10);
    }
  });
});
