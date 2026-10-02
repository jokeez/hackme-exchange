import { INTEGRATION, isDemoMode, isDeskConnectEnabled, isLabApiEnabled, isLabLoopbackApi, isLiveModeBlocked } from "./config/integration";
import { labSessionLabel } from "./adapters/exchangeApi";
import { useLabMatching, useDeskMatching, usePublicDeskBook } from "./adapters/labMatching";
import { escapeHtml } from "./sanitize";
import { nodeWalletUrl } from "./adapters/walletLinks";
import { isHubEmbed, postHubGotoTab } from "./embed";
import { VIP_TIERS, activeVipTier, feeScheduleLabel, formatBps, nextVipProgress, volume30dUsdt } from "./fees";
import { formatNum, formatPct, formatPrice } from "./market";
import { pnlPct, walletEquityFromMarket } from "./store";
import { dailyPnlCalendar, pnlWindows, renderPnlCalendarHtml } from "./pnl";
import { ASSET_REGISTRY, PLANNED_ASSETS } from "./adapters/assets";
import { Ico, assetBadgeLg } from "./icons";
import {
  buildAssetPortfolioRows,
  equityInDenom,
  formatPnlAbsInDenom,
  formatTodayPnlHtml,
  formatTxTime,
  getEquityDenom,
  isBalanceHidden,
  maskBalance,
  recentTransactions,
  renderAssetTableRows,
  renderDenomRing,
  setBalanceHidden,
  setEquityDenom,
  syncDenomRingDom,
  DENOM_ORB_SEL,
  todayPnl,
  type EquityDenom,
} from "./accountPortfolio";
import { loadAcctHideSmall, loadAcctTab, saveAcctHideSmall, saveAcctTab } from "./uiPrefs";
import { renderDustPanel } from "./product/dustConvert";
import { portfolioEquityChart30d, refreshPortfolioChartHtml, wirePortfolioEquityChart } from "./product/portfolioChart";
import { renderMultiWalletCard, type WalletSlice } from "./product/multiWallet";
import { renderSpotEmptyState } from "./product/emptyStates";
import { formatDeskMatchingLabel, isDeskMatchingLive } from "./settingsModal";
import type { DemoState, MarketSnapshot, Wallet } from "./types";

export type AccountPageOpts = {
  /** Lab fee-collection address from /health `fee_wallet` (omit → hide row). */
  feeWallet?: string | null;
  /** Optional node wallet snapshot for multi-wallet row. */
  nodeWallet?: { hmc: number; sup: number } | null;
  /** Last /health edge snapshot for desk HOLD badges. */
  deskEdge?: {
    matching: string;
    depositEnabled: boolean;
    withdrawEnabled: boolean;
    maxOpenOrders?: number;
    minNotional?: number;
    priceBandBps?: number;
  };
};

/** Read-only lab fee sink row — empty when address missing (graceful hide). */
export function labFeeWalletSection(feeWallet: string | null | undefined): string {
  const addr = typeof feeWallet === "string" ? feeWallet.trim() : "";
  if (!addr) return "";
  return `
        <section class="lab-section lab-fee-wallet" id="lab-fee-wallet" aria-label="Lab fee collection wallet">
          <h4 class="lab-section-title">Fee collection</h4>
          <p class="muted small lab-fee-wallet-hint">Spot + Convert fees credit this wallet. Default fee asset = pair quote (USDT / BTC / SUP); HMC when pay-fees-in-HMC is on (−25%).</p>
          <div class="lab-fee-wallet-row">
            <code class="mono lab-fee-wallet-addr" id="lab-fee-wallet-addr">${escapeHtml(addr)}</code>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-fee-wallet-copy" title="Copy fee wallet">Copy</button>
          </div>
          <p class="muted small lab-fee-wallet-balances-hint">Balances stay here until ops sweeps. SPA never embeds an admin token — verify with CLI <code>GET /admin/fees</code> after a fill or Convert.</p>
          <details class="lab-ops lab-fee-ops" data-ui="fee-verify-cli">
            <summary>Verify fee credits (CLI)</summary>
            <pre class="mono small lab-cli-hint">curl -sS -H "X-Admin-Token: $EXCHANGE_ADMIN_TOKEN" \\
  http://127.0.0.1:18443/admin/fees | jq '.balances'</pre>
          </details>
          <details class="lab-ops lab-fee-ops" data-ui="fee-sweep-cli">
            <summary>Fee sweep (lab CLI)</summary>
            <p class="muted small">Amount in API minor units (<code>1e8</code>). Optional <code>dry_run</code>.</p>
            <pre class="mono small lab-cli-hint">curl -H "X-Admin-Token: $EXCHANGE_ADMIN_TOKEN" -H "Content-Type: application/json" \\
  -d '{"asset":"USDT","amount":100000000,"destination":"lab-ops-dest-1"}' \\
  http://127.0.0.1:18443/admin/fees/sweep</pre>
          </details>
        </section>`;
}

function modeBlurb(): string {
  if (isLiveModeBlocked()) return "live blocked — paper/lab only";
  if (isDeskConnectEnabled()) {
    if (useDeskMatching()) return "desk Connect · matching LIVE · soft-launch";
    if (usePublicDeskBook()) return "desk Connect · matching live · Connect to trade";
    return "desk Connect · paper Spot";
  }
  if (isLabLoopbackApi()) return useLabMatching() ? "lab ledger connected" : "LAB ready · connect fixture below";
  if (isLabApiEnabled()) return "API wired";
  if (isDemoMode()) return "paper wallet";
  return "paper Spot";
}

