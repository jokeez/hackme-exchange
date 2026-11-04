import { chromium } from "playwright";
const SEED = process.env.QA_SEED, ADDR = process.env.QA_ADDR;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
await p.addInitScript(([s, a]) => { localStorage.setItem("hackme-ex-tour-v1", "1"); localStorage.setItem("hackme.desk.wallet.seed.v1", s); localStorage.setItem("hackme.desk.wallet.lastAddress.v1", a); }, [SEED, ADDR]);
await p.goto("https://exchange.hackme.tech/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(8000);
const info = await p.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  const q = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => ({ tag: e.tagName, id: e.id, cls: (e.className || "").toString().slice(0, 50), text: (e.innerText || e.value || "").trim().slice(0, 30), name: e.name || "", type: e.type || "" }));
  return { connect: q("button").filter((x) => /connect|log ?in|sign/i.test(x.text + x.id)), zone: q("#order-zone input, #order-zone button, #order-zone select").slice(0, 60), header: document.querySelector("header")?.innerText?.slice(0, 200) };
});
console.log(JSON.stringify(info, null, 1).slice(0, 6000));
console.log("errors", errs.slice(0, 8));
await b.close();
