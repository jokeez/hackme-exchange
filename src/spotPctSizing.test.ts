/**
 * Live regression: Avbl 1.07 USDT + % chips must fill nonzero HMC meeting min notional.
 * c6c9186 min-notional gate + payFeesInHmc with 0 HMC previously forced Amount=0.
 */
import { describe, expect, it } from "vitest";
import { assertOrderFunds, maxBuyBaseAmount, maxOrderBaseAmount, maxSellBaseAmount } from "./balance";
import { notionalMeetsMin } from "./money";
import { baseState, sampleMarket } from "./testFixtures";

const MIN_N = 0.01;
const LIVE_HMC_USDT = 0.07001; // matches live desk last ~0.07
const AVBL_USDT = 1.07;

describe("spot % sizing Avbl 1.07 USDT", () => {
  for (const payFeesInHmc of [false, true]) {
    describe(`payFeesInHmc=${payFeesInHmc}`, () => {
      const feeConfig = {
        makerBps: 8,
        takerBps: 10,
        payFeesInHmc,
        hmcDiscountPct: 25,
      } as const;

      it.each([0.25, 0.5, 0.75, 1] as const)(
        "market buy %p fills nonzero base meeting min",
        (pct) => {
          const m = sampleMarket({ hmcUsdt: LIVE_HMC_USDT });
          const s = baseState({
            wallet: { usdt: AVBL_USDT, hmc: 0, sup: 0, btc: 0 },
            feeConfig: { ...feeConfig },
          });
          const slip = LIVE_HMC_USDT * 1.05;
          const amt = maxBuyBaseAmount(s, m, "HMC_USDT", slip, "market", pct, LIVE_HMC_USDT, {
            minNotionalQuote: MIN_N,
            notionalPrice: LIVE_HMC_USDT,
          });
          expect(amt).toBeGreaterThan(0);
          expect(notionalMeetsMin(LIVE_HMC_USDT, amt, MIN_N)).toBe(true);
          expect(
            assertOrderFunds(s, m, "HMC_USDT", "buy", amt, slip, "market", true, undefined, undefined, {
              honorPayFeesInHmc: false,
            }).ok,
          ).toBe(true);
          // Must not overspend quote budget at pct.
          expect(amt * slip).toBeLessThanOrEqual(AVBL_USDT * pct * 1.02);
        },
      );

      it.each([0.25, 0.5, 0.75, 1] as const)(
        "limit buy %p fills nonzero base meeting min",
        (pct) => {
          const m = sampleMarket({ hmcUsdt: LIVE_HMC_USDT });
          const s = baseState({
            wallet: { usdt: AVBL_USDT, hmc: 0, sup: 0, btc: 0 },
            feeConfig: { ...feeConfig },
          });
          const price = LIVE_HMC_USDT;
          const amt = maxOrderBaseAmount(s, m, "HMC_USDT", "buy", price, "limit", pct, price, {
            minNotionalQuote: MIN_N,
            notionalPrice: price,
          });
          expect(amt).toBeGreaterThan(0);
          expect(notionalMeetsMin(price, amt, MIN_N)).toBe(true);
        },
      );

      it.each([0.25, 0.5, 0.75, 1] as const)(
        "stop_limit buy %p fills nonzero base meeting min",
        (pct) => {
          const m = sampleMarket({ hmcUsdt: LIVE_HMC_USDT });
          const s = baseState({
            wallet: { usdt: AVBL_USDT, hmc: 0, sup: 0, btc: 0 },
            feeConfig: { ...feeConfig },
          });
          const price = LIVE_HMC_USDT * 0.99;
          const amt = maxOrderBaseAmount(s, m, "HMC_USDT", "buy", price, "stop_limit", pct, LIVE_HMC_USDT, {
            minNotionalQuote: MIN_N,
            notionalPrice: price,
          });
          expect(amt).toBeGreaterThan(0);
          expect(notionalMeetsMin(price, amt, MIN_N)).toBe(true);
        },
      );
    });
  }

  it("market/limit/stop sell % with HMC inventory fills nonzero", () => {
    const m = sampleMarket({ hmcUsdt: LIVE_HMC_USDT });
    const s = baseState({
      wallet: { usdt: 0, hmc: 2_000, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    for (const kind of ["market", "limit", "stop_limit"] as const) {
      for (const pct of [0.25, 0.5, 0.75, 1]) {
        const px = kind === "market" ? LIVE_HMC_USDT * 0.95 : LIVE_HMC_USDT;
        const amt = maxSellBaseAmount(s, m, "HMC_USDT", px, kind, pct, LIVE_HMC_USDT, {
          minNotionalQuote: MIN_N,
          notionalPrice: LIVE_HMC_USDT,
        });
        expect(amt).toBeGreaterThan(0);
        expect(notionalMeetsMin(LIVE_HMC_USDT, amt, MIN_N)).toBe(true);
      }
    }
  });

  it("never returns 0 when quote Avbl clearly funds min (regression c6c9186)", () => {
    const m = sampleMarket({ hmcUsdt: LIVE_HMC_USDT });
    const s = baseState({
      wallet: { usdt: AVBL_USDT, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
    });
    const amt = maxBuyBaseAmount(s, m, "HMC_USDT", LIVE_HMC_USDT * 1.05, "market", 0.5, LIVE_HMC_USDT, {
      minNotionalQuote: MIN_N,
      notionalPrice: LIVE_HMC_USDT,
    });
    expect(amt).toBeGreaterThan(0);
    expect(amt * LIVE_HMC_USDT).toBeGreaterThanOrEqual(MIN_N);
  });
});
