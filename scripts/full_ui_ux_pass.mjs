/**
 * Full UI/UX + button/workability pass (desktop + mobile).
 * Requires Vite on EX_UI_BASE (default http://127.0.0.1:5199/).
 *
 *   node scripts/full_ui_ux_pass.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cache", "full-ui-ux-pass");
const findings = [];
const log = [];
const note = (sev, id, msg) => {
  findings.push({ sev, id, msg });
  log.push(`[${sev}] ${id}: ${msg}`);
};
const ok = (m) => log.push(`OK ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dismiss(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      /* ignore */
    }
  });
  for (const sel of ["#tour-skip", "#tour-next", "[data-dismiss]", ".tour-backdrop button"]) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      try {
        await el.click({ timeout: 600 });
      } catch {
        /* ignore */
      }
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
}

async function gotoHash(page, hash) {
  await page.goto(`${BASE.replace(/\/?$/, "/")}#${hash}`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await sleep(700);
  await dismiss(page);
}

async function exists(page, sel) {
  return (await page.locator(sel).count()) > 0;
}

async function isShown(page, sel) {
  const el = page.locator(sel).first();
  if (!(await el.count())) return false;
  return el.isVisible().catch(() => false);
}

async function clickVisible(page, sel, label, sev = "P1") {
  const el = page.locator(sel).first();
  if (!(await el.count()) || !(await el.isVisible().catch(() => false))) {
    note(sev, label, `missing/hidden: ${sel}`);
    return false;
  }
  try {
    await el.click({ timeout: 2500 });
    await sleep(250);
    ok(`click ${label}`);
    return true;
  } catch (e) {
    note(sev, label, `click failed: ${e.message?.slice(0, 120)}`);
    return false;
  }
}

async function assertText(page, re, id, sev = "P1") {
  const body = await page.locator("body").innerText().catch(() => "");
  if (!re.test(body)) note(sev, id, `expected ${re}`);
  else ok(id);
}

async function noConsoleErrors(page, bag) {
  page.on("pageerror", (err) => bag.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") bag.push(msg.text());
  });
}

