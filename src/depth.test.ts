import { describe, expect, it } from "vitest";
import { renderDepthPanel, renderDepthSvg, renderDepthSvgSized } from "./depth";
import { buildOrderBook } from "./book";
import { sampleTicker } from "./testFixtures";

describe("depth", () => {
  const { bids, asks } = buildOrderBook(sampleTicker({ mid: 1, bid: 0.999, ask: 1.001 }), 8);

  it("renderDepthSvg returns svg with bid/ask paths", () => {
    const svg = renderDepthSvg(bids, asks);
    expect(svg).toContain("<svg");
    expect(svg).toContain("depth-bid");
    expect(svg).toContain("depth-ask");
    expect(svg).toContain('viewBox="0 0 248 72"');
  });

  it("renderDepthSvgSized uses custom dimensions", () => {
    const svg = renderDepthSvgSized(bids, asks, 400, 120);
    expect(svg).toContain('viewBox="0 0 400 120"');
  });

  it("renderDepthPanel includes tables and note", () => {
    const html = renderDepthPanel(bids, asks, "HMC", "USDT");
    expect(html).toContain("depth-panel");
    expect(html).toContain("Bids");
    expect(html).toContain("Asks");
    expect(html).toContain("HMC/USDT");
  });

  it("empty books still produce svg", () => {
    const svg = renderDepthSvg([], []);
    expect(svg).toContain("<svg");
  });
});
