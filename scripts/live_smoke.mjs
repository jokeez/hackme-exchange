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
  const res = await fetch(`${BASE}/`);
  if (!res.ok) fail(`HTTP ${res.status} for ${BASE}/`);
  else ok(`HTTP ${res.status}`);
  const html = await res.text();
  if (!/boot-[A-Za-z0-9_]+/.test(html) && !/index-[A-Za-z0-9_]+\.js/.test(html)) {
    fail("no boot/index asset tag in HTML");
  } else ok("asset tag present");
  if (!/Content-Security-Policy/i.test(html) && !res.headers.get("content-security-policy")) {
    fail("missing CSP");
  } else ok("CSP present");
  // common static assets
  for (const path of ["/manifest.webmanifest", "/icons/favicon-32.png", "/theme-boot.js"]) {
    const r = await fetch(`${BASE}${path}`);
    if (r.status === 404) fail(`404 ${path}`);
    else if (!r.ok) fail(`${r.status} ${path}`);
    else ok(`${path} → ${r.status}`);
  }
}

async function browserCheck() {
  const browser = await chromium.launch({ headless: true });
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
  await page.waitForTimeout(800);
  const cv = await page.locator("#cv-go, .convert-page, .convert-shell").first().isVisible().catch(() => false);
  if (!cv) fail("convert desk not visible");
  else ok("convert desk visible");

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1200);
  ok("mobile viewport loaded");

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

  await browser.close();
}

console.log(`Live smoke → ${BASE}\n`);
await httpCheck();
await browserCheck();
if (process.exitCode) {
  console.error("\nLive smoke FAILED");
  process.exit(1);
}
console.log("\nLive smoke PASS");
