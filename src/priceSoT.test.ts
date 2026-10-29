import { describe, expect, it } from "vitest";
import {
  limitFormNeedsResync,
  pinTipCloseToLast,
  priceDriftFrac,
  pricesAligned,
  resolveCandleTip,
  resolveDeskLast,
  tapeOutsideBbo,
} from "./priceSoT";
import { maxBuyBaseAmount, maxOrderBaseAmount } from "./balance";
import { notionalMeetsMin } from "./money";
import { baseState, sampleMarket } from "./testFixtures";

describe("resolveCandleTip", () => {
  it("uses last trade only — never invents Soft-MM mid", () => {
    expect(resolveCandleTip({ tape: 0.064, tipClose: 0.06 })).toBeCloseTo(0.064, 8);
    expect(resolveCandleTip({ apiLast: 0.07 })).toBeCloseTo(0.07, 8);
    expect(resolveCandleTip({ tipClose: 0.06, prevTrade: 0.05 })).toBeCloseTo(0.06, 8);
    expect(resolveCandleTip({})).toBe(0);
  });
});

describe("resolveDeskLast", () => {
  it("prefers Soft-MM mid when fresh tape desyncs >2%", () => {
    const last = resolveDeskLast({
      tape: 0.064175,
      tapeAgeMs: 1_000,
      labMid: 0.072659,
    });
    expect(last).toBeCloseTo(0.072659, 8);
  });

  it("keeps fresh tape when aligned with Soft-MM", () => {
    const last = resolveDeskLast({
      tape: 0.0725,
      tapeAgeMs: 2_000,
      labMid: 0.072659,
    });
    expect(last).toBeCloseTo(0.0725, 8);
  });

  it("snaps to Soft-MM when stale tape drifts >2%", () => {
    const mid = resolveDeskLast({
      tape: 0.064175,
      tapeAgeMs: 120_000,
      labMid: 0.072659,
    });
    expect(mid).toBeCloseTo(0.072659, 8);
  });

  it("snaps to Soft-MM when fresh tape sits above the offer (HMC/BTC live)", () => {
    // Live 2026-10-25: last=0.0009119 > ask=0.000898 while mid≈0.000894
    const last = resolveDeskLast({
      tape: 0.0009119,
      tapeAgeMs: 5_000,
      labMid: 0.00089365,
      bestBid: 0.00088918,
      bestAsk: 0.00089812,
    });
    expect(last).toBeCloseTo(0.00089365, 10);
    expect(priceDriftFrac(last, 0.00089365)).toBeLessThan(1e-12);
  });

  it("keeps fresh tape inside the BBO even when mid drifts ~1%", () => {
    const last = resolveDeskLast({
      tape: 0.00089812,
      tapeAgeMs: 2_000,
      labMid: 0.00089365,
      bestBid: 0.00088918,
      bestAsk: 0.00089812,
    });
    expect(last).toBeCloseTo(0.00089812, 10);
  });

  it("falls back api → tip → prev", () => {
    expect(resolveDeskLast({ apiLast: 0.07 })).toBeCloseTo(0.07, 8);
    expect(resolveDeskLast({ tipClose: 0.06 })).toBeCloseTo(0.06, 8);
    expect(resolveDeskLast({ prevMid: 0.05 })).toBeCloseTo(0.05, 8);
    expect(resolveDeskLast({})).toBe(0);
  });
});

describe("tapeOutsideBbo", () => {
  it("detects print above ask / below bid", () => {
    expect(tapeOutsideBbo(0.0009119, 0.00088918, 0.00089812)).toBe(true);
    expect(tapeOutsideBbo(0.00088, 0.00088918, 0.00089812)).toBe(true);
    expect(tapeOutsideBbo(0.000893, 0.00088918, 0.00089812)).toBe(false);
  });

  it("desk Last after outside-BBO print matches Soft-MM (public_tape tip seed)", () => {
    // Simulate: set tape to print above ask, then resolve — tip must use this Last.
    const print = 0.0009119;
    const lab = 0.00089365;
    const last = resolveDeskLast({
      tape: print,
      tapeAgeMs: 0,
      labMid: lab,
      bestBid: 0.00088918,
      bestAsk: 0.00089812,
    });
    expect(last).toBeCloseTo(lab, 10);
    expect(pricesAligned(last, print, 0.01)).toBe(false);
  });
});

