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
      <span class="oracle-trans-pill ${kind}">${escapeHtml(label)}</span>
    </header>
    <div class="oracle-trans-grid">
      <article>
        <span class="muted small">Feed</span>
        <strong>${meta.source === "live" ? "Pool coordinator + economics" : "Local fallback formula"}</strong>
        <p class="muted small mono">Last sync ${age != null ? `${age}s ago` : "—"} · pool ${escapeHtml(poolLive?.status ?? "—")}</p>
      </article>
      <article>
        <span class="muted small">Mids (USDT)</span>
        <ul class="oracle-trans-mids mono">
          <li>HMC <strong>${formatPrice(market.hmcUsdt)}</strong></li>
          <li>SUP <strong>${formatPrice(market.supUsdt)}</strong></li>
          <li>BTC <strong>$${formatNum(market.btcUsd, 0)}</strong></li>
        </ul>
      </article>
      <article>
        <span class="muted small">Pool telemetry</span>
        <ul class="oracle-trans-mids mono">
          <li>Hashrate <strong>${poolLive ? formatGh(poolLive.poolGh) : "—"}</strong></li>
          <li>Workers <strong>${poolLive ? formatNum(poolLive.workers, 0) : "—"}</strong></li>
          <li>Spread <strong>${formatNum(spreadBps, 1)} bps</strong></li>
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
