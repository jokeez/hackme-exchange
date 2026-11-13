/**
 * "Sign in with HackMe" — the exchange account is the miner's own HackMe wallet.
 *
 * The button opens the local HackMe dashboard (http://127.0.0.1:8080/exchange-login). The node
 * shows "Log in to exchange.hackme.tech as HMC-…?", and on approval asks the exchange for a login
 * challenge, signs it with the wallet key and sends the browser back to this page with
 *   #hm-login=v1.<challenge_id>.<address>.<pubkey_hex>.<sig_hex>
 * The node hard-codes that return URL, so a phishing page can open the dashboard but never
 * receive the signature. The fragment is never sent to a server and is wiped from the address
 * bar and history before anything else runs.
 */
import { authVerify } from "./adapters/exchangeApi";

const MODE_KEY = "hackme.desk.loginMode.v1";
const URL_KEY = "hackme.walletLogin.url.v1";
// Desktop nodes (Miner and Orders) serve the dashboard on 127.0.0.1:8080; 18080 is the hub's port.
export const DEFAULT_WALLET_LOGIN_URL = "http://127.0.0.1:8080/exchange-login";

/**
 * The signed fragment is captured and wiped when this module loads — before the app's first
 * render. The router rewrites the hash to #spot/<pair>/<tf> during boot, so reading it later (the
 * login used to run after boot) always found nothing and "Sign in with HackMe" never logged in.
 */
let bootLoginHash = "";
if (typeof window !== "undefined" && /hm-login=/.test(window.location.hash)) {
  bootLoginHash = window.location.hash;
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    window.location.hash = "";
  }
}

/**
 * The dashboard side ships with the next HackMe release (rc20). Until then the button stays
 * hidden; testers enable it with localStorage "hackme.walletLogin.enabled.v1" = "1".
 */
const WALLET_LOGIN_RELEASED = false;

export function walletLoginButtonEnabled(): boolean {
  if (WALLET_LOGIN_RELEASED) return true;
  try {
    return localStorage.getItem("hackme.walletLogin.enabled.v1") === "1";
  } catch {
    return false;
  }
}

export type WalletLoginPayload = {
  challengeId: string;
  address: string;
  pubkeyHex: string;
  sigHex: string;
};

const RE = {
  id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  addr: /^HMC-(?:[0-9a-f]{16}|[0-9a-f]{64})$/,
  pub: /^[0-9a-f]{64}$/,
  sig: /^[0-9a-f]{128}$/,
};

/** Parses `#hm-login=v1.<id>.<addr>.<pub>.<sig>`; null for anything else. */
export function parseWalletLoginHash(hash: string): WalletLoginPayload | null {
  const h = String(hash || "").replace(/^#/, "");
  const m = /(?:^|&)hm-login=([^&]+)/.exec(h);
  if (!m) return null;
  const parts = decodeURIComponent(m[1]!).split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, id, addr, pub, sig] = parts as [string, string, string, string, string];
  const p = { challengeId: id.toLowerCase(), address: addr.toLowerCase().replace(/^hmc-/, "HMC-"), pubkeyHex: pub.toLowerCase(), sigHex: sig.toLowerCase() };
  if (!RE.id.test(p.challengeId) || !RE.addr.test(p.address) || !RE.pub.test(p.pubkeyHex) || !RE.sig.test(p.sigHex)) return null;
  return p;
}

export function walletLoginUrl(): string {
  try {
    const custom = (localStorage.getItem(URL_KEY) || "").trim();
    // Only loopback dashboards: never send people to a remote "sign here" page.
    if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?\/exchange-login$/.test(custom)) return custom;
  } catch {
    /* ignore */
  }
  return DEFAULT_WALLET_LOGIN_URL;
}

export function isWalletLoginMode(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === "wallet";
  } catch {
    return false;
  }
}

export function setWalletLoginMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(MODE_KEY, "wallet");
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}

/** Opens the local dashboard confirmation page. */
export function startWalletLogin(): void {
  window.open(walletLoginUrl(), "_blank", "noopener");
}

/**
 * If the page was opened with a wallet-login fragment, wipe it and finish the login.
 * Returns null when there is nothing to do.
 */
export async function completeWalletLoginFromLocation(): Promise<{ ok: true; address: string } | { ok: false; message: string } | null> {
  if (typeof window === "undefined") return null;
  // Prefer the fragment captured at module load (already wiped from the URL); fall back to the
  // live hash for a same-page return.
  let hash = bootLoginHash;
  bootLoginHash = "";
  if (!/hm-login=/.test(hash)) {
    hash = window.location.hash;
    if (!/hm-login=/.test(hash)) return null;
    // Wipe first: the signed tuple must not linger in the URL bar, history or a shared link.
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      window.location.hash = "";
    }
  }
  const payload = parseWalletLoginHash(hash);
  if (!payload) return { ok: false, message: "HackMe login link is malformed — start again from the exchange" };
  const res = await authVerify({
    challenge_id: payload.challengeId,
    address: payload.address,
    pubkey_ed25519: payload.pubkeyHex,
    sig_ed25519: payload.sigHex,
    via: "hackme_wallet",
  });
  if (!res.ok) return { ok: false, message: res.message || "HackMe login was refused" };
  setWalletLoginMode(true);
  return { ok: true, address: res.address };
}
