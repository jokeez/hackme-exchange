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
import { DEFAULT_CHART_OVERLAYS } from "./types";

describe("bookFlash", () => {
  it("snapshots ob-amt cell (not price column)", () => {
    document.body.innerHTML = `<div id="book">
      <div class="ob-row bid" data-book-price="0.05" data-book-side="bid">
        <div class="ob-bar"></div>
        <span class="ob-price">0.05</span>
        <span class="ob-amt">120</span>
        <span class="dim ob-total">6</span>
      </div>
    </div>`;
    const snap = snapshotBookLevels(document.getElementById("book"));
    expect(snap.get("bid:0.05")).toBe(120);
  });
});

describe("tier1 UI contracts", () => {
  it("chart click is gated by quickOrder only (preview is optional ghost line)", () => {
    const chart = readFileSync(resolve(process.cwd(), "src/chart.ts"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(chart).toContain("!!lastOpts?.overlays.quickOrder");
    expect(chart).not.toMatch(/quickOrder\s*\|\|\s*o\?\.orderPreview/);
    expect(app).toContain("if (!overlays.quickOrder) return;");
  });

  it("app wires quick order popup and order amend", () => {
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(app).toContain("showQuickOrderPopup");
    expect(app).toContain("handleChartPricePick");
    expect(app).toContain("activeTradeSide");
    expect(app).toContain("wireOrderAmendButtons");
    expect(app).toContain('data-amend-field="stop"');
    expect(app).toContain("applyBookFlashes");
  });

  it("unified settings modal has chart overlay toggles", () => {
    const html = renderUnifiedSettingsModal(baseState(), LAYOUT_DEFAULTS, "hub");
    expect(html).toContain("set-ov-preview");
    expect(html).toContain("set-ov-quick");
    expect(html).toContain('data-tab="layout"');
  });

  it("quick order popup uses dismiss callback", () => {
    const mod = readFileSync(resolve(process.cwd(), "src/chartQuickOrder.ts"), "utf8");
    expect(mod).toContain("dismissCallback");
  });

  it("default chart overlays disable click-to-preview", () => {
    expect(DEFAULT_CHART_OVERLAYS.orderPreview).toBe(false);
    expect(DEFAULT_CHART_OVERLAYS.quickOrder).toBe(false);
  });

  it("book rows expose ob-amt class", () => {
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(app).toContain('class="ob-amt"');
  });
});
