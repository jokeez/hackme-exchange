import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BTC_USD,
  DEFAULT_REFERENCE_MID,
  DEFAULT_SUP_REFERENCE_MID,
  PAPER_MID_BAND,
  applyLivePaperMids,
  buildMarket,
  fetchMarket,
  liveReferenceMid,
  localFallbackMarket,
  midForPair,
  paperPairMid,
  resyncCrossMids,
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

  it("resyncs BTC crosses when btcUsd changes", () => {
    const m = resyncCrossMids({
      ...buildMarket({}, {}, {}, 0.05, 67_500),
      btcUsd: 100_000,
      hmcUsdt: 0.05,
      supUsdt: 0.01,
    });
    expect(m.hmcBtc).toBeCloseTo(0.05 / 100_000, 14);
    expect(m.supBtc).toBeCloseTo(0.01 / 100_000, 14);
    expect(m.hmcSup).toBeCloseTo(5, 12);
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
        if (url.includes("BTCUSDT")) {
          return new Response(JSON.stringify({ price: "97500.12" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("nope", { status: 404 });
      }),
    );
    const { market, source } = await fetchMarket(DEFAULT_REFERENCE_MID);
    expect(source).toBe("live");
    expect(market.poolGh).toBeCloseTo(88, 5);
    expect(market.btcUsd).toBe(DEFAULT_BTC_USD);
    expect(market.hmcUsdt).toBeGreaterThan(DEFAULT_REFERENCE_MID * (1 - PAPER_MID_BAND - 1e-9));
    expect(market.hmcUsdt).toBeLessThan(DEFAULT_REFERENCE_MID * (1 + PAPER_MID_BAND + 1e-9));
    expect(market.hmcBtc).toBeCloseTo(market.hmcUsdt / DEFAULT_BTC_USD, 14);
    expect(market.supBtc).toBeCloseTo(market.supUsdt / DEFAULT_BTC_USD, 14);
  });
});

describe("liveReferenceMid / applyLivePaperMids", () => {
  it("walks within band and changes over time", () => {
    const a = liveReferenceMid(0.05, "hmc", 1_700_000_000_000);
    const b = liveReferenceMid(0.05, "hmc", 1_700_000_000_000 + 700 * 40);
    expect(a).toBeGreaterThan(0.05 * (1 - PAPER_MID_BAND));
    expect(a).toBeLessThan(0.05 * (1 + PAPER_MID_BAND));
    expect(b).not.toBe(a);
    expect(Math.abs(a - 0.05) / 0.05).toBeLessThanOrEqual(PAPER_MID_BAND + 1e-12);
  });

  it("keeps HMC/SUP legs synchronized and pins shared paper BTC", () => {
    const base = buildMarket({}, {}, {}, 0.05, 90_000);
    const live = applyLivePaperMids(base, 0.05, DEFAULT_SUP_REFERENCE_MID, 1_700_000_123_000);
    expect(live.hmcSup).toBeCloseTo(live.hmcUsdt / live.supUsdt, 12);
    expect(live.btcUsd).toBe(DEFAULT_BTC_USD);
    expect(live.hmcBtc).toBeCloseTo(live.hmcUsdt / DEFAULT_BTC_USD, 14);
    expect(live.supBtc).toBeCloseTo(live.supUsdt / DEFAULT_BTC_USD, 14);
    expect(midForPair(live, "HMC_BTC")).toBe(live.hmcBtc);
    expect(midForPair(live, "SUP_BTC")).toBe(live.supBtc);
  });

  it("paperPairMid is identical for the same wall clock on every client", () => {
    const t = 1_700_000_123_000;
    expect(paperPairMid("HMC_USDT", t)).toBe(paperPairMid("HMC_USDT", t));
    expect(paperPairMid("SUP_USDT", t)).toBe(liveReferenceMid(DEFAULT_SUP_REFERENCE_MID, "sup", t));
    expect(paperPairMid("HMC_BTC", t)).toBeCloseTo(paperPairMid("HMC_USDT", t) / DEFAULT_BTC_USD, 14);
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
