/**
 * Stress + red-team gates for chart/book/import/UI abuse.
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { buildOrderBook, aggregateBookLevels, matchMarket } from "./book";
import { seedCandles, upsertTick, MAX_CANDLES, prependOlderCandles } from "./candles";
import { parseDemoImport, exportDemoJson } from "./demoIo";
import { applyMarketTrade, loadState, saveState, resetDemo } from "./store";
import { placeOrder, processOpenOrders } from "./orders";
import { baseState, sampleMarket } from "./testFixtures";
import { sanitizeHttpUrl } from "./sanitize";
import { showObjectTreeModal } from "./chartContextMenu";
import { openInNewTab } from "./adapters/walletLinks";
import { STORAGE_KEY } from "./theme";
import type { Ticker } from "./types";

const ticker: Ticker = {
  pairId: "HMC_USDT",
  mid: 0.00042,
  bid: 0.000419,
  ask: 0.000421,
  spreadBps: 12,
  change24hPct: 1.2,
  high24h: 0.00045,
  low24h: 0.0004,
  volume24hBase: 1e6,
  volume24hQuote: 420,
  source: "fallback",
  fetchedAt: Date.now(),
};

describe("stress: order book", () => {
  it("builds huge ladders without NaN", () => {
    const { bids, asks } = buildOrderBook(ticker, 500);
    expect(bids.length).toBe(500);
    expect(asks.length).toBe(500);
    for (const l of [...bids, ...asks]) {
      expect(Number.isFinite(l.price)).toBe(true);
      expect(l.price).toBeGreaterThan(0);
      expect(Number.isFinite(l.amountBase)).toBe(true);
    }
  });

  it("aggregates dense books", () => {
    const { bids } = buildOrderBook(ticker, 200);
    const agg = aggregateBookLevels(bids, ticker.mid * 0.01, "bid");
    expect(agg.length).toBeGreaterThan(0);
    expect(agg.length).toBeLessThanOrEqual(bids.length);
  });

  it("matchMarket survives absurd size (no throw)", () => {
    const r = matchMarket(ticker, "buy", 1e12);
    expect(Number.isFinite(r.avgPrice)).toBe(true);
    expect(r.quote).toBeGreaterThanOrEqual(0);
  });
});

describe("stress: candles", () => {
  it("rapid upsertTick + prepend stays capped", () => {
    let candles = seedCandles("HMC_USDT", "1m", 0.00042);
    const last = candles[candles.length - 1];
    for (let i = 0; i < 400; i++) {
      candles = upsertTick(candles, "1m", last.close * (1 + Math.sin(i) * 0.001), "HMC_USDT");
    }
    const older = prependOlderCandles(candles, "HMC_USDT", "1m", 2000);
    expect(older.length).toBeLessThanOrEqual(MAX_CANDLES);
    expect(older.every((c) => Number.isFinite(c.close))).toBe(true);
  });
});

describe("stress: order spam", () => {
  it("rejects after wallet drained; no negative balances", () => {
    const s = baseState();
    s.wallet.usdt = 50;
    let ok = 0;
    for (let i = 0; i < 80; i++) {
      const r = applyMarketTrade(s, "HMC_USDT", "buy", 0.00042, 500, 0.21);
      if (r.ok) ok++;
    }
    expect(ok).toBeGreaterThan(0);
    expect(s.wallet.usdt).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(s.wallet.usdt)).toBe(true);
  });

  it("limit spam + processOpenOrders stays finite", () => {
    const s = baseState();
    const m = sampleMarket();
    for (let i = 0; i < 40; i++) {
      placeOrder(
        s,
        "HMC_USDT",
        i % 2 === 0 ? "buy" : "sell",
        "limit",
        10,
        m.hmcUsdt * (1 + (i % 5) * 0.001),
      );
    }
    const tickers = { HMC_USDT: ticker } as Record<string, Ticker>;
    processOpenOrders(s, m, tickers as never);
    for (const v of Object.values(s.wallet)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("redteam: import / localStorage", () => {
  it("rejects oversized payload", () => {
    const huge = `{"wallet":{"usdt":1},"orders":[],"trades":[],"pad":"${"x".repeat(2_100_000)}"}`;
    expect(() => parseDemoImport(huge)).toThrow(/too large/i);
  });

  it("strips prototype pollution and XSS drawing text", () => {
    const raw = JSON.stringify({
      state: {
        wallet: { usdt: 1, hmc: 1, sup: 1, btc: 0 },
        orders: [],
        trades: [],
        drawings: [
          {
            id: '"><img src=x onerror=alert(1)>',
            tool: "text",
            pairId: "HMC_USDT",
            points: [{ time: 1, price: 1 }],
            text: '<script>alert(1)</script>',
            color: "#ffd54f",
          },
        ],
        __proto__: { admin: true },
      },
    });
    const parsed = parseDemoImport(raw);
    expect(parsed.drawings).toHaveLength(1);
    expect(parsed.drawings[0].text).not.toMatch(/<script>/);
    expect(parsed.drawings[0].id).toMatch(/^[A-Za-z0-9_.:-]{1,80}$/);
    expect(Object.prototype.hasOwnProperty.call(parsed, "admin")).toBe(false);
  });

  it("loadState strips pollution + XSS oracleAnchor / ledger from localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        wallet: { usdt: 1, hmc: 1, sup: 1, btc: 0 },
        orders: [
          {
            id: `"><img src=x onerror=alert(1)>`,
            pairId: "HMC_USDT",
            side: "buy",
            kind: "limit",
            price: 1,
            amountBase: 1,
            filledBase: 0,
            status: "open",
            createdAt: 1,
          },
        ],
        trades: [],
        ledger: [
          {
            id: "ok",
            kind: `"><img src=x onerror=alert(1)>`,
            asset: `"><script>`,
            amount: 1,
            usdtValue: 1,
            note: '<img src=x onerror=alert(1)>',
            ts: 1,
          },
        ],
        oracleAnchor: `"><img src=x onerror=alert(1)>`,
        chartSettings: { gridOpacity: `"><img src=x onerror=alert(1)>` },
        constructor: { prototype: { pwned: true } },
      }),
    );
    const s = loadState();
    expect(typeof s.oracleAnchor).toBe("number");
    expect(Number.isFinite(s.oracleAnchor)).toBe(true);
    expect(typeof s.chartSettings.gridOpacity).toBe("number");
    expect(s.ledger[0]?.kind).toBe("transfer");
    expect(s.ledger[0]?.asset).toBe("USDT");
    expect(s.ledger[0]?.note).not.toMatch(/<|>/);
    expect(s.orders.every((o) => !/[<>"']/.test(o.id))).toBe(true);
    expect(({} as { pwned?: boolean }).pwned).toBeUndefined();
    resetDemo();
  });

  it("corrupted localStorage recovers to fresh state", () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");
    const s = loadState();
    expect(s.wallet.usdt).toBeGreaterThan(0);
    resetDemo();
  });

  it("round-trip export stays under stress size", () => {
    const s = baseState();
    s.drawings = Array.from({ length: 30 }, (_, i) => ({
      id: `d-${i}`,
      pairId: "HMC_USDT" as const,
      tool: "measure" as const,
      points: [
        { time: i, price: 1 },
        { time: i + 10, price: 1.1 },
      ],
      color: "#ffb347",
    }));
    const raw = exportDemoJson(s);
    const back = parseDemoImport(raw);
    expect(back.drawings.length).toBe(30);
  });
});

describe("redteam: open redirect / XSS surfaces", () => {
  it("sanitizeHttpUrl blocks javascript:", () => {
    expect(sanitizeHttpUrl("javascript:alert(1)", "https://hackme.tech")).toBe("https://hackme.tech");
    expect(sanitizeHttpUrl("data:text/html,hi", "https://hackme.tech")).toBe("https://hackme.tech");
  });

  it("openInNewTab ignores non-http schemes", () => {
    const orig = window.open;
    let called = 0;
    window.open = (() => {
      called++;
      return null;
    }) as typeof window.open;
    openInNewTab("javascript:alert(1)");
    expect(called).toBe(0);
    openInNewTab("https://hackme.tech/downloads.html");
    expect(called).toBe(1);
    window.open = orig;
  });

  it("object tree escapes drawing text in DOM", () => {
    showObjectTreeModal(
      [{ id: "x1", tool: "text", text: '<img src=x onerror=alert(1)>' }],
      () => {},
      () => {},
    );
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/<img[^>]+onerror/);
    expect(html).toMatch(/&lt;img/);
    document.querySelector(".modal-backdrop")?.remove();
  });

  it("import clamps chart style color XSS before modal sinks", () => {
    const raw = JSON.stringify({
      state: {
        wallet: { usdt: 1, hmc: 1, sup: 1, btc: 0 },
        orders: [],
        trades: [],
        chartSettings: {
          candleStyle: { bullBody: `"><img src=x onerror=alert(1)>` },
        },
        indicatorConfig: {
          ma: [{ enabled: true, period: 7, color: `"><img src=x onerror=alert(1)>` }],
        },
      },
    });
    const parsed = parseDemoImport(raw);
    expect(parsed.chartSettings.candleStyle.bullBody).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(parsed.indicatorConfig.ma[0].color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it("import strips XSS order/alert ids used in activity attributes", () => {
    const raw = JSON.stringify({
      state: {
        wallet: { usdt: 1, hmc: 1, sup: 1, btc: 0 },
        orders: [
          {
            id: `"><img src=x onerror=alert(1)>`,
            pairId: "HMC_USDT",
            side: "buy",
            kind: "limit",
            price: 1,
            amountBase: 1,
            filledBase: 0,
            status: "open",
            createdAt: 1,
          },
        ],
        trades: [],
        priceAlerts: [
          {
            id: `x" onclick=alert(1)`,
            pairId: "HMC_USDT",
            price: 1,
            fired: false,
            createdAt: 1,
          },
        ],
      },
    });
    const parsed = parseDemoImport(raw);
    expect(parsed.orders).toHaveLength(0);
    expect(parsed.priceAlerts.every((a) => !/[<>"']/.test(a.id))).toBe(true);
  });
  it("import clamps multiChartLayout / oracleAnchor before HTML sinks", () => {
    const raw = JSON.stringify({
      state: {
        wallet: { usdt: 1, hmc: 1, sup: 1, btc: 0 },
        orders: [],
        trades: [],
        oracleAnchor: `"><img src=x onerror=alert(1)>`,
        multiChartLayout: `"><img src=x onerror=alert(1)>`,
        chartSettings: { gridOpacity: `"><img src=x onerror=alert(1)>` },
      },
    });
    const parsed = parseDemoImport(raw);
    expect(typeof parsed.oracleAnchor).toBe("number");
    expect(parsed.multiChartLayout).toMatch(/^(1|2v|2h|4)$/);
    expect(typeof parsed.chartSettings.gridOpacity).toBe("number");
  });
});

describe("stress: concurrent UI-ish actions", () => {
  it("save/load under rapid churn", () => {
    const s = resetDemo();
    for (let i = 0; i < 50; i++) {
      s.oracleAnchor = 0.0004 + i * 1e-7;
      saveState(s);
      const loaded = loadState();
      expect(Number.isFinite(loaded.oracleAnchor)).toBe(true);
    }
  });
});
