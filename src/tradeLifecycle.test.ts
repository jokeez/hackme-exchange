/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { executeFill } from "./execution";
import { placeOco, placeOrder, processOpenOrders } from "./orders";
import { cancelAllOpenOrders, cancelOrder } from "./store";
import { tickerFromMarket } from "./market";
import { baseState, installMemoryLocalStorage, sampleMarket } from "./testFixtures";
import type { PairId, Ticker } from "./types";

const market = sampleMarket();

function ticks(m = market): Record<PairId, Ticker> {
  const ids: PairId[] = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
  return Object.fromEntries(ids.map((id) => [id, tickerFromMarket(m, id)])) as Record<PairId, Ticker>;
}

describe("trade lifecycle: place → fill/cancel → open list empty", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("market fill does not leave an open order", () => {
    const s = baseState();
    const mid = market.hmcUsdt;
    const amt = 1000;
    const res = executeFill(s, market, "HMC_USDT", "buy", mid, amt, mid * amt, "market");
    expect(res.ok).toBe(true);
    expect(s.orders.filter((o) => o.status === "open" || o.status === "triggered")).toHaveLength(0);
    expect(s.trades.length).toBeGreaterThan(0);
  });

  it("resting limit appears open then vanishes after fill", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 500, 0.0004, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    expect(s.orders.filter((x) => x.status === "open")).toHaveLength(1);
    const m = sampleMarket({ hmcUsdt: 0.00039 });
    processOpenOrders(s, m, ticks(m));
    expect(s.orders.filter((x) => x.status === "open" || x.status === "triggered")).toHaveLength(0);
    expect(s.orders.some((x) => x.status === "filled")).toBe(true);
  });

  it("manual cancel removes from open list", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "sell", "limit", 200, 0.0005, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    if (!("id" in o)) return;
    cancelOrder(s, o.id);
    expect(s.orders.filter((x) => x.status === "open")).toHaveLength(0);
    expect(o.status).toBe("cancelled");
  });

  it("cancelAllOpenOrders clears every open/triggered", () => {
    const s = baseState();
    placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.0004, undefined, undefined, "GTC", false, market);
    placeOrder(s, "HMC_USDT", "sell", "stop_limit", 100, 0.00035, 0.00036, undefined, "GTC", false, market);
    expect(cancelAllOpenOrders(s)).toBeGreaterThanOrEqual(2);
    expect(s.orders.every((o) => o.status === "cancelled" || o.status === "filled")).toBe(true);
  });

  it("OCO: TP fill cancels SL — no open leftovers", () => {
    const s = baseState();
    const placed = placeOco(s, "HMC_USDT", "sell", 100, 0.0005, 0.00038, 0.00037, market);
    expect("tp" in placed).toBe(true);
    if (!("tp" in placed)) return;
    expect(s.orders.filter((o) => o.status === "open")).toHaveLength(2);
    const m = sampleMarket({ hmcUsdt: 0.00052 });
    processOpenOrders(s, m, ticks(m));
    expect(placed.tp.status).toBe("filled");
    expect(placed.sl.status).toBe("cancelled");
    expect(s.orders.filter((o) => o.status === "open" || o.status === "triggered")).toHaveLength(0);
  });

  it("OCO: SL stays open when mid is between stop and TP", () => {
    const s = baseState();
    const placed = placeOco(s, "HMC_USDT", "sell", 100, 0.0005, 0.00038, 0.00037, market);
    expect("tp" in placed).toBe(true);
    if (!("tp" in placed)) return;
    const m = sampleMarket({ hmcUsdt: 0.00042 });
    processOpenOrders(s, m, ticks(m));
    expect(placed.tp.status).toBe("open");
    expect(placed.sl.status).toBe("open");
  });
});
