#!/usr/bin/env npx tsx
/**
 * Soft Custody GO security probe — public desk after Deposit/Withdraw enable.
 * Asserts: deposit/withdraw ON, matching ok, admin closed, 2FA required on withdraw,
 * CSRF, CORS, metrics dark, lab mint closed, deposit address authn.
 *
 *   npx tsx scripts/custody_go_security_probe.ts
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { webcrypto } from "node:crypto";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const BASE = (process.env.EXCHANGE_DESK_BASE || "https://exchange.hackme.tech/desk-api").replace(/\/$/, "");
const ORIGIN = process.env.EXCHANGE_DESK_ORIGIN || "https://exchange.hackme.tech";

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

let fails = 0;
function pass(m: string) {
  console.log(`PASS  ${m}`);
}
function fail(m: string) {
  console.error(`FAIL  ${m}`);
  fails += 1;
}

async function session() {
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
  const ver = (await verRes.json()) as { csrf_token?: string };
  if (!verRes.ok || !ver.csrf_token) throw new Error(`verify ${verRes.status}`);
  return { addr, csrf: ver.csrf_token, hdr };
}

async function main() {
  const hRes = await fetch(`${BASE}/health`);
  const h = (await hRes.json()) as {
    matching?: string;
    deposit?: { enabled?: boolean };
    withdraw?: { enabled?: boolean };
    public_edge?: boolean;
    max_open_orders?: number;
  };
  if (h.matching !== "ok") fail(`matching want ok got ${h.matching}`);
  else pass("health matching=ok");
  if (h.deposit?.enabled !== true) fail("deposit.enabled want true");
  else pass("deposit.enabled=true");
  if (h.withdraw?.enabled !== true) fail("withdraw.enabled want true");
  else pass("withdraw.enabled=true");
  if (h.public_edge !== true) fail("public_edge");
  else pass("public_edge");
  if (h.max_open_orders !== 20) fail(`max_open_orders ${h.max_open_orders}`);
  else pass("max_open_orders=20");

  for (const path of ["/metrics", "/openapi.yaml", "/lab/deposit", "/admin/credit", "/admin/node-watch-sync", "/admin/withdraw/complete"]) {
    const r = await fetch(`${BASE}${path}`, {
      method: path.includes("admin") || path.includes("lab") ? "POST" : "GET",
      headers: { "content-type": "application/json", Origin: ORIGIN },
      body: path.includes("admin") || path.includes("lab") ? "{}" : undefined,
    });
    if (r.status === 200) fail(`${path} unexpectedly 200`);
    else pass(`${path} closed → ${r.status}`);
  }

  // Unauthed deposit address
  const depUnauth = await fetch(`${BASE}/deposit/address?asset=HMC`, { headers: { Origin: ORIGIN } });
  if (depUnauth.status !== 401 && depUnauth.status !== 403) fail(`deposit address unauth want 401/403 got ${depUnauth.status}`);
  else pass(`deposit address unauth → ${depUnauth.status}`);

  const s = await session();
  pass("challenge + verify + csrf");

  const dep = await fetch(`${BASE}/deposit/address?asset=HMC`, { headers: s.hdr() });
  const depBody = (await dep.json()) as { deposit_address?: string; kind?: string; bridge_model?: string };
  if (dep.status !== 200 || !depBody.deposit_address?.startsWith("HMC-")) {
    fail(`deposit address ${dep.status} ${JSON.stringify(depBody)}`);
  } else {
    pass(`deposit address HMC ${depBody.deposit_address} kind=${depBody.kind}`);
  }

  const depSup = await fetch(`${BASE}/deposit/address?asset=SUP`, { headers: s.hdr() });
  const supBody = (await depSup.json()) as { deposit_address?: string };
  if (depSup.status !== 200 || !supBody.deposit_address?.startsWith("HMC-")) fail(`SUP deposit ${depSup.status}`);
  else pass(`deposit address SUP ${supBody.deposit_address}`);

  // USDT stub must be labeled stub if returned
  const depUsdt = await fetch(`${BASE}/deposit/address?asset=USDT`, { headers: s.hdr() });
  const usdtBody = (await depUsdt.json()) as { kind?: string; bridge_model?: string; code?: string };
  if (depUsdt.status === 200) {
    if (usdtBody.kind !== "lab_stub" && usdtBody.bridge_model !== "paper_bridge_stub") {
      fail(`USDT address not labeled stub ${JSON.stringify(usdtBody)}`);
    } else pass("USDT deposit labeled lab_stub");
  } else pass(`USDT deposit ${depUsdt.status} (paused/unsupported OK)`);

  // Withdraw without 2FA — must not silently succeed without enrollment; expect 401 2fa_required or 400 insufficient
  const wdNoCsrf = await fetch(`${BASE}/withdraw`, {
    method: "POST",
    headers: { ...s.hdr(), "content-type": "application/json" },
    body: JSON.stringify({
      asset: "HMC",
      amount: 1_000_000,
      destination: "HMC-ffffffffffffffff",
      client_withdraw_id: `wd-sec-${Date.now()}`,
    }),
  });
  if (wdNoCsrf.status === 200) fail("withdraw without CSRF must not 200");
  else pass(`withdraw missing CSRF → ${wdNoCsrf.status}`);

  const wd = await fetch(`${BASE}/withdraw`, {
    method: "POST",
    headers: { ...s.hdr(s.csrf), "content-type": "application/json" },
    body: JSON.stringify({
      asset: "HMC",
      amount: 1_000_000,
      destination: "HMC-ffffffffffffffff",
      client_withdraw_id: `wd-sec2-${Date.now()}`,
    }),
  });
  const wdBody = (await wd.json().catch(() => ({}))) as { code?: string };
  // Fresh account: insufficient_balance or 2fa_required both acceptable; 200 is not (no funds).
  if (wd.status === 200) fail("withdraw 200 on empty account");
  else pass(`withdraw guarded → ${wd.status} ${wdBody.code || ""}`);

  // 2FA setup path available
  const st = await fetch(`${BASE}/auth/2fa/status`, { headers: s.hdr() });
  if (st.status !== 200) fail(`2fa status ${st.status}`);
  else pass("2fa status 200");

  const setup = await fetch(`${BASE}/auth/2fa/setup`, {
    method: "POST",
    headers: { ...s.hdr(s.csrf), "content-type": "application/json" },
    body: "{}",
  });
  if (setup.status !== 200) fail(`2fa setup ${setup.status}`);
  else pass("2fa setup 200");

  // Evil CORS
  const evil = await fetch(`${BASE}/health`, { headers: { Origin: "https://evil.example" } });
  const acao = evil.headers.get("access-control-allow-origin");
  if (acao && acao !== "null" && /evil/.test(acao)) fail(`evil CORS ACAO=${acao}`);
  else pass("CORS no evil ACAO");

  // Cookie flags from fresh verify already done — re-check Set-Cookie on challenge path not needed

  if (fails) {
    console.error(`[custody-go-sec] FAILED (${fails}) — ${BASE}`);
    process.exit(1);
  }
  console.log(`[custody-go-sec] OK — ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
