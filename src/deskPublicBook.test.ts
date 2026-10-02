/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { setDeskMatchingStatus, useLiveBook, usePublicDeskBook } from "./adapters/labMatching";
import { isDeskConnectEnabled } from "./config/integration";
import { modeChromeLabel, modeStatusPill } from "./modeChrome";

describe("desk public book helpers", () => {
  beforeEach(() => {
    setDeskMatchingStatus("disabled");
  });

  it("usePublicDeskBook follows health matching ok when desk connect build", () => {
    if (!isDeskConnectEnabled()) return;
    setDeskMatchingStatus("ok");
    expect(usePublicDeskBook()).toBe(true);
    expect(useLiveBook()).toBe(true);
    expect(modeStatusPill()).toMatch(/Desk/);
    expect(modeChromeLabel()).toMatch(/Connect/i);
  });

  it("HOLD matching disables public book", () => {
    if (!isDeskConnectEnabled()) return;
    setDeskMatchingStatus("disabled");
    expect(usePublicDeskBook()).toBe(false);
  });

  it("pre-health pending stays optimistic (no paper ladder flash)", () => {
    if (!isDeskConnectEnabled()) return;
    setDeskMatchingStatus(null);
    expect(usePublicDeskBook()).toBe(true);
    expect(useLiveBook()).toBe(true);
  });
});
