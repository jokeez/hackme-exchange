/**
 * CRITICAL: tip / mid pumps must NEVER remap closed candle OHLC.
 * Soak: seed ~0.05–0.07 history, jump tip to 0.08, assert older bars frozen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  constrainLiveHistoryToTape,
  hydrateLiveCandlesFromPrints,
  LIVE_HISTORY_TIP_BAND_SEC,
  loadLiveCandleCache,
  mergeDurableApiCandlesIntoBase,
  saveLiveCandleCache,
  clearLiveCandleCache,
} from "./candles";
import type { Candle } from "./types";

function stubSessionStorage() {
  const mem = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  return mem;
}

function seedPath(opts: {
  nowMs: number;
  hours: number;
  px0: number;
  px1: number;
  volEvery?: number;
}): Candle[] {
  const sec = 60;
  const tNow = Math.floor(opts.nowMs / 1000 / sec) * sec;
  const n = opts.hours * 60;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const t = tNow - (n - i) * sec;
    const frac = i / Math.max(1, n - 1);
    const px = opts.px0 + (opts.px1 - opts.px0) * frac;
    const vol = opts.volEvery && i % opts.volEvery === 0 ? 2 : 0;
    out.push({
      time: t,
      open: px,
      high: px * 1.002,
      low: px * 0.998,
      close: px,
      volume: vol,
    });
  }
  return out;
}

function snapshotClosed(base: Candle[], tipBucket: number): Map<number, Candle> {
  const m = new Map<number, Candle>();
  for (const c of base) {
    if (c.time < tipBucket) m.set(c.time, { ...c });
  }
  return m;
}

function assertClosedFrozen(before: Map<number, Candle>, after: Candle[], tipBucket: number, label: string) {
  for (const c of after) {
    if (c.time >= tipBucket) continue;
    const prev = before.get(c.time);
    if (!prev) continue;
    expect(c.open, `${label} t=${c.time} open`).toBeCloseTo(prev.open, 10);
    expect(c.high, `${label} t=${c.time} high`).toBeCloseTo(prev.high, 10);
    expect(c.low, `${label} t=${c.time} low`).toBeCloseTo(prev.low, 10);
    expect(c.close, `${label} t=${c.time} close`).toBeCloseTo(prev.close, 10);
  }
}

describe("closed candle immutability under tip pump", () => {
  const nowMs = Date.UTC(2026, 9, 24, 12, 0, 0);

  beforeEach(() => {
    stubSessionStorage();
    // applyMid/ensureContiguous fillToNow use Date.now() — pin wall clock to fixture.
    vi.useFakeTimers({ now: nowMs });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("constrainLiveHistoryToTape never remaps closed bars when tip jumps 0.06→0.08", () => {
    const path = seedPath({ nowMs, hours: 36, px0: 0.05, px1: 0.07, volEvery: 7 });
    const tipBucket = path[path.length - 1]!.time;
    const closed = snapshotClosed(path, tipBucket);
    const tips = [0.055, 0.06, 0.065, 0.07, 0.075, 0.08, 0.072, 0.08];
    let cur = path;
    for (const tip of tips) {
      cur = constrainLiveHistoryToTape(
        cur,
        [
          { ts: tipBucket * 1000, price: tip, amountBase: 1 },
          { ts: tipBucket * 1000 + 400, price: tip * 0.999, amountBase: 1 },
        ],
        tip,
        0.22,
        { high: 0.083, low: 0.05 },
        { nowMs },
      );
      assertClosedFrozen(closed, cur, tipBucket, `constrain tip=${tip}`);
    }
  });

  it(
    "hydrate + applyMid soak: 50 tip jumps leave yesterday/month OHLC unchanged",
    { timeout: 60_000 },
    () => {
    expect(LIVE_HISTORY_TIP_BAND_SEC).toBe(18 * 3600);
    const path = seedPath({ nowMs, hours: 48, px0: 0.05, px1: 0.072, volEvery: 5 });
    const tip0 = 0.072;
    const prints0 = [
      { ts: (path[path.length - 3]!.time) * 1000, price: 0.071, amountBase: 2 },
      { ts: (path[path.length - 2]!.time) * 1000, price: 0.0715, amountBase: 1 },
      { ts: (path[path.length - 1]!.time) * 1000, price: tip0, amountBase: 3 },
    ];
    let all = hydrateLiveCandlesFromPrints("HMC_USDT", prints0, tip0, nowMs, path, {
      high: 0.083,
      low: 0.05,
      open: 0.07,
    });
    let base = all[CANDLE_BASE_TF]!;
    const tipBucket = base[base.length - 1]!.time;
    const yday = tipBucket - 24 * 3600;
    const monthish = tipBucket - 40 * 3600; // within 48h seed
    const y0 = base.find((c) => c.time === yday);
    const m0 = base.find((c) => c.time === monthish);
    expect(y0).toBeTruthy();
    expect(m0).toBeTruthy();
    expect(y0!.close).toBeLessThan(0.065);
    const closedSnap = snapshotClosed(base, tipBucket);

    const tips: number[] = [];
    for (let i = 0; i < 50; i++) {
      // Pump / dump / re-pump around 0.08
      tips.push(0.06 + ((i % 17) / 16) * 0.022); // 0.06 → 0.082
    }
    tips.push(0.08);

    let prevTip = tip0;
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i]!;
      const prints = [
        ...prints0,
        { ts: tipBucket * 1000 + i * 10, price: tip, amountBase: 1 },
      ];
      all = hydrateLiveCandlesFromPrints(
        "HMC_USDT",
        prints,
        tip,
        nowMs,
        all[CANDLE_BASE_TF],
        { high: Math.max(0.083, tip), low: 0.05, open: 0.07 },
      );
      all = applyMidToPairCandles(all, "HMC_USDT", tip, prevTip, {
        syntheticVolume: false,
        dayRange: { high: Math.max(0.083, tip), low: 0.05, open: 0.07 },
      });
      prevTip = tip;
      base = all[CANDLE_BASE_TF]!;
      assertClosedFrozen(closedSnap, base, tipBucket, `soak#${i} tip=${tip}`);
      const y = base.find((c) => c.time === yday);
      const m = base.find((c) => c.time === monthish);
      expect(y, `yesterday missing @${i}`).toBeTruthy();
      expect(m, `monthish missing @${i}`).toBeTruthy();
      expect(y!.open).toBeCloseTo(y0!.open, 10);
      expect(y!.high).toBeCloseTo(y0!.high, 10);
      expect(y!.low).toBeCloseTo(y0!.low, 10);
      expect(y!.close).toBeCloseTo(y0!.close, 10);
      expect(m!.close).toBeCloseTo(m0!.close, 10);
      // Must not have been dragged into the 0.08 tip envelope
      expect(y!.close).toBeLessThan(0.065);
    }
    expect(base[base.length - 1]!.close).toBeCloseTo(0.08, 5);
  },
  );

  it("session cache tip desync must not wipe closed history when re-hydrating at 0.08", () => {
    // ≤1500 bars so saveLiveCandleCache keeps the full path (incl. early 0.05x).
    const path = seedPath({ nowMs, hours: 20, px0: 0.051, px1: 0.068, volEvery: 4 });
    clearLiveCandleCache("HMC_USDT");
    saveLiveCandleCache("HMC_USDT", path);
    // Tip pumped hard — old loadLiveCandleCache cleared whole series (28% desync).
    const tip = 0.08;
    const cached = loadLiveCandleCache("HMC_USDT", undefined, tip);
    expect(cached).toBeTruthy();
    expect(cached!.length).toBeGreaterThan(100);
    // Tip bar dropped on desync; closed path from ~0.051 must remain.
    expect(cached![0]!.close).toBeLessThan(0.053);
    const sampleT = path[Math.floor(path.length * 0.2)]!.time;
    const sample = path.find((c) => c.time === sampleT)!;
    expect(cached!.some((c) => c.time === sampleT && Math.abs(c.close - sample.close) < 1e-9)).toBe(
      true,
    );

    const tipBucket = Math.floor(nowMs / 1000 / 60) * 60;
    const prints = [
      { ts: (tipBucket - 120) * 1000, price: 0.079, amountBase: 2 },
      { ts: (tipBucket - 60) * 1000, price: 0.0795, amountBase: 1 },
      { ts: tipBucket * 1000, price: tip, amountBase: 4 },
    ];
    const all = hydrateLiveCandlesFromPrints("HMC_USDT", prints, tip, nowMs, cached, {
      high: 0.083,
      low: 0.05,
    });
    const base = all[CANDLE_BASE_TF]!;
    const kept = base.find((c) => c.time === sampleT);
    expect(kept).toBeTruthy();
    expect(kept!.close).toBeCloseTo(sample.close, 8);
    expect(kept!.close).toBeLessThan(0.058);
  });

  it("mergeDurableApiCandlesIntoBase appends by time and never remaps older server OHLC", () => {
    const tipBucket = Math.floor(nowMs / 1000 / 60) * 60;
    const server: Candle[] = [];
    for (let i = 0; i < 120; i++) {
      const t = tipBucket - (120 - i) * 60;
      const px = 0.055 + (i / 119) * 0.015;
      server.push({
        time: t,
        open: px,
        high: px * 1.001,
        low: px * 0.999,
        close: px,
        volume: 10,
      });
    }
    const localTip: Candle[] = [
      {
        time: tipBucket,
        open: 0.07,
        high: 0.081,
        low: 0.07,
        close: 0.08,
        volume: 1,
      },
    ];
    const merged = mergeDurableApiCandlesIntoBase(localTip, server, tipBucket);
    const early = merged.find((c) => c.time === server[5]!.time)!;
    expect(early.open).toBeCloseTo(server[5]!.open, 12);
    expect(early.high).toBeCloseTo(server[5]!.high, 12);
    expect(early.low).toBeCloseTo(server[5]!.low, 12);
    expect(early.close).toBeCloseTo(server[5]!.close, 12);
    const tip = merged[merged.length - 1]!;
    expect(tip.time).toBe(tipBucket);
    expect(tip.close).toBeCloseTo(0.08, 10);

    // Tip jump remake must still keep server closed bars
    const again = mergeDurableApiCandlesIntoBase(
      [{ time: tipBucket, open: 0.08, high: 0.082, low: 0.079, close: 0.081, volume: 2 }],
      server,
      tipBucket,
    );
    const early2 = again.find((c) => c.time === server[5]!.time)!;
    expect(early2).toEqual(early);
  });
});
