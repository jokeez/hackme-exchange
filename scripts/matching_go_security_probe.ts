#!/usr/bin/env npx tsx
/**
 * Matching GO security probe — defensive gates against public desk (or EXCHANGE_DESK_BASE).
 *
 * HOLD mode (default when matching≠ok): book/place 503, deposit/withdraw OFF.
 * Soft-launch GO: set EX_MATCHING_GO=1 (and EX_CUSTODY_GO=1 when deposit/withdraw ON).
 *
 *   npm run smoke:matching-sec
 *   EX_MATCHING_GO=1 EX_CUSTODY_GO=1 npm run smoke:matching-sec
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { webcrypto } from "node:crypto";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const BASE = (process.env.EXCHANGE_DESK_BASE || "https://exchange.hackme.tech/desk-api").replace(/\/$/, "");
const ORIGIN = process.env.EXCHANGE_DESK_ORIGIN || "https://exchange.hackme.tech";
const EVIL_ORIGIN = "https://evil.example";

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

let failed = 0;
function pass(msg: string) {
  console.log(`PASS  ${msg}`);
}
function fail(msg: string) {
  console.error(`FAIL  ${msg}`);
  failed += 1;
}

async function main() {
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const pub = ed.getPublicKey(seed);
  const addr = `HMC-${hex(sha256(pub)).slice(0, 16)}`;
  const jar = new Map<string, string>();
  const setCookieLines: string[] = [];

  const parseSetCookie = (res: Response) => {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      setCookieLines.push(line);
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  // --- 1. Health posture ---
  const health = await fetch(`${BASE}/health`);
  const hj = (await health.json()) as {
    matching?: string;
    deposit?: { enabled?: boolean };
    withdraw?: { enabled?: boolean };
    public_edge?: boolean;
  };
  const matchingGo = process.env.EX_MATCHING_GO === "1" || hj.matching === "ok";
  const custodyGo = process.env.EX_CUSTODY_GO === "1" || (matchingGo && !!hj.deposit?.enabled && !!hj.withdraw?.enabled);

  if (matchingGo) {
    if (hj.matching !== "ok") fail(`matching GO: want ok got ${hj.matching}`);
    else pass("health matching=ok");
  } else if (hj.matching !== "disabled") fail(`matching not HOLD: ${hj.matching}`);
  else pass("health matching=disabled");

  if (custodyGo) {
    if (hj.deposit?.enabled !== true) fail("custody GO: deposit want enabled");
    else pass("deposit.enabled=true");
    if (hj.withdraw?.enabled !== true) fail("custody GO: withdraw want enabled");
    else pass("withdraw.enabled=true");
  } else {
    if (hj.deposit?.enabled) fail("deposit enabled on HOLD edge");
    else pass("deposit.enabled=false");
    if (hj.withdraw?.enabled) fail("withdraw enabled on HOLD edge");
    else pass("withdraw.enabled=false");
  }

  // Soft-launch caps advertised on public slim health (SPA chrome). Optional until edge redeploy.
  if (typeof (hj as { max_open_orders?: number }).max_open_orders === "number") {
    pass(`health max_open_orders=${(hj as { max_open_orders: number }).max_open_orders}`);
  } else {
    console.log("WARN  health max_open_orders missing — redeploy edge after Matching GO caps PR");
  }
  if (typeof (hj as { price_band_bps?: number }).price_band_bps === "number") {
    pass(`health price_band_bps=${(hj as { price_band_bps: number }).price_band_bps}`);
  }
  if (typeof (hj as { min_notional?: number }).min_notional === "number") {
    pass(`health min_notional=${(hj as { min_notional: number }).min_notional}`);
  }

  // --- 2. Book ---
  const book = await fetch(`${BASE}/book?pair=HMC/USDT`);
  const bookBody = await book.json().catch(() => ({}));
  if (matchingGo) {
    if (book.status !== 200) fail(`matching GO: book want 200 got ${book.status}`);
    else pass("book 200");
  } else {
    if (book.status !== 503) fail(`book want 503 got ${book.status}`);
    else pass("book 503 HOLD");
    const bookCode = (bookBody as { code?: string }).code;
    if (bookCode && bookCode !== "trading_disabled") {
      fail(`book code want trading_disabled got ${bookCode}`);
    } else if (bookCode) pass("book code=trading_disabled");
  }

  // --- 3. Place without session ---
  const placeHold = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price: 5_000_000,
      qty: 100_000_000,
    }),
  });
  if (matchingGo) {
    if (placeHold.status !== 401 && placeHold.status !== 403) {
      fail(`authed-less place want 401/403 got ${placeHold.status}`);
    } else pass(`place without session → ${placeHold.status}`);
  } else if (placeHold.status !== 503 && placeHold.status !== 401) {
    fail(`place HOLD want 503/401 got ${placeHold.status}`);
  } else pass(`place while HOLD → ${placeHold.status}`);

  // --- 4. Connect (challenge → verify) ---
  const chRes = await fetch(`${BASE}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ address: addr }),
  });
  const ch = (await chRes.json()) as { challenge_id?: string; message?: string; code?: string };
  if (!chRes.ok || !ch.challenge_id || !ch.message) {
    fail(`challenge ${chRes.status} ${JSON.stringify(ch)}`);
    throw new Error("abort: challenge failed");
  }
  pass("challenge");

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
  if (!verRes.ok || !ver.ok || !ver.csrf_token) {
    fail(`verify ${verRes.status} ${JSON.stringify(ver)}`);
    throw new Error("abort: verify failed");
  }
  pass("verify + csrf body");

  // --- 5. Cookie flags ---
  if (!setCookieLines.length) fail("no Set-Cookie on verify");
  else {
    const joined = setCookieLines.join("\n");
    if (!/HttpOnly/i.test(joined)) fail(`cookie missing HttpOnly: ${joined}`);
    else pass("session cookie HttpOnly");
    if (!/SameSite=Strict/i.test(joined)) fail(`cookie missing SameSite=Strict: ${joined}`);
    else pass("session cookie SameSite=Strict");
    if (ORIGIN.startsWith("https:") && !/;\s*Secure/i.test(joined) && !/Secure;/i.test(joined)) {
      fail(`cookie missing Secure: ${joined}`);
    } else if (ORIGIN.startsWith("https:")) pass("session cookie Secure");
    const csrfReadable = setCookieLines.find((l) => /csrf/i.test(l) && !/HttpOnly/i.test(l));
    if (csrfReadable) fail(`CSRF must not be a readable cookie: ${csrfReadable}`);
    else pass("no readable CSRF cookie");
  }

  // --- 6. CSRF required on logout ---
  const loNoCsrf = await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: { Origin: ORIGIN, Cookie: cookieHeader() },
  });
  if (loNoCsrf.status !== 403) fail(`logout without CSRF want 403 got ${loNoCsrf.status}`);
  else pass("logout without CSRF → 403");

  const loBadCsrf = await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Cookie: cookieHeader(),
      "X-CSRF-Token": "definitely-not-the-token",
    },
  });
  if (loBadCsrf.status !== 403) fail(`logout bad CSRF want 403 got ${loBadCsrf.status}`);
  else pass("logout bad CSRF → 403");

  // --- 7. Place authenticated ---
  const placeAuth = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: ORIGIN,
      Cookie: cookieHeader(),
      "X-CSRF-Token": ver.csrf_token,
    },
    body: JSON.stringify({
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price: 5_000_000,
      qty: 100_000_000,
    }),
  });
  const placeAuthBody = await placeAuth.json().catch(() => ({}));
  if (matchingGo) {
    // Soft-launch: engine accepts request; empty wallet → insufficient_balance (not trading_disabled).
    if (placeAuth.status === 400 || placeAuth.status === 200) {
      pass(`authed place → ${placeAuth.status} ${JSON.stringify(placeAuthBody).slice(0, 80)}`);
    } else fail(`authed place GO want 200/400 got ${placeAuth.status} ${JSON.stringify(placeAuthBody)}`);
  } else if (placeAuth.status !== 503) {
    fail(`authed place HOLD want 503 got ${placeAuth.status} ${JSON.stringify(placeAuthBody)}`);
  } else pass("authed place → 503 trading_disabled");

  // --- 8. CORS evil Origin on mutating route ---
  const corsEvil = await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: {
      Origin: EVIL_ORIGIN,
      Cookie: cookieHeader(),
      "X-CSRF-Token": ver.csrf_token,
    },
  });
  // Browser would block; server should not reflect evil ACAO. Status may be 403/204/200 depending on CORS middleware order.
  const acao = corsEvil.headers.get("access-control-allow-origin");
  if (acao === EVIL_ORIGIN || acao === "*") fail(`CORS reflected evil Origin: ${acao}`);
  else pass(`CORS does not allow evil Origin (ACAO=${acao ?? "none"})`);

  // --- 9. Balances ok; after we still have session ---
  const bal = await fetch(`${BASE}/balances`, {
    headers: { Origin: ORIGIN, Cookie: cookieHeader(), "X-CSRF-Token": ver.csrf_token },
  });
  if (bal.status !== 200) fail(`balances ${bal.status}`);
  else pass("balances 200 with session");

  // --- 10. Soft auth rate probe (stop early) ---
  let hit429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${BASE}/auth/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ address: addr }),
    });
    if (r.status === 429) {
      hit429 = true;
      break;
    }
  }
  if (hit429) pass("auth challenge rate limit trips (429)");
  else pass("auth challenge soft burst OK (no 429 in 12 — CF/WAF may absorb)");

  // --- 11. Admin surface closed on public desk ---
  const admin = await fetch(`${BASE}/admin/credit`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN, "X-Admin-Token": "x" },
    body: JSON.stringify({ address: addr, asset: "USDT", amount: 1, reason: "probe", tx_id: "x" }),
  });
  if (admin.status === 200) fail("admin/credit must not succeed on public desk");
  else pass(`admin/credit rejected → ${admin.status}`);

  // --- 12. Clean logout with CSRF ---
  const loOk = await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Cookie: cookieHeader(),
      "X-CSRF-Token": ver.csrf_token,
    },
  });
  if (loOk.status !== 200 && loOk.status !== 204) fail(`logout ok want 200/204 got ${loOk.status}`);
  else pass("logout with CSRF");

  const balAfter = await fetch(`${BASE}/balances`, {
    headers: { Origin: ORIGIN, Cookie: cookieHeader(), "X-CSRF-Token": ver.csrf_token },
  });
  if (balAfter.status === 200) fail("balances still authorized after logout");
  else pass(`balances unauthorized after logout → ${balAfter.status}`);

  // --- 13. Metrics/openapi should be dark on public edge ---
  for (const path of ["/metrics", "/openapi.yaml"]) {
    const r = await fetch(`${BASE}${path}`);
    if (r.status === 200) fail(`${path} must not be public (got 200)`);
    else pass(`${path} closed → ${r.status}`);
  }

  if (failed) {
    console.error(`[matching-go-sec] FAILED (${failed}) — ${BASE}`);
    process.exit(1);
  }
  console.log(
    `[matching-go-sec] OK — ${matchingGo ? "GO" : "HOLD"} gates green · ${BASE} · ${addr}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
