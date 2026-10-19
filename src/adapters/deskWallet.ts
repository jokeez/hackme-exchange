/**
 * Browser-local HMC wallet for public desk Connect (soft-launch matching).
 *
 * Seed is durable in localStorage (survives reload + tab close) with a
 * sessionStorage + memory mirror. Logout / clear-wallet wipes all stores.
 * Export JSON backup remains the cross-device recovery path.
 *
 * Soft-launch deposits require durable seed: wiping localStorage without
 * migrate orphaned ledger balances under the prior HMC address.
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { authChallenge, authVerify, type ExchangeApiError, type VerifyResponse } from "./exchangeApi";
import { addressFromPubKey, signLabFixtureMessage } from "./labFixture";
import { isDeskConnectEnabled, isExchangeApiWired, isLabLoopbackApi } from "../config/integration";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const SEED_KEY = "hackme.desk.wallet.seed.v1";
/** Non-secret last Connect address — warns before minting a new empty wallet. */
const LAST_ADDR_KEY = "hackme.desk.wallet.lastAddress.v1";

/** In-tab memory mirror so same-tick races after clear still work. */
let memorySeed: string | null = null;

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const h = normalizeDeskSeedHex(hex);
  if (!h) throw new Error("seed must be 32-byte hex");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Accept 64-hex seed (optional 0x / whitespace). */
export function normalizeDeskSeedHex(raw: string): string | null {
  const h = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^0x/, "")
    .replace(/\s+/g, "");
  if (h.length !== 64 || !/^[0-9a-f]+$/.test(h)) return null;
  return h;
}

function readRawSeedFrom(store: Storage): string | null {
  try {
    return normalizeDeskSeedHex(store.getItem(SEED_KEY) ?? "");
  } catch {
    return null;
  }
}

function rememberLastAddress(address: string): void {
  const a = String(address || "").trim();
  if (!a.startsWith("HMC-")) return;
  try {
    localStorage.setItem(LAST_ADDR_KEY, a);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(LAST_ADDR_KEY, a);
  } catch {
    /* ignore */
  }
}

/** Last known desk address (non-secret) for reconnect recovery UX. */
export function lastKnownDeskAddress(): string | null {
  try {
    const a = (localStorage.getItem(LAST_ADDR_KEY) || sessionStorage.getItem(LAST_ADDR_KEY) || "").trim();
    return a.startsWith("HMC-") ? a : null;
  } catch {
    return null;
  }
}

function readStoredDeskSeed(): string | null {
  if (memorySeed) return memorySeed;
  // Prefer session (active tab), then durable local — never delete without migrate.
  const fromSession = typeof sessionStorage !== "undefined" ? readRawSeedFrom(sessionStorage) : null;
  const fromLocal = typeof localStorage !== "undefined" ? readRawSeedFrom(localStorage) : null;
  const seed = fromSession || fromLocal;
  if (!seed) return null;
  memorySeed = seed;
  // Heal missing mirrors so F5 / new tab keep the same address.
  try {
    if (!fromSession) sessionStorage.setItem(SEED_KEY, seed);
  } catch {
    /* ignore */
  }
  try {
    if (!fromLocal) localStorage.setItem(SEED_KEY, seed);
  } catch {
    /* ignore */
  }
  return seed;
}

/** True when a desk seed is stored (local/session/memory). */
export function hasDeskSeed(): boolean {
  return !!readStoredDeskSeed();
}

/** Where the active seed lives — for security chrome / docs honesty. */
export function deskSeedStorageKind(): "local" | "session" | "none" {
  if (memorySeed) {
    try {
      if (normalizeDeskSeedHex(localStorage.getItem(SEED_KEY) ?? "")) return "local";
    } catch {
      /* ignore */
    }
    return "session";
  }
  try {
    if (normalizeDeskSeedHex(localStorage.getItem(SEED_KEY) ?? "")) return "local";
  } catch {
    /* ignore */
  }
  try {
    if (normalizeDeskSeedHex(sessionStorage.getItem(SEED_KEY) ?? "")) return "session";
  } catch {
    /* ignore */
  }
  return "none";
}

/**
 * Load existing seed, or create a new one.
 * Prefer {@link reconnectDeskSeed} for the Reconnect button — never mint there.
 */
export function loadOrCreateDeskSeed(): string {
  const existing = readStoredDeskSeed();
  if (existing) return existing;
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const hex = bytesToHex(seed);
  persistDeskSeed(hex);
  return hex;
}

/**
 * Reconnect path: return existing seed only. Never create a new HD address
 * (that orphaned soft-launch ledger balances under the prior HMC-…).
 */
export function reconnectDeskSeed(): string | null {
  return readStoredDeskSeed();
}

