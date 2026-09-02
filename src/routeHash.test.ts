import { describe, expect, it } from "vitest";
import { formatRouteHash, parseRouteHash } from "./routeHash";
import { exportDemoJson, parseDemoImport } from "./demoIo";
import { baseState } from "./testFixtures";

describe("routeHash", () => {
  it("parses spot pair/tf", () => {
    expect(parseRouteHash("#spot/HMC_USDT/15m")).toEqual({
      view: "spot",
      pair: "HMC_USDT",
      tf: "15m",
    });
    expect(parseRouteHash("#SUP_BTC/1H")).toEqual({ pair: "SUP_BTC", tf: "1H" });
  });

  it("parses non-spot views", () => {
    expect(parseRouteHash("#convert")).toEqual({ view: "convert" });
    expect(parseRouteHash("#pool")).toEqual({ view: "pool" });
    expect(parseRouteHash("#convert/hmc/usdt")).toEqual({ view: "convert", convertFrom: "hmc", convertTo: "usdt" });
    expect(parseRouteHash("#account/deposit")).toEqual({ view: "account", section: "deposit" });
    expect(parseRouteHash("#pool/lookup/HMC-abc")).toEqual({ view: "pool", poolAddress: "HMC-abc" });
  });

  it("formats and ignores junk", () => {
    expect(formatRouteHash("spot", "HMC_USDT", "5m")).toBe("#spot/HMC_USDT/5m");
    expect(formatRouteHash("account", "HMC_USDT", "1m")).toBe("#account");
    expect(parseRouteHash("#nope/wat")).toEqual({});
  });
});

describe("demoIo", () => {
  it("round-trips export wrapper", () => {
    const st = baseState();
    const raw = exportDemoJson(st);
    const back = parseDemoImport(raw);
    expect(back.wallet.usdt).toBe(st.wallet.usdt);
    expect(back.activePair).toBe(st.activePair);
  });

  it("accepts bare state JSON", () => {
    const st = baseState();
    const back = parseDemoImport(JSON.stringify(st));
    expect(back.wallet.hmc).toBe(st.wallet.hmc);
  });

  it("rejects garbage", () => {
    expect(() => parseDemoImport("{}")).toThrow(/wallet/);
  });
});
