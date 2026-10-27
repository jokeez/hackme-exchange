/**
 * Visual/DOM pass: Spot % sizing + price SoT across header/form/markets.
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

function drift(a, b) {
  if (!(a > 0) || !(b > 0)) return 1;
  return Math.abs(a - b) / Math.max(a, b);
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
      activeTf: "1D",
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
      chartOverlays: { showLastPrice: true },
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, STORAGE_KEY);

  await page.goto(`${BASE.replace(/\/?$/, "/")}#spot`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await sleep(4000);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    document.querySelector(".tour-backdrop")?.remove();
    document.querySelector("#tour-v2-backdrop")?.remove();
  });

  // —— Limit path (screenshot regression): Avbl 1.07 + 25% must not show after-fees min ——
  const limitTab = page.locator('#type-tabs button.type[data-type="limit"]').first();
  if (await limitTab.count()) await limitTab.click();
  await sleep(600);

  for (const pct of [25, 50, 75, 100]) {
    const mark = page.locator(`.pct-marks[data-side="buy"] button[data-pct="${pct}"]`);
    if (await mark.count()) await mark.click();
    else {
      await page.locator("#buy-pct").fill(String(pct));
      await page.locator("#buy-pct").dispatchEvent("input");
    }
    await sleep(350);
    const amount = Number(await page.locator("#buy-amt").inputValue());
    const msg = (await page.locator("#buy-msg").innerText().catch(() => "")) || "";
    const price = Number(await page.locator("#buy-price").inputValue());
    if (!(amount > 0)) fail(`limit ${pct}% → amount=${amount} msg=${msg}`);
    else ok(`limit ${pct}% → ${amount} HMC @ ${price}`);
    if (/min notional|after fees|too small/i.test(msg)) fail(`limit ${pct}% false err: ${msg}`);
    if (amount > 0 && price > 0 && amount * price < 0.01) fail(`limit ${pct}% notional ${amount * price} < 0.01`);
  }

  // Market path spot-check
  const marketTab = page.locator('#type-tabs button.type[data-type="market"]').first();
  if (await marketTab.count()) await marketTab.click().catch(() => {});
  await sleep(400);
  const mark50 = page.locator(`.pct-marks[data-side="buy"] button[data-pct="50"]`);
  if (await mark50.count()) await mark50.click();
  await sleep(300);
  const mAmt = Number(await page.locator("#buy-amt").inputValue());
  const mMsg = (await page.locator("#buy-msg").innerText().catch(() => "")) || "";
  if (!(mAmt > 0)) fail(`market 50% → ${mAmt} msg=${mMsg}`);
  else ok(`market 50% → ${mAmt} HMC`);
  if (/Need more than min notional|after fees/i.test(mMsg)) fail(`market false after-fees: ${mMsg}`);

  // —— Price SoT: header ≈ buy form (undirtied) within 3% after settle ——
  if (await limitTab.count()) await limitTab.click();
  await sleep(2500); // allow syncLimitFormToDeskLast ticks
  const sot = await page.evaluate(() => {
    const header = Number(String(document.querySelector(".tb-price")?.textContent || "").replace(/[^0-9.]/g, ""));
    const buy = Number(document.querySelector("#buy-price")?.value || 0);
    const sell = Number(document.querySelector("#sell-price")?.value || 0);
    const row = Number(String(document.querySelector(".market-row.active .mr-px")?.textContent || "").replace(/[^0-9.]/g, ""));
    return { header, buy, sell, row };
  });
  console.log("SoT snapshot", sot);
  if (sot.header > 0 && sot.buy > 0) {
    if (drift(sot.header, sot.buy) > 0.03) fail(`header vs buyPx drift ${(drift(sot.header, sot.buy) * 100).toFixed(2)}% (${sot.header} vs ${sot.buy})`);
    else ok(`header≈buyPx (${sot.header} vs ${sot.buy})`);
  } else {
    fail(`missing SoT prices header=${sot.header} buy=${sot.buy}`);
  }

  // Pair sweep — form must not keep prior pair mid
  for (const pair of ["SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC", "HMC_USDT"]) {
    const row = page.locator(`.market-row[data-pair="${pair}"]`).first();
    if (!(await row.count())) {
      fail(`missing market row ${pair}`);
      continue;
    }
    await row.click();
    await sleep(1800);
    const s = await page.evaluate(() => {
      const header = Number(String(document.querySelector(".tb-price")?.textContent || "").replace(/[^0-9.]/g, ""));
      const buy = Number(document.querySelector("#buy-price")?.value || 0);
      return { header, buy };
    });
    if (!(s.header > 0) || !(s.buy > 0)) fail(`${pair} missing prices h=${s.header} b=${s.buy}`);
    else if (drift(s.header, s.buy) > 0.05) fail(`${pair} header vs buy ${(drift(s.header, s.buy) * 100).toFixed(2)}% (${s.header} vs ${s.buy})`);
    else ok(`${pair} header≈buy (${s.header} vs ${s.buy})`);
  }

  mkdirSync(".cache", { recursive: true });
  await page.screenshot({ path: ".cache/spot-pct-visual.png", fullPage: true });

  await browser.close();
  for (const line of findings) console.log(line);
  process.exit(findings.some((f) => f.startsWith("FAIL")) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
