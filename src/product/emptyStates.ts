import { escapeHtml } from "../sanitize";

export type EmptySpotContext = "orders" | "positions" | "history" | "alerts";

export function renderSpotEmptyState(ctx: EmptySpotContext): string {
  const map: Record<EmptySpotContext, { title: string; body: string; cta?: string; href?: string }> = {
    orders: {
      title: "No open orders",
      body: "Paper desk — place a limit (rests on the book) or market (fills now). Open orders show here.",
      cta: "Focus order form",
      href: "#spot",
    },
    positions: {
      title: "No positions yet",
      body: "Spot fills update paper balances instantly. Track equity on Account.",
      cta: "View Account",
      href: "#account",
    },
    history: {
      title: "No fills yet",
      body: "After your first paper fill, history and CSV export appear here.",
    },
    alerts: {
      title: "No price alerts",
      body: "Right-click the chart (or Alert at mid) to arm a paper price alert.",
      cta: "Alert at mid",
    },
  };
  const m = map[ctx];
  const cta =
    m.cta && m.href
      ? `<a class="btn-sm" href="${escapeHtml(m.href)}">${escapeHtml(m.cta)}</a>`
      : m.cta
        ? `<button type="button" class="btn-sm" id="${ctx === "alerts" ? "btn-alert-at-mid" : ""}" data-empty-cta="${ctx}">${escapeHtml(m.cta)}</button>`
        : "";
  return `<div class="bottom-empty act-empty product-empty" data-empty="${ctx}">
    <p class="empty-title">${escapeHtml(m.title)}</p>
    <p class="muted small">${escapeHtml(m.body)}</p>
    ${cta}
  </div>`;
}
