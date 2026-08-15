import { describe, expect, it } from "vitest";
import { aggregateBookLevels, buildOrderBook, matchMarket } from "./book";
import { sampleTicker } from "./testFixtures";

describe("buildOrderBook", () => {
  it("builds symmetric bid/ask ladders", () => {
    const { bids, asks } = buildOrderBook(sampleTicker(), 10);
    expect(bids).toHaveLength(10);
    expect(asks).toHaveLength(10);
    expect(bids[0].price).toBeLessThan(asks[0].price);
    expect(bids[0].price).toBeGreaterThan(bids[1].price);
    expect(asks[0].price).toBeLessThan(asks[1].price);
  });

  it("sets totalQuote = price * amount", () => {
    const { bids } = buildOrderBook(sampleTicker(), 3);
    for (const b of bids) {
      expect(b.totalQuote).toBeCloseTo(b.price * b.amountBase, 8);
    }
  });

  it("phase option reshapes size waves without breaking ladder order", () => {
    const a = buildOrderBook(sampleTicker(), 8, { phase: 0 });
    const b = buildOrderBook(sampleTicker(), 8, { phase: 2.4 });
    expect(a.bids[0].price).toBe(b.bids[0].price);
    expect(a.bids[0].amountBase).not.toBe(b.bids[0].amountBase);
  });

  it("returns empty ladders for invalid mid", () => {
    const { bids, asks } = buildOrderBook(sampleTicker({ mid: 0, bid: 0, ask: 0 }), 8);
    expect(bids).toEqual([]);
    expect(asks).toEqual([]);
  });
});

describe("aggregateBookLevels", () => {
  it("merges amounts onto a price grid", () => {
    const levels = [
      { price: 1.001, amountBase: 10, totalQuote: 10.01 },
      { price: 1.002, amountBase: 5, totalQuote: 5.01 },
      { price: 1.011, amountBase: 7, totalQuote: 7.077 },
    ];
    const out = aggregateBookLevels(levels, 0.01, "ask");
    expect(out.length).toBeLessThan(levels.length);
    expect(out.every((l) => Number.isFinite(l.totalQuote))).toBe(true);
    const sum = out.reduce((s, l) => s + l.amountBase, 0);
    expect(sum).toBeCloseTo(22, 8);
  });

  it("passthrough when step is 0", () => {
    const levels = [{ price: 1, amountBase: 2, totalQuote: 2 }];
    expect(aggregateBookLevels(levels, 0, "bid")).toEqual(levels);
  });
});

describe("matchMarket", () => {
  it("buy walks asks and produces positive slippage vs mid", () => {
    const tk = sampleTicker({ mid: 1, bid: 0.999, ask: 1.001 });
    const res = matchMarket(tk, "buy", 100);
    expect(res.avgPrice).toBeGreaterThan(0);
    expect(res.quote).toBeGreaterThan(0);
    expect(res.slippageBps).toBeGreaterThanOrEqual(0);
  });

  it("sell walks bids", () => {
    const tk = sampleTicker({ mid: 1, bid: 0.999, ask: 1.001 });
    const res = matchMarket(tk, "sell", 50);
    expect(res.avgPrice).toBeLessThanOrEqual(tk.mid * 1.01);
    expect(res.quote).toBeCloseTo(res.avgPrice * 50, 6);
  });

  it("oversize order still returns avg fill", () => {
    const tk = sampleTicker();
    const res = matchMarket(tk, "buy", 1e12);
    expect(Number.isFinite(res.avgPrice)).toBe(true);
    expect(res.quote).toBeGreaterThan(0);
  });

  it("zero amount returns zero quote without NaN", () => {
    const res = matchMarket(sampleTicker(), "buy", 0);
    expect(res.quote).toBe(0);
    expect(Number.isFinite(res.avgPrice)).toBe(true);
    expect(Number.isFinite(res.slippageBps)).toBe(true);
  });

  it("walks lab book override instead of synthetic ladder", () => {
    const tk = sampleTicker({ mid: 1, bid: 0.99, ask: 1.01 });
    const lab = {
      bids: [{ price: 0.95, amountBase: 1000, totalQuote: 950 }],
      asks: [{ price: 1.1, amountBase: 50, totalQuote: 55 }],
    };
    const res = matchMarket(tk, "buy", 40, lab);
    expect(res.avgPrice).toBeCloseTo(1.1, 8);
    expect(res.quote).toBeCloseTo(44, 8);
  });
});
