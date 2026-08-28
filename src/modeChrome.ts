/** Header / announce chrome — never imply live CEX; lab label only when session is connected. */

import { INTEGRATION, isLiveModeBlocked } from "./config/integration";
import { useLabMatching } from "./adapters/labMatching";

export function modeChromeLabel(): string {
  if (isLiveModeBlocked()) return "Live blocked — use paper/lab, not public live";
  if (useLabMatching()) return "Lab matching (loopback) — DEMO/LAB only";
  switch (INTEGRATION.mode) {
    case "paper":
      return "Paper / synthetic — not real exchange";
    default:
      return "Demo / paper balances — not real exchange";
  }
}

export function modeStatusPill(): string {
  if (isLiveModeBlocked()) return "⛔ Live blocked";
  if (useLabMatching()) return "◎ Lab · connected";
  return "◎ Paper / Synthetic";
}
