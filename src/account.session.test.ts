/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearLabSessionMeta, labSessionLabel } from "./adapters/exchangeApi";
import { renderAccountPage } from "./account";
import { baseState, sampleMarket } from "./testFixtures";

describe("lab session label / Account consistency", () => {
  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
  });

  it("stale address without CSRF is not live", () => {
    sessionStorage.setItem("hackme-ex-lab-address", "HMC-deadbeef");
    const s = labSessionLabel();
    expect(s.live).toBe(false);
    expect(s.label).toContain("reconnect");
    expect(s.address).toBe("HMC-deadbeef");
  });

  it("Account deposit hint mentions reconnect when address is stale", () => {
    sessionStorage.setItem("hackme-ex-lab-address", "HMC-65b60673d6ed884b");
    const html = renderAccountPage(baseState(), sampleMarket(), { feeWallet: null });
    expect(html).toMatch(/Session expired after reload|reconnect/i);
    expect(html).toMatch(/disabled/);
    expect(html).toContain("HMC-65b60673d6ed884b");
    expect(html).toMatch(/0 \/ 100,000 USDT/);
  });

  it("empty session shows not connected", () => {
    const s = labSessionLabel();
    expect(s.live).toBe(false);
    expect(s.label).toBe("not connected");
  });
});
