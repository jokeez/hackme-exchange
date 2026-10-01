/**
 * Matching GO SPA gates — public desk must NOT flip lab matching.
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveIntegrationFlags } from "./config/integration";
import { formatDeskMatchingLabel, isDeskMatchingLive } from "./settingsModal";

describe("Matching GO SPA gates", () => {
  it("desk Connect flags keep labApi false (useLabMatching cannot arm on public)", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "paper",
      VITE_PUBLIC_DESK_CONNECT: "1",
      VITE_LAB_API: "",
      VITE_EXCHANGE_API_ORIGIN: "",
    });
    expect(f.deskConnect).toBe(true);
    expect(f.labApi).toBe(false);
    expect(f.exchangeApiOrigin).toContain("/desk-api");
    expect(f.exchangeApiOrigin).not.toMatch(/127\.0\.0\.1|localhost/);
  });

  it("useLabMatching is gated on isLabLoopbackApi (source contract)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/adapters/labMatching.ts"), "utf8");
    expect(src).toMatch(/export function useLabMatching\(\): boolean \{\s*return isLabLoopbackApi\(\)\s*&&\s*getLabSessionMeta\(\)\.hasCsrf;/);
  });

  it("formatDeskMatchingLabel maps disabled → HOLD", () => {
    expect(formatDeskMatchingLabel("disabled")).toBe("HOLD");
    expect(isDeskMatchingLive("disabled")).toBe(false);
    expect(isDeskMatchingLive("ok")).toBe(true);
  });
});
