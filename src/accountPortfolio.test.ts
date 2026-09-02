/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { equityInDenom, setEquityDenom, syncDenomRingDom } from "./accountPortfolio";
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

  it("syncDenomRingDom highlights active denom orb", () => {
    document.body.innerHTML = `<div class="acct-denom-ring">
      <button data-denom="USDT" class="acct-denom-orb active"></button>
      <button data-denom="HMC" class="acct-denom-orb"></button>
    </div>`;
    setEquityDenom("HMC");
    syncDenomRingDom("HMC");
    expect(document.querySelector('[data-denom="HMC"]')?.classList.contains("active")).toBe(true);
    expect(document.querySelector('[data-denom="USDT"]')?.classList.contains("active")).toBe(false);
  });
});
