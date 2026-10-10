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
  if (a === "USDT") return `${USDT_WITHDRAW_FEE} USDT flat (on top)`;
  return "Quoted per request";
}

export function withdrawDestHint(asset: string): string {
  const a = asset.trim().toUpperCase();
  if (a === "USDT") {
    return `BEP-20 on ${USDT_NETWORK_LABEL} (chain ${USDT_CHAIN_ID}) · paste a 0x… address · not TRC-20 / ERC-20`;
  }
  if (a === "BTC") return "Ops destination stub until BTC rail is live";
  return "External HMC- wallet (16 hex) · not your Connect / deposit address";
}

/** Compact limits plate HTML for desk deposit (USDT-focused; HMC/SUP noted). */
export function depositLimitsPlateHtml(): string {
  return `<div class="cex-limits" role="note" aria-label="Deposit limits">
    <div class="cex-limits-head">Deposit limits</div>
    <div class="cex-limits-grid">
      <div class="cex-limit">
        <span class="cex-limit-k">USDT min</span>
        <span class="cex-limit-v mono">${USDT_DEPOSIT_MIN} USDT</span>
      </div>
      <div class="cex-limit">
        <span class="cex-limit-k">Network</span>
        <span class="cex-limit-v">${USDT_STANDARD} · ${USDT_NETWORK_LABEL}</span>
      </div>
      <div class="cex-limit">
        <span class="cex-limit-k">Credit path</span>
        <span class="cex-limit-v">≥${USDT_CONFIRMATIONS} conf → hold → manual KYT → available</span>
      </div>
      <div class="cex-limit">
        <span class="cex-limit-k">HMC / SUP</span>
        <span class="cex-limit-v">No fixed min · node-watch (ops sync)</span>
      </div>
    </div>
    <p class="cex-limits-note">USDT is not instant credit — after ≥${USDT_CONFIRMATIONS} BSC confs it is held until ops approve KYT (manual). Amounts below ${USDT_DEPOSIT_MIN} USDT stay on the deposit address until a qualifying transfer.</p>
  </div>`;
}

export function withdrawLimitsPlateHtml(asset = "HMC"): string {
  const a = asset.trim().toUpperCase() || "HMC";
  const min = withdrawMinForAsset(a);
  const fee = withdrawFeeHint(a);
  const dest = withdrawDestHint(a);
  const usdtExtra =
    a === "USDT"
      ? `<div class="cex-limit">
        <span class="cex-limit-k">Network</span>
        <span class="cex-limit-v">${USDT_STANDARD} · chain ${USDT_CHAIN_ID}</span>
      </div>
      <div class="cex-limit">
        <span class="cex-limit-k">Auto-send</span>
        <span class="cex-limit-v">Off · ops broadcast after KYT</span>
      </div>`
      : `<div class="cex-limit">
        <span class="cex-limit-k">2FA</span>
        <span class="cex-limit-v">TOTP required</span>
      </div>
      <div class="cex-limit">
        <span class="cex-limit-k">Status</span>
        <span class="cex-limit-v">Pending until ops completes</span>
      </div>`;
  return `<div class="cex-limits" id="lab-wd-limits-plate" data-asset="${a}" role="note" aria-label="Withdraw limits">
    <div class="cex-limits-head">Withdraw limits · ${a}</div>
    <div class="cex-limits-grid">
      <div class="cex-limit">
        <span class="cex-limit-k">Min amount</span>
        <span class="cex-limit-v mono">${min} ${a}</span>
      </div>
      <div class="cex-limit">
        <span class="cex-limit-k">Fee</span>
        <span class="cex-limit-v">${fee}</span>
      </div>
      ${usdtExtra}
    </div>
    <p class="cex-limits-note">${dest}. Funds reserved until ops completes (no auto hot-send).</p>
  </div>`;
}
