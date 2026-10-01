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

  it("renders desk panel with HOLD pills, session actions, and 2FA", () => {
    const html = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: null,
      deskEdge: { matching: "disabled", depositEnabled: false, withdrawEnabled: false },
    });
    expect(html).toContain('id="acct-desk"');
    expect(html).toContain("DESK · HOLD");
    expect(html).toContain("matching · disabled");
    expect(html).toContain("deposit · HOLD");
    expect(html).toContain("withdraw · HOLD");
    expect(html).toContain("btn-desk-wallet-connect");
    expect(html).toContain("btn-desk-copy-addr");
    expect(html).toContain("btn-desk-api-revoke");
    expect(html).toContain("btn-desk-new-key");
    expect(html).toContain('id="acct-security-2fa"');
    expect(html).toContain("btn-lab-2fa-setup");
    expect(html).not.toContain('id="acct-lab"');
    expect(html).toMatch(/id="btn-lab-2fa-setup"[^>]*disabled/);
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
    expect(html).not.toMatch(/id="btn-lab-2fa-setup"[^>]*disabled/);
  });
});
