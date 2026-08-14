/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { baseState, sampleMarket, sampleTicker } from "./testFixtures";
import { cancelAllOpenOrders, placeLimitOrder, toggleFavorite, walletEquityFromMarket } from "./store";
import { placeOrder, placeOco, processOpenOrders, orderTypeLabel } from "./orders";
import { getChartMountOpts, countActiveIndicators, clearAllIndicators, toggleIndicator } from "./chart";
import { DEFAULT_CHART_SETTINGS } from "./types";
import { buildOrderBook, matchMarket } from "./book";
import { renderDepthPanel, renderDepthSvg } from "./depth";
import { renderPoolPage, renderPoolRail } from "./pool";
import { CONVERT_ROUTES, convert } from "./convert";
import { pairById } from "./pairs";
import { tickInputValue } from "./tick";
import { formatPrice, formatPct, chartPriceFormatter } from "./format";
import { candleCountdown, yesterdayClose } from "./chartHud";
import { linearCandles } from "./testFixtures";

describe("hotkey-related store actions", () => {
  it("cancelAllOpenOrders clears open/triggered and returns count (Esc)", () => {
    const s = baseState();
    placeOrder(s, "HMC_USDT", "buy", "limit", 1000, 0.0004);
    placeOrder(s, "HMC_USDT", "sell", "limit", 500, 0.0005);
    placeOrder(s, "SUP_USDT", "buy", "stop_limit", 200, 0.00005, 0.000049);
    expect(s.orders.filter((o) => o.status === "open" || o.status === "triggered").length).toBeGreaterThanOrEqual(2);
    const n = cancelAllOpenOrders(s);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(s.orders.every((o) => o.status === "cancelled" || o.status === "filled")).toBe(true);
  });

  it("market match produces positive quote for Shift+B/S path", () => {
    const t = sampleTicker();
    const buy = matchMarket(t, "buy", 1000);
    const sell = matchMarket(t, "sell", 1000);
    expect(buy.quote).toBeGreaterThan(0);
    expect(sell.quote).toBeGreaterThan(0);
    expect(buy.avgPrice).toBeGreaterThan(0);
    expect(sell.avgPrice).toBeGreaterThan(0);
  });
});

describe("OCO / labels metrics", () => {
  it("placeOco creates linked pair and processOpenOrders is safe", () => {
    const s = baseState();
    placeOco(s, "HMC_USDT", "buy", 1000, 0.00045, 0.00041, 0.000405);
    expect(s.orders.length).toBeGreaterThanOrEqual(2);
    const group = s.orders[0]?.ocoGroupId;
    expect(group).toBeTruthy();
    expect(s.orders.filter((o) => o.ocoGroupId === group).length).toBe(2);
    const tickers = {
      HMC_USDT: sampleTicker(),
      SUP_USDT: sampleTicker({ pairId: "SUP_USDT" }),
      HMC_SUP: sampleTicker({ pairId: "HMC_SUP" }),
      HMC_BTC: sampleTicker({ pairId: "HMC_BTC" }),
      SUP_BTC: sampleTicker({ pairId: "SUP_BTC" }),
    };
    const notes = processOpenOrders(s, sampleMarket(), tickers);
    expect(Array.isArray(notes)).toBe(true);
  });

  it("orderTypeLabel covers kinds", () => {
    expect(orderTypeLabel("market")).toMatch(/market/i);
    expect(orderTypeLabel("limit")).toMatch(/limit/i);
    expect(orderTypeLabel("stop_limit")).toMatch(/stop/i);
    expect(orderTypeLabel("oco")).toMatch(/oco/i);
  });
});

describe("chart mount opts + indicators", () => {
  it("getChartMountOpts wires pair trades orders watermark extras", () => {
    const s = baseState({
      trades: [
        {
          id: "1",
          pairId: "HMC_USDT",
          side: "buy",
          price: 0.0004,
          amountBase: 10,
          amountQuote: 0.004,
          feeQuote: 0,
          feeHmc: 0,
          feeRole: "taker",
          feePaidInHmc: false,
          ts: Date.now(),
        },
      ],
    });
    placeLimitOrder(s, "HMC_USDT", "buy", 100, 0.00039);
    const opts = getChartMountOpts(s, "HMC_USDT", "1m", 0.00043, {
      watermark: "HMC / USDT · 1m",
      yesterdayClose: 0.0004,
      lastPriceUp: true,
    });
    expect(opts.pairId).toBe("HMC_USDT");
    expect(opts.watermark).toContain("HMC");
    expect(opts.yesterdayClose).toBe(0.0004);
    expect(opts.trades?.length).toBe(1);
    expect(opts.orders.length).toBeGreaterThanOrEqual(1);
  });

  it("toggle/clear indicators updates counts", () => {
    let settings = structuredClone(DEFAULT_CHART_SETTINGS);
    expect(countActiveIndicators(settings)).toBeGreaterThanOrEqual(0);
    settings = toggleIndicator("ema20", true, settings);
    expect(settings.indicators.ema20).toBe(true);
    const cleared = clearAllIndicators(settings);
    expect(countActiveIndicators(cleared)).toBe(0);
  });
});

