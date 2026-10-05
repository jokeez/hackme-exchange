import { describe, expect, it } from "vitest";
import {
  multiWalletTagline,
  renderMultiWalletCard,
  resolveMultiWalletSlices,
  type MultiWalletContext,
} from "./multiWallet";
import { sampleMarket } from "../testFixtures";

const empty = { usdt: 0, hmc: 0, sup: 0, btc: 0 };
const funded = { usdt: 100, hmc: 1000, sup: 0, btc: 0 };

function base(over: Partial<MultiWalletContext> = {}): MultiWalletContext {
  return {
    mode: "paper",
    ledgerWallet: funded,
    nodeWallet: empty,
    deskConnected: false,
    deskMatchingLive: false,
    publicDeskBook: false,
    labConnected: false,
    chainWalletHref: "http://127.0.0.1:8080/#wallet",
    chainWalletLabel: "Node wallet",
    ...over,
  };
}

describe("resolveMultiWalletSlices", () => {
  it("desk soft-launch: desk primary + hub, no paper/lab sandbox rows", () => {
    const slices = resolveMultiWalletSlices(
      base({
        mode: "desk",
        deskConnected: false,
        publicDeskBook: true,
        chainWalletLabel: "Hub wallet",
        chainWalletHref: "https://hackme.tech/#wallet",
      }),
    );
    expect(slices.map((s) => s.id)).toEqual(["desk", "hub"]);
    expect(slices[0].cta).toBe("Connect");
    expect(slices[0].href).toBe("#acct-desk");
    expect(slices[0].subtitle).toMatch(/Connect to trade/i);
    expect(slices[0].wallet).toEqual(empty);
    expect(slices[1].cta).toBe("Open");
    expect(slices[1].href).toMatch(/^https:\/\//);
  });

  it("desk connected + matching LIVE shows Active ledger balances", () => {
    const slices = resolveMultiWalletSlices(
      base({
        mode: "desk",
        deskConnected: true,
        deskMatchingLive: true,
        publicDeskBook: true,
        chainWalletLabel: "Hub wallet",
        chainWalletHref: "https://hackme.tech/#wallet",
      }),
    );
    expect(slices[0].id).toBe("desk");
    expect(slices[0].href).toBeUndefined();
    expect(slices[0].subtitle).toMatch(/live matching/i);
    expect(slices[0].wallet.usdt).toBe(100);
    expect(slices.some((s) => s.id === "paper" || s.id === "lab")).toBe(false);
  });

  it("lab mode: Connect fixture CTA, no paper row", () => {
    const slices = resolveMultiWalletSlices(base({ mode: "lab", labConnected: false }));
    expect(slices.map((s) => s.id)).toEqual(["lab", "node"]);
    expect(slices[0].cta).toBe("Connect");
    expect(slices[0].href).toBe("#acct-lab");
    expect(slices.some((s) => s.id === "paper")).toBe(false);
  });

  it("paper mode keeps paper + node only", () => {
    const slices = resolveMultiWalletSlices(base({ mode: "paper" }));
    expect(slices.map((s) => s.id)).toEqual(["paper", "node"]);
    expect(slices[0].href).toBeUndefined();
    expect(slices[1].cta).toBe("Open");
  });
});

describe("renderMultiWalletCard", () => {
  it("uses soft-launch tagline and Connect CTA (not dead Open to #account)", () => {
    const slices = resolveMultiWalletSlices(
      base({
        mode: "desk",
        publicDeskBook: true,
        chainWalletLabel: "Hub wallet",
        chainWalletHref: "https://hackme.tech/#wallet",
      }),
    );
    const html = renderMultiWalletCard(slices, sampleMarket(), multiWalletTagline("desk"));
    expect(html).toContain("Desk ledger · soft-launch Spot");
    expect(html).not.toContain("Paper trading · node wallet · lab sandbox");
    expect(html).not.toContain("Paper wallet");
    expect(html).not.toContain("Lab ledger");
    expect(html).toContain("Connect");
    expect(html).toContain('href="#acct-desk"');
    expect(html).not.toContain('href="#account"');
    expect(html).toContain("Hub wallet");
  });
});
