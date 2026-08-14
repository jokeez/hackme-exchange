import type { MarketSnapshot, PoolLive, PoolStats, WorkStats } from "./types";
import { INTEGRATION } from "./config/integration";
import { escapeHtml } from "./sanitize";
import { formatGh, formatNum, formatPrice, formatRewardPerM } from "./market";
import { fetchWithTimeout } from "./fetchTimeout";

function poolBase(): string {
  return INTEGRATION.poolCoordinatorOrigin.replace(/\/$/, "");
}

/** Public site for CTAs — never hub-proxy (local http mirrors break / 404). */
const PUBLIC_HUB = "https://hackme.tech";
const PUBLIC_DOWNLOADS = `${PUBLIC_HUB}/downloads.html#start`;
const PUBLIC_EXPLORER = `${PUBLIC_HUB}/explorer-lite.html`;
const PUBLIC_POOL_DOCS = "https://github.com/jokeez/hackme/blob/main/docs/SETUP.md";

export async function fetchPoolLive(): Promise<PoolLive> {
  try {
    const t = 3_500;
    const [p, w] = await Promise.all([
      fetchWithTimeout(`${poolBase()}/api/pool/stats`, {}, t),
      fetchWithTimeout(`${poolBase()}/api/work/stats`, {}, t),
    ]);
    if (!p.ok || !w.ok) throw new Error(`pool HTTP ${p.status}/${w.status}`);
    const pool = (await p.json()) as PoolStats;
    const work = (await w.json()) as WorkStats;
    return {
      poolGh: work.pool_hashrate_gh_s ?? (pool.hashrate ? pool.hashrate / 1e9 : 0),
      workers: work.workers_online ?? work.workers_count ?? pool.workers ?? 0,
      miners: pool.miners ?? pool.workers ?? 0,
      blockHeight: pool.block_height ?? pool.tip_height ?? 0,
      rewardPerM: work.reward_per_m ?? 0,
      totalPayoutHmc: work.total_payout_hmc ?? 0,
      targetMod: work.target_mod ?? 0,
      status:
        pool.status === "ok" ||
        (pool.hashrate ?? 0) > 0 ||
        (work.workers_online ?? work.workers_count ?? 0) > 0
          ? "ok"
          : "degraded",
    };
  } catch {
    return offlinePoolLive();
  }
}

/** Instant boot stand-in — connecting, not a failed coordinator read. */
export function pendingPoolLive(): PoolLive {
  return {
    poolGh: 0,
    workers: 0,
    miners: 0,
    blockHeight: 0,
    rewardPerM: 0,
    totalPayoutHmc: 0,
    targetMod: 0,
    status: "pending",
  };
}

/** Confirmed unreachable / error path. */
export function offlinePoolLive(): PoolLive {
  return {
    poolGh: 0,
    workers: 0,
    miners: 0,
    blockHeight: 0,
    rewardPerM: 0,
    totalPayoutHmc: 0,
    targetMod: 0,
    status: "offline",
  };
}

export function renderPoolRail(live: PoolLive): string {
  const ok = live.status === "ok";
  return `
  <div class="pool-rail glass">
    <div class="pr-item">
      <span class="kicker">Official pool</span>
      <a href="${PUBLIC_HUB}" target="_blank" rel="noopener noreferrer" class="pr-link">hackme.tech ↗</a>
    </div>
    <div class="meta-chip"><span class="label">Hashrate</span><span class="value mono">${formatGh(live.poolGh)}</span></div>
    <div class="meta-chip"><span class="label">Workers</span><span class="value mono">${live.workers}</span></div>
    <div class="meta-chip"><span class="label">Block</span><span class="value mono">#${formatNum(live.blockHeight, 0)}</span></div>
    <div class="meta-chip"><span class="label">reward/M</span><span class="value mono">${formatRewardPerM(live.rewardPerM)}</span></div>
      <div class="meta-chip"><span class="label">Settlement</span><span class="value ${ok ? "ok" : ""}">${ok ? "● Live ~30s" : "check pool API"}</span></div>
    <a class="btn btn-secondary btn-sm" href="${PUBLIC_DOWNLOADS}" target="_blank" rel="noopener noreferrer">Mine HMC</a>
  </div>`;
}

export function poolStatusBanner(live: PoolLive): string {
  if (live.status === "ok") return "";
  const poolHref = escapeHtml(poolBase());
  if (live.status === "pending") {
    return `<div class="pool-status-banner pending" role="status">
      <strong>Connecting to coordinator…</strong>
      <p class="muted small">Fetching <code class="mono">${poolHref}/api/pool/stats</code> · <code class="mono">${poolHref}/api/work/stats</code>. Spot already shows local demo mids.</p>
    </div>`;
  }
  if (live.status === "offline") {
    return `<div class="pool-status-banner offline" role="status">
      <strong>Coordinator offline</strong>
      <p class="muted small">Could not reach <code class="mono">${poolHref}/api/pool/stats</code> · <code class="mono">${poolHref}/api/work/stats</code>. Spot mids fall back to local demo anchors until the pool responds.</p>
    </div>`;
  }
  return `<div class="pool-status-banner degraded" role="status">
    <strong>Coordinator degraded</strong>
    <p class="muted small">Stats returned but look empty or incomplete — check workers / hashrate on the pool API.</p>
  </div>`;
}

