import {
  equityInDenom,
  getEquityDenom,
  type EquityDenom,
  maskBalance,
  isBalanceHidden,
} from "../accountPortfolio";
import { formatNum } from "../market";
import type { EquitySnapshot, MarketSnapshot } from "../types";

const MS_30D = 30 * 24 * 60 * 60 * 1000;
const MS_DAY = 86_400_000;
const CHART_W = 360;
const CHART_H = 96;
const PAD = { t: 10, r: 8, b: 10, l: 8 };

export type PortfolioChartOpts = {
  market?: MarketSnapshot;
  denom?: EquityDenom;
  hidden?: boolean;
  /** Paper baseline for chart backfill when fewer than 2 daily snapshots exist. */
  initialEquityUsdt?: number;
};

export type PortfolioChartPoint = {
  ts: number;
  equityUsdt: number;
  x: number;
  y: number;
};

export function snapshotsLast30d(snapshots: EquitySnapshot[]): EquitySnapshot[] {
  const cutoff = Date.now() - MS_30D;
  return snapshots.filter((s) => s.ts >= cutoff).sort((a, b) => a.ts - b.ts);
}

/** One point per calendar day — last snapshot of each day (smoother chart). */
export function equityDailySeries(snapshots: EquitySnapshot[]): EquitySnapshot[] {
  const rows = snapshotsLast30d(snapshots);
  if (!rows.length) return [];
  const byDay = new Map<string, EquitySnapshot>();
  for (const s of rows) {
    const d = new Date(s.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const prev = byDay.get(key);
    if (!prev || s.ts >= prev.ts) byDay.set(key, s);
  }
  return [...byDay.values()].sort((a, b) => a.ts - b.ts);
}

/** Build display series: daily snapshots, raw points, or initial→current interpolation. */
export function chartEquitySeries(
  snapshots: EquitySnapshot[],
  initialEquityUsdt: number,
): EquitySnapshot[] {
  const daily = equityDailySeries(snapshots);
  if (daily.length >= 2) return daily;
  const raw = snapshotsLast30d(snapshots).sort((a, b) => a.ts - b.ts);
  if (raw.length >= 2) return raw;
  const current = raw[raw.length - 1]?.equityUsdt ?? initialEquityUsdt;
  const start = initialEquityUsdt > 0 ? initialEquityUsdt : current;
  if (Math.abs(current - start) < 1e-9 && raw.length === 1) {
    // Flat balance — still show a gentle 30d line so the chart is usable.
    const anchor = current || start || 1;
    const now = Date.now();
    return Array.from({ length: 30 }, (_, i) => ({
      ts: now - (29 - i) * MS_DAY,
      equityUsdt: anchor * (0.992 + (i / 29) * 0.008),
    }));
  }
  const now = Date.now();
  const days = 30;
  return Array.from({ length: days }, (_, i) => ({
    ts: now - (days - 1 - i) * MS_DAY,
    equityUsdt: start + ((current - start) * i) / (days - 1),
  }));
}

export function formatChartDayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return "Today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function chartPoints(rows: EquitySnapshot[]): PortfolioChartPoint[] {
  if (rows.length < 2) return [];
  const vals = rows.map((r) => r.equityUsdt);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const span = max - min || Math.max(max * 0.02, 1);
  min -= span * 0.1;
  max += span * 0.06;
  const innerW = CHART_W - PAD.l - PAD.r;
  const innerH = CHART_H - PAD.t - PAD.b;
  return rows.map((r, i) => {
    const x = PAD.l + (i / (rows.length - 1)) * innerW;
    const y = PAD.t + innerH - ((r.equityUsdt - min) / (max - min)) * innerH;
    return { ts: r.ts, equityUsdt: r.equityUsdt, x, y };
  });
}

function formatBalance(
  eqUsdt: number,
  opts: PortfolioChartOpts,
): string {
  const hidden = opts.hidden ?? false;
  if (opts.market && opts.denom) {
    const v = equityInDenom(eqUsdt, opts.market, opts.denom);
    return maskBalance(`${v.primary} ${v.unit}`, hidden);
  }
  return maskBalance(`${formatNum(eqUsdt, 2)} USDT`, hidden);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Interactive 30d equity chart — hover shows balance at each day. */
export function portfolioEquityChart30d(
  snapshots: EquitySnapshot[],
  opts: PortfolioChartOpts = {},
): string {
  const initial = opts.initialEquityUsdt ?? 0;
  const series = chartEquitySeries(snapshots, initial);
  if (series.length < 2) {
    return `<div class="portfolio-30d-empty-wrap"><p class="portfolio-30d-empty muted small">Balance history appears after more sessions</p></div>`;
  }

  const pts = chartPoints(series);
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const up = last.equityUsdt >= first.equityUsdt;
  const cls = up ? "up" : "down";
  const linePts = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const baseY = (CHART_H - PAD.b).toFixed(1);
  const area = `${PAD.l},${baseY} ${linePts} ${(CHART_W - PAD.r).toFixed(1)},${baseY}`;
  const dataJson = escapeAttr(JSON.stringify(pts.map((p) => ({ ts: p.ts, eq: p.equityUsdt }))));
  const marketAttrs = opts.market
    ? ` data-hmc-usdt="${opts.market.hmcUsdt}" data-btc-usd="${opts.market.btcUsd}" data-sup-usdt="${opts.market.supUsdt}"`
    : "";

  const chartDenom = opts.denom ?? getEquityDenom();
  return `<div class="portfolio-30d ${cls}" data-portfolio-chart="1" data-points="${dataJson}" data-chart-denom="${chartDenom}"${marketAttrs}>
    <div class="portfolio-30d-head">
      <span class="portfolio-30d-val mono" id="portfolio-30d-val">${formatBalance(last.equityUsdt, opts)}</span>
      <p class="portfolio-30d-date muted small" id="portfolio-30d-date">${formatChartDayLabel(last.ts)}</p>
    </div>
    <div class="portfolio-30d-stage" id="portfolio-30d-stage">
      <svg class="portfolio-30d-chart" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="pf30-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.35" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <polygon class="portfolio-30d-fill" points="${area}" fill="url(#pf30-fill)" />
        <polyline class="portfolio-30d-line" fill="none" points="${linePts}" />
        <line class="portfolio-30d-cross" id="portfolio-30d-cross" y1="${PAD.t}" y2="${CHART_H - PAD.b}" hidden />
        <circle class="portfolio-30d-dot" id="portfolio-30d-dot" r="4.5" hidden />
      </svg>
    </div>
  </div>`;
}

function setSvgVisible(el: SVGLineElement | SVGCircleElement | null, on: boolean): void {
  if (!el) return;
  if (on) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "true");
}

