import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { nearestCandle } from "./chartCandleIndex";
import type { Candle } from "./types";

export type CrosshairPane = {
  id: string;
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  candles: () => Candle[];
};

const panes = new Map<string, CrosshairPane>();
let syncing = false;
let enabled = true;
let lastSyncedTime: number | null = null;

export function getCrosshairSyncDebug(): { enabled: boolean; paneCount: number; lastSyncedTime: number | null } {
  return { enabled, paneCount: panes.size, lastSyncedTime };
}

export function setCrosshairSyncEnabled(on: boolean): void {
  enabled = on;
  if (!on) clearAllCrosshairs();
}

export function registerCrosshairPane(pane: CrosshairPane): () => void {
  panes.set(pane.id, pane);
  bindPane(pane);
  return () => {
    panes.delete(pane.id);
  };
}

export function clearCrosshairRegistry(): void {
  for (const pane of panes.values()) {
    try {
      pane.chart.unsubscribeCrosshairMove(paneMoveHandlers.get(pane.id)!);
    } catch {
      /* ignore */
    }
  }
  panes.clear();
  paneMoveHandlers.clear();
}

const paneMoveHandlers = new Map<string, (param: { time?: unknown; point?: { x: number; y: number } }) => void>();

function priceAtTime(pane: CrosshairPane, time: number): number | null {
  const bar = nearestCandle(pane.candles(), time);
  const p = bar?.close;
  return p != null && Number.isFinite(p) && p > 0 ? p : null;
}

function clearAllCrosshairs(): void {
  for (const pane of panes.values()) {
    try {
      pane.chart.clearCrosshairPosition();
    } catch {
      /* ignore */
    }
  }
}

function propagate(fromId: string, time: number | null, price: number | null): void {
  if (!enabled || syncing) return;
  if (time == null) {
    if (lastSyncedTime == null) return;
  } else if (time === lastSyncedTime) {
    // Same bar — siblings already show this crosshair; skip O(panes) LWC writes.
    return;
  }
  syncing = true;
  try {
    if (time == null) {
      lastSyncedTime = null;
      clearAllCrosshairs();
      return;
    }
    lastSyncedTime = time;
    for (const [id, pane] of panes) {
      if (id === fromId) continue;
      const p = price != null && Number.isFinite(price) ? price : priceAtTime(pane, time);
      if (p == null) {
        try {
          pane.chart.clearCrosshairPosition();
        } catch {
          /* ignore */
        }
        continue;
      }
      try {
        pane.chart.setCrosshairPosition(p, time as UTCTimestamp, pane.series);
      } catch {
        /* ignore */
      }
    }
  } finally {
    syncing = false;
  }
}

function bindPane(pane: CrosshairPane): void {
  const prev = paneMoveHandlers.get(pane.id);
  if (prev) {
    try {
      pane.chart.unsubscribeCrosshairMove(prev);
    } catch {
      /* ignore */
    }
  }
  let syncRaf = 0;
  let pending: { time: number | null; price: number | null } | null = null;
  const flush = () => {
    syncRaf = 0;
    const p = pending;
    pending = null;
    if (!p) return;
    if (p.time == null) {
      propagate(pane.id, null, null);
      return;
    }
    if (p.time === lastSyncedTime) return;
    // Prefer free mouse Y price over bar.close so siblings don't Magnet-snap.
    const price = p.price ?? priceAtTime(pane, p.time);
    propagate(pane.id, p.time, price);
  };
  const handler = (param: { time?: unknown; point?: { x: number; y: number } }) => {
    if (syncing || !enabled) return;
    const t = (param.time as number | undefined) ?? null;
    if (t != null && t === lastSyncedTime) return;
    let price: number | null = null;
    if (param.point && Number.isFinite(param.point.y)) {
      try {
        const pr = pane.series.coordinateToPrice(param.point.y);
        if (pr != null && Number.isFinite(pr) && pr > 0) price = pr as number;
      } catch {
        /* ignore */
      }
    }
    pending = { time: t, price };
    if (!syncRaf) syncRaf = requestAnimationFrame(flush);
  };
  paneMoveHandlers.set(pane.id, handler);
  pane.chart.subscribeCrosshairMove(handler);
}
