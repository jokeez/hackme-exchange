import { describe, expect, it } from "vitest";
import { uid } from "./id";
import { roundToTick, tickInputValue } from "./tick";
import { feeScheduleLabel, previewFeeRole, quoteAssetForPair, volume30dUsdt } from "./fees";
import { baseState } from "./testFixtures";
import { defaultIndicatorConfig, defaultOverlays } from "./chartModals";
import { countActiveIndicators, clearAllIndicators, clearIndicatorConfig, toggleIndicator } from "./chart";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS, DEFAULT_INDICATOR_CONFIG } from "./types";
import { isLiveMode, INTEGRATION } from "./config/integration";
import { isLoopbackOrigin } from "./sanitize";

describe("id", () => {
  it("uid returns unique-ish tokens", () => {
    const a = uid();
    const b = uid();
    expect(a).toMatch(/-/);
    expect(a).not.toBe(b);
  });
});

describe("tick extra", () => {
  it("passes through non-positive without rounding", () => {
    expect(roundToTick(0, "HMC_USDT")).toBe(0);
    expect(roundToTick(-1, "HMC_USDT")).toBe(-1);
    expect(tickInputValue(0, "HMC_USDT")).toBe("0");
  });

  it("SUP_USDT uses 8 decimals", () => {
    expect(tickInputValue(0.000047123456, "SUP_USDT")).toBe("0.00004712");
  });
});

describe("fees extras", () => {
  it("previewFeeRole matches intended defaults", () => {
    expect(previewFeeRole("market")).toBe("taker");
    expect(previewFeeRole("limit")).toBe("maker");
    expect(previewFeeRole("oco")).toBe("maker");
    expect(previewFeeRole("stop_limit")).toBe("maker");
    expect(previewFeeRole("trailing_stop")).toBe("taker");
  });

  it("quoteAssetForPair maps quote wallet", () => {
    expect(quoteAssetForPair("HMC_USDT")).toBe("usdt");
    expect(quoteAssetForPair("HMC_BTC")).toBe("btc");
  });

  it("volume30dUsdt ignores old trades", () => {
    const s = baseState();
    s.trades = [
      {
        id: "old",
        pairId: "HMC_USDT",
        side: "buy",
        price: 1,
        amountBase: 1,
        amountQuote: 999_999,
        feeQuote: 0,
        feeHmc: 0,
        feeRole: "taker",
        feePaidInHmc: false,
        ts: Date.now() - 40 * 86_400_000,
      },
      {
        id: "new",
        pairId: "HMC_USDT",
        side: "buy",
        price: 1,
        amountBase: 1,
        amountQuote: 50,
        feeQuote: 0,
        feeHmc: 0,
        feeRole: "taker",
        feePaidInHmc: false,
        ts: Date.now(),
      },
    ];
    expect(volume30dUsdt(s)).toBe(50);
  });

  it("feeScheduleLabel includes Maker/Taker", () => {
    expect(feeScheduleLabel(baseState())).toMatch(/Maker/);
    expect(feeScheduleLabel(baseState())).toMatch(/Taker/);
  });
});

describe("chartModals defaults", () => {
  it("default overlays / indicator config are clones of types defaults", () => {
    const o = defaultOverlays();
    const ic = defaultIndicatorConfig();
    expect(o.showVolume).toBe(true);
    expect(ic.ma).toHaveLength(4);
    o.showOrderLines = !o.showOrderLines;
    expect(defaultOverlays().showOrderLines).not.toBe(o.showOrderLines);
  });
});

describe("chart indicator helpers (pure)", () => {
  it("toggle / count / clear indicators", () => {
    let settings = structuredClone(DEFAULT_CHART_SETTINGS);
    settings = toggleIndicator("sma20", true, settings);
    expect(settings.indicators.sma20).toBe(true);
    expect(countActiveIndicators(settings, DEFAULT_INDICATOR_CONFIG)).toBeGreaterThan(0);
    settings = clearAllIndicators(settings);
    const cfg = clearIndicatorConfig();
    expect(cfg.ma.every((m) => !m.enabled)).toBe(true);
    expect(countActiveIndicators(settings, cfg)).toBe(0);
  });
});

describe("integration config", () => {
  it("defaults to paper mode with hub origins; live stays blocked", () => {
    expect(isLiveMode()).toBe(false);
    expect(["demo", "paper"]).toContain(INTEGRATION.mode);
    expect(INTEGRATION.hubOrigin).toContain("hackme.tech");
    expect(INTEGRATION.nodeOrigin).toContain("127.0.0.1");
    // Empty by default; when VITE_EXCHANGE_API_ORIGIN / lab flag is set, must stay loopback.
    if (INTEGRATION.exchangeApiOrigin) {
      expect(isLoopbackOrigin(INTEGRATION.exchangeApiOrigin)).toBe(true);
    } else {
      expect(INTEGRATION.exchangeApiOrigin).toBe("");
    }
  });
});
