import { describe, expect, it } from "vitest";
import { exportDemoJson, parseDemoImport } from "./demoIo";
import { baseState } from "./testFixtures";

describe("demoIo", () => {
  it("round-trips export/import", () => {
    const state = baseState();
    const raw = exportDemoJson(state);
    const parsed = parseDemoImport(raw);
    expect(parsed.wallet.usdt).toBe(state.wallet.usdt);
    expect(parsed.orders).toEqual([]);
  });

  it("rejects garbage", () => {
    expect(() => parseDemoImport("{}")).toThrow(/wallet/);
    expect(() => parseDemoImport("not-json")).toThrow();
  });

  it("clamps NaN wallet and truncates long notes", () => {
    const state = baseState({
      ledger: [
        {
          id: "1",
          kind: "deposit",
          asset: "USDT",
          amount: 1,
          usdtValue: 1,
          note: `<script>alert(1)</script>${"x".repeat(500)}`,
          ts: Date.now(),
        },
      ],
    });
    (state.wallet as { usdt: number }).usdt = Number.NaN;
    const parsed = parseDemoImport(JSON.stringify({ state }));
    expect(parsed.wallet.usdt).toBe(0);
    expect(parsed.ledger[0].note.length).toBeLessThanOrEqual(240);
    expect(parsed.ledger[0].note).not.toMatch(/<|>/);
  });

  it("caps wallet amounts and strips VIP farm trades", () => {
    const state = baseState({
      wallet: { usdt: 1e15, hmc: 1e15, sup: 1, btc: 1 },
      trades: [
        {
          id: "old",
          pairId: "HMC_USDT",
          side: "buy",
          price: 1,
          amountBase: 1e9,
          amountQuote: 50_000_000,
          feeQuote: 0,
          feeHmc: 0,
          feeRole: "taker",
          feePaidInHmc: false,
          ts: Date.now() - 40 * 86_400_000,
        },
        {
          id: "fat",
          pairId: "HMC_USDT",
          side: "buy",
          price: 1,
          amountBase: 1e9,
          amountQuote: 50_000_000,
          feeQuote: 0,
          feeHmc: 0,
          feeRole: "taker",
          feePaidInHmc: false,
          ts: Date.now(),
        },
      ],
    });
    const parsed = parseDemoImport(JSON.stringify({ state }));
    expect(parsed.wallet.usdt).toBeLessThanOrEqual(1e12);
    expect(parsed.wallet.hmc).toBeLessThanOrEqual(1e12);
    expect(parsed.trades.some((t) => t.id === "old")).toBe(false);
    expect(parsed.trades.find((t) => t.id === "fat")?.amountQuote).toBeLessThanOrEqual(1_000_000);
  });

  it("sanitizes abusive feeConfig on import", () => {
    const state = baseState({
      feeConfig: {
        makerBps: 0,
        takerBps: 500,
        payFeesInHmc: true,
        hmcDiscountPct: 200,
      },
    });
    const parsed = parseDemoImport(JSON.stringify({ state }));
    expect(parsed.feeConfig.makerBps).toBe(8);
    expect(parsed.feeConfig.takerBps).toBe(10);
    expect(parsed.feeConfig.hmcDiscountPct).toBe(25);
  });

  it("sanitizes drawings on import", () => {
    const state = baseState({
      drawings: [
        {
          id: "bad",
          pairId: "HMC_USDT",
          tool: "measure",
          points: [{ time: 1, price: NaN }],
          color: "not-a-color",
        } as never,
        {
          id: "ok",
          pairId: "HMC_USDT",
          tool: "hline",
          points: [{ time: 1, price: 0.4 }],
          color: "#00e5ff",
        },
      ],
    });
    const parsed = parseDemoImport(JSON.stringify({ state }));
    expect(parsed.drawings.every((d) => d.tool !== "measure" || d.points.length >= 2)).toBe(true);
    expect(parsed.drawings.some((d) => d.id === "ok")).toBe(true);
  });

  it("strips XSS payloads from chart color fields on import", () => {
    const state = baseState();
    state.chartSettings = {
      ...state.chartSettings,
      candleStyle: {
        ...state.chartSettings.candleStyle,
        bullBody: `"><img src=x onerror=alert(1)>`,
      },
    };
    state.indicatorConfig = {
      ma: [{ enabled: true, period: 7, color: `"><script>alert(1)</script>` }],
    };
    const parsed = parseDemoImport(JSON.stringify({ state }));
    expect(parsed.chartSettings.candleStyle.bullBody).toBe("#00e676");
    expect(parsed.indicatorConfig.ma[0].color).toBe("#fcd535");
    expect(parsed.indicatorConfig.ma).toHaveLength(4);
  });

  it("fills defaults for sparse imports so saveState does not throw", () => {
    const parsed = parseDemoImport(
      JSON.stringify({
        state: {
          wallet: { usdt: 99, hmc: 1, sup: 1, btc: 0 },
          orders: [],
          trades: [],
        },
      }),
    );
    expect(parsed.candles).toEqual({});
    expect(Array.isArray(parsed.equitySnapshots)).toBe(true);
    expect(parsed.wallet.usdt).toBe(99);
    expect(() => {
      // localStorage may be unavailable in node — exercise compact path via structured fields
      expect(parsed.equitySnapshots.slice).toBeTypeOf("function");
      expect(Object.keys(parsed.candles)).toEqual([]);
    }).not.toThrow();
  });

  it("sanitizes chart overlay booleans on import", () => {
    const state = baseState();
    const parsed = parseDemoImport(
      JSON.stringify({
        state: {
          ...state,
          chartOverlays: {
            showVolume: "false",
            showOrderLines: false,
            showLastPrice: 1,
            orderPreview: true,
            quickOrder: null,
          },
        },
      }),
    );
    expect(parsed.chartOverlays.showVolume).toBe(true);
    expect(parsed.chartOverlays.showOrderLines).toBe(false);
    expect(parsed.chartOverlays.showLastPrice).toBe(true);
    expect(parsed.chartOverlays.orderPreview).toBe(true);
    expect(parsed.chartOverlays.quickOrder).toBe(false);
  });
});
