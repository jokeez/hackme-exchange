/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { resolveNodeProbeUrl } from "./nodeWallet";

describe("resolveNodeProbeUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "https://exchange.hackme.tech" },
    });
  });

  it("uses hub-proxy on public exchange host (connect-src self)", () => {
    expect(resolveNodeProbeUrl()).toBe("https://exchange.hackme.tech/hub-proxy/api/status?lite=1");
  });

  it("uses loopback node origin in local dev", () => {
    vi.stubGlobal("window", {
      location: { origin: "http://127.0.0.1:5199" },
    });
    expect(resolveNodeProbeUrl()).toBe("http://127.0.0.1:8080/api/status?lite=1");
  });
});