export function renderPoolPage(live: PoolLive, market: MarketSnapshot): string {
  const poolHref = escapeHtml(poolBase());
  const emptyStats =
    (live.status === "offline" || live.status === "pending") &&
    live.poolGh === 0 &&
    live.workers === 0 &&
    live.blockHeight === 0;
  const statusCls = live.status === "ok" ? "" : live.status;
  const statusLabel =
    live.status === "ok" ? "live" : live.status === "pending" ? "connecting" : live.status;

  return `
  <section class="pool-page glass">
    <header class="pool-head">
      <div>
        <p class="kicker">Useful-PoW economics</p>
        <h2>Official Pool</h2>
        <p class="muted small pool-lead">Coordinator telemetry feeds the Spot oracle — same numbers miners see on <a href="${PUBLIC_HUB}" target="_blank" rel="noopener noreferrer">hackme.tech</a>. Read-only · not a miner dashboard.</p>
      </div>
      <nav class="pool-jump" aria-label="Pool sections">
        <a href="#pool-live">Live</a>
        <a href="#pool-oracle">Oracle</a>
        <a href="#pool-links">Links</a>
      </nav>
    </header>

    ${poolStatusBanner(live)}

    <section class="pool-section" id="pool-live">
      <header class="pool-section-head">
        <h3>Live coordinator <span class="pool-live-pill ${statusCls}">${statusLabel}</span></h3>
        <p class="muted small mono">${poolHref}</p>
      </header>
      ${
        emptyStats
          ? `<p class="muted small pool-empty-hint">No live stats yet — zeros below are placeholders, not a real empty pool.</p>`
          : ""
      }
      <div class="pool-stat-grid" aria-label="Pool metrics">
        <article class="pool-stat glass-inset">
          <span class="muted small">Hashrate</span>
          <strong class="mono">${formatGh(live.poolGh)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Workers</span>
          <strong class="mono">${formatNum(live.workers, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Miners</span>
          <strong class="mono">${formatNum(live.miners, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Block</span>
          <strong class="mono">#${formatNum(live.blockHeight, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">reward / M</span>
          <strong class="mono">${formatRewardPerM(live.rewardPerM)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Target mod</span>
          <strong class="mono">${formatNum(live.targetMod, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset pool-stat-wide">
          <span class="muted small">Total paid</span>
          <strong class="mono">${formatNum(live.totalPayoutHmc, 2)} HMC</strong>
        </article>
      </div>
    </section>

    <section class="pool-section" id="pool-oracle">
      <header class="pool-section-head">
        <h3>Oracle → Exchange</h3>
        <p class="muted small">Mids used on Spot / Convert · demo formula, not investment advice</p>
      </header>
      <div class="pool-grid">
        <article class="pool-card glass-inset">
          <h4>Oracle mids (USDT)</h4>
          <ul class="pool-list mono">
            <li>HMC <strong>${formatPrice(market.hmcUsdt)}</strong></li>
            <li>SUP <strong>${formatPrice(market.supUsdt)}</strong></li>
            <li>HMC/SUP <strong>${formatPrice(market.hmcSup)}</strong></li>
            <li>BTC ref <strong>$${formatNum(market.btcUsd, 0)}</strong></li>
          </ul>
        </article>
        <article class="pool-card glass-inset">
          <h4>How mids are built</h4>
          <p class="formula mono">mid = anchor × hashrate^0.38 × reward^0.22 × workers^0.06 × jitter</p>
          <ul class="pool-list muted small pool-formula-notes">
            <li><span>SUP scarcity</span><strong>minted / max</strong></li>
            <li><span>Spread</span><strong>8–36 bps from pool GH/s</strong></li>
            <li><span>Fallback</span><strong>local anchors if offline</strong></li>
          </ul>
        </article>
        <article class="pool-card glass-inset">
          <h4>Exchange impact</h4>
          <ul class="pool-list muted small">
            <li><span>Spot mid</span><strong>follows pool oracle</strong></li>
            <li><span>Convert</span><strong>same mids + VIP taker</strong></li>
            <li><span>Account equity</span><strong>marks HMC/SUP/BTC</strong></li>
          </ul>
          <p class="muted small">Tune anchor: System → Oracle anchor</p>
        </article>
      </div>
    </section>

    <section class="pool-section" id="pool-links">
      <header class="pool-section-head">
        <h3>Links</h3>
        <p class="muted small">Official site · GitHub setup (not local hub-proxy)</p>
      </header>
      <div class="cta-row pool-cta">
        <a class="btn btn-primary" href="${PUBLIC_DOWNLOADS}" target="_blank" rel="noopener noreferrer">Mine HMC</a>
        <a class="btn btn-secondary" href="${PUBLIC_EXPLORER}" target="_blank" rel="noopener noreferrer">Explorer</a>
        <a class="btn btn-secondary" href="${PUBLIC_POOL_DOCS}" target="_blank" rel="noopener noreferrer">Pool docs</a>
      </div>
    </section>
  </section>`;
}
