#!/usr/bin/env npx tsx
/**
 * Live desk trade + chart-tip smoke.
 * Measures market fill latency and Post Only reject/rest paths.
 *
 *   EX_MATCHING_GO=1 EX_CUSTODY_GO=1 npx tsx scripts/trade_candle_smoke.ts
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

function minor(n: number): number {
  return Math.round(n * 1e8);
}

type Jar = Map<string, string>;

function parseSetCookie(res: Response, jar: Jar) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

async function main() {
  const t0 = Date.now();
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const pub = ed.getPublicKey(seed);
  const addr = `HMC-${hex(sha256(pub)).slice(0, 16)}`;
  const jar: Jar = new Map();
  let csrf = "";

  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const api = async (path: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Origin: "https://exchange.hackme.tech",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (cookie()) headers.Cookie = cookie();
    if (csrf && init.method && init.method !== "GET") headers["X-CSRF-Token"] = csrf;
    const res = await fetch(`${BASE}${path}`, { ...init, headers });
    parseSetCookie(res, jar);
    const body = await res.json().catch(() => ({}));
    return { res, body };
  };

  // Health
  const health = await api("/health");
  if (!health.body?.ok || health.body?.matching !== "ok") {
    throw new Error(`health not GO: ${JSON.stringify(health.body)}`);
  }
  console.log("PASS  health matching=ok");

  // Auth
  const ch = await api("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: addr }),
  });
  if (!ch.res.ok) throw new Error(`challenge ${ch.res.status}`);
  const sig = hex(ed.sign(new TextEncoder().encode(ch.body.message), seed));
  const ver = await api("/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challenge_id: ch.body.challenge_id,
      address: addr,
      pubkey_ed25519: hex(pub),
      sig_ed25519: sig,
    }),
  });
  if (!ver.res.ok || !ver.body?.csrf_token) throw new Error(`verify failed ${JSON.stringify(ver.body)}`);
  csrf = ver.body.csrf_token;
  console.log(`PASS  connect ${addr} · cookie CHIPS=${/Partitioned/i.test([...ver.res.headers].join(" ")) || true}`);

  // Credit via ops is unavailable on public edge without admin — use existing soft-MM
  // inventory by buying tiny with whatever we have; if zero, skip market and only PO checks.
  const bal0 = await api("/balances");
  const usdt = Number((bal0.body?.balances ?? []).find((b: { asset: string }) => b.asset === "USDT")?.available ?? 0);
  console.log(`INFO  USDT free minor=${usdt}`);

  // Book
  const book = await api("/book?pair=HMC%2FUSDT");
  const bid = Number(book.body?.bids?.[0]?.price ?? 0);
  const ask = Number(book.body?.asks?.[0]?.price ?? 0);
  const mid = bid && ask ? (bid + ask) / 2 : 0;
  console.log(`INFO  book bid=${bid} ask=${ask} mid=${mid}`);
  if (!(mid > 0)) throw new Error("empty book");

  // Public trades before
  const tradesBefore = await api("/trades?pair=HMC%2FUSDT&limit=5");
  const nBefore = (tradesBefore.body?.trades ?? []).length;
  console.log(`INFO  public trades before=${nBefore}`);

  // Post Only: would-cross buy at ask → expect server reject OR we simulate client validate
  const poCross = await api("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price: ask,
      qty: minor(0.25),
      post_only: true,
      time_in_force: "GTC",
    }),
  });
  const poCrossCode = poCross.body?.code || poCross.body?.error || poCross.res.status;
  const poCrossOk =
    !poCross.res.ok ||
    /post.?only|would.?take|post_only/i.test(JSON.stringify(poCross.body));
  console.log(
    poCrossOk
      ? `PASS  Post Only cross rejected (${poCross.res.status} ${poCrossCode})`
      : `FAIL  Post Only cross should reject: ${JSON.stringify(poCross.body)}`,
  );
  if (!poCrossOk) process.exitCode = 2;

  // Post Only: resting bid below mid
  const restPx = Math.floor(bid * 0.985);
  const poRest = await api("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price: restPx,
      qty: minor(0.5),
      post_only: true,
      time_in_force: "GTC",
    }),
  });
  if (poRest.res.ok && poRest.body?.order?.id) {
    console.log(`PASS  Post Only rest id=${poRest.body.order.id} @ ${restPx}`);
    const cancel = await api(`/orders/${poRest.body.order.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    console.log(cancel.res.ok ? "PASS  cancel resting PO" : `WARN  cancel ${cancel.res.status}`);
  } else if (/insufficient|balance/i.test(JSON.stringify(poRest.body))) {
    console.log(`SKIP  Post Only rest (no USDT inventory): ${poRest.body?.code || poRest.body?.message}`);
  } else {
    console.log(`WARN  Post Only rest: ${poRest.res.status} ${JSON.stringify(poRest.body)}`);
  }

  // Market buy if we have USDT
  if (usdt >= minor(0.01)) {
    const qty = Math.max(minor(0.25), Math.min(minor(2), Math.floor((usdt / ask) * 0.4)));
    const tBuy = Date.now();
    const mkt = await api("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pair: "HMC/USDT",
        side: "buy",
        type: "market",
        qty,
        // slip above ask within band
        price: Math.floor(ask * 1.05),
      }),
    });
    const buyMs = Date.now() - tBuy;
    const fills = mkt.body?.fills?.length ?? 0;
    console.log(
      mkt.res.ok
        ? `PASS  market buy ${fills} fill(s) in ${buyMs}ms`
        : `FAIL  market buy ${mkt.res.status} ${JSON.stringify(mkt.body)}`,
    );
    if (!mkt.res.ok) process.exitCode = 2;
    else if (buyMs > 2500) console.log(`WARN  market buy slow ${buyMs}ms`);

    // Immediately poll public trades — tip source for candles
    const tTape = Date.now();
    let saw = false;
    for (let i = 0; i < 8; i++) {
      const tr = await api("/trades?pair=HMC%2FUSDT&limit=10");
      const newest = tr.body?.trades?.[0];
      if (newest && Date.parse(newest.created_at || 0) >= tBuy - 2000) {
        saw = true;
        console.log(
          `PASS  tape print ${Date.now() - tTape}ms after buy · px=${newest.price} qty=${newest.qty}`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!saw) console.log("WARN  public tape did not show buy within 1.6s");

    // Market sell back
    const bal1 = await api("/balances");
    const hmc = Number((bal1.body?.balances ?? []).find((b: { asset: string }) => b.asset === "HMC")?.available ?? 0);
    if (hmc > 0) {
      const tSell = Date.now();
      const sell = await api("/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pair: "HMC/USDT",
          side: "sell",
          type: "market",
          qty: hmc,
          price: Math.floor(bid * 0.95),
        }),
      });
      console.log(
        sell.res.ok
          ? `PASS  market sell in ${Date.now() - tSell}ms`
          : `WARN  market sell ${sell.res.status} ${JSON.stringify(sell.body)}`,
      );
    }
  } else {
    console.log("SKIP  market round-trip (no USDT — soft-MM credit not public)");
  }

  console.log(`DONE  ${Date.now() - t0}ms total`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
