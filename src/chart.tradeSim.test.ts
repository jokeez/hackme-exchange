import { describe, expect, it } from "vitest";
import {
  clampTickMid,
  constrainBarToOpen,
  maxBodyFracForTf,
  maxJumpFracForTf,
  maxWickFracForTf,
  robustPriceRange,
  sanitizeCandleExtremes,
} from "./chartScale";
import { seedCandles, stats24h, upsertTick } from "./candles";
import { bollinger, ema, macd, rsi, sma, stochastic, toHeikin, vwap } from "./indicators";
import { TIMEFRAMES, type Candle, type Timeframe } from "./types";

function bar(t: number, o: number, h: number, l: number, c: number): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: 100 };
}

/** Simulate many same-bucket ticks (microTick / oracle walk) on one TF. */
function walkTip(tf: Timeframe, openPx: number, targetMid: number, ticks: number): Candle {
  let series = seedCandles("HMC_USDT", tf, openPx, 8);
  // Force tip open near openPx
  const tip0 = series[series.length - 1]!;
  series[series.length - 1] = {
    ...tip0,
    open: openPx,
    high: openPx,
    low: openPx,
    close: openPx,
  };
  let prev = openPx;
  for (let i = 0; i < ticks; i++) {
    series = upsertTick(series, tf, targetMid, "HMC_USDT", prev);
    prev = series[series.length - 1]!.close;
  }
  return series[series.length - 1]!;
}

describe("body vs open — all timeframes", () => {
  for (const tf of TIMEFRAMES) {
    it(`${tf}: multi-tick dump cannot paint >maxBody body (screenshot 1D class)`, () => {
      const openPx = 0.00087091;
      const dump = 0.00063371; // ~-27% like the broken 1D tip
      const tip = walkTip(tf, openPx, dump, 40);
      const bodyFrac = Math.abs(tip.close - tip.open) / tip.open;
      const maxBody = maxBodyFracForTf(tf);
      const maxWick = maxWickFracForTf(tf);
      expect(bodyFrac).toBeLessThanOrEqual(maxBody + 1e-9);
      // Wick pad may extend slightly beyond the body cap (CEX intrabar extremes).
      const span = maxBody + maxWick + 1e-9;
      expect(tip.low / tip.open).toBeGreaterThanOrEqual(1 - span);
      expect(tip.high / tip.open).toBeLessThanOrEqual(1 + span);
    });

    it(`${tf}: multi-tick pump stays within body cap`, () => {
      const openPx = 0.0005;
      const tip = walkTip(tf, openPx, openPx * 1.4, 40);
      expect(Math.abs(tip.close - tip.open) / tip.open).toBeLessThanOrEqual(maxBodyFracForTf(tf) + 1e-9);
    });
  }
});

describe("constrainBarToOpen / sanitize", () => {
  it("flattens screenshot OHLC O=0.00087 L=C=0.00063", () => {
    const raw = bar(1, 0.00087091, 0.00087091, 0.00063371, 0.00063371);
    const fixed = constrainBarToOpen(raw, maxBodyFracForTf("1D"));
    expect(Math.abs(fixed.close - fixed.open) / fixed.open).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it("sanitize heals cliff tip so robust range stays tight", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      const px = 0.00087;
      candles.push(bar(i, px, px * 1.001, px * 0.999, px));
    }
    candles[39] = bar(39, 0.00087, 0.00087, 0.00063, 0.00063);
    const cleaned = sanitizeCandleExtremes(candles, maxBodyFracForTf("1D"));
    const range = robustPriceRange(cleaned)!;
    const mid = (range.maxValue + range.minValue) / 2;
    expect((range.maxValue - range.minValue) / mid).toBeLessThan(0.2);
  });
});

describe("stats24h ignores cliff storage", () => {
  it("does not report −30% from one corrupt tip", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 100; i++) {
      const px = 0.00087;
      candles.push(bar(1_700_000_000 + i * 900, px, px * 1.001, px * 0.999, px));
    }
    candles[99] = bar(candles[99]!.time, 0.00087, 0.00087, 0.00063, 0.00063);
    const s = stats24h(candles, "15m");
    expect(Math.abs(s.changePct)).toBeLessThan(10);
    expect(s.low / 0.00087).toBeGreaterThan(0.9);
  });
});

describe("indicators on healed series", () => {
  it("EMA/SMA/BB/RSI/MACD/Stoch/VWAP/Heikin stay finite on all TFs", () => {
    for (const tf of ["1m", "15m", "1H", "1D"] as Timeframe[]) {
      let series = seedCandles("HMC_USDT", tf, 0.00063, 80);
      for (let i = 0; i < 25; i++) {
        const mid = 0.00063 * (i % 2 === 0 ? 0.7 : 1.3);
        series = upsertTick(series, tf, mid, "HMC_USDT", series[series.length - 1]!.close);
      }
      const cleaned = sanitizeCandleExtremes(series, maxBodyFracForTf(tf));
      const check = (pts: { value: number }[]) => {
        for (const p of pts) {
          expect(Number.isFinite(p.value)).toBe(true);
          expect(Math.abs(p.value)).toBeLessThan(1e6);
        }
      };
      check(sma(cleaned, 20));
      check(ema(cleaned, 50));
      const bb = bollinger(cleaned);
      check(bb.mid);
      check(bb.upper);
      check(bb.lower);
      check(vwap(cleaned));
      check(rsi(cleaned));
      const m = macd(cleaned);
      check(m.macd);
      check(m.signal);
      const st = stochastic(cleaned);
      check(st.k);
      check(st.d);
      const ha = toHeikin(cleaned);
      expect(ha.length).toBe(cleaned.length);
      for (const c of ha) {
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      }
    }
  });
});

describe("jump helpers", () => {
  it("1D jump is tighter than legacy 35%", () => {
    expect(maxJumpFracForTf("1D")).toBeLessThan(0.1);
    expect(maxBodyFracForTf("1D")).toBeLessThanOrEqual(0.05);
    expect(clampTickMid(0.00063, 0.00087, maxJumpFracForTf("1D"))).toBeGreaterThan(0.0008);
  });
});
