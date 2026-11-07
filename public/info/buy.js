"use strict";
(async () => {
  try {
    const r = await fetch("/desk-api/tickers", { headers: { Accept: "application/json" }, cache: "no-store" });
    const j = await r.json();
    const t = (j.tickers || []).find((x) => x.pair === "HMC/USDT");
    if (!t) return;
    const last = Number(t.last || 0) / 1e8;
    if (last > 0) document.getElementById("px").textContent = last.toFixed(6) + " USDT";
    const cv = Number(t.customer_volume_24h_base);
    document.getElementById("vol").textContent = Number.isFinite(cv) ? (cv / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " HMC" : "—";
  } catch (_) { /* page works without live numbers */ }
})();
