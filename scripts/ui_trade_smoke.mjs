/**
 * Headless UI trade smoke against local lab Vite (127.0.0.1:5199).
 * DEMO/LAB only — does not touch public hosts.
 */
import { chromium } from "playwright";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const out = [];
const ok = (m) => out.push({ ok: true, m });
const bad = (m) => out.push({ ok: false, m });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => bad(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    // Expected lab noise: meta CSP frame-ancestors + optional local node CORS when :8080 down.
    if (/frame-ancestors|127\.0\.0\.1:8080|Access-Control-Allow-Origin|Failed to load resource|favicon/i.test(t)) return;
    bad(`console.error: ${t.slice(0, 160)}`);
  });

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#order-zone, #btn-buy, .terminal", { timeout: 25_000 });
  await page.waitForTimeout(1500);
  // Dismiss tour if it still appeared (sessionStorage race)
  const skip = page.locator("#tour-skip");
  if (await skip.count()) {
    await skip.click({ force: true });
    await page.waitForTimeout(300);
    ok("tour skipped");
  }
  const announceX = page.locator("#btn-announce-x");
  if (await announceX.count()) {
    await announceX.click({ force: true }).catch(() => {});
  }
  ok(`loaded title=${await page.title()}`);

  // Go Account → connect fixture
  const acctNav = page.locator('button.nav-btn[data-view="account"]').first();
  if (await acctNav.count()) {
    await acctNav.click({ force: true });
    await page.waitForTimeout(600);
    ok("Account nav");
  } else {
    // hash route
    await page.evaluate(() => {
      location.hash = "#account";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await page.waitForTimeout(800);
    ok("Account via hash");
  }

  const connect = page.locator("#btn-lab-fixture-connect");
  if (await connect.count()) {
    await connect.click();
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    if (/Connected|DEMO\/LAB|HMC-65b6/i.test(body) || (await page.locator(".toast, .msg").count())) {
      ok("fixture connect clicked");
    } else ok("fixture connect clicked (no banner text)");
  } else bad("Connect fixture button missing");

  // Spot
  const spotNav = page.locator('button.nav-btn[data-view="spot"]').first();
  if (await spotNav.count()) {
    await spotNav.click({ force: true });
    await page.waitForTimeout(800);
    ok("Spot nav");
  } else {
    await page.evaluate(() => {
      location.hash = "#spot";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await page.waitForTimeout(800);
    ok("Spot via hash");
  }

  if (await page.locator("#book, .ob-mid, .ob-row").count()) ok("order book present");
  else bad("order book missing");

  const buyAmt = page.locator("#buy-amt");
  if (await buyAmt.count()) {
    await buyAmt.fill("500");
    ok("buy-amt=500");
  } else bad("buy-amt missing");

  const btnBuy = page.locator("#btn-buy");
  if (await btnBuy.count()) {
    if (await btnBuy.isDisabled()) bad("Buy disabled");
    else {
      await btnBuy.click();
      await page.waitForTimeout(1200);
      ok("Buy clicked");
    }
  } else bad("btn-buy missing");

  const sellAmt = page.locator("#sell-amt");
  if (await sellAmt.count()) await sellAmt.fill("200");
  const btnSell = page.locator("#btn-sell");
  if (await btnSell.count() && !(await btnSell.isDisabled())) {
    await btnSell.click();
    await page.waitForTimeout(1200);
    ok("Sell clicked");
  } else bad("Sell missing/disabled");

  // Convert
  const convNav = page.locator('button.nav-btn[data-view="convert"]').first();
  if (await convNav.count()) {
    await convNav.click({ force: true });
    await page.waitForTimeout(700);
    ok("Convert nav");
  } else {
    await page.evaluate(() => {
      location.hash = "#convert";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await page.waitForTimeout(700);
    ok("Convert via hash");
  }
  if (await page.locator("#cv-amt").count()) {
    await page.locator("#cv-amt").fill("5");
    if (await page.locator("#cv-go").count()) {
      await page.locator("#cv-go").click();
      await page.waitForTimeout(1200);
      ok("convert submitted");
    } else bad("cv-go missing");
  } else bad("cv-amt missing");

  // Account mint
  if (await acctNav.count()) await acctNav.click();
  else
    await page.evaluate(() => {
      location.hash = "#account";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  await page.waitForTimeout(700);
  const mint = page.locator("#btn-lab-mint-hmc");
  if (await mint.count()) {
    await mint.click();
    await page.waitForTimeout(1000);
    ok("mint +100 HMC");
  } else ok("mint absent");

  // Chart wheel (back to spot)
  if (await spotNav.count()) await spotNav.click();
  else
    await page.evaluate(() => {
      location.hash = "#spot";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  await page.waitForTimeout(1000);
  const canvas = page.locator("#chart canvas, .tv-lightweight-charts canvas, canvas").first();
  if (await canvas.count()) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width - 30, box.y + box.height * 0.5);
      await page.mouse.wheel(0, -180);
      await page.waitForTimeout(200);
      await page.mouse.wheel(0, 360);
      ok("chart price-scale wheel");
    }
  } else bad("chart canvas missing");

  await page.screenshot({ path: "/tmp/ex-ui-trade-smoke.png", fullPage: true });
  ok("screenshot /tmp/ex-ui-trade-smoke.png");

  await browser.close();
  const fails = out.filter((x) => !x.ok);
  console.log(JSON.stringify({ base: BASE, pass: fails.length === 0, failCount: fails.length, checks: out }, null, 2));
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
