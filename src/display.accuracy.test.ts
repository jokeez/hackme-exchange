/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { formatPrice } from "./format";
import { bookStepsForPair } from "./bookSteps";
import { flipRoute, routeForAssets, previewConvert } from "./convert";
import { baseState, sampleMarket } from "./testFixtures";
import { renderDualOrderPanel } from "./orderPanel";
import { pairById } from "./pairs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("display accuracy polish", () => {
  it("formats BTC-scale book totals without collapsing to 0", () => {
    const total = 6.4e-9 * 1000; // ~6.4e-6 BTC
    expect(formatPrice(total)).not.toBe("0");
    expect(formatPrice(total)).not.toMatch(/e/i);
    expect(Number(formatPrice(total))).toBeGreaterThan(0);
  });

  it("BTC book step labels are decimal, not scientific", () => {
    const labels = bookStepsForPair("HMC_BTC").map((s) => s.label);
    expect(labels.some((l) => l.includes("e-"))).toBe(false);
    expect(labels).toContain("0.000000000001");
  });

  it("convert preview wording is gross receive (fee separate)", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 10_000, sup: 0, btc: 0 } });
    const prev = previewConvert(s, sampleMarket(), "HMC_BTC", 1000);
    expect("ok" in prev && prev.ok === false).toBe(false);
    if ("ok" in prev && prev.ok === false) return;
    expect(prev.got).toBeGreaterThan(0);
    expect(formatPrice(prev.got)).not.toBe("0");
  });

  it("route flip covers BTC lanes", () => {
    expect(routeForAssets("hmc", "btc")).toBe("HMC_BTC");
    expect(flipRoute("HMC_BTC")).toBe("BTC_HMC");
  });

  it("order panel has Spot only (no dead Paper tab)", () => {
    const html = renderDualOrderPanel({
      pair: pairById("HMC_USDT"),
      pairId: "HMC_USDT",
      mid: 0.00043,
      uiType: "limit",
      uiTif: "GTC",
      uiPostOnly: false,
      availQuote: 1000,
      availBase: 50_000,
      payFeesInHmc: false,
      hmcDiscountPct: 25,
      feeRole: "maker",
      feeBps: 8,
      showTif: true,
    });
    expect(html).toContain(">Spot<");
    expect(html).not.toMatch(/aria-disabled="true"[^>]*>Paper/);
  });

  it("CSS keeps convert desk centered", () => {
    const css = readFileSync(resolve(__dirname, "styles.css"), "utf8");
    expect(css).toContain(".convert-shell");
    expect(css).toMatch(/\.convert-shell\s*\{[^}]*margin:\s*0 auto/s);
  });
});
