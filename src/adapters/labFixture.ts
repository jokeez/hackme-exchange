/**
 * DEMO / LAB ONLY — deterministic Ed25519 fixture for local exchange-api auth.
 * Never use this keypair for real funds. Gated by isLabApiEnabled() (loopback).
 */

import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { authChallenge, authVerify, type ExchangeApiError, type VerifyResponse } from "./exchangeApi";
import { isLabApiEnabled } from "../config/integration";

/** Sync ed25519 for Node ≤18 / browsers without async-only path. */
ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

/** Fixed lab seed (01..20) — matches Go FixtureSigner style; DEMO/LAB only.
 * Production paper builds (VITE_LAB_API≠1) DCE this string out of the bundle.
 */
export const LAB_FIXTURE_SEED_HEX =
  import.meta.env.DEV || import.meta.env.VITE_LAB_API === "1" || import.meta.env.VITE_LAB_API === "true"
    ? "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
    : "";

export type LabFixtureIdentity = {
  /** DEMO/LAB banner */
  label: "DEMO/LAB fixture";
  address: string;
  pubkeyHex: string;
  seedHex: string;
};

function hexToBytes(hex: string): Uint8Array {
  const h = hex.trim().toLowerCase().replace(/^0x/, "");
  if (h.length % 2) throw new Error("odd hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** HMC- + first 16 hex of sha256(ed25519 pubkey) — HackMe address format. */
export function addressFromPubKey(pub: Uint8Array): string {
  const sum = sha256(pub);
  return `HMC-${bytesToHex(sum).slice(0, 16)}`;
}

export function normalizeHmcAddress(address: string): string | null {
  const a = address.trim();
  if (!/^HMC-[0-9a-fA-F]{16}$/.test(a)) return null;
  return `HMC-${a.slice(4).toLowerCase()}`;
}

export function labFixtureIdentity(seedHex = LAB_FIXTURE_SEED_HEX): LabFixtureIdentity {
  if (!seedHex) {
    throw new Error("Lab fixture seed unavailable in this build");
  }
  const seed = hexToBytes(seedHex);
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const pub = ed.getPublicKey(seed);
  return {
    label: "DEMO/LAB fixture",
    address: addressFromPubKey(pub),
    pubkeyHex: bytesToHex(pub),
    seedHex,
  };
}

export function signLabFixtureMessage(message: string | Uint8Array, seedHex = LAB_FIXTURE_SEED_HEX): string {
  if (!seedHex) throw new Error("Lab fixture seed unavailable in this build");
  const seed = hexToBytes(seedHex);
  const msg = typeof message === "string" ? new TextEncoder().encode(message) : message;
  return bytesToHex(ed.sign(msg, seed));
}

/**
 * Challenge → sign with lab fixture → verify (sets httpOnly session cookie on API origin).
 * Clearly DEMO/LAB only — requires isLabApiEnabled().
 */
export async function labFixtureConnect(
  seedHex = LAB_FIXTURE_SEED_HEX,
): Promise<(VerifyResponse & { fixture: LabFixtureIdentity }) | ExchangeApiError> {
  if (!isLabApiEnabled()) {
    return {
      ok: false,
      status: 0,
      code: "disabled",
      message: "Lab API disabled — set VITE_EXCHANGE_API_ORIGIN or VITE_LAB_API=1 (loopback only)",
    };
  }
  if (!seedHex) {
    return {
      ok: false,
      status: 0,
      code: "disabled",
      message: "Lab fixture stripped from this build (paper release)",
    };
  }
  const fixture = labFixtureIdentity(seedHex);
  const ch = await authChallenge(fixture.address);
  if ("ok" in ch && ch.ok === false) return ch;
  const challenge = ch as Exclude<typeof ch, ExchangeApiError>;
  const sig = signLabFixtureMessage(challenge.message, seedHex);
  const verified = await authVerify({
    challenge_id: challenge.challenge_id,
    address: fixture.address,
    pubkey_ed25519: fixture.pubkeyHex,
    sig_ed25519: sig,
  });
  if ("ok" in verified && verified.ok === false) return verified;
  return { ...(verified as VerifyResponse), fixture };
}
