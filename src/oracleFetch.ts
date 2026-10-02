/** Shared pool/work fetches — one in-flight + short TTL cache (cuts duplicate oracle RTT). */

import type { PoolStats, WorkStats } from "./types";
import { INTEGRATION } from "./config/integration";
import { fetchWithTimeout } from "./fetchTimeout";

function poolBase(): string {
  return INTEGRATION.poolCoordinatorOrigin.replace(/\/$/, "");
}

type PoolCache = { at: number; pool: PoolStats };
type WorkCache = { at: number; work: WorkStats };

let poolCache: PoolCache | null = null;
let workCache: WorkCache | null = null;
let poolInflight: Promise<PoolStats> | null = null;
let workInflight: Promise<WorkStats> | null = null;

const POOL_TTL_MS = 2_500;
const WORK_TTL_MS = 3_000;
const POOL_TIMEOUT_MS = 1_800;
const WORK_TIMEOUT_MS = 900;

export function peekCachedPoolStats(): PoolStats | null {
  if (!poolCache) return null;
  if (Date.now() - poolCache.at > POOL_TTL_MS * 2) return null;
  return poolCache.pool;
}

export function peekCachedWorkStats(): WorkStats | null {
  if (!workCache) return null;
  if (Date.now() - workCache.at > WORK_TTL_MS * 2) return null;
  return workCache.work;
}

export async function fetchPoolStatsCached(force = false): Promise<PoolStats> {
  const now = Date.now();
  if (!force && poolCache && now - poolCache.at < POOL_TTL_MS) return poolCache.pool;
  if (poolInflight) return poolInflight;
  poolInflight = (async () => {
    const res = await fetchWithTimeout(`${poolBase()}/api/pool/stats`, {}, POOL_TIMEOUT_MS);
    if (!res.ok) throw new Error(`pool HTTP ${res.status}`);
    const pool = (await res.json()) as PoolStats;
    poolCache = { at: Date.now(), pool };
    return pool;
  })();
  try {
    return await poolInflight;
  } finally {
    poolInflight = null;
  }
}

/** Best-effort work stats — never blocks the desk on a hung /work/stats. */
export async function fetchWorkStatsCached(force = false): Promise<WorkStats> {
  const now = Date.now();
  if (!force && workCache && now - workCache.at < WORK_TTL_MS) return workCache.work;
  if (workInflight) return workInflight;
  workInflight = (async () => {
    try {
      const res = await fetchWithTimeout(
        `${poolBase()}/api/work/stats?details=0`,
        {},
        WORK_TIMEOUT_MS,
      );
      if (!res?.ok) return workCache?.work ?? {};
      const work = (await res.json()) as WorkStats;
      workCache = { at: Date.now(), work };
      return work;
    } catch {
      return workCache?.work ?? {};
    }
  })();
  try {
    return await workInflight;
  } finally {
    workInflight = null;
  }
}
