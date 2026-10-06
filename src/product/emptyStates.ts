import { escapeHtml } from "../sanitize";
import { isMobileLayout } from "../mobile";
import { isDeskConnectEnabled, isLabLoopbackApi } from "../config/integration";
import { useDeskMatching, usePublicDeskBook } from "../adapters/labMatching";

export type EmptySpotContext = "orders" | "positions" | "history" | "alerts";

function spotModeBody(paperDefault: string): string {
  if (isDeskConnectEnabled()) {
    if (useDeskMatching()) {
      return "Desk Spot — live matching session (soft-launch caps). Open orders sync from the server.";
    }
    if (usePublicDeskBook()) {
      return "Desk matching is live — Connect desk wallet on Account, then place orders. Live L2 is on the book.";
    }
    return "Matching not live yet — Connect desk wallet on Account for a session. Spot stays local preview.";
  }
  if (isLabLoopbackApi()) {
    return "Lab Spot — connect fixture on Account for server matching; without a session this UI is paper preview.";
  }
  return paperDefault;
}

export function renderSpotEmptyState(ctx: EmptySpotContext): string {
  const mobile = typeof window !== "undefined" && isMobileLayout();
  const deskLive = isDeskConnectEnabled() && useDeskMatching();
  const deskBook = isDeskConnectEnabled() && usePublicDeskBook();
  const map: Record<EmptySpotContext, { title: string; body: string; cta?: string; href?: string }> = {
    orders: {
      title: "No open orders",
      body: `${spotModeBody("Paper desk — place a limit (rests on the book) or market (fills now).")} Open orders show here.`,
      cta: "Focus order form",
      href: "#spot",
    },
    positions: {
      title: "No spot inventory yet",
      body: deskLive
        ? "Spot fills update the desk ledger. Soft-launch caps apply until full GO."
        : deskBook
          ? "Connect + deposit HMC/SUP, then trade. Avbl is your exchange ledger — not Copy addr."
          : isDeskConnectEnabled()
            ? "Matching not live — paper balances stay local until Matching GO."
            : isLabLoopbackApi()
              ? "Lab fills update the connected ledger. Without a session, paper balances stay local."
              : "Spot fills update paper balances instantly. Track equity on Account.",
      cta: "View Account",
      href: "#account",
    },
    history: {
      title: "No fills yet",
      body: deskLive
        ? "Server fills and CSV export appear here after your first desk trade."
        : deskBook
          ? "Connect desk wallet, then trade — fills appear here."
          : isDeskConnectEnabled()
            ? "Fills appear here after Matching GO + Connect."
            : isLabLoopbackApi()
              ? "After your first lab (or paper) fill, history and CSV export appear here."
              : "After your first paper fill, history and CSV export appear here.",
    },
    alerts: {
      title: "No price alerts",
      body: mobile
        ? "Long-press the chart (or Alert at mid) to arm a price alert."
        : "Right-click the chart (or Alert at mid) to arm a price alert.",
      cta: "Alert at mid",
    },
  };
  const m = map[ctx];
  const cta =
    m.cta && m.href && ctx !== "orders"
      ? `<a class="btn-sm" href="${escapeHtml(m.href)}">${escapeHtml(m.cta)}</a>`
      : m.cta
        ? `<button type="button" class="btn-sm" id="${
            ctx === "alerts" ? "btn-alert-at-mid" : ctx === "orders" ? "btn-focus-order-form" : ""
          }" data-empty-cta="${ctx}">${escapeHtml(m.cta)}</button>`
        : "";
  return `<div class="bottom-empty act-empty product-empty" data-empty="${ctx}">
    <p class="empty-title">${escapeHtml(m.title)}</p>
    <p class="muted small">${escapeHtml(m.body)}</p>
    ${cta}
  </div>`;
}
