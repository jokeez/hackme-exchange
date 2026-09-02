/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { patchOracleTransparencyDom, renderOracleTransparencyPanel } from "./oraclePanel";
import { sampleMarket } from "../testFixtures";
import type { PoolLive } from "../types";

const liveOk: PoolLive = {
  poolGh: 88,
  workers: 12,
  miners: 10,
  blockHeight: 155000,
  rewardPerM: 0.00021,
  totalPayoutHmc: 1200,
  targetMod: 1,
  status: "ok",
};

describe("oraclePanel", () => {
  const now = 1_700_000_000_000;

  it("patchOracleTransparencyDom updates mids and telemetry in place", () => {
    document.body.innerHTML = renderOracleTransparencyPanel(
      { source: "live", fetchedAt: now - 2000, poolStatus: "ok" },
      sampleMarket(),
      liveOk,
    );
    patchOracleTransparencyDom(
      { source: "live", fetchedAt: now - 8000, poolStatus: "ok" },
      sampleMarket({ hmcUsdt: 0.0488, supUsdt: 0.0099, btcUsd: 87_000 }),
      { ...liveOk, poolGh: 200, workers: 44 },
      now,
    );
    expect(document.querySelector('[data-oracle-trans-mid="hmc"]')?.textContent).toContain("0.0488");
    expect(document.querySelector('[data-oracle-trans-stat="workers"]')?.textContent).toBe("44");
    expect(document.getElementById("oracle-trans-pill")?.classList.contains("live")).toBe(true);
    expect(document.getElementById("oracle-trans-sync")?.textContent).toMatch(/8s ago/);
  });
});
