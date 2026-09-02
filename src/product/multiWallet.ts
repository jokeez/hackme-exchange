import type { MarketSnapshot, Wallet } from "../types";
import { formatNum } from "../market";
import { escapeHtml } from "../sanitize";

export type WalletSlice = {
  id: "paper" | "node" | "lab";
  label: string;
  subtitle: string;
  wallet: Wallet;
  href?: string;
};

export function renderMultiWalletCard(slices: WalletSlice[], market: MarketSnapshot): string {
  const rows = slices
    .map((s) => {
      const usdt =
        s.wallet.usdt +
        s.wallet.hmc * market.hmcUsdt +
        s.wallet.sup * market.supUsdt +
        s.wallet.btc * market.btcUsd;
      const link = s.href
        ? `<a class="link small" href="${escapeHtml(s.href)}"${s.href.startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : ""}>Open</a>`
        : `<span class="muted small">Active</span>`;
      return `<article class="multi-wallet-row" data-wallet-slice="${s.id}">
        <div>
          <strong>${escapeHtml(s.label)}</strong>
          <p class="muted small">${escapeHtml(s.subtitle)}</p>
        </div>
        <div class="multi-wallet-bal">
          <span class="mono">${formatNum(usdt, 2)} USDT</span>
          ${link}
        </div>
      </article>`;
    })
    .join("");

  return `<section class="acct-section multi-wallet glass-inset" id="multi-wallet">
    <header class="acct-section-head">
      <h3>Multi-wallet</h3>
      <p class="muted small">Paper trading · node wallet · lab sandbox</p>
    </header>
    <div class="multi-wallet-list">${rows}</div>
  </section>`;
}
