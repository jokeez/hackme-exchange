/**
 * Browser-local HMC wallet for public desk Connect (HOLD matching).
 * Seed stays in sessionStorage only — never shipped in the bundle, never a known lab fixture.
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { authChallenge, authVerify, type ExchangeApiError, type VerifyResponse } from "./exchangeApi";
import { addressFromPubKey, signLabFixtureMessage } from "./labFixture";
import { isDeskConnectEnabled, isExchangeApiWired, isLabLoopbackApi } from "../config/integration";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const SEED_KEY = "hackme.desk.wallet.seed.v1";

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

export function loadOrCreateDeskSeed(): string {
  try {
    const existing = normalizeDeskSeedHex(sessionStorage.getItem(SEED_KEY) ?? "");
    if (existing) return existing;
  } catch {
    /* ignore */
  }
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const hex = bytesToHex(seed);
  persistDeskSeed(hex);
  return hex;
}

export function clearDeskSeed(): void {
  try {
    sessionStorage.removeItem(SEED_KEY);
  } catch {
    /* ignore */
  }
}

/** Replace sessionStorage seed (does not connect). */
export function persistDeskSeed(seedHex: string): string {
  const n = normalizeDeskSeedHex(seedHex);
  if (!n) throw new Error("seed must be 32-byte hex");
  // Prove it is a valid Ed25519 seed before writing.
  ed.getPublicKey(hexToBytes(n));
  try {
    sessionStorage.setItem(SEED_KEY, n);
  } catch {
    /* ignore quota */
  }
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
      "SECRET — anyone with this file can Connect as this HMC address. Never share or commit. Matching/deposit/withdraw stay HOLD until GO.",
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
  return {
    label: "browser desk wallet",
    address: addressFromPubKey(pub),
    pubkeyHex: bytesToHex(pub),
    seedHex,
  };
}

/**
 * Challenge → sign with browser-local seed → verify (cookie on desk API / same-origin proxy).
 */
export async function deskWalletConnect(
  seedHex?: string,
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
  const wallet = deskWalletIdentity(seedHex ?? loadOrCreateDeskSeed());
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
  return { ...(verified as VerifyResponse), wallet };
}
