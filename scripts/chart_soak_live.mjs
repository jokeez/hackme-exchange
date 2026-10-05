#!/usr/bin/env node
/**
 * Live Soft-MM chart soak — 5 pairs × key TFs on exchange.hackme.tech.
 *   node scripts/chart_soak_live.mjs
 *   EX_LIVE_BASE=https://exchange.hackme.tech npm run smoke:chart-soak
 */

import { chromium } from "playwright";

const BASE = (process.env.EX_LIVE_BASE || "https://exchange.hackme.tech").replace(/\/$/, "");
const PAIRS = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
const TFS = ["1m", "15m", "1H", "1D", "1W"];
const fail = [];
const ok = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector("#chart-host canvas, #chart-host", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(3500);

for (const pair of PAIRS) {
  // click market row if present
  const mkt = page.locator(`[data-pair="${pair}"], [data-pair-id="${pair}"]`).first();
  if (await mkt.count()) {
    await mkt.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  } else {
    // hash route
    await page.evaluate((p) => { location.hash = `#spot/${p}`; }, pair);
    await page.waitForTimeout(1200);
  }

  for (const tf of TFS) {
    const tfBtn = page.locator(`.tfq[data-tf="${tf}"], #tf-tabs .tf[data-tf="${tf}"], button[data-tf="${tf}"]`).first();
    if (await tfBtn.count()) {
      await tfBtn.click({ timeout: 4000 }).catch(() => {});
    } else {
      await page.evaluate((t) => {
        const el = document.querySelector(`[data-tf="${t}"]`);
        if (el) el.click();
      }, tf);
    }
    await page.waitForTimeout(900);

    const probe = await page.evaluate(({ pair, tf }) => {
      const host = document.getElementById("chart-host");
      const canvas = host?.querySelector("canvas");
      const legend = document.querySelector(".ohlc-legend, #ohlc-legend, [data-ohlc]");
      const watermark = document.querySelector(".tv-lightweight-charts, #chart-host")?.textContent || "";
      const tfActive = document.querySelector(`.tfq.active, #tf-tabs .tf.active`);
      const activeTf = tfActive?.getAttribute("data-tf") || tfActive?.textContent?.trim() || "";
      const lastPx = document.querySelector(".ticker-last, [data-ticker-last], .spot-last")?.textContent || "";
      // axis labels sample
      const axisText = [...document.querySelectorAll("#chart-host text, #chart-host .pane-legend")].map((n) => n.textContent || "").join(" ");
      return {
        hasCanvas: !!canvas,
        hostW: host?.clientWidth || 0,
        hostH: host?.clientHeight || 0,
        activeTf,
        lastPx,
        legend: legend?.textContent?.slice(0, 80) || "",
        axisSample: axisText.slice(0, 120),
        hash: location.hash,
      };
    }, { pair, tf });

    const label = `${pair}@${tf}`;
    if (!probe.hasCanvas || probe.hostW < 100 || probe.hostH < 80) {
      fail.push(`${label}: no usable chart (${probe.hostW}x${probe.hostH})`);
    } else if (tf === "1D" || tf === "1W") {
      // HH:MM-only axis is a known bug class; allow dates
      const looksClock = /^\d{2}:\d{2}/.test(probe.axisSample.trim()) && !/Oct|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Nov|Dec|\d{4}/.test(probe.axisSample);
      if (looksClock) fail.push(`${label}: axis looks HH:MM on high TF: ${probe.axisSample}`);
      else ok.push(`${label}: chart ok`);
    } else {
      ok.push(`${label}: chart ok`);
    }
  }
}

await browser.close();
console.log(`OK ${ok.length}`);
for (const line of ok) console.log("  " + line);
if (fail.length) {
  console.log(`FAIL ${fail.length}`);
  for (const line of fail) console.log("  " + line);
  process.exit(1);
}
if (errors.length) {
  console.log("CONSOLE", errors.slice(0, 10));
}
console.log(`[chart-soak] PASS pairs=${PAIRS.length} tfs=${TFS.length}`);
