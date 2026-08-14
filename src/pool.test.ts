import { describe, expect, it } from "vitest";
import { renderPoolPage, renderPoolRail, poolStatusBanner } from "./pool";
import { sampleMarket } from "./testFixtures";
import type { PoolLive } from "./types";
import { assetById, tradableQuoteAssets } from "./adapters/assets";

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

describe("pool html helpers", () => {
  it("renderPoolRail shows live settlement chip", () => {
    const html = renderPoolRail(liveOk);
    expect(html).toContain("pool-rail");
    expect(html).toContain("Live");
    expect(html).toContain("Hashrate");
  });

  it("renderPoolPage includes oracle mids and pool CTAs (not fuzz/CVE)", () => {
    const html = renderPoolPage(liveOk, sampleMarket());
    expect(html).toContain("Oracle mids");
    expect(html).toContain("HMC");
    expect(html).toContain("SUP");
    expect(html).toContain("Mine HMC");
    expect(html).toContain("https://hackme.tech/downloads.html#start");
    expect(html).toContain("https://hackme.tech/explorer-lite.html");
    expect(html).toContain("github.com/jokeez/hackme");
    expect(html).not.toContain("Open coordinator");
    expect(html).not.toContain("/hub-proxy/");
    expect(html).not.toContain("B2B Fuzz");
    expect(html).not.toContain("CVE Research");
  });

  it("renderPoolRail CTAs point at public hub, not hub-proxy", () => {
    const html = renderPoolRail(liveOk);
    expect(html).toContain('href="https://hackme.tech"');
    expect(html).toContain("https://hackme.tech/downloads.html#start");
    expect(html).not.toContain("/hub-proxy/");
  });

  it("offline status softens settlement label and shows banner", () => {
    const offline = { ...liveOk, status: "offline" as const, poolGh: 0, workers: 0, blockHeight: 0 };
    const rail = renderPoolRail(offline);
    expect(rail).toContain("check pool API");
    const banner = poolStatusBanner(offline);
    expect(banner).toContain("Coordinator offline");
    const page = renderPoolPage(offline, sampleMarket());
    expect(page).toContain("placeholders");
    expect(page).toContain("pool-status-banner");
  });
});

describe("assets extras", () => {
  it("assetById falls back to first", () => {
    expect(assetById("hmc").symbol).toBe("HMC");
    expect(assetById("usdt").settlement).toBe("bridge");
  });

  it("tradableQuoteAssets are USDT and BTC", () => {
    expect(tradableQuoteAssets().map((a) => a.id).sort()).toEqual(["btc", "usdt"]);
  });
});
