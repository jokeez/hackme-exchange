import type { MarketSnapshot, PairId, PoolStats, SupEconomics, Ticker, WorkStats } from "./types";

import { INTEGRATION } from "./config/integration";
import { midForPairId } from "./registry";
import { fetchWithTimeout } from "./fetchTimeout";

export {
  formatPrice,
  formatPriceCompact,
  formatNum,
  formatPct,
  pctTone,
  formatVol,
  formatVolBase,
  formatGh,
  formatRewardPerM,
  chartPriceFormatter,
} from "./format";

function poolBase(): string {
  return INTEGRATION.poolCoordinatorOrigin.replace(/\/$/, "");
}

function hubBase(): string {
  return INTEGRATION.hubOrigin.replace(/\/$/, "");
}

const REF_GH = 35;
const DEFAULT_BTC_USD = 67_500;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function buildMarket(
  pool: PoolStats,
  work: WorkStats,
  sup: SupEconomics,
  anchor = 0.00042,
  btcUsd = DEFAULT_BTC_USD,
): MarketSnapshot {
  const poolGh = work.pool_hashrate_gh_s ?? (pool.hashrate ? pool.hashrate / 1e9 : REF_GH);
  const rewardPerM = work.reward_per_m ?? 0.00021;
  const workers = work.workers_online ?? work.workers_count ?? pool.workers ?? 3;
  const hf = clamp(Math.pow(poolGh / REF_GH, 0.38), 0.55, 1.85);
  const rf = clamp(Math.pow(rewardPerM / 0.00021, 0.22), 0.75, 1.25);
  const wf = 1 + Math.log10(Math.max(workers, 1)) * 0.06;
  const jitter = 1 + Math.sin((Date.now() / 3_600_000) * 2.1) * 0.004;
  const hmcUsdt = anchor * hf * rf * wf * jitter;

  const minted = sup.economics?.total_minted_sup ?? 0.05;
  const max = sup.economics?.max_supply_sup ?? 21_000_000;
  const scarcity = 1 + Math.log10(max / Math.max(minted, 0.001)) * 0.018;
  const supUsdt = hmcUsdt * 0.11 * scarcity;
  const hmcSup = hmcUsdt / Math.max(supUsdt, 1e-12);
  const hmcBtc = hmcUsdt / btcUsd;
  const supBtc = supUsdt / btcUsd;

  return {
    hmcUsdt,
    supUsdt,
    hmcSup,
    hmcBtc,
    supBtc,
    poolGh,
    rewardPerM,
    workers,
    supMinted: minted,
    supMax: max,
    blockHeight: pool.block_height ?? pool.tip_height ?? 0,
    btcUsd,
    targetMod: work.target_mod ?? 0,
    totalPayoutHmc: work.total_payout_hmc ?? 0,
  };
}

export function midForPair(m: MarketSnapshot, pairId: PairId): number {
  return midForPairId(m, pairId);
}

export function tickerFromMarket(m: MarketSnapshot, pairId: PairId): Ticker {
  const mid = midForPair(m, pairId);
  const spreadBps = clamp(8 + (REF_GH / Math.max(m.poolGh, 1)) * 6, 8, 36);
  const half = (spreadBps / 10_000 / 2) * mid;
  const wobble = mid * 0.012;
  return {
    pairId,
    mid,
    bid: mid - half,
    ask: mid + half,
    spreadBps,
    change24hPct: 0,
    high24h: mid + wobble,
    low24h: mid - wobble,
    volume24hBase: 0,
    volume24hQuote: 0,
    source: "live",
    fetchedAt: Date.now(),
  };
}

/** Sync local mids when pool API is slow/unreachable — instant boot paint. */
export function localFallbackMarket(anchor = 0.00042): MarketSnapshot {
  return buildMarket(
    { hashrate: REF_GH * 1e9, workers: 4, tip_height: 155000, status: "ok" },
    { pool_hashrate_gh_s: REF_GH, reward_per_m: 0.00021, workers_online: 4 },
    { economics: { total_minted_sup: 0.05, max_supply_sup: 21_000_000 } },
    anchor,
  );
}

export async function fetchMarket(anchor = 0.00042): Promise<{
  market: MarketSnapshot;
  source: "live" | "fallback";
}> {
  try {
    // Bound oracle RTT — boot must not sit on default 10s hangs (VPN/CORS).
    const t = 3_500;
    const [poolRes, workRes, supRes] = await Promise.all([
      fetchWithTimeout(`${poolBase()}/api/pool/stats`, {}, t),
      fetchWithTimeout(`${poolBase()}/api/work/stats`, {}, t),
      fetchWithTimeout(`${hubBase()}/api/sup/economics`, {}, t),
    ]);
    if (!poolRes.ok || !workRes.ok) throw new Error("pool");
    const pool = (await poolRes.json()) as PoolStats;
    const work = (await workRes.json()) as WorkStats;
    const sup = supRes.ok ? ((await supRes.json()) as SupEconomics) : {};
    return { market: buildMarket(pool, work, sup, anchor), source: "live" };
  } catch {
    return { market: localFallbackMarket(anchor), source: "fallback" };
  }
}
