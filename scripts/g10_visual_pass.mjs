/**
 * G10 visual pass — Spot / Convert / Account / Pool (desktop + mobile width).
 * Headless Chromium against local Vite :5199. Does not publish anything.
 *
 *   node scripts/g10_visual_pass.mjs
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cache", "g10-pass");
const findings = [];
const log = [];

const note = (sev, id, msg) => {
  findings.push({ sev, id, msg });
  log.push(`[${sev}] ${id}: ${msg}`);
};
const ok = (m) => log.push(`OK ${m}`);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function dismissOverlays(page) {
  for (const sel of [
    "#tour-skip",
    "#tour-next",
    "#tour-v2-skip",
    "#tour-v2-next",
    "[data-dismiss]",
    ".tour-backdrop button",
    ".tour-v2-backdrop button",
  ]) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      try {
        await el.click({ timeout: 800 });
        await sleep(200);
      } catch {
        /* ignore */
      }
    }
  }
  // Nuke leftover tour DOM if click raced.
  await page.evaluate(() => {
    document.querySelector(".tour-backdrop")?.remove();
    document.querySelector("#tour-v2-backdrop")?.remove();
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
      localStorage.setItem("hackme.tour.v2.done", "1");
    } catch {
      /* ignore */
    }
  }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
}

async function gotoView(page, name) {
  // Prefer hash routes — mobile may hide #main-nav.
  await page.goto(`${BASE.replace(/\/?$/, "/")}#${name}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await sleep(900);
  await dismissOverlays(page);
  const nav = page.locator(`#main-nav .nav-btn[data-view="${name}"]`);
  if ((await nav.count()) > 0 && (await nav.first().isVisible().catch(() => false))) {
    try {
      await nav.first().click({ timeout: 2000, force: true });
      await sleep(400);
    } catch {
      /* hash already applied */
    }
  }
  await dismissOverlays(page);
}

async function shot(page, name) {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  ok(`screenshot ${name}`);
  return path;
}

async function passDesktop(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
      localStorage.setItem("hackme.tour.v2.done", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  });
  await sleep(1000);
  await dismissOverlays(page);

  // Spot
  const spotOk =
    (await page.locator("#order-zone").count()) +
      (await page.locator(".terminal").count()) +
      (await page.locator("#btn-buy").count()) +
      (await page.locator(".ex-nav").count()) >
    0;
  if (!spotOk) note("P0", "spot-boot", "Spot shell missing after load");
  else ok("Spot shell visible");
  const paper =
    (await page.getByText(/PAPER|LAB|DEMO/i).count()) > 0 ||
    (await page.locator(".demo-badge, .pill-live").count()) > 0;
  if (!paper) note("P1", "paper-badge", "No PAPER/LAB badge visible on Spot");
  else ok("Mode badge present");
  await shot(page, "01-spot");

  // Convert
  await gotoView(page, "convert");
  if (
    !(
      (await page.locator("#cv-go").count()) +
      (await page.locator(".convert-page").count()) +
      (await page.locator("#cv-amt").count())
    )
  ) {
    note("P0", "convert-missing", "Convert desk controls missing");
  } else ok("Convert desk visible");
  await shot(page, "02-convert");

  // Account
  await gotoView(page, "account");
  if (
    !(
      (await page.locator(".account-page").count()) +
      (await page.locator("#acct-cash").count()) +
      (await page.getByRole("heading", { name: /Account/i }).count())
    )
  ) {
    note("P0", "account-missing", "Account page missing");
  } else ok("Account page visible");
  const roadmap = page.locator("#acct-roadmap-details, details.acct-details");
  if (await roadmap.count()) {
    await roadmap.first().evaluate((el) => {
      el.open = true;
    });
    await sleep(400);
    ok("Asset roadmap opened");
    await sleep(4500);
    const stillOpen = await roadmap.first().evaluate((el) => !!el.open);
    if (!stillOpen) note("P0", "roadmap-collapse", "Asset roadmap collapsed after ~4s live refresh");
    else ok("Asset roadmap stayed open across live tick");
  } else {
    note("P2", "roadmap-missing", "Asset roadmap details not found");
  }
  const mintDisabled = await page.locator("#btn-lab-mint-hmc[disabled]").count();
  const connect = await page.locator("#btn-lab-fixture-connect").count();
  if (connect) ok(`Lab session chrome present (mint disabled=${mintDisabled > 0})`);
  await shot(page, "03-account");

  // Pool
  await gotoView(page, "pool");
  if (
    !(
      (await page.locator(".pool-page").count()) +
      (await page.getByRole("heading", { name: /Official Pool/i }).count())
    )
  ) {
    note("P0", "pool-missing", "Pool page missing");
  } else ok("Pool page visible");
  const openCoord = await page.getByText("Open coordinator").count();
  if (openCoord) note("P1", "pool-coordinator-cta", "Open coordinator CTA still present (expected removed)");
  else ok("No Open coordinator CTA");
  const mine = page.locator('a:has-text("Mine HMC")').first();
  if (await mine.count()) {
    const href = await mine.getAttribute("href");
    if (href && href.includes("hub-proxy")) {
      note("P0", "mine-hub-proxy", `Mine HMC still points at hub-proxy: ${href}`);
    } else if (href && href.includes("hackme.tech/downloads")) {
      ok(`Mine HMC → ${href}`);
    } else {
      note("P1", "mine-href", `Mine HMC href unexpected: ${href}`);
    }
  }
  await shot(page, "04-pool");
}

async function passMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(800);
  await dismissOverlays(page);
  await shot(page, "05-spot-mobile");
  await gotoView(page, "account");
  await sleep(500);
  const overflow = await page.evaluate(() => {
    const w = document.documentElement.scrollWidth;
    const cw = document.documentElement.clientWidth;
    return { w, cw, overflow: w > cw + 8 };
  });
  if (overflow.overflow) note("P1", "mobile-h-scroll", `Account horizontal overflow ${overflow.w}>${overflow.cw}`);
  else ok("Account no major horizontal overflow @390");
  await shot(page, "06-account-mobile");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    executablePath: process.env.PW_CHROME || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

  try {
    await passDesktop(page);
    await passMobile(page);
  } catch (e) {
    note("P0", "pass-crash", String(e && e.message ? e.message : e).slice(0, 200));
  } finally {
    await browser.close();
  }

  if (pageErrors.length) {
    for (const e of pageErrors.slice(0, 8)) note("P1", "pageerror", e.slice(0, 180));
  }

  const report = {
    at: new Date().toISOString(),
    base: BASE,
    findings,
    log,
    p0: findings.filter((f) => f.sev === "P0").length,
    p1: findings.filter((f) => f.sev === "P1").length,
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, "report.txt"), log.join("\n") + "\n");
  console.log(log.join("\n"));
  console.log(`\nG10 summary: P0=${report.p0} P1=${report.p1} → ${OUT}`);
  if (report.p0 > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
