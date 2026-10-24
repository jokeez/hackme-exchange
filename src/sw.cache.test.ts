/**
 * Guardrails for the exchange SW — stale index/boot caching caused month-old charts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sw = readFileSync(join(import.meta.dirname, "..", "public", "sw.js"), "utf8");
const kill = readFileSync(join(import.meta.dirname, "..", "public", "sw-legacy-kill.js"), "utf8");
const pwa = readFileSync(join(import.meta.dirname, "..", "src", "pwa.ts"), "utf8");

describe("service worker cache policy", () => {
  it("uses a versioned cache name (bump on policy change)", () => {
    expect(sw).toMatch(/const CACHE = "hackme-ex-v\d+"/);
    expect(sw).toContain("hackme-ex-v5");
  });

  it("does not precache index.html or / in the install shell", () => {
    expect(sw).not.toMatch(/SHELL\s*=\s*\[[^\]]*["']\/["']/s);
    expect(sw).not.toMatch(/SHELL\s*=\s*\[[^\]]*index\.html/s);
  });

  it("network-first for navigations without writing HTML into Cache", () => {
    expect(sw).toContain("isNavigation");
    expect(sw).toContain("isVolatilePath");
    // Must not reintroduce cache.put("/", ...) for navigations.
    expect(sw).not.toMatch(/c\.put\(\s*["']\/["']/);
    expect(sw).toContain("skipWaiting");
    expect(sw).toContain("clients.claim");
    expect(sw).toContain("SKIP_WAITING");
  });

  it("never cache-first boots or sw entrypoints", () => {
    expect(sw).toContain("/assets/boot-");
    expect(sw).toContain("/sw.js");
    expect(sw).toMatch(/sw-v\\d\+-/);
    expect(sw).toContain("isImmutableAsset");
  });

  it("legacy kill-switch unregisters and clears caches", () => {
    expect(kill).toContain("unregister");
    expect(kill).toContain("caches.delete");
    expect(kill).toContain("skipWaiting");
  });

  it("pwa registers hashed SW token and unregisters stale workers", () => {
    expect(pwa).toContain("/sw-v5-PLACEHOLDER.js");
    expect(pwa).toContain("unregisterStaleServiceWorkers");
    expect(pwa).toContain("updateViaCache");
    expect(pwa).not.toContain("/sw.js?v=4");
  });
});
