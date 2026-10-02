import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./config/integration", () => ({
  INTEGRATION: {
    poolCoordinatorOrigin: "https://example.test/pool-proxy",
    hubOrigin: "https://example.test/hub-proxy",
  },
}));

describe("oracleFetch cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/pool/stats")) {
          return new Response(JSON.stringify({ status: "ok", hashrate: 1e9, workers: 2, tip_height: 1 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (String(url).includes("/api/work/stats")) {
          return new Response(JSON.stringify({ pool_hashrate_gh_s: 12.5, workers_online: 2, reward_per_m: 0.001 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("no", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dedupes concurrent pool stats fetches", async () => {
    const { fetchPoolStatsCached } = await import("./oracleFetch");
    const [a, b] = await Promise.all([fetchPoolStatsCached(true), fetchPoolStatsCached(true)]);
    expect(a.status).toBe("ok");
    expect(b).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns work stats with details=0 URL", async () => {
    const { fetchWorkStatsCached } = await import("./oracleFetch");
    const w = await fetchWorkStatsCached(true);
    expect(w.pool_hashrate_gh_s).toBe(12.5);
    expect(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain("details=0");
  });
});
