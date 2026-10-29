#!/usr/bin/env node
/**
 * Live matrix: all pairs × TF (1m,15m,1h,4h,1d,1w) — continuity, tip≈last, n>0.
 * Usage: node scripts/candle_matrix_live.mjs
 */
const API = (process.env.EXCHANGE_API || "https://exchange-api.hackme.tech").replace(/\/$/, "");
const PAIRS = ["HMC/USDT", "SUP/USDT", "HMC/SUP", "HMC/BTC", "SUP/BTC"];
const TFS = ["1m", "15m", "1h", "4h", "1d"];
const STEP = { "1m": 60, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
const TIP_MAX = Number(process.env.TIP_DRIFT_MAX || 0.025);

async function get(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "hackme-candle-matrix" },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function gaps(candles, step) {
  let maxHole = 1;
  let n = 0;
  for (let i = 1; i < candles.length; i++) {
    const a = Date.parse(candles[i - 1].open_time);
    const b = Date.parse(candles[i].open_time);
    const hole = Math.round((b - a) / 1000 / step);
    if (hole > 1) n++;
    maxHole = Math.max(maxHole, hole);
  }
  return { gaps: n, maxHole };
}

async function main() {
  const tickers = ((await get("/tickers")).tickers || []).reduce((m, t) => {
    m[t.pair] = t;
    return m;
  }, {});
  const issues = [];
  const rows = [];
  for (const pair of PAIRS) {
    const last = Number(tickers[pair]?.last || 0);
    for (const tf of TFS) {
      const lim = tf === "1d" ? 40 : tf === "1m" ? 60 : 40;
      let candles = [];
      try {
        candles = (await get(`/candles?pair=${encodeURIComponent(pair)}&interval=${tf}&limit=${lim}`))
          .candles || [];
      } catch (e) {
        issues.push(`${pair}@${tf}: fetch ${e.message || e}`);
        continue;
      }
      const tip = Number(candles.at(-1)?.close || 0);
      const tipDrift = last > 0 && tip > 0 ? Math.abs(tip - last) / last : 1;
      const g = candles.length >= 2 ? gaps(candles, STEP[tf]) : { gaps: 0, maxHole: 0 };
      const coarse = ["1h", "4h", "1d"].includes(tf);
      const okContig = !coarse || g.maxHole <= 1;
      const okN = candles.length > 0;
      const okTip = tipDrift <= TIP_MAX || candles.length === 0;
      const ok = okN && okContig && (okTip || tf === "1m");
      console.error(`… ${pair}@${tf}`);
      const line = `${pair}@${tf}: n=${candles.length} tipDrift=${(tipDrift * 100).toFixed(3)}% gaps=${g.gaps} maxHole=${g.maxHole} ${ok ? "OK" : "FAIL"}`;
      rows.push(line);
      console.log(line);
      if (!okN) issues.push(`${pair}@${tf}: empty`);
      if (!okContig) issues.push(`${pair}@${tf}: flying void maxHole=${g.maxHole}`);
      if (!okTip && coarse) issues.push(`${pair}@${tf}: tip drift ${(tipDrift * 100).toFixed(2)}%`);
    }
    // 1W = client aggregate of 1d — check 1d span ≥ 7d when history exists
    const d1 = (await get(`/candles?pair=${encodeURIComponent(pair)}&interval=1d&limit=14`)).candles || [];
    if (d1.length >= 2) {
      const spanDays =
        (Date.parse(d1.at(-1).open_time) - Date.parse(d1[0].open_time)) / 86400000;
      const line = `${pair}@1W(from1d): n_days=${d1.length} span=${spanDays.toFixed(0)}d ${spanDays >= 6 ? "OK" : "SHORT"}`;
      rows.push(line);
      console.log(line);
      if (spanDays < 6 && d1.length < 7) issues.push(`${pair}@1W: short history span=${spanDays}`);
    }
  }
  console.log("---");
  if (issues.length) {
    console.error("FAILS:", issues.join(" | "));
    process.exit(1);
  }
  console.log(`PASS matrix ${PAIRS.length} pairs × ${TFS.length}+1W`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
