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

/** LWC interaction profile — phones lock the price axis, desktop keeps full desk. */
export function chartInteractionOptions(): {
  handleScale: {
    axisPressedMouseMove: { time: boolean; price: boolean };
    mouseWheel: boolean;
    pinch: boolean;
    axisDoubleClickReset: { time: boolean; price: boolean };
  };
  handleScroll: {
    mouseWheel: boolean;
    pressedMouseMove: boolean;
    horzTouchDrag: boolean;
    vertTouchDrag: boolean;
  };
} {
  const mobile = isMobileLayout();
  return {
    handleScale: {
      axisPressedMouseMove: { time: true, price: !mobile },
      mouseWheel: !mobile,
      pinch: !mobile,
      axisDoubleClickReset: { time: true, price: !mobile },
    },
    handleScroll: {
      mouseWheel: !mobile,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
  };
}

export function mobilePanelResizeEnabled(): boolean {
  return !isMobileLayout();
}

/** Keep CSS + JS on the same breakpoint (not only @media). */
export function syncMobileLayoutClass(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("mobile-layout", isMobileLayout());
}