async function passSpot(page) {
  await gotoHash(page, "spot");
  await sleep(900);

  for (const sel of ["#main-nav", ".spot-layout", ".binance-ticker", "#btn-buy", "#btn-sell", "#buy-amt", "#sell-amt"]) {
    if (!(await isShown(page, sel))) note("P0", "spot-shell", `missing/hidden ${sel}`);
    else ok(`spot ${sel}`);
  }

  // Default should be Limit → price fields visible
  if (!(await isShown(page, "#buy-price"))) note("P0", "buy-price", "price field hidden (expected Limit default)");
  else ok("buy-price visible (Limit default)");
  if (!(await isShown(page, "#sell-price"))) note("P0", "sell-price", "price field hidden");
  else ok("sell-price visible");

  await assertText(page, /Pool oracle|paper demo|indicative|Oracle/i, "oracle-label");
  const midSrc = page.locator(".ob-mid-src");
  if (await midSrc.count()) {
    const t = await midSrc.first().innerText();
    if (!/indicative|Lab L2|Oracle/i.test(t)) note("P1", "ob-mid-src", `unexpected: ${t}`);
    else ok(`ob-mid-src: ${t.trim()}`);
  } else note("P2", "ob-mid-src", "mid source line not in DOM yet");

  if (await exists(page, ".vip-demo, .vip-name")) ok("vip chrome present");
  else note("P2", "vip", "vip badge not visible");

  for (const type of ["market", "limit", "stop_limit"]) {
    await clickVisible(page, `button.type[data-type="${type}"], .type[data-type="${type}"]`, `type-${type}`);
  }
  await clickVisible(page, 'button.type[data-type="limit"], .type[data-type="limit"]', "type-limit-restore");

  // Quick size (+50…) intentionally display:none — Binance desk uses % slider / Avbl.
  await clickVisible(page, '[data-pct="25"]', "pct-25");
  await clickVisible(page, '[data-pct="50"]', "pct-50");
  await clickVisible(page, '[data-avail-side="buy"]', "avail-buy-chip", "P2");

  const buyAmt = page.locator("#buy-amt");
  if (await buyAmt.count()) {
    await buyAmt.fill("100");
    await clickVisible(page, "#btn-buy", "btn-buy");
    await sleep(400);
  }

  await clickVisible(page, 'button.bv[data-bv="depth"]', "book-depth");
  await clickVisible(page, 'button.bv[data-bv="book"]', "book-book");

  for (const tf of ["15m", "1H", "1D", "1m"]) {
    const btn = page.locator(`.tf-btn[data-tf="${tf}"], button[data-tf="${tf}"]`).first();
    if (await btn.count()) {
      try {
        await btn.click({ timeout: 1500 });
        await sleep(200);
        ok(`tf ${tf}`);
      } catch {
        note("P2", `tf-${tf}`, "click failed");
      }
    }
  }

  // Chart type dropdown → Heikin
  if (await clickVisible(page, "#btn-chart-type", "chart-type-open", "P2")) {
    await clickVisible(page, '#chart-type-drop button[data-mode="heikin"], button.cm[data-mode="heikin"]', "mode-heikin", "P2");
    await page.keyboard.press("Escape").catch(() => {});
    if (await clickVisible(page, "#btn-chart-type", "chart-type-reopen", "P2")) {
      await clickVisible(page, '#chart-type-drop button[data-mode="candles"], button.cm[data-mode="candles"]', "mode-candles", "P2");
    }
  }

  for (const pair of ["SUP_USDT", "HMC_USDT"]) {
    const row = page.locator(`.market-row[data-pair="${pair}"]`).first();
    if (await row.count()) {
      try {
        await row.click({ timeout: 2000 });
        await sleep(400);
        ok(`pair ${pair}`);
      } catch {
        note("P1", `pair-${pair}`, "click failed");
      }
    } else note("P1", `pair-${pair}`, "row missing");
  }

  // System menu → settings (Escape must close modal)
  const sys = page.locator("#btn-system, .sys-menu-wrap button, button:has-text('System')").first();
  if (await sys.count()) {
    try {
      await sys.click({ timeout: 1500 });
      await sleep(200);
      if (await clickVisible(page, "#btn-settings", "settings", "P2")) {
        await sleep(200);
        const open = await page.locator(".modal-backdrop").count();
        if (!open) note("P1", "settings-modal", "modal did not open");
        else {
          await page.keyboard.press("Escape");
          await sleep(250);
          const left = await page.locator(".modal-backdrop").count();
          if (left) {
            note("P0", "settings-escape", "Escape did not close Oracle settings");
            await page.locator("#modal-close").click({ timeout: 1500 }).catch(() => {});
          } else ok("settings Escape closes modal");
        }
      }
    } catch {
      note("P2", "sys-menu", "could not open system menu");
    }
  }
  await page.evaluate(() => document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove()));
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(150);

  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, "01-spot.png"), fullPage: true });
  ok("shot 01-spot");
}

async function passConvert(page) {
  await gotoHash(page, "convert");
  await sleep(800);
  const body = await page.locator("body").innerText();
  if (!/Convert|Swap/i.test(body)) note("P0", "convert", "convert view not found");
  else ok("convert shell");

  await assertText(page, /Fee|taker|VIP|Swap/i, "convert-fee-copy");

  if (!(await exists(page, "#cv-amt"))) note("P1", "convert-amt", "#cv-amt missing");
  else {
    await page.locator("#cv-amt").fill("10");
    await sleep(400);
    ok("convert amount filled");
  }

  if (await clickVisible(page, "#cv-go", "convert-submit", "P2")) {
    await sleep(400);
  }

  await page.screenshot({ path: join(OUT, "02-convert.png"), fullPage: true });
  ok("shot 02-convert");
}

async function passAccount(page) {
  await gotoHash(page, "account");
  await sleep(800);
  await assertText(page, /Total equity|Balances|Deposit|Withdraw|VIP|demo/i, "account-shell");

  for (const href of ["#acct-cash", "#acct-balances", "#acct-activity"]) {
    const a = page.locator(`a[href="${href}"]`).first();
    if (await a.count()) {
      try {
        await a.click({ timeout: 1500 });
        await sleep(200);
        ok(`account jump ${href}`);
      } catch {
        note("P2", href, "jump failed");
      }
    }
  }

  await page.screenshot({ path: join(OUT, "03-account.png"), fullPage: true });
  ok("shot 03-account");
}

