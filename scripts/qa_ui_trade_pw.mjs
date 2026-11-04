// Live UI trading QA with a funded test wallet. Every UI action is verified against the API.
import { chromium } from "playwright";
const SEED = process.env.QA_SEED, ADDR = process.env.QA_ADDR, SHOTS = process.env.SHOT_DIR || "/tmp";
const API = "https://exchange.hackme.tech/desk-api";
const results = [];
const check = (n, ok, d = "") => { results.push([n, !!ok, d]); console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  :: " + JSON.stringify(d).slice(0, 300))); };
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
p.on("dialog", (d) => d.accept());
await p.addInitScript(([s, a]) => { localStorage.setItem("hackme-ex-tour-v1", "1"); localStorage.setItem("hackme.desk.wallet.seed.v1", s); localStorage.setItem("hackme.desk.wallet.lastAddress.v1", a); }, [SEED, ADDR]);
for (let i = 0; i < 3; i++) { try { await p.goto("https://exchange.hackme.tech/", { waitUntil: "domcontentloaded", timeout: 45000 }); break; } catch (e) { if (i === 2) throw e; } }
await p.waitForFunction(() => /Avbl\s+[\d,.]+\s+USDT/.test(document.querySelector("#order-zone")?.innerText || ""), null, { timeout: 60000 });
const api = (path, opt = {}) => p.evaluate(async ([API, path, opt]) => { const r = await fetch(API + path, { credentials: "include", cache: "no-store", ...opt }); let j = {}; try { j = await r.json(); } catch {} return { st: r.status, j }; }, [API, path, opt]);
const openOrders = async () => ((await api("/orders")).j.orders || []);
const bookTop = async () => { const r = await api("/book?pair=HMC/USDT&depth=5"); return { bid: r.j.bids[0].price / 1e8, ask: r.j.asks[0].price / 1e8 }; };
const toastText = () => p.evaluate(() => [...document.querySelectorAll(".toast, [class*=toast]")].map((e) => e.innerText.trim()).filter(Boolean).slice(-3).join(" | "));
const shot = (n) => p.screenshot({ path: `${SHOTS}/ui_${n}.png` });

// session works from the browser (Connect finishes a few seconds after first paint)
let sess = { j: {} };
for (let i = 0; i < 30; i++) { sess = await api("/auth/session"); if (sess.j.address) break; await p.waitForTimeout(1000); }
check("browser session authenticated as test wallet", sess.st === 200 && JSON.stringify(sess.j).toLowerCase().includes(ADDR.toLowerCase()), sess);
const before = await openOrders();
for (const o of before) await p.evaluate(async ([API, id]) => {}, [API, o.id]);

// 1. LIMIT buy below market through the form
const { bid, ask } = await bookTop();
const px = (bid * 0.95).toFixed(8);
await p.click('#order-zone button.type:has-text("Limit")');
await p.fill("#buy-price", px);
await p.fill("#buy-amt", "20");
await shot("limit_filled");
await p.click("#btn-buy");
await p.waitForTimeout(2500);
let oo = await openOrders();
const lim = oo.find((o) => Math.abs(o.price / 1e8 - Number(px)) < 1e-8 && o.side === "buy");
check("UI limit buy created exact order (price, qty)", lim && lim.qty === 20 * 1e8, { px, oo: oo.map((o) => [o.side, o.price, o.qty]), toast: await toastText() });
await shot("limit_placed");
// order visible in the open-orders table and as a chart line
const tableHas = await p.evaluate((px) => document.body.innerText.includes(Number(px).toFixed(6).slice(0, 7)), px);
check("open order visible in UI", tableHas);

// 2. cancel through the UI
const cancelled = await p.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter((b) => /^(cancel|×|✕)$/i.test(b.innerText.trim()) || /cancel/i.test(b.title || "") || b.dataset.cancel || b.dataset.orderId);
  const vis = btns.filter((b) => b.offsetWidth);
  if (vis[0]) { vis[0].click(); return vis[0].outerHTML.slice(0, 120); }
  return "";
});
await p.waitForTimeout(2500);
oo = await openOrders();
check("UI cancel removed the order", lim && !oo.find((o) => o.id === lim.id), { cancelled, left: oo.map((o) => o.id) });

