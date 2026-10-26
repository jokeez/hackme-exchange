/**
 * Flying candles regression: sparse durable /candles islands must become
 * time-contiguous with painted flat bridges (no diagonal ramp, no LWC voids),
 * tip at wall-clock now. Closed print OHLC stay immutable; displayCap may
 * soft-bridge opens for paint. Bridges stay O=H=L=C vol=0 with zero wick.
 */
import { describe, expect, it } from "vitest";
import {
  CANDLE_BASE_TF,
  candlesAreContiguous,
  ensureContiguousCandles,
  hydrateLiveCandlesFromPrints,
  isFlatGapBridge,
  toLwcOhlcPoints,
} from "./candles";
import { displayCapCandles, paintedCandleHealth } from "./chartScale";
import type { Candle } from "./types";

const nowMs = Date.UTC(2026, 9, 26, 15, 0, 0); // Oct 26 — matches screenshot tip day
const sec1m = 60;
const sec15m = 900;
const tipBucket1m = Math.floor(nowMs / 1000 / sec1m) * sec1m;
const tipBucket15m = Math.floor(nowMs / 1000 / sec15m) * sec15m;

function islandCluster(start: number, n: number, px: number, step = sec1m): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      time: start + i * step,
      open: px,
      high: px * 1.01,
      low: px * 0.99,
      close: px,
      volume: 2,
    });
  }
  return out;
}

/** Screenshot-class sparse durable: detached clusters + last ends before now. */
function sparseFlyingDurable(): Candle[] {
  return [
    ...islandCluster(tipBucket1m - 200 * sec1m, 8, 0.072),
    ...islandCluster(tipBucket1m - 140 * sec1m, 2, 0.078), // floating island
    ...islandCluster(tipBucket1m - 90 * sec1m, 15, 0.065),
    ...islandCluster(tipBucket1m - 40 * sec1m, 4, 0.068),
  ];
}

/**
 * Screenshot 15m HMC/USDT: cluster ~Oct 23, multi-day void, single orphan mid-void,
 * resume ~Oct 25 with jitter — then tip Oct 26.
 */
function sparseFlying15mScreenshot(): Candle[] {
  const oct23 = Math.floor(Date.UTC(2026, 9, 23, 18, 0, 0) / 1000 / sec15m) * sec15m;
  const orphan = Math.floor(Date.UTC(2026, 9, 24, 12, 0, 0) / 1000 / sec15m) * sec15m;
  const resume = Math.floor(Date.UTC(2026, 9, 25, 16, 0, 0) / 1000 / sec15m) * sec15m;
  return [
    ...islandCluster(oct23 - 8 * sec15m, 10, 0.072, sec15m),
    // Single floating orphan wick in the multi-day void
    {
      time: orphan,
      open: 0.074,
      high: 0.0745,
      low: 0.0705,
      close: 0.071,
      volume: 0.5,
    },
    ...islandCluster(resume, 6, 0.068, sec15m),
    // Recent jitter comb (long downward wicks)
    ...Array.from({ length: 8 }, (_, i) => {
      const px = 0.075 + i * 0.0004;
      return {
        time: tipBucket15m - (8 - i) * sec15m,
        open: px,
        high: px * 1.002,
        low: px * 0.92, // outlier lower wick — displayCap must clamp
        close: px,
        volume: 3,
      };
    }),
  ];
}

function countOpenJumps(series: Candle[], thresh = 0.002): number {
  let n = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.close;
    const open = series[i]!.open;
    if (prev > 0 && Math.abs(open - prev) / prev > thresh) n++;
  }
  return n;
}

function gapFillBars(series: Candle[], durableTimes: Set<number>): Candle[] {
  return series.filter((c) => !durableTimes.has(c.time));
}

/** Max time hole (in TF steps) between consecutive *painted* LWC OHLC points. */
function maxPaintedStepHole(
  pts: Array<{ time: number; open?: number }>,
  stepSec: number,
): number {
  let maxHole = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (!("open" in a) || !("open" in b)) {
      // Whitespace point — treat as infinite hole for this check.
      maxHole = Math.max(maxHole, Number.POSITIVE_INFINITY);
      continue;
    }
    const hole = Math.round((b.time - a.time) / stepSec);
    maxHole = Math.max(maxHole, hole);
  }
  return maxHole;
}

