import type { MarketSnapshot, PoolLive, PoolStats, WorkStats } from "./types";
import { INTEGRATION } from "./config/integration";
import { escapeHtml } from "./sanitize";
import { formatGh, formatNum, formatPrice, formatRewardPerM, tickerFromMarket } from "./market";
import { fetchWithTimeout } from "./fetchTimeout";
import { oracleStatusLabel, type OracleMeta } from "./oracleStatus";
import { renderOracleTransparencyPanel } from "./product/oraclePanel";
import { renderWorkerLookupPanel } from "./product/poolWorker";

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
    // Pool is enough for "live"; work/stats is best-effort (vite proxy can stall mid-body).
    const poolT = 4_000;
    const workT = 6_000;
    const poolP = fetchWithTimeout(`${poolBase()}/api/pool/stats`, {}, poolT);
    const workP = fetchWithTimeout(`${poolBase()}/api/work/stats`, {}, workT).catch(() => null);
    const p = await poolP;
    if (!p.ok) throw new Error(`pool HTTP ${p.status}`);
    const pool = (await p.json()) as PoolStats;
    const w = await workP;
    let work: WorkStats = {};
    if (w?.ok) {
      try {
        work = (await w.json()) as WorkStats;
      } catch {
        work = {};
      }
    }
    const poolGh = work.pool_hashrate_gh_s ?? (pool.hashrate ? pool.hashrate / 1e9 : 0);
    const workers = work.workers_online ?? work.workers_count ?? pool.workers ?? 0;
    return {
      poolGh,
      workers,
      miners: pool.miners ?? pool.workers ?? 0,
      blockHeight: pool.block_height ?? pool.tip_height ?? 0,
      rewardPerM: work.reward_per_m ?? 0,
      totalPayoutHmc: work.total_payout_hmc ?? 0,
      targetMod: work.target_mod ?? 0,
      status:
        pool.status === "ok" || (pool.hashrate ?? 0) > 0 || workers > 0 ? "ok" : "degraded",
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

export function formatPoolUpdatedAt(fetchedAt: number, now = Date.now()): string {
  if (!fetchedAt) return "Updated — waiting for sync";
  const age = Math.max(0, Math.floor((now - fetchedAt) / 1000));
  return `Updated ${age}s ago`;
}

export function patchPoolLiveDom(
  live: PoolLive,
  market: MarketSnapshot,
  meta: OracleMeta,
  now = Date.now(),
): void {
  const spreadBps = tickerFromMarket(market, "HMC_USDT").spreadBps;
  const stats: Record<string, string> = {
    hashrate: formatGh(live.poolGh),
    workers: formatNum(live.workers, 0),
    miners: formatNum(live.miners, 0),
    block: `#${formatNum(live.blockHeight, 0)}`,
    reward: formatRewardPerM(live.rewardPerM),
    target: formatNum(live.targetMod, 0),
    payout: `${formatNum(live.totalPayoutHmc, 2)} HMC`,
  };
  for (const [key, value] of Object.entries(stats)) {
    const el = document.querySelector(`[data-pool-stat="${key}"]`);
    if (el) el.textContent = value;
  }

  const mids: Record<string, string> = {
    hmc: formatPrice(market.hmcUsdt),
    sup: formatPrice(market.supUsdt),
    hmcSup: formatPrice(market.hmcSup),
    btc: `$${formatNum(market.btcUsd, 0)}`,
    spread: `${formatNum(spreadBps, 1)} bps`,
  };
  for (const [key, value] of Object.entries(mids)) {
    const el = document.querySelector(`[data-pool-mid="${key}"]`);
    if (el) el.textContent = value;
  }

  const pill = document.getElementById("pool-status-pill");
  if (pill) {
    const statusCls = live.status === "ok" ? "" : live.status;
    const statusLabel =
      live.status === "ok" ? "live" : live.status === "pending" ? "connecting" : live.status;
    pill.className = `pool-live-pill ${statusCls}`.trim();
    pill.textContent = statusLabel;
  }

  const updated = document.getElementById("pool-updated-at");
  if (updated) updated.textContent = formatPoolUpdatedAt(meta.fetchedAt, now);

  const oracle = document.getElementById("pool-oracle-pill");
  if (oracle) {
    oracle.textContent = oracleStatusLabel(meta, now);
    const kind = meta.source === "live" && meta.poolStatus === "ok" ? "live" : "fallback";
    oracle.className = `pool-oracle-pill ${kind}`;
  }
}

export function renderPoolPage(
  live: PoolLive,
  market: MarketSnapshot,
  opts?: { poolAddress?: string; oracleMeta?: OracleMeta },
): string {
  const poolHref = escapeHtml(poolBase());
  const emptyStats =
    (live.status === "offline" || live.status === "pending") &&
    live.poolGh === 0 &&
    live.workers === 0 &&
    live.blockHeight === 0;
  const statusCls = live.status === "ok" ? "" : live.status;
  const statusLabel =
    live.status === "ok" ? "live" : live.status === "pending" ? "connecting" : live.status;
  const spreadBps = tickerFromMarket(market, "HMC_USDT").spreadBps;

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
        <a href="#pool-worker-lookup">Workers</a>
        <a href="#pool-links">Links</a>
      </nav>
    </header>

    ${poolStatusBanner(live)}

    <section class="pool-section" id="pool-live">
      <header class="pool-section-head">
        <h3>Live coordinator <span class="pool-live-pill ${statusCls}" id="pool-status-pill">${statusLabel}</span></h3>
        <p class="muted small pool-endpoint-row">
          <code class="mono" id="pool-endpoint-url">${poolHref}</code>
          <button type="button" class="btn-sm pool-copy-url" id="pool-copy-url" title="Copy pool API base URL">Copy</button>
        </p>
        <p class="muted small mono" id="pool-updated-at">Updated — waiting for sync</p>
      </header>
      ${
        emptyStats
          ? `<p class="muted small pool-empty-hint">No live stats yet — zeros below are placeholders, not a real empty pool.</p>`
          : ""
      }
      <div class="pool-stat-grid" aria-label="Pool metrics">
        <article class="pool-stat glass-inset">
          <span class="muted small">Hashrate</span>
          <strong class="mono" data-pool-stat="hashrate">${formatGh(live.poolGh)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Workers</span>
          <strong class="mono" data-pool-stat="workers">${formatNum(live.workers, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Miners</span>
          <strong class="mono" data-pool-stat="miners">${formatNum(live.miners, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Block</span>
          <strong class="mono" data-pool-stat="block">#${formatNum(live.blockHeight, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">reward / M</span>
          <strong class="mono" data-pool-stat="reward">${formatRewardPerM(live.rewardPerM)}</strong>
        </article>
        <article class="pool-stat glass-inset">
          <span class="muted small">Target mod</span>
          <strong class="mono" data-pool-stat="target">${formatNum(live.targetMod, 0)}</strong>
        </article>
        <article class="pool-stat glass-inset pool-stat-wide">
          <span class="muted small">Total paid</span>
          <strong class="mono" data-pool-stat="payout">${formatNum(live.totalPayoutHmc, 2)} HMC</strong>
        </article>
      </div>
    </section>

    ${renderWorkerLookupPanel(opts?.poolAddress ?? "")}

    <section class="pool-section" id="pool-oracle">
      <header class="pool-section-head">
        <h3>Oracle → Exchange <span class="pool-oracle-pill fallback" id="pool-oracle-pill">Oracle fallback</span></h3>
        <p class="muted small">Mids used on Spot / Convert · demo formula, not investment advice</p>
      </header>
      <div class="pool-grid">
        <article class="pool-card glass-inset">
          <h4>Oracle mids (USDT)</h4>
          <ul class="pool-list mono">
            <li>HMC <strong data-pool-mid="hmc">${formatPrice(market.hmcUsdt)}</strong></li>
            <li>SUP <strong data-pool-mid="sup">${formatPrice(market.supUsdt)}</strong></li>
            <li>HMC/SUP <strong data-pool-mid="hmcSup">${formatPrice(market.hmcSup)}</strong></li>
            <li>BTC ref <strong data-pool-mid="btc">$${formatNum(market.btcUsd, 0)}</strong></li>
          </ul>
        </article>
        <article class="pool-card glass-inset">
          <h4>How mids are built</h4>
          <p class="formula mono">hmc = ref±drift · sup = ref±drift · ×BTC = usdt/btcUsd</p>
          <ul class="pool-list muted small pool-formula-notes">
            <li><span>HMC ref</span><strong>0.05 USDT (Settings)</strong></li>
            <li><span>SUP ref</span><strong>0.01 USDT</strong></li>
            <li><span>BTC crosses</span><strong>synced from live BTC/USD</strong></li>
            <li><span>Spread now</span><strong data-pool-mid="spread">${formatNum(spreadBps, 1)} bps</strong></li>
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
      ${opts?.oracleMeta ? renderOracleTransparencyPanel(opts.oracleMeta, market, live) : ""}
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
