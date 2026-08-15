import type { BookLevel } from "./types";
import { formatNum, formatPrice } from "./market";

export function renderDepthSvg(bids: BookLevel[], asks: BookLevel[], width = 248, height = 72): string {
  return renderDepthSvgSized(bids, asks, width, height);
}

export function renderDepthSvgSized(bids: BookLevel[], asks: BookLevel[], width: number, height: number): string {
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const midX = w / 2 + pad;
  const bidTotal = bids.reduce((s, b) => s + b.amountBase, 0);
  const askTotal = asks.reduce((s, a) => s + a.amountBase, 0);
  const maxCum = Math.max(bidTotal, askTotal, 1);

  let bidCum = 0;
  const bidPts: string[] = [];
  for (let i = 0; i < bids.length; i++) {
    bidCum += bids[i].amountBase;
    const x = pad + (w / 2) * (1 - (i + 1) / bids.length);
    const y = pad + h - (bidCum / maxCum) * h * 0.95;
    bidPts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  if (bidPts.length) bidPts.push(`L${midX},${pad + h} L${pad},${pad + h} Z`);

  let askCum = 0;
  const askPts: string[] = [];
  for (let i = 0; i < asks.length; i++) {
    askCum += asks[i].amountBase;
    const x = midX + (w / 2) * ((i + 1) / asks.length);
    const y = pad + h - (askCum / maxCum) * h * 0.95;
    askPts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  if (askPts.length) askPts.push(`L${pad + w},${pad + h} L${midX},${pad + h} Z`);

  return `<svg class="depth-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <path class="depth-bid" d="${bidPts.join(" ")}" />
    <path class="depth-ask" d="${askPts.join(" ")}" />
    <line x1="${midX}" y1="${pad}" x2="${midX}" y2="${pad + h}" stroke="rgba(77,228,255,0.35)" stroke-width="1" stroke-dasharray="2 2" />
  </svg>`;
}

export function renderDepthPanel(
  bids: BookLevel[],
  asks: BookLevel[],
  base: string,
  quote: string,
  opts?: { labLive?: boolean },
): string {
  const labLive = !!opts?.labLive;
  if (!bids.length && !asks.length) {
    return `
  <div class="depth-panel depth-empty">
    <p class="empty-title">No depth</p>
    <p class="muted small">${labLive ? "Waiting for lab book depth…" : "Waiting for oracle mid to build the book."}</p>
  </div>`;
  }
  let bidCum = 0;
  let askCum = 0;
  const bidRows = bids.map((b) => {
    bidCum += b.amountBase;
    return { ...b, cum: bidCum };
  });
  const askRows = asks.map((a) => {
    askCum += a.amountBase;
    return { ...a, cum: askCum };
  });
  const maxCum = Math.max(bidCum, askCum, 1);
  const note = labLive
    ? `Cumulative market depth · ${base}/${quote} · lab matching L2`
    : `Cumulative market depth · ${base}/${quote} · demo liquidity from pool oracle`;

  return `
  <div class="depth-panel">
    <div class="depth-chart-lg">${renderDepthSvgSized(bids, asks, 480, 160)}</div>
    <div class="depth-tables">
      <div class="depth-side">
        <div class="depth-head"><span>Bids</span><span>Cum ${base}</span></div>
        ${bidRows
          .slice()
          .reverse()
          .map(
            (r) => `<div class="depth-row bid" data-book-price="${r.price}" data-book-side="bid" role="button">
              <div class="depth-bar" style="width:${(r.cum / maxCum) * 100}%"></div>
              <span>${formatPrice(r.price)}</span>
              <span>${formatNum(r.amountBase, 0)}</span>
              <span class="dim">${formatNum(r.cum, 0)}</span>
            </div>`,
          )
          .join("")}
      </div>
      <div class="depth-side">
        <div class="depth-head"><span>Asks</span><span>Cum ${base}</span></div>
        ${askRows
          .map(
            (r) => `<div class="depth-row ask" data-book-price="${r.price}" data-book-side="ask" role="button">
              <div class="depth-bar" style="width:${(r.cum / maxCum) * 100}%"></div>
              <span>${formatPrice(r.price)}</span>
              <span>${formatNum(r.amountBase, 0)}</span>
              <span class="dim">${formatNum(r.cum, 0)}</span>
            </div>`,
          )
          .join("")}
      </div>
    </div>
    <p class="muted small depth-note">${note}</p>
  </div>`;
}
