"use strict";
// Text-only rendering (no innerHTML from API data).
const fmt = (minor, dp) => (Number(minor || 0) / 1e8).toLocaleString(undefined, { maximumFractionDigits: dp });
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
async function load() {
  const asof = document.getElementById("asof");
  let j;
  try {
    const r = await fetch("/desk-api/reserves", { headers: { Accept: "application/json" }, cache: "no-store" });
    j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || "HTTP " + r.status);
  } catch (e) { asof.textContent = "could not load (" + e.message + ")"; return; }
  asof.textContent = "as of " + new Date(j.as_of).toLocaleString();
  document.getElementById("method").textContent = j.method || "";
  const grid = document.getElementById("assets"); grid.textContent = "";
  const body = document.getElementById("wallets"); body.textContent = "";
  for (const as of ["HMC", "SUP", "USDT"]) {
    const a = (j.assets || {})[as]; if (!a) continue;
    const dp = as === "USDT" ? 2 : 4;
    const c = el("div", "card");
    const head = el("div"); head.append(el("strong", "big", as + " "), el("span", "badge " + a.status, a.status === "covered" ? "fully covered" : a.status === "under" ? "under-covered" : "not verifiable yet"));
    c.append(head);
    c.append(el("div", "dim", "Owed to customers"), el("div", "mono big", fmt(a.customer_liabilities, dp)));
    c.append(el("div", "dim", "On-chain reserves"), el("div", "mono big", fmt(a.reserves, dp)));
    if (a.status !== "unverified") c.append(el("div", "dim", "Coverage " + Math.round(a.coverage_pct) + "%"));
    if (a.note) c.append(el("p", "dim", a.note));
    grid.append(c);
    for (const w of a.wallets || []) {
      const tr = el("tr");
      tr.append(el("td", "", as), el("td", "", w.chain));
      const td = el("td", "mono addr"); const link = el("a", "", w.address);
      if (/^https:\/\/(explorer\.hackme\.tech|bscscan\.com)\//.test(w.explorer || "")) { link.href = w.explorer; link.target = "_blank"; link.rel = "noopener noreferrer"; }
      td.append(link); tr.append(td, el("td", "mono", w.error ? "unavailable" : fmt(w.balance, dp)));
      body.append(tr);
    }
  }
}
document.getElementById("refresh").addEventListener("click", load);
load();
