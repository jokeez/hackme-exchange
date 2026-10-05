import { describe, expect, it } from "vitest";
import { ASSET_REGISTRY, onChainAssets, PLANNED_ASSETS } from "./assets";
import { nodeTransferUrl, nodeWalletUrl, publicHubOrigin } from "./walletLinks";
import { mergeNodeIntoDemoWallet } from "./nodeWallet";
import { activeSettlement } from "./settlement";

describe("integration adapters", () => {
  it("registers on-chain and bridge assets", () => {
    expect(ASSET_REGISTRY.length).toBeGreaterThanOrEqual(4);
    expect(onChainAssets().map((a) => a.symbol)).toContain("HMC");
    expect(onChainAssets().map((a) => a.symbol)).toContain("SUP");
  });

  it("plans XMR as external chain", () => {
    const xmr = PLANNED_ASSETS.find((a) => a.symbol === "XMR");
    expect(xmr?.settlement).toBe("external_chain");
  });

  it("builds wallet deep links", () => {
    expect(nodeWalletUrl()).toContain("8080");
    expect(nodeWalletUrl()).toContain("#wallet");
    expect(nodeTransferUrl("hmc")).toContain("focus=transfer");
  });

  it("public hub CTAs never use /hub-proxy (wallet UI lives on hackme.tech)", () => {
    expect(publicHubOrigin()).not.toMatch(/hub-proxy/i);
    expect(nodeWalletUrl()).not.toMatch(/hub-proxy/i);
    expect(publicHubOrigin()).toMatch(/^https?:\/\//);
  });

  it("merges node snapshot into demo wallet", () => {
    const merged = mergeNodeIntoDemoWallet(
      { usdt: 1000, hmc: 1, sup: 2, btc: 0.1 },
      { ok: true, address: "HMC-test", hmc: 500, sup: 50, source: "node", raw: {} },
    );
    expect(merged.hmc).toBe(500);
    expect(merged.sup).toBe(50);
    expect(merged.usdt).toBe(1000);
  });

  it("demo/paper mode uses hybrid node-read settlement (lab API opt-in only)", () => {
    expect(["hybrid-node-read", "liveSettlement"]).toContain(activeSettlement().name);
  });
});
