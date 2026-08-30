/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { applyFirstVisitPrefs, ONBOARD_STORAGE_KEY, scheduleChartTapHint, CHART_HINT_KEY } from "./onboarding";
import { normalizeChartOverlays } from "./types";

describe("onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<div id="chart-host-1" style="width:400px;height:300px"></div>';
    const host = document.getElementById("chart-host-1")!;
    host.getBoundingClientRect = () =>
      ({ width: 400, height: 300, top: 100, left: 50, bottom: 400, right: 450 } as DOMRect);
  });

  it("enables quick order on first visit", () => {
    const state = { chartOverlays: normalizeChartOverlays({}) };
    let saved = false;
    const changed = applyFirstVisitPrefs(state, {
      saveState: () => { saved = true; },
      normalizeOverlays: normalizeChartOverlays,
    });
    expect(changed).toBe(true);
    expect(state.chartOverlays.quickOrder).toBe(true);
    expect(saved).toBe(true);
    expect(localStorage.getItem(ONBOARD_STORAGE_KEY)).toBe("1");
  });

  it("does not re-run first visit prefs", () => {
    localStorage.setItem(ONBOARD_STORAGE_KEY, "1");
    const state = { chartOverlays: normalizeChartOverlays({ quickOrder: false }) };
    const changed = applyFirstVisitPrefs(state, {
      saveState: () => {},
      normalizeOverlays: normalizeChartOverlays,
    });
    expect(changed).toBe(false);
  });

  it("scheduleChartTapHint shows coach mark", async () => {
    vi.useFakeTimers();
    scheduleChartTapHint({ delayMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    expect(document.getElementById("chart-tap-coach")).toBeTruthy();
    vi.useRealTimers();
  });

  it("skips chart hint when already dismissed", () => {
    localStorage.setItem(CHART_HINT_KEY, "1");
    scheduleChartTapHint({ delayMs: 0 });
    expect(document.getElementById("chart-tap-coach")).toBeNull();
  });
});
