import { STORAGE_KEY } from "./theme";

export type SidePanelId = "book" | "right" | "tools";

export type LayoutPrefs = {
  bookWidth: number;
  rightWidth: number;
  bookCollapsed: boolean;
  rightCollapsed: boolean;
  toolsCollapsed: boolean;
  bottomHeight: number;
  bottomCollapsed: boolean;
};

export const LAYOUT_DEFAULTS: LayoutPrefs = {
  bookWidth: 248,
  rightWidth: 300,
  bookCollapsed: false,
  rightCollapsed: false,
  toolsCollapsed: false,
  bottomHeight: 180,
  bottomCollapsed: false,
};

export type LayoutPresetId = "standard" | "chart" | "scalper";

/** Binance-style one-click desk layouts. */
export const LAYOUT_PRESETS: Record<LayoutPresetId, LayoutPrefs> = {
  standard: { ...LAYOUT_DEFAULTS },
  chart: {
    ...LAYOUT_DEFAULTS,
    bookCollapsed: true,
    rightCollapsed: true,
    toolsCollapsed: false,
    bottomCollapsed: true,
  },
  scalper: {
    ...LAYOUT_DEFAULTS,
    bookWidth: 280,
    rightWidth: 320,
    bookCollapsed: false,
    rightCollapsed: false,
    toolsCollapsed: false,
    bottomHeight: 220,
    bottomCollapsed: false,
  },
};

export function applyLayoutPreset(id: LayoutPresetId): LayoutPrefs {
  const base = LAYOUT_PRESETS[id] ?? LAYOUT_PRESETS.standard;
  return sanitizeLayoutPrefs({ ...base });
}

const MIN_W = 200;
const MAX_W = 380;
const BOTTOM_MIN_H = 136;
const BOTTOM_MAX_H = 360;
/** Bump when layout shape changes so stale localStorage widths cannot break the desk. */
const KEY = `${STORAGE_KEY}-layout-v3`;

function clampWidth(n: number): number {
  if (!Number.isFinite(n)) return LAYOUT_DEFAULTS.bookWidth;
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(n)));
}

function clampBottom(n: number): number {
  if (!Number.isFinite(n)) return LAYOUT_DEFAULTS.bottomHeight;
  return Math.min(BOTTOM_MAX_H, Math.max(BOTTOM_MIN_H, Math.round(n)));
}

export function sanitizeLayoutPrefs(raw: unknown): LayoutPrefs {
  if (!raw || typeof raw !== "object") return { ...LAYOUT_DEFAULTS };
  const o = raw as Record<string, unknown>;
  return {
    bookWidth: clampWidth(typeof o.bookWidth === "number" ? o.bookWidth : LAYOUT_DEFAULTS.bookWidth),
    rightWidth: clampWidth(typeof o.rightWidth === "number" ? o.rightWidth : LAYOUT_DEFAULTS.rightWidth),
    bookCollapsed: o.bookCollapsed === true,
    rightCollapsed: o.rightCollapsed === true,
    toolsCollapsed: o.toolsCollapsed === true,
    bottomHeight: clampBottom(typeof o.bottomHeight === "number" ? o.bottomHeight : LAYOUT_DEFAULTS.bottomHeight),
    bottomCollapsed: o.bottomCollapsed === true,
  };
}

export function loadLayoutPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...LAYOUT_DEFAULTS };
    return sanitizeLayoutPrefs(JSON.parse(raw));
  } catch {
    return { ...LAYOUT_DEFAULTS };
  }
}

export function saveLayoutPrefs(prefs: LayoutPrefs): void {
  const clean = sanitizeLayoutPrefs(prefs);
  localStorage.setItem(KEY, JSON.stringify(clean));
}

export function terminalGridColumns(prefs: LayoutPrefs): string {
  const parts: string[] = [];
  if (!prefs.bookCollapsed) parts.push(`${prefs.bookWidth}px`);
  parts.push("minmax(0, 1fr)");
  if (!prefs.rightCollapsed) parts.push(`${prefs.rightWidth}px`);
  return parts.join(" ");
}

/** Chart fullscreen collapses side columns — must win over inline 3-col grid. */
export function terminalGridColumnsForView(prefs: LayoutPrefs, chartFullscreen: boolean): string {
  return chartFullscreen ? "minmax(0, 1fr)" : terminalGridColumns(prefs);
}

export function togglePanelCollapsed(prefs: LayoutPrefs, id: SidePanelId): LayoutPrefs {
  if (id === "book") return { ...prefs, bookCollapsed: !prefs.bookCollapsed };
  if (id === "tools") return { ...prefs, toolsCollapsed: !prefs.toolsCollapsed };
  return { ...prefs, rightCollapsed: !prefs.rightCollapsed };
}

export function setPanelWidth(prefs: LayoutPrefs, id: SidePanelId, width: number): LayoutPrefs {
  if (id === "book") return { ...prefs, bookWidth: clampWidth(width), bookCollapsed: false };
  return { ...prefs, rightWidth: clampWidth(width), rightCollapsed: false };
}

export function setBottomHeight(prefs: LayoutPrefs, height: number): LayoutPrefs {
  return { ...prefs, bottomHeight: clampBottom(height), bottomCollapsed: false };
}

export function toggleBottomCollapsed(prefs: LayoutPrefs): LayoutPrefs {
  return { ...prefs, bottomCollapsed: !prefs.bottomCollapsed };
}

export {
  MIN_W as LAYOUT_MIN_W,
  MAX_W as LAYOUT_MAX_W,
  BOTTOM_MIN_H,
  BOTTOM_MAX_H,
  KEY as LAYOUT_STORAGE_KEY,
};
