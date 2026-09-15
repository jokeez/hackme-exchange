#!/usr/bin/env npx tsx
/**
 * Helper for d1_node_watch_e2e.sh — auth + HMC/SUP deposit addresses (no lab mint).
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const API = (process.env.EXCHANGE_API_ORIGIN || "http://127.0.0.1:18445").replace(/\/$/, "");
const SEED = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const seed = Uint8Array.from(SEED.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
const jar = new Map<string, string>();

function hex(b: Uint8Array) {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
function note(r: Response) {
  for (const c of r.headers.getSetCookie?.() || []) {
    const [p] = c.split(";");
    const i = p.indexOf("=");
    if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
}
function cookie() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const pub = await ed.getPublicKeyAsync(seed);
const addr = `HMC-${hex(sha256(pub)).slice(0, 16)}`;

let r = await fetch(`${API}/auth/challenge`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: addr }),
});
note(r);
let j = await r.json();
const msg = new TextEncoder().encode(j.message);
const sig = await ed.signAsync(msg, seed);
r = await fetch(`${API}/auth/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie() },
  body: JSON.stringify({
    challenge_id: j.challenge_id,
    address: addr,
    pubkey_ed25519: hex(pub),
    sig_ed25519: hex(sig),
  }),
});
note(r);
j = await r.json();
r = await fetch(`${API}/deposit/address?asset=HMC`, { headers: { Cookie: cookie() } });
note(r);
const depH = await r.json();
r = await fetch(`${API}/deposit/address?asset=SUP`, { headers: { Cookie: cookie() } });
note(r);
const depS = await r.json();
if (!depH.deposit_address?.startsWith("HMC-") || !depS.deposit_address?.startsWith("HMC-")) {
  console.error(JSON.stringify({ depH, depS }));
  process.exit(1);
}
console.log(
  JSON.stringify({
    addr,
    csrf: j.csrf_token,
    cookie: cookie(),
    deposit: depH.deposit_address,
    deposit_sup: depS.deposit_address,
    kind: depH.kind,
    kind_sup: depS.kind,
  }),
);
