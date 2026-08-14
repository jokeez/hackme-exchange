import { describe, expect, it } from "vitest";
import { formatExchangeReject } from "./adapters/exchangeApi";
import {
  DEFAULT_MIN_NOTIONAL_QUOTE,
  DEFAULT_PRICE_BAND_BPS,
  parseHealthFeeWallet,
  parseHealthTradingGuards,
  validatePaperTradingGuards,
} from "./tradingGuards";

describe("tradingGuards", () => {
  it("paper defaults are 1 quote · ±1500 bps (soft API may override via health)", () => {
    expect(DEFAULT_MIN_NOTIONAL_QUOTE).toBe(1);
    expect(DEFAULT_PRICE_BAND_BPS).toBe(1500);
    const g = parseHealthTradingGuards({ ok: true });
    expect(g.minNotionalQuote).toBe(1);
    expect(g.priceBandBps).toBe(1500);
    expect(g.labMmSeeded).toBe(false);
  });

  it("parses health overrides without inventing MM seed", () => {
    const g = parseHealthTradingGuards({
      ok: true,
      min_notional: 200_000_000,
      price_band_bps: 1000,
      lab_mm: true,
    });
    expect(g.minNotionalQuote).toBe(2);
    expect(g.priceBandBps).toBe(1000);
    expect(g.labMmEnabled).toBe(true);
    // bare boolean lab_mm=true does not imply seeded badge
    expect(g.labMmSeeded).toBe(false);

    const seeded = parseHealthTradingGuards({
      ok: true,
      mm_seeded: true,
      lab_mm: { enabled: true, seeded: true },
    });
    expect(seeded.labMmSeeded).toBe(true);

    // Live API shape: lab_mm object with enabled (seed MM live)
    const live = parseHealthTradingGuards({
      ok: true,
      min_notional: 100_000_000,
      price_band_bps: 1500,
      lab_mm: { enabled: true, levels: 5, address: "HMC-mm" },
    });
    expect(live.minNotionalQuote).toBe(1);
    expect(live.priceBandBps).toBe(1500);
    expect(live.labMmEnabled).toBe(true);
    expect(live.labMmSeeded).toBe(true);
  });

  it("rejects paper dust notional and out-of-band limit", () => {
    const mid = 0.0004;
    const dust = validatePaperTradingGuards({
      side: "buy",
      kind: "limit",
      amountBase: 100,
      price: mid,
      mid,
    });
    expect(dust.ok).toBe(false);
    if (!dust.ok) expect(dust.reason).toMatch(/Min notional/i);

    const ok = validatePaperTradingGuards({
      side: "buy",
      kind: "limit",
      amountBase: 50_000,
      price: mid,
      mid,
    });
    expect(ok.ok).toBe(true);

    const far = validatePaperTradingGuards({
      side: "buy",
      kind: "limit",
      amountBase: 50_000,
      price: mid * 1.2,
      mid,
    });
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.reason).toMatch(/band/i);
  });

  it("formatExchangeReject prefers API error string + code", () => {
    expect(
      formatExchangeReject({
        ok: false,
        status: 400,
        code: "min_notional",
        message: "notional below minimum",
      }),
    ).toBe("min_notional: notional below minimum");
    expect(
      formatExchangeReject({
        ok: false,
        status: 400,
        code: "invalid_order",
        message: "invalid order",
      }),
    ).toBe("Invalid order");
    expect(
      formatExchangeReject({
        ok: false,
        status: 400,
        code: "insufficient_hmc_fee",
        message: "",
      }),
    ).toBe("Insufficient HMC for fee");
    expect(
      formatExchangeReject({
        ok: false,
        status: 409,
        code: "convert_inventory",
        message: "convert inventory insufficient — try a smaller size or spot book",
      }),
    ).toMatch(/convert inventory insufficient/i);
    expect(
      formatExchangeReject({
        ok: false,
        status: 400,
        code: "no_mid",
        message: "",
      }),
    ).toBe("No seed mid for this pair");
    expect(
      formatExchangeReject({
        ok: false,
        status: 400,
        code: "unknown_pair",
        message: "unknown pair",
      }),
    ).toBe("Unsupported convert / trade pair");
  });

  it("parses convert_fee / hmc_fee_pay health flags", () => {
    const bare = parseHealthTradingGuards({ ok: true });
    expect(bare.convertFeeServer).toBe(false);
    expect(bare.hmcFeePayServer).toBe(false);

    const flagged = parseHealthTradingGuards({
      ok: true,
      convert_fee: true,
      fees: { hmc_fee_pay: true, hmc_discount_pct: 25, convert_taker_bps: 10 },
    });
    expect(flagged.convertFeeServer).toBe(true);
    expect(flagged.hmcFeePayServer).toBe(true);
    expect(flagged.hmcDiscountPctServer).toBe(25);

    const nested = parseHealthTradingGuards({
      ok: true,
      features: { convert_fee: 1, hmc_fee_pay: "true" },
    });
    expect(nested.convertFeeServer).toBe(true);
    expect(nested.hmcFeePayServer).toBe(true);

    // Live API shape: discount pct + pay_fee_in_hmc hint string + convert_fee "taker"
    const liveApi = parseHealthTradingGuards({
      ok: true,
      fees: {
        hmc_fee_discount_pct: 25,
        pay_fee_in_hmc: "POST /orders|/convert pay_fee_in_hmc=true",
        convert_fee: "taker",
        hmc_fee_pay: true,
      },
    });
    expect(liveApi.hmcFeePayServer).toBe(true);
    expect(liveApi.convertFeeServer).toBe(true);
    expect(liveApi.hmcDiscountPctServer).toBe(25);

    // Discount pct alone is enough to mark HMC fee-pay support
    const discOnly = parseHealthTradingGuards({
      ok: true,
      fees: { hmc_fee_discount_pct: 25 },
    });
    expect(discOnly.hmcFeePayServer).toBe(true);
    expect(discOnly.hmcDiscountPctServer).toBe(25);
  });

  it("parseHealthFeeWallet returns address or null", () => {
    expect(parseHealthFeeWallet(null)).toBeNull();
    expect(parseHealthFeeWallet({ ok: true })).toBeNull();
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: "" })).toBeNull();
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: "   " })).toBeNull();
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: "  HMC-fee123  " })).toBe("HMC-fee123");
    // Live API shape: { address, note }
    expect(
      parseHealthFeeWallet({
        ok: true,
        fee_wallet: {
          address: "HMC-726a266afdaec757",
          note: "spot fee collection wallet (lab)",
        },
      }),
    ).toBe("HMC-726a266afdaec757");
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: { address: "  HMC-obj  " } })).toBe("HMC-obj");
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: { address: "" } })).toBeNull();
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: { address: "   " } })).toBeNull();
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: { note: "no address" } })).toBeNull();
    expect(parseHealthFeeWallet({ ok: true, fee_wallet: {} })).toBeNull();
  });
});
