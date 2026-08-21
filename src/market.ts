import type { MarketSnapshot, PairId, PoolStats, SupEconomics, Ticker, WorkStats } from "./types";

import { INTEGRATION } from "./config/integration";
import { computeAssetUsd, midForPairId } from "./registry";
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

/** Pool GH reference for spread / fallback telemetry only — not for mid pricing. */
const REF_GH = 35;
const DEFAULT_BTC_USD = 67_500;

/**
 * Operator reference mid (USDT per 1 HMC) for D0 paper / soft-launch.
 * Chain emission is fixed (~0.01 HMC/block); pool hashrate must NOT scale this price.
 */
export const DEFAULT_REFERENCE_MID = 0.05;

/** Operator reference mid (USDT per 1 SUP) — fair paper desk, not dust × scarcity. */
export const DEFAULT_SUP_REFERENCE_MID = 0.01;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function buildMarket(
  pool: PoolStats,
  work: WorkStats,
  sup: SupEconomics,
  /** Operator reference mid USDT/HMC (Settings). */
  referenceMid = DEFAULT_REFERENCE_MID,
  btcUsd = DEFAULT_BTC_USD,
  /** Operator reference mid USDT/SUP. */
  supReferenceMid = DEFAULT_SUP_REFERENCE_MID,
): MarketSnapshot {
  const poolGh = work.pool_hashrate_gh_s ?? (pool.hashrate ? pool.hashrate / 1e9 : REF_GH);
  const rewardPerM = work.reward_per_m ?? 0.00021;
  const workers = work.workers_online ?? work.workers_count ?? pool.workers ?? 3;

  // Reference mids only — no GH / reward / scarcity multipliers on price.
  const hmcUsdt = Math.max(referenceMid, 1e-12);
  const minted = sup.economics?.total_minted_sup ?? 0.05;
  const max = sup.economics?.max_supply_sup ?? 21_000_000;
  const supUsdt = Math.max(supReferenceMid, 1e-12);
  const hmcSup = hmcUsdt / Math.max(supUsdt, 1e-12);
  const hmcBtc = hmcUsdt / btcUsd;
  const supBtc = supUsdt / btcUsd;

  const base: Omit<MarketSnapshot, "assetUsd"> = {
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

  return { ...base, assetUsd: computeAssetUsd(base) };
}

export function midForPair(m: MarketSnapshot, pairId: PairId): number {
  return midForPairId(m, pairId);
}

export function tickerFromMarket(m: MarketSnapshot, pairId: PairId): Ticker {
  const mid = midForPair(m, pairId);
  // Wider spread when pool is thin — cosmetic paper book only.
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
export function localFallbackMarket(referenceMid = DEFAULT_REFERENCE_MID): MarketSnapshot {
  return buildMarket(
    { hashrate: REF_GH * 1e9, workers: 4, tip_height: 155000, status: "ok" },
    { pool_hashrate_gh_s: REF_GH, reward_per_m: 0.00021, workers_online: 4 },
    { economics: { total_minted_sup: 0.05, max_supply_sup: 21_000_000 } },
    referenceMid,
  );
}

export async function fetchMarket(referenceMid = DEFAULT_REFERENCE_MID): Promise<{
  market: MarketSnapshot;
  source: "live" | "fallback";
}> {
  try {
    // Pool is required; work/sup are best-effort — flaky proxy must not zero the desk.
    const poolT = 4_000;
    const workT = 6_000;
    const poolP = fetchWithTimeout(`${poolBase()}/api/pool/stats`, {}, poolT);
    const workP = fetchWithTimeout(`${poolBase()}/api/work/stats`, {}, workT).catch(() => null);
    const supP = fetchWithTimeout(`${hubBase()}/api/sup/economics`, {}, poolT).catch(() => null);
    const poolRes = await poolP;
    if (!poolRes.ok) throw new Error("pool");
    const pool = (await poolRes.json()) as PoolStats;
    const workRes = await workP;
    let work: WorkStats = {};
    if (workRes?.ok) {
      try {
        work = (await workRes.json()) as WorkStats;
      } catch {
        work = {};
      }
    }
    const supRes = await supP;
    let sup: SupEconomics = {};
    if (supRes?.ok) {
      try {
        sup = (await supRes.json()) as SupEconomics;
      } catch {
        sup = {};
      }
    }
    return { market: buildMarket(pool, work, sup, referenceMid), source: "live" };
  } catch {
    return { market: localFallbackMarket(referenceMid), source: "fallback" };
  }
}
