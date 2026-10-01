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
  const h = hex.trim().toLowerCase().replace(/^0x/, "");
  if (h.length !== 64 || !/^[0-9a-f]+$/.test(h)) throw new Error("seed must be 32-byte hex");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function loadOrCreateDeskSeed(): string {
  try {
    const existing = sessionStorage.getItem(SEED_KEY)?.trim() ?? "";
    if (existing.length === 64 && /^[0-9a-fA-F]+$/.test(existing)) return existing.toLowerCase();
  } catch {
    /* ignore */
  }
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const hex = bytesToHex(seed);
  try {
    sessionStorage.setItem(SEED_KEY, hex);
  } catch {
    /* ignore */
  }
  return hex;
}

export function clearDeskSeed(): void {
  try {
    sessionStorage.removeItem(SEED_KEY);
  } catch {
    /* ignore */
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
