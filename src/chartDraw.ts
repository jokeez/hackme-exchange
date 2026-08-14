import type { DrawTool, Drawing, PairId, Timeframe } from "./types";
import { TF_SEC } from "./types";
import { escapeHtml, sanitizeCssColor, sanitizeDomId } from "./sanitize";

const DRAW_TOOLS: ReadonlySet<string> = new Set([
  "cursor",
  "hline",
  "trend",
  "fib",
  "rect",
  "text",
  "measure",
]);

const PAIR_IDS: ReadonlySet<string> = new Set([
  "HMC_USDT",
  "SUP_USDT",
  "HMC_SUP",
  "HMC_BTC",
  "SUP_BTC",
]);

export type MeasureStats = {
  dPrice: number;
  dPct: number;
  bars: number;
  seconds: number;
  timeLabel: string;
  up: boolean;
};

/** TradingView-style measure readout: Δprice, %, bars, elapsed time. */
export function computeMeasureStats(
  a: { time: number; price: number },
  b: { time: number; price: number },
  tf: Timeframe,
): MeasureStats {
  const dPrice = b.price - a.price;
  const dPct = a.price !== 0 && Number.isFinite(a.price) ? (dPrice / a.price) * 100 : 0;
  const seconds = Math.abs((b.time ?? 0) - (a.time ?? 0));
  const tfSec = TF_SEC[tf] || 60;
  const bars = Math.max(1, Math.round(seconds / tfSec) || 1);
  return {
    dPrice: Number.isFinite(dPrice) ? dPrice : 0,
    dPct: Number.isFinite(dPct) ? dPct : 0,
    bars,
    seconds: Number.isFinite(seconds) ? seconds : 0,
    timeLabel: formatDuration(seconds),
    up: dPrice >= 0,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** Reject near-zero rulers (click without drag). */
export function isMeaningfulMeasure(
  a: { time: number; price: number },
  b: { time: number; price: number },
  minPriceFrac = 1e-8,
): boolean {
  if (!Number.isFinite(a.price) || !Number.isFinite(b.price)) return false;
  if (!Number.isFinite(a.time) || !Number.isFinite(b.time)) return false;
  const dT = Math.abs(b.time - a.time);
  const dP = Math.abs(b.price - a.price);
  const scale = Math.max(Math.abs(a.price), Math.abs(b.price), 1e-12);
  return dT >= 1 || dP / scale >= minPriceFrac;
}

function finiteNum(n: unknown, fallback = 0): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim()) {
    const v = Number(n);
    if (Number.isFinite(v)) return v;
  }
  return fallback;
}

function sanitizePoint(raw: unknown): { time: number; price: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const time = finiteNum(o.time, NaN);
  const price = finiteNum(o.price, NaN);
  if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
  return { time, price };
}

export function sanitizeDrawing(raw: unknown, fallbackPair: PairId = "HMC_USDT"): Drawing | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const tool = typeof o.tool === "string" && DRAW_TOOLS.has(o.tool) ? (o.tool as DrawTool) : null;
  if (!tool || tool === "cursor") return null;
  const pairId =
    typeof o.pairId === "string" && PAIR_IDS.has(o.pairId) ? (o.pairId as PairId) : fallbackPair;
  const ptsRaw = Array.isArray(o.points) ? o.points.slice(0, 8) : [];
  const points: { time: number; price: number }[] = [];
  for (const p of ptsRaw) {
    const sp = sanitizePoint(p);
    if (sp) points.push(sp);
  }
  if (tool === "hline" || tool === "text") {
    if (!points.length) return null;
  } else if (points.length < 2) {
    return null;
  }
  const id =
    sanitizeDomId(typeof o.id === "string" ? o.id.trim().slice(0, 64) : "", "") ||
    `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const color = sanitizeCssColor(o.color, "#00e5ff");
  const text =
    tool === "text" && typeof o.text === "string"
      ? o.text
          .slice(0, 120)
          .replace(/[\u0000-\u001f]/g, "")
          .replace(/<[^>]*>/g, "")
          .replace(/[<>]/g, "")
      : undefined;
  return { id, pairId, tool, points, color, text };
}

export function sanitizeDrawings(raw: unknown, max = 200): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const item of raw.slice(0, max * 2)) {
    const d = sanitizeDrawing(item);
    if (d) out.push(d);
    if (out.length >= max) break;
  }
  return out;
}

/** Strip prototype-pollution keys from a shallow JSON object tree (import). */
export function stripPollutionKeys<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripPollutionKeys(v, depth + 1)) as T;
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = stripPollutionKeys(src[key], depth + 1);
  }
  return out as T;
}

export function escapeDrawingLabel(text: string | undefined): string {
  return escapeHtml(text ?? "—");
}

/** Pure delete helper — used by UI + tests to assert scroll cannot revive removed ids. */
export function removeDrawingById(drawings: Drawing[], id: string): Drawing[] {
  return drawings.filter((d) => d.id !== id);
}

export function drawingsForPair(drawings: Drawing[], pairId: PairId): Drawing[] {
  return drawings.filter((d) => d.pairId === pairId);
}

/**
 * Canonical source for canvas redraw after delete/clear.
 * Scroll/zoom must use this set (or liveDrawings synced from it), never a stale backup.
 */
export function resolvePaintDrawings(
  live: Drawing[],
  staleBackup: Drawing[] | null | undefined,
): Drawing[] {
  void staleBackup;
  return live;
}