async function passPool(page) {
  await gotoHash(page, "pool");
  await sleep(700);
  await assertText(page, /Pool|Hashrate|Mine|GH/i, "pool-shell");
  if (await exists(page, 'a[href*="downloads"], a:has-text("Mine")')) ok("mine CTA present");
  else note("P1", "mine-cta", "mine link missing");
  await page.screenshot({ path: join(OUT, "04-pool.png"), fullPage: true });
  ok("shot 04-pool");
}

async function passNav(page) {
  for (const view of ["spot", "convert", "account", "pool"]) {
    await gotoHash(page, "spot");
    await sleep(300);
    const nav = page.locator(`#main-nav .nav-btn[data-view="${view}"]`).first();
    if (!(await nav.count())) {
      note("P2", `nav-${view}`, "nav btn missing");
      continue;
    }
    try {
      await nav.click({ timeout: 2500 });
      await sleep(500);
      const active = await page.locator(`#main-nav .nav-btn.active[data-view="${view}"]`).count();
      const hashOk = (await page.evaluate(() => location.hash)).includes(view);
      if (active || hashOk) ok(`nav ${view}`);
      else note("P1", `nav-${view}`, "click did not activate view");
    } catch (e) {
      note("P1", `nav-${view}`, `nav click failed: ${e.message?.slice(0, 80)}`);
    }
  }
}

async function passMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHash(page, "spot");
  await sleep(800);
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { sw: doc.scrollWidth, cw: doc.clientWidth };
  });
  if (overflow.sw > overflow.cw + 8) note("P1", "mobile-overflow", `scrollWidth ${overflow.sw} > clientWidth ${overflow.cw}`);
  else ok("mobile no major overflow spot");

  for (const view of ["convert", "account", "pool"]) {
    await gotoHash(page, view);
    await sleep(500);
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    if (o.sw > o.cw + 12) note("P1", `mobile-overflow-${view}`, `${o.sw}>${o.cw}`);
    else ok(`mobile ok ${view}`);
  }

  await page.screenshot({ path: join(OUT, "05-mobile-spot.png"), fullPage: true });
  ok("shot 05-mobile");
}

async function passOrderTabs(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHash(page, "spot");
  await sleep(600);
  for (const tab of ["Open", "History", "Trades", "Funds", "Alerts"]) {
    const el = page.locator(`button:has-text("${tab}")`).first();
    if (await el.count()) {
      try {
        await el.click({ timeout: 1500 });
        await sleep(200);
        ok(`orders-tab ${tab}`);
      } catch {
        note("P2", `tab-${tab}`, "click failed");
      }
    }
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  await noConsoleErrors(page, errors);

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await dismiss(page);
    await page.goto(BASE + "#spot", { waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
      await page.goto(BASE + "#spot", { waitUntil: "domcontentloaded", timeout: 30000 });
    });
    await sleep(1000);
    await dismiss(page);

    await passSpot(page);
    await passConvert(page);
    await passAccount(page);
    await passPool(page);
    await passNav(page);
    await passOrderTabs(page);
    await passMobile(page);
  } finally {
    await browser.close();
  }

  const realErrors = errors.filter(
    (e) =>
      !/CORS|Cross-Origin|405|Failed to load resource|net::ERR|favicon|frame-ancestors/i.test(e),
  );
  for (const e of realErrors.slice(0, 12)) {
    note("P1", "console", e.slice(0, 200));
  }

  const p0 = findings.filter((f) => f.sev === "P0").length;
  const p1 = findings.filter((f) => f.sev === "P1").length;
  const p2 = findings.filter((f) => f.sev === "P2").length;
  const summary = { p0, p1, p2, findings, log, at: new Date().toISOString() };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, "log.txt"), log.concat(findings.map((f) => `[${f.sev}] ${f.id}: ${f.msg}`)).join("\n"));

  for (const line of log) console.log(line);
  for (const f of findings) console.log(`[${f.sev}] ${f.id}: ${f.msg}`);
  console.log(`\nFull UI/UX summary: P0=${p0} P1=${p1} P2=${p2} → ${OUT}`);
  process.exit(p0 > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
