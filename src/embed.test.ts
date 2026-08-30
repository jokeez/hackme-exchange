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
});
