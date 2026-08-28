import { describe, expect, it, vi } from "vitest";

vi.mock("./config/integration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config/integration")>();
  return {
    ...actual,
    isStagingMode: () => true,
    isLiveModeBlocked: () => false,
  };
});

import { modeChromeLabel, modeStatusPill } from "./modeChrome";

vi.mock("../adapters/labMatching", () => ({
  useLabMatching: () => false,
}));

describe("modeChrome staging", () => {
  it("labels D1 staging before connect", () => {
    expect(modeChromeLabel()).toContain("D1 staging");
    expect(modeStatusPill()).toBe("◈ D1 staging");
  });
});
