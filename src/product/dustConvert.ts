import { CONVERT_ASSETS, routeForAssets, type ConvertRoute } from "../convert";
import { freeBalance } from "../balance";
import { formatConvertPairHash } from "../routeHash";
import { escapeHtml } from "../sanitize";
import { formatNum } from "../market";
import type { DemoState, MarketSnapshot, Wallet } from "../types";

export const DUST_USD_THRESHOLD = 1;

export type DustBalance = {
  key: keyof Wallet;
  symbol: string;
  amount: number;
  usdValue: number;
  route: ConvertRoute | null;
};

const PRICE: Record<keyof Wallet, (m: MarketSnapshot) => number> = {
  usdt: () => 1,
  hmc: (m) => m.hmcUsdt,
  sup: (m) => m.supUsdt,
  btc: (m) => m.btcUsd,
};

export function findDustBalances(
  wallet: Wallet,
  market: MarketSnapshot,
  to: keyof Wallet = "usdt",
  state?: DemoState,
): DustBalance[] {
  const out: DustBalance[] = [];
  for (const a of CONVERT_ASSETS) {
    if (a.key === to) continue;
    const amount = state ? freeBalance(state, a.key, market) : wallet[a.key];
    if (!(amount > 0)) continue;
    const usd = amount * PRICE[a.key](market);
    if (usd >= DUST_USD_THRESHOLD) continue;
    out.push({
      key: a.key,
      symbol: a.symbol,
      amount,
      usdValue: usd,
      route: routeForAssets(a.key, to),
    });
  }
  return out.sort((x, y) => x.usdValue - y.usdValue);
}

export function dustConvertDeepLink(dust: DustBalance, to: keyof Wallet): string {
  if (!dust.route) return "#convert";
  const fromKey = dust.key;
  return formatConvertPairHash(fromKey, to);
}

export function renderDustPanel(
  wallet: Wallet,
  market: MarketSnapshot,
  to: keyof Wallet = "usdt",
  state?: DemoState,
): string {
  const dust = findDustBalances(wallet, market, to, state);
  if (!dust.length) {
    return `<section class="acct-dust glass-inset" id="acct-dust">
      <header class="acct-block-head"><h3>Dust converter</h3><p class="muted small">No dust balances (&lt; ${DUST_USD_THRESHOLD} USD)</p></header>
    </section>`;
  }
  const rows = dust
    .map(
      (d) => `<li>
        <span class="mono">${escapeHtml(d.symbol)} ${formatNum(d.amount, 6)}</span>
        <span class="muted small">≈ ${formatNum(d.usdValue, 4)} USD</span>
        <a class="btn-sm" href="${escapeHtml(dustConvertDeepLink(d, to))}">Convert →</a>
      </li>`,
    )
    .join("");
  return `<section class="acct-dust glass-inset" id="acct-dust">
    <header class="acct-block-head">
      <h3>Dust converter</h3>
      <p class="muted small">${dust.length} balance(s) under ${DUST_USD_THRESHOLD} USD · one-tap convert routes</p>
    </header>
    <ul class="dust-list">${rows}</ul>
  </section>`;
}
