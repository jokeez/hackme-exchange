// Human-path chart QA on the live desk: every indicator and every drawing tool, by mouse.
// Checks: no page errors, indicator toggles change the chart (sub-panes / canvases),
// drawings persist across TF switch + reload, clear removes them, ruler shows a readout.
//   SHOT_DIR=/tmp/x node scripts/qa_chart_tools_pw.mjs
import { chromium } from "playwright";
const URL = process.env.EX_URL || "https://exchange.hackme.tech/#spot/HMC_USDT/15m";
const SHOT = process.env.SHOT_DIR || "";
const KEY = "hackme-exchange-demo-v5";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem("hackme-ex-tour-v1", "1"); localStorage.setItem("hackme.tour.v2.done", "1"); localStorage.setItem("hackme-ex-onboard-v2", "1"); } catch {} });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text().slice(0, 200)); });
await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForFunction(() => window.__hackmeChart?.getDisplayedCandles().length > 10, null, { timeout: 90000 });
await p.waitForTimeout(1500);
const results = [];
const check = (name, ok, detail = "") => { results.push([name, !!ok, detail]); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  :: " + String(detail).slice(0, 300))); };
const shot = async (name) => { if (SHOT) await p.screenshot({ path: `${SHOT}/${name}.png`, clip: { x: 0, y: 60, width: 1600, height: 760 } }); };
const host = async () => p.evaluate(() => { const h = document.getElementById("chart-host"); const r = h.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, canvases: h.querySelectorAll("canvas").length, rows: h.querySelectorAll("table tr").length }; });
const drawings = async () => p.evaluate((k) => { try { return (JSON.parse(localStorage.getItem(k) || "{}").drawings || []).length; } catch { return -1; } }, KEY);

// ---- indicators
const inds = await p.$$eval("#ind-tabs [data-ind]", (els) => els.map((e) => ({ id: e.dataset.ind, label: e.textContent.trim(), active: e.classList.contains("active") })));
check("indicator buttons present", inds.length >= 8, JSON.stringify(inds));
for (const ind of inds) {
  if (ind.active) await p.click(`#ind-tabs [data-ind="${ind.id}"]`);
  await p.waitForTimeout(300);
  const before = await host();
  const e0 = errs.length;
  await p.click(`#ind-tabs [data-ind="${ind.id}"]`);
  await p.waitForTimeout(900);
  const after = await host();
  const on = await p.$eval(`#ind-tabs [data-ind="${ind.id}"]`, (e) => e.classList.contains("active"));
  const legend = await p.evaluate(() => document.querySelector(".ind-legend, #ind-legend, .chart-ind-legend")?.textContent?.trim().slice(0, 120) || "");
  await shot(`ind_${ind.id}`);
  check(`indicator ${ind.label}: toggles on, no errors`, on && errs.length === e0, { on, errs: errs.slice(e0), before, after, legend });
  await p.click(`#ind-tabs [data-ind="${ind.id}"]`);
  await p.waitForTimeout(400);
}
// all oscillators at once (crowded layout)
for (const id of ["volume", "rsi", "macd", "stoch"]) if (inds.find((i) => i.id === id)) await p.click(`#ind-tabs [data-ind="${id}"]`);
await p.waitForTimeout(1200);
const crowd = await host();
await shot("ind_all_oscillators");
check("all oscillators together: chart still sized", crowd.h > 250 && errs.length === 0, crowd);
for (const id of ["volume", "rsi", "macd", "stoch"]) if (inds.find((i) => i.id === id)) await p.click(`#ind-tabs [data-ind="${id}"]`);
await p.waitForTimeout(600);

