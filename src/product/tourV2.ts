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
    body: "Soft-launch desk: Connect on Account, send to your deposit address (never Copy/login addr), then trade live L2. Caps apply (open orders / band / min notional).",
  },
  {
    id: "chart",
    title: "Spot chart",
    body: "Candles follow the live book mid when matching is on. Tap the chart for quick order; long-press (or right-click) for alerts.",
    selector: "#chart-wrap",
  },
  {
    id: "convert",
    title: "Convert desk",
    body: "Convert HMC/USDT and HMC/SUP at server mid + VIP taker after Connect. Spot uses the live book; Convert does not touch the order book.",
  },
  {
    id: "pool",
    title: "Mining pool",
    body: "Open Pool for live hashrate telemetry from hackme.tech (does not drive spot mids).",
  },
  {
    id: "account",
    title: "Account & deposit",
    body: "Connect, then Deposit → show HMC/SUP/USDT address. USDT stays in screening hold until ops approve KYT. Never send to Copy/login addr.",
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