/** Shared TOTP UI (desk + lab) — same ids so wireLabApiButtons stays single-path. */
function renderSecurity2faCard(
  sessionLive: boolean,
  opts?: { withdrawEnabled?: boolean; deskMode?: boolean },
): string {
  const wdOn = !!opts?.withdrawEnabled;
  const hint = opts?.deskMode
    ? wdOn
      ? "Authenticator (TOTP) is required for every withdraw request."
      : "Enroll TOTP now — required before withdraw opens on this edge."
    : wdOn
      ? "Authenticator (TOTP) is required for every withdraw request."
      : "Enroll TOTP now — required before lab withdraw.";
  return `<article class="glass-inset account-card lab-api-card acct-2fa-card" id="acct-security-2fa">
        <header class="acct-2fa-head">
          <div>
            <h4>Security · 2FA</h4>
            <p class="muted small">${hint}</p>
          </div>
          <p id="lab-2fa-status" class="mono small acct-2fa-status" role="status">Status: …</p>
        </header>
        <div id="lab-2fa-setup-panel" class="acct-2fa-panel" hidden>
          <p class="muted small acct-2fa-lead">On desktop: scan the QR with your phone authenticator. Or copy the secret manually.</p>
          <div class="acct-2fa-setup-grid">
            <div class="acct-2fa-qr-wrap">
              <div id="lab-2fa-qr-host" class="acct-2fa-qr-host" hidden>
                <img id="lab-2fa-qr" class="acct-2fa-qr" alt="Scan otpauth QR with authenticator app" width="180" height="180" />
              </div>
              <p class="muted small acct-2fa-qr-hint">Google Authenticator · Authy · 1Password</p>
            </div>
            <div class="acct-2fa-setup-side">
              <ol class="acct-2fa-steps muted small">
                <li>Scan QR (or copy secret below)</li>
                <li>Enter the 6-digit code</li>
                <li>Save recovery codes (shown once)</li>
              </ol>
              <label class="lab-field lab-field-wide">Manual secret
                <div class="acct-2fa-secret-row">
                  <p class="mono small lab-2fa-secret" id="lab-2fa-secret"></p>
                  <button type="button" class="btn-sm" id="btn-lab-2fa-copy-secret">Copy</button>
                </div>
              </label>
              <a id="lab-2fa-otpauth" class="btn-sm btn-secondary acct-2fa-otp-link" href="#" target="_blank" rel="noopener noreferrer">Open otpauth link</a>
            </div>
          </div>
          <div class="acct-2fa-confirm-row">
            <label class="lab-field lab-field-wide" for="lab-2fa-confirm-code">Confirm code
              <input id="lab-2fa-confirm-code" class="mono acct-2fa-code-inp" type="text" inputmode="numeric" maxlength="8" autocomplete="one-time-code" placeholder="6 digits" />
            </label>
            <button type="button" class="acct-2fa-btn-confirm" id="btn-lab-2fa-confirm">Confirm &amp; enable</button>
          </div>
        </div>
        <div id="lab-2fa-enabled-panel" class="acct-2fa-panel acct-2fa-enabled" hidden>
          <div class="acct-2fa-enabled-banner">
            <span class="acct-2fa-enabled-icon" aria-hidden="true">✓</span>
            <div>
              <p class="acct-2fa-enabled-title">Authenticator active</p>
              <p class="muted small acct-2fa-enabled-sub" id="lab-2fa-recovery-left"></p>
            </div>
          </div>
          <section class="acct-2fa-recovery-block" id="lab-2fa-recovery-block" hidden>
            <header class="acct-2fa-recovery-head">
              <h5 class="acct-2fa-recovery-title">Recovery codes</h5>
              <p class="muted small acct-2fa-recovery-once">Shown once — store offline</p>
            </header>
            <div class="acct-2fa-recovery-grid" id="lab-2fa-recovery-codes" role="list" hidden></div>
            <textarea class="acct-2fa-recovery-copy-src" id="lab-2fa-recovery-copy-src" readonly hidden aria-hidden="true"></textarea>
            <div class="acct-2fa-recovery-actions" id="lab-2fa-recovery-actions" hidden>
              <button type="button" class="btn-sm btn-secondary" id="btn-lab-2fa-copy-recovery">Copy all codes</button>
            </div>
          </section>
          <div class="acct-2fa-manage-grid">
            <article class="acct-2fa-action-card acct-2fa-action-card--danger">
              <h5 class="acct-2fa-action-title">Disable 2FA</h5>
              <p class="muted small acct-2fa-action-hint">TOTP or one recovery code</p>
              <label class="lab-field lab-field-wide" for="lab-2fa-disable-code">Code
                <input id="lab-2fa-disable-code" class="mono acct-2fa-code-inp acct-2fa-code-inp--wide" type="text" inputmode="text" autocomplete="one-time-code" placeholder="6 digits or XXXX-XXXX-…" />
              </label>
              <button type="button" class="acct-2fa-btn-secondary acct-2fa-btn-danger" id="btn-lab-2fa-disable">Disable 2FA</button>
            </article>
            <article class="acct-2fa-action-card">
              <h5 class="acct-2fa-action-title">Rotate recovery codes</h5>
              <p class="muted small acct-2fa-action-hint">Current 6-digit TOTP</p>
              <label class="lab-field lab-field-wide" for="lab-2fa-rotate-code">TOTP
                <input id="lab-2fa-rotate-code" class="mono acct-2fa-code-inp acct-2fa-code-inp--wide" type="text" inputmode="numeric" maxlength="8" autocomplete="one-time-code" placeholder="6 digits" />
              </label>
              <button type="button" class="acct-2fa-btn-secondary" id="btn-lab-2fa-rotate">Rotate codes</button>
            </article>
          </div>
        </div>
        <div id="lab-2fa-idle-panel" class="acct-2fa-panel">
          <button type="button" class="acct-2fa-btn-confirm" id="btn-lab-2fa-setup"${sessionLive ? "" : " disabled"}${
            sessionLive ? "" : ' title="Connect wallet first"'
          }>Enable authenticator</button>
          ${
            !sessionLive
              ? `<p class="muted small">Connect ${opts?.deskMode ? "desk wallet" : "session"} first to enroll.</p>`
              : ""
          }
        </div>
        <p id="lab-2fa-msg" class="muted small sync-msg" role="status"></p>
      </article>`;
}

function renderDeskHoldPills(edge?: AccountPageOpts["deskEdge"]): string {
  const matching = formatDeskMatchingLabel(edge?.matching);
  const dep = !!edge?.depositEnabled;
  const wd = !!edge?.withdrawEnabled;
  const live = isDeskMatchingLive(edge?.matching);
  const caps: string[] = [];
  if (edge?.maxOpenOrders && edge.maxOpenOrders > 0) caps.push(`max open ${edge.maxOpenOrders}`);
  if (edge?.priceBandBps && edge.priceBandBps > 0) caps.push(`±${edge.priceBandBps} bps`);
  if (edge?.minNotional && edge.minNotional > 0) caps.push(`min notional ${edge.minNotional}`);
  const capsLine =
    caps.length > 0
      ? `<p class="muted small mono acct-desk-caps" title="Soft-launch caps from /health">${escapeHtml(caps.join(" · "))}</p>`
      : live
        ? `<p class="muted small acct-desk-caps">Soft-launch caps apply (see API health)</p>`
        : "";
  return `<div class="settings-edge-card acct-desk-edge" aria-live="polite">
        <div class="settings-edge-top"><strong>Edge status</strong></div>
        <div class="settings-hold-row acct-desk-hold">
        <span class="settings-hold-pill" data-on="${live ? "1" : "0"}">matching · ${escapeHtml(matching)}</span>
        <span class="settings-hold-pill" data-on="${dep ? "1" : "0"}">deposit · ${dep ? "on" : "HOLD"}</span>
        <span class="settings-hold-pill" data-on="${wd ? "1" : "0"}">withdraw · ${wd ? "on" : "HOLD"}</span>
      </div>${capsLine}</div>`;
}

function allocationBars(w: DemoState["wallet"], market: MarketSnapshot, eq: number): string {
  if (eq <= 0) return "";
  const rows: { sym: string; usdt: number }[] = [
    { sym: "USDT", usdt: w.usdt },
    { sym: "HMC", usdt: w.hmc * market.hmcUsdt },
    { sym: "SUP", usdt: w.sup * market.supUsdt },
    { sym: "BTC", usdt: w.btc * market.btcUsd },
  ];
  return `<div class="acct-alloc" aria-label="Equity allocation">
    ${rows
      .map((r) => {
        const pct = Math.max(0, Math.min(100, (r.usdt / eq) * 100));
        const pctLabel = pct > 0 && pct < 1 ? pct.toFixed(1) : pct.toFixed(0);
        return `<div class="acct-alloc-row">
          <span>${r.sym}</span>
          <div class="acct-alloc-track"><i style="width:${pct.toFixed(1)}%"></i></div>
          <span class="mono dim">${pctLabel}%</span>
        </div>`;
      })
      .join("")}
  </div>`;
}

