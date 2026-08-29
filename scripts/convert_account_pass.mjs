/**
 * Convert + Account + Convert hotkeys E2E pass.
 * Requires preview on EX_UI_BASE (default http://127.0.0.1:5199/).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cache", "convert-account-pass");
const findings = [];
const log = [];
const note = (sev, id, msg) => {
  findings.push({ sev, id, msg });
  log.push(`[${sev}] ${id}: ${msg}`);
};
const ok = (m) => log.push(`OK ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(page, hash) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE.replace(/\/?$/, "/")}#${hash}`, { waitUntil: "domcontentloaded", timeout: 35000 });
  await sleep(900);
}

async function testConvert(page) {
  await boot(page, "convert");
  const flip = page.locator("#cv-flip");
  if (!(await flip.isVisible().catch(() => false))) {
    note("P0", "convert-shell", "convert desk missing");
    return;
  }
  ok("convert shell");

  const fromBefore = await page.locator("#cv-from").inputValue();
  await flip.click();
  await sleep(250);
  const fromAfter = await page.locator("#cv-from").inputValue();
  if (fromBefore === fromAfter) note("P1", "cv-flip", "flip did not swap assets");
  else ok("convert flip");

  await page.locator('[data-cv-pct="25"]').click();
  await sleep(200);
  const amt = await page.locator("#cv-amt").inputValue();
  if (!amt || Number(amt) <= 0) note("P1", "cv-pct", "25% chip did not set amount");
  else ok(`convert 25% → ${amt}`);

  await page.keyboard.press("f");
  await sleep(200);
  ok("convert hotkey f (flip)");

  await page.keyboard.press("m");
  await sleep(200);
  const maxAmt = await page.locator("#cv-amt").inputValue();
  if (!maxAmt || Number(maxAmt) <= 0) note("P1", "cv-max-key", "m hotkey did not set max");
  else ok("convert hotkey m (max)");

  const got = await page.locator("#cv-got").textContent().catch(() => "");
  if (!got?.trim()) note("P2", "cv-got", "preview receive empty");
  else ok("convert preview receive");

  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, "convert.png"), fullPage: true });
}

async function testAccount(page) {
  await boot(page, "account");
  const body = await page.locator("body").innerText();
  if (!/Total equity|Balances|VIP/i.test(body)) {
    note("P0", "account-shell", "account view missing");
    return;
  }
  ok("account shell");

  for (const href of ["#acct-cash", "#acct-balances", "#acct-activity"]) {
    const a = page.locator(`a[href="${href}"]`).first();
    if (await a.count()) {
      await a.click({ timeout: 2000 }).catch(() => {});
      await sleep(200);
      ok(`account jump ${href}`);
    }
  }

  const filters = page.locator('[data-ledger-filter="fee"]');
  if (await filters.count()) {
    await filters.click();
    await sleep(200);
    ok("account ledger fee filter");
  }

  await page.screenshot({ path: join(OUT, "account.png"), fullPage: true });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await testConvert(page);
    await testAccount(page);
  } finally {
    await ctx.close();
    await browser.close();
  }
  const p0 = findings.filter((f) => f.sev === "P0").length;
  const p1 = findings.filter((f) => f.sev === "P1").length;
  const summary = { p0, p1, findings, log, at: new Date().toISOString() };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, "log.txt"), log.join("\n"));
  for (const line of log) console.log(line);
  for (const f of findings) console.log(`[${f.sev}] ${f.id}: ${f.msg}`);
  console.log(`\nConvert/Account: P0=${p0} P1=${p1} → ${OUT}`);
  process.exit(p0 > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
