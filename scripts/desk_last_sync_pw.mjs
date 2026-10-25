#!/usr/bin/env node
/**
 * Playwright: header Last ≈ chart tip ≈ Soft-MM book mid (all pairs × key TFs).
 *   EX_LIVE_BASE=https://exchange.hackme.tech node scripts/desk_last_sync_pw.mjs
 *   (local Vite when EX_LIVE_BASE unset)
 */
import { chromium } from "playwright";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIVE = (process.env.EX_LIVE_BASE || "").replace(/\/$/, "");
const fail = [];
const ok = (m) => console.log(`[OK] ${m}`);
const bad = (m) => {
  fail.push(m);
  console.error(`[FAIL] ${m}`);
};

async function startPreview() {
  if (LIVE) return { base: LIVE, close: async () => {} };
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    root: ROOT,
    server: { host: "127.0.0.1", port: 5197, strictPort: true },
  });
  await vite.listen();
  return {
    base: "http://127.0.0.1:5197",
    close: async () => {
      await vite.close();
    },
  };
}

async function main() {
  const srv = await startPreview();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${srv.base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(".tb-price, #chart-host", { timeout: 30_000 });
    await page.waitForTimeout(LIVE ? 4500 : 2500);

    const pairs = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
    const tfs = ["1m", "15m", "1H", "1D"];
    const rows = [];

    for (const pair of pairs) {
      await page
        .evaluate((pid) => {
          const btn = document.querySelector(`[data-pair="${pid}"], .pair-row[data-id="${pid}"]`);
          if (btn instanceof HTMLElement) btn.click();
        }, pair)
        .catch(() => {});
      await page.waitForTimeout(900);

      for (const tf of tfs) {
        await page
          .locator(`[data-tf="${tf}"], .tfq[data-tf="${tf}"]`)
          .first()
          .click({ timeout: 2500 })
          .catch(() => {});
        await page.waitForTimeout(900);
        const snap = await page.evaluate(
          ({ pairId, tfId }) => {
            const headerTxt = (document.querySelector(".tb-price")?.textContent || "").replace(/[^\d.]/g, "");
            const headerLast = Number(headerTxt) || 0;
            const chart = window.__hackmeChart;
            const tip = chart?.getDisplayedLastCandle?.()?.close ?? 0;
            const candles = chart?.getDisplayedCandles?.() || [];
            // Infer bucket from median Δt — switching TF can briefly leave prior paint.
            let gaps = 0;
            let step = 0;
            if (candles.length > 3) {
              const deltas = [];
              for (let i = 1; i < candles.length; i++) {
                const d = candles[i].time - candles[i - 1].time;
                if (d > 0) deltas.push(d);
              }
              deltas.sort((a, b) => a - b);
              step = deltas[Math.floor(deltas.length / 2)] || 0;
              if (step > 0) {
                for (const d of deltas) if (d !== step) gaps++;
              }
            }
            const midEl = document.querySelector(".ob-mid-price");
            const bookMid = Number((midEl?.textContent || "").replace(/[^\d.]/g, "")) || 0;
            const buyPx = Number((document.getElementById("buy-price")?.value || "").replace(/[^\d.]/g, "")) || 0;
            const dbg = window.__hackmeExchangeDebug;
            let matrixTip = 0;
            let matrixOk = true;
            try {
              const m = dbg?.candleMatrixAudit?.();
              const cell = m?.[pairId]?.[tfId];
              if (cell) {
                matrixTip = cell.tipClose || 0;
                matrixOk = !!cell.tipOk && !!cell.contiguous;
              }
            } catch {
              /* ignore */
            }
            return {
              headerLast,
              tip,
              bookMid,
              buyPx,
              gaps,
              n: candles.length,
              matrixTip,
              matrixOk,
              boot: document.querySelector('script[src*="boot-"]')?.getAttribute("src") || "",
            };
          },
          { pairId: pair, tfId: tf },
        );

        rows.push({ pair, tf, ...snap });

        if (!(snap.headerLast > 0)) bad(`${pair} ${tf}: header Last missing`);
        if (snap.tip > 0 && snap.headerLast > 0) {
          const d = Math.abs(snap.tip - snap.headerLast) / Math.max(snap.tip, snap.headerLast);
          if (d > 0.01) {
            bad(
              `${pair} ${tf}: tip↔header drift ${(d * 100).toFixed(2)}% tip=${snap.tip} last=${snap.headerLast}`,
            );
          }
        }
        if (snap.bookMid > 0 && snap.headerLast > 0) {
          const d = Math.abs(snap.bookMid - snap.headerLast) / Math.max(snap.bookMid, snap.headerLast);
          if (d > 0.02) {
            bad(
              `${pair} ${tf}: bookMid↔header drift ${(d * 100).toFixed(2)}% mid=${snap.bookMid} last=${snap.headerLast}`,
            );
          }
        }
        if (snap.buyPx > 0 && snap.headerLast > 0) {
          const resting = snap.headerLast * 0.9985;
          const d = Math.abs(snap.buyPx - resting) / Math.max(snap.buyPx, resting);
          if (d > 0.01) {
            bad(
              `${pair} ${tf}: buy form↔resting drift ${(d * 100).toFixed(2)}% form=${snap.buyPx} resting=${resting}`,
            );
          }
        }
        // Contiguity: allow a few bridges; fail only on sparse islands (>5% odd Δt).
        if (snap.n > 40 && snap.gaps > Math.max(3, snap.n * 0.05)) {
          bad(`${pair} ${tf}: ${snap.gaps} time gaps in ${snap.n} bars`);
        }
        if (snap.matrixTip > 0 && !snap.matrixOk) bad(`${pair} ${tf}: candleMatrixAudit tip/contiguous fail`);
      }
    }

    const boot = rows.find((r) => r.boot)?.boot || "";
    console.log("[desk-last-sync] boot", boot);
    console.table(
      rows.map((r) => ({
        pair: r.pair,
        tf: r.tf,
        last: r.headerLast,
        tip: r.tip,
        mid: r.bookMid,
        buy: r.buyPx,
        n: r.n,
        gaps: r.gaps,
      })),
    );
    if (!fail.length) ok(`pairs×tf checked ${rows.length}`);
  } finally {
    await browser.close().catch(() => {});
    await srv.close();
  }

  if (fail.length) {
    console.error("[desk-last-sync] FAIL", fail);
    process.exit(1);
  }
  console.log("[desk-last-sync] PASS");
}

await main();
