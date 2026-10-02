import {
  equityInDenom,
  formatFloatingPnlDisplay,
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
const CHART_H = 108;
const PAD = { t: 14, r: 52, b: 18, l: 8 };

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

/**
 * Build display series from real snapshots only.
 * Never invent a decorative +0.3% ramp — that desynced % vs USDT footer.
 */
export function chartEquitySeries(
  snapshots: EquitySnapshot[],
  initialEquityUsdt: number,
): EquitySnapshot[] {
  const daily = equityDailySeries(snapshots);
  // Drop empty-connect zeros that squash the y-axis against a real balance.
  const scrub = (rows: EquitySnapshot[]): EquitySnapshot[] => {
    const last = rows[rows.length - 1]?.equityUsdt ?? 0;
    if (!(last > 0)) return rows;
    const kept = rows.filter((r) => r.equityUsdt > last * 0.02);
    return kept.length >= 2 ? kept : rows.filter((r) => r.equityUsdt > 0);
  };
  if (daily.length >= 2) return scrub(daily);
  const raw = scrub(snapshotsLast30d(snapshots).sort((a, b) => a.ts - b.ts));
  if (raw.length >= 2) return raw;
  const current = raw[raw.length - 1]?.equityUsdt ?? initialEquityUsdt;
  const start = initialEquityUsdt > 0 ? initialEquityUsdt : current;
  const now = Date.now();
  if (!(current > 0) && !(start > 0)) return [];
  // Honest flat (or real start→current) — two points only, no synthetic 30d noise.
  if (Math.abs(current - start) < 1e-9) {
    const anchor = current || start;
    return [
      { ts: now - MS_DAY, equityUsdt: anchor },
      { ts: now, equityUsdt: anchor },
    ];
  }
  return [
    { ts: now - MS_DAY, equityUsdt: start },
    { ts: now, equityUsdt: current },
  ];
}

/** Footer delta — keep micro USDT moves visible (matches asset floating PnL). */
export function formatChartDeltaUsdt(chgAbs: number, hidden = false): string {
  const full = formatFloatingPnlDisplay(chgAbs, 0);
  const absPart = full.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const withUnit = /USDT|BTC|HMC|RUB/i.test(absPart) ? absPart : `${absPart} USDT`;
  return maskBalance(withUnit, hidden);
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
  const span = max - min || Math.max(Math.abs(max) * 0.02, 0.01);
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
  const uid = `pf30-${Math.abs(series.length * 31 + Math.round(last.equityUsdt * 1e6)) % 99999}`;
  const innerH = CHART_H - PAD.t - PAD.b;
  const vals = series.map((s) => s.equityUsdt);
  const minEq = Math.min(...vals);
  const maxEq = Math.max(...vals);
  const chgPct = first.equityUsdt > 0 ? ((last.equityUsdt - first.equityUsdt) / first.equityUsdt) * 100 : 0;
  const chgAbs = last.equityUsdt - first.equityUsdt;
  const chgSign = chgPct >= 0 ? "+" : "";
  const chgCls = chgPct >= 0 ? "up" : "down";
  const gridLines = [0, 0.5, 1]
    .map((r) => {
      const y = (PAD.t + innerH * (1 - r)).toFixed(1);
      return `<line class="portfolio-30d-grid-line" x1="${PAD.l}" x2="${CHART_W - PAD.r}" y1="${y}" y2="${y}" />`;
    })
    .join("");
  const maxLabel = formatBalance(maxEq, { ...opts, hidden: opts.hidden });
  const minLabel = formatBalance(minEq, { ...opts, hidden: opts.hidden });
  const showMinY = minLabel !== maxLabel;
  const flatSeries = Math.abs(chgAbs) < 1e-9;
  const rangeLabel = flatSeries
    ? "session"
    : formatChartDayLabel(first.ts) === formatChartDayLabel(last.ts)
      ? "Today"
      : `${formatChartDayLabel(first.ts)}→now`;
  const nowLabel = formatBalance(last.equityUsdt, opts);
  const deltaLabel = formatChartDeltaUsdt(chgAbs, opts.hidden);

  return `<div class="portfolio-30d ${cls}" data-portfolio-chart="1" data-points="${dataJson}" data-chart-denom="${chartDenom}"${marketAttrs}>
    <div class="portfolio-30d-head">
      <div class="portfolio-30d-head-main">
        <span class="portfolio-30d-val mono" id="portfolio-30d-val">${nowLabel}</span>
        <span class="portfolio-30d-chg mono ${chgCls}" id="portfolio-30d-chg">${chgSign}${formatNum(chgPct, 2)}%</span>
      </div>
      <p class="portfolio-30d-date muted small" id="portfolio-30d-date">${formatChartDayLabel(last.ts)} · ${rangeLabel}</p>
    </div>
    <div class="portfolio-30d-stage" id="portfolio-30d-stage">
      <svg class="portfolio-30d-chart" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Equity ${nowLabel}">
        <defs>
          <linearGradient id="${uid}-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.42" />
            <stop offset="55%" stop-color="currentColor" stop-opacity="0.14" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="${uid}-stroke" gradientUnits="userSpaceOnUse" x1="${PAD.l}" y1="0" x2="${CHART_W - PAD.r}" y2="0">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.45" />
            <stop offset="35%" stop-color="currentColor" stop-opacity="0.88" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="1" />
          </linearGradient>
          <filter id="${uid}-glow" x="-12%" y="-20%" width="124%" height="140%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="${uid}-dot" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g class="portfolio-30d-grid">${gridLines}</g>
        <line class="portfolio-30d-baseline" x1="${PAD.l}" x2="${CHART_W - PAD.r}" y1="${baseY}" y2="${baseY}" />
        <polygon class="portfolio-30d-fill" points="${area}" fill="url(#${uid}-fill)" />
        <polyline class="portfolio-30d-line-glow" fill="none" points="${linePts}" filter="url(#${uid}-glow)" />
        <polyline class="portfolio-30d-line" fill="none" points="${linePts}" stroke="url(#${uid}-stroke)" />
        <text class="portfolio-30d-ylabel" x="${CHART_W - 4}" y="${PAD.t + 2}" text-anchor="end" dominant-baseline="hanging">${escapeAttr(maxLabel)}</text>
        ${showMinY ? `<text class="portfolio-30d-ylabel muted" x="${CHART_W - 4}" y="${CHART_H - PAD.b - 2}" text-anchor="end" dominant-baseline="auto">${escapeAttr(minLabel)}</text>` : ""}
        <circle class="portfolio-30d-end-ring" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="6.5" />
        <circle class="portfolio-30d-end" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.2" filter="url(#${uid}-dot)" />
        <line class="portfolio-30d-cross" id="portfolio-30d-cross" y1="${PAD.t}" y2="${CHART_H - PAD.b}" hidden />
        <circle class="portfolio-30d-dot-ring" id="portfolio-30d-dot-ring" r="7.5" hidden />
        <circle class="portfolio-30d-dot" id="portfolio-30d-dot" r="4" filter="url(#${uid}-dot)" hidden />
      </svg>
    </div>
    <div class="portfolio-30d-foot muted small">
      <span id="portfolio-30d-delta">${deltaLabel} · ${flatSeries ? "flat" : "vs start"}</span>
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
  const chgEl = host.querySelector<HTMLElement>("#portfolio-30d-chg");
  const deltaEl = host.querySelector<HTMLElement>("#portfolio-30d-delta");
  const cross = host.querySelector<SVGLineElement>("#portfolio-30d-cross");
  const dotRing = host.querySelector<SVGCircleElement>("#portfolio-30d-dot-ring");
  const dot = host.querySelector<SVGCircleElement>("#portfolio-30d-dot");
  if (!stage || !svg || !valEl || !dateEl || !cross || !dotRing || !dot) return;

  const rawPts = readPoints(host);
  if (rawPts.length < 2) return;
  const chartPts = chartPoints(rawPts.map((p) => ({ ts: p.ts, equityUsdt: p.eq })));
  const first = chartPts[0]!;
  const lastPt = chartPts[chartPts.length - 1]!;
  const flatSeries = Math.abs(lastPt.equityUsdt - first.equityUsdt) < 1e-9;
  const rangeLabel = flatSeries
    ? "session"
    : formatChartDayLabel(first.ts) === formatChartDayLabel(lastPt.ts)
      ? "Today"
      : `${formatChartDayLabel(first.ts)}→now`;
  const x0 = first.x;
  const x1 = lastPt.x;
  const xSpan = Math.max(x1 - x0, 1e-9);

  const market = marketFromHost(host);
  const fmtOpts = (): PortfolioChartOpts => ({
    market,
    denom: chartDenomFromHost(host),
    hidden: isBalanceHidden(),
  });

  const paint = (idx: number, hovering: boolean) => {
    const p = chartPts[idx];
    if (!p) return;
    setSvgVisible(cross, hovering);
    setSvgVisible(dotRing, hovering);
    setSvgVisible(dot, hovering);
    if (hovering) {
      cross.setAttribute("x1", String(p.x));
      cross.setAttribute("x2", String(p.x));
      dotRing.setAttribute("cx", String(p.x));
      dotRing.setAttribute("cy", String(p.y));
      dot.setAttribute("cx", String(p.x));
      dot.setAttribute("cy", String(p.y));
    }
    valEl.textContent = formatBalance(p.equityUsdt, fmtOpts());
    dateEl.textContent = hovering
      ? `${formatChartDayLabel(p.ts)} · equity`
      : `${formatChartDayLabel(lastPt.ts)} · ${rangeLabel}`;
    const chgPct = first.equityUsdt > 0 ? ((p.equityUsdt - first.equityUsdt) / first.equityUsdt) * 100 : 0;
    const chgAbs = p.equityUsdt - first.equityUsdt;
    const chgSign = chgPct >= 0 ? "+" : "";
    if (chgEl) {
      chgEl.textContent = `${chgSign}${formatNum(chgPct, 2)}%`;
      chgEl.classList.toggle("up", chgPct >= 0);
      chgEl.classList.toggle("down", chgPct < 0);
    }
    if (deltaEl) {
      deltaEl.textContent = `${formatChartDeltaUsdt(chgAbs, isBalanceHidden())} · ${
        hovering ? "vs start" : flatSeries ? "flat" : "vs start"
      }`;
    }
  };

  /** Map pointer to series index using plot polyline span (not full SVG incl. y-labels pad). */
  const indexFromX = (clientX: number): number => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return chartPts.length - 1;
    const svgX = ((clientX - rect.left) / rect.width) * CHART_W;
    const ratio = Math.max(0, Math.min(1, (svgX - x0) / xSpan));
    return Math.round(ratio * (chartPts.length - 1));
  };

  const onMove = (ev: PointerEvent) => paint(indexFromX(ev.clientX), true);
  const onLeave = () => paint(chartPts.length - 1, false);

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
