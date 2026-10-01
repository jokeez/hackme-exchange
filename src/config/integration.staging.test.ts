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
    expect(f.deskConnect).toBe(false);
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
    expect(f.deskConnect).toBe(false);
    expect(f.exchangeApiOrigin).toBe("");
  });

  it("rejects non-loopback API origin without desk flag", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "staging",
      VITE_EXCHANGE_API_ORIGIN: "https://api.evil.example",
    });
    expect(f.staging).toBe(true);
    expect(f.labApi).toBe(false);
    expect(f.exchangeApiOrigin).toBe("");
  });

  it("public desk connect allowlists exchange-api host", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "paper",
      VITE_PUBLIC_DESK_CONNECT: "1",
      VITE_EXCHANGE_API_ORIGIN: "https://exchange-api.hackme.tech",
    });
    expect(f.deskConnect).toBe(true);
    expect(f.labApi).toBe(false);
    expect(f.exchangeApiOrigin).toBe("https://exchange-api.hackme.tech");
  });

  it("public desk connect defaults to same-origin /desk-api", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "paper",
      VITE_PUBLIC_DESK_CONNECT: "1",
      VITE_EXCHANGE_API_ORIGIN: "",
    });
    expect(f.deskConnect).toBe(true);
    expect(f.exchangeApiOrigin).toBe("https://exchange.hackme.tech/desk-api");
  });

  it("rejects evil host even with desk flag", () => {
    const f = resolveIntegrationFlags({
      VITE_INTEGRATION_MODE: "paper",
      VITE_PUBLIC_DESK_CONNECT: "1",
      VITE_EXCHANGE_API_ORIGIN: "https://evil.example",
    });
    expect(f.deskConnect).toBe(false);
    expect(f.exchangeApiOrigin).toBe("");
  });
});
