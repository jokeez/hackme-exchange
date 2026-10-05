/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  chartViewportKey,
  clearChartViewport,
  loadChartViewport,
  saveChartViewport,
  viewportFollowsLive,
} from "./chartViewport";

describe("chartViewport", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips viewport per pair+tf", () => {
    const vp = { barSpacing: 9, from: 10, to: 90, seriesLen: 100, followLive: false };
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

  it("detects follow-live from tip proximity or flag", () => {
    expect(viewportFollowsLive({ barSpacing: 8, from: 80, to: 99, seriesLen: 100 })).toBe(true);
    expect(viewportFollowsLive({ barSpacing: 8, from: 10, to: 40, seriesLen: 100 })).toBe(false);
    expect(viewportFollowsLive({ barSpacing: 8, from: 10, to: 40, followLive: true })).toBe(true);
    expect(viewportFollowsLive({ barSpacing: 8, from: 90, to: 110, followLive: false })).toBe(false);
  });
});
