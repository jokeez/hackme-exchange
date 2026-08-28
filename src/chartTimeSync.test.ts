import { describe, expect, it, vi } from "vitest";

describe("chartTimeSync registry", () => {
  it("exports sync toggles and propagates visible time range", async () => {
    const mod = await import("./chartTimeSync");
    expect(typeof mod.setTimeSyncEnabled).toBe("function");
    expect(typeof mod.registerTimeSyncPane).toBe("function");

    const targets: Array<{ from: number; to: number }> = [];
    const makeChart = (id: string) => {
      const handler = { fn: (_r: { from: number; to: number } | null) => {} };
      return {
        id,
        chart: {
          timeScale: () => ({
            subscribeVisibleTimeRangeChange: (fn: typeof handler.fn) => {
              handler.fn = fn;
            },
            unsubscribeVisibleTimeRangeChange: vi.fn(),
            setVisibleRange: (r: { from: number; to: number }) => targets.push(r),
          }),
          _emit: (r: { from: number; to: number }) => handler.fn(r),
        },
      };
    };

    const a = makeChart("a");
    const b = makeChart("b");
    mod.setTimeSyncEnabled(true);
    const offA = mod.registerTimeSyncPane({ id: a.id, chart: a.chart as never });
    mod.registerTimeSyncPane({ id: b.id, chart: b.chart as never });

    (a.chart as { _emit: (r: { from: number; to: number }) => void })._emit({ from: 100 as never, to: 200 as never });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ from: 100, to: 200 });

    mod.setTimeSyncEnabled(false);
    (a.chart as { _emit: (r: { from: number; to: number }) => void })._emit({ from: 300 as never, to: 400 as never });
    expect(targets).toHaveLength(1);

    offA();
    mod.clearTimeSyncRegistry();
  });
});
