/**
 * @vitest-environment happy-dom
 * Deposit vs Connect address UX contracts — prevents silent "empty balance after send".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config/integration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config/integration")>();
  return {
    ...actual,
    isDeskConnectEnabled: () => true,
    isLabLoopbackApi: () => false,
    isLabApiEnabled: () => false,
  };
});

import { clearLabSessionMeta, setLabSessionMeta } from "./adapters/exchangeApi";
import { setDeskMatchingStatus } from "./adapters/labMatching";
import { patchAccountFundsDom, renderAccountPage } from "./account";
import { baseState, sampleMarket } from "./testFixtures";

describe("deposit UX contracts", () => {
  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
    setDeskMatchingStatus("ok");
  });

  it("custody GO HTML never presents Connect as the deposit destination", () => {
    setLabSessionMeta("HMC-09dc5f553bfff940", "csrf-ux");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).toMatch(/Do not send to Connect|Login addr ≠ deposit/);
    expect(html).toContain("btn-desk-dep-hmc");
    expect(html).toContain("btn-desk-dep-sup");
    expect(html).toContain("btn-desk-dep-usdt");
    expect(html).toMatch(/Show USDT deposit \(BEP-20\)/);
    expect(html).toMatch(/Deposit limits/);
    expect(html).toMatch(/USDT min/);
    expect(html).toMatch(/0\.1 USDT/);
    expect(html).toMatch(/manual.*KYT|manual<\/em> KYT/i);
    expect(html).toMatch(/screening hold/i);
    expect(html).toMatch(/HMC \/ SUP/i);
    expect(html).toContain("HMC-09dc5f553bfff940");
    expect(html).toMatch(/Login only/);
    expect(html).not.toMatch(/stub addresses reject mainnet funds/);
    // Copy-addr path must stay labeled as login-only when custody is live
    expect(html).toMatch(/Copy login ≠ deposit|NOT for deposits/);
    expect(html).toMatch(/NOT for deposits/);
  });

  it("shows screening hold banner when ledger hold is cached", async () => {
    const { rememberLedgerHolds } = await import("./adapters/exchangeApi");
    rememberLedgerHolds([{ asset: "USDT", available: 0, reserved: 0, hold: 50_000_000, amount: 50_000_000 }]);
    setLabSessionMeta("HMC-09dc5f553bfff940", "csrf-hold");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).toMatch(/Screening hold/i);
    expect(html).toMatch(/0\.5 USDT/);
  });

  it("HOLD edge still shows Deposit · HOLD quick actions", () => {
    setDeskMatchingStatus("disabled");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "disabled", depositEnabled: false, withdrawEnabled: false },
    });
    expect(html).toContain("Deposit · HOLD");
    expect(html).toContain("Withdraw · HOLD");
    expect(html).not.toContain("btn-desk-dep-hmc");
  });

  it("USDT-only desk balance is inventory (no false empty state)", () => {
    setLabSessionMeta("HMC-bbbbbbbbbbbbbbbb", "csrf-bal");
    const s = baseState();
    s.wallet = { usdt: 50, hmc: 0, sup: 0, btc: 0 };
    const html = renderAccountPage(s, sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).not.toContain("No spot inventory yet");
    expect(html).toMatch(/>50</);
  });

  it("patch removes empty banner when USDT appears after deposit sync", () => {
    setLabSessionMeta("HMC-cccccccccccccccc", "csrf-patch");
    const s = baseState();
    s.wallet = { usdt: 0, hmc: 0, sup: 0, btc: 0 };
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m, {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(document.querySelector(".acct-positions-empty")).toBeTruthy();
    s.wallet.usdt = 50;
    patchAccountFundsDom(s, m);
    expect(document.querySelector(".acct-positions-empty")).toBeNull();
    expect(document.getElementById("acct-total-eq")?.textContent).toMatch(/50/);
  });
});
