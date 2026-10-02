#!/usr/bin/env npx tsx
/**
 * Soft-launch operator E2E (lab/loopback):
 * Connect → fund → deposit addr → trade (fee to fee-wallet) → 2FA → withdraw → admin complete.
 *
 *   EXCHANGE_API_ORIGIN=http://127.0.0.1:18443 npm run smoke:operator
 *
 * Uses ephemeral Ed25519 identity (not fixture). Requires EXCHANGE_ADMIN_TOKEN for credit/complete.
 */
import * as ed from "@noble/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha1 } from "@noble/hashes/sha1";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const API = (process.env.EXCHANGE_API_ORIGIN || "http://127.0.0.1:18443").replace(/\/$/, "");
const ORIGIN = process.env.EXCHANGE_DESK_ORIGIN || "http://127.0.0.1:5199";

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
function loadAdminToken(): string {
  if (process.env.EXCHANGE_ADMIN_TOKEN) return process.env.EXCHANGE_ADMIN_TOKEN;
  for (const root of [
    resolve(here, "../../hackme-exchange-api"),
    resolve(here, "../hackme-exchange-api"),
  ]) {
    for (const name of [".env.d1.local", ".env"]) {
      try {
        const m = readFileSync(resolve(root, name), "utf8").match(/^EXCHANGE_ADMIN_TOKEN=(.+)$/m);
        if (m?.[1]?.trim()) return m[1].trim();
      } catch {
        /* next */
      }
    }
  }
  return "";
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
  const off = mac[mac.length - 1]! & 0xf;
  const code =
    (((mac[off]! & 0x7f) << 24) |
      ((mac[off + 1]! & 0xff) << 16) |
      ((mac[off + 2]! & 0xff) << 8) |
      (mac[off + 3]! & 0xff)) %
    1_000_000;
  return String(code).padStart(6, "0");
}

