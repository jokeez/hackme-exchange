import { describe, expect, it } from "vitest";
import { nearestCandle } from "./chartCandleIndex";
import type { Candle } from "./types";

describe("chartCrosshairSync helpers", () => {
  const candles: Candle[] = [
    { time: 100, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
    { time: 200, open: 1.05, high: 1.2, low: 1, close: 1.15, volume: 12 },
    { time: 300, open: 1.15, high: 1.25, low: 1.1, close: 1.2, volume: 8 },
  ];

  it("nearestCandle picks closest bar by time", () => {
    expect(nearestCandle(candles, 205)?.time).toBe(200);
    expect(nearestCandle(candles, 290)?.time).toBe(300);
    expect(nearestCandle([], 100)).toBeNull();
  });
});

describe("chartCrosshairSync registry", () => {
  it("exports sync toggles", async () => {
    const mod = await import("./chartCrosshairSync");
    expect(typeof mod.setCrosshairSyncEnabled).toBe("function");
    expect(typeof mod.registerCrosshairPane).toBe("function");
    mod.setCrosshairSyncEnabled(false);
    mod.setCrosshairSyncEnabled(true);
  });
});
