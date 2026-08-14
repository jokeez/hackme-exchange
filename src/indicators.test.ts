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

  it("rsi stays in 0..100", () => {
    const out = rsi(candles, 14);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
    // rising series → rsi generally high
    expect(out[out.length - 1].value).toBeGreaterThan(50);
  });

  it("macd produces related series", () => {
    const m = macd(candles);
    expect(m.macd).toHaveLength(candles.length);
    expect(m.signal).toHaveLength(candles.length);
    expect(m.hist).toHaveLength(candles.length);
    expect(m.hist[m.hist.length - 1].value).toBeCloseTo(
      m.macd[m.macd.length - 1].value - m.signal[m.signal.length - 1].value,
      8,
    );
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
