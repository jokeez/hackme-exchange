export const TOUR_V2_KEY = "hackme.tour.v2.done";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  selector?: string;
  view?: "spot" | "convert" | "pool" | "account";
};

export const TOUR_V2_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to HackMe Exchange",
    body: "Paper trading with live pool oracle — balances, convert, and mining in one hub.",
    view: "spot",
  },
  {
    id: "chart",
    title: "Spot chart",
    body: "Right-click for alerts. Denom and pair persist across refresh.",
    selector: "#chart-wrap",
    view: "spot",
  },
  {
    id: "convert",
    title: "Convert desk",
    body: "Swap dust and alt balances with route preview and slippage guard.",
    view: "convert",
  },
  {
    id: "pool",
    title: "Mining pool",
    body: "Live hashrate, worker lookup by payout address, and oracle transparency.",
    view: "pool",
  },
  {
    id: "account",
    title: "Account & PnL",
    body: "Equity in USDT, BTC, HMC, or ₽ — 30d snapshots and VIP fees.",
    view: "account",
  },
  {
    id: "pwa",
    title: "Install PWA",
    body: "Add to home screen for mobile alerts without an app store.",
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
