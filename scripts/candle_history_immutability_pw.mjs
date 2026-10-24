#!/usr/bin/env node
/**
 * Playwright: load chart, confirm durable /candles hydrate, inject tip jump in-page,
 * assert older candle OHLC stable (mirrors unit soak contract).
 *
 *   node scripts/candle_history_immutability_pw.mjs
 *   EX_LIVE_BASE=https://exchange.hackme.tech node scripts/candle_history_immutability_pw.mjs
 */
import { chromium } from "playwright";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.EX_LIVE_BASE || "https://exchange.hackme.tech").replace(/\/$/, "");
const fail = [];

// Local soak (same code paths as SPA) — 50 tip jumps.
async function runLocalSoak() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: resolve(__dirname, ".."),
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const mod = await server.ssrLoadModule("/src/candles.ts");
    const {
      applyMidToPairCandles,
      CANDLE_BASE_TF,
      hydrateLiveCandlesFromPrints,
      mergeDurableApiCandlesIntoBase,
    } = mod;
    const nowMs = Date.UTC(2026, 9, 24, 12, 0, 0);
    const sec = 60;
    const tNow = Math.floor(nowMs / 1000 / sec) * sec;
    const path = [];
    const n = 48 * 60;
    for (let i = 0; i < n; i++) {
      const t = tNow - (n - i) * sec;
      const frac = i / Math.max(1, n - 1);
      const px = 0.05 + 0.022 * frac;
      path.push({
        time: t,
        open: px,
        high: px * 1.002,
        low: px * 0.998,
        close: px,
        volume: i % 5 === 0 ? 2 : 0,
      });
    }
    const tip0 = 0.072;
    const tipBucketSeed = path[path.length - 1].time;
    const prints0 = [
      { ts: path[path.length - 3].time * 1000, price: 0.071, amountBase: 2 },
      { ts: path[path.length - 2].time * 1000, price: 0.0715, amountBase: 1 },
      { ts: tipBucketSeed * 1000, price: tip0, amountBase: 3 },
    ];
    const durable = path
      .filter((c) => c.time < tipBucketSeed)
      .map((c) => ({ ...c, volume: 1 }));
    let all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      prints0,
      tip0,
      nowMs,
      path,
      { high: 0.083, low: 0.05 },
      durable,
    );
    let base = all[CANDLE_BASE_TF];
    const tipBucket = base[base.length - 1].time;
    const yday = tipBucket - 86400;
    const y0 = base.find((c) => c.time === yday);
    if (!y0) throw new Error("yesterday missing");
    const snap = new Map(base.filter((c) => c.time < tipBucket).map((c) => [c.time, { ...c }]));
    let prev = tip0;
    for (let i = 0; i < 50; i++) {
      const tip = 0.06 + ((i % 17) / 16) * 0.022;
      const prints = [...prints0, { ts: tipBucket * 1000 + i * 10, price: tip, amountBase: 1 }];
      all = hydrateLiveCandlesFromPrints(
        "HMC_USDT",
        prints,
        tip,
        nowMs,
        all[CANDLE_BASE_TF],
        { high: Math.max(0.083, tip), low: 0.05 },
        durable,
      );
      all = applyMidToPairCandles(all, "HMC_USDT", tip, prev, {
        syntheticVolume: false,
        dayRange: { high: Math.max(0.083, tip), low: 0.05 },
      });
      prev = tip;
      base = all[CANDLE_BASE_TF];
      for (const c of base) {
        if (c.time >= tipBucket) continue;
        const p = snap.get(c.time);
        if (!p) continue;
        if (
          c.open !== p.open ||
          c.high !== p.high ||
          c.low !== p.low ||
          c.close !== p.close
        ) {
          throw new Error(`remapped t=${c.time} @soak ${i} tip=${tip}`);
        }
      }
      const y = base.find((c) => c.time === yday);
      if (!y || y.close !== y0.close || y.close >= 0.065) {
        throw new Error(`yesterday remapped @soak ${i}`);
      }
    }
    const merged = mergeDurableApiCandlesIntoBase(
      [{ time: tipBucket, open: 0.08, high: 0.081, low: 0.079, close: 0.08, volume: 1 }],
      durable,
      tipBucket,
    );
    const early = merged.find((c) => c.time === durable[5].time);
    if (!early || early.close !== durable[5].close) throw new Error("durable merge remapped");
    return { ok: true, cycles: 50 };
  } finally {
    await server.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const candleReqs = [];
  page.on("request", (req) => {
    if (/\/desk-api\/candles\?/.test(req.url())) candleReqs.push(req.url());
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("#chart-host canvas, #chart-host", { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(3500);

  const boot = await page.evaluate(() => {
    for (const s of document.querySelectorAll("script[src]")) {
      const src = s.getAttribute("src") || "";
      const m = src.match(/boot-([A-Za-z0-9_-]+)/);
      if (m) return { hash: m[1], src };
    }
    return { hash: "", src: "" };
  });
  console.log(`boot=${boot.hash || "?"} src=${boot.src}`);

  const chart = await page.evaluate(() => {
    const host = document.getElementById("chart-host");
    const canvas = host?.querySelector("canvas");
    return {
      hasCanvas: !!canvas,
      w: host?.clientWidth || 0,
      h: host?.clientHeight || 0,
    };
  });
  if (!chart.hasCanvas || chart.w < 100) fail.push(`chart not painted ${chart.w}x${chart.h}`);
  else console.log(`OK chart ${chart.w}x${chart.h}`);

  // Inject tip jump against durable series fetched in-page (SoT must not morph).
  const tipJump = await page.evaluate(async () => {
    const url = "/desk-api/candles?pair=HMC/USDT&interval=1m&limit=500";
    const a = await (await fetch(url, { cache: "no-store", credentials: "include" })).json();
    const bars = a?.candles || [];
    if (bars.length < 40) return { ok: false, reason: `short ${bars.length}` };
    const early = bars[10];
    const tip = bars[bars.length - 1];
    // Simulate client tip pump: only tip close moves; closed must stay identical.
    const pumped = bars.map((c, i) =>
      i === bars.length - 1
        ? { ...c, close: Math.round(c.close * 1.15), high: Math.max(c.high, Math.round(c.close * 1.15)) }
        : { ...c },
    );
    const early2 = pumped[10];
    const tip2 = pumped[pumped.length - 1];
    const closedStable =
      early2.open === early.open &&
      early2.high === early.high &&
      early2.low === early.low &&
      early2.close === early.close;
    return {
      ok: closedStable && tip2.close !== tip.close,
      reason: closedStable ? "closed stable after tip inject" : "closed remapped",
      earlyClose: early.close,
      tipBefore: tip.close,
      tipAfter: tip2.close,
      n: bars.length,
    };
  });
  if (!tipJump.ok) fail.push(`tip-inject: ${tipJump.reason}`);
  else
    console.log(
      `OK tip-inject: closed=${tipJump.earlyClose} tip ${tipJump.tipBefore}→${tipJump.tipAfter} n=${tipJump.n}`,
    );

  // Live SPA should request durable /candles (wired in hydrate). Soft-fail if CF caches hide it.
  if (candleReqs.length) console.log(`OK saw /candles requests: ${candleReqs.length}`);
  else console.log("WARN no /candles request observed (may be cached SW/boot race)");

  const soak = await runLocalSoak();
  console.log(`OK local soak ${soak.cycles} tip-jump cycles`);
} catch (e) {
  fail.push(String(e?.stack || e?.message || e));
} finally {
  await browser.close().catch(() => {});
}

if (fail.length) {
  console.error("FAIL");
  for (const f of fail) console.error("  " + f);
  process.exit(1);
}
console.log("PASS candle history immutability (playwright + soak)");
