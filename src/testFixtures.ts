import type { Candle, DemoState, MarketSnapshot, Ticker } from "./types";
import {
  DEFAULT_CHART_OVERLAYS,
  DEFAULT_CHART_SETTINGS,
  DEFAULT_FEE_CONFIG,
  DEFAULT_INDICATOR_CONFIG,
  DEFAULT_MULTI_PANE_TFS,
  STATE_VERSION,
} from "./types";
import type { MultiPaneTfs } from "./types";

export function sampleMarket(over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    hmcUsdt: 0.00043,
    supUsdt: 0.000047,
    hmcSup: 9.1,
    hmcBtc: 6.4e-9,
    supBtc: 7e-10,
    poolGh: 88,
    rewardPerM: 0.00021,
    workers: 5,
    supMinted: 0.05,
    supMax: 21_000_000,
    blockHeight: 155000,
    btcUsd: 67_500,
    targetMod: 1,
    totalPayoutHmc: 1000,
    ...over,
  };
}

export function baseState(over: Partial<DemoState> = {}): DemoState {
  return {
    wallet: { usdt: 10_000, hmc: 50_000, sup: 8_000, btc: 0.15 },
    orders: [],
    trades: [],
    ledger: [],
    equitySnapshots: [],
    drawings: [],
    candles: {},
    activePair: "HMC_USDT",
    activeTf: "15m",
    chartMode: "candles",
    chartSettings: structuredClone(DEFAULT_CHART_SETTINGS),
    favoritePairs: ["HMC_USDT", "SUP_USDT", "HMC_SUP"],
    mainView: "spot",
    bookGrouping: 0,
    bookView: "book",
    oracleAnchor: 0.00042,
    initialEquityUsdt: 10_000,
    priceAlerts: [],
    equityBaselineV: 2,
    stateVersion: STATE_VERSION,
    feeConfig: structuredClone(DEFAULT_FEE_CONFIG),
    secondaryTf: "4H",
    multiPaneTfs: [...DEFAULT_MULTI_PANE_TFS] as MultiPaneTfs,
    chartFullscreen: false,
    multiChart: false,
    multiChartLayout: "1",
    chartOverlays: structuredClone(DEFAULT_CHART_OVERLAYS),
    indicatorConfig: structuredClone(DEFAULT_INDICATOR_CONFIG),
    drawingsLocked: false,
    activeDrawTool: "cursor",
    ...over,
  };
}

export function sampleTicker(over: Partial<Ticker> = {}): Ticker {
  const mid = over.mid ?? 0.00043;
  return {
    pairId: "HMC_USDT",
    mid,
    bid: mid * 0.9995,
    ask: mid * 1.0005,
    spreadBps: 10,
    change24hPct: 1.2,
    high24h: mid * 1.01,
    low24h: mid * 0.99,
    volume24hBase: 1_000_000,
    volume24hQuote: 430,
    source: "live",
    fetchedAt: Date.now(),
    ...over,
  };
}

/** Deterministic candle series for indicator math. */
export function linearCandles(n: number, start = 100, step = 1, vol = 1000): Candle[] {
  const out: Candle[] = [];
  let close = start;
  for (let i = 0; i < n; i++) {
    const open = close;
    close = start + step * (i + 1);
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    out.push({ time: 1_700_000_000 + i * 60, open, high, low, close, volume: vol });
  }
  return out;
}

/** In-memory localStorage for store tests (node env). */
export function installMemoryLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  const ls = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  return map;
}
