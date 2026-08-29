import type { IChartApi, LogicalRange } from "lightweight-charts";

export type TimeSyncPane = {
  id: string;
  chart: IChartApi;
  barCount: () => number;
};

const panes = new Map<string, TimeSyncPane>();
const unbinders = new Map<string, () => void>();
let syncing = false;
let enabled = true;
let syncRaf = 0;
let pendingFrom: string | null = null;
let lastSync: { span: number; barSpacing: number } | null = null;

export function getTimeSyncDebug(): {
  enabled: boolean;
  paneCount: number;
  lastSync: { span: number; barSpacing: number } | null;
} {
  return { enabled, paneCount: panes.size, lastSync };
}

/** Right-aligned logical window for multi-pane sync (works across pairs / TFs). */
export function computeSyncedLogicalRange(
  source: { barCount: number; from: number; to: number },
  targetBarCount: number,
): LogicalRange | null {
  if (source.barCount < 2 || targetBarCount < 2) return null;
  const span = source.to - source.from;
  if (!Number.isFinite(span) || span < 1) return null;
  const sourceMaxTo = source.barCount - 1 + 2;
  const rightPad = sourceMaxTo - source.to;
  const targetMaxTo = targetBarCount - 1 + 2;
  let to = targetMaxTo - rightPad;
  let from = to - span;
  if (from < -1) {
    to += -1 - from;
    from = -1;
  }
  if (to > targetMaxTo) to = targetMaxTo;
  if (!(to > from)) return null;
  return { from: from as LogicalRange["from"], to: to as LogicalRange["to"] };
}

export function setTimeSyncEnabled(on: boolean): void {
  enabled = on;
}

export function registerTimeSyncPane(pane: TimeSyncPane): () => void {
  panes.set(pane.id, pane);
  bindPane(pane);
  return () => {
    unbindPane(pane.id);
    panes.delete(pane.id);
  };
}

export function clearTimeSyncRegistry(): void {
  if (syncRaf) {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(syncRaf);
    else clearTimeout(syncRaf);
    syncRaf = 0;
  }
  pendingFrom = null;
  for (const id of [...panes.keys()]) unbindPane(id);
  panes.clear();
}

/** Called after wheel zoom changes barSpacing (logical range may stay unchanged). */
export function bumpTimeSyncPane(fromId: string): void {
  if (!enabled || syncing || !panes.has(fromId)) return;
  schedulePropagate(fromId);
}

function schedulePropagate(fromId: string): void {
  pendingFrom = fromId;
  if (syncRaf) return;
  const schedule =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn: () => void) => setTimeout(fn, 0) as unknown as number;
  syncRaf = schedule(() => {
    syncRaf = 0;
    const id = pendingFrom;
    pendingFrom = null;
    if (id) propagate(id);
  });
}

function bindPane(pane: TimeSyncPane): void {
  unbindPane(pane.id);
  const ts = pane.chart.timeScale();
  if (typeof ts.subscribeVisibleLogicalRangeChange !== "function") return;
  const handler = (_range: LogicalRange | null) => {
    if (!enabled || syncing) return;
    schedulePropagate(pane.id);
  };
  ts.subscribeVisibleLogicalRangeChange(handler);
  unbinders.set(pane.id, () => {
    try {
      ts.unsubscribeVisibleLogicalRangeChange(handler);
    } catch {
      /* ignore */
    }
  });
}

function unbindPane(id: string): void {
  unbinders.get(id)?.();
  unbinders.delete(id);
}

function propagate(fromId: string): void {
  const source = panes.get(fromId);
  if (!source) return;
  const ts = source.chart.timeScale();
  const lr = ts.getVisibleLogicalRange();
  if (!lr) return;
  const spacing = ts.options().barSpacing ?? 8;
  const sourceN = source.barCount();
  if (sourceN < 2) return;

  syncing = true;
  try {
    for (const [id, pane] of panes) {
      if (id === fromId) continue;
      const n = pane.barCount();
      const synced = computeSyncedLogicalRange(
        { barCount: sourceN, from: lr.from as number, to: lr.to as number },
        n,
      );
      if (!synced) continue;
      try {
        const pts = pane.chart.timeScale();
        pts.applyOptions({ barSpacing: spacing, minBarSpacing: 2 });
        pts.setVisibleLogicalRange(synced);
      } catch {
        /* ignore */
      }
    }
    lastSync = { span: (lr.to as number) - (lr.from as number), barSpacing: spacing };
  } finally {
    syncing = false;
  }
}
