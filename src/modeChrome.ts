/** Header / announce chrome — never imply live CEX; desk/lab labels follow health + session. */

import { INTEGRATION, isDeskConnectEnabled, isLiveModeBlocked, isStagingMode } from "./config/integration";
import { getDeskMatchingStatus, useDeskMatching, useLabMatching, usePublicDeskBook } from "./adapters/labMatching";
import { isDeskMatchingLive } from "./settingsModal";

export function modeChromeLabel(): string {
  if (isLiveModeBlocked()) return "Live blocked — use paper/lab/staging, not public live";
  if (isStagingMode() && useLabMatching()) return "D1 staging · loopback ledger (local only)";
  if (isStagingMode()) return "D1 staging — connect fixture to loopback API";
  if (useLabMatching()) return "Lab matching (loopback) — DEMO/LAB only";
  if (useDeskMatching()) return "Desk matching live — soft-launch · session connected";
  if (usePublicDeskBook()) return "Desk matching live — Connect wallet to trade (soft-launch)";
  if (isDeskConnectEnabled() && isDeskMatchingLive(getDeskMatchingStatus())) {
    return "Desk matching live — Connect wallet to trade (soft-launch)";
  }
  if (isDeskConnectEnabled()) return "Desk Connect · matching HOLD — paper preview until GO";
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
  if (useDeskMatching()) return "◎ Desk · live";
  if (usePublicDeskBook()) return "◎ Desk · Connect";
  if (isDeskConnectEnabled()) return "◎ Desk · HOLD";
  return "◎ Paper / Synthetic";
}
