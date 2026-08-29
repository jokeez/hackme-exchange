/**
 * Mega UI/UX audit — deepest interaction pass (Playwright).
 * Requires preview on EX_UI_BASE (default http://127.0.0.1:5199/).
 *
 *   npm run preview -- --port 5199 &
 *   node scripts/mega_ui_audit.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cache", "mega-ui-audit");
const findings = [];
const log = [];

const note = (sev, id, msg) => {
  findings.push({ sev, id, msg });
  log.push(`[${sev}] ${id}: ${msg}`);
};
const ok = (m) => log.push(`OK ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ignorableConsole(text) {
  return /CORS|Cross-Origin|405|Failed to load resource|net::ERR|favicon|frame-ancestors|reportAllChanges|cloudflare|beacon|Incorrect locale/i.test(
    text,
  );
}

async function bootPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: vp,
    locale: "en-US",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
      sessionStorage.setItem("hackme-ex-mobile-panel-v1", "chart");
      localStorage.removeItem("hackme-ex-layout-v3");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE.replace(/\/?$/, "/")}#spot`, { waitUntil: "domcontentloaded", timeout: 35000 });
  await sleep(1200);
  return { ctx, page, errors };
}

async function waitChart(page) {
  await page.waitForSelector("#chart-host .chart-inner canvas", { timeout: 25000 });
  await sleep(500);
}

async function openSystemMenu(page) {
  const sys = page.locator("#btn-system-status").first();
  if (!(await sys.isVisible().catch(() => false))) return false;
  await sys.click({ timeout: 3000 });
  await sleep(200);
  return true;
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".modal-backdrop, #hotkeys-overlay, .pop-menu").forEach((el) => el.remove());
  });
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(150);
}

async function testOracleSettingsApply(page) {
  if (!(await openSystemMenu(page))) {
    note("P1", "oracle-sys", "system menu missing");
    return;
  }
  const settings = page.locator("#btn-settings");
  if (!(await settings.isVisible().catch(() => false))) {
    note("P1", "oracle-settings-btn", "settings entry missing");
    return;
  }
  await settings.click();
  await sleep(250);
  const modal = page.locator(".modal-backdrop .modal");
  if (!(await modal.isVisible().catch(() => false))) {
    note("P0", "oracle-modal-open", "settings modal did not open");
    return;
  }
  ok("oracle settings modal opens");

  await page.locator('.settings-nav [data-tab="oracle"]').click();
  await sleep(150);

  const closeBtn = page.locator("#set-close, .modal-x").first();
  const applyBtn = page.locator("#set-oracle-save");
  const cancelAria = await closeBtn.getAttribute("aria-label").catch(() => "");
  const applyAria = await applyBtn.getAttribute("aria-label").catch(() => "");
  if (!cancelAria?.includes("Close")) note("P1", "oracle-cancel-aria", `aria=${cancelAria}`);
  else ok("oracle cancel aria-label");
  if (!applyAria?.includes("Apply")) note("P1", "oracle-apply-aria", `aria=${applyAria}`);
  else ok("oracle apply aria-label");

  const desc = await page.locator('#pane-oracle .muted.small').count();
  if (!desc) note("P1", "oracle-desc", "oracle pane hint missing");
  else ok("oracle settings describedby");

  const inp = page.locator("#set-anchor");
  await inp.fill("0.061");
  await applyBtn.click();
  await sleep(600);
  if (await page.locator(".modal-backdrop").count()) {
    note("P0", "oracle-apply-close", "modal stayed open after Apply");
    await page.keyboard.press("Escape").catch(() => {});
  } else ok("oracle Apply closes modal");

  const toast = await page.locator(".toast").first().textContent().catch(() => "");
  const anchorOk = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("hackme-exchange-demo-v5");
      if (!raw) return false;
      return raw.includes("0.061");
    } catch {
      return false;
    }
  });
  if (!anchorOk && !/0\.061|Anchor/i.test(toast || "")) note("P1", "oracle-toast", `toast=${toast}`);
  else ok("oracle anchor persisted");
}

async function testBookClickToPrice(page) {
  const ask = page.locator(".ob-asks .ob-row").first();
  if (!(await ask.isVisible().catch(() => false))) {
    note("P2", "book-rows", "no ask rows");
    return;
  }
  const aria = await ask.getAttribute("aria-label");
  if (!aria?.includes("Buy at")) note("P1", "book-aria", `aria=${aria}`);
  else ok(`book row aria: ${aria?.slice(0, 40)}`);

  const priceBefore = await page.locator("#buy-price").inputValue().catch(() => "");
  await ask.click();
  await sleep(300);
  const priceAfter = await page.locator("#buy-price").inputValue().catch(() => "");
  if (priceAfter === priceBefore) note("P1", "book-click-price", "buy price unchanged after book click");
  else ok("book click fills buy price");
}

async function testAdvancedOrderTypes(page) {
  const adv = page.locator("#order-type-adv");
  if (!(await adv.isVisible().catch(() => false))) {
    note("P2", "order-adv", "advanced order dropdown missing");
    return;
  }
  for (const type of ["stop_market", "trailing_stop", "oco"]) {
    await adv.selectOption(type);
    await sleep(200);
    const val = await adv.inputValue();
    if (val !== type) note("P1", `adv-${type}`, `select value=${val}`);
    else ok(`advanced order type ${type}`);
    const wrapActive = await page.locator(".type-adv.active").count();
    if (!wrapActive) note("P1", `adv-wrap-${type}`, "type-adv not active");
    else ok(`advanced wrap active for ${type}`);
  }
  await page.locator('.type[data-type="limit"]').click({ timeout: 3000 }).catch(() => {});
  await sleep(150);
}

async function testActivityTabs(page) {
  for (const tab of ["orders", "history", "tape", "alerts"]) {
    const btn = page.locator(`#activity-tabs button[data-tab="${tab}"]`).first();
    if (!(await btn.count())) {
      note("P2", `act-tab-${tab}`, "tab missing");
      continue;
    }
    await btn.click({ timeout: 2000 }).catch(() => {});
    await sleep(180);
    const active = await btn.evaluate((el) => el.classList.contains("active"));
    if (!active) note("P1", `act-${tab}-active`, "tab not active after click");
    else ok(`activity tab ${tab}`);
  }
}

async function testHotkeysOverlay(page) {
  await dismissOverlays(page);
  const btn = page.locator("#btn-hotkeys");
  if (!(await btn.isVisible().catch(() => false))) {
    note("P2", "hotkeys-btn", "hotkeys button hidden");
    return;
  }
  await btn.click({ force: true });
  await sleep(300);
  const overlay = page.locator("#hotkeys-overlay");
  if (!(await overlay.isVisible().catch(() => false))) {
    note("P2", "hotkeys", "hotkeys overlay not visible");
    return;
  }
  ok("hotkeys overlay opens");
  await page.locator("#hotkeys-close").click({ force: true }).catch(() => page.keyboard.press("Escape"));
  await sleep(200);
  await dismissOverlays(page);
}

async function testMultiChartIndependent(page) {
  await dismissOverlays(page);
  const btn = page.locator("#btn-multi");
  if (!(await btn.isVisible().catch(() => false))) return;
  await btn.click({ force: true });
  await sleep(200);
  const linkRow = page.locator("#mc-link-panes");
  if (await linkRow.isVisible().catch(() => false)) ok("multi-chart link toggle visible");
  else note("P2", "multi-link-toggle", "link panes checkbox missing");
  const hint = page.locator(".pop-menu.multi-picker .pop-menu-hint");
  if (!(await hint.isVisible().catch(() => false))) note("P2", "multi-hint", "independent panes hint missing");
  else ok("multi-chart independent hint");
  await page.locator('.pop-menu.multi-picker [data-l="4"]').click({ timeout: 3000 });
  await sleep(1100);
  await waitChart(page);

  const split = page.locator(".chart-split.layout-4.multi-chart-grid");
  if (!(await split.isVisible().catch(() => false))) {
    note("P0", "multi-4", "4-grid layout missing");
    return;
  }
  ok("multi 4-grid independent layout");

  const indep = await page.evaluate(() => window.__hackmeExchangeDebug?.multiChartIndependent === true);
  if (!indep) note("P0", "multi-indep-flag", "multiChartIndependent not true by default");
  else ok("multiChartIndependent default");

  const syncOff = await page.evaluate(() => {
    const ex = window.__hackmeExchangeDebug;
    return ex?.getCrosshairSyncDebug?.()?.enabled === false && ex?.getTimeSyncDebug?.()?.enabled === false;
  });
  if (!syncOff) note("P0", "multi-sync-off", "crosshair/time sync still enabled");
  else ok("sync disabled for independent panes");

  const before = await page.evaluate(() => {
    const ex = window.__hackmeExchangeDebug;
    return {
      main: ex?.getMainViewport?.(),
      pane2: ex?.getPaneViewport?.("chart-host-2"),
    };
  });
  if (!before.main || !before.pane2) {
    note("P1", "multi-viewport-read", "could not read pane viewports");
    return;
  }

  const canvas = page.locator("#chart-host .chart-inner canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    note("P1", "multi-canvas-box", "main canvas box null");
    return;
  }
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, { steps: 8 });
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -120);
    await sleep(80);
  }
  await sleep(400);

  const after = await page.evaluate(() => {
    const ex = window.__hackmeExchangeDebug;
    return {
      main: ex?.getMainViewport?.(),
      pane2: ex?.getPaneViewport?.("chart-host-2"),
    };
  });
  const mainZoomed = after.main && before.main && Math.abs(after.main.barSpacing - before.main.barSpacing) > 0.01;
  const pane2Stable =
    after.pane2 &&
    before.pane2 &&
    Math.abs(after.pane2.barSpacing - before.pane2.barSpacing) < 0.01 &&
    Math.abs(after.pane2.from - before.pane2.from) < 0.5;
  if (!mainZoomed) note("P1", "multi-main-zoom", "main pane barSpacing unchanged after wheel");
  else ok(`main zoomed spacing ${after.main?.barSpacing?.toFixed(1)}`);
  if (!pane2Stable) note("P0", "multi-pane2-linked", "pane 2 changed when scrolling main — not independent");
  else ok("pane 2 unchanged while main zooms (independent)");

  const resetBtn = page.locator("#chart-host-2 .sub-reset-view");
  if (await resetBtn.isVisible().catch(() => false)) {
    await resetBtn.click();
    await sleep(300);
    ok("pane 2 reset view button");
  } else note("P1", "multi-reset-btn", "sub-reset-view missing");

  for (const id of ["chart-host", "chart-host-2", "chart-host-3", "chart-host-4"]) {
    const healthy = await page.evaluate((hostId) => {
      const canvas = document.getElementById(hostId)?.querySelector("canvas");
      if (!canvas) return false;
      const b = canvas.getBoundingClientRect();
      return b.width > 40 && b.height > 30;
    }, id);
    if (!healthy) note("P0", `${id}-wheel-health`, "canvas collapsed after wheel stress");
    else ok(`${id} healthy after wheel stress`);
  }

  await btn.click().catch(() => {});
  await sleep(200);
  await page.locator('.pop-menu.multi-picker [data-l="1"]').click({ timeout: 3000 }).catch(() => {});
  await sleep(500);
}

async function testDrawToolsA11y(page) {
  const tools = page.locator("#draw-tools .dt");
  const n = await tools.count();
  if (n < 8) {
    note("P2", "draw-tools", `only ${n} draw tools`);
    return;
  }
  let missing = 0;
  for (let i = 0; i < Math.min(n, 6); i++) {
    const el = tools.nth(i);
    const aria = await el.getAttribute("aria-label");
    const pressed = await el.getAttribute("aria-pressed");
    if (!aria) missing++;
    if (pressed === null) missing++;
  }
  if (missing) note("P1", "draw-aria", `${missing} draw tools missing aria`);
  else ok("draw tools aria-label + pressed");
}

async function testMobileDeep(browser) {
  const vp = { width: 390, height: 844 };
  const { ctx, page, errors } = await bootPage(browser, vp);
  try {
    await page.waitForSelector("html.mobile-layout", { timeout: 10000 });
    ok("mobile layout class");

    for (const tab of ["trade", "chart", "markets", "orders"]) {
      await dismissOverlays(page);
      const btn = page.locator(`#mp-tab-${tab}`);
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ timeout: 5000 });
      await sleep(tab === "markets" || tab === "orders" ? 650 : 400);
      const selected = await btn.getAttribute("aria-selected");
      if (selected !== "true") note("P1", `mobile-tab-${tab}`, "aria-selected false");
      else ok(`mobile tab ${tab}`);
    }

    await page.locator("#mp-tab-trade").click();
    await sleep(300);
    const sellTab = page.locator('#trade-side-toggle .ts[data-mobile-side="sell"]');
    if (await sellTab.isVisible().catch(() => false)) {
      await sellTab.click();
      await sleep(200);
      const sellCol = page.locator(".order-col.sell");
      const hidden = await sellCol.evaluate((el) => getComputedStyle(el).display === "none");
      if (hidden) note("P1", "mobile-sell-col", "sell column hidden after toggle");
      else ok("mobile trade-side sell column visible");
    } else note("P2", "mobile-trade-side", "trade-side toggle hidden");

    await page.locator("#mp-tab-chart").click();
    await sleep(400);
    const bar = page.locator("#mobile-chart-trade-bar");
    if (await bar.isVisible().catch(() => false)) {
      const buyAria = await bar.locator(".mctb.buy").getAttribute("aria-label");
      if (!buyAria) note("P1", "mctb-aria", "mobile chart trade bar missing aria");
      else ok("mobile chart trade bar aria");
      await bar.locator(".mctb.buy").click();
      await sleep(350);
      const onTrade = await page.locator("#mp-tab-trade").getAttribute("aria-selected");
      if (onTrade !== "true") note("P1", "mctb-goto", "did not switch to trade panel");
      else ok("mobile chart bar → trade panel");
    }

    await page.locator("#mp-tab-orders").click();
    await sleep(300);
    await testActivityTabs(page);

    const bad = errors.filter((e) => !ignorableConsole(e));
    if (bad.length) {
      for (const e of bad.slice(0, 2)) note("P1", "mobile-console", e.slice(0, 160));
    } else ok("mobile no console errors");

    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, "mobile-deep.png"), fullPage: true });
  } catch (e) {
    note("P0", "mobile-crash", String(e.message || e).slice(0, 180));
  } finally {
    await ctx.close();
  }
}

async function testDesktopDeep(browser) {
  const { ctx, page, errors } = await bootPage(browser, { width: 1440, height: 900 });
  try {
    await waitChart(page);
    await testOracleSettingsApply(page);
    await testBookClickToPrice(page);
    await testAdvancedOrderTypes(page);
    await testActivityTabs(page);
    await testDrawToolsA11y(page);
    await testHotkeysOverlay(page);
    await testMultiChartIndependent(page);

    const bbo = page.locator('.btn-bbo[data-bbo="buy"]');
    if (await bbo.isVisible().catch(() => false)) {
      const aria = await bbo.getAttribute("aria-label");
      if (!aria?.includes("BBO")) note("P1", "bbo-aria", `aria=${aria}`);
      else ok("BBO aria-label");
    }

    const retry = page.locator("#btn-oracle-retry");
    if (await retry.isVisible().catch(() => false)) {
      const aria = await retry.getAttribute("aria-label");
      if (!aria) note("P1", "oracle-retry-aria", "missing");
      else ok("oracle retry aria-label");
      await retry.click();
      await sleep(400);
      ok("oracle retry click");
    }

    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, "desktop-deep.png"), fullPage: false });

    const bad = errors.filter((e) => !ignorableConsole(e));
    if (bad.length) {
      for (const e of bad.slice(0, 3)) note("P1", "desktop-console", e.slice(0, 160));
    } else ok("desktop no console errors");
  } catch (e) {
    note("P0", "desktop-crash", String(e.message || e).slice(0, 180));
  } finally {
    await ctx.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    console.log("\n=== Mega UI audit: desktop deep ===");
    await testDesktopDeep(browser);
    console.log("\n=== Mega UI audit: mobile deep ===");
    await testMobileDeep(browser);
  } finally {
    await browser.close();
  }
  const p0 = findings.filter((f) => f.sev === "P0").length;
  const p1 = findings.filter((f) => f.sev === "P1").length;
  const p2 = findings.filter((f) => f.sev === "P2").length;
  const summary = { p0, p1, p2, findings, log, at: new Date().toISOString() };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, "log.txt"), log.join("\n"));
  for (const line of log) console.log(line);
  for (const f of findings) console.log(`[${f.sev}] ${f.id}: ${f.msg}`);
  console.log(`\nMega UI audit: P0=${p0} P1=${p1} P2=${p2} → ${OUT}`);
  process.exit(p0 > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
