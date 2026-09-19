export const TOUR_V2_KEY = "hackme.tour.v2.done";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  selector?: string;
};

export const TOUR_V2_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to HackMe Exchange",
    body: "Open-source paper Spot — simulated balances, shared reference mids (±drift). Pool stats are telemetry only. Not real money, not custody.",
  },
  {
    id: "chart",
    title: "Spot chart",
    body: "Tap or click the chart for quick order. Right-click to set a price alert. Pair and timeframe persist.",
    selector: "#chart-wrap",
  },
  {
    id: "convert",
    title: "Convert desk",
    body: "Open Convert in the top nav to swap paper balances at mid with a fee preview.",
  },
  {
    id: "pool",
    title: "Mining pool",
    body: "Open Pool for live hashrate telemetry from hackme.tech (does not drive spot mids).",
  },
  {
    id: "account",
    title: "Account & PnL",
    body: "Open Account for paper equity, VIP fee tier, and dust convert shortcuts.",
  },
  {
    id: "pwa",
    title: "Install PWA",
    body: "Add to home screen for a mobile desk without an app store.",
    selector: "#pwa-install-banner",
  },
];

export function tourV2Done(): boolean {
  try {
    return localStorage.getItem(TOUR_V2_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourV2Done(): void {
  try {
    localStorage.setItem(TOUR_V2_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function renderTourV2Overlay(step: TourStep, index: number, total: number): string {
  return `<div class="tour-v2-backdrop" id="tour-v2-backdrop" role="dialog" aria-modal="true">
    <div class="tour-v2-card glass">
      <p class="muted small">Tour ${index + 1} / ${total}</p>
      <h3>${step.title}</h3>
      <p class="muted">${step.body}</p>
      <div class="tour-v2-actions">
        <button type="button" class="link" id="tour-v2-skip">Skip</button>
        <button type="button" class="btn-primary" id="tour-v2-next">${index + 1 >= total ? "Done" : "Next"}</button>
      </div>
    </div>
  </div>`;
}
