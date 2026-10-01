import { escapeHtml } from "../sanitize";
import { isMobileLayout } from "../mobile";
import { isDeskConnectEnabled, isLabLoopbackApi } from "../config/integration";

export type EmptySpotContext = "orders" | "positions" | "history" | "alerts";

function spotModeBody(paperDefault: string): string {
  if (isDeskConnectEnabled()) {
    return "Paper Spot while matching stays HOLD — Connect desk wallet on Account when you want a session.";
  }
  if (isLabLoopbackApi()) {
    return "Lab Spot — connect fixture on Account for server matching; without a session this UI is paper preview.";
  }
  return paperDefault;
}

export function renderSpotEmptyState(ctx: EmptySpotContext): string {
  const mobile = typeof window !== "undefined" && isMobileLayout();
  const map: Record<EmptySpotContext, { title: string; body: string; cta?: string; href?: string }> = {
    orders: {
      title: "No open orders",
      body: `${spotModeBody("Paper desk — place a limit (rests on the book) or market (fills now).")} Open orders show here.`,
      cta: "Focus order form",
      href: "#spot",
    },
    positions: {
      title: "No spot inventory yet",
      body: isDeskConnectEnabled()
        ? "Spot fills update paper balances. Live ledger sync stays HOLD until matching GO."
        : isLabLoopbackApi()
          ? "Lab fills update the connected ledger. Without a session, paper balances stay local."
          : "Spot fills update paper balances instantly. Track equity on Account.",
      cta: "View Account",
      href: "#account",
    },
    history: {
      title: "No fills yet",
      body: isDeskConnectEnabled()
        ? "Paper fills and CSV export appear here. Public matching stays HOLD."
        : isLabLoopbackApi()
          ? "After your first lab (or paper) fill, history and CSV export appear here."
          : "After your first paper fill, history and CSV export appear here.",
    },
    alerts: {
      title: "No price alerts",
      body: mobile
        ? "Long-press the chart (or Alert at mid) to arm a paper price alert."
        : "Right-click the chart (or Alert at mid) to arm a paper price alert.",
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
