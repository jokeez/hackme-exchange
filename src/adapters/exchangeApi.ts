/**
 * Loopback exchange-api HTTP client (private lab).
 * Does not enable isLiveMode() — public stays paper; lab opt-in uses server matching when session present.
 */

import { INTEGRATION } from "../config/integration";
import { fetchWithTimeout } from "../fetchTimeout";
import { isLoopbackOrigin } from "../sanitize";
import type { OrderSide, PairId, Wallet } from "../types";

export const MINOR_UNIT_SCALE = 1e8;

export type ExchangeApiError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type ChallengeResponse = {
  challenge_id: string;
  address: string;
  nonce: string;
  message: string;
  expires_at: string;
};

export type VerifyResponse = {
  ok: true;
  address: string;
  csrf_token: string;
  expires_at: string;
};

export type BalanceRow = {
  asset: string;
  available: number;
  reserved: number;
  hold?: number;
  amount: number;
};

export type BalancesResponse = {
  address: string;
  balances: BalanceRow[];
  note?: string;
};

export type HealthResponse = {
  ok: boolean;
  service?: string;
  phase?: string;
  warning?: string;
  ledger?: string;
  matching?: string;
  fees?: {
    maker_bps?: number;
    taker_bps?: number;
    vip?: string;
    regular_maker_bps?: number;
    regular_taker_bps?: number;
    /** When true / set, server convert charges spot taker (SPA may prefer API convert). */
    convert_taker_bps?: number;
    convert_fee?: boolean | string | number;
    /** Server accepts pay_fee_in_hmc on orders / convert. */
    hmc_fee_pay?: boolean | string | number;
    /** Hint string or bool — presence implies server HMC fee-pay. */
    pay_fee_in_hmc?: boolean | string | number;
    hmc_discount_pct?: number;
    /** Live API name for HMC fee discount (alias of hmc_discount_pct). */
    hmc_fee_discount_pct?: number;
  };
  /** Optional feature flags (sibling API may nest or flatten). */
  features?: {
    convert_fee?: boolean | string | number;
    hmc_fee_pay?: boolean | string | number;
  };
  convert_fee?: boolean | string | number;
  hmc_fee_pay?: boolean | string | number;
  /**
   * Lab fee-collection address (public ledger address only — never a private key).
   * From API `EXCHANGE_FEE_WALLET`; omit/empty → SPA hides the row.
   * Live API may return `{ address, note }` or a plain string.
   */
  fee_wallet?: string | { address?: string; note?: string };
  /** Optional lab trading guards (API may expose flat or nested). */
  min_notional?: number;
  min_notional_quote?: number;
  price_band_bps?: number;
  band_bps?: number;
  lab_mm?: boolean | string | number | { enabled?: boolean; seeded?: boolean; on?: boolean; active?: boolean; seed?: boolean };
  mm_seeded?: boolean | string | number;
  lab_mm_seeded?: boolean | string | number;
  lab_mm_enabled?: boolean | string | number;
  trading?: {
    min_notional?: number;
    min_notional_quote?: number;
    price_band_bps?: number;
    lab_mm?: boolean | string | number;
    mm_seeded?: boolean | string | number;
    seeded?: boolean | string | number;
  };
  risk?: {
    min_notional?: number;
    price_band_bps?: number;
    band_bps?: number;
  };
  deposit?: { enabled?: boolean; pause?: string };
  custody_fees?: { enabled?: boolean; quote?: string; pause?: string };
  withdraw?: {
    enabled?: boolean;
    min?: number;
    daily_cap?: number;
    require_2fa?: boolean;
    note?: string;
  };
};

/** Server order snapshot (integer minors). */
export type ApiOrder = {
  id: string;
  account?: string;
  pair: string;
  side: string;
  type: string;
  price: number;
  stop_price?: number;
  qty: number;
  remaining: number;
  status: string;
  reserved_asset?: string;
  reserved_amt?: number;
  created_at?: string;
  updated_at?: string;
};

