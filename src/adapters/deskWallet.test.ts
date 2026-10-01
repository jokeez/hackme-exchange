/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { addressFromPubKey } from "./labFixture";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

describe("deskWallet", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it("loadOrCreateDeskSeed is stable within session", async () => {
    vi.doMock("../config/integration", () => ({
      isDeskConnectEnabled: () => true,
      isExchangeApiWired: () => true,
    }));
    const { loadOrCreateDeskSeed, deskWalletIdentity } = await import("./deskWallet");
    const a = loadOrCreateDeskSeed();
    const b = loadOrCreateDeskSeed();
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    const id = deskWalletIdentity(a);
    expect(id.address).toMatch(/^HMC-[0-9a-f]{16}$/);
    const pub = ed.getPublicKey(Uint8Array.from(a.match(/.{2}/g)!.map((x) => parseInt(x, 16))));
    expect(id.address).toBe(addressFromPubKey(pub));
  });

  it("clearDeskSeed forces a new address on next identity", async () => {
    vi.doMock("../config/integration", () => ({
      isDeskConnectEnabled: () => true,
      isExchangeApiWired: () => true,
    }));
    const { loadOrCreateDeskSeed, clearDeskSeed, deskWalletIdentity } = await import("./deskWallet");
    const first = deskWalletIdentity(loadOrCreateDeskSeed()).address;
    clearDeskSeed();
    const second = deskWalletIdentity(loadOrCreateDeskSeed()).address;
    expect(second).toMatch(/^HMC-[0-9a-f]{16}$/);
    expect(second).not.toBe(first);
  });
});
