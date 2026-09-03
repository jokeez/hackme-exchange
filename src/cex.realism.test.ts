/**
 * CEX-realism regression pack — paper matching, candle OHLC, durable prefs.
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMidToPairCandles } from "./candles";
import { isDefaultChartAppearance, loadChartPrefs, mergeChartPrefsOnLoad, saveChartPrefs, CHART_PREFS_KEY } from "./chartPrefs";
import { isMarketableLimit, placeOrder, processOpenOrders, validateLimitOrder } from "./orders";
import { baseState, sampleMarket } from "./testFixtures";
import { midForPair } from "./market";
import { PAIRS } from "./pairs";
import { loadState, needsCandleReseedForMarket, saveState } from "./store";
import { STORAGE_KEY } from "./theme";
import { DEFAULT_CHART_SETTINGS } from "./types";
import { loadOrderDesk, saveOrderDesk } from "./uiPrefs";

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

describe("CEX paper matching", () => {
  it("rests non-marketable GTC limits on the book", () => {
    const s = baseState();
    const m = sampleMarket();
    const mid = m.hmcUsdt;
    const res = placeOrder(s, "HMC_USDT", "buy", "limit", 100, mid * 0.95, undefined, undefined, "GTC", false, m);
    expect("ok" in res).toBe(false);
    if ("ok" in res) return;
    expect(res.status).toBe("open");
    expect(res.filledBase).toBe(0);
  });

  it("fills marketable limits immediately as taker", () => {
    const s = baseState();
    const m = sampleMarket();
    const mid = m.hmcUsdt;
    const res = placeOrder(s, "HMC_USDT", "buy", "limit", 50, mid * 1.01, undefined, undefined, "GTC", false, m);
    expect("ok" in res).toBe(false);
    if ("ok" in res) return;
    expect(res.status).toBe("filled");
    expect(res.filledBase).toBe(50);
  });

  it("rejects post-only that would cross", () => {
    const m = sampleMarket();
    const mid = m.hmcUsdt;
    const check = validateLimitOrder("buy", mid * 1.01, mid, "GTC", true);
    expect(check.ok).toBe(false);
  });

  it("IOC cancels when not immediately marketable", () => {
    const s = baseState();
    const m = sampleMarket();
    const mid = m.hmcUsdt;
    const res = placeOrder(s, "HMC_USDT", "buy", "limit", 80, mid * 0.9, undefined, undefined, "IOC", false, m);
    expect(res).toEqual({ ok: false, reason: "IOC: no immediate fill — cancelled" });
  });

  it("processOpenOrders fills resting buy when mid drops through", () => {
    const s = baseState();
    const m = sampleMarket();
    const mid = m.hmcUsdt;
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 60, mid * 0.98, undefined, undefined, "GTC", false, m);
    expect("ok" in o).toBe(false);
    const tickers = {
      HMC_USDT: { pairId: "HMC_USDT" as const, mid: mid * 0.97, bid: mid * 0.969, ask: mid * 0.971, spreadBps: 2, change24hPct: 0, high24h: mid, low24h: mid, volume24hBase: 1, volume24hQuote: 1, source: "fallback" as const, fetchedAt: Date.now() },
      SUP_USDT: { pairId: "SUP_USDT" as const, mid: 1, bid: 1, ask: 1, spreadBps: 1, change24hPct: 0, high24h: 1, low24h: 1, volume24hBase: 1, volume24hQuote: 1, source: "fallback" as const, fetchedAt: Date.now() },
      HMC_SUP: { pairId: "HMC_SUP" as const, mid: 1, bid: 1, ask: 1, spreadBps: 1, change24hPct: 0, high24h: 1, low24h: 1, volume24hBase: 1, volume24hQuote: 1, source: "fallback" as const, fetchedAt: Date.now() },
      HMC_BTC: { pairId: "HMC_BTC" as const, mid: 1, bid: 1, ask: 1, spreadBps: 1, change24hPct: 0, high24h: 1, low24h: 1, volume24hBase: 1, volume24hQuote: 1, source: "fallback" as const, fetchedAt: Date.now() },
      SUP_BTC: { pairId: "SUP_BTC" as const, mid: 1, bid: 1, ask: 1, spreadBps: 1, change24hPct: 0, high24h: 1, low24h: 1, volume24hBase: 1, volume24hQuote: 1, source: "fallback" as const, fetchedAt: Date.now() },
    };
    const notes = processOpenOrders(s, m, tickers);
    expect(notes.length).toBeGreaterThan(0);
    const filled = s.orders.find((x) => x.status === "filled");
    expect(filled?.amountBase).toBe(60);
  });

  it("isMarketableLimit matches CEX cross rules", () => {
    const mid = 0.05;
    expect(isMarketableLimit("buy", mid, mid)).toBe(true);
    expect(isMarketableLimit("buy", mid * 0.99, mid)).toBe(false);
    expect(isMarketableLimit("sell", mid, mid)).toBe(true);
    expect(isMarketableLimit("sell", mid * 1.01, mid)).toBe(false);
  });
});

describe("CEX candle OHLC", () => {
  it("live ticks keep wicks beyond body on 1m", () => {
    const mid = 0.05;
    const t0 = Math.floor(Date.now() / 1000 / 60) * 60 - 120;
    const base = [
      { time: t0, open: mid * 0.998, high: mid * 1.012, low: mid * 0.988, close: mid * 0.999, volume: 10 },
      { time: t0 + 60, open: mid * 0.999, high: mid * 1.015, low: mid * 0.985, close: mid * 1.001, volume: 12 },
    ];
    const next = applyMidToPairCandles({ "1m": base }, "HMC_USDT", mid * 1.003, mid);
    const tip = next["1m"]![next["1m"]!.length - 1]!;
    const bodyHigh = Math.max(tip.open, tip.close);
    const bodyLow = Math.min(tip.open, tip.close);
    expect(tip.high).toBeGreaterThanOrEqual(bodyHigh);
    expect(tip.low).toBeLessThanOrEqual(bodyLow);
  });
});

describe("CEX durable desk prefs", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("persists order type / TIF / post-only across reload", () => {
    saveOrderDesk("stop_limit", "IOC", true);
    const d = loadOrderDesk();
    expect(d.kind).toBe("stop_limit");
    expect(d.tif).toBe("IOC");
    expect(d.postOnly).toBe(true);
  });

  it("migrates custom chart prefs from blob when sidecar is factory default", () => {
    const map = installMemoryLocalStorage();
    const s = baseState({
      chartSettings: {
        ...structuredClone(DEFAULT_CHART_SETTINGS),
        candleScheme: "neon",
        logScale: true,
      },
      chartMode: "heikin",
      activeTf: "1H",
      activePair: "SUP_USDT",
    });
    saveChartPrefs({
      v: 1,
      savedAt: Date.now(),
      chartSettings: structuredClone(DEFAULT_CHART_SETTINGS),
      chartMode: "candles",
      chartOverlays: s.chartOverlays,
      indicatorConfig: s.indicatorConfig,
      drawingsLocked: false,
      activeTf: "15m",
      activePair: "HMC_USDT",
    });
    map.set(STORAGE_KEY, JSON.stringify(s));
    const loaded = loadState();
    expect(loaded.chartSettings.candleScheme).toBe("neon");
    expect(loaded.chartMode).toBe("heikin");
    expect(loaded.activeTf).toBe("1H");
    expect(loaded.activePair).toBe("SUP_USDT");
    expect(isDefaultChartAppearance(loadChartPrefs()!)).toBe(false);
  });

  it("does not reseed candles on oracle connect when scale matches", () => {
    const s = baseState();
    const m = sampleMarket();
    for (const p of PAIRS) {
      const px = midForPair(m, p.id);
      s.candles[p.id] = {
        "1m": [{ time: 1, open: px, high: px * 1.01, low: px * 0.99, close: px, volume: 1 }],
      };
    }
    expect(needsCandleReseedForMarket(s, m)).toBe(false);
  });

  it("reseeds only when oracle mid scale jumps >25%", () => {
    const s = baseState();
    const m = sampleMarket();
    const mid = m.hmcUsdt;
    s.candles.HMC_USDT = {
      "1m": [{ time: 1, open: 0.0004, high: 0.00041, low: 0.00039, close: 0.0004, volume: 1 }],
    };
    expect(needsCandleReseedForMarket(s, m)).toBe(true);
  });

  it("chart prefs survive aggressive storage compact", () => {
    const s = baseState({
      chartSettings: {
        ...structuredClone(DEFAULT_CHART_SETTINGS),
        candleScheme: "blue",
        bgGradient: false,
      },
      activeTf: "4H",
    });
    expect(saveState(s)).toBe(true);
    localStorage.removeItem(STORAGE_KEY);
    const loaded = loadState();
    expect(loaded.chartSettings.candleScheme).toBe("blue");
    expect(loaded.activeTf).toBe("4H");
    expect(localStorage.getItem(CHART_PREFS_KEY)).toBeTruthy();
  });
});
