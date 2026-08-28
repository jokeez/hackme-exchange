/**
 * Quick smoke: hub embed + desktop panel chips + mobile pinch options.
 * Run: node scripts/smoke_layout_hub.mjs
 * Requires: exchange dev on :5199, HackMe hub on :8080
 */
import { chromium, devices } from "playwright";

const HUB = "http://127.0.0.1:8080/#exchange";
const SPA = "http://127.0.0.1:5199/?embed=hub";

async function clearLayoutPrefs(page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("hackme-ex-layout-v3");
    } catch {
      /* ignore */
    }
  });
}

async function assertDesktopChips(page) {
  await clearLayoutPrefs(page);
  await page.goto(SPA, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#chip-book", { timeout: 20000 });
  const bookActive = await page.locator("#chip-book").evaluate((el) => el.classList.contains("active"));
  if (!bookActive) throw new Error("chip-book should start active");
  await page.locator("#chip-book").click();
  await page.waitForTimeout(200);
  const bookHidden = await page.locator("#col-book").evaluate((el) => el.classList.contains("hidden"));
  if (!bookHidden) throw new Error("book panel should hide after chip click");
  await page.locator("#chip-book").click();
  console.log("desktop panel chips: ok");
}

async function assertMobilePinch(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SPA, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("html.mobile-layout", { timeout: 15000 });
  const hasNav = await page.locator("#mobile-panel-tabs").isVisible();
  if (!hasNav) throw new Error("mobile bottom nav missing in hub narrow viewport");
  await page.locator('[data-mp="chart"]').click();
  await page.waitForSelector('.terminal[data-mobile-panel="chart"]', { timeout: 10000 });
  console.log("mobile hub layout: ok");
}

async function assertHubIframe(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(HUB, { waitUntil: "domcontentloaded", timeout: 45000 });
  const frame = page.frameLocator("#exchange-spa-frame");
  await frame.locator("#chip-tools").waitFor({ timeout: 30000 });
  await frame.locator("body").evaluate(() => {
    try {
      localStorage.removeItem("hackme-ex-layout-v3");
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await frame.locator("#chip-tools").waitFor({ timeout: 30000 });
  const before = await frame.locator("#draw-tools").evaluate((el) => el.classList.contains("hidden"));
  await frame.locator("#chip-tools").click();
  await page.waitForTimeout(400);
  const after = await frame.locator("#draw-tools").evaluate((el) => el.classList.contains("hidden"));
  if (before === after) throw new Error("tools hidden state should toggle in hub iframe");
  console.log("hub iframe panel toggle: ok");
  await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await assertDesktopChips(page);
  await assertMobilePinch(page);
  await page.close();
  await assertHubIframe(browser);
  console.log("SMOKE OK");
} finally {
  await browser.close();
}