describe("limitFormNeedsResync", () => {
  it("resyncs undirtied form stuck on paper ~0.05 while desk Last is live", () => {
    expect(limitFormNeedsResync(0.04996821, 0.072659, false)).toBe(true);
    expect(limitFormNeedsResync(0.0725, 0.072659, false)).toBe(false);
    expect(limitFormNeedsResync(0.04996821, 0.072659, true)).toBe(false);
  });

  it("resyncs undirtied HMC/BTC form when Last snapped to Soft-MM mid", () => {
    const deskLast = 0.00089365;
    const resting = deskLast * 0.9985;
    expect(limitFormNeedsResync(0.0009119, resting, false, 0.0075)).toBe(true);
    expect(limitFormNeedsResync(resting, resting, false, 0.0075)).toBe(false);
    // ~0.85% stale form vs resting must resync (was hidden under 2% tol).
    expect(limitFormNeedsResync(deskLast * 1.0085, resting, false, 0.0075)).toBe(true);
  });
});

describe("pinTipCloseToLast", () => {
  it("forces forming tip close to desk Last", () => {
    const series = [
      { open: 0.06, high: 0.061, low: 0.059, close: 0.0605 },
      { open: 0.0605, high: 0.065, low: 0.06, close: 0.064175 },
    ];
    const changed = pinTipCloseToLast(series, 0.072659);
    expect(changed).toBe(true);
    expect(series[1]!.close).toBeCloseTo(0.072659, 8);
    expect(series[1]!.high).toBeGreaterThanOrEqual(0.072659);
  });
});

describe("pricesAligned", () => {
  it("detects header vs tip divergence from screenshot", () => {
    expect(pricesAligned(0.072659, 0.064175, 0.02)).toBe(false);
    expect(priceDriftFrac(0.072659, 0.064175)).toBeGreaterThan(0.1);
  });

  it("50 bps heal catches HMC/BTC last↔tip gap", () => {
    expect(pricesAligned(0.0009119, 0.00089554, 0.005)).toBe(false);
    expect(pricesAligned(0.00089365, 0.00089365, 0.005)).toBe(true);
  });
});

describe("limit 25% @ Avbl 1.07 USDT (screenshot regression)", () => {
  const MIN_N = 0.01;
  const PX = 0.072659;
  const AVBL = 1.07;

  for (const payFeesInHmc of [false, true]) {
    it(`limit buy 25% payFeesInHmc=${payFeesInHmc} fills ≥ min notional`, () => {
      const m = sampleMarket({ hmcUsdt: PX });
      const s = baseState({
        wallet: { usdt: AVBL, hmc: 0, sup: 0, btc: 0 },
        feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc, hmcDiscountPct: 25 },
      });
      const amt = maxOrderBaseAmount(s, m, "HMC_USDT", "buy", PX, "limit", 0.25, PX, {
        minNotionalQuote: MIN_N,
        notionalPrice: PX,
      });
      expect(amt).toBeGreaterThan(0);
      expect(notionalMeetsMin(PX, amt, MIN_N)).toBe(true);
      expect(amt * PX).toBeLessThanOrEqual(AVBL * 0.25 * 1.02);
    });
  }

  it("market buy 25% at slip ceiling still meets min", () => {
    const m = sampleMarket({ hmcUsdt: PX });
    const s = baseState({
      wallet: { usdt: AVBL, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const slip = PX * 1.05;
    const amt = maxBuyBaseAmount(s, m, "HMC_USDT", slip, "market", 0.25, PX, {
      minNotionalQuote: MIN_N,
      notionalPrice: PX,
    });
    expect(amt).toBeGreaterThan(0);
    expect(notionalMeetsMin(PX, amt, MIN_N)).toBe(true);
  });
});
