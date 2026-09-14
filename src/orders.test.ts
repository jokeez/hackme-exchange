import { describe, expect, it } from "vitest";
import { executeFill } from "./execution";
import {
  cancelOcoGroup,
  isMarketableLimit,
  orderTypeLabel,
  placeOco,
  placeOrder,
  processOpenOrders,
  validateLimitOrder,
} from "./orders";
import { tickerFromMarket } from "./market";
import { baseState, sampleMarket } from "./testFixtures";
import type { PairId, Ticker } from "./types";

const market = sampleMarket();

function tickersFor(m = market): Record<PairId, Ticker> {
  const ids: PairId[] = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
  return Object.fromEntries(ids.map((id) => [id, tickerFromMarket(m, id)])) as Record<PairId, Ticker>;
}

describe("orders validation", () => {
  it("detects marketable limit", () => {
    expect(isMarketableLimit("buy", 0.0005, 0.00043)).toBe(true);
    expect(isMarketableLimit("buy", 0.0004, 0.00043)).toBe(false);
    expect(isMarketableLimit("sell", 0.0004, 0.00043)).toBe(true);
    expect(isMarketableLimit("sell", 0.0005, 0.00043)).toBe(false);
  });

  it("rejects post-only when marketable", () => {
    const v = validateLimitOrder("buy", 0.0005, 0.00043, "GTC", true);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("Post-only");
  });

  it("rejects FOK when not marketable", () => {
    const v = validateLimitOrder("buy", 0.0004, 0.00043, "FOK", false);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("FOK");
  });

  it("rejects IOC when not marketable", () => {
    const v = validateLimitOrder("sell", 0.0005, 0.00043, "IOC", false);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("IOC");
  });

  it("allows resting GTC", () => {
    const v = validateLimitOrder("buy", 0.0004, 0.00043, "GTC", false);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.immediate).toBe(false);
  });

  it("default resting buy/sell limits sit off mid (not instant fill)", () => {
    const mid = 0.00043;
    const buyRest = mid * 0.9985;
    const sellRest = mid * 1.0015;
    expect(isMarketableLimit("buy", buyRest, mid)).toBe(false);
    expect(isMarketableLimit("sell", sellRest, mid)).toBe(false);
    const buyCheck = validateLimitOrder("buy", buyRest, mid, "GTC", false);
    const sellCheck = validateLimitOrder("sell", sellRest, mid, "GTC", false);
    expect(buyCheck.ok).toBe(true);
    expect(sellCheck.ok).toBe(true);
    if (buyCheck.ok) expect(buyCheck.immediate).toBe(false);
    if (sellCheck.ok) expect(sellCheck.immediate).toBe(false);
  });

  it("allows marketable GTC as immediate", () => {
    const v = validateLimitOrder("sell", 0.0004, 0.00043, "GTC", false);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.immediate).toBe(true);
  });
});

describe("placeOrder / OCO", () => {
  it("placeOrder rejects post-only that would take", () => {
    const s = baseState();
    // sample mid 0.05 — buy @ 0.051 crosses ask → post-only must reject
    const bad = placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.051, undefined, undefined, "GTC", true, market);
    expect(bad).toMatchObject({ ok: false });
    if ("ok" in bad && bad.ok === false) expect(bad.reason).toContain("Post-only");
  });

  it("placeOrder prepends open order", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.049, undefined, undefined, "GTC", true);
    expect(o.postOnly).toBe(true);
    expect(o.status).toBe("open");
    expect(o.source).toBe("paper");
    expect(s.orders[0].id).toBe(o.id);
  });

  it("marketable GTC limit with market fills as taker (not resting maker)", () => {
    const s = baseState();
    const before = s.wallet.usdt;
    // sample mid 0.05 — buy @ 0.051 crosses
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.051, undefined, undefined, "GTC", false, market);
    expect("id" in o && o.status === "filled").toBe(true);
    expect(s.trades[0]?.feeRole).toBe("taker");
    expect(s.wallet.usdt).toBeLessThan(before);
  });

  it("marketable IOC limit fills immediately as taker", () => {
    const s = baseState();
    const before = s.wallet.usdt;
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.051, undefined, undefined, "IOC", false, market);
    expect("id" in o && o.status === "filled").toBe(true);
    expect(s.trades[0]?.feeRole).toBe("taker");
    expect(s.wallet.usdt).toBeLessThan(before);
    expect(s.orders.filter((x) => x.status === "open")).toHaveLength(0);
  });

  it("marketable FOK limit fills immediately as taker", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "sell", "limit", 100, 0.0004, undefined, undefined, "FOK", false, market);
    expect("id" in o && o.status === "filled").toBe(true);
    expect(s.trades[0]?.feeRole).toBe("taker");
  });

  it("rejects second buy limit when funds reserved by first", () => {
    const s = baseState({ wallet: { usdt: 50, hmc: 0, sup: 0, btc: 0 } });
    const first = placeOrder(s, "HMC_USDT", "buy", "limit", 1000, 0.04, undefined, undefined, "GTC", false, market);
    expect("id" in first).toBe(true);
    const second = placeOrder(s, "HMC_USDT", "buy", "limit", 1000, 0.04, undefined, undefined, "GTC", false, market);
    expect(second).toMatchObject({ ok: false });
    if ("reason" in second) expect(second.reason).toMatch(/reserved|Insufficient/i);
  });

  it("placeOco creates linked TP/SL", () => {
    const s = baseState();
    const { tp, sl } = placeOco(s, "HMC_USDT", "sell", 50, 0.0005, 0.00038, 0.00037);
    expect(tp.ocoRole).toBe("tp");
    expect(sl.ocoRole).toBe("sl");
    expect(tp.ocoGroupId).toBe(sl.ocoGroupId);
    expect(s.orders).toHaveLength(2);
  });

  it("rejects buy OCO when SL limit needs more quote than free", () => {
    // TP is cheap enough for 50 USDT, SL limit is not
    const s = baseState({ wallet: { usdt: 50, hmc: 0, sup: 0, btc: 0 } });
    const res = placeOco(s, "HMC_USDT", "buy", 100_000, 0.0004, 0.0006, 0.00055, market);
    expect(res).toMatchObject({ ok: false });
    expect(s.orders).toHaveLength(0);
  });

  it("cancelOcoGroup cancels open legs", () => {
    const s = baseState();
    const { tp, sl } = placeOco(s, "HMC_USDT", "sell", 10, 0.0005, 0.0003, 0.00029);
    cancelOcoGroup(s, tp.ocoGroupId!);
    expect(tp.status).toBe("cancelled");
    expect(sl.status).toBe("cancelled");
  });
});

