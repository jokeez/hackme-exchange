/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  MOBILE_LAYOUT_MAX_PX,
  chartInteractionOptions,
  isMobileLayout,
  loadMobilePanel,
  loadMobileTradeSide,
  mobilePanelResizeEnabled,
  saveMobilePanel,
  saveMobileTradeSide,
  syncMobileLayoutClass,
} from "./mobile";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("mobile layout helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists active panel in sessionStorage", () => {
    saveMobilePanel("trade");
    expect(loadMobilePanel()).toBe("trade");
    saveMobilePanel("markets");
    expect(loadMobilePanel()).toBe("markets");
  });

  it("defaults to chart for unknown stored value", () => {
    sessionStorage.setItem("hackme-ex-mobile-panel-v1", "nope");
    expect(loadMobilePanel()).toBe("chart");
  });

  it("isMobileLayout reflects matchMedia breakpoint", () => {
    expect(typeof isMobileLayout()).toBe("boolean");
    expect(MOBILE_LAYOUT_MAX_PX).toBe(1024);
  });

  it("isMobileLayout stays desktop in hub embed", () => {
    document.documentElement.dataset.embed = "hub";
    expect(isMobileLayout()).toBe(false);
    delete document.documentElement.dataset.embed;
  });

  it("syncMobileLayoutClass toggles html.mobile-layout", () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes(String(MOBILE_LAYOUT_MAX_PX)),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => true,
      }) as MediaQueryList) as typeof window.matchMedia;
    syncMobileLayoutClass();
    expect(document.documentElement.classList.contains("mobile-layout")).toBe(true);
    window.matchMedia = ((q: string) =>
      ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => true,
      }) as MediaQueryList) as typeof window.matchMedia;
    syncMobileLayoutClass();
    expect(document.documentElement.classList.contains("mobile-layout")).toBe(false);
    window.matchMedia = orig;
    syncMobileLayoutClass();
  });

  it("persists mobile trade side in sessionStorage", () => {
    saveMobileTradeSide("sell");
    expect(loadMobileTradeSide()).toBe("sell");
    saveMobileTradeSide("buy");
    expect(loadMobileTradeSide()).toBe("buy");
  });

  it("chartInteractionOptions locks price-axis drag on mobile", () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes(String(MOBILE_LAYOUT_MAX_PX)),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => true,
      }) as MediaQueryList) as typeof window.matchMedia;
    const mobile = chartInteractionOptions();
    expect(mobile.handleScale.axisPressedMouseMove.price).toBe(false);
    expect(mobile.handleScale.pinch).toBe(false);
    expect(mobile.handleScroll.horzTouchDrag).toBe(false);
    expect(mobile.handleScroll.pressedMouseMove).toBe(false);
    expect(mobilePanelResizeEnabled()).toBe(false);
    window.matchMedia = orig;
  });
});

