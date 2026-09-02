import { describe, expect, it } from "vitest";
import { findDustBalances, DUST_USD_THRESHOLD } from "./dustConvert";
import { exportFillsCsv, exportOrdersCsv } from "./exportOrders";
import { snapshotsLast30d } from "./portfolioChart";
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
});
