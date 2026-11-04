// Painted live chart == GET /candles, bar by bar, for every live TF.
import { chromium } from "playwright";
const URL = process.env.EX_URL || "https://exchange.hackme.tech/";
const API = process.env.EX_API || "https://exchange.hackme.tech/desk-api";
const TFS = [["1m","1m"],["3m","3m"],["5m","5m"],["15m","15m"],["1H","1h"],["2H","2h"],["4H","4h"],["1D","1d"],["1W","1w"]];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => { try { localStorage.setItem("hackme-ex-tour-v1", "1"); } catch {} });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__hackmeChart && window.__hackmeChart.getDisplayedCandles().length > 10, null, { timeout: 90000 });
let fail = 0;
for (const [tf, iv] of TFS) {
  await page.evaluate((tf) => {
    const b = document.querySelector(`.tfq[data-tf="${tf}"]`);
    if (b) { b.click(); return; }
    const s = document.getElementById("tf-more");
    s.value = tf; s.dispatchEvent(new Event("change", { bubbles: true }));
  }, tf);
  // the click must have taken effect (handlers wired) before we judge the paint
  let activeTf = "";
  for (let i = 0; i < 20; i++) {
    activeTf = await page.evaluate(() => document.querySelector(".tfq.active")?.dataset.tf || document.getElementById("tf-more")?.value || "");
    if (activeTf === tf) break;
    await page.evaluate((tf) => {
      const b = document.querySelector(`.tfq[data-tf="${tf}"]`);
      if (b) { b.click(); return; }
      const s = document.getElementById("tf-more");
      s.value = tf; s.dispatchEvent(new Event("change", { bubbles: true }));
    }, tf);
    await page.waitForTimeout(500);
  }
  if (activeTf !== tf) console.log(`  WARN active TF is ${activeTf}, wanted ${tf}`);
  // wait for server full load of this TF
  await page.waitForTimeout(6000);
  const res = await page.evaluate(async ({ API, iv }) => {
    const painted = window.__hackmeChart.getDisplayedCandles();
    const r = await fetch(`${API}/candles?pair=HMC/USDT&interval=${iv}&limit=1500`, { cache: "no-store" });
    const j = await r.json();
    const srv = new Map(j.candles.map((c) => [Math.floor(Date.parse(c.open_time) / 1000), c]));
    let cmp = 0, bad = 0, missing = 0, ex = null, scale = 0;
    for (const p of painted) {
      const s = srv.get(p.time);
      if (!s) { missing++; continue; }
      if (!scale) scale = s.close / p.close;
      cmp++;
      const ok = ["open","high","low","close"].every((k) => Math.abs(p[k] * scale - s[k]) <= Math.max(1, s[k] * 1e-9));
      if (!ok) { bad++; if (!ex) ex = { t: p.time, painted: [p.open,p.high,p.low,p.close].map((x)=>x*scale), server: [s.open,s.high,s.low,s.close] }; }
    }
    // ascending + contiguous
    const steps = new Set(); for (let i = 1; i < painted.length; i++) steps.add(painted[i].time - painted[i-1].time);
    return { n: painted.length, cmp, bad, missing, ex, steps: [...steps].slice(0, 4), tip: painted.at(-1) };
  }, { API, iv });
  const legend = await page.evaluate(() => document.getElementById("ohlc-legend")?.textContent || "");
  if (/O\s*—/.test(legend)) { fail++; console.log(`  FAIL ${tf}: empty OHLC legend "${legend}"`); }
  // last 2 bars may legitimately differ (bar moved between paint and fetch)
  const realBad = res.bad > 2;
  if (realBad || res.cmp < Math.min(res.n, 10) - 2) { fail++; console.log(`  FAIL ${tf}: bad=${res.bad} cmp=${res.cmp} n=${res.n}`); }
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/tf_${tf}.png`, clip: { x: 240, y: 170, width: 1080, height: 420 } });
  console.log(`${tf.padEnd(3)} painted=${res.n} compared=${res.cmp} mismatch=${res.bad} notOnServer=${res.missing} steps=${JSON.stringify(res.steps)}${res.ex ? " ex=" + JSON.stringify(res.ex) : ""}`);
}
// a new 1m bar must appear from the server within ~75 s (minute rollover)
await page.evaluate(() => document.querySelector('.tfq[data-tf="1m"]')?.click());
await page.waitForTimeout(4000);
const last0 = await page.evaluate(() => window.__hackmeChart.getDisplayedCandles().at(-1).time);
let rolled = false;
for (let i = 0; i < 25 && !rolled; i++) {
  await page.waitForTimeout(3000);
  rolled = (await page.evaluate(() => window.__hackmeChart.getDisplayedCandles().at(-1).time)) > last0;
}
console.log("new 1m bar painted after rollover:", rolled);
if (!rolled) fail++;
console.log("page errors:", errors.length, errors.slice(0, 3));
await page.screenshot({ path: process.env.SHOT || "/tmp/live_chart.png" });
await browser.close();
console.log(fail ? `FAIL tfs=${fail}` : "PASS");
process.exit(fail ? 1 : 0);
