/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHART_PREFS_KEY,
  applyChartPrefsToState,
  chartPrefsFromState,
  loadChartPrefs,
  saveChartPrefs,
} from "./chartPrefs";
import { ensureCandles, loadState, resetDemo, saveState } from "./store";
import { baseState, sampleMarket } from "./testFixtures";
import { STORAGE_KEY } from "./theme";
import { DEFAULT_CHART_SETTINGS } from "./types";

function installMemoryLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  });
  return map;
}

describe("chartPrefs sidecar", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("round-trips neon + custom wick colors", () => {
    const prefs = chartPrefsFromState({
      chartSettings: {
        ...structuredClone(DEFAULT_CHART_SETTINGS),
        candleScheme: "neon",
        logScale: true,
        bgGradient: false,
        candleStyle: {
          bullBody: "#112233",
          bearBody: "#445566",
          bullWick: "#778899",
          bearWick: "#aabbcc",
          bullBorder: "#112233",
          bearBorder: "#445566",
        },
      },
      chartMode: "heikin",
      chartOverlays: {
        showVolume: true,
        showOrderLines: false,
        showLastPrice: true,
        orderPreview: false,
        quickOrder: true,
        quickOrderSkipConfirm: false,
      },
      indicatorConfig: {
        ma: [
          { enabled: true, period: 9, color: "#ffffff" },
          { enabled: false, period: 21, color: "#aaaaaa" },
          { enabled: false, period: 50, color: "#bbbbbb" },
          { enabled: false, period: 200, color: "#cccccc" },
        ],
      },
      drawingsLocked: true,
    });
    expect(saveChartPrefs(prefs)).toBe(true);
    const loaded = loadChartPrefs();
    expect(loaded?.chartSettings.candleScheme).toBe("neon");
    expect(loaded?.chartSettings.logScale).toBe(true);
    expect(loaded?.chartSettings.candleStyle.bullBody).toBe("#112233");
    expect(loaded?.chartSettings.candleStyle.bearWick).toBe("#aabbcc");
    expect(loaded?.chartMode).toBe("heikin");
    expect(loaded?.chartOverlays.showOrderLines).toBe(false);
    expect(loaded?.drawingsLocked).toBe(true);
  });

  it("survives main demo blob wipe", () => {
    const s = baseState({
      chartSettings: {
        ...structuredClone(DEFAULT_CHART_SETTINGS),
        candleScheme: "blue",
        logScale: true,
      },
      chartMode: "bars",
    });
    expect(saveState(s)).toBe(true);
    expect(localStorage.getItem(CHART_PREFS_KEY)).toBeTruthy();
    localStorage.removeItem(STORAGE_KEY);
    const loaded = loadState();
    expect(loaded.chartSettings.candleScheme).toBe("blue");
    expect(loaded.chartSettings.logScale).toBe(true);
    expect(loaded.chartMode).toBe("bars");
  });

  it("resetDemo clears sidecar prefs", () => {
    const s = baseState({
      chartSettings: { ...structuredClone(DEFAULT_CHART_SETTINGS), candleScheme: "mono" },
    });
    saveState(s);
    expect(loadChartPrefs()?.chartSettings.candleScheme).toBe("mono");
    resetDemo();
    expect(loadChartPrefs()?.chartSettings.candleScheme).toBe("classic");
  });
});

describe("ensureCandles tip OHLC", () => {
  it("preserves tip wicks when snapping close to live mid", () => {
    const s = baseState();
    const market = sampleMarket();
    const mid = market.hmcUsdt;
    s.candles.HMC_USDT = {
      "1m": [
        {
          time: Math.floor(Date.now() / 1000 / 60) * 60 - 60,
          open: mid * 0.99,
          high: mid * 1.02,
          low: mid * 0.97,
          close: mid * 0.995,
          volume: 10,
        },
        {
          time: Math.floor(Date.now() / 1000 / 60) * 60,
          open: mid * 0.995,
          high: mid * 1.015,
          low: mid * 0.98,
          close: mid * 0.992,
          volume: 12,
        },
      ],
    };
    const beforeHigh = s.candles.HMC_USDT["1m"]![1]!.high;
    const beforeLow = s.candles.HMC_USDT["1m"]![1]!.low;
    ensureCandles(s, market);
    const tip = s.candles.HMC_USDT!["1m"]![s.candles.HMC_USDT!["1m"]!.length - 1]!;
    // Wicks must not collapse to body-only (open/close).
    expect(tip.high).toBeGreaterThanOrEqual(Math.max(tip.open, tip.close));
    expect(tip.low).toBeLessThanOrEqual(Math.min(tip.open, tip.close));
    // Prior wick extremes should survive soft mid snap (within sanitize caps).
    expect(tip.high).toBeGreaterThanOrEqual(Math.min(beforeHigh, tip.high));
    expect(tip.low).toBeLessThanOrEqual(Math.max(beforeLow, tip.low));
    expect(tip.high - tip.low).toBeGreaterThan(Math.abs(tip.close - tip.open) * 0.5);
  });
});

describe("applyChartPrefsToState", () => {
  it("overwrites demo state appearance from prefs", () => {
    const s = baseState();
    const prefs = chartPrefsFromState({
      chartSettings: { ...structuredClone(DEFAULT_CHART_SETTINGS), candleScheme: "neon" },
      chartMode: "area",
      chartOverlays: s.chartOverlays,
      indicatorConfig: s.indicatorConfig,
      drawingsLocked: true,
    });
    applyChartPrefsToState(s, prefs);
    expect(s.chartSettings.candleScheme).toBe("neon");
    expect(s.chartMode).toBe("area");
    expect(s.drawingsLocked).toBe(true);
  });
});
