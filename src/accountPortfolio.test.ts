/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  equityInDenom,
  formatFloatingPnlDisplay,
  setEquityDenom,
  syncDenomRingDom,
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

  it("formatFloatingPnlDisplay shows flat instead of 0.00%", () => {
    expect(formatFloatingPnlDisplay(0, 0)).toBe("flat");
    expect(formatFloatingPnlDisplay(1e-12, 0)).toBe("flat");
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
