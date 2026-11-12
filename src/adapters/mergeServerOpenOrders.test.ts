import { describe, expect, it } from "vitest";
import { FRESH_SERVER_ORDER_MS, mergeServerOpenOrders } from "./labMatching";

const order = (id: string, createdAt: number) =>
  ({ id, pairId: "HMC_USDT", side: "buy", kind: "limit", price: 0.07, amountBase: 2, filledBase: 0,
     status: "open", timeInForce: "GTC", source: "lab", createdAt }) as never;

describe("mergeServerOpenOrders vs a stale server list", () => {
  it("keeps a just-placed server order missing from a list fetched before the POST", () => {
    const state = { orders: [order("fresh", Date.now())] } as never as { orders: { id: string }[] };
    mergeServerOpenOrders(state as never, []);
    expect(state.orders.map((o) => o.id)).toEqual(["fresh"]);
  });
  it("still drops an old server order the server no longer lists (filled/cancelled elsewhere)", () => {
    const state = { orders: [order("old", Date.now() - FRESH_SERVER_ORDER_MS - 1000)] } as never as { orders: { id: string }[] };
    mergeServerOpenOrders(state as never, []);
    expect(state.orders).toEqual([]);
  });
});
