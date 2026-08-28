import { describe, expect, it } from "vitest";
import type { Candle } from "./types";
import { buildPairQuote, pairQuoteFromMid } from "./quote";

const candles15: Candle[] = [
  { time: 1, open: 0.05, high: 0.051, low: 0.049, close: 0.0505, volume: 1000 },
  { time: 2, open: 0.0505, high: 0.052, low: 0.05, close: 0.051, volume: 1200 },
  { time: 3, open: 0.051, high: 0.053, low: 0.0505, close: 0.052, volume: 900 },
];

describe("pairQuoteFromMid", () => {
  it("uses same mid and 24h change for toolbar and market row", () => {
    const mid = 0.052;
    const a = pairQuoteFromMid(mid, { "15m": candles15 });
    const b = pairQuoteFromMid(mid, { "15m": candles15 });
    expect(a.mid).toBe(b.mid);
    expect(a.changePct).toBe(b.changePct);
    expect(a.tone).toBe(b.tone);
  });

  it("tone matches change sign", () => {
    const up = pairQuoteFromMid(0.052, { "15m": candles15 });
    expect(up.changePct).toBeGreaterThan(0);
    expect(up.tone).toBe("up");

    const downCandles: Candle[] = [
      { time: 1, open: 0.06, high: 0.061, low: 0.059, close: 0.06, volume: 100 },
      { time: 2, open: 0.06, high: 0.0605, low: 0.055, close: 0.056, volume: 100 },
    ];
    const down = pairQuoteFromMid(0.056, { "15m": downCandles });
    expect(down.changePct).toBeLessThan(0);
    expect(down.tone).toBe("down");
  });

  it("buildPairQuote exposes refOpen aligned with changePct window", () => {
    const q = buildPairQuote({
      pairId: "HMC_USDT",
      mid: 0.052,
      candlesByTf: { "15m": candles15 },
    });
    expect(q.refOpen).toBeCloseTo(0.05, 6);
    expect(q.refClose).toBeCloseTo(0.052, 6);
    expect(q.changePct).toBeCloseTo(((0.052 - 0.05) / 0.05) * 100, 4);
  });
});
