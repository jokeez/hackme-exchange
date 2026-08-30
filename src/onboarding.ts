/**
 * First-visit onboarding — quick order on + chart tap coach mark.
 */

import type { ChartOverlaySettings } from "./types";
import { isHubEmbed } from "./embed";
import { isMobileLayout } from "./mobile";

export const ONBOARD_STORAGE_KEY = "hackme-ex-onboard-v2";
export const CHART_HINT_KEY = "hackme-ex-chart-hint-v1";

export type OnboardState = {
  chartOverlays: ChartOverlaySettings;
};

export type OnboardCallbacks = {
  saveState: () => void;
  normalizeOverlays: (o: ChartOverlaySettings) => ChartOverlaySettings;
  onQuickOrderEnabled?: () => void;
};

/** Enable chart quick-order on first visit (all devices). */
export function applyFirstVisitPrefs(state: OnboardState, cb: OnboardCallbacks): boolean {
  if (isHubEmbed()) return false;
  try {
    if (localStorage.getItem(ONBOARD_STORAGE_KEY)) return false;
    localStorage.setItem(ONBOARD_STORAGE_KEY, "1");
    if (!state.chartOverlays.quickOrder) {
      state.chartOverlays = cb.normalizeOverlays({ ...state.chartOverlays, quickOrder: true });
      cb.saveState();
      cb.onQuickOrderEnabled?.();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Coach mark: tap chart to place order (mobile-first, also shown on desktop). */
export function scheduleChartTapHint(opts?: { delayMs?: number }): void {
  if (isHubEmbed()) return;
  try {
    if (localStorage.getItem(CHART_HINT_KEY)) return;
  } catch {
    return;
  }
  const delay = opts?.delayMs ?? (isMobileLayout() ? 1200 : 1800);
  window.setTimeout(() => {
    try {
      if (localStorage.getItem(CHART_HINT_KEY)) return;
    } catch {
      return;
    }
    const host = document.getElementById("chart-host-1") ?? document.querySelector(".chart-pane");
    if (!host) return;
    showChartTapCoach(host as HTMLElement);
  }, delay);
}

function showChartTapCoach(anchor: HTMLElement): void {
  if (document.getElementById("chart-tap-coach")) return;
  const rect = anchor.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return;

  const coach = document.createElement("div");
  coach.id = "chart-tap-coach";
  coach.className = "chart-tap-coach";
  coach.setAttribute("role", "status");
  coach.innerHTML = `
    <div class="chart-tap-coach-card glass">
      <p class="chart-tap-coach-title">${isMobileLayout() ? "Tap the chart" : "Click the chart"}</p>
      <p class="muted small">Quick order is on — tap a price level to buy or sell.</p>
      <button type="button" class="btn-primary btn-sm" id="chart-tap-coach-ok">Got it</button>
    </div>`;

  const top = Math.min(rect.bottom + 8, window.innerHeight - 120);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - 280));
  coach.style.top = `${top}px`;
  coach.style.left = `${left}px`;

  const dismiss = () => {
    try {
      localStorage.setItem(CHART_HINT_KEY, "1");
    } catch {
      /* ignore */
    }
    coach.remove();
  };

  coach.querySelector("#chart-tap-coach-ok")?.addEventListener("click", dismiss);
  window.setTimeout(dismiss, 12_000);
  document.body.appendChild(coach);
}

export function dismissChartTapHint(): void {
  document.getElementById("chart-tap-coach")?.remove();
  try {
    localStorage.setItem(CHART_HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}
