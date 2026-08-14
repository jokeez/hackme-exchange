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
        // Tiny marks (e.g. HMC dust vs USDT) — show one decimal instead of rounding to "0%".
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

  return `
  <section class="account-page glass">
    <header class="acct-head">
      <div>
        <p class="kicker">Wallet</p>
        <h2>Account</h2>
        <p class="muted small acct-sub">${modeBlurb()} · <span class="mono">${INTEGRATION.mode}</span></p>
      </div>
      <div class="acct-head-actions">
        <a class="btn-sm btn-secondary" href="#acct-cash">Deposit / Withdraw</a>
        <a class="btn-sm btn-secondary" href="#acct-balances">Balances</a>
        <a class="btn-sm btn-secondary" href="#acct-activity">History</a>
      </div>
    </header>

    <div class="account-hero">
      <div class="acct-hero-main">
        <span class="muted small">Total equity</span>
        <p class="account-eq mono">${formatNum(eq, 2)} <span class="muted">USDT</span></p>
        <p class="${pnl >= 0 ? "up" : "down"} mono acct-alltime">All-time ${pnl >= 0 ? "+" : ""}${formatNum(pnl, 2)}%</p>
        <div class="acct-vip-row">
          <span class="vip-badge lg"><span class="vip-name">${vip.name}</span><span class="vip-rates">${formatBps(vip.makerBps)} / ${formatBps(vip.takerBps)}</span></span>
          <div class="vip-progress">
            <div class="vip-bar"><i style="width:${vipProg.pct.toFixed(0)}%"></i></div>
            <p class="muted small">${
              vipProg.next
                ? `${formatNum(vol, 0)} / ${formatNum(vipProg.next.minVolUsdt, 0)} USDT · need ${formatNum(vipProg.remaining, 0)} → ${vipProg.next.name}`
                : `${formatNum(vol, 0)} USDT · top VIP`
            }</p>
          </div>
        </div>
      </div>
      <div class="pnl-cards">
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

    <section class="acct-cash glass-inset${labOn ? " lab-custody-card" : ""}" id="acct-cash" aria-label="Deposit and withdraw">
      <header class="acct-cash-head">
        <div>
          <p class="acct-cash-kicker">Primary actions</p>
          <h3>Deposit &amp; Withdraw</h3>
        </div>
        <p class="muted small">${
          labLive
            ? "Lab ledger active — mint paper USDT/BTC or request withdraw"
            : labOn
              ? "Connect fixture once, then deposit / withdraw here"
              : "Sync HMC/SUP from node · LAB unlocks paper mint & withdraw"
        }</p>
      </header>
      <div class="acct-cash-grid">
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
        </article>

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
              <input id="lab-wd-2fa" class="mono" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="optional" />
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
        </article>
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
    </section>

    <div class="acct-sections">
      <section class="acct-section" id="acct-balances">
        <header class="acct-section-head">
          <h3>Balances</h3>
          <p class="muted small">${labLive ? "Lab ledger · Spot uses these balances" : "Paper wallet marks"}</p>
        </header>
        <div class="acct-section-grid acct-bal-grid">
          <article class="glass-inset account-card" id="account-funds">
            <table class="data-table funds-mini">
              <thead><tr><th>Asset</th><th>Free</th><th>≈ USDT</th></tr></thead>
              <tbody>
                <tr data-asset="USDT"><td>USDT</td><td class="mono" data-col="free">${formatNum(w.usdt, 2)}</td><td class="mono" data-col="usdt">${formatNum(w.usdt, 2)}</td></tr>
                <tr data-asset="HMC"><td>HMC</td><td class="mono" data-col="free">${formatNum(w.hmc, 4)}</td><td class="mono" data-col="usdt">${formatNum(w.hmc * market.hmcUsdt, 2)}</td></tr>
                <tr data-asset="SUP"><td>SUP</td><td class="mono" data-col="free">${formatNum(w.sup, 4)}</td><td class="mono" data-col="usdt">${formatNum(w.sup * market.supUsdt, 4)}</td></tr>
                <tr data-asset="BTC"><td>BTC</td><td class="mono" data-col="free">${formatPrice(w.btc)}</td><td class="mono" data-col="usdt">${formatNum(w.btc * market.btcUsd, 2)}</td></tr>
                <tr class="total" data-asset="EQ"><td>Equity</td><td></td><td class="mono" data-col="usdt">${formatNum(eq, 2)}</td></tr>
              </tbody>
            </table>
            <div id="acct-alloc-host">${allocationBars(w, market, eq)}</div>
            ${
              labLive
                ? `<div class="fund-btns spaced acct-quick-fund">
              <button type="button" class="btn-sm" data-lab-bridge="USDT">Quick +10 USDT</button>
              <button type="button" class="btn-sm" data-lab-bridge="BTC">Quick +0.01 BTC</button>
              <a class="btn-sm btn-secondary" href="#acct-cash">Deposit ↑</a>
            </div>`
                : labOn
                  ? `<div class="fund-btns spaced acct-quick-fund">
              <a class="btn-sm btn-secondary" href="#acct-lab">Connect LAB →</a>
            </div>`
                  : ""
            }
          </article>
          <article class="glass-inset account-card fee-card" id="acct-fees">
            <h4>Fees · VIP</h4>
            <p class="muted small">30d <strong class="mono">${formatNum(vol, 0)} USDT</strong> · ${feeScheduleLabel(state)}</p>
            <table class="fee-table">
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
            <label class="fee-toggle mono spaced">
              <input type="checkbox" id="acct-pay-hmc" ${state.feeConfig.payFeesInHmc ? "checked" : ""} />
              Pay fees in HMC (−${state.feeConfig.hmcDiscountPct}%)
            </label>
            <div class="acct-oracle-mini">
              <span class="muted small">Oracle</span>
              <span class="mono">HMC ${formatPrice(market.hmcUsdt)}</span>
              <span class="mono">SUP ${formatPrice(market.supUsdt)}</span>
              <span class="mono">BTC $${formatNum(market.btcUsd, 0)}</span>
            </div>
          </article>
        </div>
      </section>

      ${
        labOn
          ? `<section class="acct-section" id="acct-lab">
        <header class="acct-section-head">
          <h3>Lab session</h3>
          <p class="muted small mono">${escapeHtml(INTEGRATION.exchangeApiOrigin)}</p>
        </header>
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
      </section>`
          : ""
      }

      <section class="acct-section" id="acct-activity">
        <header class="acct-section-head">
          <h3>Activity</h3>
          <p class="muted small">Ledger · fills · daily PnL</p>
        </header>
        <div class="acct-section-grid acct-activity-grid">
          <article class="glass-inset account-card" id="account-ledger">
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
              ledger.length
                ? `<ul class="pool-list mono ledger-mini" id="acct-ledger-list">
              ${ledger
                .map((r) => {
                  const bucket = r.kind === "trade" || r.kind === "fee" ? r.kind : "other";
                  return `<li data-ledger-kind="${bucket}"><span class="${r.amount >= 0 ? "up" : "down"}">${escapeHtml(r.kind)}</span> ${escapeHtml(r.asset)} <strong>${formatNum(r.amount, 4)}</strong> <span class="dim">${escapeHtml(r.note || "")}</span></li>`;
                })
                .join("")}
            </ul>`
                : `<p class="muted small">No history yet — trades and converts show up here.</p>`
            }
          </article>
          <article class="glass-inset account-card" id="account-lab-fills">
            <div class="acct-card-title-row">
              <h4>Lab fills</h4>
              <button type="button" class="btn-lab btn-lab-muted" id="btn-lab-fills-refresh"${labLive ? "" : " disabled"}>↻ Sync</button>
            </div>
            <p class="muted small">Server SQLite history · GET /fills</p>
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
      </section>

      <section class="acct-section acct-roadmap" id="acct-roadmap">
        <details class="acct-details" data-ui="asset-roadmap" id="acct-roadmap-details">
          <summary>Asset roadmap</summary>
          <table class="fee-table asset-roadmap">
            <thead><tr><th>Asset</th><th>Settlement</th><th>Exchange</th><th>Wallet tab</th></tr></thead>
            <tbody>
              ${ASSET_REGISTRY.map(
                (a) => `<tr>
                <td>${a.symbol}</td>
                <td class="dim">${a.settlement}</td>
                <td>${a.exchangeEnabled ? "✓" : "—"}</td>
                <td>${a.walletTabPlanned ? "planned" : "—"}</td>
              </tr>`,
              ).join("")}
              ${PLANNED_ASSETS.map(
                (a) => `<tr class="dim">
                <td>${a.symbol}</td>
                <td>${a.settlement}</td>
                <td>—</td>
                <td>future</td>
              </tr>`,
              ).join("")}
            </tbody>
          </table>
        </details>
      </section>
    </div>
  </section>`;
}

