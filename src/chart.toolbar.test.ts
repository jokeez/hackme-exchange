/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { showChartStyleModal, showIndicatorModal, showGoToDateModal } from "./chartModals";
import { terminalGridColumns, terminalGridColumnsForView, LAYOUT_DEFAULTS } from "./layoutPrefs";
import { Ico } from "./icons";
import { baseState } from "./testFixtures";
import { DEFAULT_CHART_SETTINGS, DEFAULT_INDICATOR_CONFIG } from "./types";

describe("chart fullscreen layout", () => {
  it("collapses grid to a single flexible column", () => {
    const normal = terminalGridColumns(LAYOUT_DEFAULTS);
    expect(normal).toContain("px");
    expect(terminalGridColumnsForView(LAYOUT_DEFAULTS, false)).toBe(normal);
    expect(terminalGridColumnsForView(LAYOUT_DEFAULTS, true)).toBe("minmax(0, 1fr)");
  });

  it("CSS targets .terminal.chart-fullscreen (class on terminal, not ancestor)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain(".terminal.chart-fullscreen");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) !important");
    expect(css).not.toMatch(/\.chart-fullscreen\s+\.terminal\s*\{/);
  });

  it("hub embed shows expand rails when panels collapsed", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain('html[data-embed="hub"] .terminal.book-collapsed .panel-rail.left');
    expect(css).toContain('html[data-embed="hub"] .terminal.tools-collapsed .panel-rail.tools-rail');
    expect(css).toContain('html[data-embed="hub"] .chart-body.tools-collapsed .panel-rail.tools-rail');
    expect(css).toContain('html[data-embed="hub"] .panel-rail.is-visible');
  });

  it("hub embed fullscreen beats 3-col !important grid (regression)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toContain('html[data-embed="hub"] .terminal.chart-fullscreen');
    expect(css).toContain('html[data-embed="hub"] .terminal.mobile-stack.chart-fullscreen .col-right');
    expect(css).toContain('html[data-embed="hub"] .col-right.hidden');
    expect(css).toMatch(
      /html\[data-embed="hub"\][\s\S]*?\.terminal\.mobile-stack\.chart-fullscreen \.col-right[\s\S]*?display:\s*none\s*!important/,
    );
  });

  it("maximize / minimize icons render", () => {
    expect(Ico.maximize()).toContain("<svg");
    expect(Ico.minimize()).toContain("<svg");
  });
});

