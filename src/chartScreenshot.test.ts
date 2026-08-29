/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  compositePaneScreenshots,
  detectMultiChartLayout,
  listChartPaneHosts,
  renderPaneScreenshot,
} from "./chartScreenshot";

describe("chartScreenshot", () => {
  it("detects multi-chart layout classes", () => {
    const split = document.createElement("div");
    split.className = "chart-split layout-4 multi-chart-grid";
    expect(detectMultiChartLayout(split)).toBe("4");
    split.className = "chart-split layout-2v";
    expect(detectMultiChartLayout(split)).toBe("2v");
    split.className = "chart-split layout-2h";
    expect(detectMultiChartLayout(split)).toBe("2h");
    split.className = "chart-split";
    expect(detectMultiChartLayout(split)).toBe("1");
  });

  it("lists chart pane hosts in DOM order", () => {
    const split = document.createElement("div");
    split.className = "chart-split layout-4";
    for (const id of ["chart-host", "chart-host-2", "chart-host-3", "chart-host-4"]) {
      const h = document.createElement("div");
      h.id = id;
      h.className = id === "chart-host" ? "chart-host" : "chart-host chart-host-sub";
      split.append(h);
    }
    document.body.append(split);
    expect(listChartPaneHosts(split).map((h) => h.id)).toEqual([
      "chart-host",
      "chart-host-2",
      "chart-host-3",
      "chart-host-4",
    ]);
    split.remove();
  });

  it("composites multiple pane bitmaps into one canvas", () => {
    const split = document.createElement("div");
    split.className = "chart-split layout-2v";
    const mockRect = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
      el.getBoundingClientRect = () =>
        ({
          x,
          y,
          width: w,
          height: h,
          top: y,
          left: x,
          right: x + w,
          bottom: y + h,
          toJSON: () => ({}),
        }) as DOMRect;
    };
    mockRect(split, 0, 0, 400, 300);
    document.body.append(split);

    const makePane = (id: string, top: number, height: number) => {
      const host = document.createElement("div");
      host.id = id;
      host.className = "chart-host";
      mockRect(host, 0, top, 400, height);
      const inner = document.createElement("div");
      inner.className = "chart-inner";
      mockRect(inner, 0, top, 400, height);
      host.append(inner);
      split.append(host);
      const lwc = document.createElement("canvas");
      lwc.width = 80;
      lwc.height = 60;
      return { hostEl: host, lwcCanvas: lwc, label: id };
    };

    const p1 = makePane("chart-host", 0, 150);
    const p2 = makePane("chart-host-2", 150, 150);
    const probe = document.createElement("canvas");
    probe.width = 400;
    probe.height = 300;
    if (!probe.getContext("2d")) {
      expect(listChartPaneHosts(split)).toHaveLength(2);
      split.remove();
      return;
    }
    const out = compositePaneScreenshots(split, [p1, p2], 1);
    expect(out).toBeTruthy();
    expect(out!.width).toBe(400);
    expect(out!.height).toBe(300);
    split.remove();
  });

  it("renderPaneScreenshot sizes output to host rect", () => {
    const host = document.createElement("div");
    host.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 200, height: 120, top: 0, left: 0, right: 200, bottom: 120, toJSON: () => ({}) }) as DOMRect;
    const inner = document.createElement("div");
    inner.className = "chart-inner";
    inner.getBoundingClientRect = () =>
      ({ x: 0, y: 20, width: 200, height: 100, top: 20, left: 0, right: 200, bottom: 120, toJSON: () => ({}) }) as DOMRect;
    host.append(inner);
    const lwc = document.createElement("canvas");
    lwc.width = 40;
    lwc.height = 30;
    const out = renderPaneScreenshot({ hostEl: host, lwcCanvas: lwc, label: "HMC/USDT · 15m" }, 1);
    expect(out.width).toBe(200);
    expect(out.height).toBe(120);
  });
});
