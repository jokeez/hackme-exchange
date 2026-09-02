/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { lookupWorkersByAddress, renderWorkerLookupResult } from "./poolWorker";

describe("poolWorker lookup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects short addresses", async () => {
    const r = await lookupWorkersByAddress("HMC-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/valid HMC payout address/i);
  });

  it("matches workers case-insensitively on payout address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          workers: {
            rig_a: { payout_address: "hmc-demo-abc12345", payout_hmc: 1.5, hashrate_gh_s: 12 },
            rig_b: { miner_address: "HMC-OTHER-99999999", payout_hmc: 2, hashrate_gh_s: 8 },
          },
        }),
      })),
    );
    const r = await lookupWorkersByAddress("HMC-DEMO-ABC12345");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.workers).toHaveLength(1);
      expect(r.workers[0]!.id).toBe("rig_a");
      expect(r.totalPayoutHmc).toBeCloseTo(1.5);
    }
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
