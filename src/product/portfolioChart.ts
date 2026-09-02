import type { EquitySnapshot } from "../types";
import { formatNum } from "../market";

const MS_30D = 30 * 24 * 60 * 60 * 1000;

export function snapshotsLast30d(snapshots: EquitySnapshot[]): EquitySnapshot[] {
  const cutoff = Date.now() - MS_30D;
  return snapshots.filter((s) => s.ts >= cutoff).sort((a, b) => a.ts - b.ts);
}

/** Mini area chart for 30d equity (USDT). */
export function portfolioEquityChart30d(snapshots: EquitySnapshot[], width = 320, height = 72): string {
  const rows = snapshotsLast30d(snapshots);
  if (rows.length < 2) {
    return `<div class="portfolio-30d-empty muted small">30d chart unlocks after more equity snapshots</div>`;
  }
  const vals = rows.map((r) => r.equityUsdt);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const pts = vals
    .map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * innerW;
      const y = pad + innerH - ((v - min) / span) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${pad},${pad + innerH} ${pts} ${pad + innerW},${pad + innerH}`;
  const delta = vals[vals.length - 1]! - vals[0]!;
  const pct = vals[0]! !== 0 ? (delta / vals[0]!) * 100 : 0;
  const cls = delta >= 0 ? "up" : "down";
  return `<div class="portfolio-30d">
    <div class="portfolio-30d-head">
      <span class="muted small">30d equity</span>
      <span class="mono ${cls}">${delta >= 0 ? "+" : ""}${formatNum(delta, 2)} USDT (${formatNum(pct, 2)}%)</span>
    </div>
    <svg class="portfolio-30d-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
      <polygon class="portfolio-30d-fill" points="${area}" />
      <polyline class="portfolio-30d-line" fill="none" points="${pts}" />
    </svg>
  </div>`;
}