async function main() {
  const admin = loadAdminToken();
  if (!admin) throw new Error("EXCHANGE_ADMIN_TOKEN required for operator smoke");

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
  const hdr = (csrf?: string, extra?: Record<string, string>): Record<string, string> => {
    const h: Record<string, string> = { Origin: ORIGIN, Cookie: cookie(), ...(extra || {}) };
    if (csrf) h["X-CSRF-Token"] = csrf;
    return h;
  };

  console.log(`Operator soft-launch smoke → ${API}`);

  const health = (await (await fetch(`${API}/health`)).json()) as {
    matching?: string;
    deposit?: { enabled?: boolean };
    withdraw?: { enabled?: boolean };
    max_open_orders?: number;
    price_band_bps?: number;
    min_notional?: number;
    fee_wallet?: { address?: string };
  };
  if (health.matching !== "ok") throw new Error(`matching ${health.matching}`);
  if (!health.deposit?.enabled) throw new Error("deposit not enabled");
  if (!health.withdraw?.enabled) throw new Error("withdraw not enabled");
  console.log(
    `PASS  health matching=ok deposit/withdraw ON · caps open=${health.max_open_orders} band=${health.price_band_bps} minN=${health.min_notional}`,
  );
  const feeWallet = health.fee_wallet?.address || "";
  if (feeWallet.startsWith("HMC-")) console.log(`PASS  fee_wallet ${feeWallet}`);
  else console.log("WARN  fee_wallet missing on health");

  const feesBefore = await fetch(`${API}/admin/fees`, { headers: { "X-Admin-Token": admin } });
  const feesBeforeJ = (await feesBefore.json()) as {
    balances?: { asset: string; available: number }[];
  };
  if (!feesBefore.ok) throw new Error(`admin/fees ${feesBefore.status}`);
  const feeUsdt0 =
    feesBeforeJ.balances?.find((b) => b.asset === "USDT")?.available ?? 0;
  console.log(`PASS  admin/fees before USDT=${feeUsdt0}`);

  const chRes = await fetch(`${API}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ address: addr }),
  });
  const ch = (await chRes.json()) as { challenge_id: string; message: string };
  if (!chRes.ok) throw new Error(`challenge ${chRes.status}`);
  const sig = hex(ed.sign(new TextEncoder().encode(ch.message), seed));
  const verRes = await fetch(`${API}/auth/verify`, {
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
  const ver = (await verRes.json()) as { csrf_token?: string };
  if (!verRes.ok || !ver.csrf_token) throw new Error(`verify ${verRes.status}`);
  const csrf = ver.csrf_token;
  console.log(`PASS  Connect ${addr}`);

  for (const [asset, amount] of [
    ["USDT", 200_000_000_000],
    ["HMC", 200_000_000_000],
  ] as const) {
    const cr = await fetch(`${API}/admin/credit`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Admin-Token": admin },
      body: JSON.stringify({
        address: addr,
        asset,
        amount,
        reason: "operator-soft-launch-smoke",
        tx_id: `ops-credit-${asset}-${Date.now()}`,
      }),
    });
    if (!cr.ok) throw new Error(`admin/credit ${asset} ${cr.status} ${await cr.text()}`);
  }
  console.log("PASS  admin credit HMC+USDT");

  const depH = await fetch(`${API}/deposit/address?asset=HMC`, { headers: hdr(csrf) });
  const depHj = (await depH.json()) as { deposit_address?: string; kind?: string };
  if (!depH.ok || !depHj.deposit_address?.startsWith("HMC-") || depHj.kind !== "hmc_ed25519") {
    throw new Error(`deposit HMC ${depH.status}`);
  }
  console.log(`PASS  deposit addr HMC ${depHj.deposit_address}`);

  const book = (await (await fetch(`${API}/book?pair=HMC/USDT`)).json()) as {
    bids?: { price: number; qty: number }[];
    asks?: { price: number; qty: number }[];
  };
  const ask = book.asks?.[0]?.price ?? 5_060_000;
  const qty = 100_000_000; // 1 HMC
  const buy = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { ...hdr(csrf), "content-type": "application/json" },
    body: JSON.stringify({
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price: ask,
      qty,
      client_order_id: `ops-buy-${Date.now()}`,
    }),
  });
  const buyJ = (await buy.json()) as { order?: { id?: string }; id?: string; code?: string };
  if (!buy.ok) throw new Error(`buy ${buy.status} ${JSON.stringify(buyJ)}`);
  console.log(`PASS  trade place buy ${buyJ.order?.id || buyJ.id}`);

  // Counterparty fill if lab endpoint exists
  const cp = await fetch(`${API}/lab/counterparty`, {
    method: "POST",
    headers: { ...hdr(csrf), "content-type": "application/json" },
    body: JSON.stringify({ order_id: buyJ.order?.id || buyJ.id, pair: "HMC/USDT" }),
  });
  if (cp.status === 200) console.log("PASS  lab/counterparty fill");
  else console.log(`WARN  lab/counterparty ${cp.status} (may already fill against MM)`);

  const feesAfter = await fetch(`${API}/admin/fees`, { headers: { "X-Admin-Token": admin } });
  const feesAfterJ = (await feesAfter.json()) as {
    balances?: { asset: string; available: number }[];
  };
  const feeUsdt1 =
    feesAfterJ.balances?.find((b) => b.asset === "USDT")?.available ?? 0;
  if (feeUsdt1 >= feeUsdt0) {
    console.log(`PASS  fee wallet USDT ${feeUsdt0} → ${feeUsdt1} (Δ ${feeUsdt1 - feeUsdt0})`);
  } else {
    console.log(`WARN  fee wallet USDT decreased? ${feeUsdt0} → ${feeUsdt1}`);
  }

  const quote = await fetch(
    `${API}/fees/custody?side=withdraw&asset=HMC&amount=10000000`,
    { headers: hdr(csrf) },
  );
  const quoteJ = (await quote.json()) as {
    ok?: boolean;
    custody_fees_on?: boolean;
    quote?: { fee?: number; debit_total?: number; receive?: number };
  };
  if (!quote.ok || !quoteJ.quote) throw new Error(`custody fee quote ${quote.status}`);
  if (!(Number(quoteJ.quote.fee) > 0) || Number(quoteJ.quote.debit_total) <= Number(quoteJ.quote.receive || 0)) {
    throw new Error(`custody fee quote invalid ${JSON.stringify(quoteJ.quote)}`);
  }
  console.log(
    `PASS  custody fee quote fee=${quoteJ.quote.fee} debit=${quoteJ.quote.debit_total} (on=${quoteJ.custody_fees_on})`,
  );

  const setup = await fetch(`${API}/auth/2fa/setup`, {
    method: "POST",
    headers: { ...hdr(csrf), "content-type": "application/json" },
    body: "{}",
  });
  const setupJ = (await setup.json()) as { secret_base32?: string; code?: string };
  if (!setup.ok || !setupJ.secret_base32) throw new Error(`2fa setup ${setup.status}`);
  const secret = base32Decode(setupJ.secret_base32);
  const confirm = await fetch(`${API}/auth/2fa/confirm`, {
    method: "POST",
    headers: { ...hdr(csrf), "content-type": "application/json" },
    body: JSON.stringify({ code: totpCode(secret) }),
  });
  if (!confirm.ok) throw new Error(`2fa confirm ${confirm.status} ${await confirm.text()}`);
  console.log("PASS  2FA enroll + confirm");

  await new Promise((r) => setTimeout(r, 1100)); // avoid same-step TOTP replay
  const dest = "HMC-ffffffffffffffff";
  const wdBody = {
    asset: "HMC",
    amount: 10_000_000,
    destination: dest,
    client_withdraw_id: `ops-wd-${Date.now()}`,
    totp_code: totpCode(secret),
  };
  const wdNo = await fetch(`${API}/withdraw`, {
    method: "POST",
    headers: { ...hdr(csrf), "content-type": "application/json" },
    body: JSON.stringify({ ...wdBody, totp_code: undefined }),
  });
  if (wdNo.status !== 401) throw new Error(`withdraw without 2FA want 401 got ${wdNo.status}`);
  console.log("PASS  withdraw without 2FA → 401");

  const wd = await fetch(`${API}/withdraw`, {
    method: "POST",
    headers: { ...hdr(csrf), "content-type": "application/json", "X-2FA-Code": totpCode(secret) },
    body: JSON.stringify(wdBody),
  });
  const wdJ = (await wd.json()) as { withdraw?: { id?: string; status?: string } };
  if (!wd.ok || wdJ.withdraw?.status !== "pending") {
    throw new Error(`withdraw ${wd.status} ${JSON.stringify(wdJ)}`);
  }
  const wdId = wdJ.withdraw.id!;
  console.log(`PASS  withdraw pending ${wdId}`);

  const list = await fetch(`${API}/withdrawals`, { headers: hdr(csrf) });
  const listJ = (await list.json()) as { withdrawals?: { id: string; status: string }[] };
  if (!list.ok || !listJ.withdrawals?.some((w) => w.id === wdId && w.status === "pending")) {
    throw new Error("withdrawals list missing pending id");
  }
  console.log(`PASS  withdrawals list n=${listJ.withdrawals.length}`);

  const done = await fetch(`${API}/admin/withdraw/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Admin-Token": admin },
    body: JSON.stringify({ id: wdId, tx_id: `ops-complete-${Date.now()}` }),
  });
  const doneJ = (await done.json()) as { withdraw?: { status?: string }; ok?: boolean };
  if (!done.ok) throw new Error(`admin complete ${done.status} ${JSON.stringify(doneJ)}`);
  console.log(`PASS  ops complete CLI status=${doneJ.withdraw?.status || "ok"}`);

  console.log(`[operator-soft-launch] OK — ${API} · ${addr}`);
}

main().catch((e) => {
  console.error("[operator-soft-launch] FAIL", e);
  process.exit(1);
});
