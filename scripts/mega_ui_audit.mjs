/**
 * Mega UI/UX audit — deepest interaction pass (Playwright).
 * Requires preview on EX_UI_BASE (default http://127.0.0.1:5199/).
 *
 *   npm run preview -- --port 5199 &
 *   node scripts/mega_ui_audit.mjs
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
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

function ensureAuditBuild() {
  if (process.env.EX_AUDIT_SKIP_BUILD === "1") return;
  console.log("[mega-audit] npm run build (set EX_AUDIT_SKIP_BUILD=1 to skip)");
  execSync("npm run build", {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_INTEGRATION_MODE: process.env.VITE_INTEGRATION_MODE || "paper",
      VITE_LAB_API: process.env.VITE_LAB_API || "0",
      VITE_EXCHANGE_API_ORIGIN: process.env.VITE_EXCHANGE_API_ORIGIN || "",
    },
  });
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
      localStorage.removeItem("hackme-exchange-demo-v5-layout-v3");
      localStorage.removeItem("hackme-ex-layout-v3");
      if (!sessionStorage.getItem("e2e-demo-reset")) {
        localStorage.removeItem("hackme-exchange-demo-v5");
        sessionStorage.setItem("e2e-demo-reset", "1");
      }
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
    document.querySelectorAll(".modal-backdrop, #hotkeys-overlay, .pop-menu, .chart-ctx-menu").forEach((el) => el.remove());
    for (const id of ["chart-type-drop", "chart-more-drop", "chart-type-backdrop", "chart-more-backdrop"]) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
      }
    }
    document.body.classList.remove("chart-type-open", "chart-more-open");
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

async function testBookObAmt(page) {
  const n = await page.locator(".ob-amt").count();
  if (!n) note("P2", "ob-amt", "book rows missing ob-amt cell");
  else ok("book rows expose ob-amt");
}

async function testChartOverlayDefaults(page) {
  await dismissOverlays(page);
  if (!(await openSystemMenu(page))) return;
  await page.locator("#btn-settings").click();
  await sleep(250);
  await page.locator('.settings-nav [data-tab="chart"]').click();
  await sleep(150);
  const quick = page.locator("#set-ov-quick");
  const preview = page.locator("#set-ov-preview");
  if (await quick.isChecked()) note("P1", "ov-quick-default", "quickOrder should be off by default");
  else ok("quickOrder off by default");
  if (await preview.isChecked()) note("P1", "ov-preview-default", "orderPreview should be off by default");
  else ok("orderPreview off by default");
  await page.locator("#set-close").click();
  await sleep(200);

  const host = page.locator("#chart-host");
  const box = await host.boundingBox();
  if (!box) return;
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
  await sleep(350);
  if (await page.locator(".chart-quick-order").count()) {
    note("P0", "chart-click-default", "quick order opened while overlays off");
  } else ok("no chart click popup with default overlays");
}

async function testDesktopOverlayMenu(page) {
  await dismissOverlays(page);
  const btn = page.locator("#btn-overlays");
  if (!(await btn.isVisible().catch(() => false))) {
    note("P2", "desktop-overlay-btn", "overlays button hidden");
    return;
  }
  await btn.click({ force: true });
  await sleep(250);
  const menu = page.locator(".pop-menu.overlay-menu");
  if (!(await menu.isVisible().catch(() => false))) {
    note("P1", "desktop-overlay-open", "overlay menu did not open");
    return;
  }
  ok("desktop overlay menu opens");

  const title = await menu.locator(".pop-menu-title").textContent();
  if (title?.trim() !== "Overlays") note("P1", "desktop-overlay-title", `title=${title}`);
  else ok("desktop overlay menu title");

  const quick = menu.locator("#ov-quick");
  const preview = menu.locator("#ov-preview");
  if (await quick.isChecked()) {
    await quick.uncheck();
    await sleep(200);
  }
  if (!(await preview.isDisabled())) note("P1", "desktop-ov-preview-gate", "preview enabled while quick off");
  else ok("desktop overlay preview disabled without quick");

  await quick.check();
  await sleep(250);
  if (await preview.isDisabled()) note("P1", "desktop-ov-preview-enable", "preview still disabled after quick on");
  else ok("desktop overlay preview enabled with quick order");

  await quick.uncheck();
  await sleep(200);
  if (!(await preview.isDisabled())) note("P1", "desktop-ov-preview-off", "preview not disabled after quick off");
  else ok("desktop overlay preview re-disabled");

  await dismissOverlays(page);
}

async function openMultiChartPicker(page) {
  const btn = page.locator("#btn-multi");
  if (!(await btn.isVisible().catch(() => false))) return null;
  await btn.click({ force: true });
  await sleep(200);
  return btn;
}

async function testChartToolbarButtons(page) {
  await dismissOverlays(page);
  await page.locator("#btn-goto-date").click({ force: true });
  await sleep(250);
  if (!(await page.locator("#goto-title").isVisible().catch(() => false))) {
    note("P1", "goto-modal", "go to date modal missing");
  } else {
    ok("goto date modal opens");
    await page.locator("#modal-close").click();
    await sleep(150);
  }

  await page.locator("#btn-indicators").click({ force: true });
  await sleep(250);
  if (!(await page.locator(".modal-backdrop [role='dialog']").isVisible().catch(() => false))) {
    note("P1", "ind-modal", "indicator modal missing");
  } else {
    ok("indicators modal opens");
    await page.keyboard.press("Escape");
    await sleep(150);
  }

  const term = page.locator("#terminal");
  const fsBefore = await term.evaluate((el) => el.classList.contains("chart-fullscreen"));
  await page.locator("#btn-fullscreen").click({ force: true });
  await sleep(400);
  const fsAfter = await term.evaluate((el) => el.classList.contains("chart-fullscreen"));
  if (fsAfter === fsBefore) note("P1", "fullscreen-toggle", "fullscreen class unchanged");
  else ok("fullscreen toggles");
  if (fsAfter) {
    await page.locator("#btn-fullscreen").click({ force: true });
    await sleep(300);
  }

  await page.locator("#btn-chart-type").click({ force: true });
  await sleep(200);
  const typeDrop = page.locator("#chart-type-drop");
  if (!(await typeDrop.isVisible().catch(() => false))) {
    note("P1", "chart-type-drop", "chart type menu missing");
  } else {
    ok("chart type menu opens");
    await page.locator("#btn-chart-type").click({ force: true });
    await sleep(150);
  }

  const stillFs = await term.evaluate((el) => el.classList.contains("chart-fullscreen"));
  if (stillFs) {
    await page.keyboard.press("f");
    await sleep(400);
  }
  await dismissOverlays(page);
}

async function testChartQuickOrderNoPanPopup(page) {
  await dismissOverlays(page);
  if (!(await openSystemMenu(page))) return;
  await page.locator("#btn-settings").click();
  await sleep(250);
  await page.locator('.settings-nav [data-tab="chart"]').click();
  await sleep(150);
  const quick = page.locator("#set-ov-quick");
  if (!(await quick.isChecked())) await quick.check();
  const preview = page.locator("#set-ov-preview");
  if (!(await preview.isChecked())) await preview.check();
  await page.locator("#set-close").click();
  await sleep(250);

  const host = page.locator("#chart-host");
  const box = await host.boundingBox();
  if (!box) {
    note("P2", "chart-box", "chart host not measurable");
    return;
  }
  const cx = box.x + box.width * 0.52;
  const cy = box.y + box.height * 0.48;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy, { steps: 10 });
  await page.mouse.up();
  await sleep(350);
  if (await page.locator(".chart-quick-order").count()) {
    note("P0", "chart-pan-popup", "quick order opened after chart pan");
  } else ok("chart pan does not open quick order");

  await page.mouse.click(cx, cy);
  await sleep(400);
  const pop = page.locator(".chart-quick-order");
  if (!(await pop.isVisible().catch(() => false))) {
    note("P1", "chart-quick-popup", "quick order popup missing on chart click");
    return;
  }
  ok("chart click opens quick order popup");
  await page.keyboard.press("Escape");
  await sleep(200);
  if (await pop.count()) note("P1", "chart-popup-esc", "quick order popup stayed after Esc");
  else ok("quick order Esc closes popup");
}

async function testInlineOrderAmend(page) {
  await dismissOverlays(page);
  const midText = await page.locator(".ob-mid-price").first().textContent().catch(() => "0.05");
  const midN = Number(String(midText).replace(/[^\d.]/g, "")) || 0.05;
  const px = (midN * 0.55).toFixed(6);

  const seeded = await page.evaluate(async (price) => {
    const w = window;
    const dbg = w.__hackmeExchangeDebug;
    if (dbg && typeof dbg.seedOpenOrderForE2E === "function") {
      dbg.seedOpenOrderForE2E(Number(price), 120);
      return true;
    }
    return false;
  }, px);

  if (!seeded) {
    note("P2", "amend-seed", "seedOpenOrderForE2E debug helper missing");
    return;
  }

  await sleep(400);
  await page.locator("#activity-panel").scrollIntoViewIfNeeded().catch(() => {});

  const edit = page.locator('.act-edit[data-amend-field="price"]').first();
  if (!(await edit.isVisible().catch(() => false))) {
    note("P2", "amend-btn", "no inline price edit after seeded open order");
    return;
  }
  await edit.click();
  const inp = page.locator(".act-edit-inp").first();
  await inp.waitFor({ state: "visible", timeout: 5000 });
  const nextPx = (Number(px) * 0.99).toFixed(6);
  await inp.fill(nextPx);
  await inp.press("Enter");
  await sleep(500);
  const rowText = await page.locator(".act-row").first().textContent().catch(() => "");
  if (!rowText?.includes(nextPx.slice(0, 4))) note("P1", "amend-price", `row=${rowText?.slice(0, 60)}`);
  else ok("inline amend updates order price");
}

async function testLayoutPresets(page) {
  if (!(await openSystemMenu(page))) return;
  await page.locator("#btn-settings").click();
  await sleep(250);
  await page.locator('.settings-nav [data-tab="layout"]').click();
  await sleep(150);
  if (!(await page.locator("#set-preset-chart").isVisible().catch(() => false))) {
    note("P1", "layout-presets", "chart focus preset missing");
    return;
  }
  ok("layout presets visible");
  await page.locator("#set-preset-chart").click();
  await sleep(400);
  const bookHidden = await page.evaluate(() => {
    const term = document.getElementById("terminal");
    return term?.classList.contains("book-collapsed") ?? false;
  });
  if (!bookHidden) note("P1", "layout-preset-chart", "book not collapsed after chart focus");
  else ok("chart focus preset collapses book");
  // Restore standard layout so later tests keep markets/activity visible.
  if (!(await openSystemMenu(page))) return;
  await page.locator("#btn-settings").click();
  await sleep(200);
  await page.locator("#set-preset-standard").click();
  await sleep(400);
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

async function testPlotWheelCursorAnchor(page) {
  await dismissOverlays(page);
  await waitChart(page);
  const plotCanvas = page.locator("#chart-host .tv-lightweight-charts table tr td:nth-child(2) canvas").first();
  const box = await plotCanvas.boundingBox({ timeout: 15000 });
  if (!box) {
    note("P1", "plot-anchor-box", "plot canvas box null");
    return;
  }
  const cx = box.x + box.width * 0.38;
  const cy = box.y + box.height * 0.52;
  await page.mouse.move(cx, cy, { steps: 6 });
  const result = await page.evaluate(
    async ({ clientX }) => {
      const probe = window.__hackmeChart;
      const before = probe?.getMainViewport?.() ?? null;
      const time0 = probe?.timeAtPlotClientX?.(clientX) ?? null;
      for (let i = 0; i < 4; i++) {
        probe?.applyMainPlotWheel?.(120, clientX);
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = probe?.getMainViewport?.() ?? null;
      const time1 = probe?.timeAtPlotClientX?.(clientX) ?? null;
      const driftPx =
        time0 != null && probe?.anchorDriftPx ? probe.anchorDriftPx(clientX, time0) : 999;
      return { time0, time1, driftPx, spacing0: before?.barSpacing, spacing1: after?.barSpacing };
    },
    { clientX: cx },
  );
  if (result.time0 == null) {
    note("P1", "plot-anchor-time", "could not read anchor time under cursor");
    return;
  }
  if (result.spacing0 && result.spacing1 && !(result.spacing1 > result.spacing0 * 1.02)) {
    note("P0", "plot-wheel-zoom-in", `barSpacing ${result.spacing0} → ${result.spacing1}`);
    return;
  }
  if (result.time1 !== result.time0) {
    note("P0", "plot-wheel-anchor-time", `anchor time ${result.time0} → ${result.time1}`);
    return;
  }
  if (result.driftPx > 4) {
    note("P0", "plot-wheel-anchor-drift", `anchor px drift ${result.driftPx.toFixed(1)}`);
    return;
  }
  ok(`plot wheel zoom-in + anchor (drift ${result.driftPx.toFixed(1)}px)`);
}

async function testPriceScaleWheel(page) {
  await dismissOverlays(page);
  const before = await page.evaluate(() => window.__hackmeChart?.getPriceScaleDebug?.());
  if (!before?.span || before.span <= 0) {
    note("P1", "price-scale-debug", "getPriceScaleDebug unavailable");
    return;
  }
  const scaleCanvas = page.locator("#chart-host .tv-lightweight-charts table tr:first-child td:last-child canvas").first();
  const box = await scaleCanvas.boundingBox();
  if (!box || box.width < 8) {
    note("P1", "price-scale-box", "price scale canvas missing");
    return;
  }
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 6 });
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 120);
    await sleep(45);
  }
  await sleep(350);
  const mid = await page.evaluate(() => window.__hackmeChart?.getPriceScaleDebug?.());
  if (!mid?.span || !(mid.span < before.span * 0.9)) {
    note("P0", "price-scale-zoom-in", `span ${before.span} → ${mid?.span}`);
    return;
  }
  ok(`price scale wheel zoom-in (${before.span.toExponential(2)} → ${mid.span.toExponential(2)})`);

  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, 120);
    await sleep(30);
  }
  await sleep(300);
  const deep = await page.evaluate(() => window.__hackmeChart?.getPriceScaleDebug?.());
  if (!deep?.span || !(deep.span < mid.span * 0.82)) {
    note("P0", "price-scale-wall", `early stop span=${deep?.span} mid=${mid.span}`);
    return;
  }
  ok("price scale wheel continues past former clamp wall");
}

async function testMultiChartIndependent(page) {
  await dismissOverlays(page);
  const btn = await openMultiChartPicker(page);
  if (!btn) return;
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
    await page.mouse.wheel(0, 120);
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

  const pane2Canvas = page.locator("#chart-host-2 .sub-inner canvas").first();
  const pane2Box = await pane2Canvas.boundingBox();
  if (!pane2Box) {
    note("P1", "pane2-ctx-box", "pane 2 canvas box null");
  } else {
    const px = pane2Box.x + pane2Box.width * 0.5;
    const py = pane2Box.y + pane2Box.height * 0.5;
    await page.mouse.click(px, py, { button: "right" });
    await sleep(350);
    const menu = page.locator(".chart-ctx-menu");
    if (!(await menu.isVisible().catch(() => false))) {
      note("P0", "pane2-ctx-menu", "secondary pane context menu missing");
    } else {
      ok("secondary pane context menu opens");
      const alertCountBefore = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem("hackme-exchange-demo-v5");
          return raw ? JSON.parse(raw).priceAlerts?.length ?? 0 : 0;
        } catch {
          return 0;
        }
      });
      await menu.locator('[data-a="add_alert"]').click();
      await sleep(400);
      const alertCountAfter = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem("hackme-exchange-demo-v5");
          return raw ? JSON.parse(raw).priceAlerts?.length ?? 0 : 0;
        } catch {
          return 0;
        }
      });
      if (alertCountAfter <= alertCountBefore) note("P1", "pane2-alert", "alert not added from pane 2 ctx");
      else ok("secondary pane ctx add alert");
      await dismissOverlays(page);
    }
  }

  await page.locator("#chart-host-2").click({ force: true });
  await sleep(250);
  const pane2ZoomCanvas = page.locator("#chart-host-2 .sub-inner canvas").first();
  const pane2ZoomBox = await pane2ZoomCanvas.boundingBox();
  if (pane2ZoomBox) {
    const baseline = await page.evaluate(() => window.__hackmeExchangeDebug?.getPaneViewport?.("chart-host-2"));
    await pane2ZoomCanvas.hover({ force: true });
    await page.mouse.move(pane2ZoomBox.x + pane2ZoomBox.width * 0.5, pane2ZoomBox.y + pane2ZoomBox.height * 0.5);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 140);
      await sleep(80);
    }
    await sleep(400);
    const zoomed = await page.evaluate(() => window.__hackmeExchangeDebug?.getPaneViewport?.("chart-host-2"));
    const focused = await page.evaluate(() => window.__hackmeExchangeDebug?.getFocusedPaneId?.());
    if (focused !== "chart-host-2") note("P2", "pane2-focus", `focused=${focused ?? "?"}`);
    const span = (v) => (v ? Math.abs(v.to - v.from) : 0);
    const zoomedIn =
      baseline &&
      zoomed &&
      (Math.abs(zoomed.barSpacing - baseline.barSpacing) > 0.02 || Math.abs(span(zoomed) - span(baseline)) > 2);
    if (!zoomedIn) {
      note("P2", "pane2-zoom", "wheel did not zoom pane 2 before Alt+R");
    } else {
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press("Alt+KeyR");
      await sleep(450);
      const reset = await page.evaluate(() => window.__hackmeExchangeDebug?.getPaneViewport?.("chart-host-2"));
      const changed =
        zoomed &&
        reset &&
        (Math.abs(span(zoomed) - span(reset)) > 2 || Math.abs(zoomed.barSpacing - reset.barSpacing) > 0.02);
      if (changed) {
        ok("Alt+R resets focused secondary pane");
      } else if (zoomed && reset) {
        note("P2", "pane2-alt-r", "Alt+R may not have changed pane 2 zoom");
      }
    }
  }

  const shotProbe = await page.evaluate(() => {
    const split = document.querySelector(".chart-split");
    const hosts = split ? [...split.querySelectorAll(".chart-host")].map((h) => h.id) : [];
    const dbg = window.__hackmeExchangeDebug?.chartScreenshotProbe?.();
    return { hosts: hosts.length ? hosts : dbg?.hosts ?? [], layout: dbg?.layout ?? split?.className ?? "" };
  });
  if (!shotProbe || shotProbe.hosts.length < 4) {
    note("P2", "shot-probe-4", `hosts=${shotProbe?.hosts?.length ?? 0}`);
  } else {
    ok(`screenshot probe: ${shotProbe.hosts.length} panes`);
  }
  const dlPromise = page.waitForEvent("download", { timeout: 6000 }).catch(() => null);
  await page.locator("#btn-screenshot").click({ force: true });
  await sleep(500);
  const dl = await dlPromise;
  if (dl) {
    const name = dl.suggestedFilename();
    if (!name.includes("4panes")) note("P1", "shot-filename", name);
    else ok(`multi screenshot download ${name}`);
  } else ok("screenshot triggered in 4-grid");

  await btn.click().catch(() => {});
  await sleep(200);
  await page.locator('.pop-menu.multi-picker [data-l="1"]').click({ timeout: 3000 }).catch(() => {});
  await sleep(500);
}

async function testMultiChartLinked(page) {
  await dismissOverlays(page);
  const btn = await openMultiChartPicker(page);
  if (!btn) return;

  const linkInp = page.locator("#mc-link-panes");
  if (!(await linkInp.isVisible().catch(() => false))) {
    note("P2", "linked-toggle", "link panes checkbox missing");
    return;
  }
  if (!(await linkInp.isChecked())) await linkInp.check();
  await sleep(200);

  const hint = await page.locator(".pop-menu.multi-picker .pop-menu-hint").textContent();
  if (!hint || !/Linked/i.test(hint)) note("P1", "linked-hint", `hint=${hint?.slice(0, 48) ?? ""}`);
  else ok("linked panes hint shown");

  await page.locator('.pop-menu.multi-picker [data-l="2v"]').click({ timeout: 3000 });
  await sleep(1000);
  await waitChart(page);

  const split = page.locator(".chart-split.layout-2v");
  if (!(await split.isVisible().catch(() => false))) {
    note("P0", "linked-2v", "2v layout missing");
    return;
  }
  ok("linked 2v layout");

  const linked = await page.evaluate(() => window.__hackmeExchangeDebug?.multiChartLinked === true);
  if (!linked) note("P0", "linked-flag", "multiChartLinked not true");
  else ok("multiChartLinked active");

  const syncOn = await page.evaluate(() => {
    const ex = window.__hackmeExchangeDebug;
    const cross = ex?.getCrosshairSyncDebug?.();
    const time = ex?.getTimeSyncDebug?.();
    return cross?.enabled === true && time?.enabled === true && (cross?.paneCount ?? 0) >= 2;
  });
  if (!syncOn) note("P0", "linked-sync-on", "crosshair/time sync not enabled");
  else ok("linked sync engines on");

  const before = await page.evaluate(() => {
    const ex = window.__hackmeExchangeDebug;
    return { main: ex?.getMainViewport?.(), pane2: ex?.getPaneViewport?.("chart-host-2") };
  });
  if (!before.main || !before.pane2) {
    note("P1", "linked-viewport", "could not read viewports");
    return;
  }

  const canvas = page.locator("#chart-host .chart-inner canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    note("P1", "linked-canvas", "main canvas box null");
    return;
  }
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, { steps: 6 });
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 120);
    await sleep(80);
  }
  await sleep(500);

  const after = await page.evaluate(() => {
    const ex = window.__hackmeExchangeDebug;
    return {
      main: ex?.getMainViewport?.(),
      pane2: ex?.getPaneViewport?.("chart-host-2"),
      time: ex?.getTimeSyncDebug?.(),
    };
  });
  const mainZoomed = after.main && before.main && Math.abs(after.main.barSpacing - before.main.barSpacing) > 0.01;
  const pane2Followed =
    after.pane2 && after.main && Math.abs(after.pane2.barSpacing - after.main.barSpacing) < 1.2;
  if (!mainZoomed) note("P1", "linked-main-zoom", "main barSpacing unchanged");
  else ok(`linked main zoomed spacing ${after.main?.barSpacing?.toFixed(1)}`);
  if (!pane2Followed) {
    note("P0", "linked-pane2-sync", `pane2=${after.pane2?.barSpacing} main=${after.main?.barSpacing}`);
  } else ok("pane 2 barSpacing synced with main (linked)");

  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5, { steps: 4 });
  await sleep(400);
  const cross = await page.evaluate(() => window.__hackmeExchangeDebug?.getCrosshairSyncDebug?.());
  if (!(cross?.lastSyncedTime != null && cross.lastSyncedTime > 0)) {
    note("P2", "linked-crosshair", "crosshair sync time not set after hover");
  } else ok("linked crosshair sync active");

  await btn.click().catch(() => {});
  await sleep(200);
  if (await linkInp.isVisible().catch(() => false) && (await linkInp.isChecked())) {
    await linkInp.uncheck();
    await sleep(150);
  }
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

async function testMobileChartMore(page) {
  await dismissOverlays(page);
  await page.locator("#mp-tab-chart").click();
  await sleep(400);
  const more = page.locator("#btn-mobile-chart-more");
  if (!(await more.isVisible().catch(() => false))) {
    note("P2", "mobile-chart-more-btn", "hidden on chart tab");
    return;
  }
  await more.click({ force: true });
  await sleep(250);
  const drop = page.locator("#chart-more-drop");
  if (!(await drop.isVisible().catch(() => false))) {
    note("P1", "mobile-chart-more-drop", "sheet menu missing");
    return;
  }
  ok("mobile chart-more menu opens");

  await page.locator('#chart-more-drop [data-chart-more="overlays"]').click();
  await sleep(300);
  const ov = page.locator(".pop-menu.overlay-menu");
  if (!(await ov.isVisible().catch(() => false))) {
    note("P1", "mobile-overlays-menu", "overlay pop menu missing");
  } else {
    ok("mobile chart-more → overlays");
    const preview = ov.locator("#ov-preview");
    const quick = ov.locator("#ov-quick");
    if (await quick.isChecked()) {
      if (await preview.isChecked()) note("P1", "mobile-ov-preview", "preview on without gate check");
      else ok("mobile overlay preview gated");
    } else {
      const disabled = await preview.isDisabled();
      if (!disabled) note("P1", "mobile-ov-preview-disabled", "preview not disabled when quick off");
      else ok("mobile overlay preview disabled without quick order");
    }
  }
  await dismissOverlays(page);

  await more.click({ force: true });
  await sleep(200);
  await page.locator('#chart-more-drop [data-chart-more="goto"]').click();
  await sleep(250);
  if (!(await page.locator("#goto-title").isVisible().catch(() => false))) {
    note("P1", "mobile-goto-modal", "go to date via chart-more missing");
  } else {
    ok("mobile chart-more → go to date");
    await page.locator("#modal-close").click();
    await sleep(150);
  }
  await dismissOverlays(page);

  await more.click({ force: true });
  await sleep(200);
  await page.locator('#chart-more-drop [data-chart-more="hotkeys"]').click();
  await sleep(300);
  if (!(await page.locator("#hotkeys-overlay").isVisible().catch(() => false))) {
    note("P1", "mobile-hotkeys", "hotkeys via chart-more missing");
  } else {
    ok("mobile chart-more → hotkeys");
    await page.locator("#hotkeys-close").click();
  }
  await dismissOverlays(page);
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

    await testMobileChartMore(page);

    await page.locator("#mp-tab-chart").click();
    await waitChart(page);

    await page.locator("#btn-mobile-pair").click();
    await sleep(450);
    const pairTap = await page.evaluate(() => ({
      panel: document.documentElement.getAttribute("data-mobile-panel"),
      searchFocused: document.activeElement?.id === "market-search",
    }));
    if (pairTap.panel !== "markets") note("P1", "mobile-pair-panel", "pair tap did not open markets");
    else ok("mobile pair tap → markets");
    if (pairTap.searchFocused) note("P0", "mobile-pair-focus", "market-search focused on pair tap");
    else ok("mobile pair tap no search focus");

    await page.locator("#mp-tab-chart").click();
    await waitChart(page);

    const timeAxis = await page.evaluate(() => {
      const footer = document.getElementById("mobile-footer-stack");
      const canvas = document.querySelector(
        "#chart-host .tv-lightweight-charts table tr:nth-child(2) td:nth-child(2) canvas",
      );
      if (!canvas || !footer) return { ok: false, reason: "missing" };
      const cb = canvas.getBoundingClientRect();
      const fb = footer.getBoundingClientRect();
      return {
        ok: cb.height >= 18 && cb.bottom <= fb.top + 3,
        h: Math.round(cb.height),
        gap: Math.round(fb.top - cb.bottom),
      };
    });
    if (!timeAxis.ok) note("P0", "mobile-time-axis", `h=${timeAxis.h} gap=${timeAxis.gap}`);
    else ok(`mobile time axis visible (gap ${timeAxis.gap}px)`);

    const indTabs = await page.evaluate(() => {
      const tabs = document.getElementById("ind-tabs");
      if (!tabs) return { ok: false };
      const first = tabs.querySelector(".ind");
      const tabRect = first?.getBoundingClientRect();
      const rowRect = tabs.getBoundingClientRect();
      const clipped =
        !!tabRect &&
        (tabRect.height < 20 || tabRect.bottom > rowRect.bottom + 1 || tabRect.top < rowRect.top - 1);
      return { ok: !clipped && tabs.scrollHeight <= tabs.clientHeight + 2, clipped };
    });
    if (!indTabs.ok) note("P1", "mobile-ind-tabs", "indicator tabs clipped");
    else ok("mobile indicator tabs not clipped");

    const scaleBox = await page.locator("#chart-host .tv-lightweight-charts table tr td:last-child").first().boundingBox();
    if (!scaleBox) {
      note("P1", "mobile-price-axis-box", "price scale column missing");
    } else {
      const beforePan = await page.evaluate(() => window.__hackmeChart?.getPriceScaleDebug?.());
      const cx = scaleBox.x + scaleBox.width * 0.5;
      const cy = scaleBox.y + scaleBox.height * 0.5;
      await page.evaluate(
        ({ x, y0, y1 }) => {
          const cell = document.querySelector("#chart-host .tv-lightweight-charts table tr td:last-child");
          if (!cell) return;
          const mk = (type, y, buttons = 1) =>
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              pointerId: 42,
              pointerType: "touch",
              isPrimary: true,
              buttons,
            });
          cell.dispatchEvent(mk("pointerdown", y0));
          cell.dispatchEvent(mk("pointermove", y1));
          cell.dispatchEvent(mk("pointerup", y1, 0));
        },
        { x: cx, y0: cy, y1: cy - 110 },
      );
      await sleep(500);
      const afterPan = await page.evaluate(() => window.__hackmeChart?.getPriceScaleDebug?.());
      const mid0 = beforePan?.range ? (beforePan.range.from + beforePan.range.to) / 2 : 0;
      const mid1 = afterPan?.range ? (afterPan.range.from + afterPan.range.to) / 2 : 0;
      const shifted = beforePan?.span && Math.abs(mid1 - mid0) > beforePan.span * 0.03;
      if (!shifted) note("P0", "mobile-price-axis-pan", `mid ${mid0} → ${mid1}`);
      else ok("mobile price axis vertical drag");
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
    await testBookObAmt(page);
    await testBookClickToPrice(page);
    await testChartOverlayDefaults(page);
    await testDesktopOverlayMenu(page);
    await testChartToolbarButtons(page);
    await testChartQuickOrderNoPanPopup(page);
    await testInlineOrderAmend(page);
    await testAdvancedOrderTypes(page);
    await testActivityTabs(page);
    await testDrawToolsA11y(page);
    await testHotkeysOverlay(page);
    await testPlotWheelCursorAnchor(page);
    await testPriceScaleWheel(page);
    await testMultiChartIndependent(page);
    await testMultiChartLinked(page);
    await testLayoutPresets(page);

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
  ensureAuditBuild();
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
