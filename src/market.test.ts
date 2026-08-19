import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMarket, fetchMarket, localFallbackMarket, midForPair, tickerFromMarket } from "./market";
import { sampleMarket } from "./testFixtures";

describe("buildMarket", () => {
  it("derives mids from pool/work/sup inputs", () => {
    const m = buildMarket(
      { hashrate: 88e9, workers: 5, block_height: 155000, status: "ok" },
      { pool_hashrate_gh_s: 88, reward_per_m: 0.00021, workers_online: 5 },
      { economics: { total_minted_sup: 0.05, max_supply_sup: 21_000_000 } },
      0.00042,
      67_500,
    );
    expect(m.hmcUsdt).toBeGreaterThan(0);
    expect(m.supUsdt).toBeGreaterThan(0);
    expect(m.hmcSup).toBeCloseTo(m.hmcUsdt / m.supUsdt, 8);
    expect(m.hmcBtc).toBeCloseTo(m.hmcUsdt / 67_500, 12);
    expect(m.blockHeight).toBe(155000);
  });

  it("uses fallbacks when optional fields missing", () => {
    const m = buildMarket({}, {}, {}, 0.00042);
    expect(m.poolGh).toBeGreaterThan(0);
    expect(m.hmcUsdt).toBeGreaterThan(0);
  });

  it("localFallbackMarket is sync and positive", () => {
    const m = localFallbackMarket(0.00042);
    expect(m.hmcUsdt).toBeGreaterThan(0);
    expect(m.poolGh).toBe(35);
  });

  it("does not drift with client clock for the same inputs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00.000Z"));
    const a = buildMarket({}, {}, {}, 0.00042);
    vi.setSystemTime(new Date("2026-08-16T23:45:00.000Z"));
    const b = buildMarket({}, {}, {}, 0.00042);
    expect(b).toEqual(a);
    vi.useRealTimers();
  });

  it("fetchMarket stays live when work/stats fails but pool/stats ok", async () => {
    const poolBody = JSON.stringify({
      hashrate: 88e9,
      workers: 5,
      tip_height: 155000,
      status: "ok",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/pool/stats")) {
          return new Response(poolBody, { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/api/work/stats")) {
          throw new Error("proxy stall");
        }
        if (url.includes("/api/sup/economics")) {
          return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response("nope", { status: 404 });
      }),
    );
    const { market, source } = await fetchMarket(0.00042);
    expect(source).toBe("live");
    expect(market.poolGh).toBeCloseTo(88, 5);
    expect(market.hmcUsdt).toBeGreaterThan(0);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("midForPair / tickerFromMarket", () => {
  const m = sampleMarket();

  it("resolves each pair mid", () => {
    expect(midForPair(m, "HMC_USDT")).toBe(0.00043);
    expect(midForPair(m, "SUP_USDT")).toBe(0.000047);
    expect(midForPair(m, "HMC_SUP")).toBe(9.1);
    expect(midForPair(m, "HMC_BTC")).toBe(6.4e-9);
    expect(midForPair(m, "SUP_BTC")).toBe(7e-10);
  });

  it("builds ticker with bid < mid < ask", () => {
    const tk = tickerFromMarket(m, "HMC_USDT");
    expect(tk.pairId).toBe("HMC_USDT");
    expect(tk.bid).toBeLessThan(tk.mid);
    expect(tk.ask).toBeGreaterThan(tk.mid);
    expect(tk.spreadBps).toBeGreaterThanOrEqual(8);
    expect(tk.spreadBps).toBeLessThanOrEqual(36);
    expect(tk.source).toBe("live");
  });
});
