/**
 * @vitest-environment happy-dom
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
import { renderAccountPage } from "./account";
import { baseState, sampleMarket } from "./testFixtures";

describe("Account desk session (HOLD)", () => {
  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
  });

  it("renders desk panel with HOLD pills, session actions, and enrollable 2FA", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: { matching: "disabled", depositEnabled: false, withdrawEnabled: false },
    });
    expect(html).toContain('id="acct-desk"');
    expect(html).toContain("DESK · HOLD");
    expect(html).toContain("matching · HOLD");
    expect(html).toContain("deposit · HOLD");
    expect(html).toContain("withdraw · HOLD");
    expect(html).toContain("Deposit · HOLD");
    expect(html).toContain("Withdraw · HOLD");
    expect(html).toContain("btn-desk-wallet-connect");
    expect(html).toContain("btn-desk-cash-connect");
    expect(html).toContain("btn-desk-jump-panel");
    expect(html).toContain("desk-hold-card");
    expect(html).toContain("matching · HOLD");
    expect(html).toContain("btn-desk-copy-addr");
    expect(html).toContain("btn-desk-api-revoke");
    expect(html).toContain("btn-desk-new-key");
    expect(html).toContain("btn-desk-export-seed");
    expect(html).toContain("btn-desk-import-seed");
    expect(html).toContain('id="acct-security-2fa"');
    expect(html).toContain("btn-lab-2fa-setup");
    expect(html).toContain("Withdraw stays");
    expect(html).toContain("HOLD");
    expect(html).not.toContain('id="acct-security-2fa-hold"');
    expect(html).not.toContain('id="acct-lab"');
  });

  it("enables session controls when CSRF session is live", () => {
    setLabSessionMeta("HMC-abcdef0123456789", "csrf-test");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "disabled", depositEnabled: false, withdrawEnabled: false },
    });
    expect(html).toContain("Reconnect");
    expect(html).toContain("HMC-abcdef0123456789");
    expect(html).not.toMatch(/id="btn-desk-api-logout"[^>]*disabled/);
    expect(html).not.toMatch(/id="btn-desk-api-revoke"[^>]*disabled/);
    expect(html).toContain('id="acct-security-2fa"');
    expect(html).not.toMatch(/id="btn-lab-2fa-setup"[^>]*disabled/);
  });

  it("multi-wallet prefers desk ledger + hub (no paper/lab sandbox chrome)", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: false },
    });
    expect(html).toContain("Desk ledger · soft-launch Spot");
    expect(html).toContain("Desk ledger");
    expect(html).toContain('data-wallet-slice="desk"');
    expect(html).toContain('href="#acct-desk"');
    expect(html).toContain(">Connect<");
    expect(html).toContain("Hub wallet");
    expect(html).not.toContain("Paper trading · node wallet · lab sandbox");
    expect(html).not.toContain("Paper wallet");
    expect(html).not.toContain("Lab ledger");
    expect(html).not.toContain("Connect fixture");
    expect(html).not.toContain('href="#account">Open');
  });

  it("desk session live marks desk ledger Active", () => {
    setLabSessionMeta("HMC-deskmw0123456789", "csrf-mw");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).toContain('data-wallet-slice="desk"');
    expect(html).toContain(">Active<");
    expect(html).not.toContain('href="#acct-desk"');
  });

  it("renders soft-launch caps when health advertises them", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: {
        matching: "disabled",
        depositEnabled: false,
        withdrawEnabled: false,
        maxOpenOrders: 20,
        priceBandBps: 1500,
        minNotional: 0.01,
      },
    });
    expect(html).toContain("acct-desk-caps");
    expect(html).toContain("max open 20");
    expect(html).toContain("±1500 bps");
  });

  it("renders desk custody GO deposit buttons when deposit enabled", () => {
    setLabSessionMeta("HMC-aaaaaaaaaaaaaaaa", "csrf-custody");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).toContain("btn-desk-dep-hmc");
    expect(html).toContain("btn-desk-dep-sup");
    expect(html).toContain("btn-desk-dep-usdt");
    expect(html).toMatch(/Show USDT deposit \(BEP-20\)/);
    expect(html).toMatch(/USDT:<\/strong> BEP-20/);
    expect(html).not.toMatch(/stub addresses reject mainnet funds/);
    expect(html).toContain("lab-deposit-reveal");
    expect(html).toContain("Login addr ≠ deposit");
    expect(html).toContain("Desk custody live");
    expect(html).toContain("deposit · on");
    expect(html).toContain("withdraw · on");
    expect(html).toContain("DESK · LIVE");
    expect(html).toContain("desk-custody-live");
    expect(html).not.toContain("desk-hold-card");
    expect(html).toContain('id="btn-acct-deposit"');
    expect(html).toContain(">Withdraw<");
    expect(html).not.toContain("Withdraw · HOLD");
    expect(html).not.toContain("Deposit · HOLD");
    expect(html).toContain("NOT for deposits");
    expect(html).toContain('id="acct-security-2fa"');
    expect(html).toContain("btn-lab-2fa-setup");
    expect(html).toContain("Authenticator (TOTP) is required");
    expect(html).not.toContain('id="acct-security-2fa-hold"');
    // Withdraw form follows edge health when withdraw.enabled
    expect(html).toContain("btn-lab-wd-request");
    expect(html).toContain("lab-wd-2fa");
    expect(html).toContain("acct-2fa-manage-grid");
  });
});
