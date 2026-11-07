/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { isDeskBackupDone, markDeskBackupDone } from "./adapters/deskWallet";

describe("desk recovery-file flag", () => {
  beforeEach(() => localStorage.clear());
  it("is per address, case-insensitive, and false by default", () => {
    expect(isDeskBackupDone("HMC-0123456789abcdef")).toBe(false);
    markDeskBackupDone("HMC-0123456789ABCDEF");
    expect(isDeskBackupDone("hmc-0123456789abcdef")).toBe(true);
    expect(isDeskBackupDone("HMC-ffffffffffffffff")).toBe(false);
    expect(isDeskBackupDone("")).toBe(false);
  });
});

import { custodyStatusMeta, withdrawExplorerUrl } from "./accountPortfolio";

describe("withdraw history links and statuses", () => {
  it("links USDT to BscScan and HMC/SUP to the destination in the HackMe explorer", () => {
    const h = "0x" + "ab".repeat(32);
    expect(withdrawExplorerUrl("USDT", h)).toBe(`https://bscscan.com/tx/${h}`);
    expect(withdrawExplorerUrl("HMC", "f".repeat(64), "HMC-0123456789abcdef")).toBe(
      "https://explorer.hackme.tech/explorer?addr=HMC-0123456789abcdef",
    );
    expect(withdrawExplorerUrl("HMC", "", "HMC-0123456789abcdef")).toBe("");
    expect(withdrawExplorerUrl("USDT", "not-a-hash")).toBe("");
    expect(withdrawExplorerUrl("HMC", "x", "javascript:alert(1)")).toBe("");
  });
  it("labels approved and sending states", () => {
    expect(custodyStatusMeta("kyt_approved", { asset: "USDT" }).label).toContain("manual payout");
    expect(custodyStatusMeta("broadcasting", { asset: "HMC" }).label).toContain("Sending");
  });
});

import { renderPendingDeposits } from "./accountPortfolio";

describe("pending deposits card", () => {
  it("is empty without rows and escapes values", () => {
    expect(renderPendingDeposits([])).toBe("");
    const html = renderPendingDeposits([{ asset: "HMC", tx_hash: "<x>", amount: 20e8, eta_sec: 95 }]);
    expect(html).toContain("+20");
    expect(html).toContain("credited in ~2 min");
    expect(html).not.toContain("<x>");
  });
});
