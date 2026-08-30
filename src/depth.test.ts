import { describe, expect, it } from "vitest";
import { depthStats, renderDepthPanel, renderDepthSvg } from "./depth";
import { buildOrderBook } from "./book";
import { sampleTicker } from "./testFixtures";

describe("depth", () => {
  const { bids, asks } = buildOrderBook(sampleTicker({ mid: 1, bid: 0.999, ask: 1.001 }), 8);

  it("depthStats computes mid and spread", () => {
    const s = depthStats(bids, asks);
    expect(s.bestBid).toBeGreaterThan(0);
    expect(s.bestAsk).toBeGreaterThan(s.bestBid);
    expect(s.mid).toBeGreaterThan(s.bestBid);
    expect(s.spreadAbs).toBeGreaterThan(0);
  });

  it("renderDepthSvg returns svg with bid/ask paths", () => {
    const svg = renderDepthSvg(bids, asks);
    expect(svg).toContain("<svg");
    expect(svg).toContain("depth-bid");
    expect(svg).toContain("depth-ask");
    expect(svg).toContain("depth-mid-label");
    expect(svg).toContain('viewBox="0 0 248 72"');
  });

  it("renderDepthPanel includes summary and depth-amt", () => {
    const html = renderDepthPanel(bids, asks, "HMC", "USDT");
    expect(html).toContain("depth-panel");
    expect(html).toContain("depth-summary");
    expect(html).toContain("depth-amt");
    expect(html).toContain("Spread");
  });

  it("renderDepthPanel lab note when labLive", () => {
    const html = renderDepthPanel(bids, asks, "HMC", "USDT", { labLive: true });
    expect(html).toContain("lab matching L2");
  });

  it("empty lab depth copy", () => {
    const html = renderDepthPanel([], [], "HMC", "USDT", { labLive: true });
    expect(html).toContain("lab book");
  });

  it("empty books produce empty svg shell", () => {
    const svg = renderDepthSvg([], []);
    expect(svg).toContain("depth-svg-empty");
  });
});