describe("flying candle islands (sparse durable + tip void)", () => {
  it("ensureContiguousCandles fills time gaps with flat bridges (no ramp into next print)", () => {
    const sparse = sparseFlyingDurable();
    const durableT = new Set(sparse.map((c) => c.time));
    const healed = ensureContiguousCandles(sparse, "1m", {
      pairId: "HMC_USDT",
      fillToNow: true,
      nowMs,
    });

    expect(candlesAreContiguous(healed, "1m")).toBe(true);
    expect(healed[healed.length - 1]!.time).toBe(tipBucket1m);

    const fills = gapFillBars(healed, durableT);
    expect(fills.length).toBeGreaterThan(10);
    for (const f of fills) {
      // Flat bridge: O=H=L=C (empty bucket — not tip-band remap of print OHLC).
      expect(f.open).toBeCloseTo(f.close, 12);
      expect(f.high).toBeCloseTo(f.close, 12);
      expect(f.low).toBeCloseTo(f.close, 12);
      expect(f.volume).toBe(0);
    }

    // Synthetic stretch: zero close-to-close delta (no diagonal ramp toward next print).
    for (let i = 1; i < healed.length; i++) {
      const prev = healed[i - 1]!;
      const cur = healed[i]!;
      if (cur.volume !== 0) continue;
      expect(cur.close).toBeCloseTo(prev.close, 12);
      expect(cur.open).toBeCloseTo(prev.close, 12);
    }

    // Durable/print OHLC fully immutable (opens included — cross-device SoT).
    for (const raw of sparse) {
      const hit = healed.find((c) => c.time === raw.time)!;
      expect(hit.open).toBeCloseTo(raw.open, 12);
      expect(hit.close).toBeCloseTo(raw.close, 12);
      expect(hit.high).toBeCloseTo(raw.high, 12);
      expect(hit.low).toBeCloseTo(raw.low, 12);
    }
    // Auction open jumps at durable edges are honest — never interpolated away.
    expect(countOpenJumps(healed, 0.05)).toBeGreaterThan(0);
  });

  it("hydrateLiveCandlesFromPrints densifies flying islands and tips at now", () => {
    const durable = sparseFlyingDurable();
    const tip = 0.069;
    const prints = [
      { ts: (tipBucket1m - 5) * 1000, price: tip, amountBase: 1 },
      { ts: tipBucket1m * 1000 + 200, price: tip, amountBase: 1 },
    ];
    const all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      prints,
      tip,
      nowMs,
      null,
      undefined,
      durable,
    );
    const base = all[CANDLE_BASE_TF]!;
    expect(candlesAreContiguous(base, "1m")).toBe(true);
    expect(base[base.length - 1]!.time).toBe(tipBucket1m);
    expect(base[base.length - 1]!.close).toBeCloseTo(tip, 8);
    // Time-contiguous; auction open jumps at print edges may remain but not island-class.
    expect(countOpenJumps(base, 0.05)).toBeLessThanOrEqual(2);

    const painted = displayCapCandles(base, "1m");
    const health = paintedCandleHealth(painted, tip, "1m");
    expect(health.tipDrift).toBeLessThan(0.008);
    // No blank tip — last painted bar is wall-clock tip bucket.
    expect(painted[painted.length - 1]!.time).toBe(tipBucket1m);
    // Display soft-bridges opens — no island-class open≠prev.close after paint.
    expect(countOpenJumps(painted, 0.05)).toBe(0);
  });

  it("toLwcOhlcPoints paints flat bridges (no whitespace voids / flying orphans)", () => {
    const sparse = sparseFlyingDurable();
    const healed = ensureContiguousCandles(sparse, "1m", {
      pairId: "HMC_USDT",
      fillToNow: true,
      nowMs,
    });
    const painted = displayCapCandles(healed, "1m");
    const pts = toLwcOhlcPoints(painted);
    expect(pts).toHaveLength(painted.length);
    expect(pts.every((p) => "open" in p)).toBe(true);
    expect(maxPaintedStepHole(pts, sec1m)).toBe(1);

    let bridges = 0;
    for (let i = 0; i < painted.length - 1; i++) {
      if (!isFlatGapBridge(painted[i]!)) continue;
      bridges++;
      const p = pts[i]!;
      expect(p.open).toBe(p.close);
      expect(p.high).toBe(p.close);
      expect(p.low).toBe(p.close);
    }
    expect(bridges).toBeGreaterThan(10);
  });

  it("15m screenshot void: no multi-day hole, orphan bridged, bridges wickless", () => {
    const sparse = sparseFlying15mScreenshot();
    const durableT = new Set(sparse.map((c) => c.time));
    const healed = ensureContiguousCandles(sparse, "15m", {
      pairId: "HMC_USDT",
      fillToNow: true,
      nowMs,
    });
    expect(candlesAreContiguous(healed, "15m")).toBe(true);
    expect(healed[healed.length - 1]!.time).toBe(tipBucket15m);

    // Multi-day Soft-MM quiet → hundreds of flat bridges, not a 2-day LWC void.
    const fills = gapFillBars(healed, durableT);
    expect(fills.length).toBeGreaterThan(100); // ~2 days / 15m ≈ 192
    for (const f of fills) {
      expect(isFlatGapBridge(f)).toBe(true);
    }

    // Durable OHLC immutable (including the mid-void orphan).
    for (const raw of sparse) {
      const hit = healed.find((c) => c.time === raw.time)!;
      expect(hit.open).toBeCloseTo(raw.open, 12);
      expect(hit.close).toBeCloseTo(raw.close, 12);
      expect(hit.high).toBeCloseTo(raw.high, 12);
      expect(hit.low).toBeCloseTo(raw.low, 12);
    }

    const painted = displayCapCandles(healed, "15m");
    const pts = toLwcOhlcPoints(painted);
    expect(pts.every((p) => "open" in p)).toBe(true);
    expect(maxPaintedStepHole(pts, sec15m)).toBe(1);

    // Bridges stay zero-wick after displayCap (no healFlat / wick pad).
    for (let i = 0; i < painted.length - 1; i++) {
      if (!isFlatGapBridge(healed[i]!)) continue;
      const p = painted[i]!;
      expect(p.open).toBe(p.close);
      expect(p.high).toBe(p.close);
      expect(p.low).toBe(p.close);
      expect(p.volume).toBe(0);
    }

    // Recent outlier lower wicks clamped (jitter comb).
    const tipClose = painted[painted.length - 1]!.close;
    for (const c of painted.slice(-10, -1)) {
      if (isFlatGapBridge(c)) continue;
      expect(c.low).toBeGreaterThan(tipClose * 0.5);
      expect((Math.min(c.open, c.close) - c.low) / Math.min(c.open, c.close)).toBeLessThan(0.08);
    }

    // No diagonal ramp on synthetic fills.
    for (let i = 1; i < healed.length; i++) {
      const cur = healed[i]!;
      if (cur.volume !== 0) continue;
      expect(cur.close).toBeCloseTo(healed[i - 1]!.close, 12);
    }
  });

  it("sparse Soft-MM paints flat bridges without inventing wick comb", () => {
    const tip = 0.079;
    const prints = [];
    for (let i = 90; i >= 0; i -= 3) {
      const px = tip * (1 + Math.sin(i) * 0.0003);
      prints.push({ ts: (tipBucket1m - i * sec1m) * 1000 + 500, price: px, amountBase: 1 });
    }
    prints.push({ ts: tipBucket1m * 1000 + 200, price: tip, amountBase: 2 });
    const all = hydrateLiveCandlesFromPrints("HMC_USDT", prints, tip, nowMs, null);
    const base = all[CANDLE_BASE_TF]!;
    expect(base[base.length - 1]!.time).toBe(tipBucket1m);
    // Flat bridges must remain vol=0 holds (heal must not rewrite them into paper comb).
    const bridges = base.filter(isFlatGapBridge);
    expect(bridges.length).toBeGreaterThan(10);
    for (const b of bridges) {
      expect(b.volume).toBe(0);
      expect(b.open).toBe(b.close);
      expect(b.high).toBe(b.close);
      expect(b.low).toBe(b.close);
    }
    const painted = displayCapCandles(base, "1m");
    const pts = toLwcOhlcPoints(painted);
    expect(pts.every((p) => "open" in p)).toBe(true);
    expect(painted[painted.length - 1]!.close).toBeCloseTo(tip, 8);
    const tipBody =
      Math.abs(painted[painted.length - 1]!.close - painted[painted.length - 1]!.open) / tip;
    expect(tipBody).toBeGreaterThan(0.0004);
    // No long synthetic Soft-MM wick comb (tiny body + invented mid-span wick).
    let comb = 0;
    let maxComb = 0;
    let paintedBridges = 0;
    for (let i = 0; i < painted.length - 1; i++) {
      const c = painted[i]!;
      const body = Math.abs(c.close - c.open) / Math.max(c.close, 1e-12);
      const span = (c.high - c.low) / Math.max(c.close, 1e-12);
      if (body < 0.0015 && span > 0.0012 && span < 0.009) {
        comb++;
        maxComb = Math.max(maxComb, comb);
      } else comb = 0;
      if (isFlatGapBridge(c)) {
        paintedBridges++;
        expect(span).toBe(0);
      }
    }
    expect(maxComb).toBeLessThan(6);
    expect(paintedBridges).toBeGreaterThan(10);
  });

  it("tip pump does not remap closed durable print closes after contiguous heal", () => {
    const durable = sparseFlyingDurable();
    const durableT = new Set(durable.map((c) => c.time));
    const tip0 = 0.069;
    let all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tipBucket1m * 1000, price: tip0, amountBase: 1 }],
      tip0,
      nowMs,
      null,
      undefined,
      durable,
    );
    const before = new Map(
      all[CANDLE_BASE_TF]!.filter((c) => durableT.has(c.time) && c.time < tipBucket1m).map((c) => [
        c.time,
        { ...c },
      ]),
    );
    const tip1 = 0.082;
    all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [
        // Print in a former gap bucket — must not rewrite older durable clusters.
        { ts: (tipBucket1m - 60) * 1000, price: 0.08, amountBase: 1 },
        { ts: tipBucket1m * 1000, price: tip1, amountBase: 2 },
      ],
      tip1,
      nowMs,
      all[CANDLE_BASE_TF],
      undefined,
      durable,
    );
    for (const c of all[CANDLE_BASE_TF]!) {
      if (!durableT.has(c.time) || c.time >= tipBucket1m) continue;
      const prev = before.get(c.time)!;
      expect(c.close, `close t=${c.time}`).toBeCloseTo(prev.close, 10);
      expect(c.high, `high t=${c.time}`).toBeCloseTo(prev.high, 10);
      expect(c.low, `low t=${c.time}`).toBeCloseTo(prev.low, 10);
    }
  });
});
