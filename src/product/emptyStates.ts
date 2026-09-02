import { escapeHtml } from "../sanitize";

export type EmptySpotContext = "orders" | "positions" | "history" | "alerts";

export function renderSpotEmptyState(ctx: EmptySpotContext): string {
  const map: Record<EmptySpotContext, { title: string; body: string; cta?: string; href?: string }> = {
    orders: {
      title: "No open orders",
      body: "Place a limit or market order from the book — it will show here.",
      cta: "Focus order form",
      href: "#spot",
    },
    positions: {
      title: "No positions",
      body: "Spot fills update your balances instantly in this demo.",
      cta: "View Account",
      href: "#account",
    },
    history: {
      title: "No fills yet",
      body: "Your trade history and CSV export appear after the first fill.",
    },
    alerts: {
      title: "No price alerts",
      body: "Right-click the chart or use Alert at mid to arm push notifications.",
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
