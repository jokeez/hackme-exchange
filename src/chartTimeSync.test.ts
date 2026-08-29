import { describe, expect, it, vi } from "vitest";
import { computeSyncedLogicalRange } from "./chartTimeSync";

describe("computeSyncedLogicalRange", () => {
  it("preserves span and right padding across different bar counts", () => {
    const synced = computeSyncedLogicalRange({ barCount: 500, from: 440, to: 501 }, 300);
    expect(synced).not.toBeNull();
    expect(synced!.to - synced!.from).toBeCloseTo(61, 5);
    expect(synced!.to).toBeCloseTo(301, 5);
  });

  it("clamps from to -1 when history is short", () => {
    const synced = computeSyncedLogicalRange({ barCount: 80, from: 10, to: 81 }, 40);
    expect(synced).not.toBeNull();
    expect(synced!.from).toBeGreaterThanOrEqual(-1);
    expect(synced!.to).toBeGreaterThan(synced!.from);
  });

  it("returns null for invalid input", () => {
    expect(computeSyncedLogicalRange({ barCount: 1, from: 0, to: 1 }, 100)).toBeNull();
    expect(computeSyncedLogicalRange({ barCount: 100, from: 50, to: 50 }, 100)).toBeNull();
  });
});

describe("chartTimeSync registry", () => {
  it("propagates logical range + barSpacing, not UTC time range", async () => {
    const mod = await import("./chartTimeSync");
    expect(typeof mod.setTimeSyncEnabled).toBe("function");
    expect(typeof mod.bumpTimeSyncPane).toBe("function");

    const targets: Array<{ from: number; to: number; spacing: number }> = [];
    const makeChart = (id: string, bars: number) => {
      let spacing = 8;
      let lr: { from: number; to: number } = { from: bars - 60, to: bars - 1 + 2 };
      const handler = { fn: (_r: { from: number; to: number } | null) => {} };
      return {
        id,
        bars,
        chart: {
          timeScale: () => ({
            getVisibleLogicalRange: () => lr,
            options: () => ({ barSpacing: spacing }),
            subscribeVisibleLogicalRangeChange: (fn: typeof handler.fn) => {
              handler.fn = fn;
            },
            unsubscribeVisibleLogicalRangeChange: vi.fn(),
            applyOptions: (o: { barSpacing?: number }) => {
              if (o.barSpacing != null) spacing = o.barSpacing;
            },
            setVisibleLogicalRange: (r: { from: number; to: number }) => {
              targets.push({ ...r, spacing });
            },
            setVisibleRange: vi.fn(),
          }),
          _emit: (r: { from: number; to: number }) => {
            lr = r;
            handler.fn(r);
          },
          _setSpacing: (s: number) => {
            spacing = s;
          },
        },
      };
    };

    const a = makeChart("a", 500);
    const b = makeChart("b", 300);
    mod.setTimeSyncEnabled(true);
    mod.registerTimeSyncPane({ id: a.id, chart: a.chart as never, barCount: () => a.bars });
    mod.registerTimeSyncPane({ id: b.id, chart: b.chart as never, barCount: () => b.bars });

    (a.chart as { _emit: (r: { from: number; to: number }) => void })._emit({ from: 430, to: 501 });
    await new Promise((r) => setTimeout(r, 20));

    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets[0]!.to - targets[0]!.from).toBeCloseTo(71, 3);

    mod.bumpTimeSyncPane("a");
    await new Promise((r) => setTimeout(r, 20));
    expect(targets.length).toBeGreaterThanOrEqual(1);

    mod.clearTimeSyncRegistry();
  });
});