describe("depth / pool / convert visual HTML", () => {
  it("depth SVG and panel contain bid/ask structure", () => {
    const { bids, asks } = buildOrderBook(sampleTicker(), 10);
    const svg = renderDepthSvg(bids, asks);
    expect(svg).toContain("<svg");
    expect(svg).toMatch(/depth-bid|depth-ask/);
    const panel = renderDepthPanel(bids, asks, "HMC", "USDT");
    expect(panel).toMatch(/HMC|USDT|Price|Amt/i);
  });

  it("pool rail/page render live metrics", () => {
    const live = {
      poolGh: 120,
      workers: 8,
      miners: 6,
      rewardPerM: 0.0002,
      blockHeight: 160000,
      totalPayoutHmc: 2000,
      targetMod: 1,
      status: "ok" as const,
    };
    const rail = renderPoolRail(live);
    const page = renderPoolPage(live, sampleMarket());
    expect(rail.length + page.length).toBeGreaterThan(100);
    expect(page.toLowerCase()).toMatch(/pool|worker|gh/);
  });

  it("convert routes produce deterministic swaps with taker fee", () => {
    expect(CONVERT_ROUTES.length).toBeGreaterThanOrEqual(3);
    const s = baseState();
    const m = sampleMarket();
    const r = convert(s, m, "HMC_USDT", 1000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.got).toBeGreaterThan(0);
      expect(r.fee.role).toBe("taker");
      expect(r.fee.feeQuote).toBeGreaterThan(0);
    }
  });
});

describe("favorites + equity metrics", () => {
  it("toggleFavorite flips pair and equity is positive", () => {
    const s = baseState({ favoritePairs: ["HMC_USDT"] });
    toggleFavorite(s, "SUP_USDT");
    expect(s.favoritePairs).toContain("SUP_USDT");
    toggleFavorite(s, "SUP_USDT");
    expect(s.favoritePairs).not.toContain("SUP_USDT");
    expect(walletEquityFromMarket(s.wallet, sampleMarket())).toBeGreaterThan(0);
  });
});

describe("display metric formatters used in ticker/HUD", () => {
  it("formats prices and countdown consistently", () => {
    expect(formatPrice(0.00043485)).toMatch(/0\.000/);
    expect(formatPct(2.5)).toContain("%");
    expect(chartPriceFormatter(0.00043485)).toBeTruthy();
    expect(candleCountdown("1m")).toMatch(/^\d{2}:\d{2}$/);
    const yc = yesterdayClose(linearCandles(40, 0.0004, 0.000001));
    expect(yc === undefined || yc > 0).toBe(true);
    expect(tickInputValue(1.23456789, "HMC_BTC").length).toBeGreaterThan(0);
    expect(pairById("HMC_USDT").decimals).toBe(8);
  });
});

describe("button / control inventory (order panel DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("exposes all critical data-hooks for wiring in app", async () => {
    const { renderDualOrderPanel } = await import("./orderPanel");
    document.body.innerHTML = renderDualOrderPanel({
      pair: pairById("HMC_USDT"),
      pairId: "HMC_USDT",
      mid: 0.00043,
      uiType: "limit",
      uiTif: "GTC",
      uiPostOnly: false,
      availQuote: 1000,
      availBase: 50000,
      payFeesInHmc: true,
      hmcDiscountPct: 25,
      feeRole: "maker",
      feeBps: 8,
      showTif: true,
    });

    const required = [
      "#btn-buy",
      "#btn-sell",
      "#buy-price",
      "#sell-price",
      "#buy-amt",
      "#sell-amt",
      "#buy-pct",
      "#sell-pct",
      "#post-only",
      "#pay-fees-hmc",
      "#order-tif",
      "#type-tabs",
      "[data-qs]",
      "[data-avail-side]",
      "[data-bbo]",
      "[data-tpsl-side]",
      "#buy-tpsl-fields",
      "#sell-tpsl-fields",
    ];
    for (const sel of required) {
      expect(document.querySelector(sel), `missing ${sel}`).toBeTruthy();
    }
    expect(document.querySelectorAll("#type-tabs .type").length).toBe(3);
    expect(document.getElementById("order-type-adv")).toBeTruthy();
    expect(document.querySelector(".order-mode-row")).toBeTruthy();
    expect(document.querySelector(".order-type-row")).toBeTruthy();
    expect(document.querySelector("#order-head-meta #pay-fees-hmc")).toBeTruthy();
    expect(document.querySelectorAll("[data-qs]").length).toBe(8);
  });
});
