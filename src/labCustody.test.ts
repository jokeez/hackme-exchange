/**
 * Lab custody destination + Account custody UI gates.
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearLabSessionMeta } from "./adapters/exchangeApi";
import { labFeeWalletSection, renderAccountPage } from "./account";
import { isLabApiEnabled } from "./config/integration";
import { safePaperWithdrawDest, validateLabWithdrawDestination } from "./labCustody";
import { baseState, sampleMarket } from "./testFixtures";

describe("validateLabWithdrawDestination (API-aligned)", () => {
  it("accepts HMC- + 16 hex only for HMC", () => {
    expect(validateLabWithdrawDestination("HMC", "HMC-ffffffffffffffff")).toEqual({ ok: true });
    expect(validateLabWithdrawDestination("hmc", "HMC-0123456789abcdef").ok).toBe(true);
    expect(validateLabWithdrawDestination("HMC", "HMC-ffff").ok).toBe(false);
    expect(validateLabWithdrawDestination("HMC", "paper-usdt-ops-wallet-01").ok).toBe(false);
  });

  it("SUP/USDT/BTC require paper stubs — reject HMC- and deposit stubs", () => {
    for (const asset of ["SUP", "USDT", "BTC"]) {
      expect(validateLabWithdrawDestination(asset, "paper-usdt-ops-wallet-01").ok).toBe(true);
      expect(validateLabWithdrawDestination(asset, "lab-ops-btc-01").ok).toBe(true);
      expect(validateLabWithdrawDestination(asset, "companion-sup-out").ok).toBe(true);
      expect(validateLabWithdrawDestination(asset, "HMC-ffffffffffffffff").ok).toBe(false);
      expect(validateLabWithdrawDestination(asset, "labdep-hmc-001").ok).toBe(false);
      expect(validateLabWithdrawDestination(asset, "short").ok).toBe(false);
    }
  });

  it("rejects XSS / URI scheme paper destinations", () => {
    const bad = [
      "<script>alert(1)</script>",
      "javascript:alert(1)",
      "data:text/html,hi",
      "vbscript:msg",
      'ops"wallet',
      "ops'wallet",
      "ops`wallet",
      "ops>wallet",
      "a".repeat(129),
    ];
    for (const dest of bad) {
      if (dest.length <= 128) expect(safePaperWithdrawDest(dest)).toBe(false);
      expect(validateLabWithdrawDestination("USDT", dest).ok).toBe(false);
    }
  });

  it("rejects self-destination when session address provided", () => {
    const self = "HMC-ffffffffffffffff";
    expect(validateLabWithdrawDestination("HMC", self, self).ok).toBe(false);
    expect(validateLabWithdrawDestination("HMC", self, self.toLowerCase()).ok).toBe(false);
    expect(validateLabWithdrawDestination("HMC", "HMC-0123456789abcdef", self).ok).toBe(true);
  });
});

describe("validateLabWithdrawAmount", () => {
  it("enforces soft min 0.01", async () => {
    const { validateLabWithdrawAmount } = await import("./labCustody");
    expect(validateLabWithdrawAmount(0).ok).toBe(false);
    expect(validateLabWithdrawAmount(0.009).ok).toBe(false);
    expect(validateLabWithdrawAmount(0.01).ok).toBe(true);
    expect(validateLabWithdrawAmount(1).ok).toBe(true);
  });
});

describe("Account custody UI (buttons + copy)", () => {
  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
  });

  it("offline session disables mint/bridge/withdraw/deposit-addr and points to Connect fixture", () => {
    if (!isLabApiEnabled()) return;
    const html = renderAccountPage(baseState(), sampleMarket(), { feeWallet: "HMC-726a266afdaec757" });
    expect(html).toContain("Session offline");
    expect(html).toContain('id="btn-lab-mint-hmc" disabled');
    expect(html).toContain('id="btn-lab-dep-hmc" disabled');
    expect(html).toContain('id="btn-lab-dep-usdt" disabled');
    expect(html).toContain('id="btn-lab-bridge-usdt" disabled');
    expect(html).toContain('id="btn-lab-wd-request" disabled');
    expect(html).toContain("Connect fixture");
    expect(html).toContain("btn-lab-fixture-connect");
  });

  it("withdraw hint matches API: only HMC uses HMC-; SUP is paper stub", () => {
    if (!isLabApiEnabled()) return;
    const html = renderAccountPage(baseState(), sampleMarket());
    expect(html).toContain("data-ph-sup=\"paper-sup-ops-wallet-01\"");
    expect(html).not.toContain('data-ph-sup="HMC-ffffffffffffffff"');
    expect(html).toMatch(/HMC →/);
    expect(html).toMatch(/SUP\/USDT\/BTC/);
    expect(html).not.toMatch(/HMC\/SUP need/);
  });

  it("VIP table lists Regular → VIP 3 by volume", () => {
    const html = renderAccountPage(baseState(), sampleMarket());
    const iReg = html.indexOf(">Regular</td>");
    const iV1 = html.indexOf(">VIP 1</td>");
    const iV3 = html.indexOf(">VIP 3</td>");
    expect(iReg).toBeGreaterThan(0);
    expect(iV1).toBeGreaterThan(iReg);
    expect(iV3).toBeGreaterThan(iV1);
  });

  it("shows expected action button ids when lab API is on", () => {
    if (!isLabApiEnabled()) return;
    const html = renderAccountPage(baseState(), sampleMarket());
    for (const id of [
      "btn-lab-mint-hmc",
      "btn-lab-dep-hmc",
      "btn-lab-dep-usdt",
      "btn-lab-bridge-usdt",
      "btn-lab-bridge-btc",
      "btn-lab-wd-request",
      "btn-lab-wd-refresh",
      "btn-lab-wd-quote",
      "btn-lab-fixture-connect",
      "btn-lab-api-sync",
      "btn-lab-api-logout",
      "btn-lab-revoke-all",
      "btn-lab-counterparty",
      "btn-lab-fills-refresh",
      "acct-pay-hmc",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("fee wallet HTML never embeds a literal admin secret", () => {
    const html = labFeeWalletSection("HMC-726a266afdaec757");
    expect(html).toContain("$EXCHANGE_ADMIN_TOKEN");
    expect(html).not.toMatch(/X-Admin-Token:\s*[A-Za-z0-9+/=_-]{12,}/);
    expect(html).not.toContain("VITE_HACKME_ADMIN_TOKEN");
  });

  it("tiny equity allocation does not round non-zero HMC to 0%", () => {
    const s = baseState();
    // ~0.16% of equity at sample mid — previously rounded to 0%.
    s.wallet = { usdt: 10_000, hmc: 50_000, sup: 0, btc: 0 };
    const html = renderAccountPage(s, sampleMarket({ hmcUsdt: 0.00063838 }));
    expect(html).toMatch(/HMC[\s\S]*?0\.\d%/);
  });

  it("escapes malicious ledger notes in activity list", () => {
    const s = baseState();
    s.ledger = [
      {
        id: "L1",
        ts: Date.now(),
        kind: "trade",
        asset: "USDT",
        amount: -1,
        note: `<img src=x onerror=alert(1)>`,
      },
    ];
    const html = renderAccountPage(s, sampleMarket());
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
