import { describe, expect, it, vi } from "vitest";
import { hapticError, hapticLight, hapticSuccess } from "./haptic";

describe("haptic", () => {
  it("calls navigator.vibrate when available", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    hapticLight();
    hapticSuccess();
    hapticError();
    expect(vibrate).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("no-ops when vibrate missing", () => {
    vi.stubGlobal("navigator", {});
    expect(() => hapticLight()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
