/** Shared mobile layout breakpoint — matches CSS @media max-width. */
export const MOBILE_LAYOUT_MAX_PX = 1024;

/** Binance-style mobile spot panels (bottom nav). */
export type MobilePanel = "trade" | "chart" | "markets" | "orders";

const MOBILE_PANEL_KEY = "hackme-ex-mobile-panel-v1";
const MOBILE_TRADE_SIDE_KEY = "hackme-ex-mobile-trade-side-v1";

export type MobileTradeSide = "buy" | "sell";

export function isMobileLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_PX}px)`).matches;
}

export function loadMobilePanel(): MobilePanel {
  try {
    const raw = sessionStorage.getItem(MOBILE_PANEL_KEY);
    // Legacy: standalone book tab → trade split (form + book).
    if (raw === "book") return "trade";
    if (raw === "trade" || raw === "chart" || raw === "markets" || raw === "orders") return raw;
  } catch {
    /* ignore */
  }
  return "trade";
}

export function saveMobilePanel(panel: MobilePanel): void {
  try {
    sessionStorage.setItem(MOBILE_PANEL_KEY, panel);
  } catch {
    /* ignore */
  }
}

export function loadMobileTradeSide(): MobileTradeSide {
  try {
    const raw = sessionStorage.getItem(MOBILE_TRADE_SIDE_KEY);
    if (raw === "buy" || raw === "sell") return raw;
  } catch {
    /* ignore */
  }
  return "buy";
}

export function saveMobileTradeSide(side: MobileTradeSide): void {
  try {
    sessionStorage.setItem(MOBILE_TRADE_SIDE_KEY, side);
  } catch {
    /* ignore */
  }
}

/** Sync mobile buy/sell tab without re-wiring listeners (book click, etc.). */
export function setMobileTradeSide(side: MobileTradeSide): void {
  if (typeof document === "undefined") return;
  const dual = document.getElementById("dual-order");
  const tabs = Array.from(document.querySelectorAll("#trade-side-toggle .ts")) as HTMLElement[];
  if (!dual || !tabs.length) return;
  dual.setAttribute("data-mobile-side", side);
  saveMobileTradeSide(side);
  tabs.forEach((tab) => {
    const on = tab.dataset.mobileSide === side;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", on ? "true" : "false");
  });
}

/** LWC interaction profile — free plot pan/pinch is custom (overlay); LWC keeps axis + pinch flag. */
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
  return {
    handleScale: {
      // Price-axis pan is custom in setupPortableChartPan (clamped) — disable LWC native.
      axisPressedMouseMove: { time: true, price: false },
      mouseWheel: false,
      // Free-xh overlay owns pinch — LWC native pinch fights custom gestures (chart "flies").
      pinch: false,
      axisDoubleClickReset: { time: true, price: true },
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: false,
      // When free-xh not capturing, LWC touch drag still works.
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
  };
}

export function mobilePanelResizeEnabled(): boolean {
  return !isMobileLayout();
}

/** Pixels of chart-host covered by the fixed mobile footer on the chart tab. */
export function mobileChartFooterOverlapPx(host?: HTMLElement | null): number {
  if (!isMobileLayout()) return 0;
  if (document.documentElement.getAttribute("data-mobile-panel") !== "chart") return 0;
  const footer = document.getElementById("mobile-footer-stack");
  if (!footer) return 0;
  const style = getComputedStyle(footer);
  if (style.display === "none" || style.visibility === "hidden") return 0;
  const chartHost = host ?? document.getElementById("chart-host");
  if (!chartHost) return 0;
  const overlap = chartHost.getBoundingClientRect().bottom - footer.getBoundingClientRect().top;
  if (overlap <= 2) return 0;
  // Snap to 4px — 1px layout thrash was re-firing ResizeObserver and shaking the chart.
  return Math.max(4, Math.round(overlap / 4) * 4);
}

/** Keep CSS + JS on the same breakpoint (not only @media). */
export function syncMobileLayoutClass(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("mobile-layout", isMobileLayout());
}
