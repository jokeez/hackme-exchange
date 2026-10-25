/**
 * Flying candles regression: sparse durable /candles islands must become
 * time-contiguous with flat bridges (no diagonal ramp), tip at wall-clock now.
 * Closed print OHLC stay immutable; displayCap may soft-bridge opens for paint.
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

const nowMs = Date.UTC(2026, 9, 24, 15, 0, 0);
const sec = 60;
const tipBucket = Math.floor(nowMs / 1000 / sec) * sec;

function islandCluster(start: number, n: number, px: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      time: start + i * sec,
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
    ...islandCluster(tipBucket - 200 * sec, 8, 0.072),
    ...islandCluster(tipBucket - 140 * sec, 2, 0.078), // floating island
    ...islandCluster(tipBucket - 90 * sec, 15, 0.065),
    ...islandCluster(tipBucket - 40 * sec, 4, 0.068),
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
    expect(healed[healed.length - 1]!.time).toBe(tipBucket);

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
      { ts: (tipBucket - 5) * 1000, price: tip, amountBase: 1 },
      { ts: tipBucket * 1000 + 200, price: tip, amountBase: 1 },
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
    expect(base[base.length - 1]!.time).toBe(tipBucket);
    expect(base[base.length - 1]!.close).toBeCloseTo(tip, 8);
    // Time-contiguous; auction open jumps at print edges may remain but not island-class.
    expect(countOpenJumps(base, 0.05)).toBeLessThanOrEqual(2);

    const painted = displayCapCandles(base, "1m");
    const health = paintedCandleHealth(painted, tip, "1m");
    expect(health.tipDrift).toBeLessThan(0.008);
    // No blank tip — last painted bar is wall-clock tip bucket.
    expect(painted[painted.length - 1]!.time).toBe(tipBucket);
    // Display soft-bridges opens — no island-class open≠prev.close after paint.
    expect(countOpenJumps(painted, 0.05)).toBe(0);
  });

  it("toLwcOhlcPoints hides flat bridges as whitespace but keeps tip", () => {
    const sparse = sparseFlyingDurable();
    const healed = ensureContiguousCandles(sparse, "1m", {
      pairId: "HMC_USDT",
      fillToNow: true,
      nowMs,
    });
    const painted = displayCapCandles(healed, "1m");
    const pts = toLwcOhlcPoints(painted);
    expect(pts).toHaveLength(painted.length);
    expect("open" in pts[pts.length - 1]!).toBe(true);
    let whitespace = 0;
    let ohlc = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if ("open" in p) {
        ohlc++;
        if (i < pts.length - 1) expect(isFlatGapBridge(painted[i]!)).toBe(false);
      } else {
        whitespace++;
        expect(isFlatGapBridge(painted[i]!)).toBe(true);
      }
    }
    expect(whitespace).toBeGreaterThan(10);
    expect(ohlc).toBeGreaterThan(sparse.length);
  });

  it("tip pump does not remap closed durable print closes after contiguous heal", () => {
    const durable = sparseFlyingDurable();
    const durableT = new Set(durable.map((c) => c.time));
    const tip0 = 0.069;
    let all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tipBucket * 1000, price: tip0, amountBase: 1 }],
      tip0,
      nowMs,
      null,
      undefined,
      durable,
    );
    const before = new Map(
      all[CANDLE_BASE_TF]!.filter((c) => durableT.has(c.time) && c.time < tipBucket).map((c) => [
        c.time,
        { ...c },
      ]),
    );
    const tip1 = 0.082;
    all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [
        // Print in a former gap bucket — must not rewrite older durable clusters.
        { ts: (tipBucket - 60) * 1000, price: 0.08, amountBase: 1 },
        { ts: tipBucket * 1000, price: tip1, amountBase: 2 },
      ],
      tip1,
      nowMs,
      all[CANDLE_BASE_TF],
      undefined,
      durable,
    );
    for (const c of all[CANDLE_BASE_TF]!) {
      if (!durableT.has(c.time) || c.time >= tipBucket) continue;
      const prev = before.get(c.time)!;
      expect(c.close, `close t=${c.time}`).toBeCloseTo(prev.close, 10);
      expect(c.high, `high t=${c.time}`).toBeCloseTo(prev.high, 10);
      expect(c.low, `low t=${c.time}`).toBeCloseTo(prev.low, 10);
    }
  });
});
