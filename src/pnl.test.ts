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
      { dateKey: "2026-01-01", label: "Jan 1", pnl: 10 },
      { dateKey: "2026-01-02", label: "Jan 2", pnl: -5 },
    ]);
    expect(html).toContain("pnl-calendar");
    expect(html).toContain("pnl-cal-cell");
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
