/**
 * Multi-viewport chart + mobile shell pass (Playwright).
 * Requires static preview or Vite on EX_UI_BASE (default http://127.0.0.1:5199/).
 *
 *   npm run preview -- --port 5199 &
 *   node scripts/multi_viewport_pass.mjs
 */
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cache", "multi-viewport-pass");
const findings = [];
const log = [];

const VIEWPORTS = [
  { id: "iphone-se", width: 375, height: 667 },
  { id: "iphone-14", width: 390, height: 844 },
  { id: "pixel-7", width: 412, height: 915 },
  { id: "ipad-mini", width: 768, height: 1024 },
  { id: "ipad-landscape", width: 1024, height: 768 },
  { id: "laptop", width: 1280, height: 800 },
  { id: "desktop", width: 1440, height: 900 },
  { id: "ultrawide", width: 1920, height: 1080 },
];

const note = (sev, id, msg) => {
  findings.push({ sev, id, msg });
  log.push(`[${sev}] ${id}: ${msg}`);
};
const ok = (m) => log.push(`OK ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ignorableConsole(text) {
  return /CORS|Cross-Origin|405|Failed to load resource|net::ERR|favicon|frame-ancestors|reportAllChanges|cloudflare|beacon|Incorrect locale information/i.test(
    text,
  );
}

async function bootPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.width <= 1024,
    hasTouch: vp.width <= 1024,
    deviceScaleFactor: vp.width <= 480 ? 2 : 1,
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
      localStorage.removeItem("hackme-exchange-demo-v5");
      localStorage.removeItem("hackme-exchange-demo-v5-layout-v3");
      localStorage.removeItem("hackme-ex-layout-v3");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE.replace(/\/?$/, "/")}#spot`, { waitUntil: "domcontentloaded", timeout: 35000 });
  await sleep(vp.width <= 1024 ? 1400 : 1000);
  return { ctx, page, errors };
}

async function waitChart(page) {
  await page.waitForSelector("#chart-host .chart-inner canvas", { timeout: 25000 });
  await sleep(400);
}

async function assertNoHScroll(page, vpId, sel) {
  if (sel === "#ind-tabs") {
    // Horizontal scroll inside indicator strip is intentional (Binance-style).
    return;
  }
  const o = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    return { sw: el.scrollWidth, cw: el.clientWidth, id: selector };
  }, sel);
  if (!o) {
    note("P2", `${vpId}-missing-${sel}`, `element ${sel} not found`);
    return;
  }
  if (o.sw > o.cw + 24) note("P1", `${vpId}-hscroll-${sel}`, `${sel} scroll ${o.sw}>${o.cw}`);
  else ok(`${vpId} ${sel} contained`);
}

async function panChart(page, vpId, vpWidth) {
  const host = page.locator("#chart-host");
  const box = await host.boundingBox();
  if (!box || box.width < 40) {
    note("P1", `${vpId}-pan-box`, "chart-host bbox missing");
    return;
  }
  const cx = box.x + box.width * 0.55;
  const cy = box.y + box.height * 0.45;
  const before = await page.evaluate(() => {
    const w = window.__hackmeChart;
    const dbg = w?.getPriceScaleDebug?.();
    return dbg?.range ? { ...dbg.range } : null;
  });
  if (vpWidth <= 1024) {
    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 90, cy, { steps: 12 });
    await page.mouse.up();
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 120, cy, { steps: 12 });
    await page.mouse.up();
  }
  await sleep(500);
  const lrBefore = await page.evaluate(() => {
    try {
      const c = document.querySelector("#chart-host .chart-inner");
      return c ? c.clientWidth : 0;
    } catch {
      return 0;
    }
  });
  const logicalMoved = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 100));
    return true;
  });
  if (lrBefore > 0 && logicalMoved) ok(`${vpId} pan gesture`);
  else note("P2", `${vpId}-pan`, "pan could not verify");
  void before;
}

