/** Shared mobile layout breakpoint — matches CSS @media max-width. */
export const MOBILE_LAYOUT_MAX_PX = 1024;

export type MobilePanel = "book" | "chart" | "trade" | "markets";

const MOBILE_PANEL_KEY = "hackme-ex-mobile-panel-v1";

export function isMobileLayout(): boolean {
  // Hub iframe must stay full desktop desk (Book | Chart | Trade), never phone tabs.
  try {
    if (typeof document !== "undefined" && document.documentElement?.dataset?.embed === "hub") {
      return false;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("embed") === "hub") {
      return false;
    }
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_PX}px)`).matches;
}

export function loadMobilePanel(): MobilePanel {
  try {
    const raw = sessionStorage.getItem(MOBILE_PANEL_KEY);
    if (raw === "book" || raw === "chart" || raw === "trade" || raw === "markets") return raw;
  } catch {
    /* ignore */
  }
  return "chart";
}

export function saveMobilePanel(panel: MobilePanel): void {
  try {
    sessionStorage.setItem(MOBILE_PANEL_KEY, panel);
  } catch {
    /* ignore */
  }
}
