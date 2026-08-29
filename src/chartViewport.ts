const PREFIX = "hackme-ex-chart-vp-v1:";

export type ChartViewportState = {
  barSpacing: number;
  from: number;
  to: number;
};

export function chartViewportKey(pairId: string, tf: string): string {
  return `${PREFIX}${pairId}:${tf}`;
}

export function loadChartViewport(pairId: string, tf: string): ChartViewportState | null {
  try {
    const raw = sessionStorage.getItem(chartViewportKey(pairId, tf));
    if (!raw) return null;
    const v = JSON.parse(raw) as ChartViewportState;
    if (!Number.isFinite(v.barSpacing) || v.barSpacing <= 0) return null;
    if (!Number.isFinite(v.from) || !Number.isFinite(v.to)) return null;
    if (v.to <= v.from) return null;
    return v;
  } catch {
    return null;
  }
}

export function saveChartViewport(pairId: string, tf: string, vp: ChartViewportState): void {
  try {
    sessionStorage.setItem(chartViewportKey(pairId, tf), JSON.stringify(vp));
  } catch {
    /* ignore */
  }
}

export function clearChartViewport(pairId: string, tf: string): void {
  try {
    sessionStorage.removeItem(chartViewportKey(pairId, tf));
  } catch {
    /* ignore */
  }
}
