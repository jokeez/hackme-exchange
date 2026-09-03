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
  mobileChartFooterOverlapPx,
  saveMobilePanel,
  saveMobileTradeSide,
  setMobileTradeSide,
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

  it("defaults to trade for unknown stored value", () => {
    sessionStorage.setItem("hackme-ex-mobile-panel-v1", "nope");
    expect(loadMobilePanel()).toBe("trade");
  });

  it("migrates legacy book tab to trade split", () => {
    sessionStorage.setItem("hackme-ex-mobile-panel-v1", "book");
    expect(loadMobilePanel()).toBe("trade");
  });

  it("isMobileLayout reflects matchMedia breakpoint", () => {
    expect(typeof isMobileLayout()).toBe("boolean");
    expect(MOBILE_LAYOUT_MAX_PX).toBe(1024);
  });

  it("isMobileLayout uses viewport width in hub embed too", () => {
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
    document.documentElement.dataset.embed = "hub";
    expect(isMobileLayout()).toBe(true);
    delete document.documentElement.dataset.embed;
    window.matchMedia = orig;
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

  it("mobileChartFooterOverlapPx measures chart/footer overlap on chart tab", () => {
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
    document.documentElement.classList.add("mobile-layout");
    document.documentElement.setAttribute("data-mobile-panel", "chart");
    document.body.innerHTML = `
      <div id="chart-host" style="position:fixed;left:0;right:0;top:0;height:400px"></div>
      <div id="mobile-footer-stack" style="position:fixed;left:0;right:0;bottom:0;height:120px"></div>
    `;
    const host = document.getElementById("chart-host")!;
    Object.defineProperty(host, "getBoundingClientRect", {
      value: () => ({ top: 0, bottom: 400, left: 0, right: 320, width: 320, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const footer = document.getElementById("mobile-footer-stack")!;
    let footerTop = 300;
    Object.defineProperty(footer, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top: footerTop,
        bottom: footerTop + 120,
        left: 0,
        right: 320,
        width: 320,
        height: 120,
        x: 0,
        y: footerTop,
        toJSON: () => ({}),
      }),
    });
    expect(mobileChartFooterOverlapPx(host)).toBe(100);
    // 1px thrash snaps to same 4px bucket (avoids ResizeObserver shake).
    footerTop = 299;
    expect(mobileChartFooterOverlapPx(host)).toBe(100);
    document.documentElement.removeAttribute("data-mobile-panel");
    document.documentElement.classList.remove("mobile-layout");
    document.body.innerHTML = "";
    window.matchMedia = orig;
  });

  it("ships mobile pair tap without search autofocus and readable market search", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(app).not.toContain('getElementById("market-search")?.focus()');
    expect(css).toContain("html.mobile-layout .market-search");
    expect(css).toContain("font-size: 16px");
    expect(css).toMatch(/ind-tabs\.compact[\s\S]*?min-height:\s*2\.75rem/);
  });

  it("persists mobile trade side in sessionStorage", () => {
    saveMobileTradeSide("sell");
    expect(loadMobileTradeSide()).toBe("sell");
    saveMobileTradeSide("buy");
    expect(loadMobileTradeSide()).toBe("buy");
  });

  it("chartInteractionOptions enables pinch; price wheel is custom (not LWC native)", () => {
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
    expect(mobile.handleScale.axisPressedMouseMove.price).toBe(true);
    expect(mobile.handleScale.axisDoubleClickReset.price).toBe(true);
    expect(mobile.handleScale.mouseWheel).toBe(false);
    expect(mobile.handleScale.pinch).toBe(true);
    expect(mobile.handleScroll.horzTouchDrag).toBe(true);
    expect(mobile.handleScroll.vertTouchDrag).toBe(true);
    expect(mobile.handleScroll.mouseWheel).toBe(false);
    expect(mobilePanelResizeEnabled()).toBe(false);
    window.matchMedia = orig;

    const origDesk = window.matchMedia;
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
    const desk = chartInteractionOptions();
    expect(desk.handleScale.axisPressedMouseMove.price).toBe(true);
    expect(desk.handleScroll.vertTouchDrag).toBe(true);
    expect(desk.handleScale.mouseWheel).toBe(false);
    expect(desk.handleScroll.mouseWheel).toBe(false);
    window.matchMedia = origDesk;
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
    expect(css).toMatch(/\.act-actions \.link[\s\S]*?min-height:\s*2rem/);
    expect(css).toContain(".act-actions .link.is-busy");
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

  it("mobile bottom nav keeps terminal before nav in spot shell", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(src).toContain('mp-ico mp-ico-${t.ico}');
    expect(src).not.toMatch(/function renderMobilePanelTabs\(\)[\s\S]*?<\/div><\/div>/);
    expect(src).toMatch(
      /id="terminal"[\s\S]*?mobile-bottom-nav">\$\{renderMobilePanelTabs\(\)\}/,
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
    expect(css).toContain('html[data-embed="hub"]:not(.mobile-layout) .mobile-panel-wrap');
    expect(css).toContain('html.mobile-layout[data-embed="hub"] .mobile-panel-wrap');
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

  it("ships Binance-style mobile trade split and bottom nav", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain(".mobile-bottom-nav");
    expect(css).toContain('[data-mobile-panel="trade"]');
    expect(css).toContain("flex-direction: row !important");
    expect(css).toContain('[data-mobile-panel="orders"]');
    expect(css).toContain(".mobile-chart-trade-bar");
  });

  it("ships mobile tools sheet, draggable price axis, no panel rails", () => {
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
    expect(app).toContain('id="btn-mobile-pair"');
    expect(app).toContain('panelId: "activity-panel"');
    expect(app).toContain('aria-label="Indicators"');
    expect(app).toContain('id="sys-backdrop"');
  });

  it("ships chart-type portal sheet above mobile footer", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(css).toContain(".chart-type-backdrop");
    expect(css).toContain(".mode-drop-sheet");
    expect(css).toContain("body.chart-type-open");
    expect(css).toContain("#chart-type-drop.mode-drop-sheet");
    expect(app).toContain("showChartTypeDrop");
    expect(app).toContain("mobileFooterInsetPx");
    expect(app).toContain('document.body.appendChild(drop)');
    expect(app).toContain('id="chart-type-drop"');
    expect(css).toContain(".chart-chrome");
  });

  it("ships mobile quick order sheet, viewport persistence, haptics", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    const chart = readFileSync(resolve(process.cwd(), "src/chart.ts"), "utf8");
    expect(css).toContain(".chart-quick-order.sheet");
    expect(css).toContain(".cqo-backdrop");
    expect(css).toContain(".cqo-confirm");
    expect(app).toContain("buildQuickOrderValidation");
    expect(app).toContain("switchActivePair");
    expect(app).toContain("switchChartPair");
    expect(app).toContain("mobile-ohlc-bar");
    expect(chart).toContain("switchChartPair");
    expect(chart).toContain("tryRestoreChartViewport");
    expect(readFileSync(resolve(process.cwd(), "src/haptic.ts"), "utf8")).toContain("navigator.vibrate");
    expect(readFileSync(resolve(process.cwd(), "src/chartViewport.ts"), "utf8")).toContain("sessionStorage");
  });

  it("ships mobile chart-more sheet and trade tape strip", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(app).toContain('id="btn-mobile-chart-more"');
    expect(app).toContain('id="chart-more-drop"');
    expect(app).toContain("showChartMoreDrop");
    expect(app).toContain("setMobileTradeSide");
    expect(app).toContain('id="mobile-trade-tape"');
    expect(css).toContain(".mobile-trade-tape-wrap");
    expect(css).toContain(".btn-mobile-chart-more");
    expect(css).toContain("html.mobile-layout .tb-stats");
  });

  it("setMobileTradeSide syncs buy/sell tab", () => {
    document.body.innerHTML = `<div id="trade-side-toggle">
      <button class="ts buy active" data-mobile-side="buy"></button>
      <button class="ts sell" data-mobile-side="sell"></button>
    </div><div id="dual-order" data-mobile-side="buy"></div>`;
    setMobileTradeSide("sell");
    expect(document.getElementById("dual-order")?.getAttribute("data-mobile-side")).toBe("sell");
    expect(document.querySelector('.ts.sell')?.classList.contains("active")).toBe(true);
    expect(loadMobileTradeSide()).toBe("sell");
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
