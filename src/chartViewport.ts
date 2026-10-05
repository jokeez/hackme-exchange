const PREFIX = "hackme-ex-chart-vp-v2:";

export type ChartViewportState = {
  barSpacing: number;
  from: number;
  to: number;
  /** Candle count when saved — restore tip-relative after F5 / history growth. */
  seriesLen?: number;
  /** True when the live tip was inside (or near) the visible window. */
  followLive?: boolean;
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

/** True when the saved window was glued to (or past) the live tip. */
export function viewportFollowsLive(vp: ChartViewportState): boolean {
  if (vp.followLive === true) return true;
  if (vp.followLive === false) return false;
  const tip = (vp.seriesLen != null && vp.seriesLen > 0 ? vp.seriesLen : Math.ceil(vp.to)) - 1;
  return vp.to >= tip - 1.5;
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