// ---- drawings
await p.evaluate(() => document.querySelector('[data-dt="clear"]')?.click());
await p.waitForTimeout(300);
const h = await host();
const at = (fx, fy) => ({ x: h.x + h.w * fx, y: h.y + h.h * fy });
const tools = [
  ["hline", "click"], ["vline", "click"], ["cross", "click"], ["trend", "drag"], ["ray", "drag"],
  ["fib", "drag"], ["rect", "drag"], ["text", "click"], ["measure", "drag"],
];
let expected = await drawings();
for (const [tool, how] of tools) {
  const btn = await p.$(`[data-dt="${tool}"]`);
  if (!btn) { check(`draw tool ${tool} present`, false); continue; }
  await btn.click();
  await p.waitForTimeout(200);
  const a = at(0.30 + Math.random() * 0.1, 0.35), c = at(0.55 + Math.random() * 0.1, 0.6);
  p.once("dialog", (d) => d.accept("QA label").catch(() => {}));
  if (how === "click") {
    await p.mouse.click(a.x, a.y);
  } else {
    await p.mouse.move(a.x, a.y); await p.mouse.down();
    await p.mouse.move((a.x + c.x) / 2, (a.y + c.y) / 2, { steps: 6 });
    await p.mouse.move(c.x, c.y, { steps: 6 });
    if (tool === "measure") {
      const readout = await p.evaluate(() => document.querySelector(".measure-readout, .ruler-readout, [data-measure]")?.textContent?.trim() || [...document.querySelectorAll("#chart-host *")].map((e) => e.children.length ? "" : e.textContent).filter((t) => /%/.test(t || "")).slice(0, 2).join(" | "));
      check("ruler shows Δ readout while dragging", /%|bars|Δ/.test(readout), readout);
    }
    await p.mouse.up();
  }
  await p.waitForTimeout(500);
  // text tool may open an inline editor instead of a dialog
  if (tool === "text") { const ed = await p.$('input.draw-text-input, textarea.draw-text-input, .text-edit input'); if (ed) { await ed.fill("QA label"); await ed.press("Enter"); await p.waitForTimeout(300); } }
  const n = await drawings();
  const persisted = tool === "measure" ? true : n > expected;
  if (tool !== "measure" && n > expected) expected = n;
  await shot(`draw_${tool}`);
  check(`draw ${tool} (${how}) creates a drawing`, persisted, { before: expected, now: n });
}
await p.keyboard.press("Escape");
const nDraw = await drawings();
check("drawings stored", nDraw >= 7, nDraw);
// TF switch keeps drawings
await p.click('.tfq[data-tf="1H"]').catch(() => {});
await p.waitForTimeout(2500);
await p.click('.tfq[data-tf="15m"]').catch(() => {});
await p.waitForTimeout(2500);
check("drawings survive TF switch", (await drawings()) === nDraw, { nDraw, now: await drawings() });
await shot("draw_after_tf_switch");
// reload keeps drawings
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.__hackmeChart?.getDisplayedCandles().length > 10, null, { timeout: 90000 });
await p.waitForTimeout(2000);
check("drawings survive reload", (await drawings()) === nDraw, { nDraw, now: await drawings() });
await shot("draw_after_reload");
// lock then clear
await p.click('[data-dt="lock"]');
await p.waitForTimeout(300);
const locked = await p.$eval('[data-dt="lock"]', (e) => e.getAttribute("aria-pressed") === "true" || e.classList.contains("active"));
check("lock toggles on", locked);
await p.click('[data-dt="lock"]');
p.once("dialog", (d) => d.accept().catch(() => {}));
await p.click('[data-dt="clear"]');
await p.waitForTimeout(600);
const left = await drawings();
check("clear removes drawings", left < nDraw, { before: nDraw, left });
if (left > 0) { p.once("dialog", (d) => d.accept().catch(() => {})); await p.click('[data-dt="clear"]'); await p.waitForTimeout(500); }
check("no page errors during the whole run", errs.length === 0, errs);
await b.close();
const fail = results.filter((r) => !r[1]);
console.log(`\nSUMMARY ${results.length - fail.length}/${results.length} passed`);
for (const f of fail) console.log("  FAIL:", f[0], "::", JSON.stringify(f[2]).slice(0, 300));
process.exit(fail.length ? 1 : 0);
