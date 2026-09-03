/**
 * Durable chart appearance prefs — survive main demo-state wipe / quota / reseed.
 * Main blob still stores a copy; this sidecar is authoritative on load.
 */
import type { ChartMode, ChartOverlaySettings, ChartSettings, DemoState, IndicatorConfig } from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS, DEFAULT_INDICATOR_CONFIG, normalizeChartOverlays } from "./types";
import {
  sanitizeChartMode,
  sanitizeChartSettings,
  sanitizeIndicatorConfig,
} from "./sanitize";

export const CHART_PREFS_KEY = "hackme-exchange-chart-prefs-v1";

export type ChartPrefs = {
  v: 1;
  chartSettings: ChartSettings;
  chartMode: ChartMode;
  chartOverlays: ChartOverlaySettings;
  indicatorConfig: IndicatorConfig;
  drawingsLocked: boolean;
};

function sanitizeOverlays(raw: unknown): ChartOverlaySettings {
  const incoming = raw && typeof raw === "object" ? (raw as Partial<ChartOverlaySettings>) : {};
  return normalizeChartOverlays({
    showVolume:
      typeof incoming.showVolume === "boolean" ? incoming.showVolume : DEFAULT_CHART_OVERLAYS.showVolume,
    showOrderLines:
      typeof incoming.showOrderLines === "boolean"
        ? incoming.showOrderLines
        : DEFAULT_CHART_OVERLAYS.showOrderLines,
    showLastPrice:
      typeof incoming.showLastPrice === "boolean"
        ? incoming.showLastPrice
        : DEFAULT_CHART_OVERLAYS.showLastPrice,
    orderPreview:
      typeof incoming.orderPreview === "boolean"
        ? incoming.orderPreview
        : DEFAULT_CHART_OVERLAYS.orderPreview,
    quickOrder:
      typeof incoming.quickOrder === "boolean" ? incoming.quickOrder : DEFAULT_CHART_OVERLAYS.quickOrder,
    quickOrderSkipConfirm:
      typeof incoming.quickOrderSkipConfirm === "boolean"
        ? incoming.quickOrderSkipConfirm
        : DEFAULT_CHART_OVERLAYS.quickOrderSkipConfirm,
  });
}

export function chartPrefsFromState(state: Pick<
  DemoState,
  "chartSettings" | "chartMode" | "chartOverlays" | "indicatorConfig" | "drawingsLocked"
>): ChartPrefs {
  return {
    v: 1,
    chartSettings: sanitizeChartSettings(state.chartSettings),
    chartMode: sanitizeChartMode(state.chartMode),
    chartOverlays: sanitizeOverlays(state.chartOverlays),
    indicatorConfig: sanitizeIndicatorConfig(state.indicatorConfig),
    drawingsLocked: !!state.drawingsLocked,
  };
}

export function loadChartPrefs(): ChartPrefs | null {
  try {
    const raw = localStorage.getItem(CHART_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChartPrefs>;
    if (!parsed || parsed.v !== 1) return null;
    return {
      v: 1,
      chartSettings: sanitizeChartSettings(parsed.chartSettings ?? DEFAULT_CHART_SETTINGS),
      chartMode: sanitizeChartMode(parsed.chartMode),
      chartOverlays: sanitizeOverlays(parsed.chartOverlays ?? DEFAULT_CHART_OVERLAYS),
      indicatorConfig: sanitizeIndicatorConfig(parsed.indicatorConfig ?? DEFAULT_INDICATOR_CONFIG),
      drawingsLocked: !!parsed.drawingsLocked,
    };
  } catch {
    return null;
  }
}

export function saveChartPrefs(prefs: ChartPrefs): boolean {
  try {
    localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export function clearChartPrefs(): void {
  try {
    localStorage.removeItem(CHART_PREFS_KEY);
  } catch {
    /* ignore */
  }
}

/** Apply sidecar over demo state (prefs win — they survive blob resets). */
export function applyChartPrefsToState(state: DemoState, prefs: ChartPrefs | null = loadChartPrefs()): DemoState {
  if (!prefs) return state;
  state.chartSettings = prefs.chartSettings;
  state.chartMode = prefs.chartMode;
  state.chartOverlays = prefs.chartOverlays;
  state.indicatorConfig = prefs.indicatorConfig;
  state.drawingsLocked = prefs.drawingsLocked;
  return state;
}
