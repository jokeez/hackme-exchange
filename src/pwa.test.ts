/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { hasInstallPrompt } from "./pwa";

describe("pwa", () => {
  it("hasInstallPrompt defaults false", () => {
    expect(hasInstallPrompt()).toBe(false);
  });
});