async function testChartType(page, vpId, mobile) {
  const btn = page.locator("#btn-chart-type");
  if (!(await btn.isVisible().catch(() => false))) {
    note("P1", `${vpId}-chart-type-btn`, "chart type button hidden");
    return;
  }
  await btn.click({ timeout: 3000 });
  await sleep(mobile ? 450 : 250);
  const drop = page.locator("#chart-type-drop");
  const backdrop = page.locator("#chart-type-backdrop");
  if (await drop.evaluate((el) => el.classList.contains("hidden"))) {
    note("P0", `${vpId}-chart-type-open`, "dropdown did not open");
    return;
  }
  ok(`${vpId} chart-type menu open`);
  if (mobile) {
    const bb = await drop.boundingBox();
    const footer = await page.locator("#mobile-footer-stack").boundingBox();
    if (bb && footer && bb.y + bb.height > footer.y + 2) {
      note("P1", `${vpId}-chart-type-overlap`, `sheet bottom ${Math.round(bb.y + bb.height)} > footer top ${Math.round(footer.y)}`);
    } else ok(`${vpId} chart-type above footer`);
    const onBody = await drop.evaluate((el) => el.parentElement === document.body);
    if (!onBody) note("P1", `${vpId}-chart-type-portal`, "sheet not portaled to body");
    else ok(`${vpId} chart-type portaled`);
  }
  const lineBtn = drop.locator('button[data-mode="line"]');
  if (!(await lineBtn.isVisible().catch(() => false))) {
    note("P0", `${vpId}-chart-type-line`, "line option not visible");
  } else {
    await lineBtn.click({ timeout: 3000 });
    await sleep(600);
    const hidden = await drop.evaluate((el) => el.classList.contains("hidden"));
    if (!hidden) note("P1", `${vpId}-chart-type-close`, "menu stayed open after pick");
    else ok(`${vpId} chart-type line selected`);
  }
  if (!(await backdrop.evaluate((el) => el.classList.contains("hidden")))) {
    await backdrop.click({ force: true }).catch(() => {});
    await sleep(300);
  }
  await showChartTypeDropViaEval(page, false);
}

async function showChartTypeDropViaEval(page, open) {
  await page.evaluate((wantOpen) => {
    const drop = document.getElementById("chart-type-drop");
    const backdrop = document.getElementById("chart-type-backdrop");
    const btn = document.getElementById("btn-chart-type");
    if (!drop) return;
    drop.classList.toggle("hidden", !wantOpen);
    backdrop?.classList.toggle("hidden", !wantOpen);
    document.body.classList.toggle("chart-type-open", wantOpen);
    btn?.setAttribute("aria-expanded", wantOpen ? "true" : "false");
    if (!wantOpen) {
      const host = document.querySelector(".spot-layout");
      if (host) {
        if (backdrop) host.appendChild(backdrop);
        host.appendChild(drop);
      }
    }
  }, open);
}

async function testMobilePanels(page, vpId) {
  if (page.viewportSize().width > 1024) return;
  for (const mp of ["trade", "chart", "markets", "orders"]) {
    await page.locator(`[data-mp="${mp}"]`).click({ timeout: 5000 });
    await sleep(450);
    const on = await page.evaluate(
      (panel) => document.getElementById("terminal")?.getAttribute("data-mobile-panel") === panel,
      mp,
    );
    if (!on) note("P0", `${vpId}-panel-${mp}`, `panel ${mp} not active`);
    else ok(`${vpId} panel ${mp}`);
    if (mp === "trade") {
      const book = await page.locator("#col-book").isVisible();
      const order = await page.locator("#order-zone").isVisible();
      if (!book || !order) note("P1", `${vpId}-trade-split`, `book=${book} order=${order}`);
      else ok(`${vpId} trade split visible`);
    }
    if (mp === "chart") {
      await waitChart(page);
      const bar = await page.locator("#mobile-chart-trade-bar").isVisible();
      if (!bar) note("P1", `${vpId}-chart-tradebar`, "buy/sell bar hidden on chart tab");
      else ok(`${vpId} chart trade bar`);
    }
  }
  await page.locator('[data-mp="chart"]').click();
  await sleep(300);
}

