/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadAcctHideSmall,
  loadAcctTab,
  loadActivityTab,
  loadConvertDesk,
  saveAcctHideSmall,
  saveAcctTab,
  saveActivityTab,
  saveConvertDesk,
} from "./uiPrefs";

describe("uiPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists convert desk selection", () => {
    saveConvertDesk("btc", "hmc", "0.25");
    expect(loadConvertDesk()).toEqual({ from: "btc", to: "hmc", amt: "0.25" });
  });

  it("avoids identical convert legs on load", () => {
    saveConvertDesk("usdt", "usdt", "50");
    expect(loadConvertDesk().from).not.toBe(loadConvertDesk().to);
  });

  it("persists activity and account tabs", () => {
    saveActivityTab("tape");
    saveAcctTab("account");
    saveAcctHideSmall(true);
    expect(loadActivityTab()).toBe("tape");
    expect(loadAcctTab()).toBe("account");
    expect(loadAcctHideSmall()).toBe(true);
  });
});
