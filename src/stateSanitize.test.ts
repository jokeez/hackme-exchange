import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeImportedOrder } from "./stateSanitize";
import type { Order } from "./types";

describe("sanitizeImportedOrder (FE-H01)", () => {
  const base = {
    id: "ord-1",
    pairId: "HMC_USDT",
    price: 1,
    amountBase: 1,
    filledBase: 0,
    status: "open",
    createdAt: 1,
  } as Order;

  it("rejects evil side", () => {
    expect(
      sanitizeImportedOrder({
        ...base,
        side: `"><img src=x onerror=alert(1)>` as Order["side"],
        kind: "limit",
      }),
    ).toBeNull();
  });

  it("rejects evil kind", () => {
    expect(
      sanitizeImportedOrder({
        ...base,
        side: "buy",
        kind: "market<script>" as Order["kind"],
      }),
    ).toBeNull();
  });

  it("accepts valid side/kind", () => {
    const o = sanitizeImportedOrder({ ...base, side: "sell", kind: "stop_limit" });
    expect(o).not.toBeNull();
    expect(o?.side).toBe("sell");
    expect(o?.kind).toBe("stop_limit");
  });
});

describe("paper build CSP (FE-M-CSP)", () => {
  it("vite paper CSP string has no loopback lab API", () => {
    const src = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    const m = src.match(/const paperCsp =\s*\n?\s*"([^"]+)"/);
    expect(m?.[1], "paperCsp constant").toBeTruthy();
    const csp = m![1];
    expect(csp).not.toContain("127.0.0.1:18443");
    expect(csp).not.toContain("localhost:18443");
    expect(csp).toContain("connect-src 'self' https://hackme.tech https://api.binance.com");
    expect(csp).toContain("https://api.binance.com");
  });

  it("dev index.html may keep loopback; paper transform strips it", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("127.0.0.1:18443");
    expect(html).toMatch(/Content-Security-Policy/);
  });
});
