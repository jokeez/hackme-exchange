/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { patchAccountFundsDom, renderAccountPage, wireAccountFunding } from "./account";
import { saveAcctHideSmall } from "./uiPrefs";
import { baseState, sampleMarket } from "./testFixtures";

describe("Account Assets DOM filters", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("search hm hides USDT/BTC/SUP and keeps HMC visible", () => {
    const s = baseState();
    s.wallet = { usdt: 100, hmc: 10, sup: 5, btc: 0.01 };
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m);
    wireAccountFunding(s, m, () => {});

    const input = document.getElementById("acct-asset-search") as HTMLInputElement;
    input.value = "hm";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const visible = [...document.querySelectorAll<HTMLElement>(".acct-asset-row")]
      .filter((r) => !r.hidden && !r.classList.contains("is-filtered-out"))
      .map((r) => r.dataset.asset);
    expect(visible).toEqual(["HMC"]);
    expect(document.getElementById("acct-asset-filter-empty")?.hidden).toBe(true);
  });

  it("Hide < 1 USD hides zero-value rows (CSS class + hidden)", () => {
    saveAcctHideSmall(true);
    const s = baseState();
    s.wallet = { usdt: 0, hmc: 0, sup: 0, btc: 0 };
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m);
    wireAccountFunding(s, m, () => {});

    for (const row of document.querySelectorAll<HTMLElement>(".acct-asset-row")) {
      expect(row.hidden).toBe(true);
      expect(row.classList.contains("is-filtered-out")).toBe(true);
    }
  });

  it("patchAccountFundsDom re-applies active search filter", () => {
    const s = baseState();
    s.wallet = { usdt: 100, hmc: 10, sup: 5, btc: 0.01 };
    const m = sampleMarket();
    document.body.innerHTML = renderAccountPage(s, m);
    wireAccountFunding(s, m, () => {});

    const input = document.getElementById("acct-asset-search") as HTMLInputElement;
    input.value = "us";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    s.wallet.hmc = 99;
    patchAccountFundsDom(s, m);

    const visible = [...document.querySelectorAll<HTMLElement>(".acct-asset-row")]
      .filter((r) => !r.hidden)
      .map((r) => r.dataset.asset);
    expect(visible).toEqual(["USDT"]);
  });

  it("garbage search shows empty hint", () => {
    const s = baseState();
    s.wallet = { usdt: 100, hmc: 10, sup: 5, btc: 0.01 };
    document.body.innerHTML = renderAccountPage(s, sampleMarket());
    wireAccountFunding(s, sampleMarket(), () => {});

    const input = document.getElementById("acct-asset-search") as HTMLInputElement;
    input.value = "nope-asset";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.getElementById("acct-asset-filter-empty")?.hidden).toBe(false);
  });

  it("account empty inventory CTA points to deposit, not View Account", () => {
    const s = baseState();
    s.wallet = { usdt: 0, hmc: 0, sup: 0, btc: 0 };
    const html = renderAccountPage(s, sampleMarket());
    expect(html).toContain('href="#account/deposit"');
    expect(html).toContain(">Deposit<");
    expect(html).not.toMatch(/acct-positions-empty[\s\S]*>View Account</);
  });
});
