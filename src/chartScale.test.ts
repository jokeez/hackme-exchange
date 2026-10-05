import { describe, expect, it } from "vitest";
import {
  clampPaintPriceSpan,
  clampTickMid,
  clipBarWicks,
  displayCapCandles,
  isPriceDiscontinuity,
  logicalRangeToIndices,
  maxBodyFracForTf,
  maxJumpFracForTf,
  maxWickFracForTf,
  paintMaxBodyFracForTf,
  paintMaxSpanFracForTf,
  paintMinSpanFracForTf,
  paintedCandleHealth,
  robustPriceRange,
  sanitizeCandleExtremes,
} from "./chartScale";
import { seedCandles, upsertTick } from "./candles";
import type { Candle } from "./types";

function bar(t: number, o: number, h: number, l: number, c: number): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: 100 };
}

describe("maxJumpFracForTf", () => {
  it("keeps short TFs tight and daily wider", () => {
    expect(maxJumpFracForTf("1m")).toBeLessThanOrEqual(0.02);
    expect(maxJumpFracForTf("15m")).toBeLessThanOrEqual(0.06);
    expect(maxJumpFracForTf("1D")).toBeGreaterThan(maxJumpFracForTf("1m"));
  });
});

describe("clampTickMid", () => {
  it("caps runaway oracle jumps", () => {
    expect(clampTickMid(0.001, 0.0004, 0.18)).toBeCloseTo(0.0004 * 1.18, 10);
    expect(clampTickMid(0.0001, 0.0004, 0.18)).toBeCloseTo(0.0004 * 0.82, 10);
    expect(clampTickMid(0.00041, 0.0004, 0.18)).toBeCloseTo(0.00041, 10);
    // Default jump is tight — large catch-up is clamped
    expect(clampTickMid(0.00063, 0.0005)).toBeCloseTo(0.0005 * 1.04, 10);
  });

  it("detects discontinuity past max jump", () => {
    expect(isPriceDiscontinuity(0.0006, 0.0009, 0.015)).toBe(true);
    expect(isPriceDiscontinuity(0.000905, 0.0009, 0.015)).toBe(false);
  });
});

describe("clipBarWicks / sanitizeCandleExtremes", () => {
  it("clips a mile-long wick toward the body", () => {
    const spiked = clipBarWicks(bar(1, 0.0004, 0.0004, 0.000001, 0.0004));
    expect(spiked.low).toBeGreaterThan(0.000001);
    expect(spiked.low).toBeLessThan(0.0004);
    expect(spiked.high).toBeGreaterThanOrEqual(0.0004);
  });

  it("keeps seeded paper wicks CEX-proportioned (not a barcode)", () => {
    const candles = seedCandles("HMC_USDT", "15m", 0.05, 120);
    const mid = 0.05;
    let maxWickFrac = 0;
    let withWick = 0;
    for (const c of candles) {
      const bodyMid = (c.open + c.close) / 2;
      const up = (c.high - Math.max(c.open, c.close)) / bodyMid;
      const dn = (Math.min(c.open, c.close) - c.low) / bodyMid;
      maxWickFrac = Math.max(maxWickFrac, up, dn);
      if (up > 1e-9 || dn > 1e-9) withWick += 1;
    }
    expect(withWick).toBeGreaterThan(20);
    // Soft cap for 15m is 0.75% beyond body mid.
    expect(maxWickFrac).toBeLessThanOrEqual(0.008);
    const closes = candles.map((c) => c.close);
    const cMin = Math.min(...closes);
    const cMax = Math.max(...closes);
    expect((cMax - cMin) / mid).toBeLessThan(0.14);
  });

  it("clipBarWicks does not force a minimum wick on flat bodies", () => {
    const flat = clipBarWicks(bar(1, 0.05, 0.05, 0.05, 0.05), 0.01);
    expect(flat.high).toBeCloseTo(0.05, 12);
    expect(flat.low).toBeCloseTo(0.05, 12);
  });

  it("flattens a cliff body vs previous close", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      const px = 0.0009;
      candles.push(bar(1_700_000_000 + i * 60, px, px * 1.0002, px * 0.9998, px));
    }
    // Screenshot-class cliff: last bar body 0.0009 → 0.0006
    candles.push(bar(1_700_000_000 + 30 * 60, 0.0009, 0.0009, 0.0006, 0.0006));
    const cleaned = sanitizeCandleExtremes(candles);
    const tip = cleaned[cleaned.length - 1]!;
    expect(Math.abs(tip.close - tip.open) / tip.open).toBeLessThan(0.15);
    expect(tip.low / 0.0009).toBeGreaterThan(0.85);

    const range = robustPriceRange(cleaned)!;
    const span = range.maxValue - range.minValue;
    const mid = (range.maxValue + range.minValue) / 2;
    expect(span / mid).toBeLessThan(0.2);
  });

  it("removes series-squashing spike so robust range stays tight", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      const px = 0.0004 + i * 1e-7;
      candles.push(bar(1_700_000_000 + i * 60, px, px * 1.001, px * 0.999, px));
    }
    candles[20] = bar(candles[20]!.time, 0.00041, 0.00042, 1e-12, 0.00041);
    const cleaned = sanitizeCandleExtremes(candles);
    const lows = cleaned.map((c) => c.low);
    expect(Math.min(...lows)).toBeGreaterThan(0.0002);

    const range = robustPriceRange(cleaned, 0, cleaned.length - 1)!;
    const span = range.maxValue - range.minValue;
    const mid = (range.maxValue + range.minValue) / 2;
    expect(span / mid).toBeLessThan(0.25);
  });
});

