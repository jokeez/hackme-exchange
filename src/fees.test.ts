import { describe, expect, it } from "vitest";
import {
  activeVipTier,
  applyFeeToWallet,
  calcFee,
  formatBps,
  liquidityRole,
  nextVipProgress,
  sanitizeFeeConfig,
  volume30dUsdt,
} from "./fees";
import { executeFill } from "./execution";
import { placeOrder, processOpenOrders } from "./orders";
import { tickerFromMarket } from "./market";
import type { DemoState, PairId, Ticker } from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS, DEFAULT_FEE_CONFIG, DEFAULT_INDICATOR_CONFIG, DEFAULT_MULTI_PANE_PAIRS, DEFAULT_MULTI_PANE_TFS, STATE_VERSION } from "./types";
import type { MultiPanePairs, MultiPaneTfs } from "./types";
import { sampleMarket } from "./testFixtures";

function baseState(): DemoState {
  return {
    wallet: { usdt: 10_000, hmc: 50_000, sup: 8_000, btc: 0.15 },
    orders: [],
    trades: [],
    ledger: [],
    equitySnapshots: [],
    drawings: [],
    candles: {},
    activePair: "HMC_USDT",
    activeTf: "15m",
    chartMode: "candles",
    chartSettings: structuredClone(DEFAULT_CHART_SETTINGS),
    favoritePairs: [],
    mainView: "spot",
    bookGrouping: 0,
    bookView: "book",
    oracleAnchor: 0.05,
    initialEquityUsdt: 10_000,
    priceAlerts: [],
    equityBaselineV: 2,
    stateVersion: STATE_VERSION,
    feeConfig: structuredClone(DEFAULT_FEE_CONFIG),
    secondaryTf: "4H",
    multiPaneTfs: [...DEFAULT_MULTI_PANE_TFS] as MultiPaneTfs,
    multiPanePairs: [...DEFAULT_MULTI_PANE_PAIRS] as MultiPanePairs,
    chartFullscreen: false,
    multiChart: false,
    multiChartLayout: "1" as const,
    multiChartLinked: false,
    chartOverlays: structuredClone(DEFAULT_CHART_OVERLAYS),
    indicatorConfig: structuredClone(DEFAULT_INDICATOR_CONFIG),
    drawingsLocked: false,
    activeDrawTool: "cursor" as const,
  };
}

const market = {
  hmcUsdt: 0.00043,
  supUsdt: 0.000047,
  hmcSup: 9.1,
  hmcBtc: 6.4e-9,
  supBtc: 7e-10,
  poolGh: 88,
  rewardPerM: 0.00021,
  workers: 5,
  supMinted: 0.05,
  supMax: 21_000_000,
  blockHeight: 155000,
  btcUsd: 67_500,
  targetMod: 1,
  totalPayoutHmc: 1000,
};

describe("fees", () => {
  it("maker vs taker roles", () => {
    expect(liquidityRole("limit")).toBe("maker");
    expect(liquidityRole("limit", false, true)).toBe("taker");
    expect(liquidityRole("market")).toBe("taker");
    expect(liquidityRole("stop_limit", true)).toBe("taker");
    expect(liquidityRole("oco")).toBe("maker");
    expect(liquidityRole("oco", true)).toBe("taker");
  });

  it("resting limit fill via processOpenOrders is maker (not reclassified by mid)", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 5_000, 0.0004, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    const m = sampleMarket({ hmcUsdt: 0.00039 });
    const ids: PairId[] = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
    const ticks = Object.fromEntries(ids.map((id) => [id, tickerFromMarket(m, id)])) as Record<PairId, Ticker>;
    processOpenOrders(s, m, ticks);
    expect(s.trades[0]?.feeRole).toBe("maker");
  });

  it("regular tier is 8/10 bps", () => {
    const s = baseState();
    const tier = activeVipTier(s);
    expect(tier.name).toBe("Regular");
    expect(tier.makerBps).toBe(8);
    expect(tier.takerBps).toBe(10);
  });

  it("VIP1 at 100k volume is 6/8 bps", () => {
    const s = baseState();
    s.trades = [{ id: "1", pairId: "HMC_USDT", side: "buy", price: 1, amountBase: 1, amountQuote: 150_000, feeQuote: 0, feeHmc: 0, feeRole: "taker", feePaidInHmc: false, ts: Date.now() }];
    const tier = activeVipTier(s);
    expect(tier.name).toBe("VIP 1");
    expect(tier.makerBps).toBe(6);
    expect(tier.takerBps).toBe(8);
    expect(volume30dUsdt(s)).toBe(150_000);
  });

  it("taker fee on 1000 USDT quote", () => {
    const s = baseState();
    const fee = calcFee(s, market, "HMC_USDT", 1000, "taker");
    expect(fee.bps).toBe(10);
    expect(fee.feeQuote).toBeCloseTo(1, 5);
    expect(fee.paidInHmc).toBe(false);
  });

  it("maker fee lower than taker", () => {
    const s = baseState();
    const maker = calcFee(s, market, "HMC_USDT", 1000, "maker");
    const taker = calcFee(s, market, "HMC_USDT", 1000, "taker");
    expect(maker.feeQuote).toBeLessThan(taker.feeQuote);
  });

  it("VIP2 at 1M volume is 4/6 bps", () => {
    const s = baseState();
    s.trades = [{ id: "1", pairId: "HMC_USDT", side: "buy", price: 1, amountBase: 1, amountQuote: 1_500_000, feeQuote: 0, feeHmc: 0, feeRole: "taker", feePaidInHmc: false, ts: Date.now() }];
    const tier = activeVipTier(s);
    expect(tier.name).toBe("VIP 2");
    expect(tier.makerBps).toBe(4);
    expect(tier.takerBps).toBe(6);
  });

  it("VIP3 at 10M volume is 2/4 bps", () => {
    const s = baseState();
    s.trades = [{ id: "1", pairId: "HMC_USDT", side: "buy", price: 1, amountBase: 1, amountQuote: 10_000_000, feeQuote: 0, feeHmc: 0, feeRole: "taker", feePaidInHmc: false, ts: Date.now() }];
    const tier = activeVipTier(s);
    expect(tier.name).toBe("VIP 3");
    expect(tier.makerBps).toBe(2);
    expect(tier.takerBps).toBe(4);
  });

  it("HMC fee discount", () => {
    const s = baseState();
    s.feeConfig.payFeesInHmc = true;
    const fee = calcFee(s, market, "HMC_USDT", 1000, "taker");
    expect(fee.paidInHmc).toBe(true);
    expect(fee.feeQuote).toBeCloseTo(0.75, 5);
    expect(fee.feeHmc).toBeGreaterThan(0);
  });

  it("formatBps readable", () => {
    expect(formatBps(10)).toBe("0.100%");
    expect(formatBps(8)).toBe("0.080%");
  });
});

