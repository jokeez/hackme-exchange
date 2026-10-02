#!/usr/bin/env node
/**
 * Live paper smoke — HTTP + Playwright console/404 check against exchange.hackme.tech.
 *   node scripts/live_smoke.mjs
 * Optional: EX_LIVE_BASE=https://exchange.hackme.tech
 */
import { chromium } from "playwright";

const BASE = (process.env.EX_LIVE_BASE || "https://exchange.hackme.tech").replace(/\/$/, "");

const fail = (msg) => {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`[OK] ${msg}`);

async function httpCheck() {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  // Prefer headers from a HEAD where available; fetch() already has response headers.
  const csp = res.headers.get("content-security-policy") || "";
  const xfo = (res.headers.get("x-frame-options") || "").trim();
  if (!res.ok && res.status !== 301 && res.status !== 302) fail(`HTTP ${res.status} for ${BASE}/`);
  else ok(`HTTP ${res.status}`);
  const html = res.ok ? await res.text() : "";
  if (res.ok) {
    if (!/boot-[A-Za-z0-9_]+/.test(html) && !/index-[A-Za-z0-9_]+\.js/.test(html)) {
      fail("no boot/index asset tag in HTML");
    } else ok("asset tag present");
  }
  // HTTP CSP is the real gate (meta frame-ancestors is ignored by browsers).
  if (!/frame-ancestors/i.test(csp)) {
    fail("missing HTTP Content-Security-Policy frame-ancestors (origin Caddy/nginx must send header — meta alone is not enough)");
  } else ok("HTTP CSP frame-ancestors present");
  if (/^sameorigin$/i.test(xfo)) {
    fail("X-Frame-Options: SAMEORIGIN blocks hub iframe — fix origin Caddy (-X-Frame-Options) or CF Transform Rules (HackMe docs/EXCHANGE_CF_CSP.md)");
  } else ok("no X-Frame-Options: SAMEORIGIN");  // common static assets
  for (const path of ["/manifest.webmanifest", "/icons/favicon-32.png", "/theme-boot.js"]) {
    const r = await fetch(`${BASE}${path}`);
    if (r.status === 404) fail(`404 ${path}`);
    else if (!r.ok) fail(`${r.status} ${path}`);
    else ok(`${path} → ${r.status}`);
  }

  const deskHealth = await fetch(`${BASE}/desk-api/health`);
  if (!deskHealth.ok) fail(`desk-api/health ${deskHealth.status}`);
  else {
    const hj = await deskHealth.json();
    const matchingGo = process.env.EX_MATCHING_GO === "1" || hj.matching === "ok";
    const custodyGo = process.env.EX_CUSTODY_GO === "1";
    if (!hj?.ok) fail("desk-api/health ok≠true");
    else if (matchingGo) {
      if (hj.matching !== "ok") fail(`desk matching want ok got ${hj.matching}`);
      else if (!custodyGo && hj.deposit?.enabled) fail("desk deposit enabled (set EX_CUSTODY_GO=1 after Custody GO)");
      else if (!custodyGo && hj.withdraw?.enabled) fail("desk withdraw enabled (set EX_CUSTODY_GO=1 after Custody GO)");
      else if (custodyGo && (!hj.deposit?.enabled || !hj.withdraw?.enabled)) fail("desk custody GO incomplete");
      else ok(custodyGo
        ? "desk-api/health matching=ok · deposit/withdraw ON"
        : "desk-api/health matching=ok · deposit/withdraw OFF");
    } else if (hj.matching !== "disabled") fail(`desk matching not HOLD: ${hj.matching}`);
    else if (hj.deposit?.enabled) fail("desk deposit enabled");
    else if (hj.withdraw?.enabled) fail("desk withdraw enabled");
    else ok("desk-api/health HOLD (matching/deposit/withdraw)");
  }
}

