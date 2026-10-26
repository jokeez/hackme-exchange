#!/usr/bin/env node
/**
 * Playwright: assert 1m series is time-contiguous to wall-clock tip and tip≈header Last.
 *   node scripts/candle_continuity_pw.mjs
 *   EX_LIVE_BASE=https://exchange.hackme.tech node scripts/candle_continuity_pw.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.EX_LIVE_BASE || "").replace(/\/$/, "");
const fail = [];

async function localUnitProof() {
  const server = await createServer({
    root: resolve(__dirname, ".."),
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const mod = await server.ssrLoadModule("/src/candles.ts");
    const { ensureContiguousCandles, candlesAreContiguous, hydrateLiveCandlesFromPrints, CANDLE_BASE_TF } =
      mod;
    const nowMs = Date.UTC(2026, 9, 24, 15, 0, 0);
    const sec = 60;
    const tip = Math.floor(nowMs / 1000 / sec) * sec;
    const sparse = [
      { time: tip - 200 * sec, open: 0.072, high: 0.073, low: 0.071, close: 0.072, volume: 2 },
      { time: tip - 140 * sec, open: 0.078, high: 0.079, low: 0.077, close: 0.078, volume: 2 },
      { time: tip - 90 * sec, open: 0.065, high: 0.066, low: 0.064, close: 0.065, volume: 2 },
      { time: tip - 40 * sec, open: 0.068, high: 0.069, low: 0.067, close: 0.068, volume: 2 },
    ];
    const healed = ensureContiguousCandles(sparse, "1m", {
      pairId: "HMC_USDT",
      fillToNow: true,
      nowMs,
    });
    if (!candlesAreContiguous(healed, "1m")) fail.push("unit: ensureContiguous not contiguous");
    if (healed.at(-1).time !== tip) fail.push("unit: tip not filled to now");
    // No diagonal ramp: synthetic (vol=0) bars must hold prior close flat.
    for (let i = 1; i < healed.length; i++) {
      const cur = healed[i];
      const prev = healed[i - 1];
      if (cur.volume !== 0) continue;
      if (Math.abs(cur.close - prev.close) > 1e-15) {
        fail.push(`unit: synthetic ramp Δclose at t=${cur.time} ${prev.close}→${cur.close}`);
        break;
      }
      if (cur.open !== cur.close || cur.high !== cur.close || cur.low !== cur.close) {
        fail.push(`unit: synthetic not flat OHL=C at t=${cur.time}`);
        break;
      }
    }
    const all = hydrateLiveCandlesFromPrints(
      "HMC_USDT",
      [{ ts: tip * 1000, price: 0.069, amountBase: 1 }],
      0.069,
      nowMs,
      null,
      undefined,
      sparse,
    );
    const base = all[CANDLE_BASE_TF];
    if (!candlesAreContiguous(base, "1m")) fail.push("unit: hydrate not contiguous");
    if (base.at(-1).time !== tip) fail.push("unit: hydrate tip missing");
    if (Math.abs(base.at(-1).close - 0.069) / 0.069 > 0.008) fail.push("unit: tip≠Last");

    // Bridges must paint (no LWC whitespace voids); never invent Soft-MM wick comb.
    const { displayCapCandles } = await server.ssrLoadModule("/src/chartScale.ts");
    const { toLwcOhlcPoints, isFlatGapBridge } = mod;
    const painted = displayCapCandles(base, "1m");
    const pts = toLwcOhlcPoints(painted);
    let comb = 0, maxComb = 0, paintedBridges = 0, whitespace = 0;
    let maxHole = 0;
    for (let i = 0; i < painted.length; i++) {
      if (!("open" in pts[i])) {
        whitespace++;
        continue;
      }
      if (i > 0 && "open" in pts[i - 1]) {
        const hole = Math.round((pts[i].time - pts[i - 1].time) / sec);
        if (hole > maxHole) maxHole = hole;
      }
      if (i === painted.length - 1) continue;
      const c = painted[i];
      const body = Math.abs(c.close - c.open) / Math.max(c.close, 1e-12);
      const span = (c.high - c.low) / Math.max(c.close, 1e-12);
      // Invented flatTape pad lived ~0.15–0.9%; exclude real ≥1% traded ranges.
      if (body < 0.0015 && span > 0.0012 && span < 0.009) {
        comb++;
        maxComb = Math.max(maxComb, comb);
      } else comb = 0;
      if (isFlatGapBridge(c)) {
        paintedBridges++;
        if (span !== 0) fail.push(`unit: bridge wick at t=${c.time}`);
      }
    }
    if (maxComb >= 6) fail.push(`unit: flat wick comb run=${maxComb}`);
    if (whitespace > 0) fail.push(`unit: LWC whitespace holes=${whitespace}`);
    if (maxHole > 1) fail.push(`unit: painted step hole=${maxHole} (>1 interval)`);
    if (paintedBridges < 10) fail.push(`unit: expected painted flat bridges, got ${paintedBridges}`);
    if (!("open" in pts[pts.length - 1])) fail.push("unit: tip not painted");

    // Screenshot-class 15m multi-day void + mid-orphan must paint contiguous bridges.
    const sec15 = 900;
    const tip15 = Math.floor(nowMs / 1000 / sec15) * sec15;
    const sparse15 = [
      { time: tip15 - 288 * sec15, open: 0.072, high: 0.073, low: 0.071, close: 0.072, volume: 2 },
      { time: tip15 - 200 * sec15, open: 0.074, high: 0.0745, low: 0.0705, close: 0.071, volume: 0.5 },
      { time: tip15 - 80 * sec15, open: 0.068, high: 0.069, low: 0.067, close: 0.068, volume: 2 },
      { time: tip15 - 10 * sec15, open: 0.078, high: 0.079, low: 0.07, close: 0.079, volume: 3 },
    ];
    const healed15 = ensureContiguousCandles(sparse15, "15m", {
      pairId: "HMC_USDT",
      fillToNow: true,
      nowMs,
    });
    if (!candlesAreContiguous(healed15, "15m")) fail.push("unit15: not contiguous");
    if (healed15.at(-1).time !== tip15) fail.push("unit15: tip not filled to now");
    const painted15 = displayCapCandles(healed15, "15m");
    const pts15 = toLwcOhlcPoints(painted15);
    let hole15 = 0;
    let ws15 = 0;
    for (let i = 0; i < pts15.length; i++) {
      if (!("open" in pts15[i])) ws15++;
      else if (i > 0 && "open" in pts15[i - 1]) {
        const h = Math.round((pts15[i].time - pts15[i - 1].time) / sec15);
        if (h > hole15) hole15 = h;
      }
    }
    if (ws15 > 0) fail.push(`unit15: whitespace=${ws15}`);
    if (hole15 > 1) fail.push(`unit15: painted hole=${hole15} (>1 × 15m)`);
    const bridges15 = healed15.filter(isFlatGapBridge).length;
    if (bridges15 < 50) fail.push(`unit15: expected multi-day bridges, got ${bridges15}`);

    console.log(`[continuity] unit ok n=${base.length} bridges15=${bridges15}`);
  } finally {
    await server.close();
  }
}

async function liveProbe() {
  if (!BASE) {
    console.log("[continuity] skip live (set EX_LIVE_BASE)");
    return;
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("#chart-host canvas, #chart-host", { timeout: 25_000 });
    await page.waitForTimeout(2500);
    await page.locator('[data-tf="1m"], .tfq[data-tf="1m"]').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    const probe = await page.evaluate(() => {
      const host = document.getElementById("chart-host");
      const lastTxt = (document.querySelector(".tb-price")?.textContent || "").replace(/[^\d.]/g, "");
      const headerLast = Number(lastTxt) || 0;
      const chart = window.__hackmeChart;
      const c = chart?.getDisplayedCandles?.() || [];
      const tipClose = chart?.getDisplayedLastCandle?.()?.close ?? c.at(-1)?.close ?? 0;
      const deltas = [];
      for (let i = 1; i < c.length; i++) {
        const d = c[i].time - c[i - 1].time;
        if (d > 0) deltas.push(d);
      }
      deltas.sort((a, b) => a - b);
      const step = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
      let gaps = 0;
      if (step > 0) for (const d of deltas) if (d !== step) gaps++;
      const drift =
        tipClose > 0 && headerLast > 0
          ? Math.abs(tipClose - headerLast) / Math.max(tipClose, headerLast)
          : 0;
      return {
        n: c.length,
        gaps: c.length ? gaps : -1,
        step,
        tipTime: c.at(-1)?.time ?? 0,
        tipClose,
        headerLast,
        tipHeaderDrift: drift,
        hasCanvas: !!host?.querySelector("canvas"),
        hostW: host?.clientWidth || 0,
        hostH: host?.clientHeight || 0,
        boot: document.querySelector('script[src*="boot-"]')?.getAttribute("src") || "",
      };
    });
    console.log("[continuity] live", probe);
    if (!probe.hasCanvas) fail.push("live: no canvas");
    // Painted series may include display bridges; fail only on sparse islands.
    if (probe.n > 40 && probe.gaps > Math.max(3, probe.n * 0.05)) {
      fail.push(`live: ${probe.gaps} time gaps in ${probe.n} bars (step=${probe.step})`);
    }
    if (probe.tipClose > 0 && probe.headerLast > 0 && probe.tipHeaderDrift > 0.01) {
      fail.push(
        `live: tip↔header drift ${(probe.tipHeaderDrift * 100).toFixed(2)}% tip=${probe.tipClose} last=${probe.headerLast}`,
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

await localUnitProof();
await liveProbe();
if (fail.length) {
  console.error("[continuity] FAIL", fail);
  process.exit(1);
}
console.log("[continuity] PASS");
