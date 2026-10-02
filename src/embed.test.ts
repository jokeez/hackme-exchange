/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { applyHubEmbedChrome, hubParentPostMessageOrigin, isHubEmbed, postHubGotoTab } from "./embed";

describe("hub embed helpers", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    delete document.documentElement.dataset.embed;
  });

  it("detects ?embed=hub", () => {
    window.history.replaceState({}, "", "/?embed=hub");
    expect(isHubEmbed()).toBe(true);
    applyHubEmbedChrome();
    expect(document.documentElement.dataset.embed).toBe("hub");
  });

  it("is false on standalone path", () => {
    window.history.replaceState({}, "", "/");
    expect(isHubEmbed()).toBe(false);
  });

  it("postHubGotoTab no-ops when not embedded", () => {
    window.history.replaceState({}, "", "/");
    expect(postHubGotoTab("wallet")).toBe(false);
  });

  it("postHubGotoTab rejects non-allowlisted tabs even in embed", () => {
    window.history.replaceState({}, "", "/?embed=hub");
    expect(postHubGotoTab("javascript:alert(1)" as string)).toBe(false);
    expect(postHubGotoTab("../etc/passwd")).toBe(false);
  });

  it("hubParentPostMessageOrigin allows loopback and hackme.tech", () => {
    expect(hubParentPostMessageOrigin("")).toBe("http://127.0.0.1:8080");
    expect(hubParentPostMessageOrigin("http://127.0.0.1:8080/dashboard.html")).toBe(
      "http://127.0.0.1:8080",
    );
    expect(hubParentPostMessageOrigin("https://hackme.tech/dashboard.html")).toBe(
      "https://hackme.tech",
    );
    expect(hubParentPostMessageOrigin("https://evil.example/phish")).toBeNull();
  });

  it("empty referrer on exchange.hackme.tech falls back to prod hub", () => {
    const prev = window.location.hostname;
    Object.defineProperty(window.location, "hostname", {
      value: "exchange.hackme.tech",
      configurable: true,
    });
    expect(hubParentPostMessageOrigin("")).toBe("https://hackme.tech");
    Object.defineProperty(window.location, "hostname", { value: prev, configurable: true });
  });

  it("postHubGotoTab allowlists wallet and rejects evil origins", () => {
    window.history.replaceState({}, "", "/?embed=hub");
    Object.defineProperty(document, "referrer", {
      value: "https://evil.example/",
      configurable: true,
    });
    expect(postHubGotoTab("wallet")).toBe(false);

    Object.defineProperty(document, "referrer", {
      value: "https://hackme.tech/dashboard.html",
      configurable: true,
    });
    const posted: unknown[] = [];
    const fakeParent = {
      postMessage: (data: unknown, origin: string) => {
        posted.push({ data, origin });
      },
    };
    const desc = Object.getOwnPropertyDescriptor(window, "parent");
    Object.defineProperty(window, "parent", { value: fakeParent, configurable: true });
    expect(postHubGotoTab("wallet")).toBe(true);
    expect(posted).toEqual([
      {
        data: { type: "hackme-exchange", action: "goto-tab", tab: "wallet" },
        origin: "https://hackme.tech",
      },
    ]);
    if (desc) Object.defineProperty(window, "parent", desc);
    else Object.defineProperty(window, "parent", { value: window, configurable: true });
  });

  it("postHubRoute syncs sanitized hash to parent", async () => {
    const { postHubRoute, sanitizeExchangeRouteHash } = await import("./embed");
    expect(sanitizeExchangeRouteHash("#spot/HMC_SUP/1m")).toBe("#spot/HMC_SUP/1m");
    expect(sanitizeExchangeRouteHash("#spot/../evil")).toBeNull();
    window.history.replaceState({}, "", "/?embed=hub");
    Object.defineProperty(document, "referrer", {
      value: "http://127.0.0.1:8080/",
      configurable: true,
    });
    const posted: unknown[] = [];
    const fakeParent = {
      postMessage: (data: unknown, origin: string) => {
        posted.push({ data, origin });
      },
    };
    const desc = Object.getOwnPropertyDescriptor(window, "parent");
    Object.defineProperty(window, "parent", { value: fakeParent, configurable: true });
    expect(postHubRoute("#spot/HMC_SUP/1m")).toBe(true);
    expect(posted).toEqual([
      {
        data: { type: "hackme-exchange", action: "route", hash: "#spot/HMC_SUP/1m" },
        origin: "http://127.0.0.1:8080",
      },
    ]);
    expect(postHubRoute("javascript:alert(1)")).toBe(false);
    if (desc) Object.defineProperty(window, "parent", desc);
    else Object.defineProperty(window, "parent", { value: window, configurable: true });
  });
});
