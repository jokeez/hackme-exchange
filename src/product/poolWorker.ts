import { INTEGRATION } from "../config/integration";
import { fetchWithTimeout } from "../fetchTimeout";
import { formatGh, formatNum } from "../market";
import { escapeHtml } from "../sanitize";

function poolBase(): string {
  return INTEGRATION.poolCoordinatorOrigin.replace(/\/$/, "");
}

export type WorkerRow = {
  id: string;
  payoutAddress: string;
  payoutHmc: number;
  hashrateGh: number;
};

export type WorkerLookupResult =
  | { ok: true; address: string; workers: WorkerRow[]; totalPayoutHmc: number }
  | { ok: false; address: string; message: string };

type WorkStatsWorkers = Record<
  string,
  {
    payout_hmc?: number;
    payout_address?: string;
    miner_address?: string;
    hashrate_gh_s?: number;
    pool_hashrate_gh_s?: number;
  }
>;

type ActiveRig = {
  worker_id?: string;
  name?: string;
  hashrate_gh_s?: number;
};

function normAddr(a: string): string {
  return a.trim().toUpperCase();
}

/** Public coordinator stats — never use ?details=1 (admin-gated → HTTP 401). */
export function publicWorkStatsUrl(base = poolBase()): string {
  return `${base.replace(/\/$/, "")}/api/work/stats`;
}

function hashrateByWorkerId(activeRigs: ActiveRig[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of activeRigs ?? []) {
    const id = (r.worker_id || r.name || "").trim();
    const gh = Number(r.hashrate_gh_s);
    if (!id || !(gh > 0)) continue;
    map.set(id, gh);
  }
  return map;
}

function matchWorkers(
  workersObj: WorkStatsWorkers,
  needle: string,
  activeRigs?: ActiveRig[],
): WorkerRow[] {
  const ghMap = hashrateByWorkerId(activeRigs);
  const rows: WorkerRow[] = [];
  for (const [id, w] of Object.entries(workersObj)) {
    const payout = w.payout_address ?? w.miner_address ?? "";
    if (!payout || normAddr(payout) !== needle) continue;
    const fromWorker = w.hashrate_gh_s ?? w.pool_hashrate_gh_s ?? 0;
    rows.push({
      id,
      payoutAddress: payout,
      payoutHmc: w.payout_hmc ?? 0,
      hashrateGh: fromWorker > 0 ? fromWorker : (ghMap.get(id) ?? 0),
    });
  }
  return rows;
}

export async function lookupWorkersByAddress(address: string): Promise<WorkerLookupResult> {
  const needle = normAddr(address);
  if (!needle || needle.length < 8 || !needle.startsWith("HMC-")) {
    return { ok: false, address, message: "Enter a valid HMC payout address (HMC-…)" };
  }
  try {
    // Public /api/work/stats already includes the workers map. ?details=1 is admin-only.
    const res = await fetchWithTimeout(publicWorkStatsUrl(), { cache: "no-store" }, 8_000);
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? " — public worker list blocked (unexpected; details=1 is admin-only)"
          : "";
      return {
        ok: false,
        address,
        message: `Coordinator returned HTTP ${res.status}${hint}`,
      };
    }
    const body = (await res.json()) as {
      workers?: WorkStatsWorkers;
      active_rigs?: ActiveRig[];
      total_payout_hmc?: number;
    };
    const rows = matchWorkers(body.workers ?? {}, needle, body.active_rigs);
    if (!rows.length) {
      return {
        ok: false,
        address,
        message: "No workers found for this payout address on the coordinator",
      };
    }
    const totalPayoutHmc = rows.reduce((s, r) => s + r.payoutHmc, 0);
    return { ok: true, address, workers: rows, totalPayoutHmc };
  } catch {
    return { ok: false, address, message: "Could not reach pool coordinator — check network / pool-proxy" };
  }
}

export function renderWorkerLookupPanel(prefill = ""): string {
  return `<section class="pool-section pool-worker-lookup" id="pool-worker-lookup">
    <header class="pool-section-head">
      <h3>Worker lookup</h3>
      <p class="muted small">Find rigs by HMC payout address · read-only</p>
    </header>
    <div class="pool-worker-form glass-inset">
      <label class="muted small" for="pool-worker-addr">Payout address</label>
      <div class="pool-worker-row">
        <input id="pool-worker-addr" class="inp mono" type="text" placeholder="HMC-…" value="${escapeHtml(prefill)}" autocomplete="off" spellcheck="false" />
        <button type="button" class="btn-primary" id="pool-worker-search">Lookup</button>
      </div>
      <div id="pool-worker-result" class="pool-worker-result muted small" role="status">Enter your HMC address from miner config</div>
    </div>
  </section>`;
}

export function renderWorkerLookupResult(result: WorkerLookupResult): string {
  if (!result.ok) {
    return `<p class="pool-worker-msg warn" role="status">${escapeHtml(result.message)}</p>`;
  }
  const rows = result.workers
    .map(
      (w) => `<tr>
        <td class="mono">${escapeHtml(w.id)}</td>
        <td class="mono">${formatGh(w.hashrateGh)}</td>
        <td class="mono">${formatNum(w.payoutHmc, 4)} HMC</td>
      </tr>`,
    )
    .join("");
  return `<div class="pool-worker-msg ok" role="status">
    <p><strong>${result.workers.length}</strong> worker(s) · total accrued <strong class="mono">${formatNum(result.totalPayoutHmc, 4)} HMC</strong></p>
    <table class="data-table compact pool-worker-table">
      <thead><tr><th>Worker ID</th><th>Hashrate</th><th>Accrued</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