describe("execution", () => {
  it("market buy deducts taker fee", () => {
    const s = baseState();
    const before = s.wallet.usdt;
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.00043, 1000, 0.43, "market");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.fee.role).toBe("taker");
      expect(s.wallet.usdt).toBeLessThan(before - 0.43);
      expect(s.wallet.hmc).toBeGreaterThan(50_000);
    }
  });

  it("limit fill uses maker fee", () => {
    const s = baseState();
    const res = executeFill(s, market, "HMC_USDT", "sell", 0.00043, 500, 0.215, "limit");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.fee.role).toBe("maker");
  });

  it("sell deducts fee from USDT proceeds", () => {
    const s = baseState();
    const before = s.wallet.usdt;
    const res = executeFill(s, market, "HMC_USDT", "sell", 0.00043, 1000, 0.43, "market");
    expect(res.ok).toBe(true);
    if (res.ok) {
      const fee = res.fee.feeQuote;
      expect(s.wallet.usdt).toBeCloseTo(before + 0.43 - fee, 6);
    }
  });
});

describe("nextVipProgress", () => {
  it("shows path to VIP 1 from Regular", () => {
    const s = baseState();
    const p = nextVipProgress(s);
    expect(p.tier.name).toBe("Regular");
    expect(p.next?.name).toBe("VIP 1");
    expect(p.pct).toBeGreaterThanOrEqual(0);
    expect(p.remaining).toBeGreaterThan(0);
  });
});

describe("VIP FX + fee wallet edge cases", () => {
  it("calcFee uses BTC quote volume FX for VIP (not raw BTC as USDT)", () => {
    const s = baseState();
    const m = sampleMarket({ btcUsd: 67_500, hmcUsdt: 0.00043 });
    // ~150k USDT equivalent on HMC_BTC → VIP 1
    s.trades.push({
      id: "t1",
      pairId: "HMC_BTC",
      side: "buy",
      price: 1e-8,
      amountBase: 1,
      amountQuote: 150_000 / 67_500,
      feeQuote: 0,
      feeHmc: 0,
      feeRole: "taker",
      feePaidInHmc: false,
      ts: Date.now(),
    });
    expect(activeVipTier(s, m).name).toBe("VIP 1");
    const withFx = calcFee(s, m, "HMC_USDT", 1000, "taker");
    expect(withFx.vipName).toBe("VIP 1");
    expect(withFx.bps).toBe(8);
    // Without FX the same trade would look like ~2.2 "USDT" → Regular
    expect(activeVipTier(s).name).toBe("Regular");
  });

  it("applyFeeToWallet debits HMC when feeQuote is 0 but feeHmc > 0", () => {
    const s = baseState();
    const before = s.wallet.hmc;
    const res = applyFeeToWallet(s, "HMC_USDT", {
      role: "taker",
      bps: 10,
      feeQuote: 0,
      feeHmc: 1.5,
      paidInHmc: true,
      vipName: "Regular",
      hmcDiscountPct: 25,
    });
    expect(res.ok).toBe(true);
    expect(s.wallet.hmc).toBeCloseTo(before - 1.5, 8);
  });
});

describe("sanitizeFeeConfig", () => {
  it("pins maker/taker to Regular VIP and clamps discount", () => {
    const cfg = sanitizeFeeConfig({
      makerBps: -5,
      takerBps: 999,
      payFeesInHmc: true,
      hmcDiscountPct: 150,
    });
    expect(cfg.makerBps).toBe(8);
    expect(cfg.takerBps).toBe(10);
    expect(cfg.hmcDiscountPct).toBe(25);
    expect(cfg.payFeesInHmc).toBe(true);
  });

  it("zero discount stays valid", () => {
    expect(sanitizeFeeConfig({ hmcDiscountPct: 0 }).hmcDiscountPct).toBe(0);
  });
});
