import { describe, expect, it } from "vitest";
import { assetBadge, drawToolIcon, Ico, pairAssetIcons, type DrawIconId } from "./icons";

describe("icons", () => {
  it("Ico entries return SVG with stroke", () => {
    const keys = Object.keys(Ico) as (keyof typeof Ico)[];
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const k of keys) {
      const svg = Ico[k]();
      expect(svg).toContain("<svg");
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('stroke-width="1.5"');
    }
  });

  it("drawToolIcon covers all draw ids", () => {
    const ids: DrawIconId[] = ["cursor", "hline", "trend", "fib", "rect", "text", "measure", "clear", "lock"];
    for (const id of ids) {
      const svg = drawToolIcon(id);
      expect(svg).toContain("<svg");
      expect(svg).toContain("stroke");
    }
  });

  it("chevronDown uses size 12", () => {
    expect(Ico.chevronDown()).toContain('width="12"');
  });

  it("assetBadge: HMC uses logo image; SUP letter; no USDT/BTC glyphs", () => {
    expect(assetBadge("HMC")).toContain("logo-hex.png");
    expect(assetBadge("HMC")).toContain("asset-hmc");
    expect(assetBadge("SUP")).toContain("asset-sup");
    expect(assetBadge("SUP")).toContain(">S<");
    expect(assetBadge("USDT")).not.toContain("₮");
    expect(assetBadge("BTC")).not.toContain("₿");
  });

  it("pairAssetIcons shows base only (no quote stack)", () => {
    const html = pairAssetIcons("HMC", "USDT");
    expect(html).toContain("pair-icons");
    expect(html).toContain("asset-hmc");
    expect(html).toContain("logo-hex.png");
    expect(html).not.toContain("asset-usdt");
    expect(html).not.toContain("₮");
    expect(pairAssetIcons("SUP", "BTC")).toContain("asset-sup");
    expect(pairAssetIcons("SUP", "BTC")).not.toContain("₿");
  });
});
