import { describe, expect, it } from "vitest";
import {
  dailyPnlCalendar,
  pnlWindows,
  renderPnlCalendarHtml,
  snapshotEquity,
  volumeRatio5m,
} from "./pnl";
import { pnlPct, walletEquityFromMarket } from "./store";
import { baseState, sampleMarket } from "./testFixtures";
import type { Trade } from "./types";

describe("pnlPct / pnlWindows", () => {
  const market = sampleMarket();

  it("pnlPct reflects equity vs baseline", () => {
    const s = baseState();
    s.initialEquityUsdt = walletEquityFromMarket(s.wallet, market);
    expect(pnlPct(s, market)).toBeCloseTo(0, 8);
    s.wallet.usdt += 100;
    expect(pnlPct(s, market)).toBeGreaterThan(0);
  });

  it("pnlPct returns 0 when baseline <= 0", () => {
    const s = baseState({ initialEquityUsdt: 0 });
    expect(pnlPct(s, market)).toBe(0);
  });

  it("repairStaleEquityBaseline resets paper→desk −100% skew", async () => {
    const { repairStaleEquityBaseline } = await import("./store");
    const s = baseState({
      wallet: { usdt: 0.05, hmc: 0, sup: 0, btc: 0 },
      initialEquityUsdt: 10_000,
      equitySnapshots: [
        { ts: Date.now() - 86_400_000, equityUsdt: 10_000 },
        { ts: Date.now() - 3_600_000, equityUsdt: 9_800 },
      ],
    });
    expect(pnlPct(s, market)).toBeLessThan(-99);
    expect(repairStaleEquityBaseline(s, market)).toBe(true);
    expect(pnlPct(s, market)).toBeCloseTo(0, 5);
    expect(s.equitySnapshots).toHaveLength(1);
    expect(s.equitySnapshots[0]!.equityUsdt).toBeCloseTo(0.05, 8);
  });

  it("repairStaleEquityBaseline resets dust→deposit surge (+thousands% PnL)", async () => {
    const { repairStaleEquityBaseline } = await import("./store");
    const s = baseState({
      wallet: { usdt: 500, hmc: 5_000, sup: 200, btc: 0 },
      initialEquityUsdt: 7.5,
      equitySnapshots: [
        { ts: Date.now() - 60_000, equityUsdt: 7.5 },
        { ts: Date.now(), equityUsdt: 800 },
      ],
    });
    expect(pnlPct(s, market)).toBeGreaterThan(1_000);
    expect(repairStaleEquityBaseline(s, market)).toBe(true);
    expect(pnlPct(s, market)).toBeCloseTo(0, 5);
    expect(s.equitySnapshots).toHaveLength(1);
  });

  it("pnlWindows returns 24h/7d/30d", () => {
    const s = baseState();
    const now = Date.now();
    s.equitySnapshots = [
      { ts: now - 86_400_000 * 2, equityUsdt: 9_500 },
      { ts: now - 86_400_000 / 2, equityUsdt: 9_800 },
      { ts: now - 1000, equityUsdt: 10_000 },
    ];
    const w = pnlWindows(s, market);
    expect(w.map((x) => x.label)).toEqual(["24h", "7d", "30d"]);
    expect(w.every((x) => Number.isFinite(x.pct) && Number.isFinite(x.abs))).toBe(true);
  });
});

describe("snapshotEquity / dailyPnlCalendar", () => {
  const market = sampleMarket();

  it("snapshotEquity throttles under 60s", () => {
    const s = baseState();
    snapshotEquity(s, market);
    expect(s.equitySnapshots).toHaveLength(1);
    snapshotEquity(s, market);
    expect(s.equitySnapshots).toHaveLength(1);
  });

  it("dailyPnlCalendar returns requested day count", () => {
    const s = baseState();
    const days = dailyPnlCalendar(s, market, 14);
    expect(days).toHaveLength(14);
    expect(days[0].dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("renderPnlCalendarHtml includes cells", () => {
    const html = renderPnlCalendarHtml([
      { dateKey: "2026-01-01", label: "Jan 1", dayNum: 1, pnl: 10, hasData: true },
      { dateKey: "2026-01-02", label: "Jan 2", dayNum: 2, pnl: -5, hasData: true },
    ]);
    expect(html).toContain("pnl-calendar");
    expect(html).toContain("pnl-cal-cell");
    expect(html).toContain("pnl-cal-weekdays");
    expect(html).toMatch(/Equity day-change|Tracking starts/);
  });

  it("empty calendar does not invent a sine-wave history", () => {
    const s = baseState();
    s.equitySnapshots = [];
    const eq = walletEquityFromMarket(s.wallet, market);
    s.initialEquityUsdt = eq;
    const days = dailyPnlCalendar(s, market, 14);
    expect(days.every((d) => Math.abs(d.pnl) < 1e-9)).toBe(true);
    expect(renderPnlCalendarHtml(days)).toMatch(/Tracking starts|no day history/i);
  });

  it("ledger fees paint calendar day when no equity snapshot", () => {
    const s = baseState();
    s.equitySnapshots = [];
    const now = Date.now();
    s.ledger = [
      {
        id: "f1",
        kind: "fee",
        asset: "USDT",
        amount: -0.01,
        usdtValue: -0.01,
        note: "taker fee",
        ts: now,
      },
    ];
    const days = dailyPnlCalendar(s, market, 7);
    const today = days[days.length - 1]!;
    expect(today.pnl).toBeCloseTo(-0.01, 8);
    expect(today.hasData).toBe(true);
  });
});

describe("volumeRatio5m", () => {
  it("50/50 when no recent trades", () => {
    expect(volumeRatio5m([], "HMC_USDT")).toEqual({
      buyPct: 50,
      sellPct: 50,
      buyVol: 0,
      sellVol: 0,
    });
  });

  it("weights buy vs sell in last 5m", () => {
    const now = Date.now();
    const trades: Trade[] = [
      {
        id: "1",
        pairId: "HMC_USDT",
        side: "buy",
        price: 1,
        amountBase: 70,
        amountQuote: 1,
        feeQuote: 0,
        feeHmc: 0,
        feeRole: "taker",
        feePaidInHmc: false,
        ts: now - 1000,
      },
      {
        id: "2",
        pairId: "HMC_USDT",
        side: "sell",
        price: 1,
        amountBase: 30,
        amountQuote: 1,
        feeQuote: 0,
        feeHmc: 0,
        feeRole: "taker",
        feePaidInHmc: false,
        ts: now - 2000,
      },
      {
        id: "3",
        pairId: "SUP_USDT",
        side: "buy",
        price: 1,
        amountBase: 999,
        amountQuote: 1,
        feeQuote: 0,
        feeHmc: 0,
        feeRole: "taker",
        feePaidInHmc: false,
        ts: now - 1000,
      },
      {
        id: "4",
        pairId: "HMC_USDT",
        side: "buy",
        price: 1,
        amountBase: 100,
        amountQuote: 1,
        feeQuote: 0,
        feeHmc: 0,
        feeRole: "taker",
        feePaidInHmc: false,
        ts: now - 10 * 60_000,
      },
    ];
    const r = volumeRatio5m(trades, "HMC_USDT");
    expect(r.buyVol).toBe(70);
    expect(r.sellVol).toBe(30);
    expect(r.buyPct).toBe(70);
    expect(r.sellPct).toBe(30);
  });
});
