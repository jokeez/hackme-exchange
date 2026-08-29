/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  chartViewportKey,
  clearChartViewport,
  loadChartViewport,
  saveChartViewport,
} from "./chartViewport";

describe("chartViewport", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips viewport per pair+tf", () => {
    const vp = { barSpacing: 9, from: 10, to: 90 };
    saveChartViewport("HMC_USDT", "15m", vp);
    expect(loadChartViewport("HMC_USDT", "15m")).toEqual(vp);
    expect(loadChartViewport("HMC_USDT", "1H")).toBeNull();
    clearChartViewport("HMC_USDT", "15m");
    expect(loadChartViewport("HMC_USDT", "15m")).toBeNull();
  });

  it("rejects invalid stored payloads", () => {
    sessionStorage.setItem(chartViewportKey("HMC_USDT", "15m"), '{"barSpacing":0,"from":1,"to":2}');
    expect(loadChartViewport("HMC_USDT", "15m")).toBeNull();
  });
});
