import { describe, expect, it } from "vitest";
import { modeChromeLabel, modeStatusPill } from "./modeChrome";

describe("modeChrome", () => {
  it("paper build shows paper chrome when lab API is not connected", () => {
    expect(modeStatusPill()).toBe("◎ Paper");
    expect(modeChromeLabel()).toMatch(/paper/i);
    expect(modeChromeLabel()).not.toMatch(/loopback/i);
    expect(modeStatusPill()).not.toMatch(/Lab API/i);
  });
});