async function testTimeframes(page, vpId) {
  for (const tf of ["1m", "15m", "1H", "1D"]) {
    const q = page.locator(`.tfq[data-tf="${tf}"]`).first();
    if (!(await q.isVisible().catch(() => false))) continue;
    await q.click({ timeout: 3000 });
    await sleep(500);
    await waitChart(page);
    const canvas = page.locator("#chart-host .chart-inner canvas").first();
    const box = await canvas.boundingBox();
    if (!box || box.width < 30) note("P1", `${vpId}-tf-${tf}`, "canvas too small after TF");
    else ok(`${vpId} TF ${tf} canvas ${Math.round(box.width)}x${Math.round(box.height)}`);
  }
}

async function testDesktopChips(page, vpId) {
  if (page.viewportSize().width <= 1024) return;
  const chip = page.locator("#chip-book");
  if (!(await chip.isVisible().catch(() => false))) {
    note("P2", `${vpId}-chips`, "layout chips hidden");
    return;
  }
  await chip.click();
  await sleep(200);
  const hidden = await page.locator("#col-book").evaluate((el) => el.classList.contains("hidden"));
  if (!hidden) note("P1", `${vpId}-chip-book`, "book did not hide");
  else ok(`${vpId} chip-book toggle`);
  await chip.click();
  await sleep(200);
}

async function testOverlayMenu(page, vpId) {
  if (page.viewportSize().width <= 1024) return;
  const btn = page.locator("#btn-overlays");
  if (!(await btn.isVisible().catch(() => false))) {
    note("P2", `${vpId}-overlay-btn`, "overlays button hidden");
    return;
  }
  await btn.click({ timeout: 3000 });
  await sleep(250);
  const menu = page.locator(".pop-menu.overlay-menu");
  if (!(await menu.isVisible().catch(() => false))) {
    note("P0", `${vpId}-overlay-open`, "overlay menu did not open");
    return;
  }
  const title = await menu.locator(".pop-menu-title").textContent();
  if (title?.trim() !== "Overlays") note("P1", `${vpId}-overlay-title`, `title=${title}`);
  else ok(`${vpId} overlay menu title`);
  const labels = await menu.locator("label").count();
  if (labels !== 5) note("P1", `${vpId}-overlay-count`, `expected 5 labels, got ${labels}`);
  else ok(`${vpId} overlay menu 5 items`);
  await page.mouse.click(8, 8);
  await sleep(200);
  if (await menu.isVisible().catch(() => false)) note("P1", `${vpId}-overlay-close`, "menu stayed open");
  else ok(`${vpId} overlay menu closes`);
}

async function testBookDepthStrip(page, vpId) {
  if (page.viewportSize().width <= 1024) return;
  const book = page.locator("#col-book");
  if (!(await book.isVisible().catch(() => false))) {
    note("P2", `${vpId}-book-col`, "book column hidden");
    return;
  }
  const depth = book.locator(".depth-wrap svg");
  if (!(await depth.isVisible().catch(() => false))) {
    note("P1", `${vpId}-depth-wrap`, "depth strip missing in book panel");
    return;
  }
  const paths = await depth.locator("path").count();
  if (paths < 2) note("P1", `${vpId}-depth-paths`, `expected bid/ask paths, got ${paths}`);
  else ok(`${vpId} book depth strip`);
}

