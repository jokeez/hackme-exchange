#!/usr/bin/env npx tsx
/**
 * Funded aggressive HMC/USDT pump + all-pair L2/tape audit on public desk.
 *
 *   EXCHANGE_OPS_SSH=root@89.150.41.40 npx tsx scripts/desk_aggressive_pump_audit.ts
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { execSync } from "node:child_process";
import { webcrypto } from "node:crypto";

ed.etc.sha512Sync ??= (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const BASE = (process.env.EXCHANGE_DESK_BASE || "https://exchange.hackme.tech/desk-api").replace(/\/$/, "");
const OPS_SSH = process.env.EXCHANGE_OPS_SSH || "root@89.150.41.40";
const PAIRS = ["HMC/USDT", "SUP/USDT", "HMC/SUP", "HMC/BTC", "SUP/BTC"] as const;

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
function minor(n: number): number {
  return Math.round(n * 1e8);
}
function disp(minors: number): number {
  return minors / 1e8;
}

async function main() {
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const pub = ed.getPublicKey(seed);
  const addr = `HMC-${hex(sha256(pub)).slice(0, 16)}`;
  const jar = new Map<string, string>();
  let csrf = "";

  const parse = (res: Response) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
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
    parse(res);
    return { res, body: await res.json().catch(() => ({})) };
  };

  const bookMid = async (pair: string) => {
    const q = encodeURIComponent(pair);
    const { body } = await api(`/book?pair=${q}`);
    const bids = body.bids ?? [];
    const asks = body.asks ?? [];
    const bid = Number(bids[0]?.price ?? 0);
    const ask = Number(asks[0]?.price ?? 0);
    if (bid > 0 && ask > 0 && ask >= bid) return { mid: (bid + ask) / 2, bid, ask, n: bids.length + asks.length };
    return { mid: bid || ask || 0, bid, ask, n: bids.length + asks.length };
  };

  const auditPairs = async (label: string) => {
    console.log(`\n--- ${label} ---`);
    for (const pair of PAIRS) {
      const b = await bookMid(pair);
      const tr = await api(`/trades?pair=${encodeURIComponent(pair)}&limit=3`);
      const lastPx = tr.body?.trades?.[0]?.price ?? 0;
      const midD = disp(b.mid);
      const lastD = disp(Number(lastPx));
      const gap =
        midD > 0 && lastD > 0 ? Math.abs(midD - lastD) / midD : 0;
      const flag = gap > 0.05 ? "WARN" : "ok";
      console.log(
        `${flag} ${pair} mid=${midD.toFixed(8)} bid=${disp(b.bid).toFixed(8)} ask=${disp(b.ask).toFixed(8)} last=${lastD.toFixed(8)} depth=${b.n}`,
      );
    }
  };

  const health = await api("/health");
  if (health.body?.matching !== "ok") throw new Error(`matching ${JSON.stringify(health.body)}`);
  console.log("PASS health matching=ok");

  const ch = await api("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: addr }),
  });
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
  csrf = ver.body.csrf_token;
  if (!csrf) throw new Error("verify failed");
  console.log(`PASS connect ${addr}`);

  const tx = `pump-${Date.now()}`;
  const remote = `set -euo pipefail
TOKEN=$(grep '^EXCHANGE_ADMIN_TOKEN=' /opt/hackme-exchange-api/.env.ops-admin.local | cut -d= -f2-)
curl -fsS --max-time 12 -X POST http://127.0.0.1:18445/admin/credit \\
  -H "Content-Type: application/json" -H "X-Admin-Token: $TOKEN" \\
  -d '{"tx_id":"${tx}-u","address":"${addr}","asset":"USDT","amount":80000000000}'
echo
curl -fsS --max-time 12 -X POST http://127.0.0.1:18445/admin/credit \\
  -H "Content-Type: application/json" -H "X-Admin-Token: $TOKEN" \\
  -d '{"tx_id":"${tx}-h","address":"${addr}","asset":"HMC","amount":20000000000}'
echo`;
  execSync(`ssh -o BatchMode=yes -o ConnectTimeout=15 ${OPS_SSH} bash -s`, {
    input: remote,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  console.log("PASS ops credit 800 USDT + 20 HMC");

  await auditPairs("before pump");

  const before = await bookMid("HMC/USDT");
  console.log(`\nHMC/USDT mid before ${disp(before.mid).toFixed(8)}`);

  let buys = 0;
  let totalBase = 0;
  const rounds = 12;
  for (let r = 0; r < rounds; r++) {
    const b = await bookMid("HMC/USDT");
    const ask = b.ask;
    if (!(ask > 0)) {
      console.log(`round ${r}: empty ask — stop`);
      break;
    }
    // Aggressive taker: slip up to +12% above ask (within soft band).
    const slipPx = Math.floor(ask * 1.12);
    const qtyHmc = r % 3 === 0 ? 2.5 : r % 3 === 1 ? 1.5 : 3.0;
    const qty = minor(qtyHmc);
    const t0 = Date.now();
    const mkt = await api("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pair: "HMC/USDT",
        side: "buy",
        type: "market",
        qty,
        price: slipPx,
      }),
    });
    const ms = Date.now() - t0;
    if (!mkt.res.ok) {
      console.log(`round ${r} FAIL buy ${mkt.res.status} ${JSON.stringify(mkt.body)}`);
      if (/insufficient|balance/i.test(JSON.stringify(mkt.body))) break;
      continue;
    }
    buys += 1;
    const filled = (mkt.body.fills ?? []).reduce((s: number, f: { qty?: number }) => s + Number(f.qty || 0), 0);
    totalBase += filled / 1e8;
    const fillPx = mkt.body.fills?.[0]?.price ?? 0;
    console.log(
      `round ${r} BUY ${qtyHmc} HMC @~${disp(Number(fillPx)).toFixed(6)} in ${ms}ms fills=${mkt.body.fills?.length ?? 0}`,
    );
    await new Promise((r) => setTimeout(r, 350));
  }

  const after = await bookMid("HMC/USDT");
  const delta = disp(after.mid) - disp(before.mid);
  const deltaPct = before.mid > 0 ? (delta / disp(before.mid)) * 100 : 0;
  console.log(
    `\nHMC/USDT mid after ${disp(after.mid).toFixed(8)} Δ=${delta.toFixed(8)} (${deltaPct.toFixed(2)}%) buys=${buys} base≈${totalBase.toFixed(2)}`,
  );

  // Tape last prints
  const tape = await api("/trades?pair=HMC%2FUSDT&limit=8");
  const prices = (tape.body.trades ?? []).map((t: { price: number }) => disp(t.price));
  console.log("tape last px:", prices.slice(0, 6).map((p: number) => p.toFixed(6)).join(", "));

  await auditPairs("after pump");

  // Partial take-profit sells (keep some HMC)
  const bal = await api("/balances");
  const hmcFree = Number((bal.body.balances ?? []).find((b: { asset: string }) => b.asset === "HMC")?.free ?? 0);
  if (hmcFree > minor(1)) {
    const sellQty = Math.floor(hmcFree * 0.15);
    const b = await bookMid("HMC/USDT");
    const sell = await api("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pair: "HMC/USDT",
        side: "sell",
        type: "market",
        qty: sellQty,
        price: Math.floor(b.bid * 0.88),
      }),
    });
    console.log(
      sell.res.ok
        ? `PASS trim sell ${disp(sellQty).toFixed(2)} HMC`
        : `WARN trim sell ${sell.res.status} ${JSON.stringify(sell.body)}`,
    );
  }

  console.log("\nDONE pump+audit");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
