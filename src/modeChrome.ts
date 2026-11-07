/** Header / announce chrome — never imply live CEX; desk/lab labels follow health + session. */

import { INTEGRATION, isDeskConnectEnabled, isLiveModeBlocked, isStagingMode } from "./config/integration";
import { getDeskMatchingStatus, useDeskMatching, useLabMatching, usePublicDeskBook } from "./adapters/labMatching";
import { isDeskEdgePending, isDeskMatchingLive } from "./settingsModal";

export function modeChromeLabel(): string {
  if (isLiveModeBlocked()) return "Live blocked — use paper/lab/staging, not public live";
  if (isStagingMode() && useLabMatching()) return "D1 staging · loopback ledger (local only)";
  if (isStagingMode()) return "D1 staging — connect fixture to loopback API";
  if (useLabMatching()) return "Lab matching (loopback) — DEMO/LAB only";
  if (useDeskMatching()) return "Live trading — connected";
  if (usePublicDeskBook()) return "Live trading — connect to trade";
  if (isDeskConnectEnabled() && isDeskMatchingLive(getDeskMatchingStatus())) {
    return "Live trading — connect to trade";
  }
  if (isDeskConnectEnabled() && isDeskEdgePending(getDeskMatchingStatus())) {
    return "Connecting to the exchange…";
  }
  if (isDeskConnectEnabled()) return "Trading opens soon";
  switch (INTEGRATION.mode) {
    case "paper":
      return "Paper Spot — simulated balances";
    default:
      return "Paper Spot — simulated balances";
  }
}

export function modeStatusPill(): string {
  if (isLiveModeBlocked()) return "⛔ Live blocked";
  if (isStagingMode()) return useLabMatching() ? "◈ D1 local" : "◈ D1 staging";
  if (useLabMatching()) return "◎ Lab";
  if (useDeskMatching()) return "● Live";
  if (usePublicDeskBook()) return "● Live · Connect";
  if (isDeskConnectEnabled() && isDeskMatchingLive(getDeskMatchingStatus())) return "● Live · Connect";
  if (isDeskConnectEnabled() && isDeskEdgePending(getDeskMatchingStatus())) return "○ Connecting…";
  if (isDeskConnectEnabled()) return "○ Connect";
  return "◎ Paper";
}
