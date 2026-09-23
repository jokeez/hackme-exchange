import { INTEGRATION } from "../config/integration";
import { isLoopbackOrigin } from "../sanitize";
import type { Wallet } from "../types";
import { fetchWithTimeout } from "../fetchTimeout";

export type NodeWalletSnapshot = {
  ok: true;
  address: string;
  hmc: number;
  sup: number;
  source: string;
  raw: Record<string, unknown>;
} | {
  ok: false;
  reason: string;
};

type WalletApiResponse = {
  address?: string;
  balance_hmc?: number;
  balance_display_hmc?: number;
  balance_primary_hmc?: number;
  balance_sup?: number;
  wallet_source?: string;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function fetchNodeWalletOnce(
  base: string,
  headers: Record<string, string>,
  timeoutMs: number,
  fresh: boolean,
): Promise<NodeWalletSnapshot> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : 0;
  try {
    const q = fresh ? "?fresh=1" : "";
    const res = await fetch(`${base}/api/wallet${q}`, {
      cache: "no-store",
      headers,
      mode: "cors",
      signal: ctrl?.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: `Node wallet HTTP ${res.status} — is hackme-node running on ${base}?` };
    }
    const data = (await res.json()) as WalletApiResponse & Record<string, unknown>;
    const hmc =
      num(data.balance_display_hmc) ||
      num(data.balance_primary_hmc) ||
      num(data.balance_hmc);
    const sup = num(data.balance_sup);
    return {
      ok: true,
      address: String(data.address ?? ""),
      hmc,
      sup,
      source: String(data.wallet_source ?? "node"),
      raw: data,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = ctrl?.signal.aborted || /abort/i.test(msg);
    return {
      ok: false,
      reason: aborted
        ? `Node wallet timeout (${timeoutMs}ms) at ${base}`
        : `Cannot reach node at ${base}: ${msg}`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Read-only sync from local hackme-node (127.0.0.1:8080). Never sends transfers. */
export async function fetchNodeWallet(opts?: {
  timeoutMs?: number;
  retries?: number;
}): Promise<NodeWalletSnapshot> {
  const base = INTEGRATION.nodeOrigin.replace(/\/$/, "");
  if (!isLoopbackOrigin(base)) {
    return { ok: false, reason: `Node wallet Sync refused — origin not loopback (${base})` };
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  // Never send admin tokens from the SPA — node Sync is read-only without elevating privileges.
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const retries = Math.max(0, opts?.retries ?? 1);
  let last: NodeWalletSnapshot = { ok: false, reason: "unreachable" };
  for (let i = 0; i <= retries; i++) {
    last = await fetchNodeWalletOnce(base, headers, timeoutMs, i > 0);
    if (last.ok) return last;
  }
  return last;
}

/** Merge on-chain HMC/SUP into demo wallet; keep paper USDT/BTC unchanged. */
export function mergeNodeIntoDemoWallet(demo: Wallet, node: Extract<NodeWalletSnapshot, { ok: true }>): Wallet {
  return {
    ...demo,
    hmc: node.hmc,
    sup: node.sup,
  };
}

/** Cache probes — re-render used to hit node every paint and spam CORS console noise. */
let nodeProbeCache: { at: number; ok: boolean } | null = null;
const NODE_PROBE_TTL_MS = 30_000;

/** Loopback node when page is the hub; same-origin /hub-proxy elsewhere (no cross-port CORS). */
export function resolveNodeProbeUrl(): string | null {
  if (typeof window === "undefined") return null;
  const pageOrigin = window.location.origin.replace(/\/$/, "");
  const nodeBase = INTEGRATION.nodeOrigin.replace(/\/$/, "");
  if (pageOrigin === nodeBase) {
    return `${nodeBase}/api/status?lite=1`;
  }
  return `${pageOrigin}/hub-proxy/api/status?lite=1`;
}

export async function probeNodeOnline(): Promise<boolean> {
  const now = Date.now();
  if (nodeProbeCache && now - nodeProbeCache.at < NODE_PROBE_TTL_MS) {
    return nodeProbeCache.ok;
  }
  const url = resolveNodeProbeUrl();
  if (!url) {
    nodeProbeCache = { at: now, ok: false };
    return false;
  }
  try {
    const res = await fetchWithTimeout(url, { cache: "no-store", mode: "cors" }, 2_500);
    nodeProbeCache = { at: now, ok: res.ok };
    return res.ok;
  } catch {
    nodeProbeCache = { at: now, ok: false };
    return false;
  }
}
