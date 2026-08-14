import { describe, expect, it } from "vitest";
import {
  HISTORY_LEFT_EDGE,
  historyBarsToFetch,
  mergeMountOpts,
} from "./chart";
import { MAX_CANDLES, prependOlderCandles, seedCandles, barCountForTf, CHART_GENESIS_UNIX } from "./candles";
import { TIMEFRAMES, type ChartMountOpts, type Timeframe } from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS } from "./types";

function baseOpts(extra?: Partial<ChartMountOpts>): ChartMountOpts {
  return {
    pairId: "HMC_USDT",
    tf: "15m",
    mode: "candles",
    settings: structuredClone(DEFAULT_CHART_SETTINGS),
    overlays: structuredClone(DEFAULT_CHART_OVERLAYS),
    drawings: [],
    orders: [],
    ...extra,
  };
}

describe("historyBarsToFetch", () => {
  it("returns 0 when not near the left edge", () => {
    expect(historyBarsToFetch(HISTORY_LEFT_EDGE)).toBe(0);
    expect(historyBarsToFetch(HISTORY_LEFT_EDGE + 10)).toBe(0);
    expect(historyBarsToFetch(200)).toBe(0);
  });

  it("requests at least a min batch near the edge", () => {
    expect(historyBarsToFetch(HISTORY_LEFT_EDGE - 1)).toBeGreaterThanOrEqual(120);
    expect(historyBarsToFetch(10)).toBeGreaterThanOrEqual(120);
  });

  it("scales up when the user overshoots far past the left edge", () => {
    const mild = historyBarsToFetch(5);
    const deep = historyBarsToFetch(-400);
    expect(deep).toBeGreaterThan(mild);
    expect(deep).toBeGreaterThan(400);
  });
});

describe("mergeMountOpts", () => {
  it("preserves onNeedHistory when refresh opts omit callbacks", () => {
    const onNeedHistory = () => 12;
    const onCrosshair = () => {};
    const mounted = baseOpts({ onNeedHistory, onCrosshair });
    const refresh = baseOpts({ watermark: "HMC · 1m" });
    const merged = mergeMountOpts(mounted, refresh);
    expect(merged.onNeedHistory).toBe(onNeedHistory);
    expect(merged.onCrosshair).toBe(onCrosshair);
    expect(merged.watermark).toBe("HMC · 1m");
  });

  it("allows explicit callback replacement", () => {
    const a = () => 1;
    const b = () => 2;
    const merged = mergeMountOpts(baseOpts({ onNeedHistory: a }), baseOpts({ onNeedHistory: b }));
    expect(merged.onNeedHistory).toBe(b);
  });

  it("regression: repeated chartOpts()-style refreshes keep history loader", () => {
    let loads = 0;
    const onNeedHistory = (bars: number) => {
      loads += 1;
      return bars;
    };
    let opts = mergeMountOpts(null, baseOpts({ onNeedHistory }));
    for (let i = 0; i < 5; i++) {
      // Mimics setCandleData(next, { ...chartOpts(), drawingsLocked }) after each pan.
      opts = mergeMountOpts(opts, baseOpts({ drawingsLocked: true }));
    }
    expect(opts.onNeedHistory).toBe(onNeedHistory);
    expect(opts.onNeedHistory?.(120)).toBe(120);
    expect(loads).toBe(1);
  });
});

describe("prependOlderCandles across timeframes", () => {
  it.each(TIMEFRAMES)("grows contiguous history for %s (capped at genesis)", (tf: Timeframe) => {
    const mid = 0.00042;
    const base = seedCandles("HMC_USDT", tf, mid, Math.min(40, barCountForTf(tf)));
    const grown = prependOlderCandles(base, "HMC_USDT", tf, 80);
    expect(grown.length).toBeGreaterThanOrEqual(base.length);
    expect(grown.length).toBeLessThanOrEqual(base.length + 80);
    expect(grown[0].time).toBeGreaterThanOrEqual(CHART_GENESIS_UNIX);
    for (let i = 1; i < grown.length; i++) {
      expect(grown[i].time).toBeGreaterThan(grown[i - 1].time);
    }
    expect(grown[grown.length - 1].time).toBe(base[base.length - 1].time);
  });

  it("stops growing once MAX_CANDLES is reached (no silent no-op churn)", () => {
    const near = seedCandles("HMC_USDT", "1m", 0.0004, MAX_CANDLES - 10);
    const a = prependOlderCandles(near, "HMC_USDT", "1m", 50);
    expect(a.length).toBe(MAX_CANDLES);
    const b = prependOlderCandles(a, "HMC_USDT", "1m", 120);
    expect(b).toBe(a);
    expect(b.length).toBe(MAX_CANDLES);
  });

  it("supports repeated left-edge loads until genesis floor", () => {
    let candles = seedCandles("SUP_USDT", "5m", 0.00005, 100);
    let grew = false;
    for (let i = 0; i < 20; i++) {
      const need = historyBarsToFetch(-20);
      const next = prependOlderCandles(candles, "SUP_USDT", "5m", need);
      if (next.length > candles.length) grew = true;
      if (next.length === candles.length) break;
      candles = next;
    }
    expect(grew).toBe(true);
    expect(candles[0].time).toBeGreaterThanOrEqual(CHART_GENESIS_UNIX);
  });
});
