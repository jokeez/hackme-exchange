/**
 * B-pass: deeper chart/pair manual audit (desktop).
 * Requires Vite on EX_UI_BASE (default http://127.0.0.1:5199/).
 *
 *   node scripts/b_chart_manual_pass.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cache", "b-chart-pass");
const findings = [];
const log = [];
const note = (sev, id, msg) => {
  findings.push({ sev, id, msg });
  log.push(`[${sev}] ${id}: ${msg}`);
};
const ok = (m) => log.push(`OK ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAIRS = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
const TFS = ["1m", "15m", "1H", "1D"];

async function dismiss(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      /* ignore */
    }
  });
  for (const sel of ["#tour-skip", "#tour-next", "[data-dismiss]"]) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      try {
        await el.click({ timeout: 600 });
      } catch {
        /* ignore */
      }
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await dismiss(page);
  await page.goto(BASE + "#spot", { waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
    await page.goto(BASE + "#spot", { waitUntil: "domcontentloaded", timeout: 30000 });
  });
  await sleep(900);
  await dismiss(page);
}

async function selectPair(page, pairId) {
  const row = page.locator(`.market-row[data-pair="${pairId}"]`).first();
  if (await row.count()) {
    try {
      await row.click({ timeout: 2000 });
      await sleep(500);
      return true;
    } catch {
      /* fall through */
    }
  }
  // Fallback: any data-pair control
  const alt = page.locator(`[data-pair="${pairId}"]`).first();
  if (await alt.count()) {
    try {
      await alt.click({ timeout: 1500 });
      await sleep(500);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function chartStats(page) {
  return page.evaluate(() => {
    const host =
      document.querySelector("#chart-host") ||
      document.querySelector("[id^='chart-host']") ||
      document.querySelector(".tv-lightweight-charts") ||
      document.querySelector("canvas");
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const prices = Array.from(document.querySelectorAll(".ticker-last, #ticker-last, .last-price, .price-last, .mono"))
      .map((el) => (el.textContent || "").trim())
      .filter((t) => /\d/.test(t))
      .slice(0, 8);
    const ohlc = (document.querySelector("#ohlc-legend, .ohlc-legend, .chart-ohlc")?.textContent || "").trim();
    const pct = (document.querySelector(".pct-24h, #chg-24h, .change-24h")?.textContent || "").trim();
    const activePair =
      document.querySelector("[data-active-pair]")?.getAttribute("data-active-pair") ||
      document.querySelector(".pair-active, .pair-label, #pair-label")?.textContent ||
      "";
    return {
      hasHost: !!host,
      canvasCount: canvases.length,
      canvasArea: canvases.reduce((s, c) => s + (c.width || 0) * (c.height || 0), 0),
      prices,
      ohlc,
      pct,
      activePair: String(activePair).trim().slice(0, 40),
      bodyTextHasPaper: /PAPER|Synthetic|not real/i.test(document.body.innerText || ""),
    };
  });
}

async function tryToggleTf(page, tf) {
  const btn = page.locator(`.tfq[data-tf="${tf}"], [data-tf="${tf}"]`).first();
  if (!(await btn.count())) return false;
  try {
    await btn.click({ timeout: 1200 });
    await sleep(350);
    return true;
  } catch {
    return false;
  }
}

async function tryEnableIndicator(page) {
  const tab = page.locator("#ind-tabs .ind").first();
  if (await tab.count()) {
    try {
      await tab.click({ timeout: 1200 });
      await sleep(300);
      return true;
    } catch {
      /* continue */
    }
  }
  for (const sel of ["#btn-indicators", "button:has-text('Indicators')", "button:has-text('Indicator')"]) {
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    try {
      await el.click({ timeout: 1200 });
      await sleep(250);
      await page.keyboard.press("Escape").catch(() => {});
      return true;
    } catch {
      /* continue */
    }
  }
  return false;
}

async function tryDrawHline(page) {
  const el = page.locator("#draw-tools .dt[data-dt='hline']").first();
  if (!(await el.count())) return false;
  try {
    await el.click({ timeout: 1000 });
    const box = await page.locator("#chart-host, .tv-lightweight-charts, canvas").first().boundingBox();
    if (!box) return false;
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.4);
    await sleep(250);
    await page.keyboard.press("Escape").catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

  try {
    await boot(page);
    const shell = await chartStats(page);
    if (!shell.hasHost && shell.canvasCount === 0) note("P0", "chart-missing", "No chart host/canvas after boot");
    else ok(`chart boot canvases=${shell.canvasCount} area=${shell.canvasArea}`);
    if (!shell.bodyTextHasPaper) note("P1", "paper-badge", "PAPER/Synthetic disclaimer not obvious in body text");
    else ok("PAPER/Synthetic visible");

    for (const pair of PAIRS) {
      const switched = await selectPair(page, pair);
      if (!switched) note("P0", `pair-${pair}-click`, "Could not click market-row for pair");
      await sleep(500);
      const st = await chartStats(page);
      if (st.canvasCount < 1) note("P0", `pair-${pair}-canvas`, "No canvas after pair switch");
      else if (st.canvasArea < 10_000) note("P1", `pair-${pair}-tiny`, `Canvas area too small: ${st.canvasArea}`);
      else ok(`${pair}: canvas ok area=${st.canvasArea}`);

      // Price / OHLC sanity
      const priceHit = st.prices.some((p) => /0\.|1\.|\d/.test(p));
      if (!priceHit && !st.ohlc) note("P1", `pair-${pair}-price`, "No price/OHLC text found after switch");
      else ok(`${pair}: price/ohlc text present`);

      await page.screenshot({ path: join(OUT, `pair-${pair}.png`), fullPage: false });
    }

    // TF switches on HMC
    await selectPair(page, "HMC_USDT");
    for (const tf of TFS) {
      const clicked = await tryToggleTf(page, tf);
      if (!clicked) {
        note("P2", `tf-${tf}`, "TF control not found/clickable");
        continue;
      }
      await sleep(400);
      const st = await chartStats(page);
      if (st.canvasCount < 1) note("P0", `tf-${tf}-canvas`, "Canvas lost after TF switch");
      else ok(`TF ${tf}: canvas ok`);
    }

    const ind = await tryEnableIndicator(page);
    if (ind) ok("indicator UI interacted");
    else note("P2", "indicator-ui", "Could not find indicator toggle (non-blocking)");

    const draw = await tryDrawHline(page);
    if (draw) ok("hline draw click path ok");
    else note("P2", "draw-hline", "Could not exercise hline tool (non-blocking)");

    // Heikin mode lives in chart-type dropdown
    const typeBtn = page.locator("#btn-chart-type").first();
    if (await typeBtn.count()) {
      try {
        await typeBtn.click({ timeout: 1000 });
        await sleep(200);
        const heikin = page.locator("#chart-type-drop .cm[data-mode='heikin']").first();
        if (await heikin.count()) {
          await heikin.click({ timeout: 1000 });
          await sleep(450);
          const st = await chartStats(page);
          if (st.canvasCount < 1) note("P0", "heikin-canvas", "Canvas lost after Heikin");
          else ok("Heikin mode canvas ok");
          const ohlc = await page.locator("#ohlc-legend").textContent();
          if (ohlc && /HA\s/.test(ohlc)) ok("Heikin OHLC legend shows HA prefix");
          else note("P1", "heikin-legend", `OHLC legend missing HA prefix: ${String(ohlc).slice(0, 80)}`);
        } else {
          note("P2", "heikin-missing", "Heikin option not in chart-type drop");
        }
      } catch (e) {
        note("P2", "heikin-click", String(e && e.message ? e.message : e).slice(0, 120));
      }
    }

    await page.screenshot({ path: join(OUT, "final-spot.png"), fullPage: true });
  } catch (e) {
    note("P0", "pass-crash", String(e && e.message ? e.message : e).slice(0, 220));
  } finally {
    await browser.close();
  }

  for (const e of pageErrors.slice(0, 10)) note("P1", "pageerror", e.slice(0, 200));

  const report = {
    at: new Date().toISOString(),
    base: BASE,
    findings,
    log,
    p0: findings.filter((f) => f.sev === "P0").length,
    p1: findings.filter((f) => f.sev === "P1").length,
    p2: findings.filter((f) => f.sev === "P2").length,
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, "report.txt"), log.join("\n") + "\n");
  console.log(log.join("\n"));
  console.log(`\nB-chart summary: P0=${report.p0} P1=${report.p1} P2=${report.p2} → ${OUT}`);
  if (report.p0 > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
