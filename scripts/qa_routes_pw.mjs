// Every SPA route (5 spot pairs × key TFs, convert lanes, account sections) on desktop + phone:
// JS errors, failed requests, NaN/undefined text, horizontal overflow, header ticker vs API.
import { chromium, devices } from "playwright";
const URL = process.env.EX_URL || "https://exchange.hackme.tech/";
const API = process.env.EX_API || "https://exchange.hackme.tech/desk-api";
const SEED = process.env.QA_SEED || "", ADDR = process.env.QA_ADDR || "";
const PAIRS = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
const routes = [];
for (const p of PAIRS) for (const tf of ["1m", "15m", "1H", "1D"]) routes.push(`#spot/${p}/${tf}`);
for (const c of ["hmc/usdt", "usdt/hmc", "sup/usdt", "usdt/sup", "hmc/sup", "sup/hmc", "hmc/btc", "sup/btc"]) routes.push(`#convert/${c}`);
for (const s of ["", "/deposit", "/withdraw", "/fees", "/activity", "/dust"]) routes.push(`#account${s}`);
const tick = await (await fetch(`${API}/tickers`)).json();
const lastBy = Object.fromEntries(tick.tickers.map((t) => [t.pair.replace("/", "_"), t.last / 1e8]));
let fail = 0;
const b = await chromium.launch();
for (const [label, ctxOpts] of [["desktop", { viewport: { width: 1600, height: 1000 } }], ["phone", devices["iPhone 13"]]]) {
  const ctx = await b.newContext(ctxOpts);
  await ctx.addInitScript(([s, a]) => { try { localStorage.setItem("hackme-ex-tour-v1", "1"); localStorage.setItem("hackme.tour.v2.done", "1"); if (s) { localStorage.setItem("hackme.desk.wallet.seed.v1", s); localStorage.setItem("hackme.desk.wallet.lastAddress.v1", a); } } catch {} }, [SEED, ADDR]);
  const p = await ctx.newPage();
  let errs = [], bad = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
  p.on("response", (r) => { if (r.status() >= 400 && !/favicon|\/auth\/me|2fa\/status/.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 120)}`); });
  p.on("requestfailed", (r) => { const f = r.failure()?.errorText || ""; if (!/ERR_ABORTED/.test(f)) bad.push(`FAILED ${f} ${r.url().slice(0, 120)}`); });
  await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(7000);
  for (const r of routes) {
    errs = []; bad = [];
    await p.evaluate((h) => { location.hash = h; }, r);
    await p.waitForTimeout(r.startsWith("#spot") ? 3500 : 2500);
    const info = await p.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const txt = [...document.querySelectorAll("main *, header *, #app *")].filter((e) => vis(e) && e.children.length === 0).map((e) => (e.textContent || "").trim()).filter(Boolean);
      const junk = txt.filter((t) => /\bNaN\b|\bundefined\b|\bInfinity\b|\[object /.test(t)).slice(0, 4);
      const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const pairLbl = document.querySelector(".market-row.active, .pair-title, #pair-title")?.textContent?.trim().slice(0, 40) || "";
      const last = document.querySelector("#hdr-last, .hdr-last, #ticker-last, [data-ticker-last]")?.textContent?.trim() || "";
      const candles = window.__hackmeChart?.getDisplayedCandles?.().length ?? -1;
      return { junk, over, pairLbl, last, candles, hash: location.hash };
    });
    const probs = [];
    if (errs.length) probs.push("js:" + errs.join(" | "));
    if (bad.length) probs.push("net:" + [...new Set(bad)].slice(0, 3).join(" | "));
    if (info.junk.length) probs.push("junk:" + JSON.stringify(info.junk));
    if (info.over > 2) probs.push(`overflow ${info.over}px`);
    if (r.startsWith("#spot")) {
      const pid = r.split("/")[1];
      if (info.candles < 5) probs.push(`candles=${info.candles}`);
      const n = parseFloat((info.last || "").replace(/[^0-9.]/g, ""));
      if (info.last && n && Math.abs(n / lastBy[pid] - 1) > 0.05) probs.push(`header last ${info.last} vs api ${lastBy[pid]}`);
    }
    if (probs.length) fail++;
    console.log(`${label} ${r.padEnd(22)} ${probs.length ? "FAIL " + probs.join(" ; ") : "ok"}${r.startsWith("#spot") ? ` candles=${info.candles} last=${info.last}` : ""}`);
  }
  await ctx.close();
}
await b.close();
console.log(fail ? `FAIL routes=${fail}` : "PASS");
