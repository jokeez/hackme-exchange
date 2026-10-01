#!/usr/bin/env npx tsx
/**
 * Matching GO §3 acceptance against a LIVE matching desk (lab/staging ONLY).
 * Never point at public production while HOLD — use smoke:desk / smoke:matching-sec there.
 *
 *   EXCHANGE_DESK_BASE=http://127.0.0.1:18443 \
 *   EXCHANGE_DESK_ORIGIN=http://127.0.0.1:5199 \
 *   npm run smoke:matching-go
 *
 * Requires: matching=ok, lab deposit (or prefunded account), deposit/withdraw may be on in private lab.
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { webcrypto } from "node:crypto";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const BASE = (process.env.EXCHANGE_DESK_BASE || "http://127.0.0.1:18443").replace(/\/$/, "");
const ORIGIN = process.env.EXCHANGE_DESK_ORIGIN || "http://127.0.0.1:5199";

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function main() {
  if (/exchange\.hackme\.tech/i.test(BASE) && process.env.EX_MATCHING_GO_FORCE_PUBLIC !== "1") {
    throw new Error("refusing public desk — Matching GO acceptance is staging/lab only (set EX_MATCHING_GO_FORCE_PUBLIC=1 to override)");
  }

  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const pub = ed.getPublicKey(seed);
  const addr = `HMC-${hex(sha256(pub)).slice(0, 16)}`;
  const jar = new Map<string, string>();
  const parseSetCookie = (res: Response) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const hdr = (csrf?: string): Record<string, string> => {
    const h: Record<string, string> = { Origin: ORIGIN, Cookie: cookie() };
    if (csrf) h["X-CSRF-Token"] = csrf;
    return h;
  };

  const health = await (await fetch(`${BASE}/health`)).json() as {
    matching?: string;
    deposit?: { enabled?: boolean };
    withdraw?: { enabled?: boolean };
    min_notional?: number;
  };
  if (health.matching !== "ok") throw new Error(`matching want ok got ${health.matching}`);
  console.log("PASS  health matching=ok");
  // Deposit/withdraw stay OFF for public Matching GO; private lab may have them on.
  if (health.deposit?.enabled && /public_edge|hackme\.tech/i.test(BASE + JSON.stringify(health))) {
    console.log("WARN  deposit enabled — OK only on private lab");
  }

  const chRes = await fetch(`${BASE}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ address: addr }),
  });
  const ch = (await chRes.json()) as { challenge_id: string; message: string };
  if (!chRes.ok) throw new Error(`challenge ${chRes.status}`);
  console.log("PASS  challenge");

  const sig = hex(ed.sign(new TextEncoder().encode(ch.message), seed));
  const verRes = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({
      challenge_id: ch.challenge_id,
      address: addr,
      pubkey_ed25519: hex(pub),
      sig_ed25519: sig,
    }),
  });
  parseSetCookie(verRes);
  const ver = (await verRes.json()) as { ok?: boolean; csrf_token?: string };
  if (!verRes.ok || !ver.csrf_token) throw new Error(`verify ${verRes.status}`);
  console.log("PASS  verify + csrf");

  const bookRes = await fetch(`${BASE}/book?pair=HMC/USDT`);
  if (bookRes.status !== 200) throw new Error(`book want 200 got ${bookRes.status}`);
  const book = (await bookRes.json()) as { bids?: unknown[]; asks?: unknown[] };
  console.log(`PASS  book 200 (bids=${book.bids?.length ?? 0} asks=${book.asks?.length ?? 0})`);

  // Fund via lab deposit when available.
  const fundAmt = 50_000_000_000; // 500 USDT minor
  const dep = await fetch(`${BASE}/lab/deposit`, {
    method: "POST",
    headers: { ...hdr(ver.csrf_token), "content-type": "application/json" },
    body: JSON.stringify({
      asset: "USDT",
      amount: fundAmt,
      tx_id: `mg-go-${Date.now()}`,
      reason: "matching-go-acceptance",
    }),
  });
  if (dep.status === 200) console.log("PASS  lab deposit USDT");
  else if (dep.status === 404 || dep.status === 403) {
    console.log(`WARN  lab deposit ${dep.status} — place may fail without funds`);
  } else {
    throw new Error(`lab deposit ${dep.status} ${await dep.text()}`);
  }

  const mid = 5_000_000; // 0.05 — soft lab mid
  const price = mid - 50_000; // below mid buy
  const minN = typeof health.min_notional === "number" ? health.min_notional : 1_000_000;
  const qty = Math.max(100_000_000, Math.ceil((minN * 100_000_000) / price / 100_000_000) * 100_000_000);

  const badCsrf = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...hdr("bad-csrf"), "content-type": "application/json" },
    body: JSON.stringify({ pair: "HMC/USDT", side: "buy", type: "limit", price, qty }),
  });
  if (badCsrf.status !== 403) throw new Error(`bad CSRF want 403 got ${badCsrf.status}`);
  console.log("PASS  place bad CSRF → 403");

  const under = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...hdr(ver.csrf_token), "content-type": "application/json" },
    body: JSON.stringify({ pair: "HMC/USDT", side: "buy", type: "limit", price: mid, qty: 1 }),
  });
  if (under.status === 400) console.log("PASS  under min notional → 400");
  else console.log(`WARN  under min notional → ${under.status} (engine may clamp)`);

  const place = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...hdr(ver.csrf_token), "content-type": "application/json" },
    body: JSON.stringify({
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price,
      qty,
      client_order_id: `mg-${hex(webcrypto.getRandomValues(new Uint8Array(8)))}`,
    }),
  });
  const placeBody = (await place.json()) as { ok?: boolean; order?: { id?: string }; id?: string; code?: string };
  if (place.status !== 200) throw new Error(`place ${place.status} ${JSON.stringify(placeBody)}`);
  const orderId = placeBody.order?.id || placeBody.id;
  if (!orderId) throw new Error(`no order id ${JSON.stringify(placeBody)}`);
  console.log(`PASS  place limit ${orderId}`);

  const list = await fetch(`${BASE}/orders`, { headers: hdr(ver.csrf_token) });
  if (list.status !== 200) throw new Error(`list orders ${list.status}`);
  const listed = (await list.json()) as { orders?: { id: string }[] } | { id: string }[];
  const rows = Array.isArray(listed) ? listed : listed.orders ?? [];
  if (!rows.some((o) => o.id === orderId)) throw new Error("placed order missing from open list");
  console.log("PASS  open orders contains place");

  const cancel = await fetch(`${BASE}/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    headers: hdr(ver.csrf_token),
  });
  if (cancel.status !== 200) throw new Error(`cancel ${cancel.status} ${await cancel.text()}`);
  console.log("PASS  cancel");

  const lo = await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: hdr(ver.csrf_token),
  });
  if (!lo.ok) throw new Error(`logout ${lo.status}`);
  const bal = await fetch(`${BASE}/balances`, { headers: hdr(ver.csrf_token) });
  if (bal.status === 200) throw new Error("balances still auth after logout");
  console.log("PASS  logout + unauthorized");

  console.log(`[matching-go-acceptance] OK — ${BASE} · ${addr}`);
}

main().catch((e) => {
  console.error("[matching-go-acceptance] FAIL", e);
  process.exit(1);
});