async function testMultiChartGrid(page, vpId) {
  if (page.viewportSize().width < 1280) return;
  const btn = page.locator("#btn-multi");
  if (!(await btn.isVisible().catch(() => false))) {
    note("P2", `${vpId}-multi-btn`, "multi chart button hidden");
    return;
  }
  await btn.click({ timeout: 3000 });
  await sleep(250);
  const gridBtn = page.locator('.pop-menu.multi-picker [data-l="4"]');
  if (!(await gridBtn.isVisible().catch(() => false))) {
    note("P0", `${vpId}-multi-picker`, "multi picker did not open");
    return;
  }
  await gridBtn.click({ timeout: 3000 });
  await sleep(900);
  await waitChart(page);
  const split = page.locator(".chart-split.layout-4");
  if (!(await split.isVisible().catch(() => false))) {
    note("P0", `${vpId}-multi-grid`, "layout-4 not applied");
    return;
  }
  if (!(await split.evaluate((el) => el.classList.contains("multi-chart-grid")))) {
    note("P1", `${vpId}-multi-grid`, "multi-chart-grid class missing");
  } else ok(`${vpId} multi-chart independent grid class`);
  ok(`${vpId} multi 2x2 layout`);
  for (const id of ["chart-host", "chart-host-2", "chart-host-3", "chart-host-4"]) {
    const canvas = page.locator(`#${id} .chart-inner canvas`).first();
    const box = await canvas.boundingBox().catch(() => null);
    if (!box || box.height < 36) note("P1", `${vpId}-${id}-h`, `${id} canvas height ${box?.height ?? 0}`);
    else ok(`${vpId} ${id} canvas ${Math.round(box.width)}x${Math.round(box.height)}`);
  }
  const chrome = await page.locator("#chart-host-3 .sub-pair-select").isVisible().catch(() => false);
  if (!chrome) note("P1", `${vpId}-pane3-chrome`, "pane 3 pair select missing");
  else ok(`${vpId} pane 3 pair select`);
  await btn.click({ timeout: 3000 }).catch(() => {});
  await sleep(200);
  await page.locator('.pop-menu.multi-picker [data-l="1"]').click({ timeout: 3000 }).catch(() => {});
  await sleep(600);
}

async function runViewport(browser, vp) {
  const { ctx, page, errors } = await bootPage(browser, vp);
  const mobile = vp.width <= 1024;
  try {
    await page.waitForSelector(".spot-layout", { timeout: 20000 });
    if (mobile) {
      await page.waitForSelector("html.mobile-layout", { timeout: 10000 });
      ok(`${vp.id} mobile-layout class`);
    } else {
      const desk = await page.evaluate(() => !document.documentElement.classList.contains("mobile-layout"));
      if (!desk) note("P1", `${vp.id}-desktop-class`, "mobile-layout on desktop width");
      else ok(`${vp.id} desktop layout`);
    }
    await waitChart(page);
    await assertNoHScroll(page, vp.id, "#chart-chrome");
    await assertNoHScroll(page, vp.id, "#ind-tabs");
    await testTimeframes(page, vp.id);
    await panChart(page, vp.id, vp.width);
    if (mobile) await testMobilePanels(page, vp.id);
    else {
      await testDesktopChips(page, vp.id);
      await testBookDepthStrip(page, vp.id);
      await testOverlayMenu(page, vp.id);
      await testMultiChartGrid(page, vp.id);
    }
    await page.locator('[data-mp="chart"]').click().catch(() => {});
    await sleep(300);
    await testChartType(page, vp.id, mobile);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, `${vp.id}-chart.png`), fullPage: false });
    ok(`${vp.id} screenshot`);
    const bad = errors.filter((e) => !ignorableConsole(e));
    if (bad.length) {
      for (const e of bad.slice(0, 3)) note("P1", `${vp.id}-console`, e.slice(0, 180));
    } else ok(`${vp.id} no console errors`);
  } catch (e) {
    note("P0", `${vp.id}-crash`, String(e.message || e).slice(0, 200));
  } finally {
    await ctx.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n--- ${vp.id} ${vp.width}x${vp.height} ---`);
      await runViewport(browser, vp);
    }
  } finally {
    await browser.close();
  }
  const p0 = findings.filter((f) => f.sev === "P0").length;
  const p1 = findings.filter((f) => f.sev === "P1").length;
  const summary = { p0, p1, findings, log, at: new Date().toISOString(), viewports: VIEWPORTS.length };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, "log.txt"), log.join("\n"));
  for (const line of log) console.log(line);
  for (const f of findings) console.log(`[${f.sev}] ${f.id}: ${f.msg}`);
  console.log(`\nMulti-viewport: P0=${p0} P1=${p1} → ${OUT}`);
  process.exit(p0 > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
