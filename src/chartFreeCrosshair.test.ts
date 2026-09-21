/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { mountFreeCrosshair } from "./chartFreeCrosshair";

describe("chartFreeCrosshair", () => {
  it("moves via transform without layout reads on each move", () => {
    const host = document.createElement("div");
    host.style.width = "400px";
    host.style.height = "300px";
    document.body.append(host);
    Object.defineProperty(host, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320, x: 10, y: 20, toJSON: () => ({}) }),
    });
    const h = mountFreeCrosshair(host);
    expect(h.el.hidden).toBe(true);
    const local = h.move(50, 80);
    expect(local).toEqual({ x: 40, y: 60 });
    expect(h.el.hidden).toBe(false);
    const v = h.el.querySelector(".free-xh-v") as HTMLElement;
    const hz = h.el.querySelector(".free-xh-h") as HTMLElement;
    expect(v.style.transform).toBe("translate3d(40px,0,0)");
    expect(hz.style.transform).toBe("translate3d(0,60px,0)");
    h.setCapturing(true);
    expect(h.el.classList.contains("capturing")).toBe(true);
    h.setPlotInsets(60, 30);
    expect(h.el.style.right).toBe("60px");
    h.hide();
    expect(h.el.hidden).toBe(true);
    h.destroy();
    expect(host.contains(h.el)).toBe(false);
    host.remove();
  });
});
