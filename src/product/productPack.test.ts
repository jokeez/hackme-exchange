/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { findDustBalances, DUST_USD_THRESHOLD } from "./dustConvert";
import { exportFillsCsv, exportOrdersCsv } from "./exportOrders";
import {
  equityDailySeries,
  formatChartDayLabel,
  portfolioEquityChart30d,
  snapshotsLast30d,
  wirePortfolioEquityChart,
} from "./portfolioChart";
import { setEquityDenom } from "../accountPortfolio";
import { baseState, sampleMarket } from "../testFixtures";

describe("dustConvert", () => {
  it("finds balances under dust threshold", () => {
    const market = sampleMarket();
    const wallet = { usdt: 100, hmc: 0.001, sup: 0, btc: 0 };
    const dust = findDustBalances(wallet, market);
    expect(dust.length).toBeGreaterThan(0);
    expect(dust[0]!.usdValue).toBeLessThan(DUST_USD_THRESHOLD);
  });
});

describe("exportOrders", () => {
  it("exports CSV headers", () => {
    const st = baseState();
    expect(exportOrdersCsv(st)).toMatch(/^id,pair,side/);
    expect(exportFillsCsv(st)).toMatch(/^id,pair,side/);
  });
});

describe("portfolioChart", () => {
  it("filters 30d snapshots", () => {
    const now = Date.now();
    const snaps = [
      { ts: now - 40 * 864e5, equityUsdt: 100 },
      { ts: now - 5 * 864e5, equityUsdt: 110 },
      { ts: now, equityUsdt: 115 },
    ];
    expect(snapshotsLast30d(snaps)).toHaveLength(2);
  });

  it("aggregates daily equity points", () => {
    const now = Date.now();
    const day = 86_400_000;
    const snaps = [
      { ts: now - 3 * day, equityUsdt: 10_000 },
      { ts: now - 3 * day + 3600e3, equityUsdt: 10_200 },
      { ts: now - day, equityUsdt: 12_000 },
      { ts: now, equityUsdt: 11_500 },
    ];
    const daily = equityDailySeries(snaps);
    expect(daily).toHaveLength(3);
    expect(daily[0]!.equityUsdt).toBe(10_200);
    expect(daily.at(-1)!.equityUsdt).toBe(11_500);
  });

  it("renders interactive chart markup", () => {
    const now = Date.now();
    const html = portfolioEquityChart30d(
      [{ ts: now, equityUsdt: 12_000 }],
      { market: sampleMarket(), denom: "USDT", initialEquityUsdt: 10_000 },
    );
    expect(html).toContain("data-portfolio-chart");
    expect(html).toContain("portfolio-30d-stage");
    expect(html).toContain("12,000");
  });

  it("backfills chart from initial equity when only one snapshot", () => {
    const now = Date.now();
    const html = portfolioEquityChart30d(
      [{ ts: now, equityUsdt: 24_000 }],
      { market: sampleMarket(), initialEquityUsdt: 20_000 },
    );
    expect(html).not.toContain("portfolio-30d-empty");
    expect(html).toContain("portfolio-30d-stage");
  });

  it("updates value on hover in selected equity denom", () => {
    setEquityDenom("HMC");
    const now = Date.now();
    const market = sampleMarket();
    document.body.innerHTML = `<div id="acct-portfolio-30d">${portfolioEquityChart30d(
      [
        { ts: now - 5 * 864e5, equityUsdt: 15_000 },
        { ts: now - 3 * 864e5, equityUsdt: 14_200 },
        { ts: now, equityUsdt: 12_000 },
      ],
      { market, denom: "HMC" },
    )}</div>`;
    wirePortfolioEquityChart(document.body);
    const stage = document.getElementById("portfolio-30d-stage")!;
    const svg = stage.querySelector("svg")!;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 360, height: 96, right: 360, bottom: 96, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, bubbles: true }));
    expect(document.getElementById("portfolio-30d-val")?.textContent).toMatch(/300[,.]?000/);
    expect(formatChartDayLabel(now - 5 * 864e5)).not.toBe("Today");
  });

  it("updates value on hover", () => {
    setEquityDenom("USDT");
    const now = Date.now();
    const market = sampleMarket();
    document.body.innerHTML = `<div id="acct-portfolio-30d">${portfolioEquityChart30d(
      [
        { ts: now - 5 * 864e5, equityUsdt: 15_000 },
        { ts: now - 3 * 864e5, equityUsdt: 14_200 },
        { ts: now, equityUsdt: 12_000 },
      ],
      { market, denom: "USDT" },
    )}</div>`;
    wirePortfolioEquityChart(document.body);
    const stage = document.getElementById("portfolio-30d-stage")!;
    const svg = stage.querySelector("svg")!;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 360, height: 96, right: 360, bottom: 96, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    stage.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, bubbles: true }));
    expect(document.getElementById("portfolio-30d-val")?.textContent).toContain("15,000");
    expect(formatChartDayLabel(now - 5 * 864e5)).not.toBe("Today");
  });
});
