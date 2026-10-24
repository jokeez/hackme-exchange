/**
 * Visual/DOM pass: Spot % sizing with Avbl 1.07 USDT must fill Amount (HMC).
 *   EX_UI_BASE=http://127.0.0.1:4173/ node scripts/spot_pct_visual.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:4173/";
const STORAGE_KEY = "hackme-exchange-demo-v5";
const findings = [];
const ok = (m) => findings.push(`OK ${m}`);
const fail = (m) => findings.push(`FAIL ${m}`);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.addInitScript((key) => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
      localStorage.setItem("hackme.tour.v2.done", "1");
      localStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      /* ignore */
    }
    const state = {
      wallet: { usdt: 1.07, hmc: 0, sup: 0, btc: 0 },
      orders: [],
      trades: [],
      ledger: [],
      equitySnapshots: [],
      drawings: [],
      candles: {},
      activePair: "HMC_USDT",
      activeTf: "15m",
      chartMode: "candles",
      chartSettings: {},
      favoritePairs: ["HMC_USDT"],
      mainView: "spot",
      bookGrouping: 0,
      bookView: "book",
      oracleAnchor: 0.07,
      initialEquityUsdt: 1.07,
      priceAlerts: [],
      equityBaselineV: 2,
      stateVersion: 5,
      feeConfig: { makerBps: 8, takerBps: 10, payFeesInHmc: true, hmcDiscountPct: 25 },
      secondaryTf: "4H",
      multiPaneTfs: ["15m", "1H", "4H", "1D"],
      multiPanePairs: ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC"],
      chartFullscreen: false,
      multiChart: false,
      multiChartLayout: "1",
      indicatorConfig: {},
      chartOverlays: {},
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, STORAGE_KEY);

  await page.goto(`${BASE.replace(/\/?$/, "/")}#spot`, { waitUntil: "networkidle", timeout: 45_000 });
  await sleep(2000);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    document.querySelector(".tour-backdrop")?.remove();
    document.querySelector("#tour-v2-backdrop")?.remove();
  });

  // Market tab
  const marketTab = page.locator('#type-tabs button.type[data-type="market"]').first();
  if (await marketTab.count()) await marketTab.click().catch(() => {});
  await sleep(400);

  const avblText = await page.locator('[data-avail-side="buy"]').innerText().catch(() => "");
  console.log("avbl chip:", avblText);

  const rows = [];
  for (const pct of [25, 50, 75, 100]) {
    const mark = page.locator(`.pct-marks[data-side="buy"] button[data-pct="${pct}"]`);
    if (await mark.count()) {
      await mark.click();
    } else {
      await page.locator("#buy-pct").fill(String(pct));
      await page.locator("#buy-pct").dispatchEvent("input");
    }
    await sleep(250);
    const amount = await page.locator("#buy-amt").inputValue();
    const msg = await page.locator("#buy-msg").innerText().catch(() => "");
    const toast = await page.locator(".toast, .toasts, [class*='toast']").last().innerText().catch(() => "");
    rows.push({ pct, amount: Number(amount), raw: amount, msg, toast });
  }

  console.log(JSON.stringify(rows, null, 2));

  mkdirSync(".cache", { recursive: true });
  await page.screenshot({ path: ".cache/spot-pct-visual.png" });

  for (const row of rows) {
    if (!(row.amount > 0)) fail(`pct ${row.pct}% → amount=${row.raw} msg=${row.msg}`);
    else ok(`pct ${row.pct}% → ${row.raw} HMC`);
    const blob = `${row.msg} ${row.toast}`;
    if (/Need more than min notional/i.test(blob)) fail(`false after-fees msg at ${row.pct}%: ${blob}`);
  }

  // Limit + Stop Limit spot-check at 50%
  for (const type of ["limit", "stop_limit"]) {
    const tab = page.locator(`#type-tabs button.type[data-type="${type}"]`).first();
    if (!(await tab.count())) continue;
    await tab.click();
    await sleep(300);
    const mark = page.locator(`.pct-marks[data-side="buy"] button[data-pct="50"]`);
    if (await mark.count()) await mark.click();
    await sleep(250);
    const amount = Number(await page.locator("#buy-amt").inputValue());
    if (!(amount > 0)) fail(`${type} 50% → ${amount}`);
    else ok(`${type} 50% → ${amount} HMC`);
  }

  await browser.close();
  for (const line of findings) console.log(line);
  process.exit(findings.some((f) => f.startsWith("FAIL")) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
