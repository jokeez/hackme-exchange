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

async function sleep(page, ms) {
  if (page.isClosed()) return false;
  try {
    await page.waitForTimeout(ms);
    return true;
  } catch {
    return false;
  }
}

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("#chart-host canvas, #chart-host", { timeout: 25_000 }).catch(() => {});
  if (!(await sleep(page, 1800))) throw new Error("page closed after load");

  for (const pair of PAIRS) {
    if (page.isClosed()) break;
    const mkt = page.locator(`[data-pair="${pair}"], [data-pair-id="${pair}"]`).first();
    if (await mkt.count()) {
      await mkt.click({ timeout: 4000 }).catch(() => {});
      if (!(await sleep(page, 400))) break;
    } else {
      await page
        .evaluate((p) => {
          location.hash = `#spot/${p}`;
        }, pair)
        .catch(() => {});
      if (!(await sleep(page, 600))) break;
    }

    for (const tf of TFS) {
      if (page.isClosed()) break;
      const tfBtn = page
        .locator(`.tfq[data-tf="${tf}"], #tf-tabs .tf[data-tf="${tf}"], button[data-tf="${tf}"]`)
        .first();
      if (await tfBtn.count()) {
        await tfBtn.click({ timeout: 3000 }).catch(() => {});
      } else {
        await page
          .evaluate((t) => {
            document.querySelector(`[data-tf="${t}"]`)?.click();
          }, tf)
          .catch(() => {});
      }
      if (!(await sleep(page, 450))) break;

      let probe = { hasCanvas: false, hostW: 0, hostH: 0 };
      try {
        probe = await page.evaluate(() => {
          const host = document.getElementById("chart-host");
          const canvas = host?.querySelector("canvas");
          return {
            hasCanvas: !!canvas,
            hostW: host?.clientWidth || 0,
            hostH: host?.clientHeight || 0,
          };
        });
      } catch {
        fail.push(`${pair}@${tf}: evaluate failed (page closed?)`);
        break;
      }

      const label = `${pair}@${tf}`;
      if (!probe.hasCanvas || probe.hostW < 100 || probe.hostH < 80) {
        fail.push(`${label}: no usable chart (${probe.hostW}x${probe.hostH})`);
      } else {
        ok.push(`${label}: chart ok`);
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
}

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
