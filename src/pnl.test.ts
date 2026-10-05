import { describe, expect, it } from "vitest";
import {
  bookDepthRatio,
  dailyPnlCalendar,
  pnlWindows,
  renderPnlCalendarHtml,
  snapshotEquity,
  volumeRatio5m,
  volumeRatioFromPrints,
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

  it("dailyPnlCalendar keeps prior-day PnL from EOD snaps across rollover", () => {
    const s = baseState();
    const now = Date.now();
    // Noon anchors so dayKey is stable across TZ edges in CI.
    const dayAgo = (n: number) => {
      const d = new Date(now);
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - n);
      return d.getTime();
    };
    s.equitySnapshots = [
      { ts: dayAgo(2), equityUsdt: 10.0 },
      { ts: dayAgo(1), equityUsdt: 9.5 },
      { ts: dayAgo(0), equityUsdt: 9.0 },
    ];
    const days = dailyPnlCalendar(s, market, 7);
    const yday = days[days.length - 2]!;
    const today = days[days.length - 1]!;
    expect(yday.hasData).toBe(true);
    expect(yday.pnl).toBeCloseTo(-0.5, 8);
    expect(today.hasData).toBe(true);
    expect(today.pnl).toBeCloseTo(-0.5, 8);
    expect(today.isToday).toBe(true);
  });

  it("calendar history survives compactEquitySnapshots after dense today snaps", async () => {
    const { compactEquitySnapshots } = await import("./store");
    const s = baseState();
    const now = Date.now();
    const dayAgo = (n: number) => {
      const d = new Date(now);
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - n);
      return d.getTime();
    };
    const snaps = [
      { ts: dayAgo(3), equityUsdt: 10.0 },
      { ts: dayAgo(2), equityUsdt: 10.2 },
      { ts: dayAgo(1), equityUsdt: 10.1 },
    ];
    for (let i = 100; i >= 0; i--) {
      snaps.push({ ts: now - i * 60_000, equityUsdt: 10.1 - 0.002 });
    }
    s.equitySnapshots = compactEquitySnapshots(snaps, false);
    const days = dailyPnlCalendar(s, market, 7);
    const d3 = days[days.length - 4]!;
    const d2 = days[days.length - 3]!;
    const d1 = days[days.length - 2]!;
    expect(d3.hasData).toBe(true);
    expect(d2.hasData).toBe(true);
    expect(d1.hasData).toBe(true);
    expect(d2.pnl).toBeCloseTo(0.2, 2);
    // Compact may fold a dense today tick onto the prior day boundary (±0.002).
    expect(d1.pnl).toBeCloseTo(-0.1, 2);
    // Today must remain present after compact (pnl may be ~0 if open≈last).
    const today = days[days.length - 1]!;
    expect(today.hasData).toBe(true);
    expect(today.isToday).toBe(true);
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

describe("bookDepthRatio", () => {
  it("is unknown (not fake 50/50) when book empty", () => {
    const r = bookDepthRatio([], []);
    expect(r.known).toBe(false);
    expect(r.buyPct).toBe(50);
  });

  it("weights by quote notional from visible L2", () => {
    const r = bookDepthRatio(
      [
        { totalQuote: 0.02 },
        { totalQuote: 0.38 },
        { totalQuote: 0.75 },
      ],
      [
        { totalQuote: 0.39 },
        { totalQuote: 0.16 },
        { totalQuote: 0.78 },
        { totalQuote: 0.25 },
      ],
    );
    expect(r.known).toBe(true);
    expect(r.buyVol).toBeCloseTo(1.15, 6);
    expect(r.sellVol).toBeCloseTo(1.58, 6);
    expect(r.buyPct + r.sellPct).toBeCloseTo(100, 6);
    expect(r.buyPct).toBeLessThan(50);
    expect(r.sellPct).toBeGreaterThan(50);
  });
});

describe("volumeRatioFromPrints", () => {
  it("marks known=false when empty", () => {
    expect(volumeRatioFromPrints([], "HMC_USDT").known).toBe(false);
  });

  it("can weight quote notional", () => {
    const now = Date.now();
    const r = volumeRatioFromPrints(
      [
        { pairId: "HMC_USDT", ts: now, side: "buy", amountBase: 10, price: 2 },
        { pairId: "HMC_USDT", ts: now, side: "sell", amountBase: 10, price: 1 },
      ],
      "HMC_USDT",
      60_000,
      true,
    );
    expect(r.known).toBe(true);
    expect(r.buyVol).toBe(20);
    expect(r.sellVol).toBe(10);
    expect(r.buyPct).toBeCloseTo(66.666, 1);
  });
});
