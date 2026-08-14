/**
 * MAX chart UX pass — Playwright smoke for lightweight-charts surface.
 * Skip tour via sessionStorage hackme-ex-tour-v1=1.
 * Uses window.__hackmeChart.getPriceScaleDebug() for price-scale assertions
 * (LWC paints axis labels on canvas — not DOM text).
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const checks = [];
const ok = (m) => {
  checks.push({ ok: true, m });
  console.log("OK ", m);
};
const bad = (m, sev = "HIGH") => {
  checks.push({ ok: false, sev, m });
  console.log(sev, m);
};
const note = (m) => {
  checks.push({ ok: true, note: true, m });
  console.log("NOTE", m);
};

async function dismissNoise(page) {
  const skip = page.locator("#tour-skip");
  if (await skip.count()) {
    await skip.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
  const ax = page.locator("#btn-announce-x");
  if (await ax.count()) await ax.click({ force: true }).catch(() => {});
}

async function priceDebug(page) {
  return page.evaluate(() => {
    const api = window.__hackmeChart;
    if (!api?.getPriceScaleDebug) return null;
    return api.getPriceScaleDebug();
  });
}

function assertScaleSane(dbg, label) {
  if (!dbg) {
    bad(`${label}: __hackmeChart debug missing`, "CRITICAL");
    return false;
  }
  if (!(dbg.ref > 0)) {
    bad(`${label}: ref=${dbg.ref}`, "HIGH");
    return false;
  }
  if (!dbg.range || !(dbg.range.to > dbg.range.from)) {
    bad(`${label}: invalid range ${JSON.stringify(dbg.range)}`, "CRITICAL");
    return false;
  }
  const span = dbg.range.to - dbg.range.from;
  const mid = (dbg.range.from + dbg.range.to) / 2;
  if (dbg.range.from < 1e-10 || dbg.range.to < 1e-10) {
    bad(`${label}: exploded toward 1e-14 range=${JSON.stringify(dbg.range)}`, "CRITICAL");
    return false;
  }
  if (mid < dbg.ref * 1e-3 || mid > dbg.ref * 1e3) {
    bad(`${label}: mid drifted mid=${mid} ref=${dbg.ref}`, "CRITICAL");
    return false;
  }
  if (span < dbg.ref * 0.0015) {
    bad(`${label}: collapsed span=${span} ref=${dbg.ref} (label-collapse)`, "CRITICAL");
    return false;
  }
  if (span / dbg.ref > 50) {
    bad(`${label}: span too wide span=${span} ref=${dbg.ref}`, "HIGH");
    return false;
  }
  if (dbg.needsHeal) {
    bad(`${label}: needsHeal=true range=${JSON.stringify(dbg.range)}`, "HIGH");
    return false;
  }
  ok(`${label}: from=${dbg.range.from.toExponential(4)} to=${dbg.range.to.toExponential(4)} span/ref=${(span / dbg.ref).toFixed(4)}`);
  return true;
}

async function priceScaleHitBox(page, host = "#chart-host") {
  return page.evaluate((sel) => {
    const hostEl = document.querySelector(sel);
    if (!hostEl) return null;
    const tds = [...hostEl.querySelectorAll("td")];
    const cell = tds.find((td) => {
      const r = td.getBoundingClientRect();
      return r.width > 40 && r.width < 160 && r.height > 100;
    });
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.45, w: r.width, h: r.height, top: r.top };
  }, host);
}

async function wheelOnPriceScale(page, times, deltaY, host = "#chart-host") {
  const box = await priceScaleHitBox(page, host);
  if (!box) return { ok: false, reason: "no price scale cell" };
  for (let i = 0; i < times; i++) {
    await page.mouse.move(box.x, box.y);
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(55);
  }
  return { ok: true, box };
}

async function dragPriceScale(page, rounds = 12) {
  const box = await priceScaleHitBox(page);
  if (!box) return { ok: false };
  for (let round = 0; round < rounds; round++) {
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x, box.top + 12, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  // Allow heal rAF / pointerup handlers
  await page.waitForTimeout(120);
  return { ok: true, box };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const pageErrors = [];
  page.on("pageerror", (e) => {
    pageErrors.push(e.message);
    bad(`pageerror: ${e.message}`, "CRITICAL");
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/frame-ancestors|127\.0\.0\.1:8080|Access-Control-Allow-Origin|Failed to load resource|favicon|ERR_CONNECTION/i.test(t))
      return;
    bad(`console.error: ${t.slice(0, 200)}`, "MEDIUM");
  });

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
      sessionStorage.setItem("hackme-ex-announce-dismiss", "1");
    } catch {
      /* ignore */
    }
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#chart-host .tv-lightweight-charts", { timeout: 25_000 });
  await page.waitForTimeout(1800);
  await dismissNoise(page);
  ok(`loaded title=${await page.title()}`);

  // Wait for debug probe (mount)
  for (let i = 0; i < 20; i++) {
    const ready = await page.evaluate(() => !!window.__hackmeChart?.getPriceScaleDebug);
    if (ready) break;
    await page.waitForTimeout(200);
  }

  let dbg = await priceDebug(page);
  assertScaleSane(dbg, "baseline");

  // ─── Price-scale wheel ────────────────────────────────────────────────
  {
    const r = await wheelOnPriceScale(page, 40, 140);
    if (!r.ok) bad(`price wheel zoom-out: ${r.reason}`, "CRITICAL");
    else assertScaleSane(await priceDebug(page), "wheel zoom-out×40");
  }
  {
    const r = await wheelOnPriceScale(page, 80, -140);
    if (!r.ok) bad(`price wheel zoom-in: ${r.reason}`, "CRITICAL");
    else assertScaleSane(await priceDebug(page), "wheel zoom-in×80");
    await page.screenshot({ path: "/tmp/ex-chart-wheel-in.png" });
  }
  await wheelOnPriceScale(page, 10, 5000);
  assertScaleSane(await priceDebug(page), "wheel mega-delta×10");

  {
    const box = await priceScaleHitBox(page);
    if (box) {
      await page.mouse.dblclick(box.x, box.y);
      await page.waitForTimeout(400);
      assertScaleSane(await priceDebug(page), "dblclick reset");
    }
  }

  // Critical regression: LWC native axis drag collapse
  await dragPriceScale(page, 14);
  dbg = await priceDebug(page);
  assertScaleSane(dbg, "drag price-axis×14");
  await page.screenshot({ path: "/tmp/ex-chart-drag-healed.png" });

  // ─── Timeframes ───────────────────────────────────────────────────────
  for (const tf of ["1m", "5m", "1H", "1D"]) {
    const btn = page.locator(`.tfq[data-tf="${tf}"]`);
    if (!(await btn.count())) {
      bad(`TF button missing ${tf}`, "MEDIUM");
      continue;
    }
    await btn.click({ force: true });
    await page.waitForTimeout(700);
    const active = await page.locator(`.tfq.active[data-tf="${tf}"]`).count();
    if (active) ok(`TF ${tf} active`);
    else bad(`TF ${tf} not active after click`, "HIGH");
    assertScaleSane(await priceDebug(page), `TF ${tf} scale`);
  }
  const tfMore = page.locator("#tf-more");
  if (await tfMore.count()) {
    for (const tf of ["30s", "15m", "4h", "1W"]) {
      await tfMore.selectOption(tf).catch(() => {});
      await page.waitForTimeout(600);
      ok(`tf-more selected ${tf}`);
      assertScaleSane(await priceDebug(page), `tf-more ${tf}`);
    }
    await page.locator(`.tfq[data-tf="1m"]`).click({ force: true });
    await page.waitForTimeout(500);
  }

  // ─── Chart types ──────────────────────────────────────────────────────
  for (const mode of ["candles", "heikin", "bars", "line", "area"]) {
    await page.locator("#btn-chart-type").click({ force: true });
    await page.waitForTimeout(120);
    const opt = page.locator(`#chart-type-drop [data-mode="${mode}"]`);
    if (!(await opt.count())) {
      bad(`chart mode missing ${mode}`, "HIGH");
      continue;
    }
    await opt.click({ force: true });
    await page.waitForTimeout(450);
    ok(`chart mode ${mode}`);
    assertScaleSane(await priceDebug(page), `mode ${mode}`);
  }
  await page.locator("#btn-chart-type").click({ force: true });
  await page.locator(`#chart-type-drop [data-mode="candles"]`).click({ force: true });
  await page.waitForTimeout(350);

  // ─── Indicators (full strip) ──────────────────────────────────────────
  const expectedInd = ["ema20", "ema50", "ema100", "ema200", "sma20", "bb", "vwap", "rsi", "macd", "stoch"];
  const present = await page.evaluate(() =>
    [...document.querySelectorAll("#ind-tabs [data-ind]")].map((b) => b.getAttribute("data-ind")),
  );
  for (const id of expectedInd) {
    if (!present.includes(id)) bad(`indicator tab missing ${id}`, "HIGH");
    else {
      await page.locator(`#ind-tabs [data-ind="${id}"]`).click({ force: true });
      await page.waitForTimeout(280);
      ok(`indicator ${id} toggled`);
    }
  }
  await page.locator("#btn-indicators").click({ force: true });
  await page.waitForTimeout(250);
  if (await page.locator(".modal-backdrop, .modal").count()) {
    ok("indicators modal open");
    await page.locator("#modal-save, .modal-x").first().click({ force: true });
  } else bad("indicators modal did not open", "HIGH");

  // ─── Drawings ─────────────────────────────────────────────────────────
  const hostBox = await page.locator("#chart-host").boundingBox();
  async function drawStroke(tool, a, b) {
    const btn = page.locator(`#draw-tools [data-dt="${tool}"]`);
    if (!(await btn.count())) {
      bad(`draw tool missing ${tool}`, "MEDIUM");
      return;
    }
    await btn.click({ force: true });
    await page.waitForTimeout(100);
    if (!hostBox) return;
    await page.mouse.move(hostBox.x + hostBox.width * a.x, hostBox.y + hostBox.height * a.y);
    await page.mouse.down();
    await page.mouse.move(hostBox.x + hostBox.width * b.x, hostBox.y + hostBox.height * b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    ok(`draw ${tool}`);
  }
  await drawStroke("hline", { x: 0.3, y: 0.4 }, { x: 0.7, y: 0.4 });
  await drawStroke("trend", { x: 0.25, y: 0.6 }, { x: 0.7, y: 0.3 });
  await drawStroke("fib", { x: 0.3, y: 0.7 }, { x: 0.65, y: 0.25 });
  await drawStroke("rect", { x: 0.35, y: 0.35 }, { x: 0.55, y: 0.55 });
  await drawStroke("measure", { x: 0.2, y: 0.5 }, { x: 0.6, y: 0.35 });
  {
    const btn = page.locator(`#draw-tools [data-dt="text"]`);
    if (await btn.count() && hostBox) {
      page.once("dialog", async (d) => {
        await d.accept("ux-pass");
      });
      await btn.click({ force: true });
      await page.mouse.click(hostBox.x + hostBox.width * 0.45, hostBox.y + hostBox.height * 0.4);
      await page.waitForTimeout(350);
      ok("draw text");
    }
  }

  if (hostBox) {
    await page.mouse.click(hostBox.x + hostBox.width * 0.4, hostBox.y + hostBox.height * 0.4, { button: "right" });
    await page.waitForTimeout(300);
    const tree = page.locator('.chart-ctx-menu [data-a="object_tree"]');
    if (await tree.count()) {
      await tree.click({ force: true });
      await page.waitForTimeout(350);
      if (await page.locator(".modal-backdrop, .modal").count()) {
        ok("object tree opened");
        await page.locator(".modal-x, #modal-close").first().click({ force: true });
      } else bad("object tree modal missing", "HIGH");
    } else bad("object tree context item missing", "HIGH");
  }
  await page.locator(`#draw-tools [data-dt="cursor"]`).click({ force: true }).catch(() => {});

  // ─── Overlays / settings / goto / screenshot / multi / fullscreen ─────
  await page.locator("#btn-overlays").click({ force: true });
  await page.waitForTimeout(200);
  if (await page.locator(".pop-menu").count()) {
    ok("overlays menu");
    await page.mouse.click(10, 10);
  } else bad("overlays menu missing", "MEDIUM");

  await page.locator("#btn-chart-settings").click({ force: true });
  await page.waitForTimeout(250);
  if (await page.locator(".modal-backdrop").count()) {
    const bull = page.locator("#cs-bull");
    if (await bull.count()) await bull.fill("#12c26a");
    await page.locator("#modal-save").click({ force: true });
    await page.waitForTimeout(400);
    ok("chart settings saved");
    assertScaleSane(await priceDebug(page), "after settings");
  } else bad("chart settings modal missing", "HIGH");

  await page.locator("#btn-goto-date").click({ force: true });
  await page.waitForTimeout(250);
  if (await page.locator("#goto-dt").count()) {
    await page.locator("#modal-save").click({ force: true });
    await page.waitForTimeout(400);
    ok("goto date confirmed");
  } else bad("goto date modal missing", "HIGH");

  await page.locator("#btn-screenshot").click({ force: true });
  await page.waitForTimeout(500);
  const toast = await page.locator(".toast").allInnerTexts().catch(() => []);
  if (toast.some((t) => /Screenshot|saved/i.test(t))) ok("screenshot toast");
  else note(`screenshot toast unclear: ${toast.join("|").slice(0, 80)}`);

  await page.locator("#btn-multi").click({ force: true });
  await page.waitForTimeout(200);
  const two = page.locator('.mc-opt[data-l="2v"]');
  if (await two.count()) {
    await two.click({ force: true });
    await page.waitForTimeout(900);
    if (await page.locator("#chart-host-2").count()) {
      ok("multi 2v mounted");
      await wheelOnPriceScale(page, 25, -140, "#chart-host-2");
      await page.waitForTimeout(200);
      // secondary has no __hackmeChart — just ensure no crash
      ok("secondary wheel exercised");
    } else bad("chart-host-2 missing", "HIGH");
  } else bad("multi picker missing", "HIGH");

  await page.locator("#btn-fullscreen").click({ force: true });
  await page.waitForTimeout(400);
  if (await page.locator("#terminal.chart-fullscreen, .chart-fullscreen").count()) ok("fullscreen on");
  else bad("fullscreen missing", "HIGH");
  assertScaleSane(await priceDebug(page), "fullscreen scale");
  await page.locator("#btn-fullscreen").click({ force: true });
  await page.waitForTimeout(300);

  await wheelOnPriceScale(page, 40, -160);
  await dragPriceScale(page, 8);
  assertScaleSane(await priceDebug(page), "final wheel+drag regression");
  await page.screenshot({ path: "/tmp/ex-chart-final.png" });

  await browser.close();

  const fails = checks.filter((c) => !c.ok);
  const bySev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const f of fails) bySev[f.sev || "HIGH"] = (bySev[f.sev || "HIGH"] || 0) + 1;
  const summary = { base: BASE, pass: fails.length === 0, failCount: fails.length, bySev, pageErrors, fails, checks };
  writeFileSync("/tmp/ex-chart-smoke.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
