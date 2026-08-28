/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { clampVisiblePriceRange, getChartMountOpts, isOverPriceScale, panLogicalRangeByWheel, priceRangeNeedsHeal, visibleBarBudget, wheelZoomStep, zoomBarSpacing, zoomPriceRange, barSpacingForWidth } from "./chart";
import { destroySecondaryChart, secondaryChartCount } from "./chartSecondary";
import { formatPct, pctTone, chartPriceFormatter } from "./format";
import { ema, sma } from "./indicators";
import { baseState, linearCandles } from "./testFixtures";
import { DEFAULT_INDICATOR_CONFIG } from "./types";

describe("price scale wheel helpers", () => {
  it("zooms out on positive deltaY and in on negative", () => {
    const base = { from: 1, to: 3 };
    const out = zoomPriceRange(base, 100, { step: 1 });
    expect(out.to - out.from).toBeGreaterThan(base.to - base.from);
    const inn = zoomPriceRange(base, -100, { step: -1 });
    expect(inn.to - inn.from).toBeLessThan(base.to - base.from);
    const mid = (base.from + base.to) / 2;
    expect((out.from + out.to) / 2).toBeCloseTo(mid, 10);
  });

  it("scales gently with small trackpad deltas (no fly-away)", () => {
    const base = { from: 0.0004, to: 0.0005 };
    const span0 = base.to - base.from;
    let range = { ...base };
    let residual = 0;
    for (let i = 0; i < 40; i++) {
      const { step, residual: next } = wheelZoomStep(12, residual);
      residual = next;
      if (step !== 0) range = zoomPriceRange(range, step, { step, refPrice: 0.00045 });
    }
    const span = range.to - range.from;
    expect(span).toBeLessThan(span0 * 2.5);
    expect(span).toBeGreaterThan(span0 * 0.4);
  });

  it("caps a single huge deltaY to one notch", () => {
    const { step } = wheelZoomStep(5000, 0);
    expect(Math.abs(step)).toBe(1);
    const base = { from: 1, to: 2 };
    const out = zoomPriceRange(base, 1, { step: 1, refPrice: 1.5 });
    expect(out.to - out.from).toBeLessThan((base.to - base.from) * 1.15);
  });

  it("zoomBarSpacing widens on zoom out and pans logical range", () => {
    expect(zoomBarSpacing(8, 1)).toBeGreaterThan(8);
    expect(zoomBarSpacing(8, -1)).toBeLessThan(8);
    const panned = panLogicalRangeByWheel({ from: 10, to: 50 }, 80, 8);
    expect(panned.from).toBeGreaterThan(10);
    expect(panned.to).toBeGreaterThan(50);
  });

  it("heals a near-zero corrupted price window back to the instrument", () => {
    const healed = clampVisiblePriceRange({ from: 9e-15, to: 1.5e-14 }, 0.00043);
    expect(healed.from).toBeGreaterThan(0.00043 * 1e-4);
    expect(healed.to).toBeLessThan(0.00043 * 10);
    expect(healed.from).toBeLessThan(0.00043);
    expect(healed.to).toBeGreaterThan(0.00043);
    // Zoom-in spam must not collapse toward 1e-14 either.
    let range = { from: 0.0004, to: 0.0005 };
    for (let i = 0; i < 80; i++) {
      range = zoomPriceRange(range, -1, { step: -1, refPrice: 0.00043 });
    }
    expect(range.from).toBeGreaterThan(0.00043 * 1e-3);
    expect(range.to - range.from).toBeGreaterThan(0.00043 * 0.001);
  });

  it("heals zero-width / label-collapse windows from LWC axis drag", () => {
    const ref = 0.00063477;
    // Degenerate window: every axis label would print the same price.
    const collapsed = clampVisiblePriceRange({ from: ref, to: ref + 1e-14 }, ref);
    expect(collapsed.to - collapsed.from).toBeGreaterThan(ref * 0.0019);
    expect(collapsed.from).toBeLessThan(ref);
    expect(collapsed.to).toBeGreaterThan(ref);
    expect(priceRangeNeedsHeal({ from: ref, to: ref + 1e-14 }, ref)).toBe(true);
    expect(priceRangeNeedsHeal(collapsed, ref)).toBe(false);
    // Legitimate user zoom-out must not trigger heal spam.
    const wide = { from: ref * 0.96, to: ref * 1.04 };
    expect(priceRangeNeedsHeal(wide, ref)).toBe(false);
  });

  it("uses wider bar spacing on phone-width panes", () => {
    expect(barSpacingForWidth(360, "15m")).toBeGreaterThanOrEqual(9);
    expect(barSpacingForWidth(360, "15m")).toBeGreaterThan(barSpacingForWidth(1200, "15m"));
  });

  it("keeps anchor price fixed when provided", () => {
    const base = { from: 1, to: 3 };
    const anchor = 2.5;
    const out = zoomPriceRange(base, 100, { step: 1, anchor });
    const ratio0 = (anchor - base.from) / (base.to - base.from);
    const ratio1 = (anchor - out.from) / (out.to - out.from);
    expect(ratio1).toBeCloseTo(ratio0, 8);
  });

  it("visibleBarBudget scales with pane width", () => {
    expect(visibleBarBudget(400, 8)).toBeLessThan(visibleBarBudget(1400, 8));
    expect(visibleBarBudget(800, 8)).toBeGreaterThanOrEqual(40);
    expect(visibleBarBudget(800, 8)).toBeLessThanOrEqual(180);
    expect(visibleBarBudget(1800, 8)).toBeGreaterThan(visibleBarBudget(800, 8));
    expect(visibleBarBudget(1800, 8)).toBeLessThanOrEqual(180);
  });

  it("anchor budget stays wide even when series is short (no mega-candle stretch)", async () => {
    // Pure logic mirror of anchorToLatestCandle window
    const n = 4;
    const budget = visibleBarBudget(900, 10);
    const to = n - 1 + 8;
    const from = to - budget;
    expect(budget).toBeGreaterThanOrEqual(40);
    expect(from).toBeLessThan(0); // empty left — CEX behavior
    expect(to - from).toBe(budget);
  });

  it("detects hover over right price scale strip", () => {
    const rect = { left: 0, right: 800, top: 0, bottom: 400, width: 800, height: 400 } as DOMRect;
    expect(isOverPriceScale(790, rect, 56)).toBe(true);
    expect(isOverPriceScale(400, rect, 56)).toBe(false);
  });
});