describe("mobile CSS contracts", () => {
  it("ships dvh shell, safe-area, 1024 breakpoint, touch targets", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain("@media (max-width: 1024px)");
    expect(css).toContain("100dvh");
    expect(css).toContain(".spot-layout");
    expect(css).toContain("safe-area-inset");
    expect(css).toContain("touch-action: manipulation");
    expect(css).toContain("min-height: 2.75rem");
    expect(MOBILE_LAYOUT_MAX_PX).toBe(1024);
  });

  it("re-asserts trade-side toggle after base display:none (cascade)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const baseHide = css.indexOf(".trade-side-toggle { display: none");
    expect(baseHide).toBeGreaterThan(0);
    const after = css.slice(baseHide);
    // Mobile block after base must show the toggle again.
    expect(after).toMatch(/@media \(max-width: 1024px\)[\s\S]*?\.trade-side-toggle\s*\{[\s\S]*?display:\s*inline-flex/);
    expect(after).toMatch(/\.dual-order\s*\{[\s\S]*?grid-template-columns:\s*1fr\s*!important/);
  });

  it("mobile panel tabs markup keeps terminal inside spot-layout", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    const m = src.match(/function renderMobilePanelTabs\(\)[\s\S]*?return `([\s\S]*?)`;/);
    expect(m?.[1]).toBeTruthy();
    expect(m![1]).not.toContain("</div></div>");
    expect(src).toMatch(
      /<div class="mobile-panel-wrap">\$\{renderMobilePanelTabs\(\)\}<\/div>[\s\S]*?<div class="terminal mobile-stack/,
    );
  });

  it("desktop shell keeps mining-strip inside spot-layout (chart layout regression)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    const shell = src.match(/return `\s*<div class="spot-layout">([\s\S]*?)<div class="kbd-hint">/);
    expect(shell?.[1]).toBeTruthy();
    const body = shell![1];
    expect(body).toContain('id="terminal"');
    expect(body).toContain('id="mining-strip"');
    const termIdx = body.indexOf('id="terminal"');
    const stripIdx = body.indexOf('id="mining-strip"');
    expect(termIdx).toBeGreaterThan(0);
    expect(stripIdx).toBeGreaterThan(termIdx);
    expect(body.indexOf("</div>", stripIdx)).toBeGreaterThan(stripIdx);
  });

  it("desktop terminal grid uses minmax center column (no chart squash)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toMatch(/\.terminal\s*\{[\s\S]*?grid-template-columns:\s*248px minmax\(0,\s*1fr\) 300px/);
    expect(css).toMatch(/\.spot-layout\s*\{[\s\S]*?min-height:\s*0/);
    expect(css).toMatch(/#app:has\(\.spot-layout\)\s*\{[\s\S]*?height:\s*100dvh/);
  });

  it("index.html has viewport-fit and theme-color", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("theme-color");
  });

  it("ships hub-embed desktop desk overrides", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain('html[data-embed="hub"] .mobile-panel-wrap');
    expect(css).toContain('html[data-embed="hub"] .terminal.mobile-stack');
    expect(css).toContain("grid-template-columns: 200px minmax(0, 1fr) 248px");
    expect(css).toContain('html[data-embed="hub"] .chart-host');
    expect(css).toMatch(/html\[data-embed="hub"\][\s\S]*?\.chart-body[\s\S]*?min-height:\s*0\s*!important/);
    expect(css).toMatch(/html\[data-embed="hub"\][\s\S]*?\.order-zone[\s\S]*?max-height:\s*min\(42vh,\s*380px\)/);
    expect(css).toContain("grid-template-columns: max-content minmax(0, 1fr)");
    expect(css).toContain(".mr-px");
    expect(css).toContain('html[data-embed="hub"] #activity-body');
    expect(css).toMatch(/#activity-body[\s\S]*?overflow-y:\s*auto\s*!important/);
    expect(css).toContain(".activity-panel");
    expect(css).toContain("pnl-cards.inline");
    expect(css).toContain("text-overflow: ellipsis");
  });

  it("ships mobile tools sheet, locked price axis, no panel rails", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(css).toContain("html.mobile-layout .btn-mobile-tools");
    expect(css).toContain('html:not(.mobile-layout) .btn-mobile-tools');
    expect(css).toContain("html.mobile-layout .btn-ico");
    expect(css).toContain("html.mobile-layout .activity-panel");
    expect(css).toContain("touch-action: none");
    expect(app).toContain("applyLayoutToDom()");
    expect(app).toContain("loadMobileTradeSide");
    expect(readFileSync(resolve(process.cwd(), "src/chart.ts"), "utf8")).toContain("setupMobileChartPan");
    expect(readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8")).toContain("syncMobileLayoutClass");
  });

  it("ships mobile system sheet, ticker icons, hidden draw-tools on chart", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(css).toContain(".sys-backdrop");
    expect(css).toContain("body.sys-menu-open");
    expect(css).toMatch(/@media \(max-width: 1024px\)[\s\S]*?\.sys-drop[\s\S]*?position:\s*fixed/);
    expect(css).toContain('html.mobile-layout .terminal.mobile-stack[data-mobile-panel="chart"]:not(.mobile-tools-open) .draw-tools');
    expect(css).toContain(".tb-pair-icons");
    expect(app).toContain("tb-pair-icons");
    expect(app).toContain("pairAssetIcons(pair.base");
    expect(app).not.toContain("tb-star");
    expect(app).not.toContain("◆");
    expect(app).toContain('aria-controls="${t.panelId}"');
    expect(app).toContain('panelId: "col-book"');
    expect(app).toContain('aria-label="Indicators"');
    expect(app).toContain('id="sys-backdrop"');
  });

  it("ships coin svg assets for USDT BTC SUP", () => {
    for (const coin of ["usdt", "btc", "sup"]) {
      const svg = readFileSync(resolve(process.cwd(), `public/assets/coins/${coin}.svg`), "utf8");
      expect(svg).toContain("<svg");
    }
  });

  it("SUP icon matches HackMe support branding", () => {
    const svg = readFileSync(resolve(process.cwd(), "public/assets/coins/sup.svg"), "utf8");
    expect(svg).toContain('aria-label="SUP"');
    expect(svg).toContain("#a855f7");
    expect(svg).toContain("#22d3ee");
    expect(svg).toContain(">SUP<");
  });
});
