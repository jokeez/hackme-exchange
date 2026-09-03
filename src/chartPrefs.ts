/**
 * Durable chart + desk appearance — survives main demo-state wipe / quota / reseed.
 * Sidecar is authoritative when it holds user customizations; migrates from main blob once.
 */
import type {
  ChartMode,
  ChartOverlaySettings,
  ChartSettings,
  DemoState,
  IndicatorConfig,
  PairId,
  Timeframe,
} from "./types";
import {
  DEFAULT_CHART_OVERLAYS,
  DEFAULT_CHART_SETTINGS,
  DEFAULT_INDICATOR_CONFIG,
  normalizeChartOverlays,
} from "./types";
import { PAIRS } from "./pairs";
import {
  sanitizeChartMode,
  sanitizeChartSettings,
  sanitizeIndicatorConfig,
} from "./sanitize";

export const CHART_PREFS_KEY = "hackme-exchange-chart-prefs-v1";

export type ChartPrefs = {
  v: 1;
  savedAt: number;
  chartSettings: ChartSettings;
  chartMode: ChartMode;
  chartOverlays: ChartOverlaySettings;
  indicatorConfig: IndicatorConfig;
  drawingsLocked: boolean;
  activeTf: Timeframe;
  activePair: PairId;
};

function sanitizeTf(raw: unknown, fallback: Timeframe): Timeframe {
  const tfs = new Set([
    "30s", "1m", "3m", "5m", "15m", "1H", "2H", "4H", "1D", "1W",
  ] as Timeframe[]);
  return typeof raw === "string" && tfs.has(raw as Timeframe) ? (raw as Timeframe) : fallback;
}

function sanitizePair(raw: unknown, fallback: PairId): PairId {
  return typeof raw === "string" && PAIRS.some((p) => p.id === raw) ? (raw as PairId) : fallback;
}

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

/** Signature for chart colors / grid / scale — excludes indicator toggles. */
export function chartAppearanceSignature(prefs: Pick<ChartPrefs, "chartSettings" | "chartMode">): string {
  const s = prefs.chartSettings;
  const cs = s.candleStyle;
  return [
    s.candleScheme,
    s.logScale ? 1 : 0,
    s.gridVisible ? 1 : 0,
    s.gridOpacity.toFixed(3),
    s.bgGradient ? 1 : 0,
    prefs.chartMode,
    cs.bullBody,
    cs.bearBody,
    cs.bullWick,
    cs.bearWick,
  ].join("|");
}

export function isDefaultChartAppearance(
  prefs: Pick<ChartPrefs, "chartSettings" | "chartMode">,
): boolean {
  return chartAppearanceSignature(prefs) === chartAppearanceSignature({
    chartSettings: DEFAULT_CHART_SETTINGS,
    chartMode: "candles",
  });
}

export function chartPrefsFromState(
  state: Pick<
    DemoState,
    | "chartSettings"
    | "chartMode"
    | "chartOverlays"
    | "indicatorConfig"
    | "drawingsLocked"
    | "activeTf"
    | "activePair"
  >,
  savedAt = Date.now(),
): ChartPrefs {
  return {
    v: 1,
    savedAt,
    chartSettings: sanitizeChartSettings(state.chartSettings),
    chartMode: sanitizeChartMode(state.chartMode),
    chartOverlays: sanitizeOverlays(state.chartOverlays),
    indicatorConfig: sanitizeIndicatorConfig(state.indicatorConfig),
    drawingsLocked: !!state.drawingsLocked,
    activeTf: sanitizeTf(state.activeTf, "15m"),
    activePair: sanitizePair(state.activePair, "HMC_USDT"),
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
      savedAt: typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
      chartSettings: sanitizeChartSettings(parsed.chartSettings ?? DEFAULT_CHART_SETTINGS),
      chartMode: sanitizeChartMode(parsed.chartMode),
      chartOverlays: sanitizeOverlays(parsed.chartOverlays ?? DEFAULT_CHART_OVERLAYS),
      indicatorConfig: sanitizeIndicatorConfig(parsed.indicatorConfig ?? DEFAULT_INDICATOR_CONFIG),
      drawingsLocked: !!parsed.drawingsLocked,
      activeTf: sanitizeTf(parsed.activeTf, "15m"),
      activePair: sanitizePair(parsed.activePair, "HMC_USDT"),
    };
  } catch {
    return null;
  }
}

export function saveChartPrefs(prefs: ChartPrefs): boolean {
  try {
    localStorage.setItem(CHART_PREFS_KEY, JSON.stringify({ ...prefs, savedAt: prefs.savedAt || Date.now() }));
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

/** Apply prefs onto live state (chart + pair/tf). */
export function applyChartPrefsToState(state: DemoState, prefs: ChartPrefs): DemoState {
  state.chartSettings = prefs.chartSettings;
  state.chartMode = prefs.chartMode;
  state.chartOverlays = prefs.chartOverlays;
  state.indicatorConfig = prefs.indicatorConfig;
  state.drawingsLocked = prefs.drawingsLocked;
  state.activeTf = prefs.activeTf;
  state.activePair = prefs.activePair;
  return state;
}

/**
 * Merge sidecar vs main-blob on load.
 * - No sidecar → seed from blob.
 * - Sidecar factory-default + blob customized → blob wins (one-time migration).
 * - Otherwise sidecar wins (survives blob wipe).
 */
export function mergeChartPrefsOnLoad(state: DemoState): DemoState {
  const blobPrefs = chartPrefsFromState(state, 0);
  const sidecar = loadChartPrefs();
  if (!sidecar) {
    const seeded = chartPrefsFromState(state);
    saveChartPrefs(seeded);
    return state;
  }
  const sidecarDefault = isDefaultChartAppearance(sidecar);
  const blobCustom = !isDefaultChartAppearance(blobPrefs);
  const winner =
    sidecarDefault && blobCustom
      ? chartPrefsFromState(state)
      : sidecar;
  applyChartPrefsToState(state, winner);
  saveChartPrefs(chartPrefsFromState(state));
  return state;
}
