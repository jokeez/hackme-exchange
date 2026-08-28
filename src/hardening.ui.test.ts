/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderDualOrderPanel } from "./orderPanel";
import { renderOracleStatusHtml } from "./oracleStatus";
import { pairById } from "./pairs";

describe("hardening UI contracts", () => {
  it("order panel exposes paper badge and aria labels on exec buttons", () => {
    const html = renderDualOrderPanel({
      pair: pairById("HMC_USDT"),
      pairId: "HMC_USDT",
      mid: 0.00043,
      uiType: "market",
      uiTif: "GTC",
      uiPostOnly: false,
      availQuote: 1000,
      availBase: 50_000,
      payFeesInHmc: false,
      hmcDiscountPct: 25,
      feeRole: "taker",
      feeBps: 10,
      showTif: false,
    });
    expect(html).toContain("PAPER");
    expect(html).toContain("pay-fees-hmc");
    expect(html).toContain("spot-mode-tabs");
    expect(html).toContain("binance-type-tabs");
    expect(html).toContain("order-mode-row");
    expect(html).toContain("order-type-row");
    expect(html).toContain("order-head-meta");
    expect(html).toContain("trade-side-toggle");
    expect(html).toContain('aria-label="Buy HMC — paper synthetic demo"');
    expect(html).toContain('aria-label="Fill best ask (BBO)"');
    expect(html).toContain('aria-label="Sell HMC — paper synthetic demo"');
  });

  it("order panel shows LAB badge when labLive", () => {
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
      labLive: true,
    });
    expect(html).toContain(">LAB</span>");
    expect(html).not.toContain(">PAPER</span>");
    expect(html).toContain('aria-label="Buy HMC — lab matching demo"');
  });

  it("oracle status block includes retry and source hint", () => {
    const html = renderOracleStatusHtml({
      source: "fallback",
      fetchedAt: Date.now(),
      poolStatus: "offline",
    });
    expect(html).toContain('aria-label="Refresh oracle now"');
    expect(html).toContain("local fallback");
    expect(html).toContain("oracle-status offline");
  });

  it("styles define mobile panel switcher, panel rails, and focus-visible", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain(".mobile-panel-tabs");
    expect(css).toContain("[data-mobile-panel=\"trade\"]");
    expect(css).toContain(".panel-rail");
    expect(css).toContain(".rail-chevron");
    expect(css).toContain(".tools-rail");
    expect(css).toContain(".btn-collapse-tools");
    expect(css).toContain(".binance-ticker");
    expect(css).toContain(".binance-type-tabs .type.active");
    expect(css).toContain(".trade-side-toggle");
    expect(css).toContain(".activity-panel");
    expect(css).toContain(".activity-tabs");
    expect(css).toContain(".bottom-empty");
    expect(css).toContain(".empty-title");
    expect(css).toContain(".boot-logo");
    expect(css).toContain(".btn-block");
    expect(css).toContain(".toast-info");
    expect(css).toContain(".tour-actions");
    expect(css).toContain(".terminal.book-collapsed:not(.tools-collapsed) .panel-rail.left");
    expect(css).toContain(".terminal.chart-fullscreen");
    expect(css).toContain('html[data-embed="hub"] .terminal.chart-fullscreen');
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) !important");
    expect(css).toContain(".ob-total { display: block;");
    expect(css).toContain("focus-visible");
    expect(css).toContain(".demo-badge");
  });
});
