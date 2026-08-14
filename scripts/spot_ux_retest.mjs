import { chromium } from "playwright";
const findings = [];
const note = (sev, id, msg, status="open") => findings.push({sev,id,msg,status});
const ok = (m) => findings.push({sev:"OK", id:m, msg:"", status:"ok"});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const posts = [];
page.on("request", r => {
  if (r.url().includes("18443/orders") && r.method()==="POST") {
    try { posts.push(JSON.parse(r.postData()||"{}")); } catch { posts.push(r.postData()); }
  }
});
page.on("response", async r => {
  if (r.url().includes("18443/orders") && r.request().method()==="POST") {
    posts.push({status:r.status(), body:(await r.text()).slice(0,200)});
  }
});
await page.addInitScript(() => sessionStorage.setItem("hackme-ex-tour-v1","1"));
await page.goto("http://127.0.0.1:5199/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#btn-buy", { timeout: 25000 });
await page.waitForTimeout(1200);
await page.locator("#btn-announce-x").click({force:true}).catch(()=>{});
await page.locator('button.nav-btn[data-view="account"]').click({force:true});
await page.waitForTimeout(700);
await page.locator("#btn-lab-fixture-connect").click();
await page.waitForTimeout(2800);
for (const id of ["#btn-lab-mint-hmc","#btn-lab-bridge-usdt"]) {
  const b = page.locator(id);
  if (await b.count() && !(await b.isDisabled())) { await b.click(); await page.waitForTimeout(800); }
}
await page.locator('button.nav-btn[data-view="spot"]').click({force:true});
await page.waitForTimeout(1500);

const bookMid = parseFloat(await page.locator(".ob-mid-price").innerText());
const tbPrice = parseFloat(await page.locator(".tb-price").innerText());
const tbSub = await page.locator(".tb-sub").innerText();
console.log({bookMid, tbPrice, tbSub, driftPct: ((tbPrice-bookMid)/bookMid*100).toFixed(2)});
if (Math.abs(tbPrice-bookMid)/bookMid > 0.05) note("HIGH","F-TICKER-DRIFT",`ticker ${tbPrice} vs book ${bookMid}`);
else ok(`ticker≈book ${tbPrice}`);

async function setType(t) {
  const tab = page.locator(`#type-tabs button[data-type="${t}"]`);
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(400); return; }
  await page.locator("#order-type-adv").selectOption(t); await page.waitForTimeout(400);
}
async function place(side, amt) {
  await page.locator(`#${side}-amt`).fill(String(amt));
  await page.locator(`#btn-${side}`).click({force:true});
  await page.waitForTimeout(1800);
  return (await page.locator(`#${side}-msg`).innerText().catch(()=>"")).trim();
}

await setType("market");
let msg = await place("buy", 400);
console.log("MKT BUY", msg);
if (/price_band/i.test(msg)) note("CRITICAL","F-MKT-BUY-BAND", msg, "open");
else { note("CRITICAL","F-MKT-BUY-BAND","price_band on market buy","fixed"); ok("mkt buy "+msg); }

msg = await place("sell", 150);
console.log("MKT SELL", msg);
if (/price_band/i.test(msg)) note("HIGH","F-MKT-SELL-BAND", msg);
else ok("mkt sell "+msg);

await setType("limit");
const bp = parseFloat(await page.locator("#buy-price").inputValue());
await page.locator("#buy-price").fill((bp*0.92).toPrecision(6));
msg = await place("buy", 700);
console.log("LIM BUY", msg); ok("lim "+msg);

const sp = parseFloat(await page.locator("#sell-price").inputValue());
await page.locator("#sell-price").fill((sp*1.08).toPrecision(6));
msg = await place("sell", 300);
console.log("LIM SELL", msg);
if (/price_band/i.test(msg)) note("MEDIUM","F-LIM-SELL-BAND", msg);
else ok("lim sell "+msg);

await setType("oco");
msg = await place("sell", 120);
console.log("OCO", msg);
if (/price_band/i.test(msg)) note("MEDIUM","F-OCO-BAND", msg);
else ok("oco "+msg);

await setType("stop_limit");
msg = await place("buy", 180);
console.log("SL", msg); ok("sl "+msg);

await page.locator('button[data-bv="depth"]').click({force:true});
await page.waitForTimeout(400);
await page.locator('button[data-bv="book"]').click({force:true});
await page.waitForTimeout(300);
ok("depth toggle");

const vals = await page.locator("#book-group-select option").evaluateAll(os => os.map(o=>o.value));
if (vals[2]) { await page.locator("#book-group-select").selectOption(vals[2]); ok("group"); }

await setType("limit");
const before = await page.locator("#buy-price").inputValue();
await page.locator(".ob-row").first().click({force:true});
await page.waitForTimeout(300);
const after = await page.locator("#buy-price").inputValue();
if (before!==after) ok(`bookclick ${before}->${after}`); else note("MEDIUM","F-BOOK-CLICK","unchanged");

await page.locator('[data-tab="orders"]').click({force:true});
await page.waitForTimeout(700);
const n = await page.locator("[data-cancel]").count();
console.log("open cancels", n);
if (!n) note("MEDIUM","F-OO-EMPTY","none");
else { await page.locator("[data-cancel]").first().click({force:true}); await page.waitForTimeout(1200); ok(`cancel from ${n}`); }

await page.locator('[data-tab="alerts"]').click({force:true});
await page.waitForTimeout(400);
if (await page.locator("#btn-alert-at-mid").count()) {
  await page.locator("#btn-alert-at-mid").click({force:true});
  ok("alert");
}
await page.locator('button[data-bbo="buy"]').click({force:true});
await page.locator('button[data-pct="50"][data-side="buy"]').click({force:true});
ok("bbo+pct");
// qs hidden in hub embed — note only
const qsVis = await page.locator('button[data-qs="100"][data-side="buy"]').isVisible().catch(()=>false);
if (!qsVis) note("LOW","F-QS-HUB-HIDDEN","+N quick-size hidden under hub embed CSS", "open");
else ok("qs visible");

console.log("POSTS", JSON.stringify(posts.filter(p=>p.type||p.status).slice(-10),null,2));
console.log("FINDINGS", JSON.stringify(findings,null,2));
await browser.close();
