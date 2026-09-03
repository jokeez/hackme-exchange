/**
 * Lab cancel must return immediately after DELETE — never wait on full ledger sync.
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadState } from "../store";

vi.mock("./exchangeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./exchangeApi")>();
  return {
    ...actual,
    cancelExchangeOrder: vi.fn(),
    fetchExchangeBalances: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50_000));
      return { ok: false, status: 0, code: "timeout", message: "hung" };
    }),
    listExchangeOrders: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50_000));
      return { ok: false, status: 0, code: "timeout", message: "hung" };
    }),
    listExchangeFills: vi.fn(async () => ({ ok: true, fills: [] })),
    fetchExchangeBook: vi.fn(async () => ({ ok: true, bids: [], asks: [] })),
    getLabSessionMeta: vi.fn(() => ({
      hasCsrf: true,
      address: "lab1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      csrf: "test-csrf",
    })),
  };
});

vi.mock("../config/integration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/integration")>();
  return {
    ...actual,
    isLabApiEnabled: () => true,
  };
});

describe("cancelLabOrder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("resolves without awaiting hung ledger sync", async () => {
    const { cancelExchangeOrder } = await import("./exchangeApi");
    const { cancelLabOrder } = await import("./labMatching");
    vi.mocked(cancelExchangeOrder).mockResolvedValue({
      ok: true,
      order: {
        id: "lab-ord-1",
        pair: "HMC/USDT",
        side: "buy",
        type: "limit",
        price: 50000,
        qty: 100_000_000_000,
        filled_qty: 0,
        status: "cancelled",
        created_at: new Date().toISOString(),
      } as never,
    });

    const state = loadState();
    state.orders = [
      {
        id: "lab-ord-1",
        pairId: "HMC_USDT",
        side: "buy",
        kind: "limit",
        price: 0.05,
        amountBase: 1000,
        status: "open",
        createdAt: Date.now(),
        source: "lab",
      },
    ];

    const p = cancelLabOrder(state, "lab-ord-1");
    await vi.advanceTimersByTimeAsync(10);
    const res = await p;
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.syncPending).toBe(true);
    expect(state.orders.find((o) => o.id === "lab-ord-1")?.status).toBe("cancelled");
  });
});