export function clearDeskSeed(): void {
  memorySeed = null;
  try {
    localStorage.removeItem(SEED_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(SEED_KEY);
  } catch {
    /* ignore */
  }
}

/** Persist desk seed to localStorage + sessionStorage (+ memory). */
export function persistDeskSeed(seedHex: string): string {
  const n = normalizeDeskSeedHex(seedHex);
  if (!n) throw new Error("seed must be 32-byte hex");
  // Prove it is a valid Ed25519 seed before writing.
  const id = deskWalletIdentity(n);
  memorySeed = n;
  try {
    localStorage.setItem(SEED_KEY, n);
  } catch {
    /* ignore quota — session/memory may still hold it */
  }
  try {
    sessionStorage.setItem(SEED_KEY, n);
  } catch {
    /* ignore */
  }
  rememberLastAddress(id.address);
  return n;
}

export type DeskSeedBackupV1 = {
  v: 1;
  kind: "hackme-desk-seed";
  address: string;
  seed_hex: string;
  created_at: string;
  warning: string;
};

export function buildDeskSeedBackup(seedHex = loadOrCreateDeskSeed()): DeskSeedBackupV1 {
  const id = deskWalletIdentity(seedHex);
  return {
    v: 1,
    kind: "hackme-desk-seed",
    address: id.address,
    seed_hex: id.seedHex,
    created_at: new Date().toISOString(),
    warning:
      "SECRET — anyone with this file can Connect as this HMC address. Never share or commit. Soft-launch seed is stored in this browser; Export backup before clearing site data or switching devices.",
  };
}

export function parseDeskSeedImport(
  raw: string,
): { ok: true; seedHex: string; address: string } | { ok: false; message: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, message: "empty backup" };

  const asHex = normalizeDeskSeedHex(text);
  if (asHex) {
    try {
      const id = deskWalletIdentity(asHex);
      return { ok: true, seedHex: asHex, address: id.address };
    } catch {
      return { ok: false, message: "invalid seed bytes" };
    }
  }

  try {
    const o = JSON.parse(text) as Partial<DeskSeedBackupV1>;
    if (o?.kind !== "hackme-desk-seed" || o?.v !== 1) {
      return { ok: false, message: "not a hackme desk seed backup" };
    }
    const seed = normalizeDeskSeedHex(String(o.seed_hex ?? ""));
    if (!seed) return { ok: false, message: "backup seed_hex invalid" };
    const id = deskWalletIdentity(seed);
    if (o.address && String(o.address).trim() && String(o.address).trim() !== id.address) {
      return { ok: false, message: "backup address does not match seed" };
    }
    return { ok: true, seedHex: seed, address: id.address };
  } catch {
    return { ok: false, message: "backup must be JSON or 64-hex seed" };
  }
}

export type DeskWalletIdentity = {
  label: "browser desk wallet";
  address: string;
  pubkeyHex: string;
  seedHex: string;
};

export function deskWalletIdentity(seedHex = loadOrCreateDeskSeed()): DeskWalletIdentity {
  const seed = hexToBytes(seedHex);
  const pub = ed.getPublicKey(seed);
  const address = addressFromPubKey(pub);
  rememberLastAddress(address);
  return {
    label: "browser desk wallet",
    address,
    pubkeyHex: bytesToHex(pub),
    seedHex,
  };
}

/**
 * Challenge → sign with browser-local seed → verify (cookie on desk API / same-origin proxy).
 * @param seedHex optional explicit seed; when omitted uses stored seed or creates one.
 * @param opts.createIfMissing when false, refuse instead of minting a new address (Reconnect).
 */
export async function deskWalletConnect(
  seedHex?: string,
  opts?: { createIfMissing?: boolean },
): Promise<(VerifyResponse & { wallet: DeskWalletIdentity }) | ExchangeApiError> {
  if (!isExchangeApiWired()) {
    return {
      ok: false,
      status: 0,
      code: "disabled",
      message: "Exchange API not wired — set VITE_PUBLIC_DESK_CONNECT=1 (or lab loopback)",
    };
  }
  if (!isDeskConnectEnabled() && !isLabLoopbackApi()) {
    return {
      ok: false,
      status: 0,
      code: "disabled",
      message: "Desk Connect off — enable VITE_PUBLIC_DESK_CONNECT=1 (or lab loopback)",
    };
  }
  const createIfMissing = opts?.createIfMissing !== false;
  let resolved = seedHex ? normalizeDeskSeedHex(seedHex) : reconnectDeskSeed();
  if (!resolved) {
    if (!createIfMissing) {
      const prev = lastKnownDeskAddress();
      return {
        ok: false,
        status: 0,
        code: "seed_missing",
        message: prev
          ? `Desk seed missing for ${prev} — Import seed backup to restore balances (Reconnect will not create a new wallet)`
          : "Desk seed missing — Import seed backup or Connect to create a new wallet",
      };
    }
    resolved = loadOrCreateDeskSeed();
  }
  const wallet = deskWalletIdentity(resolved);
  const ch = await authChallenge(wallet.address);
  if ("ok" in ch && ch.ok === false) return ch;
  const challenge = ch as Exclude<typeof ch, ExchangeApiError>;
  const sig = signLabFixtureMessage(challenge.message, wallet.seedHex);
  const verified = await authVerify({
    challenge_id: challenge.challenge_id,
    address: wallet.address,
    pubkey_ed25519: wallet.pubkeyHex,
    sig_ed25519: sig,
  });
  if ("ok" in verified && verified.ok === false) return verified;
  rememberLastAddress(wallet.address);
  return { ...(verified as VerifyResponse), wallet };
}
