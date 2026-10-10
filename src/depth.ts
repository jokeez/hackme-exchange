import type { BookLevel } from "./types";
import { formatBookQty, formatNum, formatPrice } from "./market";

export type DepthStats = {
  bestBid: number;
  bestAsk: number;
  mid: number;
  spreadAbs: number;
  spreadPct: number;
  bidTotal: number;
  askTotal: number;
};

export function depthStats(bids: BookLevel[], asks: BookLevel[]): DepthStats {
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const crossed = bestBid > 0 && bestAsk > 0 && bestBid >= bestAsk;
  const mid =
    bestBid > 0 && bestAsk > 0 && !crossed
      ? (bestBid + bestAsk) / 2
      : bestBid || bestAsk || 0;
  const spreadAbs = bestBid > 0 && bestAsk > 0 && !crossed ? bestAsk - bestBid : 0;
  const spreadPct = mid > 0 && spreadAbs > 0 ? (spreadAbs / mid) * 100 : 0;
  return {
    bestBid,
    bestAsk,
    mid,
    spreadAbs,
    spreadPct,
    bidTotal: bids.reduce((s, b) => s + b.amountBase, 0),
    askTotal: asks.reduce((s, a) => s + a.amountBase, 0),
  };
}

/** Cumulative depth stepped area — x mapped by price distance from mid. */
export function renderDepthSvg(bids: BookLevel[], asks: BookLevel[], width = 248, height = 72): string {
  return renderDepthSvgSized(bids, asks, width, height);
}

