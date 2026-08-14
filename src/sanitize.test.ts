import { describe, expect, it } from "vitest";
import {
  copyTextToClipboard,
  escapeHtml,
  finiteNonNeg,
  isLoopbackOrigin,
  sanitizeCandleStyle,
  sanitizeChartSettings,
  sanitizeCssColor,
  sanitizeHttpUrl,
  sanitizeIndicatorConfig,
  sanitizeOracleAnchor,
} from "./sanitize";

describe("sanitizeOracleAnchor / sanitizeChartSettings", () => {
  it("coerces XSS oracleAnchor and gridOpacity payloads", () => {
    expect(sanitizeOracleAnchor(`"><img src=x onerror=alert(1)>`)).toBe(0.00042);
    expect(sanitizeOracleAnchor(0.5)).toBe(0.5);
    const settings = sanitizeChartSettings({
      gridOpacity: `"><img src=x onerror=alert(1)>` as unknown as number,
      candleScheme: `"><img>` as unknown as "classic",
    });
    expect(settings.gridOpacity).toBe(0.07);
    expect(settings.candleScheme).toBe("classic");
  });
});

describe("escapeHtml", () => {
  it("escapes angle brackets and quotes", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
});

describe("copyTextToClipboard", () => {
  it("returns false for empty input", async () => {
    expect(await copyTextToClipboard("")).toBe(false);
  });
});

describe("sanitizeCssColor", () => {
  it("allows hex and rejects attribute breakout payloads", () => {
    expect(sanitizeCssColor("#00e676", "#fff")).toBe("#00e676");
    expect(sanitizeCssColor(`"><img src=x onerror=alert(1)>`, "#00e676")).toBe("#00e676");
    expect(sanitizeCssColor("red", "#00e676")).toBe("#00e676");
  });
});

describe("sanitizeCandleStyle / sanitizeIndicatorConfig", () => {
  it("clamps malicious colors from import payloads", () => {
    const style = sanitizeCandleStyle({
      bullBody: `"><script>alert(1)</script>`,
      bearBody: "#ff5252",
    });
    expect(style.bullBody).toBe("#00e676");
    expect(style.bearBody).toBe("#ff5252");
    const cfg = sanitizeIndicatorConfig({
      ma: [{ enabled: true, period: 7, color: `"><img src=x onerror=alert(1)>` }],
    });
    expect(cfg.ma[0].color).toBe("#fcd535");
  });
});

describe("sanitizeHttpUrl", () => {
  it("allows https URLs and strips trailing slash", () => {
    expect(sanitizeHttpUrl("https://hackme.tech/pool/", "https://fallback.example")).toBe(
      "https://hackme.tech/pool",
    );
  });

  it("rejects javascript: and falls back", () => {
    expect(sanitizeHttpUrl("javascript:alert(1)", "https://hackme.tech")).toBe("https://hackme.tech");
  });
});

describe("isLoopbackOrigin", () => {
  it("detects localhost variants", () => {
    expect(isLoopbackOrigin("http://127.0.0.1:8080")).toBe(true);
    expect(isLoopbackOrigin("http://localhost:8080")).toBe(true);
    expect(isLoopbackOrigin("https://hackme.tech")).toBe(false);
  });
});

describe("finiteNonNeg", () => {
  it("rejects NaN and negatives", () => {
    expect(finiteNonNeg(NaN, 3)).toBe(3);
    expect(finiteNonNeg(-1, 0)).toBe(0);
    expect(finiteNonNeg(12.5)).toBe(12.5);
  });
});