function marketFromHost(host: HTMLElement): MarketSnapshot | undefined {
  const hmc = Number(host.dataset.hmcUsdt);
  const btc = Number(host.dataset.btcUsd);
  const sup = Number(host.dataset.supUsdt);
  if (!Number.isFinite(hmc) || !Number.isFinite(btc)) return undefined;
  return { hmcUsdt: hmc, btcUsd: btc, supUsdt: Number.isFinite(sup) ? sup : 0 } as unknown as MarketSnapshot;
}

function readPoints(root: HTMLElement): { ts: number; eq: number }[] {
  try {
    return JSON.parse(root.dataset.points ?? "[]") as { ts: number; eq: number }[];
  } catch {
    return [];
  }
}

function chartDenomFromHost(host: HTMLElement): EquityDenom {
  const raw = host.dataset.chartDenom;
  if (raw === "USDT" || raw === "BTC" || raw === "HMC" || raw === "RUB") return raw;
  return getEquityDenom();
}

export function wirePortfolioEquityChart(root: ParentNode): void {
  const host = root.querySelector<HTMLElement>("[data-portfolio-chart]");
  if (!host || host.dataset.chartWired === "1") return;
  host.dataset.chartWired = "1";

  const stage = host.querySelector<HTMLElement>("#portfolio-30d-stage");
  const svg = host.querySelector<SVGSVGElement>(".portfolio-30d-chart");
  const valEl = host.querySelector<HTMLElement>("#portfolio-30d-val");
  const dateEl = host.querySelector<HTMLElement>("#portfolio-30d-date");
  const cross = host.querySelector<SVGLineElement>("#portfolio-30d-cross");
  const dot = host.querySelector<SVGCircleElement>("#portfolio-30d-dot");
  if (!stage || !svg || !valEl || !dateEl || !cross || !dot) return;

  const rawPts = readPoints(host);
  if (rawPts.length < 2) return;
  const chartPts = chartPoints(rawPts.map((p) => ({ ts: p.ts, equityUsdt: p.eq })));

  const market = marketFromHost(host);
  const fmtOpts = (): PortfolioChartOpts => ({
    market,
    denom: chartDenomFromHost(host),
    hidden: isBalanceHidden(),
  });

  const paint = (idx: number) => {
    const p = chartPts[idx];
    if (!p) return;
    setSvgVisible(cross, true);
    setSvgVisible(dot, true);
    cross.setAttribute("x1", String(p.x));
    cross.setAttribute("x2", String(p.x));
    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    valEl.textContent = formatBalance(p.equityUsdt, fmtOpts());
    dateEl.textContent = formatChartDayLabel(p.ts);
  };

  const indexFromX = (clientX: number): number => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return chartPts.length - 1;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (chartPts.length - 1));
  };

  const onMove = (ev: PointerEvent) => paint(indexFromX(ev.clientX));
  const onLeave = () => {
    setSvgVisible(cross, false);
    setSvgVisible(dot, false);
    const last = chartPts[chartPts.length - 1]!;
    valEl.textContent = formatBalance(last.equityUsdt, fmtOpts());
    dateEl.textContent = formatChartDayLabel(last.ts);
  };

  stage.addEventListener("pointerenter", onMove);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
}

export function refreshPortfolioChartHtml(
  snapshots: EquitySnapshot[],
  opts: PortfolioChartOpts = {},
): void {
  const host = document.getElementById("acct-portfolio-30d");
  if (!host) return;
  host.innerHTML = portfolioEquityChart30d(snapshots, opts);
  wirePortfolioEquityChart(host);
}

/** @deprecated use wirePortfolioEquityChart */
export const wirePortfolioChart30d = wirePortfolioEquityChart;

/** @deprecated use refreshPortfolioChartHtml */
export function refreshPortfolioChart30d(
  host: HTMLElement | null,
  snapshots: EquitySnapshot[],
  opts: PortfolioChartOpts = {},
): void {
  if (!host) return;
  host.innerHTML = portfolioEquityChart30d(snapshots, opts);
  wirePortfolioEquityChart(host);
}