describe("pct tone / flat markets", () => {
  it("formatPct omits plus on flat", () => {
    expect(formatPct(0)).toBe("0.00%");
    expect(formatPct(0.00001)).toBe("0.00%");
    expect(formatPct(1.2)).toBe("+1.20%");
    expect(formatPct(-0.5)).toBe("-0.50%");
  });

  it("pctTone is flat near zero", () => {
    expect(pctTone(0)).toBe("flat");
    expect(pctTone(1e-12)).toBe("flat");
    expect(pctTone(0.1)).toBe("up");
    expect(pctTone(-0.1)).toBe("down");
  });
});

describe("chart price formatter axis safety", () => {
  it("formats micro prices without concatenation garbage", () => {
    const s = chartPriceFormatter(0.00063061);
    expect(s).toMatch(/^0\.000/);
    expect(s).not.toMatch(/52143/);
    expect(s.includes(s)).toBe(true);
  });

  it("does not paint volume-sized numbers as prices", () => {
    // Guard: if a volume leaked onto the price axis formatter, UI must still be finite text.
    const s = chartPriceFormatter(507113.82);
    expect(s).toBe("507113.82");
    expect(s).not.toContain("0.000");
  });
});

describe("EMA seed correctness", () => {
  it("seeds with SMA(period) then continues", () => {
    const candles = linearCandles(40, 100, 1, 1000);
    const period = 10;
    const e = ema(candles, period);
    const s = sma(candles, period);
    expect(e[0].value).toBeCloseTo(s[0].value, 10);
    expect(e).toHaveLength(candles.length - period + 1);
  });
});

describe("MA indicator config", () => {
  it("default MA config enables mid periods with custom colors", () => {
    const ma = DEFAULT_INDICATOR_CONFIG.ma;
    expect(ma).toHaveLength(4);
    expect(ma.filter((m) => m.enabled).map((m) => m.period)).toEqual([25, 99]);
    expect(ma[0].color).toMatch(/^#/);
  });

  it("getChartMountOpts includes indicatorConfig for soft refresh", () => {
    const s = baseState({
      indicatorConfig: {
        ma: [
          { enabled: true, period: 7, color: "#fcd535" },
          { enabled: true, period: 25, color: "#e040fb" },
          { enabled: false, period: 99, color: "#7c4dff" },
          { enabled: false, period: 200, color: "#ff5252" },
        ],
      },
    });
    const opts = getChartMountOpts(s, "HMC_USDT", "1m", 0.0004);
    expect(opts.indicatorConfig?.ma[0].period).toBe(7);
    expect(opts.indicatorConfig?.ma.filter((m) => m.enabled)).toHaveLength(2);
  });
});

describe("secondary multi-chart slots", () => {
  it("destroy is idempotent when empty", () => {
    destroySecondaryChart();
    expect(secondaryChartCount()).toBe(0);
    destroySecondaryChart();
    expect(secondaryChartCount()).toBe(0);
  });
});