describe("robustPriceRange", () => {
  it("ignores percentile outliers", () => {
    const candles = Array.from({ length: 50 }, (_, i) => {
      const px = 100 + Math.sin(i / 5);
      return bar(i, px, px + 0.5, px - 0.5, px);
    });
    candles[10] = bar(10, 100, 10_000, 0.01, 100);
    const range = robustPriceRange(candles)!;
    expect(range.maxValue).toBeLessThan(200);
    expect(range.minValue).toBeGreaterThan(50);
  });

  it("keeps Last on-scale even after Soft-MM tip cliff", () => {
    const candles = Array.from({ length: 40 }, (_, i) => {
      const px = 0.0009;
      return bar(i, px, px * 1.0001, px * 0.9999, px);
    });
    candles[39] = bar(39, 0.0009, 0.0009, 0.00055, 0.00055);
    const range = robustPriceRange(candles)!;
    // Tip must stay visible (empty-top / flat-bottom squash root cause).
    expect(range.minValue).toBeLessThanOrEqual(0.00055);
    // Autoscale still clamps extreme cliffs via clampPaintPriceSpan.
    const tip = candles[39]!.close;
    const clamped = clampPaintPriceSpan(range, tip, paintMaxSpanFracForTf("1m"));
    const span = clamped.maxValue - clamped.minValue;
    const mid = (clamped.maxValue + clamped.minValue) / 2;
    // Tip-centered cliff window — slightly wider than maxSpanFrac due to 40/60 split.
    expect(span / mid).toBeLessThanOrEqual(paintMaxSpanFracForTf("1m") + 0.025);
    expect(clamped.minValue).toBeLessThanOrEqual(tip);
    expect(clamped.maxValue).toBeGreaterThanOrEqual(tip);
  });

  it("body-weighted range keeps quiet bars visible after a dump cliff", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      const px = 0.05 + Math.sin(i / 7) * 0.0004;
      candles.push(bar(1_700_000_000 + i * 60, px, px * 1.001, px * 0.999, px));
    }
    // Screenshot-class Soft-MM dump that previously blew Y into island blanks.
    candles[30] = bar(candles[30]!.time, 0.0502, 0.0502, 0.0445, 0.0448);
    const painted = displayCapCandles(candles, "1m");
    const dumpBody =
      Math.abs(painted[30]!.close - painted[30]!.open) / Math.max(painted[30]!.open, 1e-12);
    const dumpCap = Math.max(paintMaxBodyFracForTf("1m"), maxBodyFracForTf("1m") * 0.85);
    expect(dumpBody).toBeLessThanOrEqual(dumpCap + 1e-9);
    // Continuity: every open bridges prior close.
    for (let i = 1; i < painted.length; i++) {
      expect(painted[i]!.open).toBeCloseTo(painted[i - 1]!.close, 10);
    }
    // Dump needle low must NOT survive into paint (ceiling-comb root cause).
    expect(painted[30]!.low).toBeGreaterThan(0.047);
  });

  it("kills Soft-MM ceiling + hanging needles across sticky peg (all TFs)", () => {
    const tip = 0.0009;
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      // Sticky Last ceiling with occasional Soft-MM dump needles (screenshot class).
      const dump = i % 7 === 3;
      const close = tip;
      const open = tip;
      const high = tip * 1.001;
      const low = dump ? tip * 0.82 : tip * 0.999;
      candles.push(bar(1_700_000_000 + i * 86_400, open, high, low, close));
    }
    for (const tf of ["1m", "15m", "1H", "1D"] as const) {
      const painted = displayCapCandles(candles, tf);
      expect(painted[painted.length - 1]!.close).toBeCloseTo(tip, 10);
      // Continuity through closed bars; tip open may be nudged for a readable body.
      for (let i = 1; i < painted.length - 1; i++) {
        expect(painted[i]!.open).toBeCloseTo(painted[i - 1]!.close, 8);
      }
      // Soft-MM 18% dump needles clipped to TF wick cap.
      for (const c of painted) {
        const bodyLo = Math.min(c.open, c.close);
        const wickFrac = (bodyLo - c.low) / Math.max(bodyLo, 1e-12);
        expect(wickFrac).toBeLessThanOrEqual(maxWickFracForTf(tf) + 1e-4);
        const bodyFrac = Math.abs(c.close - c.open) / Math.max(c.open, 1e-12);
        expect(bodyFrac).toBeLessThanOrEqual(paintMaxBodyFracForTf(tf) + 1e-6);
      }
      // Sticky peg breathes into real candle bodies (not a dashed ruler).
      const bodies = painted.slice(0, -1).map((c) => Math.abs(c.close - c.open) / c.open);
      expect(Math.max(...bodies)).toBeGreaterThan(0.0005);
    }
  });

  it("SUP sticky peg also paints continuous ribbon", () => {
    const tip = 0.25;
    const candles = Array.from({ length: 30 }, (_, i) => {
      const dump = i === 12;
      return bar(1_700_000_000 + i * 60, tip, tip, dump ? tip * 0.7 : tip, tip);
    });
    const painted = displayCapCandles(candles, "1m");
    for (let i = 1; i < painted.length; i++) {
      expect(painted[i]!.open).toBeCloseTo(painted[i - 1]!.close, 8);
    }
    expect(Math.min(...painted.map((c) => c.low))).toBeGreaterThan(tip * 0.95);
  });

  it("1m CEX paint keeps real wicks (not Soft-MM Renko tip-walk)", () => {
    const candles: Candle[] = [];
    let px = 0.05;
    for (let i = 0; i < 40; i++) {
      const open = px;
      const close = px * (1 + (i % 5 === 0 ? 0.006 : i % 5 === 1 ? -0.004 : 0.0015));
      const high = Math.max(open, close) * 1.002;
      const low = Math.min(open, close) * 0.998;
      candles.push(bar(1_700_000_000 + i * 60, open, high, low, close));
      px = close;
    }
    const painted = displayCapCandles(candles, "1m");
    for (let i = 1; i < painted.length; i++) {
      expect(painted[i]!.open).toBeCloseTo(painted[i - 1]!.close, 8);
    }
    const withWick = painted.filter(
      (c) => c.high > Math.max(c.open, c.close) * 1.0002 || c.low < Math.min(c.open, c.close) * 0.9998,
    );
    expect(withWick.length).toBeGreaterThan(8);
    // History must NOT collapse into tip-only Renko ribbon.
    const closes = painted.map((c) => c.close);
    const pathSpan = (Math.max(...closes) - Math.min(...closes)) / closes[closes.length - 1]!;
    expect(pathSpan).toBeGreaterThan(0.01);
    const bodies = painted.map((c) => Math.abs(c.close - c.open) / c.open);
    expect(new Set(bodies.map((b) => b.toFixed(4))).size).toBeGreaterThanOrEqual(3);
  });

  it("1H CEX paint keeps wicks (not Soft-MM tip-walk Renko)", () => {
    const candles: Candle[] = [];
    let px = 0.0008;
    for (let i = 0; i < 24; i++) {
      const open = px;
      const close = px * (1 + (i % 4 === 0 ? 0.008 : i % 4 === 1 ? -0.005 : 0.002));
      const high = Math.max(open, close) * 1.004;
      const low = Math.min(open, close) * 0.996;
      candles.push(bar(1_700_000_000 + i * 3600, open, high, low, close));
      px = close;
    }
    const painted = displayCapCandles(candles, "1H");
    for (let i = 1; i < painted.length; i++) {
      expect(painted[i]!.open).toBeCloseTo(painted[i - 1]!.close, 8);
    }
    const withWick = painted.filter(
      (c) => c.high > Math.max(c.open, c.close) * 1.0003 || c.low < Math.min(c.open, c.close) * 0.9997,
    );
    expect(withWick.length).toBeGreaterThan(5);
    const bodies = painted.map((c) => Math.abs(c.close - c.open) / c.open);
    expect(new Set(bodies.map((b) => b.toFixed(4))).size).toBeGreaterThanOrEqual(3);
  });

  it("1W tip Soft-MM dump keeps open bridged (no tip island)", () => {
    const candles: Candle[] = [];
    let px = 0.22;
    for (let i = 0; i < 12; i++) {
      const open = px;
      const close = px * (1 + (i % 2 === 0 ? 0.01 : -0.008));
      candles.push(bar(1_700_000_000 + i * 604_800, open, Math.max(open, close) * 1.01, Math.min(open, close) * 0.99, close));
      px = close;
    }
    // Tip Last dumped ~18% vs prior week — old paint moved tip open → island.
    const tip = px * 0.82;
    candles[candles.length - 1] = bar(
      candles[candles.length - 1]!.time,
      candles[candles.length - 1]!.open,
      candles[candles.length - 1]!.high,
      tip * 0.99,
      tip,
    );
    const painted = displayCapCandles(candles, "1W");
    expect(painted[painted.length - 1]!.close).toBeCloseTo(tip, 10);
    for (let i = 1; i < painted.length; i++) {
      expect(painted[i]!.open).toBeCloseTo(painted[i - 1]!.close, 8);
    }
  });

  it("1D CEX paint keeps wicks and avoids Renko ladder bodies", () => {
    const candles: Candle[] = [];
    let px = 0.0008;
    for (let i = 0; i < 20; i++) {
      const open = px;
      const close = px * (1 + (i % 3 === 0 ? 0.012 : i % 3 === 1 ? -0.008 : 0.003));
      const high = Math.max(open, close) * 1.006;
      const low = Math.min(open, close) * 0.994;
      candles.push(bar(1_700_000_000 + i * 86_400, open, high, low, close));
      px = close;
    }
    const painted = displayCapCandles(candles, "1D");
    expect(painted[painted.length - 1]!.close).toBeCloseTo(candles[candles.length - 1]!.close, 10);
    for (let i = 1; i < painted.length; i++) {
      expect(painted[i]!.open).toBeCloseTo(painted[i - 1]!.close, 8);
    }
    // Real wicks survive (not body-only Renko blocks).
    const withWick = painted.filter(
      (c) => c.high > Math.max(c.open, c.close) * 1.0005 || c.low < Math.min(c.open, c.close) * 0.9995,
    );
    expect(withWick.length).toBeGreaterThan(5);
    // Bodies must vary — uniform ladder steps fail this.
    const bodies = painted.map((c) => Math.abs(c.close - c.open) / c.open);
    const uniq = new Set(bodies.map((b) => b.toFixed(4)));
    expect(uniq.size).toBeGreaterThanOrEqual(3);
    // Not a uniform Renko step size.
    expect(Math.max(...bodies) - Math.min(...bodies.filter((b) => b > 0))).toBeGreaterThan(0.002);
  });
});