export type ApiFill = {
  id: string;
  pair: string;
  price: number;
  qty: number;
  quote: number;
  taker_order_id?: string;
  maker_order_id?: string;
  taker_account?: string;
  maker_account?: string;
  /** Relative role for viewer when counterparty is redacted (API-002). */
  role?: "taker" | "maker";
  taker_side?: string;
  taker_fee_quote?: number;
  maker_fee_quote?: number;
  /** Minor units when fee paid in HMC (−discount path). */
  taker_fee_hmc?: number;
  maker_fee_hmc?: number;
  created_at?: string;
};

export type PlaceOrderResponse = {
  ok: true;
  order: ApiOrder;
  fills: ApiFill[];
};

export type OrderSubmitBody = {
  pair: string;
  side: string;
  type: string;
  qty: number;
  price?: number;
  stop_price?: number;
  stop_limit_price?: number;
  trail_bps?: number;
  trail_pct?: number;
  /** Optional — when API supports server-side HMC fee-pay (−discount). Never an admin token. */
  pay_fee_in_hmc?: boolean;
  /** Limit only — reject if would immediately take. */
  post_only?: boolean;
  /** Limit only — GTC | IOC | FOK. */
  time_in_force?: "GTC" | "IOC" | "FOK";
};

const CSRF_STORAGE_KEY = "hackme-ex-lab-csrf";
const ADDR_STORAGE_KEY = "hackme-ex-lab-address";

let sessionCsrf = "";
let sessionAddress = "";

