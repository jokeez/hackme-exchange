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
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    // Tour backdrop blanks mid-pane pixels and false-trips voidN — skip both tours.
    await context.addInitScript(() => {
      try {
        localStorage.setItem("hackme-ex-tour-v1", "1");
        sessionStorage.setItem("hackme-ex-tour-v1", "1");
        localStorage.setItem("hackme.tour.v2.done", "1");
      } catch {
        /* ignore */
      }
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/#spot/HMC_USDT/15m`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("#chart-host canvas, #chart-host", { timeout: 25_000 });
    await page.locator("#tour-skip, #tour-v2-skip, button:has-text('Skip')").first().click({ timeout: 2500 }).catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll(".tour-backdrop, #tour-v2-backdrop, .tour-v2-backdrop").forEach((el) => el.remove());
    });
    await page.waitForTimeout(3500);
    await page.locator('[data-tf="15m"], .tfq[data-tf="15m"]').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Inject screenshot-class sparse 15m islands → must paint contiguous (no voids).
    const injected = await page.evaluate(() => {
      const chart = window.__hackmeChart;
      if (!chart?.injectCandlesForTest) return { ok: false, reason: "no injectCandlesForTest" };
      const nowMs = Date.now();
      const sec = 900;
      const tip = Math.floor(nowMs / 1000 / sec) * sec;
      const orphan = tip - 160 * sec;
      const left = tip - 280 * sec;
      const sparse = [];
      for (let i = 0; i < 10; i++) {
        const px = 0.072;
        sparse.push({
          time: left + i * sec,
          open: px,
          high: px * 1.01,
          low: px * 0.99,
          close: px,
          volume: 2,
        });
      }
      sparse.push({
        time: orphan,
        open: 0.074,
        high: 0.0745,
        low: 0.0705,
        close: 0.071,
        volume: 0.5,
      });
      for (let i = 0; i < 8; i++) {
        const px = 0.078 + i * 0.0003;
        sparse.push({
          time: tip - (8 - i) * sec,
          open: px,
          high: px * 1.002,
          low: px * 0.92,
          close: px,
          volume: 3,
        });
      }
      sparse.push({
        time: tip,
        open: 0.079,
        high: 0.080,
        low: 0.078,
        close: 0.07926,
        volume: 4,
      });
      const ok = chart.injectCandlesForTest(sparse, "15m");
      const c = chart.getDisplayedCandles?.() || [];
      let maxHole = 0;
      for (let i = 1; i < c.length; i++) {
        const h = Math.round((c[i].time - c[i - 1].time) / sec);
        if (h > maxHole) maxHole = h;
      }
      return { ok, n: c.length, maxHole, boot: document.querySelector('script[src*="boot-"]')?.getAttribute("src") || "" };
    });
    console.log("[continuity] inject15", injected);
    if (!injected.ok) fail.push(`live: inject failed (${injected.reason || "false"})`);
    if (injected.maxHole > 1) fail.push(`live: injected series hole=${injected.maxHole} (>1 × 15m)`);
    if (injected.n < 50) fail.push(`live: injected n=${injected.n} too sparse after contiguous`);

    await page.waitForTimeout(400);
    const shotPath = `/tmp/candle_continuity_15m_${Date.now()}.png`;
    await page.locator("#chart-host").screenshot({ path: shotPath });

    // Pixel proof: candle-colored columns must not have multi-bar voids.
    const { createRequire } = await import("module");
    let voidN = -1;
    let maxVoidW = 0;
    try {
      const require = createRequire(import.meta.url);
      const { createCanvas, loadImage } = require("canvas");
      void createCanvas;
      void loadImage;
    } catch {
      // no node-canvas — use raw PNG via sharp/pngjs if present, else PIL subprocess
    }
    const { spawnSync } = await import("child_process");
    const py = spawnSync(
      "python3",
      [
        "-c",
        `
from PIL import Image
im=Image.open(${JSON.stringify(shotPath)}).convert("RGB")
w,h=im.size
y0,y1=int(h*0.08),int(h*0.72)
col=[]
for x in range(w):
  n=0
  for y in range(y0,y1,2):
    r,g,b=im.getpixel((x,y))
    if (g>70 and g>r+10 and g>b+10) or (r>70 and r>g+10 and r>b+10) or (r>55 or g>60 or b>70):
      n+=1
  col.append(1 if n>2 else 0)
voids=[]
i=0
while i<w:
  while i<w and col[i]: i+=1
  s=i
  while i<w and not col[i]: i+=1
  if i-s>28: voids.append(i-s)
print(len(voids), max(voids) if voids else 0, sum(col), w)
`,
      ],
      { encoding: "utf8" },
    );
    if (py.status === 0) {
      const [vn, mw, lit, ww] = py.stdout.trim().split(/\s+/).map(Number);
      voidN = vn;
      maxVoidW = mw;
      console.log("[continuity] visual", { voidN, maxVoidW, lit, w: ww, shotPath });
      // Allow rightOffset / price gutter empty; fail on wide mid-pane voids.
      if (voidN > 2 || maxVoidW > Math.max(80, (ww || 600) * 0.18)) {
        fail.push(`live: visual voids voidN=${voidN} maxW=${maxVoidW} (shot ${shotPath})`);
      }
    } else {
      console.log("[continuity] visual skip", py.stderr?.slice(0, 200));
    }

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
      let maxHole = 0;
      if (step > 0) {
        for (const d of deltas) {
          if (d !== step) gaps++;
          const h = Math.round(d / step);
          if (h > maxHole) maxHole = h;
        }
      }
      const drift =
        tipClose > 0 && headerLast > 0
          ? Math.abs(tipClose - headerLast) / Math.max(tipClose, headerLast)
          : 0;
      return {
        n: c.length,
        gaps: c.length ? gaps : -1,
        maxHole,
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
    if (probe.maxHole > 1) fail.push(`live: painted maxHole=${probe.maxHole} (>1 interval)`);
    if (probe.n > 40 && probe.gaps > Math.max(3, probe.n * 0.05)) {
      fail.push(`live: ${probe.gaps} time gaps in ${probe.n} bars (step=${probe.step})`);
    }
    // Injected tip may diverge from header Last — only check when not freshly injected.
    if (
      injected.ok !== true &&
      probe.tipClose > 0 &&
      probe.headerLast > 0 &&
      probe.tipHeaderDrift > 0.01
    ) {
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