export function wireAccountFunding(state: DemoState, _market: MarketSnapshot, onUpdate: () => void): void {
  document.getElementById("link-acct-wallet")?.addEventListener("click", (ev) => {
    if (isHubEmbed() && postHubGotoTab("wallet")) {
      ev.preventDefault();
    }
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
}

/**
 * Soft-update Account balances / equity / allocation without remounting the page
 * (keeps Asset roadmap, withdraw form, open CLI details intact).
 */
export function patchAccountFundsDom(state: DemoState, market: MarketSnapshot): void {
  const w = state.wallet;
  const eq = walletEquityFromMarket(w, market);
  const rows: { asset: string; free: string; usdt: string }[] = [
    { asset: "USDT", free: formatNum(w.usdt, 2), usdt: formatNum(w.usdt, 2) },
    { asset: "HMC", free: formatNum(w.hmc, 4), usdt: formatNum(w.hmc * market.hmcUsdt, 2) },
    { asset: "SUP", free: formatNum(w.sup, 4), usdt: formatNum(w.sup * market.supUsdt, 4) },
    { asset: "BTC", free: formatPrice(w.btc), usdt: formatNum(w.btc * market.btcUsd, 2) },
    { asset: "EQ", free: "", usdt: formatNum(eq, 2) },
  ];
  for (const r of rows) {
    const tr = document.querySelector(`tr[data-asset="${r.asset}"]`);
    if (!tr) continue;
    const free = tr.querySelector('[data-col="free"]');
    const usdt = tr.querySelector('[data-col="usdt"]');
    if (free && r.asset !== "EQ") free.textContent = r.free;
    if (usdt) usdt.textContent = r.usdt;
  }
  const eqHero = document.querySelector(".account-eq");
  if (eqHero) eqHero.innerHTML = `${formatNum(eq, 2)} <span class="muted">USDT</span>`;
  const host = document.getElementById("acct-alloc-host");
  if (host) host.innerHTML = allocationBars(w, market, eq);
  const sess = document.getElementById("lab-session-addr");
  if (sess) sess.textContent = labSessionLabel().label;
}
