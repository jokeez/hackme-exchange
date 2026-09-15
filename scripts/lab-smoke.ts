#!/usr/bin/env npx tsx
/**
 * Live lab smoke against loopback exchange-api (:18443) + optional hub wallet (:8080).
 * DEMO/LAB only — uses fixture seed. Requires API up + EXCHANGE_ADMIN_TOKEN for credit.
 *
 *   cd hackme-exchange-demo && npx tsx scripts/lab-smoke.ts
 */
import * as ed from "@noble/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha1 } from "@noble/hashes/sha1";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const API = process.env.EXCHANGE_API_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:18443";
const HUB = process.env.HACKME_NODE_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:8080";
const SEED =
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

type Step = { name: string; ok: boolean; detail?: string };

const steps: Step[] = [];
const jar = new Map<string, string>();

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
function loadAdminToken(): string {
  if (process.env.EXCHANGE_ADMIN_TOKEN) return process.env.EXCHANGE_ADMIN_TOKEN;
  const roots = [
    process.env.HACKME_EXCHANGE_API,
    resolve(here, "../../hackme-exchange-api"),
    resolve(here, "../hackme-exchange-api"),
  ].filter(Boolean) as string[];
  const files = [".env.d1.local", ".env"];
  for (const root of roots) {
    for (const name of files) {
      try {
        const env = readFileSync(resolve(root, name), "utf8");
        const m = env.match(/^EXCHANGE_ADMIN_TOKEN=(.+)$/m);
        if (m?.[1]?.trim()) return m[1].trim();
      } catch {
        /* try next */
      }
    }
  }
  return "";
}

/** Quote-minor notional floor: price×qty/1e8 ≥ minNotional → min qty in base minor. */
function minQtyMinor(priceMinor: number, minNotional: number): number {
  if (priceMinor <= 0 || minNotional <= 0) return 100_000_000;
  const raw = Math.ceil((minNotional * 100_000_000) / priceMinor);
  const whole = Math.ceil(raw / 100_000_000) * 100_000_000;
  return Math.max(whole, 100_000_000);
}

