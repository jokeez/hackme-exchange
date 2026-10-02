/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  lookupWorkersByAddress,
  publicWorkStatsUrl,
  renderWorkerLookupResult,
} from "./poolWorker";

describe("poolWorker lookup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects short / non-HMC addresses", async () => {
    const r = await lookupWorkersByAddress("HMC-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/valid HMC payout address/i);
    const r2 = await lookupWorkersByAddress("not-an-address");
    expect(r2.ok).toBe(false);
  });

  it("uses public work/stats URL without details=1 (admin-gated)", () => {
    expect(publicWorkStatsUrl("https://exchange.hackme.tech/pool-proxy")).toBe(
      "https://exchange.hackme.tech/pool-proxy/api/work/stats",
    );
    expect(publicWorkStatsUrl("https://x/pool-proxy/")).not.toMatch(/details=/);
  });

  it("matches workers case-insensitively on payout address", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).not.toMatch(/details=1/);
      expect(String(url)).toMatch(/\/api\/work\/stats$/);
      return {
        ok: true,
        json: async () => ({
          workers: {
            rig_a: { payout_address: "hmc-demo-abc12345", payout_hmc: 1.5, hashrate_gh_s: 12 },
            rig_b: { miner_address: "HMC-OTHER-99999999", payout_hmc: 2, hashrate_gh_s: 8 },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await lookupWorkersByAddress("HMC-DEMO-ABC12345");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.workers).toHaveLength(1);
      expect(r.workers[0]!.id).toBe("rig_a");
      expect(r.totalPayoutHmc).toBeCloseTo(1.5);
    }
  });

  it("fills hashrate from active_rigs when worker row has 0 GH/s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          workers: {
            rig_z: { payout_address: "HMC-ABCDEFGH12345678", payout_hmc: 0.25, hashrate_gh_s: 0 },
          },
          active_rigs: [{ worker_id: "rig_z", hashrate_gh_s: 42.5 }],
        }),
      })),
    );
    const r = await lookupWorkersByAddress("HMC-ABCDEFGH12345678");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workers[0]!.hashrateGh).toBeCloseTo(42.5);
  });

  it("never asks details=1 even when coordinator would 401", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("details=1")) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          workers: {
            kapa: { payout_address: "HMC-91fe007e4036c602", payout_hmc: 0.57, hashrate_gh_s: 128 },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await lookupWorkersByAddress("HMC-91fe007e4036c602");
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).not.toMatch(/details=/);
  });

  it("renderWorkerLookupResult escapes worker ids", () => {
    const html = renderWorkerLookupResult({
      ok: true,
      address: "HMC-X",
      totalPayoutHmc: 1,
      workers: [{ id: "<script>", payoutAddress: "HMC-X", payoutHmc: 1, hashrateGh: 1 }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
