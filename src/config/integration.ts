/** Runtime integration targets — override via Vite env at build time. */

import { isLoopbackOrigin, sanitizeHttpUrl } from "../sanitize";

export type IntegrationMode = "demo" | "paper" | "live" | "lab";

export type IntegrationConfig = {
  mode: IntegrationMode;
  /** Public site + oracle APIs */
  hubOrigin: string;
  /** Spot UI deploy target (future) */
  exchangeOrigin: string;
  /**
   * Optional private-lab exchange-api origin (loopback only).
   * Empty = paper/demo localStorage only — no API wiring for everyone.
   */
  exchangeApiOrigin: string;
  /** Local hackme-node dashboard + wallet APIs */
  nodeOrigin: string;
  /** Pool coordinator (oracle) */
  poolCoordinatorOrigin: string;
  /**
   * Optional admin token for loopback wallet sync only.
   * Never set for public builds — Vite inlines VITE_* into the client bundle.
   */
  adminToken?: string;
};

function env(key: string, fallback: string): string {
  const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key];
  return (v && v.trim()) || fallback;
}

const RAW_MODE = parseModeRaw(env("VITE_INTEGRATION_MODE", "paper"));

function parseModeRaw(raw: string): IntegrationMode {
  if (raw === "paper" || raw === "live" || raw === "demo" || raw === "lab") return raw;
  return "paper";
}

/**
 * Effective UI mode.
 * - live → paper (isLiveMode stays false until public go-live)
 * - lab → paper chrome + enables loopback API wiring when origin set/defaulted
 */
function effectiveMode(raw: IntegrationMode): IntegrationMode {
  if (raw === "live") {
    if (typeof console !== "undefined") {
      console.warn(
        "[hackme-exchange] VITE_INTEGRATION_MODE=live is blocked for public/production; running as paper. Use lab + VITE_EXCHANGE_API_ORIGIN for private API wiring.",
      );
    }
    return "paper";
  }
  if (raw === "lab") return "paper";
  return raw;
}

const nodeOrigin = sanitizeHttpUrl(env("VITE_NODE_ORIGIN", "http://127.0.0.1:8080"), "http://127.0.0.1:8080");
const rawLabFlag = env("VITE_LAB_API", "");
const rawApiOrigin = env("VITE_EXCHANGE_API_ORIGIN", "");

const isVitest =
  !!(import.meta as ImportMeta & { env?: { VITEST?: boolean; MODE?: string } }).env?.VITEST ||
  (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE === "test";
const isDev = !!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV;
/**
 * Never read VITE_HACKME_ADMIN_TOKEN — Vite would inline any .env value into the client
 * bundle. Admin auth stays CLI/node-only (X-Hackme-Admin-Token / X-Admin-Token).
 */
/** Vite dev proxy only in browser — not in vitest (happy-dom has no proxy on :3000). */
const useDevProxy = isDev && !isVitest && typeof window !== "undefined";
const defaultHub = useDevProxy ? `${window.location.origin}/hub-proxy` : "https://hackme.tech";
const defaultPool = useDevProxy
  ? `${window.location.origin}/pool-proxy`
  : "https://hackme.tech/pool/coordinator";

/** Opt-in lab API: explicit origin, VITE_LAB_API=1, or INTEGRATION_MODE=lab. */
const wantsLabApi =
  RAW_MODE === "lab" ||
  rawLabFlag === "1" ||
  rawLabFlag.toLowerCase() === "true" ||
  !!rawApiOrigin.trim();

function resolveExchangeApiOrigin(): string {
  if (!wantsLabApi) return "";
  const candidate = sanitizeHttpUrl(
    rawApiOrigin.trim() || "http://127.0.0.1:18443",
    "http://127.0.0.1:18443",
  );
  if (!isLoopbackOrigin(candidate)) {
    if (typeof console !== "undefined") {
      console.warn(
        "[hackme-exchange] VITE_EXCHANGE_API_ORIGIN ignored — must be loopback (127.0.0.1/localhost). No public API wiring.",
      );
    }
    return "";
  }
  // Production *public* builds: still allow loopback for private lab preview on the same machine.
  // Never accept a non-loopback origin (already rejected above).
  return candidate;
}

export const INTEGRATION: IntegrationConfig = {
  mode: effectiveMode(RAW_MODE),
  hubOrigin: sanitizeHttpUrl(env("VITE_HUB_ORIGIN", defaultHub), defaultHub),
  exchangeOrigin: sanitizeHttpUrl(
    env("VITE_EXCHANGE_ORIGIN", "https://exchange.hackme.tech"),
    "https://exchange.hackme.tech",
  ),
  exchangeApiOrigin: resolveExchangeApiOrigin(),
  nodeOrigin,
  poolCoordinatorOrigin: sanitizeHttpUrl(env("VITE_POOL_ORIGIN", defaultPool), defaultPool),
  adminToken: undefined,
};

export function isDemoMode(): boolean {
  return INTEGRATION.mode === "demo";
}

export function isPaperMode(): boolean {
  return INTEGRATION.mode === "paper";
}

/**
 * Public/production live settlement — always false.
 * Private lab uses isLabApiEnabled() without flipping this.
 */
export function isLiveMode(): boolean {
  return false;
}

/** True when build requested live but runtime blocks it. */
export function isLiveModeBlocked(): boolean {
  return RAW_MODE === "live";
}

/** True when operator opted into loopback exchange-api (auth/balances/orders client). */
export function isLabApiEnabled(): boolean {
  return !!INTEGRATION.exchangeApiOrigin;
}

/** Raw mode was lab (chrome may still say paper). */
export function isLabModeRequested(): boolean {
  return RAW_MODE === "lab" || wantsLabApi;
}

/** Short UI label for header / announce chrome. */
export function modeChromeLabel(): string {
  if (isLiveModeBlocked()) return "Live blocked — use paper/lab, not public live";
  if (isLabApiEnabled()) return "Lab API wiring (loopback) — DEMO/LAB only";
  switch (INTEGRATION.mode) {
    case "paper":
      return "Paper / synthetic — not real exchange";
    default:
      return "Demo / paper balances — not real exchange";
  }
}

/** Header pill text — never implies real CEX live trading. */
export function modeStatusPill(): string {
  if (isLiveModeBlocked()) return "⛔ Live blocked";
  if (isLabApiEnabled()) return "◎ Lab API · not public";
  return "◎ Paper / Synthetic";
}
