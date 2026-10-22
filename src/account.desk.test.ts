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
import { clearDeskSeed, persistDeskSeed, deskWalletIdentity } from "./adapters/deskWallet";
import { setDeskMatchingStatus } from "./adapters/labMatching";
import { renderAccountPage } from "./account";
import { baseState, sampleMarket } from "./testFixtures";

describe("Account desk session (HOLD)", () => {
  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
    localStorage.clear();
    clearDeskSeed();
  });

  it("renders desk panel with HOLD pills, session actions, and enrollable 2FA", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: { matching: "disabled", depositEnabled: false, withdrawEnabled: false },
    });
    expect(html).toContain('id="acct-desk"');
    expect(html).toContain("Wallet &amp; security");
    expect(html).toMatch(/HOLD/);
    expect(html).toContain("deposit HOLD");
    expect(html).toContain("withdraw HOLD");
    expect(html).toContain("Deposit · HOLD");
    expect(html).toContain("Withdraw · HOLD");
    expect(html).toContain("btn-desk-wallet-connect");
    expect(html).toContain("btn-desk-cash-connect");
    expect(html).toContain("btn-desk-jump-panel");
    expect(html).toContain("desk-hold-card");
    expect(html).toContain("btn-desk-copy-addr");
    expect(html).toContain("btn-desk-api-revoke");
    expect(html).toContain("btn-desk-new-key");
    expect(html).toContain("btn-desk-export-seed");
    expect(html).toContain("btn-desk-import-seed");
    expect(html).toContain('id="acct-security-2fa"');
    expect(html).toContain("btn-lab-2fa-setup");
    expect(html).not.toContain('id="acct-security-2fa-hold"');
    expect(html).not.toContain('id="acct-lab"');
    expect(html).not.toContain('href="#pool"');
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

  it("desk account keeps Connect + deposit without multi-wallet chrome", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: false },
    });
    expect(html).toContain("Spot balances · soft-launch");
    expect(html).toContain('id="acct-desk"');
    expect(html).toContain(">Connect<");
    expect(html).not.toContain('data-wallet-slice="desk"');
    expect(html).not.toContain('href="#pool"');
    expect(html).not.toContain("Paper trading · node wallet · lab sandbox");
    expect(html).not.toContain("Paper wallet");
    expect(html).not.toContain("Lab ledger");
    expect(html).not.toContain("Connect fixture");
    expect(html).not.toContain('href="#account">Open');
  });

  it("desk session live shows Reconnect without multi-wallet chrome", () => {
    setLabSessionMeta("HMC-deskmw0123456789", "csrf-mw");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).toContain("Reconnect");
    expect(html).toContain("HMC-deskmw0123456789");
    expect(html).not.toContain('data-wallet-slice="desk"');
  });

  it("renders soft-launch caps when health advertises them", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: {
        matching: "disabled",
        depositEnabled: false,
        withdrawEnabled: false,
        maxOpenOrders: 96,
        priceBandBps: 1500,
        minNotional: 0.01,
      },
    });
    expect(html).toContain("acct-desk-caps");
    expect(html).toContain("max open 96");
    expect(html).toContain("±1500 bps");
  });

  it("desk overview uses soft-launch VIP copy (not paper demo)", () => {
    setDeskMatchingStatus("ok");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).toContain("Spot balances · soft-launch");
    expect(html).toContain("VIP schedule from desk");
    expect(html).toContain("sync…");
    expect(html).not.toMatch(/vip-demo[^>]*>\s*demo\s*</);
    expect(html).not.toContain('href="#pool"');
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
    expect(html).toMatch(/Select an asset to show your deposit address/);
    expect(html).toMatch(/0\.1/);
    expect(html).toMatch(/Withdraw limits|lab-wd-limits-plate/);
    expect(html).not.toMatch(/stub addresses reject mainnet funds/);
    expect(html).toContain("lab-deposit-reveal");
    expect(html).toMatch(/Never send to your login address|Login addr ≠ deposit/i);
    expect(html).toContain("deposit on");
    expect(html).toContain("withdraw on");
    expect(html).toContain("Wallet &amp; security");
    expect(html).toContain("desk-custody-live");
    expect(html).not.toContain("desk-hold-card");
    expect(html).toContain('id="btn-acct-deposit"');
    expect(html).toContain(">Withdraw<");
    expect(html).not.toContain("Withdraw · HOLD");
    expect(html).not.toContain("Deposit · HOLD");
    expect(html).toMatch(/not for deposits|Login ≠ deposit/i);
    expect(html).toContain('id="acct-security-2fa"');
    expect(html).toContain("btn-lab-2fa-setup");
    expect(html).toContain("Authenticator (TOTP) is required");
    expect(html).not.toContain('id="acct-security-2fa-hold"');
    // Withdraw form follows edge health when withdraw.enabled
    expect(html).toContain("btn-lab-wd-request");
    expect(html).toContain("lab-wd-2fa");
    expect(html).toContain("lab-wd-limits-plate");
    expect(html).toContain("acct-2fa-manage-grid");
    // Soft-launch: no BTC rail; 2FA gate until enrolled
    expect(html).not.toContain('<option value="BTC">');
    expect(html).toMatch(/Enable 2FA/);
    expect(html).toContain("btn-acct-jump-2fa");
    expect(html).toMatch(/id="btn-lab-wd-request"[^>]*disabled/);
    // Decluttered: no ops-step walls / duplicate callout stacks
    expect(html).not.toContain("cex-steps");
    expect(html).not.toContain("cex-callout--info");
    expect(html).not.toContain("node-watch");
  });

  it("pending edge health avoids false Deposit·HOLD flash", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "…", depositEnabled: false, withdrawEnabled: false },
    });
    expect(html).toContain('id="btn-acct-deposit"');
    expect(html).toContain('id="btn-acct-withdraw"');
    expect(html).toContain("deposit …");
    expect(html).toContain("withdraw …");
    expect(html).not.toContain("Deposit · HOLD");
  });

  it("withdraw unlocks after TOTP enrolled", () => {
    setLabSessionMeta("HMC-bbbbbbbbbbbbbbbb", "csrf-2fa");
    const html = renderAccountPage(baseState(), sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
      totpEnabled: true,
      wallet: { usdt: 100, hmc: 10, sup: 0, btc: 0 },
    });
    expect(html).not.toContain("Enable 2FA first");
    expect(html).not.toContain("btn-acct-jump-2fa");
    expect(html).not.toMatch(/id="btn-lab-wd-request"[^>]*disabled/);
  });

  it("shows loud Import seed banner when prior address known but seed missing", () => {
    const seed = "33".repeat(32);
    persistDeskSeed(seed);
    const addr = deskWalletIdentity(seed).address;
    clearDeskSeed();
    expect(addr.startsWith("HMC-")).toBe(true);
    const s = baseState();
    s.wallet = { usdt: 0, hmc: 0, sup: 0, btc: 0 };
    const html = renderAccountPage(s, sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: true },
    });
    expect(html).toContain("acct-import-seed-banner");
    expect(html).toContain('data-import-seed-reason="seed_missing"');
    expect(html).toContain("btn-desk-import-seed-banner");
    expect(html).toContain("Import seed backup");
    expect(html).toMatch(/Connect\/login address ≠ deposit|Connect\/login address/i);
    // Primary Import seed promoted outside Backup details (durable seed restore).
    expect(html).toContain('id="btn-desk-import-seed"');
    expect(html).toContain(addr.slice(0, 14));
  });

  it("empty Avbl with seed present nudges Deposit vs Connect + Import", () => {
    const seed = "44".repeat(32);
    persistDeskSeed(seed);
    const s = baseState();
    s.wallet = { usdt: 0, hmc: 0, sup: 0, btc: 0 };
    const html = renderAccountPage(s, sampleMarket(), {
      deskEdge: { matching: "ok", depositEnabled: true, withdrawEnabled: false },
    });
    expect(html).toContain('data-import-seed-reason="empty_after_connect"');
    expect(html).toContain("Connect ≠ deposit");
    expect(html).toContain("#account/deposit");
    expect(html).toContain("btn-desk-import-seed-banner");
  });
});
