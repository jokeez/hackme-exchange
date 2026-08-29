/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { snapshotBookLevels } from "./bookFlash";
import { renderUnifiedSettingsModal } from "./settingsModal";
import { baseState } from "./testFixtures";
import { LAYOUT_DEFAULTS } from "./layoutPrefs";

describe("bookFlash", () => {
  it("snapshots ob-row levels by side and price", () => {
    document.body.innerHTML = `<div id="book">
      <div class="ob-row bid" data-book-price="0.05" data-book-side="bid"><span>0.05</span><span>120</span></div>
      <div class="ob-row ask" data-book-price="0.051" data-book-side="ask"><span>0.051</span><span>80</span></div>
    </div>`;
    const snap = snapshotBookLevels(document.getElementById("book"));
    expect(snap.get("bid:0.05")).toBe(120);
    expect(snap.get("ask:0.051")).toBe(80);
  });
});

describe("tier1 UI contracts", () => {
  it("chart exposes preview price API", () => {
    const chart = readFileSync(resolve(process.cwd(), "src/chart.ts"), "utf8");
    expect(chart).toContain("export function setChartPreviewPrice");
    expect(chart).toContain("onChartPricePick");
    expect(chart).toContain("orderPreview");
  });

  it("app wires quick order popup and order amend", () => {
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(app).toContain("showQuickOrderPopup");
    expect(app).toContain("handleChartPricePick");
    expect(app).toContain("wireOrderAmendButtons");
    expect(app).toContain("amendOpenOrder");
    expect(app).toContain("applyBookFlashes");
  });

  it("unified settings modal has all sections", () => {
    const html = renderUnifiedSettingsModal(baseState(), LAYOUT_DEFAULTS, "hub");
    expect(html).toContain('data-tab="layout"');
    expect(html).toContain('data-tab="chart"');
    expect(html).toContain('data-tab="oracle"');
    expect(html).toContain('data-tab="theme"');
    expect(html).toContain('data-tab="data"');
    expect(html).toContain("set-mc-link");
  });

  it("styles include book flash and quick order popup", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain(".ob-flash-up");
    expect(css).toContain(".chart-quick-order");
    expect(css).toContain(".settings-modal");
  });

  it("store supports order amount amend", () => {
    const store = readFileSync(resolve(process.cwd(), "src/store.ts"), "utf8");
    expect(store).toContain("export function updateOrderAmount");
  });
});
