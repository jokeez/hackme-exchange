#!/usr/bin/env npx tsx
/**
 * Desk Connect smoke against same-origin /desk-api (or EXCHANGE_DESK_BASE).
 * Uses an ephemeral Ed25519 seed — not the lab fixture.
 * Matching must stay HOLD (book 503).
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { webcrypto } from "node:crypto";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const BASE = (process.env.EXCHANGE_DESK_BASE || "https://exchange.hackme.tech/desk-api").replace(/\/$/, "");

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const pub = ed.getPublicKey(seed);
  const addr = `HMC-${hex(sha256(pub)).slice(0, 16)}`;
  const jar = new Map<string, string>();

  const parseSetCookie = (res: Response) => {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const health = await fetch(`${BASE}/health`);
  const hj = (await health.json()) as {
    matching?: string;
    deposit?: { enabled?: boolean };
    withdraw?: { enabled?: boolean };
  };
  if (hj.matching !== "disabled") throw new Error(`matching not HOLD: ${hj.matching}`);
  if (hj.deposit?.enabled) throw new Error("deposit enabled");
  if (hj.withdraw?.enabled) throw new Error("withdraw enabled");
  console.log("PASS  health HOLD (matching/deposit/withdraw)");

  const chRes = await fetch(`${BASE}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://exchange.hackme.tech" },
    body: JSON.stringify({ address: addr }),
  });
  const ch = (await chRes.json()) as { challenge_id: string; message: string; code?: string };
  if (!chRes.ok) throw new Error(`challenge ${chRes.status} ${JSON.stringify(ch)}`);
  console.log("PASS  challenge");

  const sig = hex(ed.sign(new TextEncoder().encode(ch.message), seed));
  const verRes = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://exchange.hackme.tech" },
    body: JSON.stringify({
      challenge_id: ch.challenge_id,
      address: addr,
      pubkey_ed25519: hex(pub),
      sig_ed25519: sig,
    }),
  });
  parseSetCookie(verRes);
  const ver = (await verRes.json()) as { ok?: boolean; csrf_token?: string; code?: string };
  if (!verRes.ok || !ver.ok || !ver.csrf_token) throw new Error(`verify ${verRes.status} ${JSON.stringify(ver)}`);
  console.log("PASS  verify + csrf");

  const balRes = await fetch(`${BASE}/balances`, {
    headers: {
      Origin: "https://exchange.hackme.tech",
      Cookie: cookieHeader(),
      "X-CSRF-Token": ver.csrf_token,
    },
  });
  if (balRes.status !== 200) throw new Error(`balances ${balRes.status}`);
  console.log("PASS  balances");

  const bookRes = await fetch(`${BASE}/book?pair=HMC/USDT`);
  const matchingGo = process.env.EX_MATCHING_GO === "1";
  if (matchingGo) {
    if (bookRes.status !== 200) throw new Error(`matching GO: book want 200 got ${bookRes.status}`);
    console.log("PASS  book 200 (EX_MATCHING_GO=1)");
  } else {
    if (bookRes.status !== 503) throw new Error(`book want 503 got ${bookRes.status}`);
    console.log("PASS  book 503 HOLD");
  }

  // Place must stay blocked while HOLD (even with valid session+CSRF).
  if (!matchingGo) {
    const placeRes = await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://exchange.hackme.tech",
        Cookie: cookieHeader(),
        "X-CSRF-Token": ver.csrf_token!,
      },
      body: JSON.stringify({
        pair: "HMC/USDT",
        side: "buy",
        type: "limit",
        price: 5_000_000,
        qty: 100_000_000,
      }),
    });
    if (placeRes.status !== 503) throw new Error(`place HOLD want 503 got ${placeRes.status}`);
    console.log("PASS  place 503 HOLD");

    const loNoCsrf = await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: {
        Origin: "https://exchange.hackme.tech",
        Cookie: cookieHeader(),
      },
    });
    if (loNoCsrf.status !== 403) throw new Error(`logout without CSRF want 403 got ${loNoCsrf.status}`);
    console.log("PASS  logout CSRF required");
  }

  const loRes = await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: {
      Origin: "https://exchange.hackme.tech",
      Cookie: cookieHeader(),
      "X-CSRF-Token": ver.csrf_token!,
    },
  });
  if (!loRes.ok) throw new Error(`logout ${loRes.status}`);
  console.log("PASS  logout");

  const balAfter = await fetch(`${BASE}/balances`, {
    headers: {
      Origin: "https://exchange.hackme.tech",
      Cookie: cookieHeader(),
      "X-CSRF-Token": ver.csrf_token!,
    },
  });
  if (balAfter.status === 200) throw new Error("balances still authorized after logout");
  console.log("PASS  balances unauthorized after logout");

  console.log(`[desk-connect-smoke] OK — ${BASE} · ${addr}`);
}

main().catch((e) => {
  console.error("[desk-connect-smoke] FAIL", e);
  process.exit(1);
});