function renderDepositCard(
  labOn: boolean,
  labLive: boolean,
  session: ReturnType<typeof labSessionLabel>,
  deskEdge?: AccountPageOpts["deskEdge"],
): string {
  const deskCustodyOn = !labOn && isDeskConnectEnabled() && !!deskEdge?.depositEnabled;
  const deskLive = !labOn && isDeskConnectEnabled() && session.live;
  return `
        <article class="acct-cash-card deposit">
          <div class="acct-cash-title">
            <span class="acct-cash-ico deposit" aria-hidden="true">↓</span>
            <div>
              <h4>Deposit</h4>
              <p class="muted small">Add funds to trade on Spot / Convert</p>
            </div>
          </div>
          ${
            labOn
              ? `<div class="acct-cash-actions">
            <button type="button" class="btn-lab btn-lab-accent" id="btn-lab-mint-hmc"${labLive ? "" : " disabled title=\"Connect fixture first\""}>+100 HMC mint</button>
            <button type="button" class="btn-lab btn-lab-primary" id="btn-lab-dep-hmc"${labLive ? "" : " disabled title=\"Connect fixture first\""}>HMC address</button>
            <button type="button" class="btn-lab" id="btn-lab-dep-usdt"${labLive ? "" : " disabled title=\"Connect fixture first\""}>USDT stub</button>
            <button type="button" class="btn-lab btn-lab-accent" id="btn-lab-bridge-usdt"${labLive ? "" : " disabled title=\"Connect fixture first\""}>+10 USDT</button>
            <button type="button" class="btn-lab btn-lab-accent" id="btn-lab-bridge-btc"${labLive ? "" : " disabled title=\"Connect fixture first\""}>+0.01 BTC</button>
          </div>
          <p id="lab-deposit-msg" class="muted small sync-msg" role="status"></p>
          ${
            !labLive
              ? `<p class="muted small acct-cash-hint">${
                  session.address
                    ? `Session expired after reload — tap <strong>Connect fixture</strong> below to restore CSRF, then mint.`
                    : `Session offline — tap <strong>Connect fixture</strong> in Lab session below, then mint.`
                }</p>`
              : `<p class="muted small acct-cash-hint">Lab live · <strong>+100 HMC mint</strong> credits ledger via <code>POST /lab/deposit</code> · HMC address is on-chain deposit · USDT/BTC are paper stubs.</p>`
          }`
              : deskCustodyOn
                ? `<div class="acct-cash-actions">
            <button type="button" class="btn-sm btn-primary" id="btn-desk-dep-hmc"${deskLive ? "" : " disabled title=\"Connect desk wallet first\""}>Show HMC deposit</button>
            <button type="button" class="btn-sm" id="btn-desk-dep-sup"${deskLive ? "" : " disabled title=\"Connect desk wallet first\""}>Show SUP deposit</button>
          </div>
          <div class="acct-dep-reveal" id="lab-deposit-reveal" hidden>
            <label class="lab-field lab-field-wide" for="lab-deposit-addr">Deposit address <span class="muted">(send here)</span>
              <input id="lab-deposit-addr" class="mono" type="text" readonly spellcheck="false" autocomplete="off" value="" />
            </label>
            <div class="lab-action-row">
              <button type="button" class="btn-sm btn-primary" id="btn-desk-dep-copy">Copy deposit address</button>
            </div>
          </div>
          <p id="lab-deposit-msg" class="muted small sync-msg" role="status">Choose an asset to reveal your deposit address.</p>
          <p class="muted small acct-cash-hint acct-dep-warn"><strong>Login addr ≠ deposit.</strong> Never send coins to Connect / Copy addr.</p>
          ${
            session.address
              ? `<p class="muted small mono acct-cash-hint">Login only: <code>${escapeHtml(session.address)}</code></p>`
              : `<p class="muted small acct-cash-hint">Connect desk wallet first, then show deposit address.</p>`
          }`
              : `<div class="acct-cash-actions">
            <button type="button" class="btn-sm" id="btn-sync-node">↻ Sync HMC/SUP from node</button>
            <a class="btn-sm btn-secondary" href="${escapeHtml(nodeWalletUrl())}" id="link-acct-wallet" target="_blank" rel="noopener noreferrer">${isHubEmbed() ? "Open Hub wallet" : "Open node wallet"}</a>
          </div>
          <p id="sync-node-msg" class="muted small sync-msg"></p>
          <p class="muted small acct-cash-hint">Paper mode · balances live in this browser. Live deposit stays <strong>HOLD</strong> until custody GO. Sync pulls HMC/SUP from a local node wallet when one is running.</p>`
          }
        </article>`;
}

function renderWithdrawCard(
  labOn: boolean,
  labLive: boolean,
  session: ReturnType<typeof labSessionLabel>,
  deskEdge?: AccountPageOpts["deskEdge"],
): string {
  const deskWd = !labOn && isDeskConnectEnabled() && !!deskEdge?.withdrawEnabled;
  const deskLive = deskWd && session.live;
  const showForm = labOn || deskWd;
  const enableBtns = labOn ? labLive : deskLive;
  return `
        <article class="acct-cash-card withdraw">
          <div class="acct-cash-title">
            <span class="acct-cash-ico withdraw" aria-hidden="true">↑</span>
            <div>
              <h4>Withdraw</h4>
              <p class="muted small">${
                deskWd
                  ? "Request + TOTP · ops completes on-chain"
                  : labOn
                    ? "Request only · complete via CLI"
                    : "Edge withdraw HOLD"
              }</p>
            </div>
          </div>
          ${
            showForm
              ? `<div class="lab-withdraw-form">
            <label class="lab-field">Asset
              <select id="lab-wd-asset" class="mono">
                <option value="HMC">HMC</option>
                <option value="SUP">SUP</option>
                <option value="USDT">USDT</option>
                <option value="BTC">BTC</option>
              </select>
            </label>
            <label class="lab-field">Amount
              <input id="lab-wd-amt" class="mono" type="number" step="any" min="0" placeholder="0.05" />
            </label>
            <label class="lab-field lab-field-wide">Destination
              <input id="lab-wd-dest" class="mono" type="text" placeholder="HMC-ffffffffffffffff" autocomplete="off" spellcheck="false" data-ph-hmc="HMC-ffffffffffffffff" data-ph-sup="paper-sup-ops-wallet-01" data-ph-usdt="paper-usdt-ops-wallet-01" data-ph-btc="lab-ops-btc-01" />
            </label>
            <p class="muted small lab-wd-dest-hint">HMC/SUP → external <code>HMC-</code> wallet · USDT/BTC paper stubs only</p>
            <label class="lab-field">2FA code
              <input id="lab-wd-2fa" class="mono acct-2fa-code-inp acct-2fa-code-inp--wide" type="text" inputmode="text" autocomplete="one-time-code" placeholder="6 digits or recovery" />
            </label>
          </div>
          ${
            deskWd
              ? `<p class="muted small lab-wd-limits mono" id="lab-wd-limits">${escapeHtml(
                  [
                    deskEdge?.minNotional && deskEdge.minNotional > 0 ? `min notional ${deskEdge.minNotional}` : "",
                    deskEdge?.maxOpenOrders && deskEdge.maxOpenOrders > 0 ? `max open ${deskEdge.maxOpenOrders}` : "",
                    deskEdge?.priceBandBps && deskEdge.priceBandBps > 0 ? `±${deskEdge.priceBandBps} bps` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Limits from /health",
                )}</p>`
              : ""
          }
          <p id="lab-wd-fee-quote" class="muted small lab-fee-quote" role="status">Fee quote appears after amount · GET /fees/custody</p>
          <p id="lab-custody-pause" class="muted small lab-pause-hint" hidden></p>
          <div class="lab-action-row">
            <button type="button" class="btn-lab btn-lab-primary" id="btn-lab-wd-request"${enableBtns ? "" : ` disabled title="${deskWd ? "Connect desk wallet first" : "Connect fixture first"}"`}>Request withdraw</button>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-wd-refresh"${enableBtns ? "" : " disabled"}>↻ List</button>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-wd-quote"${enableBtns ? "" : " disabled"}>Quote fee</button>
          </div>
          <p id="lab-wd-msg" class="muted small sync-msg" role="status"></p>
          <ul id="lab-wd-list" class="lab-wd-list mono small" aria-live="polite"><li class="dim">No withdraw requests yet</li></ul>`
              : `<p class="muted small acct-cash-hint">Withdraw stays <strong>HOLD</strong> on this edge. Enroll 2FA under Desk session so you're ready when it opens. Move HMC/SUP via node / Hub wallet for now.</p>
          <div class="acct-cash-actions">
            <a class="btn-sm btn-secondary" href="${escapeHtml(nodeWalletUrl())}" target="_blank" rel="noopener noreferrer">Node wallet →</a>
            <button type="button" class="btn-sm" id="btn-acct-jump-2fa">Open 2FA ↓</button>
          </div>`
          }
        </article>`;
}

