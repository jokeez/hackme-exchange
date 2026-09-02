/**
 * Soft Account funds patch (no remount).
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { patchAccountFundsDom, renderAccountPage } from "./account";
import { DENOM_ORB_SEL, setBalanceHidden, setEquityDenom } from "./accountPortfolio";
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
    // Simulate old oracle refresh bug that forced USDT label.
    const eq = document.getElementById("acct-total-eq");
    if (eq) eq.innerHTML = `99,999.00 <span class="acct-eq-unit muted" id="acct-eq-unit">USDT</span>`;
    patchAccountFundsDom(s, m);
    expect(document.getElementById("acct-eq-unit")?.textContent).toBe("HMC");
    expect(document.getElementById("acct-total-eq")?.dataset.denom).toBe("HMC");
    expect(document.querySelector(`${DENOM_ORB_SEL}[data-denom="HMC"]`)?.classList.contains("active")).toBe(true);
  });

  it("renderAccountPage restores equity denom from localStorage on load", () => {
    setEquityDenom("RUB");
    document.body.innerHTML = renderAccountPage(baseState(), sampleMarket());
    expect(document.getElementById("acct-eq-unit")?.textContent).toBe("₽");
    expect(document.querySelector(`${DENOM_ORB_SEL}[data-denom="RUB"]`)?.classList.contains("active")).toBe(true);
    expect(document.querySelector("[data-portfolio-chart]")?.getAttribute("data-chart-denom")).toBe("RUB");
  });

  it("patchAccountFundsDom updates multi-wallet paper row and dust panel", () => {
    const s = baseState();
    s.wallet.hmc = 0.0005;
    s.wallet.usdt = 50;
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m);
    s.wallet.usdt = 12_500;
    s.wallet.hmc = 0;
    s.wallet.sup = 0;
    s.wallet.btc = 0;
    patchAccountFundsDom(s, m);
    expect(document.querySelector('[data-wallet-slice="paper"] .mono')?.textContent).toMatch(/12[,.]?500/);
    expect(document.getElementById("acct-dust")?.textContent).toMatch(/No dust/i);
  });

  it("patchAccountFundsDom refreshes oracle mids strip", () => {
    const s = baseState();
    const m = sampleMarket({ hmcUsdt: 0.05, supUsdt: 0.01, btcUsd: 68_000 });
    document.body.innerHTML = renderAccountPage(s, m);
    patchAccountFundsDom(s, sampleMarket({ hmcUsdt: 0.0523, supUsdt: 0.0104, btcUsd: 92_500 }));
    expect(document.querySelector('[data-acct-oracle-mid="hmc"]')?.textContent).toContain("0.0523");
    expect(document.querySelector('[data-acct-oracle-mid="sup"]')?.textContent).toContain("0.0104");
    expect(document.querySelector('[data-acct-oracle-mid="btc"]')?.textContent).toContain("92,500");
    expect(document.querySelector('[data-acct-promo-mid="hmc"]')?.textContent).toContain("0.0523");
  });
});
