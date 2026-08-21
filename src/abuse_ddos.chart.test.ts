/**
 * Client DoS / abuse gates: candle bombs, drawing floods, book spam, chart crash inputs.
 * Demo SPA — not network DDoS mitigation (no backend rate limits here).
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { buildOrderBook } from "./book";
import { MAX_CANDLES, seedCandles, upsertTick, sanitizeCandlesForChart } from "./candles";
import {
  MAX_DRAWINGS,
  MAX_DRAW_PRICE,
  sanitizeDrawing,
  sanitizeDrawings,
} from "./chartDraw";
import { parseDemoImport } from "./demoIo";
import { ema, sma, rsi, macd } from "./indicators";
import { loadState, resetDemo, saveState } from "./store";
import {
  MAX_IMPORT_CANDLE_TOTAL,
  MAX_IMPORT_CANDLES_PER_SERIES,
  sanitizeImportedCandle,
  sanitizeImportedCandles,
} from "./stateSanitize";
import { clampVisiblePriceRange, wheelZoomStep, zoomPriceRange } from "./chart";
import { STORAGE_KEY } from "./theme";
import { baseState, sampleMarket } from "./testFixtures";
import type { Ticker } from "./types";

const ticker: Ticker = {
  pairId: "HMC_USDT",
  mid: 0.05,
  bid: 0.0499,
  ask: 0.0501,
  spreadBps: 8,
  change24hPct: 0.5,
  high24h: 0.051,
  low24h: 0.049,
  volume24hBase: 1e6,
  volume24hQuote: 5e4,
  source: "fallback",
  fetchedAt: Date.now(),
};

function countCandles(map: ReturnType<typeof sanitizeImportedCandles>): number {
  let n = 0;
  for (const byTf of Object.values(map)) {
    if (!byTf) continue;
    for (const series of Object.values(byTf)) {
      if (Array.isArray(series)) n += series.length;
    }
  }
  return n;
}

describe("DoS: candle import / localStorage bombs", () => {
  it("drops NaN/Infinity/negative OHLC bars", () => {
    // Heal open from close when only open is NaN
    const healed = sanitizeImportedCandle({ time: 1, open: NaN, high: 1, low: 1, close: 1, volume: 1 });
    expect(healed?.open).toBe(1);
    expect(
      sanitizeImportedCandle({
        time: 1,
        open: Number.POSITIVE_INFINITY,
        high: Number.POSITIVE_INFINITY,
        low: Number.POSITIVE_INFINITY,
        close: Number.POSITIVE_INFINITY,
        volume: 1,
      }),
    ).toBeNull();
    expect(sanitizeImportedCandle({ time: 1, open: -1, high: -1, low: -1, close: -1, volume: 1 })).toBeNull();
    const ok = sanitizeImportedCandle({
      time: 1_700_000_000,
      open: 0.05,
      high: 1e20,
      low: 0.01,
      close: 0.05,
      volume: 1e20,
    });
    expect(ok).not.toBeNull();
    expect(ok!.high).toBeLessThanOrEqual(1e9);
    expect(ok!.volume).toBeLessThanOrEqual(5_000_000);
  });

  it("caps per-series and total imported candles", () => {
    const bomb = Array.from({ length: MAX_IMPORT_CANDLES_PER_SERIES + 800 }, (_, i) => ({
      time: 1_700_000_000 + i,
      open: 0.05,
      high: 0.051,
      low: 0.049,
      close: 0.05,
      volume: 1,
    }));
    const one = sanitizeImportedCandles({ HMC_USDT: { "1m": bomb } });
    expect(one.HMC_USDT?.["1m"]?.length).toBeLessThanOrEqual(MAX_IMPORT_CANDLES_PER_SERIES);

    const multi: Record<string, Record<string, typeof bomb>> = {};
    for (const pid of ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"]) {
      multi[pid] = { "1m": bomb, "15m": bomb, "1H": bomb };
    }
    const capped = sanitizeImportedCandles(multi);
    expect(countCandles(capped)).toBeLessThanOrEqual(MAX_IMPORT_CANDLE_TOTAL);
    expect(capped).not.toHaveProperty("EVIL_PAIR");
  });

  it("parseDemoImport rejects candle bombs and unknown keys", () => {
    const bars = Array.from({ length: 400 }, (_, i) => ({
      time: 1_700_000_000 + i * 60,
      open: 0.05,
      high: Number.NaN,
      low: 0.04,
      close: 0.05,
      volume: 1,
    }));
    const raw = JSON.stringify({
      state: {
        wallet: { usdt: 1, hmc: 1, sup: 1, btc: 0 },
        orders: [],
        trades: [],
        candles: {
          HMC_USDT: { "1m": bars, "nope": bars },
          FAKE: { "1m": bars },
        },
      },
    });
    const parsed = parseDemoImport(raw);
    expect(parsed.candles.FAKE).toBeUndefined();
    expect(parsed.candles.HMC_USDT?.["nope" as "1m"]).toBeUndefined();
    // NaN high bars dropped or healed — series finite
    for (const c of parsed.candles.HMC_USDT?.["1m"] ?? []) {
      expect(Number.isFinite(c.open)).toBe(true);
      expect(Number.isFinite(c.close)).toBe(true);
      expect(c.open).toBeGreaterThan(0);
    }
  });

  it("loadState sanitizes oversized candle maps from localStorage", () => {
    resetDemo();
    const bars = Array.from({ length: 3000 }, (_, i) => ({
      time: 1_700_000_000 + i,
      open: 0.05,
      high: 0.05,
      low: 0.05,
      close: 0.05,
      volume: 1,
    }));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...baseState(),
        candles: {
          HMC_USDT: { "1m": bars, "15m": bars },
          SUP_USDT: { "1m": bars },
          EVIL: { "1m": bars },
        },
      }),
    );
    const s = loadState();
    expect(s.candles.EVIL).toBeUndefined();
    expect(countCandles(s.candles)).toBeLessThanOrEqual(MAX_IMPORT_CANDLE_TOTAL);
    resetDemo();
  });
});

describe("DoS: drawings flood + absurd prices", () => {
  it("sanitizeDrawings hard-caps count", () => {
    const many = Array.from({ length: MAX_DRAWINGS + 150 }, (_, i) => ({
      id: `d-${i}`,
      tool: "hline",
      pairId: "HMC_USDT",
      points: [{ time: i, price: 0.05 }],
      color: "#00e5ff",
    }));
    expect(sanitizeDrawings(many).length).toBe(MAX_DRAWINGS);
  });

  it("rejects or clamps absurd drawing prices", () => {
    expect(
      sanitizeDrawing({
        tool: "hline",
        pairId: "HMC_USDT",
        points: [{ time: 1, price: Number.POSITIVE_INFINITY }],
        color: "#00e5ff",
      }),
    ).toBeNull();
    const huge = sanitizeDrawing({
      tool: "hline",
      pairId: "HMC_USDT",
      points: [{ time: 1, price: 1e30 }],
      color: "#00e5ff",
    });
    expect(huge?.points[0]?.price).toBeLessThanOrEqual(MAX_DRAW_PRICE);
  });
});

describe("DoS: order book / indicators / chart zoom", () => {
  it("buildOrderBook caps absurd level counts", () => {
    const { bids, asks } = buildOrderBook(ticker, 1_000_000);
    expect(bids.length).toBeLessThanOrEqual(500);
    expect(asks.length).toBe(bids.length);
  });

  it("indicators survive MAX_CANDLES without throw / NaN", () => {
    let candles = seedCandles("HMC_USDT", "1m", 0.05);
    const last = candles[candles.length - 1]!;
    for (let i = 0; i < 200; i++) {
      candles = upsertTick(candles, "1m", last.close * (1 + (i % 3) * 0.0001), "HMC_USDT");
    }
    candles = sanitizeCandlesForChart(candles.slice(-MAX_CANDLES), "HMC_USDT");
    expect(candles.length).toBeLessThanOrEqual(MAX_CANDLES);
    expect(() => sma(candles, 20)).not.toThrow();
    expect(() => ema(candles, 50)).not.toThrow();
    expect(() => rsi(candles, 14)).not.toThrow();
    expect(() => macd(candles)).not.toThrow();
    const e = ema(candles, 20);
    expect(e.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it("wheel zoom spam cannot collapse / explode price axis", () => {
    let range = { from: 0.04, to: 0.06 };
    let residual = 0;
    for (let i = 0; i < 500; i++) {
      const { step, residual: next } = wheelZoomStep(i % 2 === 0 ? 200 : -200, residual);
      residual = next;
      if (step !== 0) range = zoomPriceRange(range, step, { step, refPrice: 0.05 });
    }
    range = clampVisiblePriceRange(range, 0.05);
    expect(range.from).toBeGreaterThan(0);
    expect(range.to).toBeGreaterThan(range.from);
    expect(range.to / range.from).toBeLessThan(1e6);
  });
});

describe("DoS: trade spam + storage quota path", () => {
  it("rapid save under drawing flood does not throw", () => {
    const s = resetDemo();
    s.drawings = Array.from({ length: MAX_DRAWINGS }, (_, i) => ({
      id: `d-${i}`,
      pairId: "HMC_USDT" as const,
      tool: "hline" as const,
      points: [{ time: i, price: 0.05 }],
      color: "#00e5ff",
    }));
    expect(saveState(s)).toBe(true);
    const loaded = loadState();
    expect(loaded.drawings.length).toBeLessThanOrEqual(MAX_DRAWINGS);
    resetDemo();
  });

  it("oversized import string still rejected (2MB)", () => {
    const huge = `{"wallet":{"usdt":1},"orders":[],"trades":[],"pad":"${"x".repeat(2_100_000)}"}`;
    expect(() => parseDemoImport(huge)).toThrow(/too large/i);
  });
});

describe("chart heal: poisoned series paint-safe", () => {
  it("sanitizeCandlesForChart heals spike that would squash pane", () => {
    const base = seedCandles("HMC_USDT", "1m", 0.05).slice(-40);
    const poisoned = base.map((c, i) =>
      i === 20 ? { ...c, high: c.close * 50, low: c.close / 50, close: c.close * 40 } : c,
    );
    const healed = sanitizeCandlesForChart(poisoned, "HMC_USDT");
    const highs = healed.map((c) => c.high);
    const maxH = Math.max(...highs);
    const med = healed[healed.length - 1]!.close;
    expect(maxH / med).toBeLessThan(5);
    expect(healed.every((c) => Number.isFinite(c.close) && c.close > 0)).toBe(true);
  });
});
