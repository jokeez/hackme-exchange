import { describe, expect, it } from "vitest";
import {
  USDT_DEPOSIT_MIN,
  USDT_WITHDRAW_MIN,
  depositLimitsPlateHtml,
  withdrawLimitsPlateHtml,
  withdrawMinForAsset,
} from "./custodyLimits";
import { validateLabWithdrawAmount, validateLabWithdrawDestination } from "./labCustody";

describe("custodyLimits soft-launch", () => {
  it("exposes deposit min plate for USDT", () => {
    const html = depositLimitsPlateHtml();
    expect(html).toContain("Deposit limits");
    expect(html).toContain(`${USDT_DEPOSIT_MIN} USDT`);
    expect(html).toMatch(/BEP-20/);
  });

  it("switches withdraw plate by asset", () => {
    expect(withdrawMinForAsset("USDT")).toBe(USDT_WITHDRAW_MIN);
    expect(withdrawMinForAsset("HMC")).toBe(0.01);
    const usdt = withdrawLimitsPlateHtml("USDT");
    expect(usdt).toContain("15 USDT");
    expect(usdt).toContain("1.5 USDT");
    expect(usdt).toContain("lab-wd-limits-plate");
  });
});

describe("withdraw gates", () => {
  it("rejects USDT below min 15", () => {
    const r = validateLabWithdrawAmount(0.5, "USDT");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.hint).toMatch(/15/);
  });

  it("accepts BSC 0x destination for USDT", () => {
    const r = validateLabWithdrawDestination("USDT", "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0");
    expect(r).toEqual({ ok: true });
  });

  it("rejects HMC- destination for USDT", () => {
    const r = validateLabWithdrawDestination("USDT", "HMC-ffffffffffffffff");
    expect(r.ok).toBe(false);
  });
});
