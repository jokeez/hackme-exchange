import type { IChartApi, Time } from "lightweight-charts";

export type TimeSyncPane = {
  id: string;
  chart: IChartApi;
};

const panes = new Map<string, TimeSyncPane>();
const unbinders = new Map<string, () => void>();
let syncing = false;
let enabled = true;

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
  for (const id of [...panes.keys()]) unbindPane(id);
  panes.clear();
}

function bindPane(pane: TimeSyncPane): void {
  unbindPane(pane.id);
  const ts = pane.chart.timeScale();
  if (typeof ts.subscribeVisibleTimeRangeChange !== "function") return;
  const handler = (range: { from: Time; to: Time } | null) => {
    if (!enabled || syncing || !range) return;
    propagate(pane.id, range);
  };
  ts.subscribeVisibleTimeRangeChange(handler);
  unbinders.set(pane.id, () => {
    try {
      ts.unsubscribeVisibleTimeRangeChange(handler);
    } catch {
      /* ignore */
    }
  });
}

function unbindPane(id: string): void {
  unbinders.get(id)?.();
  unbinders.delete(id);
}

function propagate(fromId: string, range: { from: Time; to: Time }): void {
  syncing = true;
  try {
    for (const [id, pane] of panes) {
      if (id === fromId) continue;
      try {
        pane.chart.timeScale().setVisibleRange(range);
      } catch {
        /* ignore */
      }
    }
  } finally {
    syncing = false;
  }
}