describe("processOpenOrders", () => {
  it("fills resting buy limit when mid drops to price", () => {
    const s = baseState();
    placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.0005);
    const m = sampleMarket({ hmcUsdt: 0.00049 });
    const notes = processOpenOrders(s, m, tickersFor(m));
    expect(notes.some((n) => n.includes("Filled"))).toBe(true);
    expect(s.orders[0].status).toBe("filled");
    expect(s.orders.filter((o) => o.status === "open")).toHaveLength(0);
  });

  it("cancels OCO sibling when TP fills", () => {
    const s = baseState();
    const placed = placeOco(s, "HMC_USDT", "sell", 50, 0.0004, 0.00035, 0.00034, market);
    expect("tp" in placed).toBe(true);
    if (!("tp" in placed)) return;
    // Mid rises to TP → fill sell TP, cancel SL
    const m = sampleMarket({ hmcUsdt: 0.00041 });
    processOpenOrders(s, m, tickersFor(m));
    expect(placed.tp.status).toBe("filled");
    expect(placed.sl.status).toBe("cancelled");
    expect(s.orders.filter((o) => o.status === "open" || o.status === "triggered")).toHaveLength(0);
  });

  it("does not double-fill OCO when SL is processed before TP", () => {
    // Overlapping buy geometry: SL fill mid also marketable for TP — sibling must stay cancelled.
    const m0 = sampleMarket({ hmcUsdt: 0.048 });
    const s = baseState({ wallet: { usdt: 10_000, hmc: 0, sup: 0, btc: 0 } });
    const placed = placeOco(s, "HMC_USDT", "buy", 1000, 0.055, 0.05, 0.05, m0);
    expect("tp" in placed).toBe(true);
    if (!("tp" in placed)) return;
    // Import / reorder can put SL ahead of TP in the open-orders array.
    s.orders = [placed.sl, placed.tp];
    const m = sampleMarket({ hmcUsdt: 0.05 });
    processOpenOrders(s, m, tickersFor(m));
    const filled = [placed.sl, placed.tp].filter((o) => o.status === "filled");
    expect(filled).toHaveLength(1);
    expect(s.trades).toHaveLength(1);
    expect(s.wallet.hmc).toBe(1000);
    expect([placed.sl.status, placed.tp.status].sort()).toEqual(["cancelled", "filled"]);
  });

  it("cancels OCO sibling when one leg fails to fill", () => {
    const s = baseState({ wallet: { usdt: 10_000, hmc: 50, sup: 0, btc: 0 } });
    const placed = placeOco(s, "HMC_USDT", "sell", 50, 0.06, 0.04, 0.039, market);
    expect("tp" in placed).toBe(true);
    if (!("tp" in placed)) return;
    // Drain base so sell fill fails funds check.
    s.wallet.hmc = 0;
    const m = sampleMarket({ hmcUsdt: 0.061 });
    processOpenOrders(s, m, tickersFor(m));
    expect(placed.tp.status).toBe("cancelled");
    expect(placed.sl.status).toBe("cancelled");
    expect(s.trades).toHaveLength(0);
  });

  it("buy stop-market cancels when VWAP exceeds ceiling", () => {
    const m0 = sampleMarket({ hmcUsdt: 0.05 });
    const s = baseState({ wallet: { usdt: 10_000, hmc: 0, sup: 0, btc: 0 } });
    const o = placeOrder(s, "HMC_USDT", "buy", "stop_market", 1000, 0.0501, 0.05, undefined, "GTC", false, m0);
    expect("id" in o).toBe(true);
    if (!("id" in o)) return;
    // Wide ask ladder relative to tight ceiling.
    const m = sampleMarket({ hmcUsdt: 0.052 });
    const ticks = tickersFor(m);
    ticks.HMC_USDT = {
      ...ticks.HMC_USDT,
      mid: 0.052,
      bid: 0.051,
      ask: 0.055,
    };
    const notes = processOpenOrders(s, m, ticks);
    expect(notes.some((n) => /ceiling/i.test(n))).toBe(true);
    expect(o.status).toBe("cancelled");
    expect(s.trades).toHaveLength(0);
  });

  it("uses ticker mid over market mid for fills", () => {
    const s = baseState();
    placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.0004);
    const m = sampleMarket({ hmcUsdt: 0.0005 }); // market alone would not fill buy@0.0004
    const ticks = tickersFor(m);
    ticks.HMC_USDT = { ...ticks.HMC_USDT, mid: 0.00039 }; // blended mid crosses limit
    const notes = processOpenOrders(s, m, ticks);
    expect(notes.some((n) => n.includes("Filled"))).toBe(true);
    expect(s.orders[0].status).toBe("filled");
  });

  it("triggers stop-limit then can fill", () => {
    const s = baseState();
    placeOrder(s, "HMC_USDT", "buy", "stop_limit", 100, 0.00045, 0.00044);
    const m = sampleMarket({ hmcUsdt: 0.00045 });
    processOpenOrders(s, m, tickersFor(m));
    expect(s.orders[0].status).toBe("filled");
    expect(s.trades[0]?.feeRole).toBe("taker");
  });

  it("sell stop-limit triggers then fills when mid reaches limit", () => {
    const s = baseState();
    placeOrder(s, "HMC_USDT", "sell", "stop_limit", 100, 0.048, 0.049);
    let m = sampleMarket({ hmcUsdt: 0.047 });
    processOpenOrders(s, m, tickersFor(m));
    expect(s.orders[0].status).toBe("triggered");
    m = sampleMarket({ hmcUsdt: 0.048 });
    processOpenOrders(s, m, tickersFor(m));
    expect(s.orders[0].status).toBe("filled");
    expect(s.trades[0]?.feeRole).toBe("taker");
  });

  it("buy OCO SL triggers on mid rise then fills at limit", () => {
    const s = baseState();
    const placed = placeOco(s, "HMC_USDT", "buy", 1000, 0.04, 0.055, 0.052, market);
    expect("tp" in placed).toBe(true);
    if (!("tp" in placed)) return;
    let m = sampleMarket({ hmcUsdt: 0.056 });
    processOpenOrders(s, m, tickersFor(m));
    expect(placed.sl.status).toBe("triggered");
    expect(placed.tp.status).toBe("open");
    m = sampleMarket({ hmcUsdt: 0.051 });
    processOpenOrders(s, m, tickersFor(m));
    expect(placed.sl.status).toBe("filled");
    expect(placed.tp.status).toBe("cancelled");
  });

  it("trailing stop sell triggers after rise then drop", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "sell", "trailing_stop", 500, 0.05, undefined, 2, "GTC", false, market);
    expect("id" in o).toBe(true);
    if (!("id" in o)) return;
    let m = sampleMarket({ hmcUsdt: 0.055 });
    processOpenOrders(s, m, tickersFor(m));
    expect(o.status).toBe("open");
    expect(o.trailAnchor).toBe(0.055);
    m = sampleMarket({ hmcUsdt: 0.0535 });
    processOpenOrders(s, m, tickersFor(m));
    expect(o.status).toBe("filled");
  });
});

describe("orderTypeLabel", () => {
  it("labels kinds and OCO roles", () => {
    expect(orderTypeLabel("market")).toBe("Market");
    expect(orderTypeLabel("limit")).toBe("Limit");
    expect(orderTypeLabel("stop_limit")).toBe("Stop-Limit");
    expect(orderTypeLabel("trailing_stop")).toBe("Trail Stop");
    expect(orderTypeLabel("oco")).toBe("OCO");
    expect(orderTypeLabel("oco", { ocoRole: "tp" } as never)).toBe("OCO TP");
    expect(orderTypeLabel("oco", { ocoRole: "sl" } as never)).toBe("OCO SL");
  });
});

describe("fill fee roles via executeFill", () => {
  it("fills resting limit as maker", () => {
    const s = baseState();
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.0004, 100, 0.04, "limit", false, false);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.fee.role).toBe("maker");
  });

  it("immediate limit fill is taker", () => {
    const s = baseState();
    const res = executeFill(s, market, "HMC_USDT", "buy", 0.00043, 100, 0.043, "limit", false, true);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.fee.role).toBe("taker");
  });
});
