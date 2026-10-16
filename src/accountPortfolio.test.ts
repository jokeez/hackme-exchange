/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  custodyStatusMeta,
  equityInDenom,
  formatAssetQty,
  formatFloatingPnlDisplay,
  formatSignedAssetQty,
  formatTxTime,
  renderLedgerListItem,
  renderWithdrawHistoryItem,
  setEquityDenom,
  syncDenomRingDom,
  truncateMid,
  DENOM_ORB_SEL,
} from "./accountPortfolio";
import { sampleMarket } from "./testFixtures";

describe("accountPortfolio", () => {
  it("equityInDenom formats USDT with 2 decimals (not 8)", () => {
    const view = equityInDenom(24_109.73, sampleMarket(), "USDT");
    expect(view.unit).toBe("USDT");
    expect(view.primary).toBe("24,109.73");
    expect(view.secondary).toMatch(/₽/);
  });

  it("equityInDenom converts to HMC with USDT secondary", () => {
    const m = sampleMarket();
    const view = equityInDenom(100, m, "HMC");
    expect(view.unit).toBe("HMC");
    expect(view.primary).toMatch(/2,000/);
    expect(view.secondary).toContain("USDT");
  });

  it("formatFloatingPnlDisplay does not collapse tiny USDT PnL to +0", () => {
    expect(formatFloatingPnlDisplay(0.0007, 0.24)).toMatch(/\+0\.0007/);
    expect(formatFloatingPnlDisplay(0.0007, 0.24)).toContain("0.24");
    expect(formatFloatingPnlDisplay(1.25, 10)).toBe("+1.25 (+10.00%)");
  });

  it("formatFloatingPnlDisplay never uses scientific notation", () => {
    expect(formatFloatingPnlDisplay(-1.36e-6, 0.01)).not.toMatch(/e/i);
    expect(formatFloatingPnlDisplay(-1.36e-6, 0.01)).toMatch(/-0\.00000136/);
    expect(formatFloatingPnlDisplay(5.2e-7, 0.01)).not.toMatch(/e/i);
  });

  it("formatFloatingPnlDisplay shows flat instead of 0.00%", () => {
    expect(formatFloatingPnlDisplay(0, 0)).toBe("flat");
    expect(formatFloatingPnlDisplay(1e-12, 0)).toBe("flat");
  });

  it("formatAssetQty / signed qty never use scientific notation", () => {
    expect(formatAssetQty(1.36e-6, "USDT")).toBe("0.00000136");
    expect(formatAssetQty(1.36e-6, "USDT")).not.toMatch(/e/i);
    expect(formatSignedAssetQty(-1.36e-6, "HMC")).toBe("-0.00000136 HMC");
    expect(formatSignedAssetQty(-1.36e-6, "HMC")).not.toMatch(/e/i);
  });

  it("truncateMid keeps head and tail", () => {
    expect(truncateMid("HMC-abcdef0123456789", 8, 4)).toBe("HMC-abcd…6789");
    expect(truncateMid("short", 10, 6)).toBe("short");
  });

  it("custodyStatusMeta maps pending/complete/failed clearly", () => {
    expect(custodyStatusMeta("pending", { asset: "HMC", ageMin: 12 }).label).toMatch(/Pending/);
    expect(custodyStatusMeta("pending", { asset: "HMC" }).cssClass).toBe("pending");
    expect(custodyStatusMeta("completed").label).toMatch(/Complete/);
    expect(custodyStatusMeta("failed", { failReason: "insufficient hot" }).label).toMatch(/Failed/);
    expect(custodyStatusMeta("kyt_pending").tone).toBe("review");
  });

  it("formatTxTime includes date and clock", () => {
    const s = formatTxTime(Date.UTC(2026, 9, 16, 12, 30));
    expect(s).toMatch(/\d{2}/);
    expect(s).toMatch(/:/);
  });

  it("renderLedgerListItem escapes note and formats amount", () => {
    const html = renderLedgerListItem({
      id: "1",
      kind: "deposit",
      asset: "USDT",
      amount: 1.36e-6,
      usdtValue: 1.36e-6,
      note: "<img onerror=x>",
      ts: Date.UTC(2026, 9, 16, 12, 0),
    });
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/e-/i);
    expect(html).toContain("0.00000136");
    expect(html).toContain('data-ledger-kind="other"');
  });

  it("renderWithdrawHistoryItem shows fee, dest truncate, status", () => {
    const html = renderWithdrawHistoryItem({
      id: "wd-abcdefghijklmnop",
      asset: "SUP",
      amount: 0.05,
      fee: 0.001,
      status: "pending",
      destination: "HMC-abcdef0123456789ffff",
      created_at: new Date().toISOString(),
    });
    expect(html).toContain("SUP");
    expect(html).toContain("0.05");
    expect(html).toContain("fee");
    expect(html).toContain("…");
    expect(html).toContain("Pending");
    expect(html).toContain("acct-tx-status pending");
  });

  it("syncDenomRingDom highlights active denom orb", () => {
    document.body.innerHTML = `<div class="acct-denom-ring">
      <button data-denom="USDT" class="acct-denom-orb active"></button>
      <button data-denom="HMC" class="acct-denom-orb"></button>
    </div>`;
    setEquityDenom("HMC");
    syncDenomRingDom("HMC");
    expect(document.querySelector(`${DENOM_ORB_SEL}[data-denom="HMC"]`)?.classList.contains("active")).toBe(true);
    expect(document.querySelector(`${DENOM_ORB_SEL}[data-denom="USDT"]`)?.classList.contains("active")).toBe(false);
  });
});
