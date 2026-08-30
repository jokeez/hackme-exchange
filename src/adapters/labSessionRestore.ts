/**
 * Lab session reconnect — prefer GET /auth/session before full fixture re-sign.
 */

import {
  authSessionRestore,
  type ExchangeApiError,
  type SessionRestoreResponse,
} from "./exchangeApi";
import { labFixtureConnect } from "./labFixture";
import { isLabApiEnabled } from "../config/integration";

export type LabReconnectResult =
  | { ok: true; address: string; via: "session" | "fixture" }
  | ExchangeApiError;

function isApiError(x: SessionRestoreResponse | ExchangeApiError): x is ExchangeApiError {
  return "status" in x && x.ok === false;
}

/**
 * Restore in-memory CSRF from cookie when possible; otherwise challenge+verify fixture.
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
  if (isApiError(probe)) return probe;
  if (probe.ok && probe.csrf_token && probe.address) {
    return { ok: true, address: probe.address, via: "session" };
  }

  const connected = await labFixtureConnect();
  if ("ok" in connected && connected.ok === false) return connected;
  return { ok: true, address: connected.address, via: "fixture" };
}
