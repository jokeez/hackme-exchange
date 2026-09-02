import { INTEGRATION, isDemoMode, isLabApiEnabled, isLiveModeBlocked } from "./config/integration";
import { labSessionLabel } from "./adapters/exchangeApi";
import { useLabMatching } from "./adapters/labMatching";
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
  equitySparklineSvg,
  formatTxTime,
  getEquityDenom,
  isBalanceHidden,
  maskBalance,
  recentTransactions,
  renderAssetTableRows,
  renderDenomRing,
  setBalanceHidden,
  setEquityDenom,
  todayPnl,
  type EquityDenom,
} from "./accountPortfolio";
import type { DemoState, MarketSnapshot } from "./types";

export type AccountPageOpts = {
  /** Lab fee-collection address from /health `fee_wallet` (omit → hide row). */
  feeWallet?: string | null;
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
  if (isLabApiEnabled()) return useLabMatching() ? "lab ledger connected" : "LAB ready · connect fixture below";
  if (isDemoMode()) return "paper wallet";
  return "paper / synthetic";
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

function renderDepositCard(labOn: boolean, labLive: boolean, session: ReturnType<typeof labSessionLabel>): string {
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
              : `<div class="acct-cash-actions">
            <button type="button" class="btn-sm" id="btn-sync-node">↻ Sync HMC/SUP from node</button>
            <a class="btn-sm btn-secondary" href="${escapeHtml(nodeWalletUrl())}" id="link-acct-wallet" target="_blank" rel="noopener noreferrer">${isHubEmbed() ? "Open Hub wallet" : "Open node wallet"}</a>
          </div>
          <p id="sync-node-msg" class="muted small sync-msg"></p>
          <p class="muted small acct-cash-hint">No demo +USDT/+HMC. Enable loopback LAB API for paper mint.</p>`
          }
        </article>`;
}

function renderWithdrawCard(labOn: boolean, labLive: boolean): string {
  return `
        <article class="acct-cash-card withdraw">
          <div class="acct-cash-title">
            <span class="acct-cash-ico withdraw" aria-hidden="true">↑</span>
            <div>
              <h4>Withdraw</h4>
              <p class="muted small">Request only · complete via CLI</p>
            </div>
          </div>
          ${
            labOn
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
            <p class="muted small lab-wd-dest-hint">HMC → <code>HMC-</code>+16 hex · SUP/USDT/BTC → paper stubs e.g. <code>paper-usdt-ops-wallet-01</code> (not deposit addresses)</p>
            <label class="lab-field">2FA
              <input id="lab-wd-2fa" class="mono" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="if enabled" />
            </label>
          </div>
          <p id="lab-wd-fee-quote" class="muted small lab-fee-quote" role="status">Fee quote appears after amount · GET /fees/custody</p>
          <p id="lab-custody-pause" class="muted small lab-pause-hint" hidden></p>
          <div class="lab-action-row">
            <button type="button" class="btn-lab btn-lab-primary" id="btn-lab-wd-request"${labLive ? "" : " disabled title=\"Connect fixture first\""}>Request withdraw</button>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-wd-refresh"${labLive ? "" : " disabled"}>↻ List</button>
            <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-wd-quote"${labLive ? "" : " disabled"}>Quote fee</button>
          </div>
          <p id="lab-wd-msg" class="muted small sync-msg" role="status"></p>
          <ul id="lab-wd-list" class="lab-wd-list mono small" aria-live="polite"><li class="dim">No withdraw requests yet</li></ul>`
              : `<p class="muted small acct-cash-hint">Withdraw requests need private LAB API (loopback). Use node wallet for on-chain HMC/SUP.</p>
          <div class="acct-cash-actions">
            <a class="btn-sm btn-secondary" href="${escapeHtml(nodeWalletUrl())}" target="_blank" rel="noopener noreferrer">Node wallet →</a>
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
  return `
    <section class="acct-cash-dock glass-inset${labOn ? " lab-custody-card" : ""}" id="acct-cash" aria-label="Deposit and withdraw">
      <div class="acct-cash-tabs" role="tablist" aria-label="Funds">
        <button type="button" class="acct-cash-tab active" data-cash-tab="deposit" role="tab" aria-selected="true">Deposit</button>
        <button type="button" class="acct-cash-tab" data-cash-tab="withdraw" role="tab" aria-selected="false">Withdraw</button>
      </div>
      <p class="muted small acct-cash-intro">${
        labLive
          ? "Lab ledger active — mint paper USDT/BTC or request withdraw"
          : labOn
            ? "Connect fixture once, then deposit / withdraw here"
            : "Sync HMC/SUP from node · LAB unlocks paper mint & withdraw"
      }</p>
      <div class="acct-cash-panel" data-cash-panel="deposit" id="acct-cash-deposit">
        ${renderDepositCard(labOn, labLive, session)}
      </div>
      <div class="acct-cash-panel" data-cash-panel="withdraw" id="acct-cash-withdraw" hidden>
        ${renderWithdrawCard(labOn, labLive)}
      </div>
      ${
        labOn
          ? `<details class="lab-ops acct-cash-ops" data-ui="wd-complete-cli">
        <summary>Operator complete withdraw (CLI)</summary>
        <pre class="mono small lab-cli-hint">curl -H "X-Admin-Token: $EXCHANGE_ADMIN_TOKEN" -H "Content-Type: application/json" \\
  -d '{"id":"WD_ID","tx_id":"lab-dry-run-1"}' \\
  http://127.0.0.1:18443/admin/withdraw/complete</pre>
      </details>
      ${labFeeWalletSection(opts?.feeWallet)}`
          : ""
      }
    </section>`;
}

function renderFeesBlock(state: DemoState, market: MarketSnapshot, vip: ReturnType<typeof activeVipTier>, vol: number): string {
  return `
    <section class="acct-fees-block glass-inset" id="acct-fees">
      <header class="acct-block-head">
        <h3>Fees · VIP · Oracle</h3>
        <p class="muted small">30d <strong class="mono">${formatNum(vol, 0)} USDT</strong> · ${feeScheduleLabel(state)}</p>
      </header>
      <div class="acct-fees-grid">
        <article class="acct-oracle-strip">
          <span class="acct-oracle-pill"><span class="muted">HMC</span> <strong class="mono">${formatPrice(market.hmcUsdt)}</strong></span>
          <span class="acct-oracle-pill"><span class="muted">SUP</span> <strong class="mono">${formatPrice(market.supUsdt)}</strong></span>
          <span class="acct-oracle-pill"><span class="muted">BTC</span> <strong class="mono">$${formatNum(market.btcUsd, 0)}</strong></span>
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
  const labOn = isLabApiEnabled();
  const labLive = useLabMatching();
  const session = labSessionLabel();
  const ledger = state.ledger.slice(0, 24);
  const calHtml = renderPnlCalendarHtml(dailyPnlCalendar(state, market, 28));
  const hidden = isBalanceHidden();
  const dayPnl = todayPnl(state, market);
  const denom = getEquityDenom();
  const eqView = equityInDenom(eq, market, denom);
  const assetRows = buildAssetPortfolioRows(state, market);
  const spark = equitySparklineSvg(state.equitySnapshots);

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
          <p class="acct-today-pnl ${dayPnl.abs >= 0 ? "up" : "down"} mono small" id="acct-today-pnl">
            Today's PnL <strong>${dayPnl.abs >= 0 ? "+" : ""}${maskBalance(formatNum(dayPnl.abs, 2), hidden)}</strong>
            <span class="dim">USDT (${formatPct(dayPnl.pct)})</span>
          </p>
          <p class="acct-alltime muted small mono ${pnl >= 0 ? "up" : "down"}">All-time ${pnl >= 0 ? "+" : ""}${formatNum(pnl, 2)}%</p>
          <div id="acct-denom-host">${renderDenomRing(denom)}</div>
          <div class="acct-quick-actions">
            <button type="button" class="acct-qa-btn primary" id="btn-acct-deposit" data-cash-tab="deposit">Deposit</button>
            <button type="button" class="acct-qa-btn primary" id="btn-acct-withdraw" data-cash-tab="withdraw">Withdraw</button>
            <button type="button" class="acct-qa-btn" data-goto-view="convert">Convert</button>
            <button type="button" class="acct-qa-btn muted" id="btn-acct-history">History</button>
          </div>
        </div>
        <div class="acct-portfolio-chart" id="acct-spark-host">${spark}</div>
      </article>

      ${renderCashDock(labOn, labLive, session, opts)}
    </div>

    <section class="acct-assets-panel glass-inset" id="acct-balances">
      <header class="acct-assets-head">
        <div class="acct-assets-tabs" role="tablist" aria-label="Wallet views">
          <button type="button" class="acct-tab active" data-acct-tab="assets" role="tab" aria-selected="true">Assets</button>
          <button type="button" class="acct-tab" data-acct-tab="account" role="tab" aria-selected="false">Overview</button>
        </div>
        <div class="acct-assets-tools">
          <label class="acct-search-wrap">${Ico.search()}
            <input type="search" id="acct-asset-search" class="acct-search" placeholder="Search" autocomplete="off" />
          </label>
          <a class="acct-tool-link" href="#convert">Convert dust</a>
          <label class="acct-hide-small">
            <input type="checkbox" id="acct-hide-small" />
            Hide &lt; 1 USD
          </label>
        </div>
      </header>

      <div class="acct-tab-panel" data-acct-panel="assets" id="account-funds">
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

      <div class="acct-tab-panel" data-acct-panel="account" hidden>
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
              .map(
                (x) => `<article class="pnl-card glass-inset">
                  <span class="muted small">${x.label}</span>
                  <strong class="mono ${x.pct >= 0 ? "up" : "down"}">${formatPct(x.pct)}</strong>
                  <span class="dim mono">${x.abs >= 0 ? "+" : ""}${formatNum(x.abs, 2)} USDT</span>
                </article>`,
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>

    <section class="acct-promo-row" aria-label="Quick links">
      <a class="acct-promo-card glass-inset" href="#spot/HMC_USDT/15m">
        <span class="acct-promo-tag">Spot</span>
        <strong>HMC/USDT</strong>
        <span class="mono">${formatPrice(market.hmcUsdt)}</span>
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

    ${renderFeesBlock(state, market, vip, vol)}

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
      <article class="glass-inset account-card lab-api-card" id="acct-security-2fa">
        <h4>Security · 2FA</h4>
        <p class="muted small">Authenticator app (TOTP) — required on withdraw when enabled.</p>
        <p id="lab-2fa-status" class="mono small" role="status">Status: unknown</p>
        <div id="lab-2fa-setup-panel" hidden>
          <p class="muted small">Add to Google Authenticator / Authy:</p>
          <p class="mono small lab-2fa-secret" id="lab-2fa-secret"></p>
          <a id="lab-2fa-otpauth" class="btn-sm btn-secondary" href="#" target="_blank" rel="noopener noreferrer">Open otpauth link</a>
          <label class="lab-field">Confirm code
            <input id="lab-2fa-confirm-code" class="mono" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 digits" />
          </label>
          <button type="button" class="btn-lab btn-lab-primary" id="btn-lab-2fa-confirm">Enable 2FA</button>
        </div>
        <div id="lab-2fa-enabled-panel" hidden>
          <label class="lab-field">Code to disable
            <input id="lab-2fa-disable-code" class="mono" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 digits" />
          </label>
          <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-2fa-disable">Disable 2FA</button>
        </div>
        <div id="lab-2fa-idle-panel">
          <button type="button" class="btn-lab btn-lab-primary" id="btn-lab-2fa-setup"${labLive ? "" : " disabled"}>Enable 2FA</button>
        </div>
        <p id="lab-2fa-msg" class="muted small sync-msg" role="status"></p>
      </article>
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

  const list = document.getElementById("acct-ledger-list");
  const filters = document.getElementById("acct-ledger-filters");
  if (list && filters) {
    filters.querySelectorAll("[data-ledger-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = (btn as HTMLElement).dataset.ledgerFilter || "all";
        filters.querySelectorAll("[data-ledger-filter]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        list.querySelectorAll("li").forEach((li) => {
          const kind = (li as HTMLElement).dataset.ledgerKind || "other";
          (li as HTMLElement).hidden = !(f === "all" || kind === f);
        });
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
  document.getElementById("acct-hide-small")?.addEventListener("change", applyAssetFilters);

  document.querySelectorAll("[data-acct-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = (btn as HTMLElement).dataset.acctTab ?? "assets";
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
  document.getElementById("btn-acct-history")?.addEventListener("click", () => {
    document.getElementById("acct-activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelectorAll("[data-denom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = (btn as HTMLElement).dataset.denom as EquityDenom | undefined;
      if (!d) return;
      setEquityDenom(d);
      document.querySelectorAll("[data-denom]").forEach((orb) => {
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
}

/**
 * Soft-update Account balances / equity / allocation without remounting the page
 * (keeps Asset roadmap, withdraw form, open CLI details intact).
 */
export function patchAccountFundsDom(state: DemoState, market: MarketSnapshot): void {
  const w = state.wallet;
  const eq = walletEquityFromMarket(w, market);
  const hidden = isBalanceHidden();
  const assetRows = buildAssetPortfolioRows(state, market);
  const dayPnl = todayPnl(state, market);

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
  }

  const eqRow = document.querySelector('tr[data-asset="EQ"] [data-col="usdt"]');
  if (eqRow) eqRow.textContent = maskBalance(formatNum(eq, 2), hidden);

  const denom = getEquityDenom();
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
    todayEl.classList.remove("up", "down");
    todayEl.classList.add(dayPnl.abs >= 0 ? "up" : "down");
    const pnlAbs = `${dayPnl.abs >= 0 ? "+" : ""}${maskBalance(formatNum(dayPnl.abs, 2), hidden)}`;
    todayEl.innerHTML = `Today's PnL <strong>${pnlAbs}</strong> <span class="dim">USDT (${formatPct(dayPnl.pct)})</span>`;
  }

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

  const sparkHost = document.getElementById("acct-spark-host");
  if (sparkHost) sparkHost.innerHTML = equitySparklineSvg(state.equitySnapshots);

  const sess = document.getElementById("lab-session-addr");
  if (sess) sess.textContent = labSessionLabel().label;
}
