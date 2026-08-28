import { describe, expect, it } from "vitest";
import { resolveIntegrationFlags } from "./integration";

describe("integration staging mode", () => {
  it("staging enables loopback API wiring", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "staging",
      VITE_LAB_API: "",
      VITE_EXCHANGE_API_ORIGIN: "http://127.0.0.1:18443",
    });
    expect(f.staging).toBe(true);
    expect(f.labApi).toBe(true);
    expect(f.exchangeApiOrigin).toBe("http://127.0.0.1:18443");
    expect(f.effectiveMode).toBe("paper");
  });

  it("paper without lab flag does not wire API", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "paper",
      VITE_LAB_API: "",
      VITE_EXCHANGE_API_ORIGIN: "",
    });
    expect(f.staging).toBe(false);
    expect(f.labApi).toBe(false);
    expect(f.exchangeApiOrigin).toBe("");
  });

  it("rejects non-loopback API origin", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "staging",
      VITE_EXCHANGE_API_ORIGIN: "https://api.evil.example",
    });
    expect(f.staging).toBe(true);
    expect(f.labApi).toBe(false);
    expect(f.exchangeApiOrigin).toBe("");
  });
});
