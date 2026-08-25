/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { showOverlayMenu, showMultiChartPicker } from "./chartModals";
import { baseState } from "./testFixtures";
import { DEFAULT_CHART_OVERLAYS } from "./types";

describe("chrome overlays menu", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button type="button" id="btn-overlays">Overlays</button>`;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("toggles multiple overlays without closing the menu", () => {
    const s = baseState({ chartOverlays: structuredClone(DEFAULT_CHART_OVERLAYS) });
    const anchor = document.getElementById("btn-overlays")!;
    const patches: unknown[] = [];
    showOverlayMenu(s, anchor, (patch) => {
      Object.assign(s, patch);
      patches.push(patch);
    });
    const menu = document.querySelector(".pop-menu");
    expect(menu).toBeTruthy();
    const vol = menu!.querySelector("#ov-vol") as HTMLInputElement;
    const quick = menu!.querySelector("#ov-quick") as HTMLInputElement;
    expect(vol.checked).toBe(true);
    quick.checked = true;
    quick.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector(".pop-menu")).toBeTruthy();
    expect(s.chartOverlays.quickOrder).toBe(true);
    vol.checked = false;
    vol.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector(".pop-menu")).toBeTruthy();
    expect(s.chartOverlays.showVolume).toBe(false);
    expect(patches.length).toBe(2);
  });

  it("closes on outside click", () => {
    vi.useFakeTimers();
    const s = baseState();
    const anchor = document.getElementById("btn-overlays")!;
    let closed = false;
    showOverlayMenu(s, anchor, () => {}, () => {
      closed = true;
    });
    expect(document.querySelector(".pop-menu")).toBeTruthy();
    vi.runAllTimers();
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".pop-menu")).toBeNull();
    expect(closed).toBe(true);
    vi.useRealTimers();
  });
});

describe("multi chart picker", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button type="button" id="btn-multi">Multi</button>`;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("emits layout patch on option click", () => {
    const s = baseState({ multiChartLayout: "1" });
    const anchor = document.getElementById("btn-multi")!;
    let layout = "";
    showMultiChartPicker(s, anchor, (patch) => {
      layout = String(patch.multiChartLayout ?? "");
    });
    (document.querySelector('[data-l="2v"]') as HTMLButtonElement).click();
    expect(layout).toBe("2v");
    expect(document.querySelector(".pop-menu")).toBeNull();
  });
});

describe("spot chrome control contracts", () => {
  it("documents required control ids used by wireEvents (parsed from app.ts)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "app.ts"), "utf8");
    const required = [
      "btn-system-status",
      "sys-drop",
      "btn-open-alerts",
      "btn-hotkeys",
      "btn-overlays",
      "btn-chart-settings",
      "btn-fullscreen",
      "btn-multi",
      "type-tabs",
      "order-type-adv",
      "pay-fees-hmc",
      "mobile-panel-tabs",
      "activity-tabs",
    ];
    for (const id of required) {
      expect(src.includes(`"${id}"`) || src.includes(`'${id}'`) || src.includes(`id="${id}"`) || src.includes(`#${id}`)).toBe(
        true,
      );
    }
    expect(required.length).toBe(13);
    expect(new Set(required).size).toBe(required.length);
  });
});
