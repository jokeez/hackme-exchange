/**
 * Lab custody helpers — keep SPA client checks aligned with
 * hackme-exchange-api `ledger.ValidateWithdrawDestination`.
 */

import { NATIVE_WITHDRAW_MIN, USDT_WITHDRAW_MIN } from "./custodyLimits";

const HMC_DEST_RE = /^HMC-[0-9a-fA-F]{16}$/;
const EVM_DEST_RE = /^0x[0-9a-fA-F]{40}$/;

/** Matches API `IsLabStubDepositAddress` / labdep prefix rejection for paper outs. */
function looksLikeLabDepositStub(dest: string): boolean {
  return /^labdep/i.test(dest.trim());
}

/** Matches API `safePaperWithdrawDest` (defense-in-depth vs stored XSS). */
export function safePaperWithdrawDest(dest: string): boolean {
  const lower = dest.toLowerCase();
  for (const prefix of ["javascript:", "data:", "vbscript:"]) {
    if (lower.startsWith(prefix)) return false;
  }
  for (let i = 0; i < dest.length; i++) {
    const c = dest.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
    const ch = dest[i]!;
    if (ch === "<" || ch === ">" || ch === '"' || ch === "'" || ch === "`") return false;
  }
  return true;
}

export type WithdrawDestCheck = { ok: true } | { ok: false; hint: string };

/**
 * Client-side withdraw destination gate (mirrors API).
 * HMC/SUP → on-chain HMC- + 16 hex. USDT/BTC → paper ops stubs (not HMC- / not deposit stubs).
 * Optional `selfAddress` rejects withdrawing to the session account (API ErrWithdrawSelfDest).
 */
export function validateLabWithdrawDestination(
  asset: string,
  destination: string,
  selfAddress?: string,
): WithdrawDestCheck {
  const a = asset.trim().toUpperCase();
  const dest = destination.trim();
  if (!dest) {
    return { ok: false, hint: "Amount and destination required" };
  }
  if (dest.length > 128) {
    return { ok: false, hint: "Destination too long (max 128)" };
  }
  const self = (selfAddress || "").trim();
  if (self && dest.toLowerCase() === self.toLowerCase()) {
    return { ok: false, hint: "Cannot withdraw to your own account address" };
  }
  // HMC + SUP share the Ed25519 rail (API ValidateWithdrawDestination).
  if (a === "HMC" || a === "SUP") {
    if (!HMC_DEST_RE.test(dest)) {
      return { ok: false, hint: `${a} destination must be HMC- + 16 hex (e.g. HMC-ffffffffffffffff)` };
    }
    return { ok: true };
  }
  if (a === "USDT") {
    // Desk / mainnet bridge: real BEP-20 0x. Lab paper still accepts ops stubs.
    if (EVM_DEST_RE.test(dest)) return { ok: true };
    if (dest.toUpperCase().startsWith("HMC-") || looksLikeLabDepositStub(dest) || dest.length < 8) {
      return {
        ok: false,
        hint: "USDT needs a BSC 0x… address (BEP-20) — not HMC- or deposit stubs",
      };
    }
    if (!safePaperWithdrawDest(dest)) {
      return { ok: false, hint: "Invalid destination characters (no markup / URI schemes)" };
    }
    return { ok: true };
  }
  if (a === "BTC") {
    if (dest.toUpperCase().startsWith("HMC-") || looksLikeLabDepositStub(dest) || dest.length < 8) {
      return {
        ok: false,
        hint: "BTC needs a paper stub dest (e.g. lab-ops-btc-01) — not HMC- or deposit addresses",
      };
    }
    if (!safePaperWithdrawDest(dest)) {
      return { ok: false, hint: "Invalid destination characters (no markup / URI schemes)" };
    }
    return { ok: true };
  }
  return { ok: false, hint: `Unsupported asset ${a || "(empty)"}` };
}

/** Soft min for UI — matches API default EXCHANGE_WITHDRAW_MIN (1e6 minor = 0.01). */
export const LAB_WITHDRAW_MIN_DISPLAY = NATIVE_WITHDRAW_MIN;

export function validateLabWithdrawAmount(displayAmount: number, asset?: string): WithdrawDestCheck {
  if (!(displayAmount > 0) || !Number.isFinite(displayAmount)) {
    return { ok: false, hint: "Amount and destination required" };
  }
  const a = (asset || "").trim().toUpperCase();
  const min = a === "USDT" ? USDT_WITHDRAW_MIN : LAB_WITHDRAW_MIN_DISPLAY;
  if (displayAmount < min) {
    return { ok: false, hint: `Minimum withdraw is ${min}${a ? ` ${a}` : ""}` };
  }
  return { ok: true };
}
