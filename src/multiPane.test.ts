import { describe, expect, it } from "vitest";
import { sanitizeMultiPaneTfs } from "./store";
import { DEFAULT_MULTI_PANE_TFS } from "./types";

describe("multiPaneTfs", () => {
  it("defaults and clamps invalid values", () => {
    expect(sanitizeMultiPaneTfs(undefined)).toEqual(DEFAULT_MULTI_PANE_TFS);
    expect(sanitizeMultiPaneTfs(["1m", "nope", "1W"])).toEqual(["1m", "15m", "1W"]);
    expect(sanitizeMultiPaneTfs(null, "4H")[0]).toBe("4H");
  });
});
