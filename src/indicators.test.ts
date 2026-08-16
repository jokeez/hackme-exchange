import { describe, expect, it } from "vitest";
import { bollinger, ema, macd, rsi, sma, stochastic, toHeikin, vwap } from "./indicators";
import { linearCandles } from "./testFixtures";

describe("indicators", () => {
  const candles = linearCandles(40, 100, 1, 1000);

  it("sma averages closes", () => {
    const out = sma(candles, 5);
    expect(out.length).toBe(candles.length - 4);
    const last5 = candles.slice(-5).reduce((s, c) => s + c.close, 0) / 5;
    expect(out[out.length - 1].value).toBeCloseTo(last5, 10);
  });

  it("ema is smoother and same length as warmup allows", () => {
    const out = ema(candles, 10);
    expect(out.length).toBe(candles.length - 9);
    expect(out[0].value).toBeGreaterThan(0);
  });

  it("bollinger bands sandwich mid", () => {
    const bb = bollinger(candles, 20, 2);
    expect(bb.mid).toHaveLength(candles.length - 19);
    for (let i = 0; i < bb.mid.length; i++) {
      expect(bb.upper[i].value).toBeGreaterThan(bb.mid[i].value);
      expect(bb.lower[i].value).toBeLessThan(bb.mid[i].value);
    }
  });

  it("vwap stays near price for flat volume", () => {
    const out = vwap(candles);
    expect(out).toHaveLength(candles.length);
    expect(out[out.length - 1].value).toBeGreaterThan(100);
  });

  it("macd emits only after slow EMA warmup", () => {
    const m = macd(candles, 12, 26, 9);
    expect(m.macd.length).toBe(candles.length - 25);
    expect(m.signal.length).toBe(m.macd.length - 8);
    expect(m.hist.length).toBe(m.signal.length);
    const lastMacd = m.macd[m.macd.length - 1]!;
    const lastSig = m.signal[m.signal.length - 1]!;
    const lastHist = m.hist[m.hist.length - 1]!;
    expect(lastHist.time).toBe(lastSig.time);
    expect(lastHist.value).toBeCloseTo(lastMacd.value - lastSig.value, 8);
  });

  it("rsi is 100 when avgLoss is zero (all gains)", () => {
    const rising = linearCandles(30, 100, 1, 1000);
    const out = rsi(rising, 14);
    expect(out.length).toBeGreaterThan(0);
    expect(out[out.length - 1]!.value).toBe(100);
  });

  it("rsi stays in 0..100", () => {
    const mixed = linearCandles(40, 100, 0.2, 1000);
    // Add a down bar so RSI is not stuck at 100 for the whole series
    mixed[20]!.close = mixed[19]!.close * 0.98;
    mixed[20]!.low = mixed[20]!.close;
    const out = rsi(mixed, 14);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it("stochastic k/d in range", () => {
    const st = stochastic(candles, 14, 3);
    expect(st.k.length).toBeGreaterThan(0);
    expect(st.d.length).toBe(st.k.length - 2);
    for (const p of st.k) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it("toHeikin preserves length and volume", () => {
    const ha = toHeikin(candles);
    expect(ha).toHaveLength(candles.length);
    expect(ha[0].volume).toBe(candles[0].volume);
    expect(ha[ha.length - 1].high).toBeGreaterThanOrEqual(ha[ha.length - 1].close);
  });

  it("rsi empty when not enough bars", () => {
    expect(rsi(linearCandles(5), 14)).toEqual([]);
  });
});