describe("chart style / indicator modals", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("Chart Style opens Symbol/Background tabs and Save applies patch", () => {
    const s = baseState();
    let saved: Partial<typeof s> | null = null;
    showChartStyleModal(s, (patch) => {
      saved = patch;
    });
    const bd = document.querySelector(".modal-backdrop[data-chart-modal]");
    expect(bd).toBeTruthy();
    expect(bd!.textContent).toContain("Chart Style");
    expect(bd!.querySelector("#pane-symbol")?.classList.contains("hidden")).toBe(false);
    expect(bd!.querySelector("#pane-background")?.classList.contains("hidden")).toBe(true);

    (bd!.querySelector('[data-tab="background"]') as HTMLButtonElement).click();
    expect(bd!.querySelector("#pane-symbol")?.classList.contains("hidden")).toBe(true);
    expect(bd!.querySelector("#pane-background")?.classList.contains("hidden")).toBe(false);

    (bd!.querySelector("#cs-log") as HTMLInputElement).checked = true;
    (bd!.querySelector("#cs-scheme") as HTMLSelectElement).value = "neon";
    (bd!.querySelector("#cs-scheme") as HTMLSelectElement).dispatchEvent(new Event("change"));
    (bd!.querySelector("#modal-save") as HTMLButtonElement).click();
    expect(document.querySelector(".modal-backdrop")).toBeNull();
    expect(saved?.chartSettings?.logScale).toBe(true);
    expect(saved?.chartSettings?.candleScheme).toBe("neon");
    expect(saved?.chartSettings?.candleStyle.bullBody).toBe("#39ff14");
    expect(saved?.chartSettings?.candleStyle.bearBody).toBe("#ff00ff");
  });

  it("Chart Style scheme change syncs color pickers before Save", () => {
    const s = baseState();
    showChartStyleModal(s, () => {});
    const scheme = document.querySelector("#cs-scheme") as HTMLSelectElement;
    scheme.value = "blue";
    scheme.dispatchEvent(new Event("change"));
    expect((document.querySelector("#cs-bull") as HTMLInputElement).value).toBe("#42a5f5");
    expect((document.querySelector("#cs-bear") as HTMLInputElement).value).toBe("#ff9800");
    expect((document.querySelector("#cs-bull-w") as HTMLInputElement).value).toBe("#42a5f5");
    expect((document.querySelector("#cs-bear-w") as HTMLInputElement).value).toBe("#ff9800");
  });

  it("Chart Style Background tab Save applies grid + gradient", () => {
    const s = baseState();
    let saved: Partial<typeof s> | null = null;
    showChartStyleModal(s, (patch) => {
      saved = patch;
    });
    (document.querySelector('[data-tab="background"]') as HTMLButtonElement).click();
    (document.querySelector("#cs-grid") as HTMLInputElement).checked = false;
    (document.querySelector("#cs-grad") as HTMLInputElement).checked = false;
    (document.querySelector("#cs-grid-op") as HTMLInputElement).value = "0.15";
    (document.querySelector("#modal-save") as HTMLButtonElement).click();
    expect(saved?.chartSettings?.gridVisible).toBe(false);
    expect(saved?.chartSettings?.bgGradient).toBe(false);
    expect(saved?.chartSettings?.gridOpacity).toBeCloseTo(0.15, 5);
  });

  it("Chart Style Cancel and Escape dismiss without saving", () => {
    const s = baseState();
    let saved = false;
    showChartStyleModal(s, () => {
      saved = true;
    });
    (document.querySelector("#cs-log") as HTMLInputElement).checked = true;
    (document.querySelector("#modal-close") as HTMLButtonElement).click();
    expect(document.querySelector(".modal-backdrop")).toBeNull();
    expect(saved).toBe(false);

    showChartStyleModal(s, () => {
      saved = true;
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".modal-backdrop")).toBeNull();
    expect(saved).toBe(false);
  });

  it("Chart Style custom colors save independently of scheme", () => {
    const s = baseState();
    let saved: Partial<typeof s> | null = null;
    showChartStyleModal(s, (patch) => {
      saved = patch;
    });
    (document.querySelector("#cs-bull") as HTMLInputElement).value = "#112233";
    (document.querySelector("#cs-bear") as HTMLInputElement).value = "#aabbcc";
    (document.querySelector("#cs-bull-w") as HTMLInputElement).value = "#445566";
    (document.querySelector("#cs-bear-w") as HTMLInputElement).value = "#ddeeff";
    (document.querySelector("#modal-save") as HTMLButtonElement).click();
    expect(saved?.chartSettings?.candleStyle.bullBody.toLowerCase()).toBe("#112233");
    expect(saved?.chartSettings?.candleStyle.bearWick.toLowerCase()).toBe("#ddeeff");
  });

  it("Chart Style Reset restores classic defaults without wiping indicator toggles", () => {
    const s = baseState({
      chartSettings: {
        ...structuredClone(DEFAULT_CHART_SETTINGS),
        candleScheme: "mono",
        logScale: true,
        indicators: { ...DEFAULT_CHART_SETTINGS.indicators, ema20: true, rsi: true },
      },
    });
    let saved: Partial<typeof s> | null = null;
    showChartStyleModal(s, (patch) => {
      saved = patch;
    });
    // happy-dom / Vitest 4+: window.confirm may be missing — stubGlobal, not spyOn.
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);
    (document.querySelector("#modal-reset") as HTMLButtonElement).click();
    expect(confirmSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(saved?.chartSettings?.candleScheme).toBe("classic");
    expect(saved?.chartSettings?.logScale).toBe(false);
    expect(saved?.chartSettings?.bgGradient).toBe(true);
    expect(saved?.chartSettings?.indicators.ema20).toBe(true);
    expect(saved?.chartSettings?.indicators.rsi).toBe(true);
  });

  it("Chart Style Reset cancel leaves settings unchanged", () => {
    const s = baseState({
      chartSettings: {
        ...structuredClone(DEFAULT_CHART_SETTINGS),
        candleScheme: "neon",
        logScale: true,
      },
    });
    let saved: Partial<typeof s> | null = null;
    showChartStyleModal(s, (patch) => {
      saved = patch;
    });
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);
    (document.querySelector("#modal-reset") as HTMLButtonElement).click();
    vi.unstubAllGlobals();
    expect(confirmSpy).toHaveBeenCalled();
    expect(saved).toBeNull();
    expect(document.querySelector(".modal-backdrop")).toBeTruthy();
  });

  it("duplicate Chart Style opens replace previous backdrop", () => {
    const s = baseState();
    showChartStyleModal(s, () => {});
    showChartStyleModal(s, () => {});
    expect(document.querySelectorAll(".modal-backdrop[data-chart-modal]").length).toBe(1);
  });

  it("Indicator modal Save + Reset work", () => {
    const s = baseState({
      indicatorConfig: {
        ma: [
          { enabled: true, period: 9, color: "#ffffff" },
          { enabled: false, period: 21, color: "#aaaaaa" },
          { enabled: false, period: 50, color: "#888888" },
        ],
      },
    });
    let saved: Partial<typeof s> | null = null;
    showIndicatorModal(s, (patch) => {
      saved = patch;
    });
    (document.querySelector("#ma-p-0") as HTMLInputElement).value = "12";
    (document.querySelector("#modal-save") as HTMLButtonElement).click();
    expect(saved?.indicatorConfig?.ma[0]?.period).toBe(12);

    showIndicatorModal(s, (patch) => {
      saved = patch;
    });
    (document.querySelector("#modal-reset") as HTMLButtonElement).click();
    expect(saved?.indicatorConfig).toEqual(DEFAULT_INDICATOR_CONFIG);
  });

  it("Go to Date Confirm yields unix seconds", () => {
    let ts = 0;
    showGoToDateModal((t) => {
      ts = t;
    });
    const inp = document.querySelector("#goto-dt") as HTMLInputElement;
    inp.value = "2026-06-15T12:00";
    (document.querySelector("#modal-save") as HTMLButtonElement).click();
    expect(ts).toBe(Math.floor(new Date("2026-06-15T12:00").getTime() / 1000));
  });
});
