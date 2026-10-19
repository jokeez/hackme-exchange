/**
 * Soft-launch custody limits shown in Deposit / Withdraw UI.
 * Keep aligned with API: EXCHANGE_USDT_MIN_DEPOSIT_MINOR + custodyfees USDT withdraw.
 * Ledger display units = 1e8 minor (not BEP-20 1e18).
 */

export const USDT_DEPOSIT_MIN = 0.1;
export const USDT_WITHDRAW_MIN = 15;
export const USDT_WITHDRAW_FEE = 1.5;
export const USDT_NETWORK_LABEL = "BSC mainnet";
export const USDT_CHAIN_ID = 56;
export const USDT_CONFIRMATIONS = 15;
export const USDT_STANDARD = "BEP-20";
/** Canonical mainnet USDT contract (display only). */
export const USDT_CONTRACT_MAINNET = "0x55d398326f99059fF775485246999027B3197955";

/** Generic withdraw floor (HMC/SUP/BTC) — matches EXCHANGE_WITHDRAW_MIN default. */
export const NATIVE_WITHDRAW_MIN = 0.01;

export function withdrawMinForAsset(asset: string): number {
  const a = asset.trim().toUpperCase();
  if (a === "USDT") return USDT_WITHDRAW_MIN;
  return NATIVE_WITHDRAW_MIN;
}

export function withdrawFeeHint(asset: string): string {
  const a = asset.trim().toUpperCase();
  if (a === "USDT") return `${USDT_WITHDRAW_FEE} USDT`;
  return "quoted per request";
}

export function withdrawDestHint(asset: string): string {
  const a = asset.trim().toUpperCase();
  if (a === "USDT") {
    return `${USDT_STANDARD} BSC ${USDT_CHAIN_ID} · 0x… only (not TRC/ERC)`;
  }
  if (a === "BTC") return "BTC rail not live yet";
  return "external HMC- wallet · not login/deposit addr";
}

/** One-line network/min note for desk deposit (Binance-simple; no ops jargon wall). */
export function depositLimitsPlateHtml(): string {
  return `<p class="cex-dep-note muted small" role="note" aria-label="Deposit network">
    <strong>USDT</strong> ${USDT_STANDARD} · BSC ${USDT_CHAIN_ID} · min <strong class="mono">${USDT_DEPOSIT_MIN}</strong>
    · after ≥${USDT_CONFIRMATIONS} confs, manual review before Available
    · <strong>HMC / SUP</strong> HackMe chain · usually ~30s
  </p>`;
}

export function withdrawLimitsPlateHtml(asset = "HMC"): string {
  const a = asset.trim().toUpperCase() || "HMC";
  const min = withdrawMinForAsset(a);
  const fee = withdrawFeeHint(a);
  const dest = withdrawDestHint(a);
  return `<p class="cex-dep-note muted small" id="lab-wd-limits-plate" data-asset="${a}" role="note" aria-label="Withdraw limits">
    <strong>${a}</strong> · min <strong class="mono">${min}</strong> · fee ${fee}
    · ${dest}
    · reserved until broadcast
  </p>`;
}
