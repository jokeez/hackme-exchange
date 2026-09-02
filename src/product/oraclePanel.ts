import type { MarketSnapshot, PoolLive } from "../types";
import { formatGh, formatNum, formatPrice, tickerFromMarket } from "../market";
import {
  oracleAgeSec,
  oracleStatusKind,
  oracleStatusLabel,
  type OracleMeta,
} from "../oracleStatus";
import { escapeHtml } from "../sanitize";

export function renderOracleTransparencyPanel(
  meta: OracleMeta,
  market: MarketSnapshot,
  poolLive: PoolLive | null,
  anchorMid = 0.05,
): string {
  const kind = oracleStatusKind(meta);
  const label = oracleStatusLabel(meta);
  const age = oracleAgeSec(meta);
  const spreadBps = tickerFromMarket(market, "HMC_USDT").spreadBps;
  const poolBase = escapeHtml(
    typeof window !== "undefined"
      ? `${window.location.origin}/pool-proxy`
      : "https://hackme.tech/pool/coordinator",
  );

  return `<section class="oracle-transparency glass-inset" id="oracle-transparency" role="region" aria-label="Oracle transparency">
    <header class="oracle-trans-head">
      <h3>Oracle transparency</h3>
      <span class="oracle-trans-pill ${kind}" id="oracle-trans-pill">${escapeHtml(label)}</span>
    </header>
    <div class="oracle-trans-grid">
      <article>
        <span class="muted small">Feed</span>
        <strong>${meta.source === "live" ? "Pool coordinator + economics" : "Local fallback formula"}</strong>
        <p class="muted small mono" id="oracle-trans-sync">Last sync ${age != null ? `${age}s ago` : "—"} · pool ${escapeHtml(poolLive?.status ?? "—")}</p>
      </article>
      <article>
        <span class="muted small">Mids (USDT)</span>
        <ul class="oracle-trans-mids mono">
          <li>HMC <strong data-oracle-trans-mid="hmc">${formatPrice(market.hmcUsdt)}</strong></li>
          <li>SUP <strong data-oracle-trans-mid="sup">${formatPrice(market.supUsdt)}</strong></li>
          <li>BTC <strong data-oracle-trans-mid="btc">$${formatNum(market.btcUsd, 0)}</strong></li>
        </ul>
      </article>
      <article>
        <span class="muted small">Pool telemetry</span>
        <ul class="oracle-trans-mids mono">
          <li>Hashrate <strong data-oracle-trans-stat="hashrate">${poolLive ? formatGh(poolLive.poolGh) : "—"}</strong></li>
          <li>Workers <strong data-oracle-trans-stat="workers">${poolLive ? formatNum(poolLive.workers, 0) : "—"}</strong></li>
          <li>Spread <strong data-oracle-trans-stat="spread">${formatNum(spreadBps, 1)} bps</strong></li>
        </ul>
      </article>
      <article>
        <span class="muted small">Formula</span>
        <p class="mono small">ref HMC ${formatPrice(anchorMid)} ± drift · spread scales with pool GH/s</p>
        <p class="muted small mono">${poolBase}/api/pool/stats</p>
      </article>
    </div>
  </section>`;
}

/** Soft-update transparency panel on oracle tick — avoids remounting pool / spot chrome. */
export function patchOracleTransparencyDom(
  meta: OracleMeta,
  market: MarketSnapshot,
  poolLive: PoolLive | null,
  now = Date.now(),
): boolean {
  const root = document.getElementById("oracle-transparency");
  if (!root) return false;
  const kind = oracleStatusKind(meta, now);
  const label = oracleStatusLabel(meta, now);
  const age = oracleAgeSec(meta, now);
  const spreadBps = tickerFromMarket(market, "HMC_USDT").spreadBps;

  const pill = document.getElementById("oracle-trans-pill");
  if (pill) {
    pill.className = `oracle-trans-pill ${kind}`;
    pill.textContent = label;
  }

  const sync = document.getElementById("oracle-trans-sync");
  if (sync) {
    sync.textContent = `Last sync ${age != null ? `${age}s ago` : "—"} · pool ${poolLive?.status ?? "—"}`;
  }

  const mids: Record<string, string> = {
    hmc: formatPrice(market.hmcUsdt),
    sup: formatPrice(market.supUsdt),
    btc: `$${formatNum(market.btcUsd, 0)}`,
  };
  for (const [key, value] of Object.entries(mids)) {
    const el = root.querySelector(`[data-oracle-trans-mid="${key}"]`);
    if (el) el.textContent = value;
  }

  const stats: Record<string, string> = {
    hashrate: poolLive ? formatGh(poolLive.poolGh) : "—",
    workers: poolLive ? formatNum(poolLive.workers, 0) : "—",
    spread: `${formatNum(spreadBps, 1)} bps`,
  };
  for (const [key, value] of Object.entries(stats)) {
    const el = root.querySelector(`[data-oracle-trans-stat="${key}"]`);
    if (el) el.textContent = value;
  }

  return true;
}
