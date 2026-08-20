import { describe, expect, it } from "vitest";
import { appendSyntheticTrade, mergeTapeRows, seedPublicTape, tradeToPrint } from "./tape";
import { sampleTicker } from "./testFixtures";
import type { Trade } from "./types";

describe("tape", () => {
  it("seeds deterministic public prints", () => {
    const tk = sampleTicker();
    const a = seedPublicTape("HMC_USDT", tk, 12, 1_700_000_000_000);
    const b = seedPublicTape("HMC_USDT", tk, 12, 1_700_000_000_000);
    expect(a).toHaveLength(12);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a[0].ts).toBeGreaterThanOrEqual(a[1].ts);
    expect(a.every((x) => x.synthetic)).toBe(true);
  });

  it("appends a synthetic print at head", () => {
    const tk = sampleTicker();
    const seeded = seedPublicTape("HMC_USDT", tk, 3, 1_700_000_000_000);
    const next = appendSyntheticTrade(seeded, tk, 1_700_000_000_500);
    expect(next[0].ts).toBe(1_700_000_000_500);
    expect(next[0].synthetic).toBe(true);
    expect(next.length).toBe(4);
  });

  it("appendSyntheticTrade is deterministic for same inputs", () => {
    const tk = sampleTicker();
    const seeded = seedPublicTape("HMC_USDT", tk, 2, 1_700_000_000_000);
    const a = appendSyntheticTrade(seeded, tk, 1_700_000_000_500);
    const b = appendSyntheticTrade(seeded, tk, 1_700_000_000_500);
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].price).toBe(b[0].price);
    expect(a[0].side).toBe(b[0].side);
  });

  it("merges user fills ahead of public by timestamp", () => {
    const tk = sampleTicker();
    const pub = seedPublicTape("HMC_USDT", tk, 5, 1_000);
    const user: Trade[] = [
      {
        id: "u1",
        pairId: "HMC_USDT",
        side: "buy",
        price: tk.mid,
        amountBase: 10,
        amountQuote: 10 * tk.mid,
        feeQuote: 0,
        feeHmc: 0,
        feeRole: "taker",
        feePaidInHmc: false,
        ts: 9_999_999,
      },
    ];
    const merged = mergeTapeRows(user, pub, "HMC_USDT", 10);
    expect(merged[0].id).toBe("u1");
    expect(merged[0].synthetic).toBe(false);
    expect(tradeToPrint(user[0]).pairId).toBe("HMC_USDT");
  });
});
