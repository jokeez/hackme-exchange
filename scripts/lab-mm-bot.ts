#!/usr/bin/env npx tsx
/**
 * Lab market-maker bot skeleton — DEMO/LAB ONLY.
 *
 * Polls loopback exchange-api and refreshes seed ladders via POST /lab/mm/seed
 * when the HMC/USDT book is thin (or on a fixed interval). Does not place
 * proprietary quotes; the API MM account owns the book.
 *
 * Soft-launch target (server defaults):
 *   ~3–5k HMC on asks, ~$5–15 USDT credit pad, inner spread ~0.5–2%.
 *
 *   cd hackme-exchange-demo && npx tsx scripts/lab-mm-bot.ts
 *   EXCHANGE_MM_BOT_ONCE=1 npx tsx scripts/lab-mm-bot.ts   # single refresh then exit
 *   EXCHANGE_MM_BOT_EVERY=15s npx tsx scripts/lab-mm-bot.ts
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const API = process.env.EXCHANGE_API_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:18443";
const PAIR = (process.env.EXCHANGE_MM_BOT_PAIR || "HMC/USDT").toUpperCase();
const EVERY_MS = parseEveryMs(process.env.EXCHANGE_MM_BOT_EVERY || "30s");
const MIN_PER_SIDE = Math.max(1, Number(process.env.EXCHANGE_MM_BOT_MIN_SIDE || "3") || 3);
const ONCE = truthy(process.env.EXCHANGE_MM_BOT_ONCE);
const SEED =
  process.env.EXCHANGE_MM_BOT_SEED ||
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

const jar = new Map<string, string>();

function truthy(v: string | undefined): boolean {
  const s = (v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function parseEveryMs(raw: string): number {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/i);
  if (!m) return 30_000;
  const n = Number(m[1]);
  const u = (m[2] || "s").toLowerCase();
  if (u === "ms") return Math.max(1_000, n);
  if (u === "m") return Math.max(1_000, n * 60_000);
  return Math.max(1_000, n * 1_000);
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
function addrFromPub(pub: Uint8Array): string {
  return `HMC-${bytesToHex(sha256(pub)).slice(0, 16)}`;
}

function noteCookies(res: Response): void {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const one = res.headers.get("set-cookie");
  if (one && !raw.length) {
    for (const part of one.split(/,(?=[^;]+?=)/)) {
      const [pair] = part.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api(
  path: string,
  init: RequestInit & { json?: unknown; csrf?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.csrf) headers["X-CSRF-Token"] = init.csrf;
  const cookie = cookieHeader();
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  noteCookies(res);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function login(): Promise<{ address: string; csrf: string }> {
  const seed = hexToBytes(SEED);
  const pub = await ed.getPublicKey(seed);
  const address = addrFromPub(pub);
  const pubkeyHex = bytesToHex(pub);
  const ch = await api("/auth/challenge", { method: "POST", json: { address } });
  if (ch.status !== 200 || !ch.body?.challenge_id || !ch.body?.message) {
    throw new Error(`challenge failed: ${ch.status} ${JSON.stringify(ch.body)}`);
  }
  const sig = bytesToHex(await ed.sign(new TextEncoder().encode(String(ch.body.message)), seed));
  const ver = await api("/auth/verify", {
    method: "POST",
    json: {
      challenge_id: ch.body.challenge_id,
      address,
      pubkey_ed25519: pubkeyHex,
      sig_ed25519: sig,
    },
  });
  if (ver.status !== 200 || !ver.body?.ok) {
    throw new Error(`verify failed: ${ver.status} ${JSON.stringify(ver.body)}`);
  }
  const csrf = ver.body?.csrf_token || jar.get("exchange_csrf") || "";
  if (!csrf) throw new Error("missing CSRF after verify");
  return { address, csrf };
}

type BookSide = { price?: number; qty?: number; Price?: number; Qty?: number };

function sideLen(levels: BookSide[] | undefined): number {
  return Array.isArray(levels) ? levels.length : 0;
}

async function bookThin(): Promise<{ thin: boolean; bids: number; asks: number }> {
  const pair = PAIR === "ALL" ? "HMC/USDT" : PAIR;
  const b = await api(`/book?pair=${encodeURIComponent(pair)}`);
  if (b.status !== 200) {
    return { thin: true, bids: 0, asks: 0 };
  }
  const bids = sideLen(b.body?.bids);
  const asks = sideLen(b.body?.asks);
  return { thin: bids < MIN_PER_SIDE || asks < MIN_PER_SIDE, bids, asks };
}

async function refresh(csrf: string, pair: string): Promise<void> {
  const body = pair && pair !== "ALL" ? { pair } : {};
  const r = await api("/lab/mm/seed", {
    method: "POST",
    csrf,
    json: body,
  });
  if (r.status !== 200 || !r.body?.ok) {
    throw new Error(`mm seed failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const placed = r.body?.orders_placed ?? r.body?.placed;
  console.log(`[mm-bot] reseeded ${pair || "ALL"} placed=${JSON.stringify(placed)} mm=${r.body?.mm_address}`);
}

async function tick(csrf: string, force: boolean): Promise<void> {
  const health = await api("/health");
  const mm = health.body?.lab_mm;
  if (health.status !== 200 || !mm?.enabled) {
    console.warn("[mm-bot] lab_mm disabled or health failed — skipping");
    return;
  }
  if (mm.profile) {
    const h = mm.hmc_usdt;
    if (h && force) {
      console.log(
        `[mm-bot] profile=${mm.profile} mid≈${h.mid_display} asks≈${h.ask_base_whole}HMC ` +
          `bid_quote≈${h.bid_quote_whole}USDT spread≈${h.inner_spread_bps}bps`,
      );
    }
  }
  const depth = await bookThin();
  if (!force && !depth.thin) {
    console.log(`[mm-bot] ${PAIR} ok bids=${depth.bids} asks=${depth.asks}`);
    return;
  }
  console.log(`[mm-bot] ${PAIR} thin bids=${depth.bids} asks=${depth.asks} → refresh`);
  await refresh(csrf, PAIR);
}

async function main(): Promise<number> {
  console.log(`Lab MM bot → ${API} pair=${PAIR} every=${EVERY_MS}ms once=${ONCE}\n`);
  const { address, csrf } = await login();
  console.log(`[mm-bot] session ${address}`);

  await tick(csrf, true);
  if (ONCE) return 0;

  for (;;) {
    await new Promise((r) => setTimeout(r, EVERY_MS));
    try {
      await tick(csrf, false);
    } catch (e) {
      console.error("[mm-bot] tick error:", e);
      // re-login on session expiry
      try {
        const again = await login();
        await tick(again.csrf, true);
      } catch (e2) {
        console.error("[mm-bot] re-login failed:", e2);
      }
    }
  }
}

main()
  .then((code) => {
    if (typeof code === "number") process.exit(code);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
