import { describe, expect, it } from "vitest";
import { CONVERT_ROUTES, convert, convertChipDefaultAmount, convertFeeHintLine, convertNetReceive, convertRateLabel, convertSlippageDriftBps, feeQuoteFromLabConvert, flipRoute, formatConvertFeeToast, formatLabConvertFeeToast, isConvertPreviewError, previewConvert, routeForAssets, type ConvertPreview } from "./convert";
import { placeOrder } from "./orders";
import { baseState, sampleMarket } from "./testFixtures";

describe("convert", () => {
  const market = sampleMarket();

  it("lists bidirectional routes including BTC", () => {
    expect(CONVERT_ROUTES.length).toBeGreaterThanOrEqual(10);
    expect(CONVERT_ROUTES.map((r) => r.id)).toEqual([
      "HMC_USDT",
      "USDT_HMC",
      "SUP_USDT",
      "USDT_SUP",
      "HMC_SUP",
      "SUP_HMC",
      "HMC_BTC",
      "BTC_HMC",
      "SUP_BTC",
      "BTC_SUP",
    ]);
  });

  it("routeForAssets + flipRoute round-trip", () => {
    expect(routeForAssets("hmc", "usdt")).toBe("HMC_USDT");
    expect(flipRoute("HMC_USDT")).toBe("USDT_HMC");
    expect(flipRoute("USDT_HMC")).toBe("HMC_USDT");
    expect(routeForAssets("hmc", "hmc")).toBeNull();
  });

  it("rejects non-positive amount", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 1000, sup: 100, btc: 0 } });
    expect(convert(s, market, "HMC_USDT", 0).ok).toBe(false);
  });

  it("rejects NaN / Infinity without corrupting wallet", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 1000, sup: 100, btc: 0 } });
    expect(convert(s, market, "HMC_USDT", Number.NaN).ok).toBe(false);
    expect(convert(s, market, "HMC_USDT", Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(s.wallet.hmc).toBe(1000);
    expect(s.wallet.usdt).toBe(100);
  });

  it("rejects insufficient balance", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 10, sup: 100, btc: 0 } });
    const res = convert(s, market, "HMC_USDT", 100);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Insufficient");
  });

  it("rejects convert that would spend quote reserved by open buy", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 0, sup: 0, btc: 0 } });
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 1000, 0.04, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    const res = convert(s, market, "USDT_HMC", 80);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/reserved|Insufficient/i);
    expect(s.wallet.usdt).toBe(100);
    expect(s.orders.filter((x) => x.status === "open")).toHaveLength(1);
  });

  it("HMC → USDT credits quote at mid minus taker fee", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 10_000, sup: 0, btc: 0 } });
    const amt = 1000;
    const gross = amt * market.hmcUsdt;
    const res = convert(s, market, "HMC_USDT", amt);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.got).toBeCloseTo(gross, 10);
    expect(res.fee.role).toBe("taker");
    expect(res.fee.bps).toBe(10); // Regular
    expect(res.fee.feeQuote).toBeCloseTo(gross * 0.001, 10);
    expect(s.wallet.hmc).toBe(9000);
    expect(s.wallet.usdt).toBeCloseTo(100 + gross - res.fee.feeQuote, 10);
    const prev = previewConvert(s, market, "HMC_USDT", amt) as ConvertPreview;
    expect(convertNetReceive(prev)).toBeCloseTo(gross - res.fee.feeQuote, 10);
  });

  it("USDT → HMC inverts mid and charges taker on USDT notional", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 0, sup: 0, btc: 0 } });
    const res = convert(s, market, "USDT_HMC", 10);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.got).toBeCloseTo(10 / market.hmcUsdt, 8);
    expect(res.fee.feeQuote).toBeCloseTo(10 * 0.001, 10);
    expect(s.wallet.usdt).toBeCloseTo(90 - res.fee.feeQuote, 10);
  });

  it("SUP → USDT", () => {
    const s = baseState({ wallet: { usdt: 0, hmc: 0, sup: 5000, btc: 0 } });
    const res = convert(s, market, "SUP_USDT", 1000);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.got).toBeCloseTo(1000 * market.supUsdt, 12);
    expect(res.fee.feeQuote).toBeGreaterThan(0);
  });

  it("HMC → SUP uses cross mid + taker", () => {
    const s = baseState({ wallet: { usdt: 0, hmc: 100, sup: 0, btc: 0 } });
    const res = convert(s, market, "HMC_SUP", 10);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.got).toBeCloseTo(10 * market.hmcSup, 10);
    expect(s.wallet.sup).toBeCloseTo(res.got - res.fee.feeQuote, 10);
  });

  it("HMC → BTC and reverse (fees prevent exact round-trip)", () => {
    const s = baseState({ wallet: { usdt: 0, hmc: 10_000, sup: 0, btc: 0 } });
    const res = convert(s, market, "HMC_BTC", 1000);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.got).toBeCloseTo(1000 * market.hmcBtc, 12);
    const btcAfterFee = s.wallet.btc;
    expect(btcAfterFee).toBeLessThan(res.got);
    // Leave quote for the reverse convert's taker fee.
    const spend = btcAfterFee * 0.99;
    const back = convert(s, market, "BTC_HMC", spend);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.got).toBeLessThan(1000);
  });

  it("previewConvert does not mutate wallet", () => {
    const s = baseState({ wallet: { usdt: 50, hmc: 500, sup: 0, btc: 0 } });
    const prev = previewConvert(s, market, "HMC_USDT", 100);
    expect("ok" in prev && prev.ok === false).toBe(false);
    expect(s.wallet.hmc).toBe(500);
    expect(s.wallet.usdt).toBe(50);
  });

  it("pay fees in HMC on convert", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 10_000, sup: 0, btc: 0 } });
    s.feeConfig.payFeesInHmc = true;
    s.feeConfig.hmcDiscountPct = 25;
    const amt = 1000;
    const gross = amt * market.hmcUsdt;
    const res = convert(s, market, "HMC_USDT", amt);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fee.paidInHmc).toBe(true);
    expect(s.wallet.usdt).toBeCloseTo(100 + gross, 10);
    expect(s.wallet.hmc).toBeCloseTo(9000 - res.fee.feeHmc, 8);
  });

  it("convertFeeHintLine includes estimated fee amount", () => {
    const s = baseState();
    const prev = previewConvert(s, market, "HMC_USDT", 1000);
    expect("ok" in prev && prev.ok === false).toBe(false);
    const line = convertFeeHintLine(prev as ConvertPreview);
    expect(line).toMatch(/Taker|est/);
    expect(line).toMatch(/USDT|HMC/);
  });

  it("feeQuoteFromLabConvert rebuilds HMC-paid fee for ledger", () => {
    const q = feeQuoteFromLabConvert(
      { fee_quote: 0, fee_hmc: 50_000_000, fee_bps: 10, paid_in_hmc: true },
      {
        feeQuoteDisplay: 0,
        feeHmcDisplay: 0.5,
        hmcUsdt: 0.00042,
        vipName: "Regular",
        hmcDiscountPct: 25,
        fallbackTakerBps: 10,
      },
    );
    expect(q).not.toBeNull();
    expect(q!.paidInHmc).toBe(true);
    expect(q!.feeHmc).toBe(0.5);
    expect(q!.feeQuote).toBeCloseTo(0.5 * 0.00042, 12);
    expect(q!.hmcDiscountPct).toBe(25);
  });

  it("formatLabConvertFeeToast shows HMC when paid_in_hmc", () => {
    expect(
      formatLabConvertFeeToast({
        paid_in_hmc: true,
        feeQuoteDisplay: 0,
        feeHmcDisplay: 0.12,
      }),
    ).toMatch(/0\.12.*HMC/);
    expect(
      formatLabConvertFeeToast({
        paid_in_hmc: false,
        feeQuoteDisplay: 0.05,
        feeHmcDisplay: 0,
      }),
    ).toMatch(/0\.05/);
    expect(formatLabConvertFeeToast({ feeQuoteDisplay: 0, feeHmcDisplay: 0 })).toBe("");
  });

  it("convertRateLabel keeps FROM→TO orientation on invert routes", () => {
    const fmt = (n: number) => n.toFixed(8).replace(/\.?0+$/, "");
    expect(convertRateLabel("HMC", "USDT", 0.00055, false, fmt)).toBe("1 HMC ≈ 0.00055 USDT");
    const inv = convertRateLabel("USDT", "HMC", 0.00055, true, fmt);
    expect(inv.startsWith("1 USDT ≈ ")).toBe(true);
    expect(inv.endsWith(" HMC")).toBe(true);
    expect(inv).not.toMatch(/1 HMC ≈/);
    expect(Number(inv.split("≈ ")[1].split(" ")[0])).toBeCloseTo(1 / 0.00055, 4);
    expect(convertRateLabel("HMC", "USDT", 0, false, fmt)).toBe("—");
  });

  it("convertChipDefaultAmount covers BTC / SUP lab min_notional sizes", () => {
	expect(convertChipDefaultAmount("HMC_BTC")).toBe("2000");
    expect(convertChipDefaultAmount("HMC_SUP")).toBe("50");
    expect(convertChipDefaultAmount("SUP_USDT")).toBe("100");
    expect(convertChipDefaultAmount("SUP_BTC")).toBe("500");
    expect(convertChipDefaultAmount("BTC_HMC")).toBe("0.001");
  });

  it("USDT→HMC at 100% balance fails without fee buffer; slightly less succeeds", () => {
    const s = baseState({
      wallet: { usdt: 100, hmc: 0, sup: 0, btc: 0 },
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: false, hmcDiscountPct: 25 },
    });
    expect(convert(s, market, "USDT_HMC", 100).ok).toBe(false);
    expect(s.wallet.usdt).toBe(100);
    const okAmt = 100 / (1 + 10 / 10_000) * 0.999;
    expect(convert(s, market, "USDT_HMC", okAmt).ok).toBe(true);
    expect(s.wallet.usdt).toBeLessThan(100);
    expect(s.wallet.hmc).toBeGreaterThan(0);
  });

  it("formatLabConvertFeeToast includes quote asset", () => {
    expect(formatLabConvertFeeToast({ feeQuoteDisplay: 0.01 }, "USDT")).toContain("USDT");
    expect(formatLabConvertFeeToast({ paid_in_hmc: true, feeHmcDisplay: 1.5 })).toContain("HMC");
  });

  it("formatConvertFeeToast matches preview fee line units", () => {
    const s = baseState();
    const prev = previewConvert(s, market, "HMC_USDT", 1000) as ConvertPreview;
    const suffix = formatConvertFeeToast(prev.fee, prev.pair);
    expect(suffix).toContain("USDT");
    expect(convertFeeHintLine(prev)).toContain("USDT");
  });

  it("convertNetReceive matches wallet delta for quote-fee and HMC-fee routes", () => {
    const sQuote = baseState({ wallet: { usdt: 100, hmc: 10_000, sup: 0, btc: 0 } });
    const amt = 1000;
    const prev = previewConvert(sQuote, market, "HMC_USDT", amt);
    expect(isConvertPreviewError(prev)).toBe(false);
    const expectedNet = convertNetReceive(prev as ConvertPreview);
    const res = convert(sQuote, market, "HMC_USDT", amt);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sQuote.wallet.usdt - 100).toBeCloseTo(expectedNet, 10);

    const sHmc = baseState({ wallet: { usdt: 100, hmc: 10_000, sup: 0, btc: 0 } });
    sHmc.feeConfig.payFeesInHmc = true;
    const beforeUsdt = sHmc.wallet.usdt;
    const beforeHmc = sHmc.wallet.hmc;
    const hmcPrev = previewConvert(sHmc, market, "HMC_USDT", amt);
    const expectedHmcNet = convertNetReceive(hmcPrev as ConvertPreview);
    const hmcRes = convert(sHmc, market, "HMC_USDT", amt);
    expect(hmcRes.ok).toBe(true);
    if (!hmcRes.ok) return;
    expect(sHmc.wallet.usdt - beforeUsdt).toBeCloseTo(expectedHmcNet, 10);
    expect(sHmc.wallet.hmc).toBeCloseTo(beforeHmc - amt - hmcRes.fee.feeHmc, 8);
  });

  it("convertSlippageDriftBps and isConvertPreviewError", () => {
    expect(convertSlippageDriftBps(100, 100.5)).toBe(50);
    expect(convertSlippageDriftBps(0, 10)).toBe(0);
    const bad = previewConvert(baseState(), market, "HMC_USDT", 0);
    expect(isConvertPreviewError(bad)).toBe(true);
    const ok = previewConvert(baseState(), market, "HMC_USDT", 10);
    expect(isConvertPreviewError(ok)).toBe(false);
  });
});