async function browserCheck() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    const msg = String(err);
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      fail("Playwright browser missing — run: npx playwright install chromium");
      return;
    }
    throw err;
  }
  try {
  const page = await browser.newPage();
  const consoleErrs = [];
  const pageErrs = [];
  const badResponses = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrs.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrs.push(String(err)));
  page.on("response", (res) => {
    const u = res.url();
    if (!u.startsWith(BASE)) return;
    if (res.status() >= 400) badResponses.push(`${res.status()} ${u}`);
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);

  // Soft dismiss tour if present
  const skip = page.locator("#tour-v2-skip, #tour-skip");
  if (await skip.count()) await skip.first().click({ timeout: 2000 }).catch(() => {});

  // Spot shell
  const spotOk = await page.locator("#chart-host, #chart-wrap, .order-col").first().isVisible().catch(() => false);
  if (!spotOk) fail("spot shell not visible");
  else ok("spot shell visible");

  // Convert
  await page.goto(`${BASE}/#convert`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#cv-go, .convert-page, .convert-shell", { state: "visible", timeout: 15_000 }).catch(() => null);
  const cv = await page.locator("#cv-go, .convert-page, .convert-shell").first().isVisible().catch(() => false);
  if (!cv) fail("convert desk not visible");
  else ok("convert desk visible");

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1200);
  ok("mobile viewport loaded");

  // Hub embed framing + chart floor (crosshair needs non-crushed chart).
  // Fresh page so prior mobile viewport / tour state cannot zero the desk.
  const embedPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await embedPage.goto(`${BASE}/?embed=hub`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await embedPage.waitForTimeout(2000);
    const skipEmbed = embedPage.locator("#tour-v2-skip, #tour-skip");
    if (await skipEmbed.count()) await skipEmbed.first().click({ timeout: 2000 }).catch(() => {});
    await embedPage.waitForSelector("#chart-host", { state: "visible", timeout: 20_000 });
    const embedOk = await embedPage.evaluate(() => document.documentElement.dataset.embed === "hub");
    if (!embedOk) fail("hub embed dataset not set");
    else ok("hub embed mode active");
    const chartH = await embedPage.locator("#chart-host").boundingBox();
    const orderH = await embedPage.locator("#order-zone").boundingBox().catch(() => null);
    if (!chartH || chartH.height < 180) {
      fail(`hub embed chart too short (${chartH?.height ?? 0}px)`);
    } else ok(`hub embed chart height ${Math.round(chartH.height)}px`);
    if (orderH && orderH.height > 320) {
      fail(`hub embed order-zone too tall (${Math.round(orderH.height)}px) — crushes chart`);
    } else if (orderH) ok(`hub embed order-zone ${Math.round(orderH.height)}px`);
  } finally {
    await embedPage.close();
  }

  const noise = (s) =>
    /favicon|cloudflare|Failed to load resource: net::ERR_|ResizeObserver|frame-ancestors|Content Security Policy directive/i.test(
      s,
    );
  const realConsole = consoleErrs.filter((e) => !noise(e));
  const realPage = pageErrs.filter((e) => !noise(e));
  const real404 = badResponses.filter((e) => !/cloudflareinsights|favicon\.ico/i.test(e));

  if (realConsole.length) {
    console.error("[console]", realConsole.slice(0, 8));
    fail(`${realConsole.length} console error(s)`);
  } else ok("no console errors");
  if (realPage.length) {
    console.error("[pageerror]", realPage.slice(0, 5));
    fail(`${realPage.length} page error(s)`);
  } else ok("no page errors");
  if (real404.length) {
    console.error("[http]", real404.slice(0, 8));
    fail(`${real404.length} 4xx/5xx response(s)`);
  } else ok("no app 4xx/5xx");
  } finally {
    await browser.close();
  }
}

console.log(`Live smoke → ${BASE}\n`);
await httpCheck();
await browserCheck();
if (process.exitCode) {
  console.error("\nLive smoke FAILED");
  process.exit(1);
}
console.log("\nLive smoke PASS");
