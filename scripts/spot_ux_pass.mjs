/**
 * Exhaustive Spot UX pass — Playwright headless against :5199
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const findings = [];
const log = [];
const note = (sev, id, msg, status = "open") => {
  findings.push({ sev, id, msg, status });
  log.push(`[${sev}] ${id}: ${msg} (${status})`);
};
const ok = (m) => log.push(`OK ${m}`);
const info = (m) => log.push(`INFO ${m}`);

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (/frame-ancestors|127\.0\.0\.1:8080|Access-Control|Failed to load resource|favicon/i.test(t)) return;
      log.push(`CONSOLEERR ${t.slice(0, 200)}`);
    }
  });

  await page.addInitScript(() => {
    try { sessionStorage.setItem("hackme-ex-tour-v1", "1"); } catch {}
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#order-zone, #btn-buy, .terminal", { timeout: 25000 });
  await sleep(1200);

  // dismiss overlays
  for (const sel of ["#tour-skip", "#btn-announce-x"]) {
    const el = page.locator(sel);
    if (await el.count()) await el.click({ force: true }).catch(() => {});
  }
  ok(`loaded: ${await page.title()}`);

  // Connect fixture
  await page.locator('button.nav-btn[data-view="account"]').first().click({ force: true });
  await sleep(800);
  const connect = page.locator("#btn-lab-fixture-connect");
  if (!(await connect.count())) note("CRITICAL", "F-CONNECT-MISSING", "Connect fixture button missing");
  else {
    await connect.click();
    await sleep(2500);
    const body = await page.locator("body").innerText();
    if (/Connected|DEMO\/LAB|HMC-|session/i.test(body)) ok("fixture connect");
    else note("HIGH", "F-CONNECT-UNCLEAR", "Connect clicked but status unclear: " + body.slice(0, 120));
  }

  // Mint some balance if needed
  for (const id of ["#btn-lab-mint-hmc", "#btn-lab-bridge-usdt"]) {
    const b = page.locator(id);
    if (await b.count() && !(await b.isDisabled())) {
      await b.click();
      await sleep(800);
      ok(`mint ${id}`);
    }
  }

  // Spot
  await page.locator('button.nav-btn[data-view="spot"]').first().click({ force: true });
  await sleep(1000);

  // Inventory of controls
  const inventory = await page.evaluate(() => {
    const ids = [
      "btn-buy","btn-sell","buy-amt","sell-amt","buy-price","sell-price","buy-stop","sell-stop",
      "type-tabs","order-type-adv","order-tif","post-only","pay-fees-hmc","book-group-select",
      "btn-alert-at-mid","btn-open-alerts","markets-list","market-search","btn-collapse-book",
      "btn-collapse-right","order-zone","dual-order"
    ];
    const present = {};
    for (const id of ids) present[id] = !!document.getElementById(id);
    const types = [...document.querySelectorAll("#type-tabs [data-type]")].map(e => e.getAttribute("data-type"));
    const advOpts = [...document.querySelectorAll("#order-type-adv option")].map(e => e.value).filter(Boolean);
    const bookRows = document.querySelectorAll(".ob-row, [data-book-price], .book-row").length;
    const tapeRows = document.querySelectorAll(".tape-row, [data-tape], .tr-row").length;
    const tabs = [...document.querySelectorAll("[data-tab]")].map(e => e.getAttribute("data-tab"));
    const bookModes = [...document.querySelectorAll("[data-book-mode], .book-mode, [data-depth-mode]")].map(e => e.outerHTML.slice(0,80));
    const bookBtns = [...document.querySelectorAll(".book-toolbar button, .book-head button, [data-book]")].map(e => ({id:e.id, text:e.textContent?.trim(), attrs: Object.fromEntries([...e.attributes].map(a=>[a.name,a.value]))}));
    const openOrders = document.querySelectorAll("[data-cancel], .oo-row, .order-row, [data-oid]").length;
    return { present, types, advOpts, bookRows, tapeRows, tabs, bookModes, bookBtns, openOrders, htmlSnippet: document.querySelector(".book-panel, #book, .orderbook")?.innerHTML?.slice(0,500) };
  });
  info("inventory " + JSON.stringify(inventory, null, 2));

  // --- MARKET BUY ---
  async function setType(t) {
    const tab = page.locator(`#type-tabs button[data-type="${t}"]`);
    if (await tab.count()) {
      await tab.click();
      await sleep(300);
      return true;
    }
    // advanced
    const adv = page.locator("#order-type-adv");
    if (await adv.count()) {
      await adv.selectOption(t);
      await sleep(400);
      return true;
    }
    return false;
  }

  async function msgFor(side) {
    const m = page.locator(`#${side}-msg`);
    if (!(await m.count())) return "";
    const hidden = await m.isHidden().catch(() => true);
    const t = (await m.innerText().catch(() => "")).trim();
    return hidden && !t ? "" : t;
  }

  async function place(side, amt) {
    await page.locator(`#${side}-amt`).fill(String(amt));
    await sleep(200);
    const btn = page.locator(`#btn-${side}`);
    const disabled = await btn.isDisabled();
    if (disabled) {
      note("HIGH", `F-${side.toUpperCase()}-DISABLED`, `${side} button disabled before place`);
      return { disabled: true };
    }
    await btn.click();
    await sleep(1500);
    const msg = await msgFor(side);
    const toast = await page.locator(".toast").allInnerTexts().catch(() => []);
    return { disabled: false, msg, toast };
  }

  // Market buy
  if (!(await setType("market"))) note("HIGH", "F-TYPE-MARKET", "Cannot select market type");
  else {
    const r = await place("buy", 500);
    if (r.msg && /error|fail|insufficient|reject/i.test(r.msg)) note("HIGH", "F-MKT-BUY", `Market buy failed: ${r.msg}`);
    else ok(`market buy ${JSON.stringify(r)}`);
  }

  // Market sell
  {
    const r = await place("sell", 200);
    if (r.msg && /error|fail|insufficient|reject/i.test(r.msg)) note("MEDIUM", "F-MKT-SELL", `Market sell issue: ${r.msg}`);
    else ok(`market sell ${JSON.stringify(r)}`);
  }

  // Limit buy (resting)
  if (!(await setType("limit"))) note("HIGH", "F-TYPE-LIMIT", "Cannot select limit");
  else {
    // set price below mid so it rests
    const midText = await page.locator(".ob-mid, #ticker-last, .pair-price").first().innerText().catch(() => "");
    info("mid area: " + midText.slice(0, 80));
    const buyPrice = page.locator("#buy-price");
    const cur = await buyPrice.inputValue();
    const n = parseFloat(cur);
    if (Number.isFinite(n)) {
      await buyPrice.fill((n * 0.95).toPrecision(6));
    }
    const r = await place("buy", 1000);
    if (r.msg && /error|fail|insufficient|reject/i.test(r.msg)) note("HIGH", "F-LIM-BUY", `Limit buy failed: ${r.msg}`);
    else ok(`limit buy ${JSON.stringify(r)}`);
  }

  // Limit sell
  {
    const sellPrice = page.locator("#sell-price");
    const cur = await sellPrice.inputValue();
    const n = parseFloat(cur);
    if (Number.isFinite(n)) await sellPrice.fill((n * 1.05).toPrecision(6));
    const r = await place("sell", 500);
    if (r.msg && /error|fail|insufficient|reject/i.test(r.msg)) note("MEDIUM", "F-LIM-SELL", `Limit sell: ${r.msg}`);
    else ok(`limit sell ${JSON.stringify(r)}`);
  }

  // TIF / post-only
  const tif = page.locator("#order-tif");
  if (await tif.count() && await tif.isVisible()) {
    await tif.selectOption("IOC");
    ok("TIF IOC");
    await tif.selectOption("GTC");
    const po = page.locator("#post-only");
    if (await po.count()) {
      await po.check();
      ok("post-only checked");
      await po.uncheck();
    }
  } else info("TIF row hidden or missing on limit");

  // Stop limit
  if (!(await setType("stop_limit"))) note("HIGH", "F-TYPE-SL", "Cannot select stop_limit");
  else {
    const stopVis = await page.locator("#buy-stop").isVisible().catch(() => false);
    if (!stopVis) note("HIGH", "F-STOP-HIDDEN", "Stop field not visible for stop_limit");
    else {
      const mid = parseFloat(await page.locator("#buy-price").inputValue());
      if (Number.isFinite(mid)) {
        await page.locator("#buy-stop").fill((mid * 1.02).toPrecision(6));
        await page.locator("#buy-price").fill((mid * 1.025).toPrecision(6));
      }
      const r = await place("buy", 300);
      if (r.msg && /error|fail|insufficient|reject/i.test(r.msg)) note("HIGH", "F-STOP-BUY", `Stop limit buy: ${r.msg}`);
      else ok(`stop_limit buy ${JSON.stringify(r)}`);
    }
  }

  // OCO via advanced select
  if (!(await setType("oco"))) note("MEDIUM", "F-TYPE-OCO", "Cannot select OCO");
  else {
    const ocoVis = await page.locator(".field-oco").first().isVisible().catch(() => false);
    if (!ocoVis) note("MEDIUM", "F-OCO-FIELDS", "OCO fields not visible");
    else {
      const r = await place("buy", 200);
      if (r.msg && /error|fail|insufficient|reject/i.test(r.msg)) note("MEDIUM", "F-OCO-BUY", `OCO buy: ${r.msg}`);
      else ok(`oco buy ${JSON.stringify(r)}`);
    }
  }

  // Stop market / trailing
  for (const t of ["stop_market", "trailing_stop"]) {
    if (await setType(t)) {
      const r = await place("sell", 100);
      ok(`${t} place ${JSON.stringify(r)}`);
      if (r.msg && /error|fail|reject/i.test(r.msg)) note("MEDIUM", `F-${t.toUpperCase()}`, `${t}: ${r.msg}`);
    } else note("LOW", `F-TYPE-${t}`, `Cannot select ${t}`);
  }

  // Back to limit for book interactions
  await setType("limit");
  await sleep(400);

  // Book click-to-fill
  const bookClick = await page.evaluate(() => {
    const row = document.querySelector(".ob-row, [data-book-price], .book-row, tr.ask, tr.bid, .asks .lvl, .bids .lvl");
    if (!row) return { ok: false, reason: "no row" };
    const before = document.getElementById("buy-price")?.value;
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const after = document.getElementById("buy-price")?.value;
    return { ok: true, before, after, html: row.outerHTML.slice(0, 120) };
  });
  info("book click " + JSON.stringify(bookClick));
  if (!bookClick.ok) note("HIGH", "F-BOOK-ROWS", "No book rows to click");
  else if (bookClick.before === bookClick.after) {
    // try playwright click
    const row = page.locator(".ob-row, [data-book-price], .book-row").first();
    if (await row.count()) {
      const before = await page.locator("#buy-price").inputValue();
      await row.click({ force: true });
      await sleep(400);
      const after = await page.locator("#buy-price").inputValue();
      if (before === after) note("MEDIUM", "F-BOOK-CLICK", `Book click did not fill price (${before})`);
      else ok(`book click filled ${before} -> ${after}`);
    }
  } else ok(`book click filled ${bookClick.before} -> ${bookClick.after}`);

  // Grouping
  const group = page.locator("#book-group-select");
  if (await group.count()) {
    const opts = await group.locator("option").allTextContents();
    info("group opts " + opts.join(","));
    const vals = await group.locator("option").evaluateAll(os => os.map(o => o.value));
    if (vals.length > 1) {
      await group.selectOption(vals[1]);
      await sleep(500);
      await group.selectOption(vals[0]);
      ok("grouping toggled");
    }
  } else note("MEDIUM", "F-GROUP", "book-group-select missing");

  // Depth view buttons
  const depthBtns = page.locator("[data-book-mode], [data-depth], .book-view-btn, button[title*='Depth'], button[title*='depth']");
  const depthCount = await depthBtns.count();
  info(`depth-like buttons: ${depthCount}`);
  for (let i = 0; i < Math.min(depthCount, 5); i++) {
    await depthBtns.nth(i).click({ force: true }).catch(() => {});
    await sleep(300);
  }
  // also scan book toolbar
  const bookToolbar = await page.evaluate(() => {
    const root = document.querySelector(".book-panel, #book-wrap, .order-book, .ob-wrap") || document.body;
    return [...root.querySelectorAll("button, select, [role=tab]")].slice(0, 40).map(e => ({
      tag: e.tagName, id: e.id, text: (e.textContent||"").trim().slice(0,40),
      title: e.getAttribute("title"), data: {...e.dataset}
    }));
  });
  info("book toolbar " + JSON.stringify(bookToolbar));

  // Markets list
  const search = page.locator("#market-search");
  if (await search.count()) {
    await search.fill("USDT");
    await sleep(400);
    await search.fill("");
    ok("market search");
  }
  const marketItem = page.locator("#markets-list [data-pair], #markets-list button, #markets-list .mkt-row").first();
  if (await marketItem.count()) {
    await marketItem.click({ force: true });
    await sleep(800);
    ok("market switch clicked");
    // switch back to HMC/USDT if possible
    const hmc = page.locator('#markets-list [data-pair="HMC/USDT"], #markets-list button:has-text("HMC/USDT")').first();
    if (await hmc.count()) { await hmc.click({ force: true }); await sleep(600); }
  } else note("MEDIUM", "F-MARKETS", "markets list items not found");

  // Activity tabs: orders, tape, history, alerts
  for (const tab of ["orders", "tape", "history", "alerts"]) {
    const t = page.locator(`[data-tab="${tab}"]`).first();
    if (await t.count()) {
      await t.click({ force: true });
      await sleep(500);
      ok(`activity tab ${tab}`);
    } else note("MEDIUM", `F-TAB-${tab}`, `activity tab ${tab} missing`);
  }

  // Alerts
  await page.locator('[data-tab="alerts"]').first().click({ force: true }).catch(() => {});
  await sleep(400);
  const alertBtn = page.locator("#btn-alert-at-mid");
  if (await alertBtn.count()) {
    await alertBtn.click();
    await sleep(600);
    ok("alert at mid");
  } else {
    // open alerts chip
    const chip = page.locator("#btn-open-alerts");
    if (await chip.count()) {
      await chip.click();
      await sleep(400);
      if (await page.locator("#btn-alert-at-mid").count()) {
        await page.locator("#btn-alert-at-mid").click();
        ok("alert via chip");
      }
    } else note("MEDIUM", "F-ALERT", "Cannot create alert");
  }

  // Open orders + cancel
  await page.locator('[data-tab="orders"]').first().click({ force: true }).catch(() => {});
  await sleep(800);
  const cancelInfo = await page.evaluate(() => {
    const cancels = [...document.querySelectorAll("[data-cancel], [data-oid-cancel], button.cancel, .btn-cancel, [data-action=cancel]")];
    const rows = [...document.querySelectorAll(".oo-row, .open-order, [data-oid], .orders-table tr")];
    return {
      cancelCount: cancels.length,
      rowCount: rows.length,
      sample: (document.querySelector("#activity-panel, .activity, .orders-body")?.innerText || "").slice(0, 400),
      cancelHtml: cancels.slice(0,3).map(c => c.outerHTML.slice(0,150))
    };
  });
  info("open orders " + JSON.stringify(cancelInfo));
  if (cancelInfo.cancelCount === 0 && cancelInfo.rowCount === 0) {
    note("MEDIUM", "F-OO-EMPTY", "No open orders visible after placing limits — cancel path untested");
  } else if (cancelInfo.cancelCount > 0) {
    await page.locator("[data-cancel], [data-oid-cancel], button.cancel, .btn-cancel").first().click({ force: true });
    await sleep(1000);
    ok("cancel clicked");
  } else {
    // try Cancel text
    const c = page.locator("button:has-text('Cancel'), a:has-text('Cancel')").first();
    if (await c.count()) {
      await c.click({ force: true });
      await sleep(1000);
      ok("cancel via text");
    } else note("MEDIUM", "F-CANCEL-UI", "Open orders present but no cancel control");
  }

  // Quick size / pct / BBO / avail chip
  await setType("limit");
  for (const sel of [
    'button[data-qs="100"][data-side="buy"]',
    'button[data-pct="25"][data-side="buy"]',
    'button[data-bbo="buy"]',
    'button[data-avail-side="buy"]',
  ]) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click({ force: true });
      await sleep(200);
      ok(`ctrl ${sel}`);
    } else note("LOW", "F-CTRL", `missing ${sel}`);
  }

  // Pay fees HMC toggle
  const fee = page.locator("#pay-fees-hmc");
  if (await fee.count()) {
    const was = await fee.isChecked();
    if (was) await fee.uncheck(); else await fee.check();
    await sleep(200);
    if (was) await fee.check(); else await fee.uncheck();
    ok("pay-fees-hmc toggled");
  }

  // Chart basics
  for (const id of ["#btn-chart-type", "#btn-indicators", "#btn-overlays", "#btn-screenshot"]) {
    const el = page.locator(id);
    if (await el.count()) {
      await el.click({ force: true });
      await sleep(400);
      // close any modal with Escape
      await page.keyboard.press("Escape");
      await sleep(200);
      ok(`chart ${id}`);
    }
  }
  // timeframe buttons
  const tf = page.locator("[data-tf], .tf-btn, .interval-btn, button[data-interval]");
  const tfc = await tf.count();
  info(`timeframe buttons ${tfc}`);
  if (tfc > 0) {
    await tf.nth(Math.min(1, tfc - 1)).click({ force: true });
    await sleep(500);
    ok("timeframe switched");
  }

  // Collapse panels
  for (const id of ["#btn-collapse-book", "#btn-collapse-right"]) {
    const el = page.locator(id);
    if (await el.count()) {
      await el.click({ force: true });
      await sleep(300);
      await el.click({ force: true });
      await sleep(300);
      ok(`collapse ${id}`);
    }
  }

  // TP/SL toggle
  await setType("limit");
  const tpsl = page.locator("#buy-tpsl");
  if (await tpsl.count()) {
    await tpsl.check();
    await sleep(300);
    const fields = page.locator("#buy-tpsl-fields");
    const vis = await fields.isVisible().catch(() => false);
    if (!vis) note("MEDIUM", "F-TPSL-FIELDS", "TP/SL checked but fields not visible");
    else ok("TP/SL fields shown");
    await tpsl.uncheck();
  }

  // Mobile side toggle visibility
  const sideToggle = page.locator("#trade-side-toggle");
  info(`trade-side-toggle visible=${await sideToggle.isVisible().catch(()=>false)}`);

  // Final state dump
  const final = await page.evaluate(() => ({
    pair: document.querySelector(".pair-label, #pair-label, .ticker-pair")?.textContent,
    buyMsg: document.getElementById("buy-msg")?.textContent,
    sellMsg: document.getElementById("sell-msg")?.textContent,
    openText: (document.querySelector("#activity-body, .activity-body, [data-tab-panel]")?.innerText || "").slice(0,300),
    typeActive: document.querySelector("#type-tabs .type.active")?.getAttribute("data-type")
      || document.getElementById("order-type-adv")?.value,
  }));
  info("final " + JSON.stringify(final));

  if (pageErrors.length) {
    for (const e of pageErrors.slice(0, 5)) note("HIGH", "F-PAGEERROR", e);
  }

  await browser.close();

  const report = { findings, log, pageErrors };
  writeFileSync("/tmp/spot_ux_report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ findings, pageErrors, logTail: log.slice(-40) }, null, 2));
  console.log("---FULL LOG---");
  for (const l of log) console.log(l);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