describe("logicalRangeToIndices", () => {
  it("clamps to series bounds", () => {
    expect(logicalRangeToIndices(-5, 100, 40)).toEqual({ fromIdx: 0, toIdx: 39 });
    expect(logicalRangeToIndices(2.2, 8.7, 40)).toEqual({ fromIdx: 2, toIdx: 9 });
  });
});

describe("upsertTick 1m cliff", () => {
  it("does not paint a ±33% body on 1m when oracle jumps", () => {
    const seeded = seedCandles("HMC_USDT", "1m", 0.0009);
    const last = seeded[seeded.length - 1]!;
    expect(last.close).toBeCloseTo(0.0009, 5);
    const next = upsertTick(seeded, "1m", 0.0006, "HMC_USDT", last.close);
    const tip = next[next.length - 1]!;
    const bodyFrac = Math.abs(tip.close - tip.open) / tip.open;
    expect(bodyFrac).toBeLessThan(0.03);
    expect(tip.close / last.close).toBeGreaterThan(0.97);
    expect(tip.low / last.close).toBeGreaterThan(0.97);
  });
});

describe("paper tip + volume hygiene", () => {
  it("seed tip never paints a screenshot-class body spike vs mid", () => {
    const mid = 0.05;
    const candles = seedCandles("HMC_USDT", "15m", mid, 200);
    const tip = candles[candles.length - 1]!;
    const bodyFrac = Math.abs(tip.close - tip.open) / tip.open;
    expect(bodyFrac).toBeLessThanOrEqual(maxBodyFracForTf("15m") + 1e-9);
    expect(tip.high / tip.low).toBeLessThan(1.04);
    // Tip close stays near mid (clamped), not a mile away
    expect(Math.abs(tip.close - mid) / mid).toBeLessThan(0.035);
  });

  it("seed volumes vary across bars (not a flat barcode)", () => {
    const candles = seedCandles("HMC_USDT", "15m", 0.05, 80);
    const vols = new Set(candles.map((c) => c.volume.toFixed(2)));
    expect(vols.size).toBeGreaterThan(10);
  });
});

