/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHART_PREFS_KEY,
  applyChartPrefsToState,
  chartPrefsFromState,
  isDefaultChartAppearance,
  loadChartPrefs,
  mergeChartPrefsOnLoad,
  saveChartPrefs,
} from "./chartPrefs";
import { ensureCandles, loadState, resetDemo, saveState } from "./store";
import { paperPairMid } from "./market";
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

  it("round-trips neon + custom wick colors + pair/tf", () => {
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
      chartOverlays: baseState().chartOverlays,
      indicatorConfig: baseState().indicatorConfig,
      drawingsLocked: true,
      activeTf: "1H",
      activePair: "SUP_USDT",
    });
    expect(saveChartPrefs(prefs)).toBe(true);
    const loaded = loadChartPrefs();
    expect(loaded?.chartSettings.candleScheme).toBe("neon");
    expect(loaded?.chartSettings.logScale).toBe(true);
    expect(loaded?.chartSettings.candleStyle.bullBody).toBe("#112233");
    expect(loaded?.chartMode).toBe("heikin");
    expect(loaded?.activeTf).toBe("1H");
    expect(loaded?.activePair).toBe("SUP_USDT");
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

  it("mergeChartPrefsOnLoad migrates blob custom over default sidecar", () => {
    const s = baseState({
      chartSettings: { ...structuredClone(DEFAULT_CHART_SETTINGS), candleScheme: "neon" },
      activeTf: "1D",
    });
    saveChartPrefs({
      v: 1,
      savedAt: 1,
      chartSettings: structuredClone(DEFAULT_CHART_SETTINGS),
      chartMode: "candles",
      chartOverlays: s.chartOverlays,
      indicatorConfig: s.indicatorConfig,
      drawingsLocked: false,
      activeTf: "15m",
      activePair: "HMC_USDT",
    });
    mergeChartPrefsOnLoad(s);
    expect(s.chartSettings.candleScheme).toBe("neon");
    expect(s.activeTf).toBe("1D");
    expect(isDefaultChartAppearance(loadChartPrefs()!)).toBe(false);
  });
});

describe("ensureCandles tip OHLC", () => {
  it("rebuilds tip from shared paper clock (valid OHLC, close ≈ mid)", () => {
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
    ensureCandles(s, market);
    const tip = s.candles.HMC_USDT!["1m"]![s.candles.HMC_USDT!["1m"]!.length - 1]!;
    expect(tip.high).toBeGreaterThanOrEqual(Math.max(tip.open, tip.close));
    expect(tip.low).toBeLessThanOrEqual(Math.min(tip.open, tip.close));
    // Close tracks shared clock; allow tiny drift if timers advanced mid-call.
    expect(tip.close).toBeCloseTo(paperPairMid("HMC_USDT"), 5);
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
      activeTf: "2H",
      activePair: "HMC_BTC",
    });
    applyChartPrefsToState(s, prefs);
    expect(s.chartSettings.candleScheme).toBe("neon");
    expect(s.chartMode).toBe("area");
    expect(s.activeTf).toBe("2H");
    expect(s.activePair).toBe("HMC_BTC");
  });
});
