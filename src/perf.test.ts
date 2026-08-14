import { describe, expect, it } from "vitest";
import { debounce, throttle, markPerf, measurePerf } from "./perf";

describe("perf helpers", () => {
  it("debounce collapses rapid calls", async () => {
    let n = 0;
    const d = debounce(() => {
      n += 1;
    }, 30);
    d();
    d();
    d();
    expect(n).toBe(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(n).toBe(1);
    d.cancel();
  });

  it("throttle limits frequency", async () => {
    let n = 0;
    const t = throttle(() => {
      n += 1;
    }, 40);
    t();
    t();
    expect(n).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    t();
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("mark/measure soft-fail safely", () => {
    markPerf("lab-test-start");
    const ms = measurePerf("lab-test", "lab-test-start", "lab-test-end");
    expect(ms === null || typeof ms === "number").toBe(true);
  });
});
