/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { parseDemoImport } from "./demoIo";
import { sanitizeFeeConfig } from "./fees";

function base(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    state: {
      wallet: { usdt: 1, hmc: 1, sup: 1, btc: 0 },
      orders: [],
      trades: [],
      ...extra,
    },
  });
}

describe("import XSS / type coercion probes", () => {
  it("rejects or coerces malicious oracleAnchor", () => {
    const parsed = parseDemoImport(
      base({ oracleAnchor: `"><img src=x onerror=alert(1)>` }),
    );
    expect(typeof parsed.oracleAnchor).toBe("number");
    expect(Number.isFinite(parsed.oracleAnchor)).toBe(true);
    expect(String(parsed.oracleAnchor)).not.toMatch(/[<>"']/);
  });

  it("sanitizes drawing ids used in data-* attributes", () => {
    const parsed = parseDemoImport(
      base({
        drawings: [
          {
            id: `"><img src=x onerror=alert(1)>`,
            tool: "hline",
            pairId: "HMC_USDT",
            points: [{ time: 1, price: 1 }],
            color: "#00e5ff",
          },
        ],
      }),
    );
    expect(parsed.drawings).toHaveLength(1);
    expect(parsed.drawings[0].id).toMatch(/^[A-Za-z0-9_.:-]{1,80}$/);
  });

  it("does not leave raw HTML in ledger kind/asset", () => {
    const parsed = parseDemoImport(
      base({
        ledger: [
          {
            id: "ok",
            kind: `"><img src=x onerror=alert(1)>`,
            asset: `"><script>alert(1)</script>`,
            amount: 1,
            usdtValue: 1,
            note: `"><img src=x onerror=alert(1)>`,
            ts: 1,
          },
        ],
      }),
    );
    const e = parsed.ledger[0];
    expect(e.kind).not.toMatch(/<|>/);
    expect(e.asset).not.toMatch(/<|>/);
    expect(e.note).not.toMatch(/[<>]/);
    expect(e.note.length).toBeLessThanOrEqual(240);
  });

  it("clamps chartSettings.gridOpacity for attribute sinks", () => {
    const parsed = parseDemoImport(
      base({
        chartSettings: {
          gridOpacity: `"><img src=x onerror=alert(1)>`,
          candleScheme: `"><img src=x onerror=alert(1)>`,
        },
      }),
    );
    const g = parsed.chartSettings.gridOpacity;
    expect(typeof g === "number" || g === undefined || Number.isFinite(Number(g))).toBe(true);
    expect(String(g ?? "")).not.toMatch(/[<>]/);
  });

  it("feeConfig never yields HTML in discount pct", () => {
    const parsed = parseDemoImport(
      base({
        feeConfig: {
          makerBps: 5,
          takerBps: 10,
          payFeesInHmc: false,
          hmcDiscountPct: `"><img src=x onerror=alert(1)>`,
        },
      }),
    );
    expect(typeof parsed.feeConfig.hmcDiscountPct).toBe("number");
    expect(String(parsed.feeConfig.hmcDiscountPct)).not.toMatch(/[<>"']/);
    expect(sanitizeFeeConfig(parsed.feeConfig).hmcDiscountPct).toBe(parsed.feeConfig.hmcDiscountPct);
  });

  it("rejects prototype pollution via nested constructor", () => {
    const raw = `{"state":{"wallet":{"usdt":1,"hmc":1,"sup":1,"btc":0},"orders":[],"trades":[],"constructor":{"prototype":{"pwned":true}}}}`;
    const parsed = parseDemoImport(raw);
    expect(({} as { pwned?: boolean }).pwned).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, "pwned")).toBe(false);
  });
});
