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

/** Fallback BTC/USD when live ticker is unreachable. */
export const DEFAULT_BTC_USD = 67_500;

/**
 * Operator reference mid (USDT per 1 HMC) for D0 paper / soft-launch.
 * Chain emission is fixed (~0.01 HMC/block); pool hashrate must NOT scale this price.
 */
export const DEFAULT_REFERENCE_MID = 0.05;

/** Operator reference mid (USDT per 1 SUP) — fair paper desk. */
export const DEFAULT_SUP_REFERENCE_MID = 0.01;

/** Live paper drift band around each reference (±0.35%). */
export const PAPER_MID_BAND = 0.0035;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Mild time-based walk around an operator reference mid.
 * Produces ticks like 0.050034 / 0.049971 — not a frozen print, still mean-reverting.
 */
export function liveReferenceMid(
  reference: number,
  asset: "hmc" | "sup",
  nowMs = Date.now(),
): number {
  const ref = Math.max(reference, 1e-12);
  const tick = Math.floor(nowMs / 700);
  const phase = asset === "hmc" ? 0.71 : 1.93;
  const slow = Math.sin(tick / 23 + phase) * 0.00115;
  const mid = Math.sin(tick / 9 + phase * 1.7) * 0.00055;
  const fast = Math.sin(tick / 3.5 + phase * 2.4) * 0.00028;
  const scale = clamp(1 + slow + mid + fast, 1 - PAPER_MID_BAND, 1 + PAPER_MID_BAND);
  return ref * scale;
}

/** Keep cross pairs coherent: HMC/SUP, HMC/BTC, SUP/BTC from USDT legs + BTC/USD. */
export function resyncCrossMids(m: Omit<MarketSnapshot, "assetUsd">): MarketSnapshot {
  const hmcUsdt = Math.max(m.hmcUsdt, 1e-12);
  const supUsdt = Math.max(m.supUsdt, 1e-12);
  const btcUsd = Math.max(m.btcUsd, 1);
  const base: Omit<MarketSnapshot, "assetUsd"> = {
    ...m,
    hmcUsdt,
    supUsdt,
    btcUsd,
    hmcSup: hmcUsdt / supUsdt,
    hmcBtc: hmcUsdt / btcUsd,
    supBtc: supUsdt / btcUsd,
  };
  return { ...base, assetUsd: computeAssetUsd(base) };
}

/**
 * Shared paper mid for a pair at wall-clock `nowMs`.
 * Same inputs → same price on every device (no localStorage / EMA / Binance fork).
 * BTC crosses use DEFAULT_BTC_USD so HMC_BTC / SUP_BTC match across clients.
 */
export function paperPairMid(pairId: PairId, nowMs = Date.now()): number {
  const hmc = liveReferenceMid(DEFAULT_REFERENCE_MID, "hmc", nowMs);
  const sup = liveReferenceMid(DEFAULT_SUP_REFERENCE_MID, "sup", nowMs);
  const btc = DEFAULT_BTC_USD;
  switch (pairId) {
    case "HMC_USDT":
      return hmc;
    case "SUP_USDT":
      return sup;
    case "HMC_SUP":
      return hmc / sup;
    case "HMC_BTC":
      return hmc / btc;
    case "SUP_BTC":
      return sup / btc;
    default:
      return hmc;
  }
}

/**
 * Apply live paper drift around **canonical** D0 refs (not per-device Settings anchor).
 * Pins BTC to DEFAULT_BTC_USD so every embed / phone / desktop sees one paper book.
 */
export function applyLivePaperMids(
  m: MarketSnapshot,
  _hmcRef: number = DEFAULT_REFERENCE_MID,
  _supRef: number = DEFAULT_SUP_REFERENCE_MID,
  nowMs = Date.now(),
): MarketSnapshot {
  void _hmcRef;
  void _supRef;
  return resyncCrossMids({
    ...m,
    hmcUsdt: liveReferenceMid(DEFAULT_REFERENCE_MID, "hmc", nowMs),
    supUsdt: liveReferenceMid(DEFAULT_SUP_REFERENCE_MID, "sup", nowMs),
    btcUsd: DEFAULT_BTC_USD,
  });
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
  const minted = sup.economics?.total_minted_sup ?? 0.05;
  const max = sup.economics?.max_supply_sup ?? 21_000_000;

  // Exact operator refs here — live drift applied via applyLivePaperMids in the desk loop.
  return resyncCrossMids({
    hmcUsdt: Math.max(referenceMid, 1e-12),
    supUsdt: Math.max(supReferenceMid, 1e-12),
    hmcSup: 0,
    hmcBtc: 0,
    supBtc: 0,
    poolGh,
    rewardPerM,
    workers,
    supMinted: minted,
    supMax: max,
    blockHeight: pool.block_height ?? pool.tip_height ?? 0,
    btcUsd: Math.max(btcUsd, 1),
    targetMod: work.target_mod ?? 0,
    totalPayoutHmc: work.total_payout_hmc ?? 0,
  });
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
export function localFallbackMarket(
  referenceMid = DEFAULT_REFERENCE_MID,
  btcUsd = DEFAULT_BTC_USD,
): MarketSnapshot {
  return buildMarket(
    { hashrate: REF_GH * 1e9, workers: 4, tip_height: 155000, status: "ok" },
    { pool_hashrate_gh_s: REF_GH, reward_per_m: 0.00021, workers_online: 4 },
    { economics: { total_minted_sup: 0.05, max_supply_sup: 21_000_000 } },
    referenceMid,
    btcUsd,
  );
}

/** Best-effort public BTC/USDT mark for HMC/BTC + SUP/BTC sync. */
export async function fetchBtcUsd(): Promise<number> {
  try {
    const r = await fetchWithTimeout(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      {},
      3_500,
    );
    if (!r.ok) return DEFAULT_BTC_USD;
    const j = (await r.json()) as { price?: string };
    const n = Number(j.price);
    if (!Number.isFinite(n) || n < 1_000 || n > 5_000_000) return DEFAULT_BTC_USD;
    return n;
  } catch {
    return DEFAULT_BTC_USD;
  }
}

export async function fetchMarket(
  referenceMid = DEFAULT_REFERENCE_MID,
): Promise<{
  market: MarketSnapshot;
  source: "live" | "fallback";
}> {
  try {
    // Pool is required; work/sup/btc are best-effort — flaky proxy must not zero the desk.
    const poolT = 4_000;
    const workT = 6_000;
    const poolP = fetchWithTimeout(`${poolBase()}/api/pool/stats`, {}, poolT);
    const workP = fetchWithTimeout(`${poolBase()}/api/work/stats`, {}, workT).catch(() => null);
    const supP = fetchWithTimeout(`${hubBase()}/api/sup/economics`, {}, poolT).catch(() => null);
    // Paper BTC pin — do not fork HMC_BTC/SUP_BTC across devices via Binance reachability.
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
    const base = buildMarket(pool, work, sup, referenceMid, DEFAULT_BTC_USD);
    return {
      market: applyLivePaperMids(base, referenceMid, DEFAULT_SUP_REFERENCE_MID),
      source: "live",
    };
  } catch {
    return {
      market: applyLivePaperMids(localFallbackMarket(referenceMid), referenceMid),
      source: "fallback",
    };
  }
}
