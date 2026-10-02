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

async function session(): Promise<{
  addr: string;
  seed: Uint8Array;
  csrf: string;
  jar: Map<string, string>;
  hdr: (csrf?: string) => Record<string, string>;
}> {
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

  const chRes = await fetch(`${BASE}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ address: addr }),
  });
  const ch = (await chRes.json()) as { challenge_id: string; message: string };
  if (!chRes.ok) throw new Error(`challenge ${chRes.status}`);

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
  return { addr, seed, csrf: ver.csrf_token, jar, hdr };
}

async function main() {
  if (/exchange\.hackme\.tech/i.test(BASE) && process.env.EX_MATCHING_GO_FORCE_PUBLIC !== "1") {
    throw new Error(
      "refusing public desk — Matching GO acceptance is staging/lab only (set EX_MATCHING_GO_FORCE_PUBLIC=1 to override)",
    );
  }

  const health = (await (await fetch(`${BASE}/health`)).json()) as {
    matching?: string;
    deposit?: { enabled?: boolean };
    withdraw?: { enabled?: boolean };
    public_edge?: boolean;
    min_notional?: number;
    price_band_bps?: number;
    max_open_orders?: number;
  };
  if (health.matching !== "ok") throw new Error(`matching want ok got ${health.matching}`);
  console.log("PASS  health matching=ok");

  if (health.public_edge) {
    if (health.deposit?.enabled) throw new Error("public_edge deposit must stay OFF for Matching GO");
    if (health.withdraw?.enabled) throw new Error("public_edge withdraw must stay OFF for Matching GO");
    console.log("PASS  public_edge deposit/withdraw OFF");
  } else if (health.deposit?.enabled) {
    console.log("WARN  deposit enabled — OK only on private lab");
  }

  if (typeof health.max_open_orders === "number" && health.max_open_orders > 0) {
    console.log(`PASS  health max_open_orders=${health.max_open_orders}`);
  } else {
    console.log("WARN  health max_open_orders missing (rebuild API?)");
  }
  if (typeof health.price_band_bps === "number") {
    console.log(`PASS  health price_band_bps=${health.price_band_bps}`);
  }
  if (typeof health.min_notional === "number") {
    console.log(`PASS  health min_notional=${health.min_notional}`);
  }

  const a = await session();
  console.log("PASS  challenge + verify + csrf");

  const bookRes = await fetch(`${BASE}/book?pair=HMC/USDT`);
  if (bookRes.status !== 200) throw new Error(`book want 200 got ${bookRes.status}`);
  const book = (await bookRes.json()) as { bids?: unknown[]; asks?: unknown[] };
  console.log(`PASS  book 200 (bids=${book.bids?.length ?? 0} asks=${book.asks?.length ?? 0})`);

  const fundAmt = 50_000_000_000; // 500 USDT minor
  const dep = await fetch(`${BASE}/lab/deposit`, {
    method: "POST",
    headers: { ...a.hdr(a.csrf), "content-type": "application/json" },
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

  const mid = 5_000_000; // 0.05
  const price = mid - 50_000; // below mid buy
  const minN = typeof health.min_notional === "number" ? health.min_notional : 1_000_000;
  const qty = Math.max(100_000_000, Math.ceil((minN * 100_000_000) / price / 100_000_000) * 100_000_000);
  const bandBps = typeof health.price_band_bps === "number" ? health.price_band_bps : 1500;

  const badCsrf = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...a.hdr("bad-csrf"), "content-type": "application/json" },
    body: JSON.stringify({ pair: "HMC/USDT", side: "buy", type: "limit", price, qty }),
  });
  if (badCsrf.status !== 403) throw new Error(`bad CSRF want 403 got ${badCsrf.status}`);
  console.log("PASS  place bad CSRF → 403");

  const under = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...a.hdr(a.csrf), "content-type": "application/json" },
    body: JSON.stringify({ pair: "HMC/USDT", side: "buy", type: "limit", price: mid, qty: 1 }),
  });
  if (under.status === 400) console.log("PASS  under min notional → 400");
  else console.log(`WARN  under min notional → ${under.status} (engine may clamp)`);

  // Over price band (±bandBps around mid) — structured reject.
  const overPx = Math.floor(mid * (1 + (bandBps + 500) / 10_000));
  const over = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...a.hdr(a.csrf), "content-type": "application/json" },
    body: JSON.stringify({ pair: "HMC/USDT", side: "buy", type: "limit", price: overPx, qty }),
  });
  const overBody = (await over.json().catch(() => ({}))) as { code?: string };
  if (over.status === 400 && (overBody.code === "price_band" || !overBody.code)) {
    console.log(`PASS  over price band → ${over.status}${overBody.code ? ` ${overBody.code}` : ""}`);
  } else {
    console.log(`WARN  over price band → ${over.status} ${JSON.stringify(overBody)}`);
  }

  const place = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { ...a.hdr(a.csrf), "content-type": "application/json" },
    body: JSON.stringify({
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price,
      qty,
      client_order_id: `mg-${hex(webcrypto.getRandomValues(new Uint8Array(8)))}`,
    }),
  });
  const placeBody = (await place.json()) as {
    ok?: boolean;
    order?: { id?: string };
    id?: string;
    code?: string;
  };
  if (place.status !== 200) throw new Error(`place ${place.status} ${JSON.stringify(placeBody)}`);
  const orderId = placeBody.order?.id || placeBody.id;
  if (!orderId) throw new Error(`no order id ${JSON.stringify(placeBody)}`);
  console.log(`PASS  place limit ${orderId}`);

  const list = await fetch(`${BASE}/orders`, { headers: a.hdr(a.csrf) });
  if (list.status !== 200) throw new Error(`list orders ${list.status}`);
  const listed = (await list.json()) as { orders?: { id: string }[] } | { id: string }[];
  const rows = Array.isArray(listed) ? listed : listed.orders ?? [];
  if (!rows.some((o) => o.id === orderId)) throw new Error("placed order missing from open list");
  console.log("PASS  open orders contains place");

  // Gate 1.5 authz: second session must not cancel first account's order.
  const b = await session();
  const foreign = await fetch(`${BASE}/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    headers: b.hdr(b.csrf),
  });
  if (foreign.status === 200) throw new Error("cross-account cancel must not succeed");
  if (foreign.status === 403 || foreign.status === 404 || foreign.status === 400) {
    console.log(`PASS  cross-account cancel → ${foreign.status}`);
  } else {
    console.log(`WARN  cross-account cancel → ${foreign.status} (want 403/404)`);
  }

  const cancel = await fetch(`${BASE}/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    headers: a.hdr(a.csrf),
  });
  if (cancel.status !== 200) throw new Error(`cancel ${cancel.status} ${await cancel.text()}`);
  console.log("PASS  cancel");

  // Soft rate-limit probe (trade) — stop at first 429; do not hammer public edges.
  if (process.env.EX_MATCHING_GO_RATE === "1") {
    let hit429 = false;
    for (let i = 0; i < 80; i++) {
      const r = await fetch(`${BASE}/orders`, {
        method: "POST",
        headers: { ...a.hdr(a.csrf), "content-type": "application/json" },
        body: JSON.stringify({
          pair: "HMC/USDT",
          side: "buy",
          type: "limit",
          price: mid - 200_000,
          qty: 100_000_000,
          client_order_id: `rl-${i}-${Date.now()}`,
        }),
      });
      if (r.status === 429) {
        hit429 = true;
        break;
      }
      if (r.status === 200) {
        const body = (await r.json()) as { order?: { id?: string }; id?: string };
        const id = body.order?.id || body.id;
        if (id) {
          await fetch(`${BASE}/orders/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: a.hdr(a.csrf),
          });
        }
      }
    }
    if (hit429) console.log("PASS  trade rate limit → 429");
    else console.log("WARN  trade rate limit did not trip (cap may be high)");
  }

  const lo = await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: a.hdr(a.csrf),
  });
  if (!lo.ok) throw new Error(`logout ${lo.status}`);
  const bal = await fetch(`${BASE}/balances`, { headers: a.hdr(a.csrf) });
  if (bal.status === 200) throw new Error("balances still auth after logout");
  console.log("PASS  logout + unauthorized");

  console.log(`[matching-go-acceptance] OK — ${BASE} · ${a.addr}`);
}

main().catch((e) => {
  console.error("[matching-go-acceptance] FAIL", e);
  process.exit(1);
});