export function getLabSessionMeta(): { address: string; hasCsrf: boolean } {
  if (typeof sessionStorage !== "undefined") {
    if (!sessionAddress) sessionAddress = sessionStorage.getItem(ADDR_STORAGE_KEY) ?? "";
    // CSRF stays memory-only; clear any legacy stored CSRF from older builds.
    try {
      sessionStorage.removeItem(CSRF_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return { address: sessionAddress, hasCsrf: !!sessionCsrf };
}

/** UI helper — address without CSRF after reload is stale (must reconnect). */
export function labSessionLabel(): { live: boolean; address: string; label: string } {
  const { address, hasCsrf } = getLabSessionMeta();
  if (hasCsrf && address) {
    return { live: true, address, label: address };
  }
  if (address) {
    return {
      live: false,
      address,
      label: `${address} · reconnect required`,
    };
  }
  return { live: false, address: "", label: "not connected" };
}

export function clearLabSessionMeta(): void {
  sessionCsrf = "";
  sessionAddress = "";
  try {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
    sessionStorage.removeItem(ADDR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function persistSession(address: string, csrf: string): void {
  sessionAddress = address;
  sessionCsrf = csrf;
  try {
    // Address only — never persist CSRF in sessionStorage (XSS→credentialed lab API).
    sessionStorage.setItem(ADDR_STORAGE_KEY, address);
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function exchangeApiBase(): string {
  const configured = INTEGRATION.exchangeApiOrigin.replace(/\/$/, "");
  if (!configured) return "";
  if (typeof window !== "undefined") {
    const page = window.location.origin.replace(/\/$/, "");
    // Vite dev (:5199) and preview — same-origin proxy, avoids direct :18443 spam.
    if (page !== configured && isLoopbackOrigin(page)) {
      return `${page}/exchange-api`;
    }
  }
  return configured;
}

function resolveBase(baseOverride?: string): string {
  return (baseOverride ?? exchangeApiBase()).replace(/\/$/, "");
}

function apiUrl(path: string, baseOverride?: string): string | null {
  const base = resolveBase(baseOverride);
  if (!base) return null;
  // Always enforce loopback — reject attacker/mis-set overrides.
  if (!isLoopbackOrigin(base)) return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

const disabled = (): ExchangeApiError => ({
  ok: false,
  status: 0,
  code: "disabled",
  message: "lab API not enabled",
});


async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function asError(status: number, body: unknown, fallback: string): ExchangeApiError {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const errObj = o.error && typeof o.error === "object" ? (o.error as Record<string, unknown>) : null;
  const errStr = typeof o.error === "string" ? o.error : undefined;
  const src = errObj ?? o;
  const message = String(
    (errObj && (errObj.message ?? errObj.error)) ??
      errStr ??
      o.message ??
      fallback,
  );
  return {
    ok: false,
    status,
    code: String(src.code ?? o.code ?? `http_${status}`),
    message,
  };
}

/** Human-readable order/API reject for ticket / toast (code + message). */
export function formatExchangeReject(err: ExchangeApiError): string {
  const code = (err.code || "").trim();
  const msg = (err.message || "").trim();
  const friendly: Record<string, string> = {
    insufficient_balance: "Insufficient balance",
    insufficient_hmc_fee: "Insufficient HMC for fee",
    min_notional: "Below minimum notional",
    price_band: "Price outside allowed band",
    post_only: "Post-only would take liquidity",
    fok_unfilled: "FOK cannot be fully filled",
    unsupported_type: "Order type not supported on lab API",
    csrf_failed: "Session CSRF failed — reconnect DEMO/LAB",
    session_revoked: "Session revoked — reconnect DEMO/LAB",
    unauthorized: "Unauthorized — reconnect or check credentials",
    rate_limited: "Rate limited — retry shortly",
    convert_failed: "Convert rejected",
    convert_inventory: "Convert inventory low — try smaller size or Spot",
    convert_mint_disabled: "Convert mint disabled — inventory required",
    no_mid: "No seed mid for this pair",
    unknown_pair: "Unsupported convert / trade pair",
    hmc_price_unavailable: "HMC mid unavailable for fee conversion",
    too_many_open: "Too many open orders",
    invalid_order: "Invalid order",
    invalid_destination: "Invalid destination address",
  };
  if (code && msg) {
    const soft = code.replace(/_/g, " ");
    const msgLc = msg.toLowerCase();
    const softLc = soft.toLowerCase();
    // API already sent a human sentence that starts with the soft code — prefer it.
    if (msgLc === softLc || msgLc.startsWith(softLc) || msgLc.startsWith(code.toLowerCase())) {
      return friendly[code] && msgLc === softLc ? friendly[code]! : msg;
    }
    return `${code}: ${msg}`;
  }
  if (friendly[code] && !msg) return friendly[code]!;
  return msg || code || (err.status ? `request rejected (${err.status})` : "request rejected");
}

/**
 * POST /convert — lab convert at seed/default mid (never BBO/last alone) + VIP taker fee.
 * Session+CSRF only; never sends admin token.
 */
export async function postLabConvert(
  body: {
    from: string;
    to: string;
    amount: number;
    pay_fee_in_hmc?: boolean;
  },
  timeoutMs = 8_000,
  baseOverride?: string,
): Promise<
  | {
      ok: true;
      got: number;
      net_to?: number;
      mid?: number;
      fee_quote?: number;
      fee_hmc?: number;
      fee_bps?: number;
      paid_in_hmc?: boolean;
      warning?: string;
    }
  | ExchangeApiError
> {
  const url = apiUrl("/convert", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: csrfHeaders(true),
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    const parsed = await parseJson(res);
    if (!res.ok) return asError(res.status, parsed, "convert failed");
    const data = parsed as {
      got?: number;
      amount_to?: number;
      net_to?: number;
      mid?: number;
      fee_quote?: number;
      fee_hmc?: number;
      fee_bps?: number;
      paid_in_hmc?: boolean;
      warning?: string;
    };
    const got = Number(data.got ?? data.amount_to ?? 0);
    if (!(got > 0)) {
      return { ok: false, status: res.status, code: "convert_failed", message: "convert returned no amount" };
    }
    return {
      ok: true,
      got,
      net_to: data.net_to != null ? Number(data.net_to) : undefined,
      mid: data.mid != null ? Number(data.mid) : undefined,
      fee_quote: data.fee_quote,
      fee_hmc: data.fee_hmc,
      fee_bps: data.fee_bps,
      paid_in_hmc: data.paid_in_hmc,
      warning: data.warning,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** GET /convert/quote — server mid/fee preview (aligns SPA with ConvertMid). */
export async function getLabConvertQuote(
  body: {
    from: string;
    to: string;
    amount: number;
    pay_fee_in_hmc?: boolean;
  },
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<
  | {
      ok: true;
      got: number;
      net_to: number;
      mid: number;
      fee_quote: number;
      fee_hmc: number;
      fee_bps: number;
      paid_in_hmc: boolean;
    }
  | ExchangeApiError
> {
  const q = new URLSearchParams({
    from: body.from,
    to: body.to,
    amount: String(Math.trunc(body.amount)),
  });
  if (body.pay_fee_in_hmc) q.set("pay_fee_in_hmc", "1");
  const url = apiUrl(`/convert/quote?${q}`, baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(url, { method: "GET", mode: "cors", credentials: "include", cache: "no-store" }, timeoutMs);
    const parsed = await parseJson(res);
    if (!res.ok) return asError(res.status, parsed, "convert quote failed");
    const data = parsed as {
      got?: number;
      net_to?: number;
      mid?: number;
      fee_quote?: number;
      fee_hmc?: number;
      fee_bps?: number;
      paid_in_hmc?: boolean;
    };
    const got = Number(data.got ?? 0);
    const mid = Number(data.mid ?? 0);
    if (!(got > 0) || !(mid > 0)) {
      return { ok: false, status: res.status, code: "convert_failed", message: "empty convert quote" };
    }
    return {
      ok: true,
      got,
      net_to: Number(data.net_to ?? got),
      mid,
      fee_quote: Number(data.fee_quote ?? 0),
      fee_hmc: Number(data.fee_hmc ?? 0),
      fee_bps: Number(data.fee_bps ?? 0),
      paid_in_hmc: !!data.paid_in_hmc,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function exchangeHealth(
  timeoutMs = 2_500,
  baseOverride?: string,
): Promise<HealthResponse | ExchangeApiError> {
  const url = apiUrl("/health", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(url, { cache: "no-store", mode: "cors" }, timeoutMs);
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "health failed");
    return body as HealthResponse;
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function authChallenge(
  address: string,
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<ChallengeResponse | ExchangeApiError> {
  const url = apiUrl("/auth/challenge", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ address }),
      },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "challenge failed");
    return body as ChallengeResponse;
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function authVerify(
  payload: {
    challenge_id: string;
    address: string;
    pubkey_ed25519: string;
    sig_ed25519: string;
  },
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<VerifyResponse | ExchangeApiError> {
  const url = apiUrl("/auth/verify", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "verify failed");
    const ok = body as VerifyResponse;
    if (ok.csrf_token) persistSession(ok.address, ok.csrf_token);
    return ok;
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function authLogout(
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<{ ok: true } | ExchangeApiError> {
  const url = apiUrl("/auth/logout", baseOverride);
  if (!url) return disabled();
  getLabSessionMeta();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sessionCsrf) headers["X-CSRF-Token"] = sessionCsrf;
  try {
    const res = await fetchWithTimeout(
      url,
      { method: "POST", mode: "cors", credentials: "include", headers },
      timeoutMs,
    );
    const body = await parseJson(res);
    clearLabSessionMeta();
    if (!res.ok) return asError(res.status, body, "logout failed");
    return { ok: true };
  } catch (e) {
    clearLabSessionMeta();
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** POST /auth/revoke-all — invalidate all sessions (version bump + current jti). */
export async function authRevokeAll(
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<{ ok: true; session_version?: number } | ExchangeApiError> {
  const url = apiUrl("/auth/revoke-all", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { method: "POST", mode: "cors", credentials: "include", headers: csrfHeaders() },
      timeoutMs,
    );
    const body = await parseJson(res);
    clearLabSessionMeta();
    if (!res.ok) return asError(res.status, body, "revoke-all failed");
    const o = body as { session_version?: number };
    return { ok: true, session_version: o.session_version };
  } catch (e) {
    clearLabSessionMeta();
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type ApiWithdraw = {
  id: string;
  account?: string;
  asset: string;
  amount: number;
  fee?: number;
  destination: string;
  status: string;
  tx_id?: string;
  fail_reason?: string;
  created_at?: string;
  updated_at?: string;
};

export type DepositAddressResponse = {
  ok: true;
  account_address: string;
  asset: string;
  deposit_address: string;
  kind: string;
  bridge_model?: string;
  warning?: string;
};

/** GET /deposit/address?asset= */
export async function fetchDepositAddress(
  asset: string,
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<DepositAddressResponse | ExchangeApiError> {
  const q = encodeURIComponent(String(asset || "").toUpperCase());
  const url = apiUrl(`/deposit/address?asset=${q}`, baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { cache: "no-store", mode: "cors", credentials: "include", headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "deposit address failed");
    return body as DepositAddressResponse;
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** POST /withdraw — request only; admin complete is CLI/API (never SPA admin token). */
export async function requestWithdraw(
  body: { asset: string; amount: number; destination: string; totp_code?: string; client_withdraw_id?: string },
  timeoutMs = 8_000,
  baseOverride?: string,
): Promise<
  { ok: true; withdraw: ApiWithdraw; fee_quote?: CustodyFeeQuote; warning?: string } | ExchangeApiError
> {
  const url = apiUrl("/withdraw", baseOverride);
  if (!url) return disabled();
  try {
    const headers = csrfHeaders(true);
    const payload = {
      ...body,
      client_withdraw_id:
        body.client_withdraw_id?.trim() ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `withdraw-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    };
    if (payload.totp_code) headers["X-2FA-Code"] = payload.totp_code;
    const send = async (outgoing: typeof payload | typeof body) =>
      fetchWithTimeout(
        url,
        {
          method: "POST",
          mode: "cors",
          credentials: "include",
          headers,
          body: JSON.stringify(outgoing),
        },
        timeoutMs,
      );
    let res = await send(payload);
    let parsed = await parseJson(res);
    if (!res.ok) {
      const err = asError(res.status, parsed, "withdraw failed");
      const legacyServer =
        "client_withdraw_id" in payload &&
        err.code === "invalid_json" &&
        /invalid request body/i.test(err.message);
      if (!legacyServer) return err;
      res = await send(body);
      parsed = await parseJson(res);
      if (!res.ok) return asError(res.status, parsed, "withdraw failed");
    }
    const data = parsed as { withdraw: ApiWithdraw; fee_quote?: CustodyFeeQuote; warning?: string };
    return { ok: true, withdraw: data.withdraw, fee_quote: data.fee_quote, warning: data.warning };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type CustodyFeeQuote = {
  side: string;
  asset: string;
  amount: number;
  fee: number;
  receive: number;
  debit_total: number;
  note?: string;
  paused?: boolean;
};

/** GET /fees/custody — schedule + optional quote. */
export async function fetchCustodyFees(
  params?: { side?: string; asset?: string; amount?: number },
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<
  | {
      ok: true;
      schedule: Array<Record<string, unknown>>;
      quote?: CustodyFeeQuote;
      deposit_enabled: boolean;
      withdraw_enabled: boolean;
      custody_fees_on: boolean;
    }
  | ExchangeApiError
> {
  const q = new URLSearchParams();
  if (params?.side) q.set("side", params.side);
  if (params?.asset) q.set("asset", params.asset);
  if (params?.amount != null && params.amount > 0) q.set("amount", String(Math.trunc(params.amount)));
  const qs = q.toString();
  const url = apiUrl(`/fees/custody${qs ? `?${qs}` : ""}`, baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { cache: "no-store", mode: "cors", credentials: "include", headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "custody fees failed");
    const data = body as {
      schedule?: Array<Record<string, unknown>>;
      quote?: CustodyFeeQuote;
      deposit_enabled?: boolean;
      withdraw_enabled?: boolean;
      custody_fees_on?: boolean;
    };
    return {
      ok: true,
      schedule: data.schedule ?? [],
      quote: data.quote,
      deposit_enabled: data.deposit_enabled !== false,
      withdraw_enabled: data.withdraw_enabled !== false,
      custody_fees_on: data.custody_fees_on !== false,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** GET /withdrawals */
export async function listWithdrawals(
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<{ ok: true; withdrawals: ApiWithdraw[] } | ExchangeApiError> {
  const url = apiUrl("/withdrawals", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { cache: "no-store", mode: "cors", credentials: "include", headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "list withdrawals failed");
    const list = (body as { withdrawals?: ApiWithdraw[] }).withdrawals ?? [];
    return { ok: true, withdrawals: list };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * POST /lab/deposit — credit authenticated session wallet (any asset the API allows).
 * No address mapping. Never sends admin token.
 */
export async function postLabDeposit(
  body: { asset: "HMC" | "USDT" | "BTC" | "SUP"; amount: number; tx_id?: string; reason?: string },
  timeoutMs = 8_000,
  baseOverride?: string,
): Promise<{ ok: true; balance_after?: number } | ExchangeApiError> {
  const url = apiUrl("/lab/deposit", baseOverride);
  if (!url) return disabled();
  try {
    const payload = {
      asset: body.asset,
      amount: body.amount,
      reason: body.reason?.trim() || "spa_lab_mint",
      tx_id:
        body.tx_id?.trim() ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `labdep-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    };
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: csrfHeaders(true),
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );
    const parsed = await parseJson(res);
    if (!res.ok) return asError(res.status, parsed, "lab deposit failed");
    const data = parsed as { balance_after?: number };
    return { ok: true, balance_after: data.balance_after };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * POST /lab/bridge-credit — paper USDT/BTC only (lab stub address).
 * Not a real chain bridge. Never sends admin token.
 */
export async function postLabBridgeCredit(
  body: { asset: "USDT" | "BTC"; amount: number; tx_id?: string },
  timeoutMs = 8_000,
  baseOverride?: string,
): Promise<
  | { ok: true; balance_after: number; deposit_address: string; warning?: string; bridge_model?: string }
  | ExchangeApiError
> {
  const url = apiUrl("/lab/bridge-credit", baseOverride);
  if (!url) return disabled();
  try {
    const payload = {
      asset: body.asset,
      amount: body.amount,
      tx_id:
        body.tx_id?.trim() ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    };
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: csrfHeaders(true),
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );
    const parsed = await parseJson(res);
    if (!res.ok) return asError(res.status, parsed, "bridge-credit failed");
    const data = parsed as {
      balance_after: number;
      deposit_address: string;
      warning?: string;
      bridge_model?: string;
    };
    return {
      ok: true,
      balance_after: data.balance_after,
      deposit_address: data.deposit_address,
      warning: data.warning,
      bridge_model: data.bridge_model,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function fetchExchangeBalances(
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<(BalancesResponse & { ok: true }) | ExchangeApiError> {
  const url = apiUrl("/balances", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { cache: "no-store", mode: "cors", credentials: "include", headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "balances failed");
    const data = body as BalancesResponse;
    return { ok: true, ...data };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

function csrfHeaders(json = false): Record<string, string> {
  getLabSessionMeta();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (json) headers["Content-Type"] = "application/json";
  if (sessionCsrf) headers["X-CSRF-Token"] = sessionCsrf;
  return headers;
}

/**
 * POST /orders — lab matching (limit/market). Requires session + CSRF.
 * Body uses integer minors: qty = base×1e8, price = quote-minor per 1 whole base.
 */
export async function postExchangeOrder(
  body: OrderSubmitBody,
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<(PlaceOrderResponse & { status: number }) | ExchangeApiError> {
  const url = apiUrl("/orders", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: csrfHeaders(true),
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    const parsed = await parseJson(res);
    if (res.status === 501) {
      return asError(501, parsed, "matching engine not enabled");
    }
    if (!res.ok) return asError(res.status, parsed, "order rejected");
    const data = parsed as PlaceOrderResponse;
    return {
      ok: true,
      status: res.status,
      order: data.order,
      fills: Array.isArray(data.fills) ? data.fills : [],
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listExchangeOrders(
  pairApi?: string,
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<{ ok: true; orders: ApiOrder[] } | ExchangeApiError> {
  const q = pairApi ? `?pair=${encodeURIComponent(pairApi)}` : "";
  const url = apiUrl(`/orders${q}`, baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { cache: "no-store", mode: "cors", credentials: "include", headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "list orders failed");
    const orders = (body as { orders?: ApiOrder[] }).orders ?? [];
    return { ok: true, orders };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function cancelExchangeOrder(
  orderId: string,
  timeoutMs = 5_000,
  baseOverride?: string,
): Promise<{ ok: true; order: ApiOrder } | ExchangeApiError> {
  const url = apiUrl(`/orders/${encodeURIComponent(orderId)}`, baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { method: "DELETE", mode: "cors", credentials: "include", headers: csrfHeaders() },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "cancel failed");
    const order = (body as { order: ApiOrder }).order;
    return { ok: true, order };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listExchangeFills(
  limit = 50,
  timeoutMs = 5_000,
  baseOverride?: string,
  pair?: string,
): Promise<{ ok: true; fills: ApiFill[]; source?: string } | ExchangeApiError> {
  const q = new URLSearchParams();
  q.set("limit", String(Math.max(1, Math.min(500, limit))));
  if (pair) q.set("pair", pair);
  const url = apiUrl(`/fills?${q}`, baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { cache: "no-store", mode: "cors", credentials: "include", headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "list fills failed");
    const data = body as { fills?: ApiFill[]; source?: string };
    return { ok: true, fills: data.fills ?? [], source: data.source };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** L2 level from GET /book (integer minors). */
export type ApiBookLevel = {
  price: number;
  qty: number;
  n?: number;
};

export type BookResponse = {
  ok: true;
  pair: string;
  bids: ApiBookLevel[];
  asks: ApiBookLevel[];
  ts?: string;
  note?: string;
};

/** GET /book?pair= — public lab L2 snapshot (no session). Fast poll OK. */
export async function fetchExchangeBook(
  pairApi: string,
  timeoutMs = 3_000,
  baseOverride?: string,
): Promise<BookResponse | ExchangeApiError> {
  const q = encodeURIComponent(pairApi);
  const url = apiUrl(`/book?pair=${q}`, baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      { cache: "no-store", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } },
      timeoutMs,
    );
    const body = await parseJson(res);
    if (!res.ok) return asError(res.status, body, "book failed");
    const data = body as BookResponse;
    return {
      ok: true,
      pair: data.pair,
      bids: Array.isArray(data.bids) ? data.bids : [],
      asks: Array.isArray(data.asks) ? data.asks : [],
      ts: data.ts,
      note: data.note,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type LabCounterpartyResponse = {
  ok: true;
  warning?: string;
  bot_address: string;
  crossed_order_id: string;
  order: ApiOrder;
  fills: ApiFill[];
};

/**
 * POST /lab/counterparty — DEMO/LAB bot crosses a resting session order.
 * Requires session + CSRF. Self-trade still blocked (distinct bot account).
 */
export async function postLabCounterparty(
  body: { pair: string; order_id?: string; qty?: number },
  timeoutMs = 8_000,
  baseOverride?: string,
): Promise<(LabCounterpartyResponse & { status: number }) | ExchangeApiError> {
  const url = apiUrl("/lab/counterparty", baseOverride);
  if (!url) return disabled();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: csrfHeaders(true),
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    const parsed = await parseJson(res);
    if (!res.ok) return asError(res.status, parsed, "counterparty failed");
    const data = parsed as LabCounterpartyResponse;
    return {
      ok: true,
      status: res.status,
      warning: data.warning,
      bot_address: data.bot_address,
      crossed_order_id: data.crossed_order_id,
      order: data.order,
      fills: Array.isArray(data.fills) ? data.fills : [],
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "unreachable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Demo pair id `HMC_USDT` → API `HMC/USDT`. */
export function pairIdToApi(pairId: PairId | string): string {
  return String(pairId).replace(/_/g, "/").toUpperCase();
}

/** API `HMC/USDT` → demo `HMC_USDT` (or null if unknown). */
export function apiPairToId(pair: string): PairId | null {
  const id = String(pair || "")
    .trim()
    .toUpperCase()
    .replace(/\//g, "_");
  const known: PairId[] = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
  return (known as string[]).includes(id) ? (id as PairId) : null;
}

/** Display quote-per-base → API price (quote minor per 1 whole base). */
export function displayPriceToApi(displayPrice: number): number {
  if (!Number.isFinite(displayPrice) || displayPrice <= 0) return 0;
  return Math.round(displayPrice * MINOR_UNIT_SCALE);
}

export function apiPriceToDisplay(apiPrice: number): number {
  if (!Number.isFinite(apiPrice)) return 0;
  return apiPrice / MINOR_UNIT_SCALE;
}

/** Build POST /orders body from demo display units. */
export function buildPlaceOrderBody(
  pairId: PairId,
  side: OrderSide,
  type: "limit" | "market" | "stop_limit" | "stop_market" | "oco" | "trailing_stop",
  amountBase: number,
  priceDisplay?: number,
  stopDisplay?: number,
  opts?: {
    stopLimitDisplay?: number;
    trailPct?: number;
    payFeeInHmc?: boolean;
    postOnly?: boolean;
    timeInForce?: "GTC" | "IOC" | "FOK";
  },
): OrderSubmitBody | { error: string } {
  const qty = displayToMinor(amountBase);
  if (qty <= 0) return { error: "qty must be > 0" };
  const body: OrderSubmitBody = {
    pair: pairIdToApi(pairId),
    side,
    type,
    qty,
  };
  if (type === "limit" || type === "stop_limit" || type === "oco") {
    const price = displayPriceToApi(priceDisplay ?? 0);
    if (price <= 0) return { error: "limit price required" };
    body.price = price;
  } else if (type === "stop_market") {
    const stop = displayPriceToApi(stopDisplay ?? 0);
    if (stop <= 0) return { error: "stop price required" };
    body.stop_price = stop;
    if (side === "buy") {
      const ceil = displayPriceToApi(priceDisplay ?? 0);
      if (ceil <= 0) return { error: "buy stop_market needs price ceiling" };
      body.price = ceil;
    } else if (priceDisplay != null && priceDisplay > 0) {
      body.price = displayPriceToApi(priceDisplay);
    }
  } else if (type === "trailing_stop") {
    // Optional limit child; mark is server-side. Trail % required.
    const trail = opts?.trailPct ?? 0;
    if (!(trail > 0)) return { error: "trail % required" };
    body.trail_pct = trail;
    if (priceDisplay != null && priceDisplay > 0) {
      body.price = displayPriceToApi(priceDisplay);
    }
  } else if (side === "buy") {
    const price = displayPriceToApi(priceDisplay ?? 0);
    if (price <= 0) return { error: "market buy needs price ceiling" };
    body.price = price;
  } else if (priceDisplay != null && priceDisplay > 0) {
    body.price = displayPriceToApi(priceDisplay);
  }
  if (type === "stop_limit" || type === "oco") {
    const stop = displayPriceToApi(stopDisplay ?? 0);
    if (stop <= 0) return { error: "stop price required" };
    body.stop_price = stop;
  }
  if (type === "oco") {
    const sl = displayPriceToApi(opts?.stopLimitDisplay ?? stopDisplay ?? 0);
    if (sl > 0) body.stop_limit_price = sl;
  }
  // Wire optional HMC fee-pay flag for sibling API; ignored until server supports it.
  // Never send admin tokens on this path.
  if (opts?.payFeeInHmc) body.pay_fee_in_hmc = true;
  // Limit TIF / post-only — server enforces; stop types ignore these fields.
  if (type === "limit") {
    if (opts?.postOnly) body.post_only = true;
    const tif = opts?.timeInForce;
    if (tif && tif !== "GTC") body.time_in_force = tif;
  }
  return body;
}

/** Integer minor units (1e8) → display float. */
export function minorToDisplay(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return minor / MINOR_UNIT_SCALE;
}

export function displayToMinor(display: number): number {
  if (!Number.isFinite(display)) return 0;
  return Math.round(display * MINOR_UNIT_SCALE);
}

export function balancesToWalletPartial(balances: BalanceRow[]): Partial<Wallet> {
  const out: Partial<Wallet> = {};
  for (const row of balances) {
    const asset = String(row.asset || "").toUpperCase();
    const avail = typeof row.available === "number" ? row.available : Number(row.amount ?? 0);
    const display = minorToDisplay(avail);
    if (asset === "USDT") out.usdt = display;
    else if (asset === "HMC") out.hmc = display;
    else if (asset === "SUP") out.sup = display;
    else if (asset === "BTC") out.btc = display;
  }
  return out;
}

/** Merge server balances into demo wallet.
 * Lab session: server is authoritative — missing assets become 0 (no paper inflate).
 */
export function mergeApiBalancesIntoWallet(demo: Wallet, balances: BalanceRow[], opts?: { labAuthoritative?: boolean }): Wallet {
  const partial = balancesToWalletPartial(balances);
  const lab = !!opts?.labAuthoritative;
  return {
    usdt: partial.usdt ?? (lab ? 0 : demo.usdt),
    hmc: partial.hmc ?? (lab ? 0 : demo.hmc),
    sup: partial.sup ?? (lab ? 0 : demo.sup),
    btc: partial.btc ?? (lab ? 0 : demo.btc),
  };
}
