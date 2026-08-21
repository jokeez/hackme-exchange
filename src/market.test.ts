import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REFERENCE_MID,
  buildMarket,
  fetchMarket,
  localFallbackMarket,
  midForPair,
  tickerFromMarket,
} from "./market";
import { sampleMarket } from "./testFixtures";

describe("buildMarket", () => {
  it("uses operator reference mid — pool GH does not scale price", () => {
    const low = buildMarket(
      { hashrate: 10e9, workers: 2, tip_height: 155000, status: "ok" },
      { pool_hashrate_gh_s: 10, reward_per_m: 0.00001, workers_online: 2 },
      { economics: { total_minted_sup: 0.05, max_supply_sup: 21_000_000 } },
      DEFAULT_REFERENCE_MID,
      67_500,
    );
    const high = buildMarket(
      { hashrate: 800e9, workers: 40, tip_height: 155000, status: "ok" },
      { pool_hashrate_gh_s: 800, reward_per_m: 0.00001, workers_online: 40 },
      { economics: { total_minted_sup: 0.05, max_supply_sup: 21_000_000 } },
      DEFAULT_REFERENCE_MID,
      67_500,
    );
    expect(low.hmcUsdt).toBe(DEFAULT_REFERENCE_MID);
    expect(high.hmcUsdt).toBe(DEFAULT_REFERENCE_MID);
    expect(low.supUsdt).toBe(0.01);
    expect(high.poolGh).toBeGreaterThan(low.poolGh);
    expect(low.hmcSup).toBeCloseTo(5, 8);
    expect(low.hmcBtc).toBeCloseTo(low.hmcUsdt / 67_500, 12);
    expect(low.blockHeight).toBe(155000);
  });

  it("uses fallbacks when optional fields missing", () => {
    const m = buildMarket({}, {}, {}, DEFAULT_REFERENCE_MID);
    expect(m.poolGh).toBeGreaterThan(0);
    expect(m.hmcUsdt).toBe(DEFAULT_REFERENCE_MID);
  });

  it("localFallbackMarket is sync and positive", () => {
    const m = localFallbackMarket(DEFAULT_REFERENCE_MID);
    expect(m.hmcUsdt).toBe(DEFAULT_REFERENCE_MID);
    expect(m.poolGh).toBe(35);
  });

  it("does not drift with client clock for the same inputs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00.000Z"));
    const a = buildMarket({}, {}, {}, DEFAULT_REFERENCE_MID);
    vi.setSystemTime(new Date("2026-08-16T23:45:00.000Z"));
    const b = buildMarket({}, {}, {}, DEFAULT_REFERENCE_MID);
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
    const { market, source } = await fetchMarket(DEFAULT_REFERENCE_MID);
    expect(source).toBe("live");
    expect(market.poolGh).toBeCloseTo(88, 5);
    expect(market.hmcUsdt).toBe(DEFAULT_REFERENCE_MID);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("midForPair / tickerFromMarket", () => {
  const m = sampleMarket();

  it("resolves each pair mid", () => {
    expect(midForPair(m, "HMC_USDT")).toBe(0.05);
    expect(midForPair(m, "SUP_USDT")).toBe(0.01);
    expect(midForPair(m, "HMC_SUP")).toBeCloseTo(m.hmcSup, 12);
    expect(midForPair(m, "HMC_BTC")).toBeCloseTo(m.hmcBtc, 14);
    expect(midForPair(m, "SUP_BTC")).toBeCloseTo(m.supBtc, 14);
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