function base32Decode(s: string): Uint8Array {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.replace(/\s/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let val = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = alpha.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((val >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function totpCode(secret: Uint8Array, timeMs = Date.now()): string {
  const counter = Math.floor(timeMs / 1000 / 30);
  const buf = new Uint8Array(8);
  let n = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  const mac = hmac(sha1, secret, buf);
  const off = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[off]! & 0x7f) << 24) |
    ((mac[off + 1]! & 0xff) << 16) |
    ((mac[off + 2]! & 0xff) << 8) |
    (mac[off + 3]! & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}
function noteCookies(res: Response): void {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  // Node <18 fallback: single set-cookie
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function api(
  path: string,
  init: RequestInit & { json?: unknown; csrf?: string; admin?: boolean; totp?: string } = {},
): Promise<{ status: number; body: any; res: Response }> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (init.csrf) headers["X-CSRF-Token"] = init.csrf;
  if (init.totp) headers["X-2FA-Code"] = init.totp;
  if (init.admin) {
    const tok = loadAdminToken();
    if (!tok) throw new Error("EXCHANGE_ADMIN_TOKEN missing");
    headers["X-Admin-Token"] = tok;
  }
  const cookie = cookieHeader();
  if (cookie) headers["Cookie"] = cookie;
  let last: { status: number; body: any; res: Response } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
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
    last = { status: res.status, body, res };
    if (res.status !== 429) return last;
    // Lab re-runs share IP buckets — back off and retry (D1 calibration).
    await sleep(400 * (attempt + 1) * (attempt + 1));
  }
  return last!;
}

function record(name: string, ok: boolean, detail?: string): void {
  steps.push({ name, ok, detail });
  const mark = ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? " — " + detail : ""}`);
}

async function main(): Promise<number> {
  console.log(`Lab smoke → ${API} (hub ${HUB})\n`);

  // 0) health + CORS DELETE
  let minNotional = 1_000_000;
  {
    const h = await api("/health");
    minNotional = Number(h.body?.min_notional) || minNotional;
    record("health", h.status === 200 && h.body?.ok === true, `matching=${h.body?.matching} db=${h.body?.db_driver ?? "?"}`);
    const pre = await fetch(`${API}/orders/x`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5199",
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "content-type,x-csrf-token,x-2fa-code",
      },
    });
    const methods = pre.headers.get("access-control-allow-methods") || "";
    const hdrs = (pre.headers.get("access-control-allow-headers") || "").toLowerCase();
    record(
      "CORS DELETE + X-2FA-Code",
      pre.status === 204 && methods.includes("DELETE") && hdrs.includes("x-2fa-code"),
      methods,
    );
  }

  // 1) fixture auth
  const seed = hexToBytes(SEED);
  const pub = ed.getPublicKey(seed);
  const address = addrFromPub(pub);
  const pubkeyHex = bytesToHex(pub);
  let csrf = "";
  {
    const ch = await api("/auth/challenge", { method: "POST", json: { address } });
    const okCh = ch.status === 200 && ch.body?.challenge_id && ch.body?.message;
    record("auth/challenge", !!okCh, address);
    if (!okCh) return failOut();
    const sig = bytesToHex(ed.sign(new TextEncoder().encode(ch.body.message), seed));
    const ver = await api("/auth/verify", {
      method: "POST",
      json: {
        challenge_id: ch.body.challenge_id,
        address,
        pubkey_ed25519: pubkeyHex,
        sig_ed25519: sig,
      },
    });
    csrf = ver.body?.csrf_token || "";
    record("auth/verify", ver.status === 200 && !!csrf && ver.body?.ok === true, `csrf=${csrf.slice(0, 8)}…`);
    if (!csrf) return failOut();

    const sess = await api("/auth/session", { method: "GET" });
    record(
      "GET /auth/session",
      sess.status === 200 && sess.body?.ok === true && sess.body?.csrf_token === csrf,
      `addr=${String(sess.body?.address || "").slice(0, 14)}…`,
    );
  }

  // 2) admin credit HMC + USDT (top-up for smoke)
  {
    const hmc = await api("/admin/credit", {
      method: "POST",
      admin: true,
      json: {
        address,
        asset: "HMC",
        amount: 100_000_000_000,
        reason: "lab-smoke",
        tx_id: `smoke-hmc-${Date.now()}`,
      },
    });
    const usdt = await api("/admin/credit", {
      method: "POST",
      admin: true,
      json: {
        address,
        asset: "USDT",
        amount: 100_000_000_000,
        reason: "lab-smoke",
        tx_id: `smoke-usdt-${Date.now()}`,
      },
    });
    record(
      "admin/credit HMC+USDT",
      hmc.status === 200 && usdt.status === 200,
      `hmc=${hmc.status} usdt=${usdt.status}`,
    );
  }

  // 2b) cancel leftover opens so reserves free up
  {
    const list = await api("/orders");
    const opens = (list.body?.orders || []).filter(
      (o: any) => o.status === "open" || o.status === "partial" || o.status === "triggered",
    );
    let cancelled = 0;
    for (const o of opens) {
      const c = await api(`/orders/${encodeURIComponent(o.id)}`, { method: "DELETE", csrf });
      if (c.status === 200) cancelled++;
    }
    record("cleanup open orders", true, `cancelled ${cancelled}/${opens.length}`);
  }

  // 3) balances
  {
    const b = await api("/balances");
    const list = b.body?.balances || [];
    const has = (a: string) =>
      list.some((x: any) => x.asset === a && Number(x.free || x.available || x.amount || 0) > 0);
    record("GET /balances", b.status === 200 && (has("HMC") || has("USDT")), JSON.stringify(list).slice(0, 120));
  }

  // book mid for realistic prices (seed mark when MM off / empty book)
  let book = await api("/book?pair=HMC/USDT");
  let bestAsk = Number(book.body?.asks?.[0]?.price || book.body?.asks?.[0]?.[0] || 0);
  let bestBid = Number(book.body?.bids?.[0]?.price || book.body?.bids?.[0]?.[0] || 0);
  if (bestAsk <= 0 && bestBid <= 0) {
    const markPx = 5_000_000; // soft profile ~0.05 USDT/HMC
    const mark = await api("/lab/mark", {
      method: "POST",
      csrf,
      admin: true,
      json: { pair: "HMC/USDT", price: markPx },
    });
    record("lab/mark seed", mark.status === 200, `price=${markPx}`);
    book = await api("/book?pair=HMC/USDT");
    bestAsk = Number(book.body?.asks?.[0]?.price || book.body?.asks?.[0]?.[0] || 0);
    bestBid = Number(book.body?.bids?.[0]?.price || book.body?.bids?.[0]?.[0] || 0);
  }
  const midPx = bestAsk > 0 && bestBid > 0 ? Math.round((bestAsk + bestBid) / 2) : bestAsk || bestBid || 5_000_000;
  const smokeQty = minQtyMinor(midPx, minNotional);
  record("book mid for smoke", midPx > 0, `mid=${midPx} bid=${bestBid} ask=${bestAsk} qty=${smokeQty}`);

  // 4) place limit sell ABOVE ask (resting) then cancel
  let orderId = "";
  {
    const sellPx = bestAsk > 0 ? bestAsk + Math.max(1, Math.round(midPx * 0.001)) : midPx + 100;
    const place = await api("/orders", {
      method: "POST",
      csrf,
      json: {
        pair: "HMC/USDT",
        side: "sell",
        type: "limit",
        price: sellPx,
        qty: smokeQty,
        pay_fee_in_hmc: true,
      },
    });
    orderId = place.body?.order?.id || "";
    record(
      "POST /orders limit sell",
      place.status === 200 && !!orderId,
      orderId
        ? orderId.slice(0, 12)
        : `HTTP ${place.status} ${place.body?.error || place.body?.code || JSON.stringify(place.body).slice(0, 120)}`,
    );
    if (orderId) {
      const cancel = await api(`/orders/${encodeURIComponent(orderId)}`, { method: "DELETE", csrf });
      record(
        "DELETE /orders cancel",
        cancel.status === 200 &&
          (cancel.body?.order?.status === "cancelled" || cancel.body?.ok === true),
        `status=${cancel.status} ${cancel.body?.order?.status || cancel.body?.error || ""}`,
      );
    } else {
      record("DELETE /orders cancel", false, "no order id");
    }
  }

  // 5) counterparty cross fill
  {
    const buyPx = bestBid > 0 ? bestBid : Math.max(1, midPx);
    const place = await api("/orders", {
      method: "POST",
      csrf,
      json: {
        pair: "HMC/USDT",
        side: "buy",
        type: "limit",
        price: buyPx,
        qty: smokeQty,
        pay_fee_in_hmc: true,
      },
    });
    const oid = place.body?.order?.id || "";
    record(
      "POST /orders limit buy (for cross)",
      place.status === 200 && !!oid,
      oid
        ? oid.slice(0, 12)
        : `HTTP ${place.status} ${place.body?.error || place.body?.code || JSON.stringify(place.body).slice(0, 120)}`,
    );
    const cross = await api("/lab/counterparty", {
      method: "POST",
      csrf,
      json: oid ? { pair: "HMC/USDT", order_id: oid } : { pair: "HMC/USDT" },
    });
    const fills = cross.body?.fills || [];
    const feeHmc = fills.some((f: any) => Number(f.taker_fee_hmc || f.maker_fee_hmc || 0) > 0);
    const feeQuote = fills.some((f: any) => Number(f.taker_fee_quote || f.maker_fee_quote || 0) > 0);
    record(
      "POST /lab/counterparty fill",
      cross.status === 200 && fills.length > 0,
      `fills=${fills.length} feeHmc=${feeHmc} feeQuote=${feeQuote} ${cross.body?.error || ""}`,
    );
    const fees = await api("/admin/fees", { method: "GET", admin: true }).catch(() => null);
    if (fees) {
      record(
        "GET /admin/fees",
        fees.status === 200,
        JSON.stringify(fees.body?.balances || fees.body).slice(0, 140),
      );
    }
  }

  // 6) convert (API field names: from_asset / to_asset)
  // Soft-launch mid≈5_000_000 (0.05 USDT/HMC). Size convert to a few HMC of notional
  // so MM inventory pad is not exhausted on one quote.
  {
    const targetHmc = smokeQty;
    const convertAmount = Math.max(1, Math.floor((targetHmc * midPx) / 100_000_000));
    const c = await api("/convert", {
      method: "POST",
      csrf,
      json: {
        from_asset: "USDT",
        to_asset: "HMC",
        amount: convertAmount,
        pay_fee_in_hmc: true,
      },
    });
    record(
      "POST /convert",
      c.status === 200 && (c.body?.ok === true || c.body?.got != null || c.body?.amount_to != null),
      `status=${c.status} from=${convertAmount} got=${c.body?.got ?? "?"} fee_hmc=${c.body?.fee_hmc ?? "?"} ${c.body?.error || c.body?.code || ""}`,
    );
  }

  // 7) deposit address + node-watch probe + bridge credit
  let hmcDepAddr = "";
  {
    const dep = await api("/deposit/address?asset=HMC");
    hmcDepAddr = String(dep.body?.deposit_address || "");
    record(
      "GET /deposit/address HMC",
      dep.status === 200 && hmcDepAddr.startsWith("HMC-") && dep.body?.kind === "hmc_ed25519",
      `${hmcDepAddr.slice(0, 20)} kind=${dep.body?.kind || "?"}`,
    );
    const sup = await api("/deposit/address?asset=SUP");
    const supAddr = String(sup.body?.deposit_address || "");
    record(
      "GET /deposit/address SUP",
      sup.status === 200 && supAddr.startsWith("HMC-") && sup.body?.kind === "sup_ed25519",
      `${supAddr.slice(0, 20)} kind=${sup.body?.kind || "?"}`,
    );
    if (supAddr) {
      const cw = await api("/lab/chain-watch", {
        method: "POST",
        csrf,
        json: {
          deposit_address: supAddr,
          amount: 25_000_000,
          tx_id: `smoke-sup-cw-${Date.now()}`,
        },
      });
      record(
        "POST /lab/chain-watch SUP",
        cw.status === 200 && cw.body?.ok === true,
        `bal=${cw.body?.balance_after ?? cw.status}`,
      );
    }
    const nws = await api("/admin/node-watch-sync", { method: "POST", admin: true, json: {} });
    record(
      "POST /admin/node-watch-sync",
      nws.status === 200 || nws.status === 503,
      `status=${nws.status} credited=${nws.body?.result?.credited ?? nws.body?.credited ?? "?"}`,
    );
    const bridge = await api("/lab/bridge-credit", {
      method: "POST",
      csrf,
      json: {
        asset: "USDT",
        amount: 1_000_000_000,
        tx_id: `smoke-bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
    });
    record(
      "POST /lab/bridge-credit +10 USDT",
      bridge.status === 200 && bridge.body?.ok !== false,
      `bal=${bridge.body?.balance_after ?? bridge.status} ${bridge.body?.error || bridge.body?.code || ""}`,
    );
  }

  // 7b) per-user 2FA enroll + withdraw gate
  let totpSecret: Uint8Array | null = null;
  {
    const st0 = await api("/auth/2fa/status", { method: "GET" });
    record(
      "GET /auth/2fa/status",
      st0.status === 200 && st0.body?.enabled === false,
      `enabled=${st0.body?.enabled} pending=${st0.body?.pending}`,
    );
    const setup = await api("/auth/2fa/setup", { method: "POST", csrf, json: {} });
    const b32 = String(setup.body?.secret_base32 || "");
    totpSecret = b32 ? base32Decode(b32) : null;
    record(
      "POST /auth/2fa/setup",
      setup.status === 200 && !!totpSecret?.length,
      b32 ? `${b32.slice(0, 8)}…` : `status=${setup.status}`,
    );
    if (totpSecret?.length) {
      const code = totpCode(totpSecret);
      const confirm = await api("/auth/2fa/confirm", { method: "POST", csrf, json: { code } });
      record(
        "POST /auth/2fa/confirm",
        confirm.status === 200 && confirm.body?.enabled === true,
        `status=${confirm.status}`,
      );
      const st1 = await api("/auth/2fa/status", { method: "GET" });
      record("GET /auth/2fa/status enabled", st1.body?.enabled === true, "");
    }
  }

  // 8) withdraw request
  {
    const dest = "HMC-deadbeefdeadbeef"; // external stub dest
    const wdBody = {
      asset: "HMC",
      amount: 10_000_000,
      destination: dest,
      client_withdraw_id: `smoke-wd-${Date.now()}`,
    };
    const wdNo2fa = await api("/withdraw", { method: "POST", csrf, json: wdBody });
    if (totpSecret?.length) {
      record(
        "POST /withdraw without 2FA (expect 401)",
        wdNo2fa.status === 401,
        `status=${wdNo2fa.status} ${wdNo2fa.body?.code || wdNo2fa.body?.error || ""}`,
      );
    }
    const code = totpSecret?.length ? totpCode(totpSecret) : "";
    const wd = await api("/withdraw", {
      method: "POST",
      csrf,
      totp: code || undefined,
      json: wdBody,
    });
    const ok =
      wd.status === 200 &&
      (wd.body?.withdraw?.status === "pending" || wd.body?.ok === true);
    record(
      "POST /withdraw request",
      ok || (!totpSecret?.length && (wd.status === 401 || wd.status === 200)),
      `status=${wd.status} ${wd.body?.error || wd.body?.withdraw?.status || wd.body?.code || ""}`,
    );
    if (totpSecret?.length) {
      const off = await api("/auth/2fa/disable", {
        method: "POST",
        csrf,
        json: { code: totpCode(totpSecret) },
      });
      record("POST /auth/2fa/disable", off.status === 200 && off.body?.enabled === false, `status=${off.status}`);
    }
    const list = await api("/withdrawals");
    record("GET /withdrawals", list.status === 200, `n=${(list.body?.withdrawals || []).length}`);
  }

  // 9) book + fills list
  {
    const book = await api("/book?pair=HMC/USDT");
    record(
      "GET /book",
      book.status === 200 && (Array.isArray(book.body?.bids) || Array.isArray(book.body?.asks)),
      `bids=${book.body?.bids?.length ?? 0} asks=${book.body?.asks?.length ?? 0}`,
    );
    const fills = await api("/fills?limit=20");
    record("GET /fills", fills.status === 200, `n=${(fills.body?.fills || []).length}`);
  }

  // 10) hub wallet sync
  {
    try {
      const r = await fetch(`${HUB}/api/wallet`, { headers: { Accept: "application/json" } });
      const j = r.ok ? await r.json() : null;
      record(
        "hub GET /api/wallet",
        r.ok && !!(j?.address || j?.balance_hmc != null || j?.balance_display_hmc != null),
        r.ok
          ? `addr=${String(j?.address || "").slice(0, 18)} hmc=${j?.balance_display_hmc ?? j?.balance_hmc}`
          : `HTTP ${r.status}`,
      );
    } catch (e) {
      record("hub GET /api/wallet", false, e instanceof Error ? e.message : String(e));
    }
  }

  // 11) SPA reachable
  {
    try {
      const r = await fetch("http://127.0.0.1:5199/");
      record("SPA :5199", r.ok, `HTTP ${r.status}`);
    } catch (e) {
      record("SPA :5199", false, e instanceof Error ? e.message : String(e));
    }
  }

  return failOut();
}

function failOut(): number {
  const failed = steps.filter((s) => !s.ok);
  console.log(`\n—— ${steps.length - failed.length}/${steps.length} passed ——`);
  if (failed.length) {
    console.log("Failed:");
    for (const f of failed) console.log(`  • ${f.name}: ${f.detail || ""}`);
    return 1;
  }
  console.log("All lab smoke checks passed.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
