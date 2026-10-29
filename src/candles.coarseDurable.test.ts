/**
 * Coarse durable /candles merge restores multi-day 1D history after SoT
 * (no synth pad / no local cache) — no flying calendar voids.
 */
import { describe, expect, it } from "vitest";
import {
  CANDLE_BASE_TF,
  candlesAreContiguous,
  hydrateLiveCandlesFromPrints,
  isFlatGapBridge,
  mergeDurableCoarseTfCandles,
} from "./candles";
import type { Candle } from "./types";

const nowMs = Date.UTC(2026, 9, 29, 12, 0, 0);
const day = 86_400;

function dayBar(dayOffset: number, px: number, vol = 10): Candle {
  const time = Math.floor(Date.UTC(2026, 9, 24 + dayOffset, 0, 0, 0) / 1000);
  return {
    time,
    open: px,
    high: px * 1.01,
    low: px * 0.99,
    close: px,
    volume: vol,
  };
}

describe("mergeDurableCoarseTfCandles", () => {
  it("restores contiguous 1D history + flat bridges for quiet UTC days", () => {
    // Sparse 1m tip window only (post-SoT hydrate) — not enough for multi-day 1D.
    const tipSec = Math.floor(nowMs / 1000 / 60) * 60;
    const m1: Candle[] = [];
    for (let i = 30; i >= 0; i--) {
      const px = 0.077 + i * 0.00001;
      m1.push({
        time: tipSec - i * 60,
        open: px,
        high: px * 1.001,
        low: px * 0.999,
        close: px,
        volume: 1,
      });
    }
    const from1m = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tipSec * 1000 + 100, price: 0.0778, amountBase: 2 }],
      0.0778,
      nowMs,
      null,
      undefined,
      m1,
    );
    // Without coarse durable, 1D spans only the 1m window (~1 day).
    expect((from1m["1D"]?.length ?? 0) <= 3).toBe(true);

    // Server 1d: Oct 24 print, gap Oct 25–27, Oct 28 Soft-MM burst (screenshot class).
    const durable1d: Candle[] = [
      dayBar(0, 0.0745, 50), // Oct 24
      // Oct 25–27 missing on purpose — merge must flat-bridge
      dayBar(4, 0.0776, 200), // Oct 28
    ];
    const healed = mergeDurableCoarseTfCandles(
      from1m,
      { "1D": durable1d },
      { pairId: "HMC_USDT", nowMs },
    );
    const series = healed["1D"]!;
    expect(series.length).toBeGreaterThanOrEqual(5);
    expect(candlesAreContiguous(series, "1D")).toBe(true);

    const byDay = new Map(series.map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), c]));
    for (const d of ["2026-10-25", "2026-10-26", "2026-10-27"]) {
      const bar = byDay.get(d)!;
      expect(bar, d).toBeTruthy();
      expect(isFlatGapBridge(bar)).toBe(true);
      expect(bar.close).toBeCloseTo(0.0745, 8);
    }
    const oct28 = byDay.get("2026-10-28")!;
    expect(oct28.volume).toBeGreaterThan(0);
    expect(oct28.close).toBeCloseTo(0.0776, 8);
    // Tip close pinned to last trade.
    expect(series[series.length - 1]!.close).toBeCloseTo(0.0778, 6);
  });

  it("does not invent mid-walk synth — durable closed OHLC stay immutable", () => {
    const durable1d = [dayBar(0, 0.07, 5), dayBar(1, 0.071, 5), dayBar(2, 0.072, 5)];
    const tipSec = Math.floor(nowMs / 1000 / 60) * 60;
    const base = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tipSec * 1000, price: 0.08, amountBase: 1 }],
      0.08,
      nowMs,
      null,
      undefined,
      [
        {
          time: tipSec - 60,
          open: 0.079,
          high: 0.0795,
          low: 0.0785,
          close: 0.079,
          volume: 1,
        },
      ],
    );
    const next = mergeDurableCoarseTfCandles(base, { "1D": durable1d }, { nowMs });
    for (const raw of durable1d) {
      const hit = next["1D"]!.find((c) => c.time === raw.time)!;
      expect(hit.open).toBeCloseTo(raw.open, 12);
      expect(hit.close).toBeCloseTo(raw.close, 12);
      expect(hit.high).toBeCloseTo(raw.high, 12);
      expect(hit.low).toBeCloseTo(raw.low, 12);
      expect(hit.volume).toBe(raw.volume);
    }
    // 1m tip path unchanged.
    expect(next[CANDLE_BASE_TF]!.at(-1)!.close).toBeCloseTo(0.08, 8);
  });
});
