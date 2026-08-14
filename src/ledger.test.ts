import { describe, expect, it } from "vitest";
import {
  appendLedger,
  recordConvert,
  recordDeposit,
  recordWithdrawal,
  recordTradeLedger,
} from "./ledger";
import { baseState, sampleMarket } from "./testFixtures";
import type { FeeQuote } from "./fees";

describe("ledger", () => {
  const market = sampleMarket();

  it("appendLedger prepends and caps at 300", () => {
    const s = baseState();
    for (let i = 0; i < 305; i++) {
      appendLedger(s, {
        kind: "deposit",
        asset: "USDT",
        amount: 1,
        usdtValue: 1,
        note: `n${i}`,
        ts: Date.now(),
      });
    }
    expect(s.ledger).toHaveLength(300);
    expect(s.ledger[0].note).toBe("n304");
  });

  it("recordDeposit credits wallet and ledger", () => {
    const s = baseState();
    const before = s.wallet.usdt;
    recordDeposit(s, "usdt", 100, market);
    expect(s.wallet.usdt).toBe(before + 100);
    expect(s.ledger[0].kind).toBe("deposit");
    expect(s.ledger[0].usdtValue).toBe(100);
  });

  it("recordWithdrawal fails without funds", () => {
    const s = baseState({ wallet: { usdt: 10, hmc: 0, sup: 0, btc: 0 } });
    expect(recordWithdrawal(s, "usdt", 50, market)).toBe(false);
    expect(s.wallet.usdt).toBe(10);
  });

  it("recordWithdrawal succeeds and logs negative amount", () => {
    const s = baseState();
    expect(recordWithdrawal(s, "hmc", 100, market)).toBe(true);
    expect(s.ledger[0].kind).toBe("withdrawal");
    expect(s.ledger[0].amount).toBe(-100);
  });

  it("recordConvert writes two convert legs", () => {
    const s = baseState();
    recordConvert(s, "HMC", "USDT", 1000, 0.43, market);
    expect(s.ledger.filter((e) => e.kind === "convert")).toHaveLength(2);
    expect(s.ledger[0].asset).toBe("USDT");
    expect(s.ledger[1].asset).toBe("HMC");
    expect(s.ledger[1].amount).toBe(-1000);
  });

  it("recordConvert appends taker fee row when provided", () => {
    const s = baseState();
    const fee: FeeQuote = {
      role: "taker",
      bps: 10,
      feeQuote: 0.001,
      feeHmc: 0,
      paidInHmc: false,
      vipName: "Regular",
      hmcDiscountPct: 0,
    };
    recordConvert(s, "HMC", "USDT", 1000, 0.43, market, fee, "HMC_USDT");
    expect(s.ledger.some((e) => e.kind === "fee" && /CONVERT TAKER/i.test(e.note))).toBe(true);
  });

  it("recordTradeLedger includes fee when feeQuote > 0", () => {
    const s = baseState();
    const fee: FeeQuote = {
      role: "taker",
      bps: 10,
      feeQuote: 0.1,
      feeHmc: 0,
      paidInHmc: false,
      vipName: "Regular",
      hmcDiscountPct: 0,
    };
    recordTradeLedger(s, market, "HMC_USDT", "buy", 100, 0.043, fee, "market");
    expect(s.ledger.some((e) => e.kind === "trade")).toBe(true);
    expect(s.ledger.some((e) => e.kind === "fee")).toBe(true);
  });

  it("recordTradeLedger HMC fee note uses discount pct from quote", () => {
    const s = baseState();
    const fee: FeeQuote = {
      role: "maker",
      bps: 8,
      feeQuote: 0.06,
      feeHmc: 150,
      paidInHmc: true,
      vipName: "Regular",
      hmcDiscountPct: 25,
    };
    recordTradeLedger(s, market, "HMC_USDT", "sell", 100, 0.043, fee, "limit");
    const feeRow = s.ledger.find((e) => e.kind === "fee");
    expect(feeRow?.note).toMatch(/HMC [−-]25%/);
  });
});
