/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { clearRecentPairs, loadRecentPairs, pushRecentPair } from "./recentPairs";

describe("recentPairs", () => {
  beforeEach(() => {
    clearRecentPairs();
  });

  it("pushes unique MRU list", () => {
    pushRecentPair("HMC_USDT");
    pushRecentPair("SUP_USDT");
    pushRecentPair("HMC_USDT");
    expect(loadRecentPairs()).toEqual(["HMC_USDT", "SUP_USDT"]);
  });

  it("drops unknown pair ids from sessionStorage (XSS sink hardening)", () => {
    sessionStorage.setItem(
      "hmx-recent-pairs",
      JSON.stringify(['HMC_USDT"><img src=x onerror=alert(1) x="', "SUP_USDT"]),
    );
    expect(loadRecentPairs()).toEqual(["SUP_USDT"]);
  });
});
