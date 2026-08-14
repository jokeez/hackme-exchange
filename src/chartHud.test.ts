import { describe, expect, it } from "vitest";
import { candleCountdown, playAlertBeep, yesterdayClose } from "./chartHud";
import type { Candle } from "./types";

describe("candleCountdown", () => {
  it("formats mm:ss for short timeframes", () => {
    // 15m = 900s; pick nowSec divisible → left = 900
    const now = 900_000 * 1000; // exactly on bucket → leftover 900s = 15:00
    const s = candleCountdown("15m", now);
    expect(s).toMatch(/^\d{2}:\d{2}$/);
    expect(s).toBe("15:00");
  });

  it("formats hh:mm:ss when left >= 60 minutes", () => {
    // 4H = 14400s; leftover near full period
    const sec = 14_400;
    const nowSec = sec * 10; // remainder 0 → left = 14400 = 4h
    const s = candleCountdown("4H", nowSec * 1000);
    expect(s).toBe("04:00:00");
  });

  it("counts down within bucket", () => {
    const now = (900 + 30) * 1000; // 15m bucket, 30s into → 870 left = 14:30
    expect(candleCountdown("15m", now)).toBe("14:30");
  });
});

describe("yesterdayClose", () => {
  it("undefined when fewer than 2 candles", () => {
    expect(yesterdayClose([])).toBeUndefined();
    expect(yesterdayClose([{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }])).toBeUndefined();
  });

  it("picks last candle at or before 24h cutoff", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const candles: Candle[] = [
      { time: nowSec - 200_000, open: 1, high: 1, low: 1, close: 10, volume: 1 },
      { time: nowSec - 90_000, open: 1, high: 1, low: 1, close: 20, volume: 1 },
      { time: nowSec - 10_000, open: 1, high: 1, low: 1, close: 30, volume: 1 },
      { time: nowSec - 100, open: 1, high: 1, low: 1, close: 40, volume: 1 },
    ];
    expect(yesterdayClose(candles)).toBe(20);
  });

  it("falls back to second-to-last close if none older than 24h", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const candles: Candle[] = [
      { time: nowSec - 1000, open: 1, high: 1, low: 1, close: 11, volume: 1 },
      { time: nowSec - 500, open: 1, high: 1, low: 1, close: 22, volume: 1 },
      { time: nowSec - 100, open: 1, high: 1, low: 1, close: 33, volume: 1 },
    ];
    expect(yesterdayClose(candles)).toBe(22);
  });
});

describe("playAlertBeep", () => {
  it("does not throw when AudioContext is unavailable", () => {
    expect(() => playAlertBeep()).not.toThrow();
  });
});
