/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("binance-inspired UI contracts", () => {
  it("book renderer drops inline depth mini-chart from book view", () => {
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(app).not.toContain('class="depth-wrap"');
    expect(app).toContain("Price (${pair.quote})");
    expect(app).toContain("Amount (${pair.base})");
  });

  it("styles define Binance ticker and underline tabs", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain(".binance-ticker");
    expect(css).toContain(".binance-type-tabs .type.active");
    expect(css).toContain(".spot-mode.active");
    expect(css).toContain(".order-mode-row");
    expect(css).toContain(".order-type-row");
    expect(css).toContain(".trade-side-toggle");
    expect(css).toContain(".spot-layout");
    expect(css).toContain(".activity-panel");
    // Tab underlines use a fixed 3px bar (not thin border-bottom on text)
    expect(css).toContain(".spot-mode.active::after");
    expect(css).toContain(".binance-type-tabs .type.active::after");
    expect(css).toContain(".activity-tabs button.active::after");
    expect(css).toContain("height: 3px");
    expect(css).toContain(".lane-tab.active");
    expect(css).toContain(".asset-ico");
    expect(css).toContain(".pair-icons");
  });

  it("markets list drops descriptive tags and uses asset icons", () => {
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(app).toContain("pairAssetIcons");
    expect(app).toContain("markets-fav-empty");
    expect(app).not.toContain("mr-tag");
    expect(app).not.toContain("p.tag");
  });

  it("order panel separates product mode and order-type rows", () => {
    const panel = readFileSync(resolve(process.cwd(), "src/orderPanel.ts"), "utf8");
    expect(panel).toContain("order-mode-row");
    expect(panel).toContain("order-type-row");
    expect(panel).toContain('aria-label="Product mode"');
    expect(panel).toContain('aria-label="Order type"');
    expect(panel).toContain("fee-meta");
    // HMC fees live in meta — not jammed under Spot as a separate jammed fee-row block
    expect(panel).toMatch(/order-head-meta[\s\S]*pay-fees-hmc/);
  });
});
