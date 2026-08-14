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
});
