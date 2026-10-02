/**
 * Regression: desk edge health must re-render Account when deposit/withdraw flip.
 * (Previously only fee_wallet changes triggered account render → perpetual HOLD UI.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("desk edge health re-render contract", () => {
  it("refreshTradingGuardsFromHealth re-renders account on edgeChanged", () => {
    const src = readFileSync(resolve(__dirname, "app.ts"), "utf8");
    expect(src).toMatch(/const edgeChanged\s*=/);
    expect(src).toMatch(/edgeChanged[\s\S]{0,200}state\.mainView === \"account\"[\s\S]{0,80}convert[\s\S]{0,40}spot/);
    expect(src).toMatch(/matching:\s*rawMatching/);
    expect(src).not.toMatch(/matching:\s*formatDeskMatchingLabel\(rawMatching\)/);
  });
});
