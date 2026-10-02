/**
 * Session reconnect — prefer GET /auth/session (cookie), then desk seed re-sign,
 * then lab fixture (loopback only).
 */

import {
  authSessionRestore,
  type ExchangeApiError,
  type SessionRestoreResponse,
} from "./exchangeApi";
import { deskWalletConnect, hasDeskSeed } from "./deskWallet";
import { labFixtureConnect } from "./labFixture";
import { isDeskConnectEnabled, isLabApiEnabled, isLabLoopbackApi } from "../config/integration";

export type LabReconnectResult =
  | { ok: true; address: string; via: "session" | "fixture" | "desk" }
  | ExchangeApiError;

function isApiError(x: SessionRestoreResponse | ExchangeApiError): x is ExchangeApiError {
  return "status" in x && x.ok === false;
}

/**
 * Restore in-memory CSRF from cookie when possible.
 * Desk: fall back to re-signing the stored browser seed (no click required).
 * Lab loopback: fall back to DEMO/LAB fixture re-sign.
 */
export async function labSessionRestoreOrConnect(): Promise<LabReconnectResult> {
  if (!isLabApiEnabled()) {
    return {
      ok: false,
      status: 0,
      code: "disabled",
      message: "Lab API disabled — set VITE_EXCHANGE_API_ORIGIN or VITE_LAB_API=1 (loopback only)",
    };
  }

  const probe = await authSessionRestore();
  if (!isApiError(probe) && probe.ok && probe.csrf_token && probe.address) {
    return { ok: true, address: probe.address, via: "session" };
  }

  if (isDeskConnectEnabled() && hasDeskSeed()) {
    const connected = await deskWalletConnect();
    if ("ok" in connected && connected.ok === false) return connected;
    return { ok: true, address: connected.wallet.address, via: "desk" };
  }

  if (isLabLoopbackApi()) {
    const connected = await labFixtureConnect();
    if ("ok" in connected && connected.ok === false) return connected;
    return { ok: true, address: connected.address, via: "fixture" };
  }

  if (isApiError(probe)) return probe;
  return {
    ok: false,
    status: 401,
    code: "unauthorized",
    message: "session required — Connect desk wallet",
  };
}