describe("screenshot Soft-MM floor-dash + skyscraper tip", () => {
  function stickyHistoryThenTipCliff(histPx: number, tipPx: number, n = 80): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < n - 1; i++) {
      const wobble = 1 + Math.sin(i / 9) * 0.0008;
      const px = histPx * wobble;
      candles.push(bar(1_700_000_000 + i * 60, px, px * 1.0004, px * 0.9996, px));
    }
    // Tip Last far above sticky Soft-MM history (screenshot class).
    candles.push(
      bar(1_700_000_000 + (n - 1) * 60, histPx, Math.max(histPx, tipPx), Math.min(histPx, tipPx), tipPx),
    );
    return candles;
  }

  it("HMC 1m: affine-pins history so tip is not a skyscraper", () => {
    const hist = 0.05;
    const tip = 0.077;
    const painted = displayCapCandles(stickyHistoryThenTipCliff(hist, tip), "1m");
    const health = paintedCandleHealth(painted, tip, "1m");
    expect(health.floorSquash).toBe(false);
    expect(health.tipDrift).toBeLessThan(1e-9);
    expect(health.tipBody).toBeLessThanOrEqual(paintMaxBodyFracForTf("1m") + 1e-6);
    expect(health.histVsTip).toBeLessThan(paintMaxSpanFracForTf("1m"));
    expect(health.islands).toBe(0);
    expect(health.spanFrac).toBeLessThan(0.12);
    // Closed bars stay readable (not zero-height dashes).
    expect(health.minClosedBody).toBeGreaterThan(0.0005);
  });

  it("SUP 1m: 40% Soft-MM tip cliff heals without floor dashes", () => {
    const painted = displayCapCandles(stickyHistoryThenTipCliff(0.25, 0.35, 60), "1m");
    const health = paintedCandleHealth(painted, 0.35, "1m");
    expect(health.floorSquash).toBe(false);
    expect(health.tipBody).toBeLessThanOrEqual(paintMaxBodyFracForTf("1m") + 1e-6);
    expect(health.histVsTip).toBeLessThan(0.08);
    expect(health.islands).toBe(0);
  });

  it("dump tip cliff (Last below history) also heals", () => {
    const painted = displayCapCandles(stickyHistoryThenTipCliff(0.09, 0.055, 50), "1m");
    const health = paintedCandleHealth(painted, 0.055, "1m");
    expect(health.floorSquash).toBe(false);
    expect(health.tipBody).toBeLessThanOrEqual(paintMaxBodyFracForTf("1m") + 1e-6);
    expect(painted[painted.length - 1]!.close).toBeCloseTo(0.055, 10);
    expect(health.islands).toBe(0);
  });

  for (const tf of ["30s", "1m", "3m", "5m", "15m", "1H", "4H", "1D"] as const) {
    it(`${tf}: tip cliff heal keeps Last + readable bodies`, () => {
      const painted = displayCapCandles(stickyHistoryThenTipCliff(0.04, 0.07, 40), tf);
      const health = paintedCandleHealth(painted, 0.07, tf);
      expect(health.tipDrift).toBeLessThan(1e-9);
      expect(health.floorSquash).toBe(false);
      expect(health.tipBody).toBeLessThanOrEqual(
        Math.max(paintMaxBodyFracForTf(tf), maxBodyFracForTf(tf) * 0.85) + 1e-5,
      );
      expect(health.islands).toBe(0);
      expect(health.histVsTip).toBeLessThan(paintMaxSpanFracForTf(tf) * 1.1);
    });
  }

  for (const pairMid of [
    ["HMC_USDT", 0.08],
    ["SUP_USDT", 0.22],
    ["HMC_SUP", 0.4],
    ["HMC_BTC", 0.000012],
    ["SUP_BTC", 0.000004],
  ] as const) {
    it(`${pairMid[0]} seed paint is not floor-squashed on 1m`, () => {
      const seeded = seedCandles(pairMid[0], "1m", pairMid[1], 120);
      // Inject Soft-MM tip jump after seed.
      const tip = pairMid[1] * 1.45;
      seeded[seeded.length - 1] = {
        ...seeded[seeded.length - 1]!,
        high: Math.max(seeded[seeded.length - 1]!.high, tip),
        low: Math.min(seeded[seeded.length - 1]!.low, tip),
        close: tip,
      };
      const painted = displayCapCandles(seeded, "1m");
      const health = paintedCandleHealth(painted, tip, "1m");
      expect(health.floorSquash).toBe(false);
      expect(health.tipBody).toBeLessThanOrEqual(paintMaxBodyFracForTf("1m") + 1e-5);
      expect(health.islands).toBe(0);
    });
  }

  it("affine pin preserves relative close silhouette (not Renko ladder)", () => {
    const candles: Candle[] = [];
    let px = 0.05;
    for (let i = 0; i < 30; i++) {
      const open = px;
      const close = px * (1 + (i % 3 === 0 ? 0.004 : i % 3 === 1 ? -0.003 : 0.001));
      candles.push(bar(1_700_000_000 + i * 60, open, Math.max(open, close) * 1.001, Math.min(open, close) * 0.999, close));
      px = close;
    }
    const tip = px * 1.5;
    candles[candles.length - 1] = bar(
      candles[candles.length - 1]!.time,
      candles[candles.length - 1]!.open,
      Math.max(candles[candles.length - 1]!.high, tip),
      Math.min(candles[candles.length - 1]!.low, tip),
      tip,
    );
    const painted = displayCapCandles(candles, "1m");
    const bodies = painted.slice(0, -1).map((c) => Math.abs(c.close - c.open) / c.open);
    const uniq = new Set(bodies.map((b) => b.toFixed(4)));
    expect(uniq.size).toBeGreaterThanOrEqual(3);
    // Not a uniform Renko step.
    expect(Math.max(...bodies) - Math.min(...bodies)).toBeGreaterThan(0.0005);
  });

  it("autoscale min span floor is wide enough for chunky Soft-MM bodies", () => {
    expect(paintMinSpanFracForTf("1m")).toBeGreaterThanOrEqual(0.025);
    expect(paintMinSpanFracForTf("1m")).toBeLessThan(paintMaxSpanFracForTf("1m"));
    expect(paintMinSpanFracForTf("1D")).toBeGreaterThanOrEqual(paintMinSpanFracForTf("1m"));
  });

  it("sticky peg Soft-MM ruler breathes into candles on every short TF", () => {
    const tip = 0.0915;
    for (const tf of ["1m", "5m", "15m"] as const) {
      const candles = Array.from({ length: 40 }, (_, i) => bar(1_700_000_000 + i * 60, tip, tip * 1.0001, tip * 0.9999, tip));
      const painted = displayCapCandles(candles, tf);
      const health = paintedCandleHealth(painted, tip, tf);
      expect(health.floorSquash).toBe(false);
      expect(health.minClosedBody).toBeGreaterThan(0.0008);
      expect(health.tipDrift).toBeLessThan(1e-9);
    }
  });

  it("robust+clamp after paint keeps tip and history in one pane", () => {
    const painted = displayCapCandles(stickyHistoryThenTipCliff(0.05, 0.08, 70), "1m");
    const tip = painted[painted.length - 1]!.close;
    const robust = robustPriceRange(painted)!;
    const clamped = clampPaintPriceSpan(robust, tip, paintMaxSpanFracForTf("1m"));
    const outside = painted.filter(
      (c) => Math.max(c.open, c.close) < clamped.minValue || Math.min(c.open, c.close) > clamped.maxValue,
    );
    // After heal, almost all bodies sit inside the clamped window (no floor-dash class).
    expect(outside.length / painted.length).toBeLessThan(0.15);
    expect(clamped.minValue).toBeLessThanOrEqual(tip);
    expect(clamped.maxValue).toBeGreaterThanOrEqual(tip);
  });
});
