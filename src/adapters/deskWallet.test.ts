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
    localStorage.clear();
    vi.resetModules();
  });

  it("loadOrCreateDeskSeed is stable within session", async () => {
    vi.doMock("../config/integration", () => ({
      isDeskConnectEnabled: () => true,
      isExchangeApiWired: () => true,
      isLabLoopbackApi: () => false,
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
      isLabLoopbackApi: () => false,
    }));
    const { loadOrCreateDeskSeed, clearDeskSeed, deskWalletIdentity, deskSeedStorageKind } = await import("./deskWallet");
    const first = deskWalletIdentity(loadOrCreateDeskSeed()).address;
    expect(deskSeedStorageKind()).toBe("local");
    clearDeskSeed();
    expect(deskSeedStorageKind()).toBe("none");
    const second = deskWalletIdentity(loadOrCreateDeskSeed()).address;
    expect(second).toMatch(/^HMC-[0-9a-f]{16}$/);
    expect(second).not.toBe(first);
  });

  it("migrates legacy session-only seed into durable localStorage", async () => {
    vi.doMock("../config/integration", () => ({
      isDeskConnectEnabled: () => true,
      isExchangeApiWired: () => true,
      isLabLoopbackApi: () => false,
    }));
    const seed = "11".repeat(32);
    sessionStorage.setItem("hackme.desk.wallet.seed.v1", seed);
    const { hasDeskSeed, deskSeedStorageKind, deskWalletIdentity, reconnectDeskSeed } = await import("./deskWallet");
    expect(hasDeskSeed()).toBe(true);
    expect(reconnectDeskSeed()).toBe(seed);
    expect(deskSeedStorageKind()).toBe("local");
    expect(localStorage.getItem("hackme.desk.wallet.seed.v1")).toBe(seed);
    expect(deskWalletIdentity(seed).address).toMatch(/^HMC-/);
  });

  it("reconnectDeskSeed never mints a new seed", async () => {
    vi.doMock("../config/integration", () => ({
      isDeskConnectEnabled: () => true,
      isExchangeApiWired: () => true,
      isLabLoopbackApi: () => false,
    }));
    const { reconnectDeskSeed, deskWalletConnect, lastKnownDeskAddress, persistDeskSeed, clearDeskSeed, deskWalletIdentity } =
      await import("./deskWallet");
    expect(reconnectDeskSeed()).toBeNull();
    const seed = "22".repeat(32);
    persistDeskSeed(seed);
    const addr = deskWalletIdentity(seed).address;
    expect(lastKnownDeskAddress()).toBe(addr);
    clearDeskSeed();
    expect(reconnectDeskSeed()).toBeNull();
    expect(lastKnownDeskAddress()).toBe(addr);
    const res = await deskWalletConnect(undefined, { createIfMissing: false });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("seed_missing");
      expect(res.message).toContain(addr);
    }
  });

  it("deskWalletConnect refuses when desk and lab are both off", async () => {
    vi.doMock("../config/integration", () => ({
      isDeskConnectEnabled: () => false,
      isExchangeApiWired: () => true,
      isLabLoopbackApi: () => false,
    }));
    const { deskWalletConnect } = await import("./deskWallet");
    const res = await deskWalletConnect();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("disabled");
  });

  it("backup round-trip preserves address", async () => {
    vi.doMock("../config/integration", () => ({
      isDeskConnectEnabled: () => true,
      isExchangeApiWired: () => true,
      isLabLoopbackApi: () => false,
    }));
    const {
      loadOrCreateDeskSeed,
      buildDeskSeedBackup,
      parseDeskSeedImport,
      persistDeskSeed,
      deskWalletIdentity,
      clearDeskSeed,
    } = await import("./deskWallet");
    const seed = loadOrCreateDeskSeed();
    const backup = buildDeskSeedBackup(seed);
    expect(backup.kind).toBe("hackme-desk-seed");
    expect(backup.address).toBe(deskWalletIdentity(seed).address);
    const parsed = parseDeskSeedImport(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    clearDeskSeed();
    persistDeskSeed(parsed.seedHex);
    expect(deskWalletIdentity().address).toBe(backup.address);
    const hexOnly = parseDeskSeedImport(`  ${seed.toUpperCase()}  `);
    expect(hexOnly).toMatchObject({ ok: true, seedHex: seed, address: backup.address });
    expect(parseDeskSeedImport('{"v":1,"kind":"nope"}').ok).toBe(false);
    expect(
      parseDeskSeedImport(
        JSON.stringify({ ...backup, address: "HMC-0000000000000000" }),
      ).ok,
    ).toBe(false);
  });
});
