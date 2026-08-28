/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const remove = vi.fn();
const setData = vi.fn();
const update = vi.fn();
const fitContent = vi.fn();
const resize = vi.fn();
const getVisibleLogicalRange = vi.fn(() => ({ from: 0, to: 40 }));
const setVisibleLogicalRange = vi.fn();
const applyOptions = vi.fn();

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: { type: "Candlestick" },
  createChart: () => ({
    addSeries: () => ({ setData, update }),
    timeScale: () => ({
      fitContent,
      getVisibleLogicalRange,
      setVisibleLogicalRange,
      options: () => ({ barSpacing: 8 }),
    }),
    priceScale: () => ({ width: () => 48, getVisibleRange: () => null, setAutoScale: vi.fn(), setVisibleRange: vi.fn() }),
    applyOptions,
    remove,
    resize,
  }),
}));

describe("chartSecondary multi-slot", () => {
  beforeEach(async () => {
    remove.mockClear();
    setData.mockClear();
    update.mockClear();
    fitContent.mockClear();
    setVisibleLogicalRange.mockClear();
    const mod = await import("./chartSecondary");
    mod.destroySecondaryChart();
  });

  it("keeps independent charts per host id with pane TF chrome", async () => {
    const { mountSecondaryChart, destroySecondaryChart, secondaryChartCount, updateSecondaryChart, syncSecondaryChart } =
      await import("./chartSecondary");
    const a = document.createElement("div");
    a.id = "chart-host-2";
    const b = document.createElement("div");
    b.id = "chart-host-3";
    document.body.append(a, b);
    const candles = [
      { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { time: 2, open: 1.5, high: 2.2, low: 1.2, close: 2, volume: 12 },
    ];
    mountSecondaryChart(a, candles, { pairId: "HMC_USDT", pairLabel: "HMC/USDT", tf: "15m" });
    mountSecondaryChart(b, candles, { pairId: "HMC_USDT", pairLabel: "HMC/USDT", tf: "1H" });
    expect(secondaryChartCount()).toBe(2);
    expect(setData).toHaveBeenCalledTimes(2);
    expect(a.querySelector(".sub-tf-select")).toBeTruthy();
    expect(a.querySelector(".sub-pair-select")).toBeTruthy();
    expect((a.querySelector(".sub-pair-select") as HTMLSelectElement).value).toBe("HMC_USDT");

    setData.mockClear();
    syncSecondaryChart(a, candles, { pairId: "HMC_USDT", pairLabel: "HMC/USDT", tf: "15m" });
    expect(setData).toHaveBeenCalledTimes(1);
    // Initial mounts pin to latest bars (not fitContent whole history).
    expect(setVisibleLogicalRange).toHaveBeenCalled();
    expect(fitContent).toHaveBeenCalledTimes(0);

    updateSecondaryChart([candles[0], { ...candles[1], close: 2.1 }], "chart-host-2");
    expect(update).toHaveBeenCalled();
    destroySecondaryChart();
    expect(secondaryChartCount()).toBe(0);
    expect(remove).toHaveBeenCalledTimes(2);
    a.remove();
    b.remove();
  });
});
