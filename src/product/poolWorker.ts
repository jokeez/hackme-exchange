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

function normAddr(a: string): string {
  return a.trim().toUpperCase();
}

export async function lookupWorkersByAddress(address: string): Promise<WorkerLookupResult> {
  const needle = normAddr(address);
  if (!needle || needle.length < 8) {
    return { ok: false, address, message: "Enter a valid HMC payout address (HMC-…)" };
  }
  try {
    const res = await fetchWithTimeout(`${poolBase()}/api/work/stats?details=1`, {}, 6000);
    if (!res.ok) {
      return {
        ok: false,
        address,
        message: `Coordinator returned HTTP ${res.status} — worker breakdown may require admin details`,
      };
    }
    const body = (await res.json()) as { workers?: WorkStatsWorkers; total_payout_hmc?: number };
    const workersObj = body.workers ?? {};
    const rows: WorkerRow[] = [];
    for (const [id, w] of Object.entries(workersObj)) {
      const payout = w.payout_address ?? w.miner_address ?? "";
      if (!payout || normAddr(payout) !== needle) continue;
      rows.push({
        id,
        payoutAddress: payout,
        payoutHmc: w.payout_hmc ?? 0,
        hashrateGh: w.hashrate_gh_s ?? w.pool_hashrate_gh_s ?? 0,
      });
    }
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
        <input id="pool-worker-addr" class="inp mono" type="text" placeholder="HMC-…" value="${escapeHtml(prefill)}" autocomplete="off" />
        <button type="button" class="btn-primary" id="pool-worker-search">Lookup</button>
      </div>
      <div id="pool-worker-result" class="pool-worker-result muted small">Enter your HMC address from miner config</div>
    </div>
  </section>`;
}

export function renderWorkerLookupResult(result: WorkerLookupResult): string {
  if (!result.ok) {
    return `<p class="pool-worker-msg warn">${escapeHtml(result.message)}</p>`;
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
  return `<div class="pool-worker-msg ok">
    <p><strong>${result.workers.length}</strong> worker(s) · total accrued <strong class="mono">${formatNum(result.totalPayoutHmc, 4)} HMC</strong></p>
    <table class="data-table compact pool-worker-table">
      <thead><tr><th>Worker ID</th><th>Hashrate</th><th>Accrued</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
