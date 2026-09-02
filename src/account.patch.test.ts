/**
 * Soft Account funds patch (no remount).
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { patchAccountFundsDom, renderAccountPage } from "./account";
import { setBalanceHidden, setEquityDenom } from "./accountPortfolio";
import { baseState, sampleMarket } from "./testFixtures";

describe("patchAccountFundsDom", () => {
  it("updates free/equity cells without wiping open details", () => {
    const s = baseState();
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m);
    const roadmap = document.getElementById("acct-roadmap-details") as HTMLDetailsElement | null;
    if (roadmap) roadmap.open = true;

    s.wallet.hmc = 60_000;
    s.wallet.usdt = 9_500;
    patchAccountFundsDom(s, m);

    const hmcFree = document.querySelector('tr[data-asset="HMC"] [data-col="free"]');
    const usdtFree = document.querySelector('tr[data-asset="USDT"] [data-col="free"]');
    expect(hmcFree?.textContent).toMatch(/60[,.]?000/);
    expect(usdtFree?.textContent).toMatch(/9[,.]?500/);
    if (roadmap) expect(roadmap.open).toBe(true);
  });

  it("masks balances instantly without remount", () => {
    const s = baseState();
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m);
    setBalanceHidden(true);
    patchAccountFundsDom(s, m);
    expect(document.getElementById("acct-total-eq")?.textContent).toContain("****");
    setBalanceHidden(false);
    patchAccountFundsDom(s, m);
    expect(document.getElementById("acct-total-eq")?.textContent).not.toContain("****");
  });

  it("patchAccountFundsDom keeps selected equity denom (HMC)", () => {
    setEquityDenom("HMC");
    const s = baseState();
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m);
    patchAccountFundsDom(s, m);
    expect(document.getElementById("acct-eq-unit")?.textContent).toBe("HMC");
    expect(document.getElementById("acct-total-eq")?.dataset.denom).toBe("HMC");
  });
});
