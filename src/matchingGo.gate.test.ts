/**
 * Matching GO SPA gates — public desk must NOT flip lab matching.
 * Desk live path is separate: useDeskMatching (health ok + CSRF), useServerMatching = lab|desk.
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveIntegrationFlags } from "./config/integration";
import { formatDeskMatchingLabel, isDeskMatchingLive } from "./settingsModal";
import {
  getDeskMatchingStatus,
  setDeskMatchingStatus,
  useDeskMatching,
  useLabMatching,
  useServerMatching,
} from "./adapters/labMatching";

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
    expect(src).toMatch(
      /export function useLabMatching\(\): boolean \{\s*return isLabLoopbackApi\(\)\s*&&\s*getLabSessionMeta\(\)\.hasCsrf;/,
    );
  });

  it("useDeskMatching requires desk Connect + matching ok + CSRF (source contract)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/adapters/labMatching.ts"), "utf8");
    expect(src).toMatch(/export function useDeskMatching\(\): boolean/);
    expect(src).toMatch(/isDeskConnectEnabled\(\)/);
    expect(src).toMatch(/isDeskMatchingLive\(deskMatchingRaw\)/);
    expect(src).toMatch(
      /export function useServerMatching\(\): boolean \{\s*return useLabMatching\(\) \|\| useDeskMatching\(\);/,
    );
  });

  it("formatDeskMatchingLabel maps disabled → HOLD", () => {
    expect(formatDeskMatchingLabel("disabled")).toBe("HOLD");
    expect(isDeskMatchingLive("disabled")).toBe(false);
    expect(isDeskMatchingLive("ok")).toBe(true);
  });

  it("setDeskMatchingStatus feeds getDeskMatchingStatus; HOLD keeps useDeskMatching false without CSRF/desk", () => {
    setDeskMatchingStatus("disabled");
    expect(getDeskMatchingStatus()).toBe("disabled");
    expect(useDeskMatching()).toBe(false);
    expect(useLabMatching()).toBe(false);
    expect(useServerMatching()).toBe(false);

    setDeskMatchingStatus("ok");
    expect(getDeskMatchingStatus()).toBe("ok");
    // Without desk Connect + CSRF, still false even if health says ok.
    expect(useDeskMatching()).toBe(false);
    expect(useServerMatching()).toBe(false);

    setDeskMatchingStatus("HOLD"); // UI label should normalize lower — still not "ok"
    expect(getDeskMatchingStatus()).toBe("hold");
    expect(isDeskMatchingLive(getDeskMatchingStatus())).toBe(false);
  });

  it("app wires setDeskMatchingStatus from health poll (source contract)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(src).toMatch(/setDeskMatchingStatus\(rawMatching\)/);
    expect(src).toMatch(/useServerMatching/);
    expect(src).toMatch(/useDeskMatching/);
  });

  it("hashchange restores prevPair before switchActivePair (pair form remount)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    // Regression: applyHashToState() set activePair first, then switchActivePair no-op'd
    // leaving Price(BTC) + BTC mid on HMC/USDT after deep-link / hash pair change.
    expect(src).toMatch(
      /const nextPair = state\.activePair;\s*state\.activePair = prevPair;\s*switchActivePair\(nextPair\);/,
    );
    expect(src).toMatch(/clearLabBookCache\(\);/);
  });

  it("hashchange restores prevTf before setPaneTf (tf buttons + series)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    // Same trap as pair: setPaneTf early-returns when tf === state.activeTf.
    expect(src).toMatch(
      /const nextTf = state\.activeTf;\s*state\.activeTf = prevTf;\s*setPaneTf\(1, nextTf\);/,
    );
  });
});
