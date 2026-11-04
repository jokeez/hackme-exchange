import { describe, expect, it } from "vitest";
import { LIVE_TF_INTERVAL, liveTf, mergeServerBars } from "./liveServerCandles";
import { TIMEFRAMES, type Candle } from "./types";

const bar = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 0 });

describe("live server candles", () => {
  it("maps every desk TF except 30s to an exact server interval", () => {
    for (const tf of TIMEFRAMES) {
      if (tf === "30s") expect(LIVE_TF_INTERVAL[tf]).toBeUndefined();
      else expect(LIVE_TF_INTERVAL[tf]).toBeTruthy();
    }
    expect(liveTf("30s")).toBe("1m");
    expect(liveTf("2H")).toBe("2H");
  });

  it("tip poll replaces overlapping bars with server values and appends new ones", () => {
    const prev = [bar(60, 1), bar(120, 2), bar(180, 3)];
    const next = [bar(120, 2.5), bar(180, 3.5), bar(240, 4)];
    expect(mergeServerBars(prev, next).map((c) => [c.time, c.close])).toEqual([
      [60, 1],
      [120, 2.5],
      [180, 3.5],
      [240, 4],
    ]);
  });

  it("never keeps a local bar inside the server window (no forked tip)", () => {
    const prev = [bar(60, 1), bar(120, 9)];
    const merged = mergeServerBars(prev, [bar(60, 1), bar(120, 2)]);
    expect(merged.at(-1)!.close).toBe(2);
  });

  it("keeps paged-in older history and caps length", () => {
    const prev = [bar(0, 0.5), bar(60, 1)];
    expect(mergeServerBars(prev, [bar(60, 1.1)]).length).toBe(2);
    const big = Array.from({ length: 10 }, (_, i) => bar(i * 60, i));
    expect(mergeServerBars([], big, 4).map((c) => c.time)).toEqual([360, 420, 480, 540]);
  });
});