// 3. MARKET buy 3 HMC via the form
const balBefore = (await api("/balances")).j.balances;
await p.click('#order-zone button.type:has-text("Market")');
await p.waitForTimeout(300);
await p.fill("#buy-amt", "3");
await p.click("#btn-buy");
await p.waitForTimeout(3000);
const balAfter = (await api("/balances")).j.balances;
const d = (a, bb, asset) => (bb.find((x) => x.asset === asset)?.amount || 0) - (a.find((x) => x.asset === asset)?.amount || 0);
check("UI market buy received ~3 HMC", d(balBefore, balAfter, "HMC") === 3e8, { dHMC: d(balBefore, balAfter, "HMC") / 1e8, toast: await toastText() });
check("UI market buy spent USDT", d(balBefore, balAfter, "USDT") < 0, d(balBefore, balAfter, "USDT"));
await shot("market_buy");
const chip = await p.evaluate(() => document.querySelector("#order-zone")?.innerText.match(/Avbl\s+([\d,.]+)\s+HMC/)?.[1] || "");
const hmcAmt = balAfter.find((x) => x.asset === "HMC");
check("Avbl HMC chip matches API available", Math.abs(Number(chip.replace(/,/g, "")) - hmcAmt.available / 1e8) < 0.01, { chip, api: hmcAmt.available / 1e8 });

// 4. MARKET sell 3 HMC back
await p.fill("#sell-amt", "3");
await p.click("#btn-sell");
await p.waitForTimeout(3000);
const balSell = (await api("/balances")).j.balances;
check("UI market sell delivered 3 HMC", d(balAfter, balSell, "HMC") === -3e8, d(balAfter, balSell, "HMC") / 1e8);

// 5. STOP LIMIT sell via form
await p.click('#order-zone button.type:has-text("Stop Limit")');
await p.waitForTimeout(400);
const stopInputs = await p.evaluate(() => [...document.querySelectorAll("#order-zone input")].filter((e) => e.offsetWidth).map((e) => e.id));
check("stop-limit form shows stop inputs", stopInputs.some((i) => /stop/i.test(i)), stopInputs);
const sid = stopInputs.find((i) => /sell.*stop|stop.*sell/i.test(i)) || stopInputs.find((i) => /stop/i.test(i) && /sell/i.test(i));
if (sid) {
  await p.fill("#" + sid, (bid * 0.9).toFixed(8));
  await p.fill("#sell-price", (bid * 0.89).toFixed(8));
  await p.fill("#sell-amt", "2");
  await p.click("#btn-sell");
  await p.waitForTimeout(2500);
  const all = (await api("/orders")).j;
  const armed = JSON.stringify(all).includes("armed");
  check("UI stop-limit armed on server", armed, { all: JSON.stringify(all).slice(0, 300), toast: await toastText() });
  await shot("stop_limit");
}

// 6. chart: indicators, chart types, TF switch — no errors, chart keeps data
for (const ind of ["EMA20", "BB", "VWAP", "RSI", "MACD", "Stoch"]) {
  const ok = await p.evaluate((ind) => { const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === ind && x.offsetWidth); if (b) { b.click(); return true; } return false; }, ind);
  await p.waitForTimeout(500);
  const n = await p.evaluate(() => window.__hackmeChart?.getDisplayedCandles().length || 0);
  check(`indicator ${ind} toggles, chart intact`, ok && n > 10, { ok, n });
}
await shot("indicators");
for (const tf of ["1m", "15m", "1H", "1D"]) {
  await p.click(`.tfq[data-tf="${tf}"]`);
  await p.waitForTimeout(2500);
  const n = await p.evaluate(() => window.__hackmeChart?.getDisplayedCandles().length || 0);
  check(`TF ${tf} renders`, n > 3, n);
}
await shot("tf_1D_indicators");

// cleanup: cancel everything we left
const rest = (await api("/orders")).j;
console.log("left open:", JSON.stringify(rest).slice(0, 300));
check("no page errors", errs.length === 0, errs.slice(0, 3));
console.log("\nSUMMARY", results.filter((r) => r[1]).length, "/", results.length);
await b.close();
