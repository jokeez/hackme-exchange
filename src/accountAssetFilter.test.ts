import { describe, expect, it } from "vitest";
import {
  assetRowMatchesFilter,
  spotPairForAsset,
  type AssetPortfolioRow,
} from "./accountPortfolio";

const ROWS: Pick<AssetPortfolioRow, "symbol" | "name" | "usdtValue">[] = [
  { symbol: "USDT", name: "Tether USD", usdtValue: 50 },
  { symbol: "HMC", name: "HackMe Coin", usdtValue: 12 },
  { symbol: "SUP", name: "Superior Companion", usdtValue: 3 },
  { symbol: "BTC", name: "Bitcoin", usdtValue: 100 },
];

function filterAll(q: string, hideSmall = false) {
  return ROWS.filter((r) => assetRowMatchesFilter(r, q, hideSmall)).map((r) => r.symbol);
}

describe("assetRowMatchesFilter", () => {
  it("hm → HMC only (not USDT/BTC/SUP)", () => {
    expect(filterAll("hm")).toEqual(["HMC"]);
    expect(filterAll("HM")).toEqual(["HMC"]);
  });

  it("us → USDT only", () => {
    expect(filterAll("us")).toEqual(["USDT"]);
  });

  it("btc → BTC only", () => {
    expect(filterAll("btc")).toEqual(["BTC"]);
  });

  it("empty query → all assets", () => {
    expect(filterAll("")).toEqual(["USDT", "HMC", "SUP", "BTC"]);
    expect(filterAll("   ")).toEqual(["USDT", "HMC", "SUP", "BTC"]);
  });

  it("garbage → none", () => {
    expect(filterAll("zzzz")).toEqual([]);
    expect(filterAll("xyz123")).toEqual([]);
  });

  it("matches name without matching prices or 'Cost' / 'flat' in row text", () => {
    expect(filterAll("hack")).toEqual(["HMC"]);
    expect(filterAll("tether")).toEqual(["USDT"]);
    // Would falsely match every row if filter scanned full textContent
    expect(filterAll("cost")).toEqual([]);
    expect(filterAll("flat")).toEqual([]);
    expect(filterAll("0.05")).toEqual([]);
  });

  it("Hide < 1 USD drops dust and zero rows", () => {
    const dust = [
      { symbol: "USDT", name: "Tether USD", usdtValue: 0 },
      { symbol: "HMC", name: "HackMe Coin", usdtValue: 0.4 },
      { symbol: "SUP", name: "Superior Companion", usdtValue: 1 },
      { symbol: "BTC", name: "Bitcoin", usdtValue: 2 },
    ];
    expect(dust.filter((r) => assetRowMatchesFilter(r, "", true)).map((r) => r.symbol)).toEqual([
      "SUP",
      "BTC",
    ]);
    expect(dust.filter((r) => assetRowMatchesFilter(r, "hm", true)).map((r) => r.symbol)).toEqual([]);
    expect(dust.filter((r) => assetRowMatchesFilter(r, "hm", false)).map((r) => r.symbol)).toEqual([
      "HMC",
    ]);
  });
});

describe("spotPairForAsset", () => {
  it("maps listed assets to the correct spot pair", () => {
    expect(spotPairForAsset("HMC")).toBe("HMC_USDT");
    expect(spotPairForAsset("SUP")).toBe("SUP_USDT");
    expect(spotPairForAsset("BTC")).toBe("BTC_USDT");
    expect(spotPairForAsset("USDT")).toBe("HMC_USDT");
  });
});
