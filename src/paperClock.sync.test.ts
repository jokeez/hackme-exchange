/**
 * Adversarial cross-device paper clock sync — identical OHLC at the same wall clock.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyPaperClockToPairCandles,
  seedAllTimeframes,
  tipBarFromPaperClock,
  CANDLE_BASE_TF,
} from "./candles";
import { paperPairMid } from "./market";
import { parseDemoImport, exportDemoJson } from "./demoIo";
import { baseState, installMemoryLocalStorage, sampleMarket } from "./testFixtures";
import { ensureCandles, loadState, saveState } from "./store";
import { STORAGE_KEY } from "./theme";
import { TIMEFRAMES } from "./types";

describe("paper clock cross-device sync", () => {
  it("tipBarFromPaperClock is identical for two clients at the same nowMs", () => {
    const now = Date.parse("2026-09-07T12:34:56.789Z");
    const t = Math.floor(now / 1000 / 60) * 60;
    const mid = paperPairMid("HMC_USDT", now);
    const a = tipBarFromPaperClock("HMC_USDT", "1m", t, now, mid);
    const b = tipBarFromPaperClock("HMC_USDT", "1m", t, now, mid);
    expect(b).toEqual(a);
    expect(a.close).toBe(mid);
  });

  it("poisoned prior tip H/L does not stick after paper clock tip sync", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:34:20.000Z"));
    const now = Date.now();
    const mid = paperPairMid("HMC_USDT", now);
    const t = Math.floor(now / 1000 / 60) * 60;
    const clean = seedAllTimeframes("HMC_USDT", mid, now);
    const poisoned = structuredClone(clean);
    const tip = poisoned[CANDLE_BASE_TF]![poisoned[CANDLE_BASE_TF]!.length - 1]!;
    tip.high = mid * 50;
    tip.low = mid * 0.01;
    const healed = applyPaperClockToPairCandles(poisoned, "HMC_USDT", now);
    const nextTip = healed[CANDLE_BASE_TF]![healed[CANDLE_BASE_TF]!.length - 1]!;
    const expected = tipBarFromPaperClock("HMC_USDT", "1m", t, now, mid);
    expect(nextTip.high).toBeCloseTo(expected.high, 12);
    expect(nextTip.low).toBeCloseTo(expected.low, 12);
    expect(nextTip.high).toBeLessThan(mid * 2);
    vi.useRealTimers();
  });

  it("two clients with divergent local history converge on ensureCandles", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T15:00:00.000Z"));
    const market = sampleMarket();
    const a = baseState();
    const b = baseState();
    a.candles = {
      HMC_USDT: {
        "1m": Array.from({ length: 40 }, (_, i) => ({
          time: 1_700_000_000 + i * 60,
          open: 9,
          high: 99,
          low: 0.001,
          close: 9,
          volume: 1,
        })),
      },
    };
    ensureCandles(a, market);
    ensureCandles(b, market);
    for (const tf of TIMEFRAMES) {
      expect(b.candles.HMC_USDT?.[tf]).toEqual(a.candles.HMC_USDT?.[tf]);
    }
    vi.useRealTimers();
  });

  it("import drops candles and export never ships OHLC", () => {
    installMemoryLocalStorage();
    const s = baseState();
    ensureCandles(s, sampleMarket());
    expect(s.candles.HMC_USDT?.["1m"]?.length).toBeGreaterThan(5);
    const raw = exportDemoJson(s);
    expect(JSON.parse(raw).state.candles).toEqual({});
    const parsed = parseDemoImport(
      JSON.stringify({
        state: {
          ...s,
          candles: {
            HMC_USDT: {
              "1m": [{ time: 1, open: 9, high: 99, low: 1, close: 9, volume: 1 }],
            },
          },
          oracleAnchor: 0.0004,
        },
      }),
    );
    expect(parsed.candles).toEqual({});
    expect(parsed.oracleAnchor).toBe(0.05);
  });

  it("saveState never persists candles; load always empty OHLC", () => {
    const map = installMemoryLocalStorage();
    const s = baseState();
    ensureCandles(s, sampleMarket());
    expect(saveState(s)).toBe(true);
    expect(JSON.parse(map.get(STORAGE_KEY)!).candles).toEqual({});
    expect(loadState().candles).toEqual({});
  });
});
