import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMarketTrade,
  cancelAllOpenOrders,
  cancelOrder,
  ensureCandles,
  loadState,
  placeLimitOrder,
  saveState,
  toggleFavorite,
  updateOrderPrice,
  walletEquityFromMarket,
  walletEquityUsdt,
} from "./store";
import { baseState, installMemoryLocalStorage, sampleMarket } from "./testFixtures";
import { STORAGE_KEY } from "./theme";
import { DEFAULT_CHART_OVERLAYS, STATE_VERSION } from "./types";

describe("store wallet helpers", () => {
  it("walletEquityUsdt sums legs", () => {
    const eq = walletEquityUsdt({ usdt: 100, hmc: 1000, sup: 1000, btc: 0.1 }, 0.5, 0.2, 50_000);
    expect(eq).toBeCloseTo(100 + 500 + 200 + 5000, 6);
  });

  it("walletEquityFromMarket uses snapshot prices", () => {
    const m = sampleMarket();
    const w = { usdt: 10, hmc: 0, sup: 0, btc: 0 };
    expect(walletEquityFromMarket(w, m)).toBe(10);
  });
});

describe("store order mutations", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("applyMarketTrade mutates wallet without duplicating trades", () => {
    const s = baseState();
    const res = applyMarketTrade(s, "HMC_USDT", "buy", 0.0004, 100, 0.04);
    expect(res.ok).toBe(true);
    expect(s.trades).toHaveLength(0);
    expect(s.wallet.hmc).toBe(50_100);
  });

  it("placeLimitOrder / cancelOrder / cancelAllOpenOrders", () => {
    const s = baseState();
    const o = placeLimitOrder(s, "HMC_USDT", "buy", 0.0004, 100);
    expect(o.status).toBe("open");
    expect(s.orders).toHaveLength(1);
    cancelOrder(s, o.id);
    expect(s.orders[0].status).toBe("cancelled");

    placeLimitOrder(s, "HMC_USDT", "sell", 0.0005, 50);
    placeLimitOrder(s, "SUP_USDT", "buy", 0.00004, 10);
    const n = cancelAllOpenOrders(s);
    expect(n).toBe(2);
    expect(s.orders.filter((x) => x.status === "open")).toHaveLength(0);
  });

  it("cancelOrder cancels sibling OCO legs", () => {
    const s = baseState();
    const gid = "g1";
    s.orders = [
      {
        id: "tp",
        pairId: "HMC_USDT",
        side: "sell",
        kind: "oco",
        price: 0.0005,
        amountBase: 10,
        filledBase: 0,
        status: "open",
        ocoGroupId: gid,
        ocoRole: "tp",
        createdAt: Date.now(),
      },
      {
        id: "sl",
        pairId: "HMC_USDT",
        side: "sell",
        kind: "oco",
        price: 0.0003,
        stopPrice: 0.00035,
        amountBase: 10,
        filledBase: 0,
        status: "open",
        ocoGroupId: gid,
        ocoRole: "sl",
        createdAt: Date.now(),
      },
    ];
    cancelOrder(s, "tp");
    expect(s.orders.every((o) => o.status === "cancelled")).toBe(true);
  });

  it("cancelOrder also cancels triggered OCO siblings", () => {
    const s = baseState();
    const gid = "g2";
    s.orders = [
      {
        id: "tp",
        pairId: "HMC_USDT",
        side: "sell",
        kind: "oco",
        price: 0.0005,
        amountBase: 10,
        filledBase: 0,
        status: "open",
        ocoGroupId: gid,
        ocoRole: "tp",
        createdAt: Date.now(),
      },
      {
        id: "sl",
        pairId: "HMC_USDT",
        side: "sell",
        kind: "oco",
        price: 0.0003,
        stopPrice: 0.00035,
        amountBase: 10,
        filledBase: 0,
        status: "triggered",
        ocoGroupId: gid,
        ocoRole: "sl",
        createdAt: Date.now(),
      },
    ];
    cancelOrder(s, "tp");
    expect(s.orders.find((o) => o.id === "sl")!.status).toBe("cancelled");
  });

  it("updateOrderPrice only for open orders", () => {
    const s = baseState();
    const o = placeLimitOrder(s, "HMC_USDT", "buy", 0.0004, 1);
    expect(updateOrderPrice(s, o.id, 0.00041)).toBe(true);
    expect(s.orders[0].price).toBe(0.00041);
    s.orders[0].status = "filled";
    expect(updateOrderPrice(s, o.id, 0.0005)).toBe(false);
    expect(s.orders[0].price).toBe(0.00041);
  });

  it("toggleFavorite adds and removes", () => {
    const s = baseState({ favoritePairs: [] });
    toggleFavorite(s, "HMC_BTC");
    expect(s.favoritePairs[0]).toBe("HMC_BTC");
    toggleFavorite(s, "HMC_BTC");
    expect(s.favoritePairs).not.toContain("HMC_BTC");
  });

  it("ensureCandles fills TIMEFRAMES for all pairs", () => {
    const s = baseState();
    ensureCandles(s, sampleMarket());
    expect(Object.keys(s.candles).length).toBeGreaterThanOrEqual(5);
    expect(s.candles.HMC_USDT?.["15m"]?.length).toBeGreaterThan(10);
  });

  it("ensureCandles is deterministic across fresh clients at the same time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00.000Z"));
    const a = baseState();
    const b = baseState();
    const market = sampleMarket();
    ensureCandles(a, market);
    ensureCandles(b, market);
    expect(b.candles.HMC_USDT?.["1m"]).toEqual(a.candles.HMC_USDT?.["1m"]);
    expect(b.candles.HMC_USDT?.["15m"]).toEqual(a.candles.HMC_USDT?.["15m"]);
    vi.useRealTimers();
  });

  it("drops old persisted candles after state version bump", () => {
    const map = installMemoryLocalStorage();
    const stale = {
      ...baseState(),
      stateVersion: STATE_VERSION - 1,
      candles: {
        HMC_USDT: {
          "1m": [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        },
      },
    };
    map.set(STORAGE_KEY, JSON.stringify(stale));
    const loaded = loadState();
    expect(loaded.stateVersion).toBe(STATE_VERSION);
    expect(loaded.candles).toEqual({});
  });

  it("never persists candles — two saves leave storage without OHLC", () => {
    const map = installMemoryLocalStorage();
    const s = baseState();
    ensureCandles(s, sampleMarket());
    expect(s.candles.HMC_USDT?.["1m"]?.length).toBeGreaterThan(10);
    expect(saveState(s)).toBe(true);
    const raw = JSON.parse(map.get(STORAGE_KEY)!);
    expect(raw.candles).toEqual({});
    const loaded = loadState();
    expect(loaded.candles).toEqual({});
  });

  it("ensureCandles matches on two clients with divergent prior local history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
    const market = sampleMarket();
    const a = baseState();
    const b = baseState();
    a.candles = {
      HMC_USDT: {
        "1m": [{ time: 1_700_000_000, open: 9, high: 9, low: 9, close: 9, volume: 1 }],
      },
    };
    ensureCandles(a, market);
    ensureCandles(b, market);
    expect(b.candles.HMC_USDT?.["1m"]).toEqual(a.candles.HMC_USDT?.["1m"]);
    expect(b.candles.HMC_USDT?.["15m"]).toEqual(a.candles.HMC_USDT?.["15m"]);
    vi.useRealTimers();
  });

  it("clears legacy orderPreview when quick order is off", () => {
    const map = installMemoryLocalStorage();
    const stale = {
      ...baseState(),
      stateVersion: STATE_VERSION - 1,
      chartOverlays: { ...DEFAULT_CHART_OVERLAYS, orderPreview: true, quickOrder: false },
    };
    map.set(STORAGE_KEY, JSON.stringify(stale));
    const loaded = loadState();
    expect(loaded.chartOverlays.orderPreview).toBe(false);
    expect(loaded.chartOverlays.quickOrder).toBe(false);
    expect(loaded.stateVersion).toBe(STATE_VERSION);
  });

  it("default-like state includes priceAlerts array", () => {
    const s = baseState();
    expect(Array.isArray(s.priceAlerts)).toBe(true);
    expect(s.stateVersion).toBe(STATE_VERSION);
    expect(s.drawingsLocked).toBe(false);
  });
});
