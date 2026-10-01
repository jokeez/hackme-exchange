/**
 * Lab / desk hardening contracts — CSRF memory-only.
 * Matching gate (useLabMatching ⇒ loopback) is covered by integration.staging + labMatching source.
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearLabSessionMeta, getLabSessionMeta, setLabSessionMeta } from "./adapters/exchangeApi";
import { resolveIntegrationFlags } from "./config/integration";

describe("lab / desk hardening", () => {
  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
  });

  it("persistSession never leaves CSRF in sessionStorage", () => {
    setLabSessionMeta("HMC-abcdef0123456789", "csrf-secret-value");
    expect(getLabSessionMeta()).toEqual({ address: "HMC-abcdef0123456789", hasCsrf: true });
    expect(sessionStorage.getItem("hackme-ex-lab-csrf")).toBeNull();
    expect(sessionStorage.getItem("hackme-ex-lab-address")).toBe("HMC-abcdef0123456789");
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k) continue;
      expect(sessionStorage.getItem(k)).not.toContain("csrf-secret-value");
    }
  });

  it("public desk Connect flags do not enable loopback labApi", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "paper",
      VITE_PUBLIC_DESK_CONNECT: "1",
      VITE_LAB_API: "",
      VITE_EXCHANGE_API_ORIGIN: "",
    });
    expect(f.deskConnect).toBe(true);
    expect(f.labApi).toBe(false);
    expect(f.exchangeApiOrigin).toContain("/desk-api");
  });
});
