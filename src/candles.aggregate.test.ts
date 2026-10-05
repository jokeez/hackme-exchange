import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateCandles,
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  chartAnchorMid,
  deriveAllTimeframes,
  healFlatPaperBars,
  prependOlderCandles,
  seedAllTimeframes,
  seedCandles,
  textureLiveBar,
  upsertTick,
} from "./candles";
import { TIMEFRAMES, type Timeframe } from "./types";

describe("chartAnchorMid", () => {
  it("quantizes so tiny L2 noise does not fork history", () => {
    expect(chartAnchorMid(0.04953409)).toBe(chartAnchorMid(0.04953411));
    expect(chartAnchorMid(0.04953409)).toBeGreaterThan(0);
  });
});

describe("textureLiveBar", () => {
  it("keeps tip close at sticky Soft-MM mid but paints a visible body/wicks", () => {
    const mid = 0.0507;
    const flat = { time: 1_700_000_000, open: mid, high: mid, low: mid, close: mid, volume: 0 };
    const textured = textureLiveBar("HMC_USDT", "1m", flat, mid, 1_700_000_000_000);
    // Paper-clock tip close = Soft-MM mid (Last); body comes from walked open.
    expect(Math.abs(textured.close - mid) / mid).toBeLessThan(1e-9);
    expect(textured.high).toBeGreaterThan(textured.low);
    expect(Math.abs(textured.close - textured.open)).toBeGreaterThan(mid * 0.0002);
  });

  it("sticky Soft-MM tip does not grow paper-clock needle wicks over the minute", () => {
    const mid = 0.0507;
    const t0 = 1_700_000_000;
    const flat = { time: t0, open: mid, high: mid, low: mid, close: mid, volume: 0 };
    const a = textureLiveBar("HMC_USDT", "1m", flat, mid, t0 * 1000 + 1_000);
    const b = textureLiveBar("HMC_USDT", "1m", a, mid, t0 * 1000 + 25_000);
    expect(Math.abs(a.close - mid) / mid).toBeLessThan(1e-9);
    expect(Math.abs(b.close - mid) / mid).toBeLessThan(1e-9);
    // Open locks; sticky path must NOT expand into Soft-MM needle forests.
    expect(Math.abs(a.open - b.open)).toBeLessThan(1e-12);
    expect(Math.abs(a.high - b.high) / mid).toBeLessThan(0.0005);
    expect(Math.abs(a.low - b.low) / mid).toBeLessThan(0.0005);
    expect((b.high - b.low) / mid).toBeLessThan(0.012);
  });

  it("idle gap + sticky mid upsert stays contiguous without spike forests", () => {
    const mid = 0.053116;
    // Pin wall clock — tip open vs Soft-MM mid is deterministic per bucket.
    const fixedNow = 1_704_067_200_000; // 2023-11-26T12:00:00Z
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const t0 = Math.floor(fixedNow / 1000 / 60) * 60 - 20 * 60;
    let series = [
      {
        time: t0,
        open: mid * 0.98,
        high: mid * 1.02,
        low: mid * 0.97,
        close: mid,
        volume: 1000,
      },
    ];
    // Simulate ~15 minutes of sticky Soft-MM tip ticks after a long idle gap.
    for (let i = 0; i < 15; i++) {
      series = upsertTick(series, "1m", mid, "HMC_USDT", mid);
    }
    expect(series.length).toBeGreaterThanOrEqual(16);
    // Idle buckets are flat holds (vol=0) — no synthetic walk wick forests.
    const gapBars = series.slice(1, -1);
    expect(gapBars.every((c) => c.volume === 0 || Math.abs(c.close - c.open) / mid < 0.01)).toBe(
      true,
    );
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.time - series[i - 1]!.time).toBe(60);
    }
    const tip = series[series.length - 1]!;
    expect(Math.abs(tip.close - mid) / mid).toBeLessThan(0.002);
  });

  it("healFlatPaperBars rewrites a trailing doji ruler", () => {
    const mid = 0.053116;
    const t0 = 1_700_000_000;
    const flat = Array.from({ length: 20 }, (_, i) => ({
      time: t0 + i * 60,
      open: mid,
      high: mid,
      low: mid,
      close: mid,
      volume: 0,
    }));
    const healed = healFlatPaperBars("HMC_USDT", "1m", flat, mid, (t0 + 19 * 60) * 1000 + 30_000);
    let fatBodies = 0;
    for (const c of healed.slice(0, -1)) {
      if (Math.abs(c.close - c.open) / mid > 0.0004) fatBodies++;
    }
    expect(fatBodies).toBeGreaterThan(8);
    expect(Math.abs(healed[healed.length - 1]!.close - mid) / mid).toBeLessThan(0.002);
  });

  it("healFlatPaperBars rewrites a mid-history Soft-MM comb (wicks + flat closes)", () => {
    const mid = 0.0538;
    const t0 = 1_700_000_000;
    const series = [
      ...Array.from({ length: 5 }, (_, i) => ({
        time: t0 + i * 60,
        open: mid * (1 - 0.01 + i * 0.002),
        high: mid * 1.02,
        low: mid * 0.97,
        close: mid * (1 - 0.008 + i * 0.002),
        volume: 100,
      })),
      // Comb: doji bodies, upper wicks only, stuck close — classic Soft-MM ruler.
      ...Array.from({ length: 40 }, (_, i) => ({
        time: t0 + (5 + i) * 60,
        open: mid,
        high: mid * 1.0015,
        low: mid,
        close: mid,
        volume: 50,
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        time: t0 + (45 + i) * 60,
        open: mid * (1 - i * 0.001),
        high: mid * (1 - i * 0.001 + 0.002),
        low: mid * (1 - i * 0.001 - 0.002),
        close: mid * (1 - (i + 1) * 0.001),
        volume: 80,
      })),
    ];
    const healed = healFlatPaperBars(
      "HMC_USDT",
      "1m",
      series,
      series[series.length - 1]!.close,
      Date.now(),
      { scope: "all" },
    );
    const comb = healed.slice(5, 45);
    let fatBodies = 0;
    const closes = new Set(comb.map((c) => c.close.toFixed(8)));
    for (const c of comb) {
      if (Math.abs(c.close - c.open) / mid > 0.00015) fatBodies++;
    }
    expect(fatBodies).toBeGreaterThan(20);
    // Closed bars must not all share one Soft-MM close (шильдики).
    expect(closes.size).toBeGreaterThan(8);
  });

  it("sticky Soft-MM tip rollover finalizes distinct closed closes", () => {
    const mid = 0.05279729;
    const t0 = 1_800_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(t0 * 1000);
    let series = [
      {
        time: t0,
        open: mid * 0.99,
        high: mid * 1.01,
        low: mid * 0.98,
        close: mid,
        volume: 100,
      },
    ];
    for (let i = 1; i <= 20; i++) {
      vi.setSystemTime((t0 + i * 60) * 1000 + 15_000);
      series = upsertTick(series, "1m", mid, "HMC_USDT", mid);
    }
    vi.useRealTimers();
    const closed = series.slice(0, -1);
    expect(closed.length).toBeGreaterThan(10);
    const uniqueCloses = new Set(closed.map((c) => c.close.toFixed(8)));
    expect(uniqueCloses.size).toBeGreaterThan(5);
    // Tip may equal Soft-MM Last; closed bars must not all equal tip mid.
    const glued = closed.filter((c) => Math.abs(c.close - mid) / mid < 0.00005).length;
    expect(glued).toBeLessThan(closed.length * 0.35);
    const tip = series[series.length - 1]!;
    expect(Math.abs(tip.close - mid) / mid).toBeLessThan(0.002);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("nudgeCloseTowardFill", () => {
  it("nudges tip close toward fill within bps cap", async () => {
    const { nudgeCloseTowardFill, clampFillWickPx } = await import("./candles");
    const mid = 0.05;
    const fill = 0.0508; // +160 bps
    const nudged = nudgeCloseTowardFill(mid, fill, 12);
    expect(nudged).toBeGreaterThan(mid);
    expect(nudged).toBeLessThanOrEqual(mid * 1.0012 + 1e-12);
    const wick = clampFillWickPx(mid, fill, 45);
    expect(wick).toBeGreaterThan(nudged);
  });
});

describe("multi-TF aggregation (one market)", () => {
  it("seedAllTimeframes: every TF tip close ≈ mid", () => {
    const mid = 0.00063371;
    const all = seedAllTimeframes("HMC_USDT", mid);
    for (const tf of TIMEFRAMES) {
      const series = all[tf]!;
      expect(series.length).toBeGreaterThan(0);
      expect(series[series.length - 1]!.close).toBeCloseTo(mid, 8);
    }
  });

  it("5m OHLC matches 1m range for the same bucket (exchange aggregation)", () => {
    const mid = 0.00055;
    const base = seedCandles("HMC_USDT", "1m", mid, 120);
    const m5 = aggregateCandles(base, "1m", "5m");
    expect(m5.length).toBeGreaterThan(5);
    for (const bar of m5.slice(0, -1)) {
      const children = base.filter((c) => c.time >= bar.time && c.time < bar.time + 300);
      expect(children.length).toBeGreaterThan(0);
      expect(bar.open).toBeCloseTo(children[0]!.open, 12);
      expect(bar.close).toBeCloseTo(children[children.length - 1]!.close, 12);
      // High/low = extremes of child prints (CEX rule) — may soft-clip pathological only.
      const childHigh = Math.max(...children.map((c) => c.high));
      const childLow = Math.min(...children.map((c) => c.low));
      expect(bar.high).toBeLessThanOrEqual(childHigh + 1e-15);
      expect(bar.low).toBeGreaterThanOrEqual(childLow - 1e-15);
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close) - 1e-15);
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close) + 1e-15);
    }
  });

  it("1D tip tracks 1m tip after live mid walks", () => {
    let all = seedAllTimeframes("HMC_USDT", 0.0007);
    let prev = 0.0007;
    for (const target of [0.00068, 0.00066, 0.00065, 0.00064, 0.00063371]) {
      all = applyMidToPairCandles(all, "HMC_USDT", target, prev);
      prev = target;
    }
    const tip1m = all["1m"]![all["1m"]!.length - 1]!;
    const tip5m = all["5m"]![all["5m"]!.length - 1]!;
    const tip1d = all["1D"]![all["1D"]!.length - 1]!;
    expect(tip5m.close).toBeCloseTo(tip1m.close, 10);
    expect(tip1d.close).toBeCloseTo(tip1m.close, 10);
    // Body tracks the ~9.5% mid walk (0.0007 → 0.00063371); allow day-tip range.
    expect(Math.abs(tip1d.close - tip1d.open) / tip1d.open).toBeLessThan(0.12);
  });

  it("deriveAllTimeframes pads 1D to a CEX-like history length", () => {
    const base = seedCandles("HMC_USDT", CANDLE_BASE_TF, 0.0005, 60);
    const all = deriveAllTimeframes(base, "HMC_USDT");
    expect(all["1D"]!.length).toBeGreaterThan(30);
    expect(all["1D"]![all["1D"]!.length - 1]!.close).toBeCloseTo(all["1m"]![all["1m"]!.length - 1]!.close, 10);
  });

  it("deriveAllTimeframes covers every TIMEFRAMES key", () => {
    const base = seedCandles("HMC_USDT", CANDLE_BASE_TF, 0.0005, 60);
    const all = deriveAllTimeframes(base, "HMC_USDT");
    for (const tf of TIMEFRAMES) {
      expect(all[tf]?.length).toBeGreaterThan(0);
    }
  });

  it("switching TF does not invent a different last price", () => {
    const all = seedAllTimeframes("SUP_USDT", 0.000051);
    const closes = TIMEFRAMES.map((tf) => all[tf]![all[tf]!.length - 1]!.close);
    const max = Math.max(...closes);
    const min = Math.min(...closes);
    expect((max - min) / min).toBeLessThan(1e-9);
  });

  it("intraday wicks stay CEX-proportioned (exist, but do not dwarf bodies)", () => {
    const mid = 0.050063;
    const all = seedAllTimeframes("HMC_USDT", mid);
    for (const tf of ["30s", "5m", "15m", "1H", "1D"] as const) {
      const candles = all[tf]!;
      expect(candles.length).toBeGreaterThan(10);
      let maxBeyondFrac = 0;
      let withWick = 0;
      for (const c of candles.slice(-80)) {
        const bodyMid = (c.open + c.close) / 2;
        if (!(bodyMid > 0)) continue;
        const up = (c.high - Math.max(c.open, c.close)) / bodyMid;
        const dn = (Math.min(c.open, c.close) - c.low) / bodyMid;
        maxBeyondFrac = Math.max(maxBeyondFrac, up, dn);
        if (up > 1e-9 || dn > 1e-9) withWick += 1;
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close) - 1e-15);
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close) + 1e-15);
      }
      // Real exchanges have wicks; paper desk must too (not body-only).
      expect(withWick).toBeGreaterThan(5);
      // Intraday soft visual budget; higher TFs may stack child extremes (CEX-correct).
      const softCap = tf === "1D" || tf === "1H" ? 0.12 : 0.035;
      expect(maxBeyondFrac).toBeLessThanOrEqual(softCap);
    }
  });

  it("prepend on 1m then derive keeps higher-TF history + tip", () => {
    const mid = 0.0005;
    let all = seedAllTimeframes("HMC_USDT", mid);
    const before5 = all["5m"]!.length;
    const tipBefore = all["5m"]![all["5m"]!.length - 1]!.close;
    const first5Before = all["5m"]![0]!.time;
    const nextBase = prependOlderCandles(all[CANDLE_BASE_TF]!, "HMC_USDT", CANDLE_BASE_TF, 120);
    expect(nextBase.length).toBeGreaterThan(all[CANDLE_BASE_TF]!.length);
    all = deriveAllTimeframes(nextBase, "HMC_USDT", all);
    // Already padded to barCountForTf — length stays capped, tip must not jump.
    expect(all["5m"]!.length).toBeGreaterThanOrEqual(before5);
    expect(all["5m"]![all["5m"]!.length - 1]!.close).toBeCloseTo(tipBefore, 8);
    expect(all["5m"]![0]!.time).toBeLessThanOrEqual(first5Before);
  });
});
