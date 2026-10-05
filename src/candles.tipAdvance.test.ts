import { describe, expect, it } from "vitest";
import { applyMidToPairCandles, applyPaperClockToPairCandles, seedAllTimeframes } from "./candles";
import type { Candle, PairId, Timeframe } from "./types";
import { TF_SEC } from "./types";

function tipTime(all: Partial<Record<Timeframe, Candle[]>>, tf: Timeframe = "1m"): number {
  const s = all[tf] ?? [];
  return s[s.length - 1]?.time ?? 0;
}

describe("candle tip advances with wall clock (hover must not freeze time)", () => {
  it("applyMidToPairCandles rolls 1m buckets across a multi-minute gap", () => {
    const t0 = Math.floor(Date.now() / 1000 / 60) * 60 - 5 * 60;
    const seeded = seedAllTimeframes("HMC_USDT", 0.08, t0 * 1000);
    const base = (seeded["1m"] ?? []).filter((c) => c.time <= t0);
    expect(base.length).toBeGreaterThan(10);
    expect(tipTime({ "1m": base })).toBe(t0);

    let all: Partial<Record<Timeframe, Candle[]>> = { "1m": base };
    const mid = 0.085;
    // Simulate ~5 live ticks at "now" after a freeze.
    for (let i = 0; i < 5; i++) {
      all = applyMidToPairCandles(all, "HMC_USDT", mid, mid);
    }
    const tip = tipTime(all);
    const nowB = Math.floor(Date.now() / 1000 / 60) * 60;
    expect(tip).toBe(nowB);
    expect(tip - t0).toBeGreaterThanOrEqual(4 * 60);
  });

  it("applyPaperClockToPairCandles also advances tip to current bucket", () => {
    const now = Date.now();
    const early = now - 4 * 60_000;
    let all = applyPaperClockToPairCandles({}, "SUP_USDT", early);
    const tipEarly = tipTime(all);
    expect(tipEarly).toBe(Math.floor(early / 1000 / 60) * 60);

    all = applyPaperClockToPairCandles(all, "SUP_USDT", now);
    const tipNow = tipTime(all);
    expect(tipNow).toBe(Math.floor(now / 1000 / 60) * 60);
    expect(tipNow).toBeGreaterThan(tipEarly);
  });

  for (const pairId of ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"] as PairId[]) {
    it(`${pairId}: mid tip reaches current 1m bucket`, () => {
      const stuckAt = Math.floor(Date.now() / 1000 / 60) * 60 - 3 * TF_SEC["1m"];
      const seeded = seedAllTimeframes(pairId, 0.1, stuckAt * 1000);
      const base = (seeded["1m"] ?? []).filter((c) => c.time <= stuckAt);
      let all: Partial<Record<Timeframe, Candle[]>> = { "1m": base };
      all = applyMidToPairCandles(all, pairId, 0.11, 0.1);
      expect(tipTime(all)).toBe(Math.floor(Date.now() / 1000 / 60) * 60);
    });
  }
});
