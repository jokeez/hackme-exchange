/** Header / announce chrome — never imply live CEX; lab label only when session is connected. */

import { INTEGRATION, isLiveModeBlocked, isStagingMode } from "./config/integration";
import { useLabMatching } from "./adapters/labMatching";

export function modeChromeLabel(): string {
  if (isLiveModeBlocked()) return "Live blocked — use paper/lab/staging, not public live";
  if (isStagingMode() && useLabMatching()) return "D1 staging · loopback ledger (local only)";
  if (isStagingMode()) return "D1 staging — connect fixture to loopback API";
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
  if (isStagingMode()) return useLabMatching() ? "◈ D1 local" : "◈ D1 staging";
  if (useLabMatching()) return "◎ Lab · connected";
  return "◎ Paper / Synthetic";
}