export function renderDepthSvgSized(bids: BookLevel[], asks: BookLevel[], width: number, height: number): string {
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const stats = depthStats(bids, asks);
  const midX = w / 2 + pad;

  if (!(stats.mid > 0) || (!bids.length && !asks.length)) {
    return `<svg class="depth-svg depth-svg-empty" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
  }
  // Crossed L2: don't paint a nonsense V — mid label only.
  if (stats.bestBid > 0 && stats.bestAsk > 0 && stats.bestBid >= stats.bestAsk) {
    return `<svg class="depth-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Depth crossed">
      <line class="depth-mid-line" x1="${midX}" y1="${pad}" x2="${midX}" y2="${pad + h}" />
      <text class="depth-mid-label" x="${midX}" y="${pad + 10}" text-anchor="middle">${formatPrice(stats.mid)}</text>
    </svg>`;
  }

  const bidPrices = bids.map((b) => b.price);
  const askPrices = asks.map((a) => a.price);
  const minBid = bidPrices.length ? Math.min(...bidPrices) : stats.mid;
  const maxAsk = askPrices.length ? Math.max(...askPrices) : stats.mid;
  const leftSpan = Math.max(stats.mid - minBid, stats.spreadAbs * 2, stats.mid * 0.0005);
  const rightSpan = Math.max(maxAsk - stats.mid, stats.spreadAbs * 2, stats.mid * 0.0005);

  const xForBid = (price: number) => pad + ((stats.mid - price) / leftSpan) * (w / 2);
  const xForAsk = (price: number) => midX + ((price - stats.mid) / rightSpan) * (w / 2);
  const maxTot = Math.max(stats.bidTotal, stats.askTotal, 1);
  const yForCum = (cum: number) => pad + h - (cum / maxTot) * h * 0.92;

  // Stepped cumulative depth (CEX): horizontal → vertical at each level (not diagonal).
  let bidCum = 0;
  let bidY = pad + h;
  const bidPts: string[] = [`M${midX.toFixed(1)},${bidY.toFixed(1)}`];
  const sortedBids = [...bids].filter((b) => b.price < stats.mid || stats.spreadAbs === 0).sort((a, b) => b.price - a.price);
  for (const b of sortedBids) {
    if (!(b.amountBase > 0)) continue;
    bidCum += b.amountBase;
    const x = Math.max(pad, Math.min(midX, xForBid(b.price)));
    const y = yForCum(bidCum);
    bidPts.push(`L${x.toFixed(1)},${bidY.toFixed(1)}`);
    bidPts.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
    bidY = y;
  }
  if (bidPts.length > 1) {
    bidPts.push(`L${pad},${bidY.toFixed(1)} L${pad},${pad + h} L${midX.toFixed(1)},${pad + h} Z`);
  }

  let askCum = 0;
  let askY = pad + h;
  const askPts: string[] = [`M${midX.toFixed(1)},${askY.toFixed(1)}`];
  const sortedAsks = [...asks].filter((a) => a.price > stats.mid || stats.spreadAbs === 0).sort((a, b) => a.price - b.price);
  for (const a of sortedAsks) {
    if (!(a.amountBase > 0)) continue;
    askCum += a.amountBase;
    const x = Math.max(midX, Math.min(pad + w, xForAsk(a.price)));
    const y = yForCum(askCum);
    askPts.push(`L${x.toFixed(1)},${askY.toFixed(1)}`);
    askPts.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
    askY = y;
  }
  if (askPts.length > 1) {
    askPts.push(`L${(pad + w).toFixed(1)},${askY.toFixed(1)} L${(pad + w).toFixed(1)},${pad + h} L${midX.toFixed(1)},${pad + h} Z`);
  }

  const midLabelY = pad + 10;
  return `<svg class="depth-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Depth chart mid ${formatPrice(stats.mid)}">
    <path class="depth-bid" d="${bidPts.join(" ")}" />
    <path class="depth-ask" d="${askPts.join(" ")}" />
    <line class="depth-mid-line" x1="${midX}" y1="${pad}" x2="${midX}" y2="${pad + h}" />
    <text class="depth-mid-label" x="${midX}" y="${midLabelY}" text-anchor="middle">${formatPrice(stats.mid)}</text>
  </svg>`;
}

function depthHeader(stats: DepthStats, quote: string, labLive: boolean): string {
  const spread = stats.spreadAbs > 0 ? `${formatPrice(stats.spreadAbs)} (${formatNum(stats.spreadPct, 3)}%)` : "—";
  const src = labLive ? "Live L2" : "Oracle";
  const q = `<span class="notranslate" translate="no">${quote}</span>`;
  return `<div class="depth-summary" aria-label="Depth summary">
    <div class="depth-stat"><span class="dim">Bid</span><span class="ok mono notranslate" translate="no">${stats.bestBid > 0 ? formatPrice(stats.bestBid) : "—"}</span></div>
    <div class="depth-stat depth-stat-mid"><span class="dim">Mid · ${src}</span><span class="mono notranslate" translate="no">${stats.mid > 0 ? formatPrice(stats.mid) : "—"}</span></div>
    <div class="depth-stat"><span class="dim">Ask</span><span class="sell mono notranslate" translate="no">${stats.bestAsk > 0 ? formatPrice(stats.bestAsk) : "—"}</span></div>
    <div class="depth-stat depth-stat-spread"><span class="dim">Spread</span><span class="mono notranslate" translate="no">${spread} ${q}</span></div>
  </div>`;
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
    <p class="muted small">${labLive ? "Waiting for live desk depth…" : "Waiting for oracle mid to build the book."}</p>
  </div>`;
  }
  const stats = depthStats(bids, asks);
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
  const pairLit = `<span class="notranslate" translate="no">${base}/${quote}</span>`;
  const note = labLive
    ? `Cumulative market depth · ${pairLit} · Soft-MM / live L2`
    : `Cumulative market depth · ${pairLit} · demo liquidity from pool oracle`;

  return `
  <div class="depth-panel">
    ${depthHeader(stats, quote, labLive)}
    <div class="depth-chart-lg">${renderDepthSvgSized(bids, asks, 480, 160)}</div>
    <div class="depth-tables">
      <div class="depth-side">
        <div class="depth-head"><span>Bids</span><span>Cum <span class="notranslate" translate="no">${base}</span></span></div>
        ${bidRows
          .slice()
          .reverse()
          .map(
            (r) => `<div class="depth-row bid" data-book-price="${r.price}" data-book-side="bid" role="button" tabindex="0">
              <div class="depth-bar" style="width:${(r.cum / maxCum) * 100}%"></div>
              <span>${formatPrice(r.price)}</span>
              <span class="depth-amt">${formatBookQty(r.amountBase)}</span>
              <span class="dim">${formatNum(r.cum, 0)}</span>
            </div>`,
          )
          .join("")}
      </div>
      <div class="depth-side">
        <div class="depth-head"><span>Asks</span><span>Cum <span class="notranslate" translate="no">${base}</span></span></div>
        ${askRows
          .map(
            (r) => `<div class="depth-row ask" data-book-price="${r.price}" data-book-side="ask" role="button" tabindex="0">
              <div class="depth-bar" style="width:${(r.cum / maxCum) * 100}%"></div>
              <span>${formatPrice(r.price)}</span>
              <span class="depth-amt">${formatBookQty(r.amountBase)}</span>
              <span class="dim">${formatNum(r.cum, 0)}</span>
            </div>`,
          )
          .join("")}
      </div>
    </div>
    <p class="muted small depth-note">${note}</p>
  </div>`;
}
