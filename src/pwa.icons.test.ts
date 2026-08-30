import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

describe("PWA icons", () => {
  it("manifest references HMC hex PNG icons", () => {
    const raw = readFileSync(join(ROOT, "public/manifest.webmanifest"), "utf8");
    const manifest = JSON.parse(raw) as { icons: { src: string; type: string }[] };
    const png = manifest.icons.filter((i) => i.type === "image/png");
    expect(png.some((i) => i.src.includes("icon-192.png"))).toBe(true);
    expect(png.some((i) => i.src.includes("icon-maskable"))).toBe(true);
  });

  it("logo-hex.png ships in public for HMC badge + PWA", () => {
    expect(existsSync(join(ROOT, "public/logo-hex.png"))).toBe(true);
    expect(existsSync(join(ROOT, "public/icons/apple-touch-icon.png"))).toBe(true);
    expect(existsSync(join(ROOT, "public/icons/icon-512.png"))).toBe(true);
  });
});