function renderCashDock(
  labOn: boolean,
  labLive: boolean,
  session: ReturnType<typeof labSessionLabel>,
  opts?: AccountPageOpts,
): string {
  const deskOn = isDeskConnectEnabled();
  const deskCustodyOn = deskOn && !!opts?.deskEdge?.depositEnabled;
  const deskWdOn = deskOn && !!opts?.deskEdge?.withdrawEnabled;
  // Prefer labOn / deskCustodyOn over labLive — useLabMatching can be sticky in tests on localhost.
  const intro = labOn
    ? labLive
      ? "Lab ledger active — mint paper USDT/BTC or request withdraw"
      : "Connect fixture once, then deposit / withdraw here"
    : deskCustodyOn || deskWdOn
      ? `Desk custody live — ${[
          deskCustodyOn ? "deposit address below" : null,
          deskWdOn ? "withdraw with TOTP" : null,
        ]
          .filter(Boolean)
          .join(" · ")}`
      : deskOn
        ? "Desk Connect · matching/deposit/withdraw HOLD — paper funds here; Connect for a session"
        : "Paper funds · live exchange deposit/withdraw on HOLD · optional node Sync for HMC/SUP";
  const dockClass = [
    labOn ? "lab-custody-card" : "",
    deskOn && !labOn && !deskCustodyOn && !deskWdOn ? "desk-hold-card" : "",
    deskCustodyOn || deskWdOn ? "desk-custody-live" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `
    <section class="acct-cash-dock glass-inset${dockClass ? ` ${dockClass}` : ""}" id="acct-cash" aria-label="Deposit and withdraw">
      <div class="acct-cash-tabs" role="tablist" aria-label="Funds">
        <button type="button" class="acct-cash-tab active" data-cash-tab="deposit" role="tab" aria-selected="true">Deposit</button>
        <button type="button" class="acct-cash-tab" data-cash-tab="withdraw" role="tab" aria-selected="false">Withdraw</button>
      </div>
      <p class="muted small acct-cash-intro">${intro}</p>
      ${
        deskOn && !labOn
          ? `<div class="acct-desk-cash-cta">
        ${renderDeskHoldPills(opts?.deskEdge)}
        <p class="muted small">Session: <strong class="mono">${escapeHtml(session.label)}</strong></p>
        <div class="acct-cash-actions">
          <button type="button" class="btn-sm btn-primary" id="btn-desk-cash-connect">${session.live ? "Reconnect desk" : "Connect desk wallet"}</button>
          <button type="button" class="btn-sm" id="btn-desk-jump-panel">Desk session ↓</button>
        </div>
      </div>`
          : ""
      }
      <div class="acct-cash-panel" data-cash-panel="deposit" id="acct-cash-deposit">
        ${renderDepositCard(labOn, labLive, session, opts?.deskEdge)}
      </div>
      <div class="acct-cash-panel" data-cash-panel="withdraw" id="acct-cash-withdraw" hidden>
        ${renderWithdrawCard(labOn, labLive, session, opts?.deskEdge)}
      </div>
      ${
        labOn
          ? `<details class="lab-ops acct-cash-ops" data-ui="wd-complete-cli">
        <summary>Operator complete withdraw (CLI)</summary>
        <pre class="mono small lab-cli-hint"># Dry-run (releases reserve, no debit):
curl -H "X-Admin-Token: $EXCHANGE_ADMIN_TOKEN" -H "Content-Type: application/json" \\
  -d '{"id":"WD_ID","tx_id":"lab-dry-run-1"}' \\
  http://127.0.0.1:18443/admin/withdraw/complete
# Real complete+debit: use a non lab-dry-run tx_id</pre>
      </details>
      ${labFeeWalletSection(opts?.feeWallet)}`
          : ""
      }
    </section>`;
}

function renderFeesBlock(state: DemoState, market: MarketSnapshot, vip: ReturnType<typeof activeVipTier>, vol: number): string {
  const vipProg = nextVipProgress(state, market);
  const tierCards = [...VIP_TIERS]
    .sort((a, b) => a.minVolUsdt - b.minVolUsdt)
    .map((t) => {
      const active = t.name === vip.name;
      const reached = vol >= t.minVolUsdt;
      return `<article class="fee-tier-card${active ? " active" : ""}${reached ? " reached" : ""}">
        <div class="fee-tier-top">
          <strong>${t.name}</strong>
          ${active ? `<span class="fee-tier-badge">Current</span>` : ""}
        </div>
        <p class="muted small mono">≥ ${formatNum(t.minVolUsdt, 0)} USDT / 30d</p>
        <div class="fee-tier-rates mono small">
          <span>Maker ${formatBps(t.makerBps)}</span>
          <span>Taker ${formatBps(t.takerBps)}</span>
        </div>
      </article>`;
    })
    .join("");

  return `
    <section class="acct-fees-block glass-inset" id="acct-fees">
      <header class="acct-block-head">
        <h3>Fees · VIP · Oracle</h3>
        <p class="muted small">30d volume <strong class="mono">${formatNum(vol, 0)} USDT</strong> · ${feeScheduleLabel(state)}</p>
        <div class="vip-progress fee-vip-progress">
          <div class="vip-bar"><i style="width:${vipProg.pct.toFixed(0)}%"></i></div>
          <p class="muted small">${
            vipProg.next
              ? `${formatNum(vol, 0)} / ${formatNum(vipProg.next.minVolUsdt, 0)} USDT → ${vipProg.next.name}`
              : "Top VIP tier unlocked"
          }</p>
        </div>
      </header>
      <div class="fee-tier-grid">${tierCards}</div>
      <div class="acct-fees-grid">
        <article class="acct-oracle-strip">
          <span class="acct-oracle-pill"><span class="muted">HMC</span> <strong class="mono" data-acct-oracle-mid="hmc">${formatPrice(market.hmcUsdt)}</strong></span>
          <span class="acct-oracle-pill"><span class="muted">SUP</span> <strong class="mono" data-acct-oracle-mid="sup">${formatPrice(market.supUsdt)}</strong></span>
          <span class="acct-oracle-pill"><span class="muted">BTC</span> <strong class="mono" data-acct-oracle-mid="btc">$${formatNum(market.btcUsd, 0)}</strong></span>
        </article>
        <table class="fee-table compact">
          <thead><tr><th>Tier</th><th>Vol</th><th>Maker</th><th>Taker</th></tr></thead>
          <tbody>
            ${[...VIP_TIERS]
              .sort((a, b) => a.minVolUsdt - b.minVolUsdt)
              .map(
                (t) => `<tr class="${t.name === vip.name ? "active-tier" : ""}">
                  <td>${t.name}</td>
                  <td>≥ ${formatNum(t.minVolUsdt, 0)}</td>
                  <td>${formatBps(t.makerBps)}</td>
                  <td>${formatBps(t.takerBps)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
        <label class="fee-toggle mono">
          <input type="checkbox" id="acct-pay-hmc" ${state.feeConfig.payFeesInHmc ? "checked" : ""} />
          Pay fees in HMC (−${state.feeConfig.hmcDiscountPct}%)
        </label>
      </div>
    </section>`;
}

function buildMultiWalletSlices(state: DemoState, opts: AccountPageOpts | undefined): WalletSlice[] {
  const paper: Wallet = { ...state.wallet };
  const nodeBal: Wallet = {
    usdt: 0,
    hmc: opts?.nodeWallet?.hmc ?? 0,
    sup: opts?.nodeWallet?.sup ?? 0,
    btc: 0,
  };
  return [
    {
      id: "paper",
      label: "Paper wallet",
      subtitle: "Spot · Convert · localStorage demo",
      wallet: paper,
    },
    {
      id: "node",
      label: "Node wallet",
      subtitle: opts?.nodeWallet ? "Synced HMC/SUP from hackme-node" : "Connect node to sync on-chain balances",
      wallet: nodeBal,
      href: nodeWalletUrl(),
    },
    {
      id: "lab",
      label: "Lab ledger",
      subtitle: useLabMatching() ? "Private DEMO/LAB matching session" : "Connect fixture for lab balances",
      wallet: useLabMatching() ? paper : { usdt: 0, hmc: 0, sup: 0, btc: 0 },
      href: "#account",
    },
  ];
}

function renderActivityBlock(
  ledger: DemoState["ledger"],
  calHtml: string,
  labLive: boolean,
  session: ReturnType<typeof labSessionLabel>,
): string {
  const rows = ledger.slice(0, 24);
  return `
    <section class="acct-activity-block" id="acct-activity">
      <header class="acct-block-head">
        <h3>Activity</h3>
        <p class="muted small">Ledger · lab fills · 28-day PnL calendar</p>
      </header>
      <div class="acct-activity-grid">
        <article class="glass-inset account-card acct-ledger-card" id="account-ledger">
          <div class="acct-card-title-row">
            <h4>Ledger</h4>
            <div class="acct-ledger-filters" id="acct-ledger-filters" role="group" aria-label="Filter ledger">
              <button type="button" class="acct-chip active" data-ledger-filter="all">All</button>
              <button type="button" class="acct-chip" data-ledger-filter="trade">Trades</button>
              <button type="button" class="acct-chip" data-ledger-filter="fee">Fees</button>
              <button type="button" class="acct-chip" data-ledger-filter="other">Other</button>
            </div>
          </div>
          ${
            rows.length
              ? `<ul class="pool-list mono ledger-mini" id="acct-ledger-list">
            ${rows
              .map((r) => {
                const bucket = r.kind === "trade" || r.kind === "fee" ? r.kind : "other";
                return `<li data-ledger-kind="${bucket}"><span class="${r.amount >= 0 ? "up" : "down"}">${escapeHtml(r.kind)}</span> ${escapeHtml(r.asset)} <strong>${formatNum(r.amount, 4)}</strong> <span class="dim">${escapeHtml(r.note || "")}</span></li>`;
              })
              .join("")}
          </ul>`
              : `<div class="acct-empty-state">
            <p class="muted">No history yet</p>
            <p class="muted small">Trades, converts, and deposits appear here.</p>
          </div>`
          }
        </article>
        <article class="glass-inset account-card" id="account-lab-fills">
          <div class="acct-card-title-row">
            <h4>Lab fills</h4>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-fills-refresh"${labLive ? "" : " disabled"}>↻ Sync</button>
          </div>
          <p class="muted small">Server SQLite · GET /fills</p>
          <ul id="lab-fills-list" class="pool-list mono ledger-mini" aria-live="polite"></ul>
          <p id="lab-fills-msg" class="muted small sync-msg" role="status">${
            labLive
              ? "Tap Sync after trading."
              : session.address
                ? "Reconnect fixture to load lab fills."
                : "Connect LAB session to load fills."
          }</p>
        </article>
        <article class="glass-inset account-card acct-cal-card">
          ${calHtml}
        </article>
      </div>
    </section>`;
}

function renderRoadmapBlock(): string {
  return `
    <section class="acct-roadmap-block" id="acct-roadmap">
      <details class="acct-details" data-ui="asset-roadmap" id="acct-roadmap-details">
        <summary>Asset roadmap</summary>
        <div class="acct-roadmap-grid">
          ${ASSET_REGISTRY.map(
            (a) => `<article class="acct-roadmap-card glass-inset">
            <div class="acct-roadmap-top">${assetBadgeLg(a.symbol)}<strong>${a.symbol}</strong></div>
            <p class="muted small">${escapeHtml(a.name)}</p>
            <div class="acct-roadmap-tags">
              <span class="acct-roadmap-tag">${a.settlement}</span>
              ${a.exchangeEnabled ? `<span class="acct-roadmap-tag live">Exchange</span>` : ""}
              ${a.walletTabPlanned ? `<span class="acct-roadmap-tag">Wallet tab</span>` : ""}
            </div>
          </article>`,
          ).join("")}
          ${PLANNED_ASSETS.map(
            (a) => `<article class="acct-roadmap-card glass-inset dim">
            <div class="acct-roadmap-top"><span class="asset-ico asset-ico-lg asset-unk">${escapeHtml(a.symbol.slice(0, 1))}</span><strong>${a.symbol}</strong></div>
            <p class="muted small">${escapeHtml(a.name)}</p>
            <span class="acct-roadmap-tag">Future</span>
          </article>`,
          ).join("")}
        </div>
      </details>
    </section>`;
}

function renderRecentTxTable(state: DemoState, hidden: boolean): string {
  const txs = recentTransactions(state.ledger, 8);
  if (!txs.length) {
    return `<p class="muted small acct-tx-empty">No transactions yet — trades and deposits appear here.</p>`;
  }
  return `<table class="acct-tx-table">
    <thead><tr><th>Transaction</th><th>Amount</th><th>Time</th><th>Status</th></tr></thead>
    <tbody>
      ${txs
        .map((tx) => {
          const sign = tx.amount >= 0 ? "+" : "";
          const amt = `${sign}${formatNum(tx.amount, 4)} ${escapeHtml(tx.asset)}`;
          return `<tr>
            <td class="acct-tx-label">
              <span class="acct-tx-ico ${tx.direction}" aria-hidden="true">${tx.direction === "in" ? "↓" : "↑"}</span>
              ${escapeHtml(tx.label)}
            </td>
            <td class="mono ${tx.amount >= 0 ? "up" : "down"}" data-raw-amt="${escapeHtml(amt)}">${maskBalance(amt, hidden)}</td>
            <td class="muted small">${formatTxTime(tx.ts)}</td>
            <td><span class="acct-tx-status ${tx.status}">Completed</span></td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

export function renderAccountPage(state: DemoState, market: MarketSnapshot, opts?: AccountPageOpts): string {
  const eq = walletEquityFromMarket(state.wallet, market);
  const pnl = pnlPct(state, market);
  const windows = pnlWindows(state, market);
  const w = state.wallet;
  const vip = activeVipTier(state, market);
  const vol = volume30dUsdt(state, market);
  const vipProg = nextVipProgress(state, market);
  const labOn = isLabLoopbackApi();
  const deskOn = isDeskConnectEnabled();
  const labLive = useLabMatching();
  const session = labSessionLabel();
  const ledger = state.ledger.slice(0, 24);
  const calHtml = renderPnlCalendarHtml(dailyPnlCalendar(state, market, 28));
  const hidden = isBalanceHidden();
  const dayPnl = todayPnl(state, market);
  const denom = getEquityDenom();
  const eqView = equityInDenom(eq, market, denom);
  const assetRows = buildAssetPortfolioRows(state, market);
  // Any positive free balance counts — USDT-only wallets are real inventory after deposit.
  const hasSpotInventory = assetRows.some((r) => r.amount > 0 || r.usdtValue > 0);
  const acctTab = loadAcctTab();
  const hideSmall = loadAcctHideSmall();

  return `
  <section class="account-page glass">
    <header class="acct-head">
      <div>
        <p class="kicker">Wallet</p>
        <h2>Account</h2>
        <p class="muted small acct-sub">${modeBlurb()} · <span class="mono">${escapeHtml(INTEGRATION.mode)}</span></p>
      </div>
      <div class="acct-vip-pill" title="Demo VIP from local trade history">
        <span class="vip-badge"><span class="vip-name">${vip.name}</span></span>
        <span class="muted small mono">${formatBps(vip.makerBps)} / ${formatBps(vip.takerBps)}</span>
      </div>
    </header>

    <div class="acct-top-grid">
      <article class="acct-portfolio glass-inset" id="acct-portfolio">
        <div class="acct-portfolio-main">
          <div class="acct-portfolio-label">
            <span class="muted small">Est. total value</span>
            <button type="button" class="acct-eye-btn" id="acct-toggle-balance" aria-pressed="${hidden}" title="${hidden ? "Show balances" : "Hide balances"}">
              ${hidden ? Ico.eyeOff() : Ico.eye()}
            </button>
          </div>
          <p class="account-eq mono" id="acct-total-eq" data-hidden="${hidden ? "1" : "0"}" data-denom="${denom}">
            ${maskBalance(eqView.primary, hidden)} <span class="acct-eq-unit muted" id="acct-eq-unit">${eqView.unit}</span>
          </p>
          <p class="acct-fiat muted small" id="acct-fiat-eq">${maskBalance(eqView.secondary, hidden)}</p>
          ${formatTodayPnlHtml(dayPnl, market, denom, hidden)}
          <p class="acct-alltime muted small mono ${pnl >= 0 ? "up" : "down"}">All-time ${pnl >= 0 ? "+" : ""}${formatNum(pnl, 2)}%</p>
          <div id="acct-denom-host">${renderDenomRing(denom)}</div>
          <div class="acct-quick-actions">
            ${
              labOn || (!!deskOn && (!!opts?.deskEdge?.depositEnabled || !!opts?.deskEdge?.withdrawEnabled))
                ? labOn
                  ? `<button type="button" class="acct-qa-btn primary" id="btn-acct-deposit" data-cash-tab="deposit">Deposit</button>
            <button type="button" class="acct-qa-btn primary" id="btn-acct-withdraw" data-cash-tab="withdraw">Withdraw</button>`
                  : `<button type="button" class="acct-qa-btn ${opts?.deskEdge?.depositEnabled ? "primary" : "muted"}" id="btn-acct-deposit" data-cash-tab="deposit"${opts?.deskEdge?.depositEnabled ? "" : ' title="Live deposit on HOLD"'}>${opts?.deskEdge?.depositEnabled ? "Deposit" : "Deposit · HOLD"}</button>
            <button type="button" class="acct-qa-btn ${opts?.deskEdge?.withdrawEnabled ? "primary" : "muted"}" id="btn-acct-withdraw" data-cash-tab="withdraw"${opts?.deskEdge?.withdrawEnabled ? ' title="Requires TOTP / recovery"' : ' title="Live withdraw on HOLD"'}>${opts?.deskEdge?.withdrawEnabled ? "Withdraw" : "Withdraw · HOLD"}</button>`
                : `<button type="button" class="acct-qa-btn muted" id="btn-acct-deposit" data-cash-tab="deposit" title="Live deposit on HOLD">Deposit · HOLD</button>
            <button type="button" class="acct-qa-btn muted" id="btn-acct-withdraw" data-cash-tab="withdraw" title="Live withdraw on HOLD">Withdraw · HOLD</button>`
            }
            <button type="button" class="acct-qa-btn" data-goto-view="convert">Convert</button>
            <button type="button" class="acct-qa-btn muted" id="btn-acct-history">History</button>
          </div>
        </div>
        <div class="acct-portfolio-chart" id="acct-portfolio-30d">${portfolioEquityChart30d(state.equitySnapshots, { market, denom, hidden, initialEquityUsdt: state.initialEquityUsdt })}</div>
      </article>

      ${renderCashDock(labOn, labLive, session, opts)}
    </div>

    <section class="acct-assets-panel glass-inset" id="acct-balances">
      <header class="acct-assets-head">
        <div class="acct-assets-tabs" role="tablist" aria-label="Wallet views">
          <button type="button" class="acct-tab${acctTab === "assets" ? " active" : ""}" data-acct-tab="assets" role="tab" aria-selected="${acctTab === "assets"}">Assets</button>
          <button type="button" class="acct-tab${acctTab === "account" ? " active" : ""}" data-acct-tab="account" role="tab" aria-selected="${acctTab === "account"}">Overview</button>
        </div>
        <div class="acct-assets-tools">
          <label class="acct-search-wrap">${Ico.search()}
            <input type="search" id="acct-asset-search" class="acct-search" placeholder="Search" autocomplete="off" />
          </label>
          <a class="acct-tool-link" href="#convert">Convert dust</a>
          <label class="acct-hide-small">
            <input type="checkbox" id="acct-hide-small" ${hideSmall ? "checked" : ""} />
            Hide &lt; 1 USD
          </label>
        </div>
      </header>

      <div class="acct-tab-panel" data-acct-panel="assets" id="account-funds"${acctTab !== "assets" ? " hidden" : ""}>
        ${!hasSpotInventory ? `<div class="acct-positions-empty">${renderSpotEmptyState("positions")}</div>` : ""}
        <table class="acct-asset-table data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Amount</th>
              <th>Price / Cost</th>
              <th>Floating PnL</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody id="acct-asset-tbody">
            ${renderAssetTableRows(assetRows, hidden, eq)}
            <tr class="total" data-asset="EQ">
              <td>Total</td>
              <td></td>
              <td></td>
              <td></td>
              <td class="mono" data-col="usdt">${maskBalance(formatNum(eq, 2), hidden)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="acct-tab-panel" data-acct-panel="account"${acctTab !== "account" ? " hidden" : ""}>
        <div class="acct-account-view">
          <div class="acct-vip-row">
            <span class="vip-badge lg" title="Demo VIP from local trade history">
              <span class="vip-name">${vip.name}</span>
              <span class="vip-rates">${formatBps(vip.makerBps)} / ${formatBps(vip.takerBps)}</span>
              <span class="vip-demo muted small">demo</span>
            </span>
            <div class="vip-progress">
              <div class="vip-bar"><i style="width:${vipProg.pct.toFixed(0)}%"></i></div>
              <p class="muted small">${
                vipProg.next
                  ? `${formatNum(vol, 0)} / ${formatNum(vipProg.next.minVolUsdt, 0)} USDT · need ${formatNum(vipProg.remaining, 0)} → ${vipProg.next.name}`
                  : `${formatNum(vol, 0)} USDT · top VIP`
              }</p>
            </div>
          </div>
          <div id="acct-alloc-host">${allocationBars(w, market, eq)}</div>
          <div class="pnl-cards compact">
            ${windows
              .map((x) => {
                const pnlFmt = formatPnlAbsInDenom(x.abs, market, denom);
                return `<article class="pnl-card glass-inset">
                  <span class="muted small">${x.label}</span>
                  <strong class="mono ${x.pct >= 0 ? "up" : "down"}">${formatPct(x.pct)}</strong>
                  <span class="dim mono">${maskBalance(`${pnlFmt.amount} ${pnlFmt.unit}`, hidden)}</span>
                </article>`;
              })
              .join("")}
          </div>
        </div>
      </div>
    </section>

    <section class="acct-promo-row" aria-label="Quick links">
      <a class="acct-promo-card glass-inset" href="#spot/HMC_USDT/15m">
        <span class="acct-promo-tag">Spot</span>
        <strong>HMC/USDT</strong>
        <span class="mono" data-acct-promo-mid="hmc">${formatPrice(market.hmcUsdt)}</span>
        <span class="muted small">Limit &amp; market orders</span>
      </a>
      <a class="acct-promo-card glass-inset" href="#convert">
        <span class="acct-promo-tag">Convert</span>
        <strong>Instant swap</strong>
        <span class="muted small">Paper convert between assets</span>
      </a>
      <a class="acct-promo-card glass-inset" href="#pool">
        <span class="acct-promo-tag">Pool</span>
        <strong>Mining</strong>
        <span class="muted small">Useful-PoW · HMC accrual</span>
      </a>
    </section>

    <section class="acct-recent glass-inset" id="acct-recent-tx">
      <header class="acct-recent-head">
        <h3>Recent transactions</h3>
        <a class="acct-more-link" href="#acct-activity">View all →</a>
      </header>
      <div id="acct-recent-tx-body">${renderRecentTxTable(state, hidden)}</div>
    </section>

    ${renderMultiWalletCard(buildMultiWalletSlices(state, opts), market)}

    ${renderDustPanel(w, market, "usdt", state)}

    ${renderFeesBlock(state, market, vip, vol)}

    ${
      deskOn
        ? (() => {
            const custodyOn = !!opts?.deskEdge?.depositEnabled;
            const wdOn = !!opts?.deskEdge?.withdrawEnabled;
            const matchLive = isDeskMatchingLive(opts?.deskEdge?.matching);
            const badge = custodyOn || matchLive ? "DESK · LIVE" : "DESK · HOLD";
            const summary = custodyOn || matchLive ? "Desk session" : "Desk session (HOLD)";
            return `<details class="acct-panel" id="acct-desk" open>
      <summary>${summary}</summary>
      <article class="glass-inset account-card lab-api-card acct-desk-card">
        <div class="acct-lab-status">
          <span class="lab-badge">${badge}</span>
          <p class="muted small">Session: <strong class="mono" id="desk-session-addr">${escapeHtml(session.label)}</strong></p>
        </div>
        ${renderDeskHoldPills(opts?.deskEdge)}
        <div class="lab-action-row lab-session-primary">
          <button type="button" class="btn-lab btn-lab-primary" id="btn-desk-wallet-connect">${session.live ? "Reconnect" : "Connect"}</button>
          <button type="button" class="btn-lab" id="btn-desk-api-sync">↻ Sync</button>
          <button type="button" class="btn-lab" id="btn-desk-copy-addr" ${session.address || session.live ? "" : "disabled"} title="${
              custodyOn ? "Copy login address — NOT for deposits" : "Copy HMC address"
            }">Copy login</button>
          <button type="button" class="btn-lab btn-lab-muted" id="btn-desk-api-logout" ${session.live ? "" : "disabled"}>Logout</button>
        </div>
        <details class="acct-desk-advanced">
          <summary>Backup &amp; advanced</summary>
          <div class="lab-action-row">
            <button type="button" class="btn-lab btn-lab-muted" id="btn-desk-export-seed" title="Download secret seed backup JSON">Export seed…</button>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-desk-import-seed" title="Import seed from phone/PC backup">Import seed…</button>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-desk-api-revoke" ${session.live ? "" : "disabled"} title="Invalidate all sessions for this address">Revoke all</button>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-desk-new-key" title="Clear sessionStorage seed and create a new address">New wallet…</button>
          </div>
          <input type="file" id="desk-seed-import-file" accept="application/json,.json,.txt,text/plain" class="hidden" />
          ${
            custodyOn
              ? `<p class="muted small acct-dep-warn"><strong>Copy login ≠ deposit.</strong> Use Deposit tab for the on-chain address.</p>`
              : ""
          }
        </details>
        <p id="desk-api-msg" class="muted small sync-msg" role="status"></p>
      </article>
      ${renderSecurity2faCard(session.live, { withdrawEnabled: wdOn, deskMode: true })}
    </details>`;
          })()
        : ""
    }

    ${
      labOn
        ? `<details class="acct-panel" id="acct-lab">
      <summary>Lab session &amp; security</summary>
      <article class="glass-inset account-card lab-api-card">
        <div class="acct-lab-status">
          <span class="lab-badge">DEMO · LAB</span>
          <p class="muted small">Session: <strong class="mono" id="lab-session-addr">${escapeHtml(session.label)}</strong></p>
        </div>
        <div class="lab-action-grid lab-session-actions">
          <button type="button" class="btn-lab btn-lab-primary" id="btn-lab-fixture-connect">Connect fixture</button>
          <button type="button" class="btn-lab" id="btn-lab-api-sync">↻ Sync balances</button>
          <button type="button" class="btn-lab btn-lab-accent" id="btn-lab-counterparty" title="Second fixture wallet crosses your resting order">Counterparty bot</button>
          <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-api-logout">Logout</button>
          <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-revoke-all" title="Invalidate all sessions">Revoke all</button>
        </div>
        <p class="muted small">Spot limit → Counterparty bot (self-trade blocked). Fixture key is lab-only — never fund it.</p>
        <p id="lab-api-msg" class="muted small sync-msg" role="status"></p>
        <div class="fund-btns spaced">
          <button type="button" class="btn-sm" id="btn-sync-node">↻ Sync HMC/SUP from node</button>
          <a class="btn-sm btn-secondary" href="${escapeHtml(nodeWalletUrl())}" id="link-acct-wallet" target="_blank" rel="noopener noreferrer">${isHubEmbed() ? "Hub wallet" : "Node wallet"}</a>
        </div>
        <p id="sync-node-msg" class="muted small sync-msg"></p>
      </article>
      ${renderSecurity2faCard(labLive, { withdrawEnabled: true, deskMode: false })}
    </details>`
        : ""
    }

    ${renderActivityBlock(state.ledger, calHtml, labLive, session)}

    ${renderRoadmapBlock()}
  </section>`;
}

function applyAssetFilters(): void {
  const q = (document.getElementById("acct-asset-search") as HTMLInputElement | null)?.value.trim().toLowerCase() ?? "";
  const hideSmall = (document.getElementById("acct-hide-small") as HTMLInputElement | null)?.checked ?? false;
  document.querySelectorAll<HTMLElement>(".acct-asset-row").forEach((row) => {
    const sym = row.dataset.asset ?? "";
    const val = parseFloat(row.dataset.usdtValue ?? "0");
    const text = row.textContent?.toLowerCase() ?? "";
    const matchQ = !q || sym.toLowerCase().includes(q) || text.includes(q);
    const matchSize = !hideSmall || val >= 1;
    const hide = !(matchQ && matchSize);
    row.hidden = hide;
    const detail = document.querySelector(`[data-asset-detail="${sym}"]`) as HTMLElement | null;
    if (detail && hide) detail.hidden = true;
  });
}

function applyBalanceVisibility(hidden: boolean): void {
  document.querySelectorAll<HTMLElement>("[data-hidden]").forEach((el) => {
    el.dataset.hidden = hidden ? "1" : "0";
  });
  const eye = document.getElementById("acct-toggle-balance");
  if (eye) {
    eye.setAttribute("aria-pressed", hidden ? "true" : "false");
    eye.title = hidden ? "Show balances" : "Hide balances";
    eye.innerHTML = hidden ? Ico.eyeOff() : Ico.eye();
  }
}

export function wireAccountFunding(state: DemoState, market: MarketSnapshot, onUpdate: () => void): void {
  const page = document.querySelector(".account-page");
  if (!page || page.getAttribute("data-acct-wired") === "1") return;
  page.setAttribute("data-acct-wired", "1");

  document.querySelectorAll("#link-acct-wallet").forEach((el) => {
    el.addEventListener("click", (ev) => {
      if (isHubEmbed() && postHubGotoTab("wallet")) {
        ev.preventDefault();
      }
    });
  });

  document.getElementById("acct-pay-hmc")?.addEventListener("change", (e) => {
    state.feeConfig.payFeesInHmc = (e.target as HTMLInputElement).checked;
    onUpdate();
  });

  const filters = document.getElementById("acct-ledger-filters");
  if (filters && filters.getAttribute("data-wired") !== "1") {
    filters.setAttribute("data-wired", "1");
    filters.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest?.("[data-ledger-filter]") as HTMLElement | null;
      if (!btn || !filters.contains(btn)) return;
      const f = btn.dataset.ledgerFilter || "all";
      filters.querySelectorAll("[data-ledger-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const list = document.getElementById("acct-ledger-list");
      if (!list) return;
      list.querySelectorAll("li").forEach((li) => {
        const kind = (li as HTMLElement).dataset.ledgerKind || "other";
        (li as HTMLElement).hidden = !(f === "all" || kind === f);
      });
    });
  }

  document.getElementById("acct-toggle-balance")?.addEventListener("click", () => {
    const next = !isBalanceHidden();
    setBalanceHidden(next);
    applyBalanceVisibility(next);
    patchAccountFundsDom(state, market);
  });

  document.getElementById("acct-asset-search")?.addEventListener("input", applyAssetFilters);
  document.getElementById("acct-hide-small")?.addEventListener("change", (e) => {
    saveAcctHideSmall((e.target as HTMLInputElement).checked);
    applyAssetFilters();
  });

  document.querySelectorAll("[data-acct-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = ((btn as HTMLElement).dataset.acctTab ?? "assets") as "assets" | "account";
      saveAcctTab(tab);
      document.querySelectorAll("[data-acct-tab]").forEach((b) => {
        const on = (b as HTMLElement).dataset.acctTab === tab;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      document.querySelectorAll("[data-acct-panel]").forEach((panel) => {
        const on = (panel as HTMLElement).dataset.acctPanel === tab;
        (panel as HTMLElement).hidden = !on;
      });
    });
  });

  document.querySelectorAll("[data-asset-expand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sym = (btn as HTMLElement).dataset.assetExpand ?? "";
      const detail = document.querySelector(`[data-asset-detail="${sym}"]`) as HTMLElement | null;
      if (!detail) return;
      const open = detail.hidden;
      detail.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  const switchCashTab = (tab: "deposit" | "withdraw") => {
    document.querySelectorAll("[data-cash-tab]").forEach((btn) => {
      const on = (btn as HTMLElement).dataset.cashTab === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-cash-panel]").forEach((panel) => {
      const on = (panel as HTMLElement).dataset.cashPanel === tab;
      (panel as HTMLElement).hidden = !on;
    });
    document.getElementById("acct-cash")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (tab === "withdraw") document.getElementById("lab-wd-amt")?.focus();
  };

  document.querySelectorAll("[data-cash-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = (btn as HTMLElement).dataset.cashTab as "deposit" | "withdraw";
      if (tab) switchCashTab(tab);
    });
  });

  document.getElementById("btn-acct-deposit")?.addEventListener("click", () => switchCashTab("deposit"));
  document.getElementById("btn-acct-withdraw")?.addEventListener("click", () => switchCashTab("withdraw"));
  document.getElementById("btn-acct-jump-2fa")?.addEventListener("click", () => {
    document.getElementById("acct-desk")?.setAttribute("open", "");
    document.getElementById("acct-security-2fa")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.getElementById("btn-acct-history")?.addEventListener("click", () => {
    document.getElementById("acct-activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelectorAll(DENOM_ORB_SEL).forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = (btn as HTMLElement).dataset.denom as EquityDenom | undefined;
      if (!d) return;
      setEquityDenom(d);
      document.querySelectorAll(DENOM_ORB_SEL).forEach((orb) => {
        const on = (orb as HTMLElement).dataset.denom === d;
        orb.classList.toggle("active", on);
        orb.setAttribute("aria-checked", on ? "true" : "false");
      });
      patchAccountFundsDom(state, market);
    });
  });

  document.querySelectorAll("[data-goto-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = (btn as HTMLElement).dataset.gotoView;
      if (view) location.hash = `#${view}`;
    });
  });

  applyBalanceVisibility(isBalanceHidden());
  applyAssetFilters();
  wirePortfolioEquityChart(page);
}

/**
 * Soft-update Account balances / equity / allocation without remounting the page
 * (keeps Asset roadmap, withdraw form, open CLI details intact).
 */
export function patchAccountFundsDom(state: DemoState, market: MarketSnapshot, opts?: AccountPageOpts): void {
  const w = state.wallet;
  const eq = walletEquityFromMarket(w, market);
  const hidden = isBalanceHidden();
  const assetRows = buildAssetPortfolioRows(state, market);
  const dayPnl = todayPnl(state, market);
  const denom = getEquityDenom();

  for (const r of assetRows) {
    const tr = document.querySelector(`tr.acct-asset-row[data-asset="${r.symbol}"]`) as HTMLElement | null;
    if (!tr) continue;
    const decimals = r.symbol === "BTC" ? 8 : r.symbol === "USDT" ? 2 : 4;
    const amtStr = r.symbol === "BTC" ? formatPrice(r.amount) : formatNum(r.amount, decimals);
    const priceStr = r.symbol === "USDT" ? "1.00" : formatPrice(r.price);
    const valueStr = formatNum(r.usdtValue, 2);
    const costStr = formatNum(r.costBasisUsdt, 2);
    const pnlStr = `${r.floatingPnl >= 0 ? "+" : ""}${formatNum(r.floatingPnl, 2)} (${formatPct(r.floatingPnlPct)})`;
    const pnlCls = r.floatingPnl >= 0 ? "up" : "down";
    const reservedStr = formatNum(r.reserved, decimals);
    const availStr = formatNum(Math.max(0, r.amount - r.reserved), decimals);

    tr.querySelector('[data-col="free"]')!.textContent = maskBalance(amtStr, hidden);
    tr.querySelector('[data-col="usdt"]')!.textContent = maskBalance(valueStr, hidden);
    const pnlEl = tr.querySelector('[data-col="pnl"]');
    if (pnlEl) {
      pnlEl.textContent = hidden ? "****" : pnlStr;
      pnlEl.classList.remove("up", "down");
      pnlEl.classList.add(pnlCls);
    }
    const priceCell = tr.querySelector(".acct-asset-price");
    if (priceCell) {
      priceCell.innerHTML = `<span>${maskBalance(priceStr, hidden)}</span><span class="muted small acct-cost-line">Cost ${maskBalance(costStr, hidden)}</span>`;
    }
    tr.dataset.usdtValue = r.usdtValue.toFixed(4);

    const detail = document.querySelector(`[data-asset-detail="${r.symbol}"]`);
    if (detail) {
      detail.querySelectorAll<HTMLElement>("[data-raw]").forEach((el) => {
        const slot = el.dataset.rawSlot;
        const raw = slot === "reserved" ? reservedStr : slot === "avail" ? availStr : el.dataset.raw;
        if (raw != null) {
          el.dataset.raw = raw;
          el.textContent = maskBalance(raw, hidden);
        }
      });
      const allocPct = eq > 0 ? (r.usdtValue / eq) * 100 : 0;
      const allocStrong = detail.querySelector(".acct-asset-detail-inner > span:first-child strong.mono");
      if (allocStrong) allocStrong.textContent = `${allocPct.toFixed(1)}%`;
    }
  }

  const eqRow = document.querySelector('tr[data-asset="EQ"] [data-col="usdt"]');
  if (eqRow) eqRow.textContent = maskBalance(formatNum(eq, 2), hidden);

  const eqView = equityInDenom(eq, market, denom);
  const eqHero = document.getElementById("acct-total-eq");
  if (eqHero) {
    eqHero.innerHTML = `${maskBalance(eqView.primary, hidden)} <span class="acct-eq-unit muted" id="acct-eq-unit">${eqView.unit}</span>`;
    eqHero.dataset.hidden = hidden ? "1" : "0";
    eqHero.dataset.denom = denom;
  }

  const fiat = document.getElementById("acct-fiat-eq");
  if (fiat) fiat.textContent = maskBalance(eqView.secondary, hidden);

  const todayEl = document.getElementById("acct-today-pnl");
  if (todayEl) {
    const replacement = formatTodayPnlHtml(dayPnl, market, denom, hidden);
    const wrap = document.createElement("div");
    wrap.innerHTML = replacement;
    const next = wrap.firstElementChild;
    if (next) todayEl.replaceWith(next);
  }

  const allTime = document.querySelector(".acct-alltime");
  if (allTime) {
    const pnl = pnlPct(state, market);
    allTime.className = `acct-alltime muted small mono ${pnl >= 0 ? "up" : "down"}`;
    allTime.textContent = `All-time ${pnl >= 0 ? "+" : ""}${formatNum(pnl, 2)}%`;
  }

  const pnlHost = document.querySelector(".acct-account-view .pnl-cards.compact");
  if (pnlHost) {
    const windows = pnlWindows(state, market);
    pnlHost.innerHTML = windows
      .map((x) => {
        const pnlFmt = formatPnlAbsInDenom(x.abs, market, denom);
        return `<article class="pnl-card glass-inset">
          <span class="muted small">${x.label}</span>
          <strong class="mono ${x.pct >= 0 ? "up" : "down"}">${formatPct(x.pct)}</strong>
          <span class="dim mono">${maskBalance(`${pnlFmt.amount} ${pnlFmt.unit}`, hidden)}</span>
        </article>`;
      })
      .join("");
  }

  const recentHost = document.getElementById("acct-recent-tx-body");
  if (recentHost) recentHost.innerHTML = renderRecentTxTable(state, hidden);

  refreshPortfolioChartHtml(state.equitySnapshots, {
    market,
    denom,
    hidden,
    initialEquityUsdt: state.initialEquityUsdt,
  });

  document.querySelectorAll<HTMLElement>(".acct-tx-table [data-raw-amt]").forEach((cell) => {
    const raw = cell.dataset.rawAmt ?? "";
    cell.textContent = maskBalance(raw, hidden);
  });

  document.querySelectorAll<HTMLElement>(".acct-asset-detail-inner").forEach((row) => {
    row.querySelectorAll("strong.mono").forEach((el) => {
      const raw = (el as HTMLElement).dataset.raw;
      if (raw != null) el.textContent = maskBalance(raw, hidden);
    });
  });

  const host = document.getElementById("acct-alloc-host");
  if (host) host.innerHTML = allocationBars(w, market, eq);

  const acctMids: Record<string, string> = {
    hmc: formatPrice(market.hmcUsdt),
    sup: formatPrice(market.supUsdt),
    btc: `$${formatNum(market.btcUsd, 0)}`,
  };
  for (const [key, value] of Object.entries(acctMids)) {
    const el = document.querySelector(`[data-acct-oracle-mid="${key}"]`);
    if (el) el.textContent = value;
  }
  const promoHmc = document.querySelector('[data-acct-promo-mid="hmc"]');
  if (promoHmc) promoHmc.textContent = formatPrice(market.hmcUsdt);

  const paperBal = document.querySelector('[data-wallet-slice="paper"] .multi-wallet-bal .mono');
  if (paperBal) {
    const paperUsdt =
      w.usdt + w.hmc * market.hmcUsdt + w.sup * market.supUsdt + w.btc * market.btcUsd;
    paperBal.textContent = `${formatNum(paperUsdt, 2)} USDT`;
  }

  for (const slice of buildMultiWalletSlices(state, opts)) {
    if (slice.id === "paper") continue;
    const row = document.querySelector(`[data-wallet-slice="${slice.id}"]`);
    if (!row) continue;
    const usdt =
      slice.wallet.usdt +
      slice.wallet.hmc * market.hmcUsdt +
      slice.wallet.sup * market.supUsdt +
      slice.wallet.btc * market.btcUsd;
    const mono = row.querySelector(".multi-wallet-bal .mono");
    if (mono) mono.textContent = `${formatNum(usdt, 2)} USDT`;
  }

  const dustEl = document.getElementById("acct-dust");
  if (dustEl) {
    const wrap = document.createElement("div");
    wrap.innerHTML = renderDustPanel(w, market, "usdt", state);
    const next = wrap.firstElementChild;
    if (next) dustEl.replaceWith(next);
  }

  syncDenomRingDom(denom);

  const sess = document.getElementById("lab-session-addr");
  if (sess) sess.textContent = labSessionLabel().label;

  const fundsPanel = document.getElementById("account-funds");
  if (fundsPanel) {
    const hasInv = assetRows.some((r) => r.amount > 0 || r.usdtValue > 0);
    let empty = fundsPanel.querySelector(".acct-positions-empty") as HTMLElement | null;
    if (hasInv) {
      empty?.remove();
    } else if (!empty) {
      empty = document.createElement("div");
      empty.className = "acct-positions-empty";
      empty.innerHTML = renderSpotEmptyState("positions");
      fundsPanel.prepend(empty);
    }
  }
}
