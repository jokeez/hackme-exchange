/**
 * System menu / theme / import-export XSS / reset / announce smoke @ :5199
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const findings = [];
const ok = (m) => {
  findings.push({ ok: true, m });
  console.log("OK ", m);
};
const bad = (m, sev = "HIGH") => {
  findings.push({ ok: false, sev, m });
  console.log(sev, m);
};

async function toastText(page) {
  const t = page.locator(".toast");
  if (!(await t.count())) return "";
  return (await t.allInnerTexts()).join(" | ");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("pageerror", (e) => bad(`pageerror: ${e.message}`, "CRITICAL"));
  // Single dialog handler for the whole run
  page.on("dialog", async (d) => {
    if (d.type() === "alert") bad(`unexpected alert: ${d.message()}`, "CRITICAL");
    await d.accept().catch(() => {});
  });

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
      sessionStorage.removeItem("hackme-ex-announce-dismiss");
    } catch {
      /* ignore */
    }
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#btn-system-status, .terminal, .nav-btn", { timeout: 25_000 });
  await page.waitForTimeout(1500);

  // Announce dismiss
  const announce = page.locator("#announce-bar");
  if (await announce.count()) {
    await page.locator("#btn-announce-x").click({ force: true });
    await page.waitForTimeout(200);
    if (await announce.count()) bad("announce bar still present after dismiss", "MEDIUM");
    else ok("announce banner dismissed");
    const dismissed = await page.evaluate(() => sessionStorage.getItem("hackme-ex-announce-dismiss"));
    if (dismissed !== "1") bad("announce dismiss not persisted to sessionStorage", "MEDIUM");
    else ok("announce dismiss persisted");
  } else {
    ok("announce already absent (hub embed or prior dismiss)");
  }

  // System status menu
  const sys = page.locator("#btn-system-status");
  if (!(await sys.count())) bad("System status button missing", "CRITICAL");
  else {
    await sys.click({ force: true });
    await page.waitForTimeout(200);
    const drop = page.locator("#sys-drop");
    if (await drop.evaluate((el) => el.classList.contains("hidden"))) {
      bad("sys-drop still hidden after System click", "HIGH");
    } else ok("System status opens sys-drop");
  }

  // Themes hub/wallet
  await page.locator("#btn-theme-hub").click({ force: true });
  await page.waitForTimeout(400);
  const hubTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (hubTheme !== "hub") bad(`theme hub failed got=${hubTheme}`, "HIGH");
  else ok("Theme: Hub applied");

  await page.locator("#btn-system-status").click({ force: true });
  await page.waitForTimeout(150);
  const hubActive = await page.locator("#btn-theme-hub").evaluate((el) => el.classList.contains("active"));
  if (!hubActive) bad("Theme Hub button missing active class", "MEDIUM");
  else ok("Theme Hub shows active");

  await page.locator("#btn-theme-wallet").click({ force: true });
  await page.waitForTimeout(400);
  const walletTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (walletTheme !== "wallet") bad(`theme wallet failed got=${walletTheme}`, "HIGH");
  else ok("Theme: Wallet applied");

  // Sync HMC/SUP
  await page.locator("#btn-system-status").click({ force: true });
  await page.waitForTimeout(150);
  await page.locator("#btn-sync-node-header").click({ force: true });
  await page.waitForTimeout(800);
  let syncToast = await toastText(page);
  // Node fetch may take longer — poll toasts briefly
  for (let i = 0; i < 12 && !/sync|HMC|SUP|node|wallet|unavailable|offline|fail|timeout/i.test(syncToast); i++) {
    await page.waitForTimeout(500);
    syncToast = await toastText(page);
  }
  if (/sync|HMC|SUP|node|wallet|unavailable|offline|fail|timeout/i.test(syncToast)) {
    ok(`Sync HMC/SUP feedback: ${syncToast.slice(0, 120)}`);
  } else {
    bad(`Sync HMC/SUP no feedback toast=${syncToast}`, "MEDIUM");
  }

  // Export state
  await page.locator("#btn-system-status").click({ force: true });
  await page.waitForTimeout(150);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 8_000 }).catch(() => null),
    page.locator("#btn-export-demo").click({ force: true }),
  ]);
  if (!download) bad("Export did not trigger download", "HIGH");
  else {
    const name = download.suggestedFilename();
    if (!/\.json$/i.test(name)) bad(`export filename not json: ${name}`, "MEDIUM");
    else ok(`Export state → ${name}`);
  }

  // Malicious import XSS — should sanitize, not inject
  const evilPath = join(tmpdir(), `hackme-evil-import-${Date.now()}.json`);
  writeFileSync(
    evilPath,
    JSON.stringify({
      state: {
        wallet: { usdt: 1234, hmc: 50, sup: 10, btc: 0.01 },
        orders: [],
        trades: [],
        oracleAnchor: `"><img src=x onerror=alert(1)>`,
        multiChartLayout: `"><img src=x onerror=alert(1)>`,
        chartSettings: {
          gridOpacity: `"><img src=x onerror=alert(1)>`,
          candleStyle: { bullBody: `"><img src=x onerror=alert(1)>` },
        },
        drawings: [
          {
            id: `"><img src=x onerror=alert(1)>`,
            tool: "hline",
            pairId: "HMC_USDT",
            points: [{ time: 1, price: 1 }],
            color: "#00e5ff",
          },
        ],
        ledger: [
          {
            id: "x",
            kind: `"><img src=x onerror=alert(1)>`,
            asset: `"><script>alert(1)</script>`,
            amount: 1,
            usdtValue: 1,
            note: `<img src=x onerror=alert(1)>`,
            ts: Date.now(),
          },
        ],
      },
    }),
  );

  await page.locator("#btn-system-status").click({ force: true });
  await page.waitForTimeout(150);
  await page.locator("#btn-import-demo").click({ force: true });
  await page.setInputFiles("#import-demo-file", evilPath);
  await page.waitForTimeout(1500);

  const html = await page.content();
  if (/<img[^>]+onerror\s*=/i.test(html)) bad("XSS img onerror present in DOM after import", "CRITICAL");
  else ok("Import malicious JSON — no onerror sink in DOM");

  const postImport = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem("hackme-exchange-demo-v5") || "{}");
      return {
        usdt: s.wallet?.usdt,
        oracle: s.oracleAnchor,
        layout: s.multiChartLayout,
        grid: s.chartSettings?.gridOpacity,
        drawingId: s.drawings?.[0]?.id,
      };
    } catch {
      return null;
    }
  });
  const toast = await toastText(page);
  if (postImport?.usdt === 1234) ok(`Import applied wallet usdt=${postImport.usdt}`);
  else bad(`Import unclear toast=${toast} state=${JSON.stringify(postImport)}`, "HIGH");

  if (typeof postImport?.oracle === "number" && Number.isFinite(postImport.oracle)) {
    ok(`Import sanitized oracleAnchor=${postImport.oracle}`);
  } else bad(`oracleAnchor not sanitized: ${postImport?.oracle}`, "CRITICAL");
  if (typeof postImport?.layout === "string" && /^(1|2v|2h|4)$/.test(postImport.layout)) {
    ok(`Import sanitized multiChartLayout=${postImport.layout}`);
  } else bad(`multiChartLayout not sanitized: ${postImport?.layout}`, "CRITICAL");
  if (typeof postImport?.grid === "number") ok(`Import sanitized gridOpacity=${postImport.grid}`);
  else bad(`gridOpacity not sanitized: ${postImport?.grid}`, "CRITICAL");
  if (postImport?.drawingId && !/[<>"']/.test(postImport.drawingId)) {
    ok(`Import sanitized drawing id=${postImport.drawingId}`);
  } else bad(`drawing id not sanitized: ${postImport?.drawingId}`, "HIGH");

  // Oracle anchor after malicious import — open settings must not XSS
  await page.locator("#btn-system-status").click({ force: true });
  await page.waitForTimeout(150);
  await page.locator("#btn-settings").click({ force: true });
  await page.waitForTimeout(300);
  const anchorVal = await page.locator("#anchor-inp").inputValue().catch(() => "");
  if (!anchorVal || /[<>"']/.test(anchorVal)) {
    bad(`Oracle anchor input unsafe value=${anchorVal}`, "CRITICAL");
  } else ok(`Oracle anchor sanitized in modal value=${anchorVal}`);
  await page.locator("#modal-close").click({ force: true }).catch(() => {});

  // Reset demo
  await page.locator("#btn-system-status").click({ force: true });
  await page.waitForTimeout(150);
  await page.locator("#btn-reset").click({ force: true });
  await page.waitForTimeout(1200);
  const resetToast = await toastText(page);
  if (/reset|blocked|lab/i.test(resetToast)) ok(`Reset demo: ${resetToast.slice(0, 100)}`);
  else {
    const usdt = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("hackme-exchange-demo-v5") || "{}").wallet?.usdt;
      } catch {
        return null;
      }
    });
    if (usdt === 10000) ok("Reset demo restored default USDT");
    else bad(`Reset unclear toast=${resetToast} usdt=${usdt}`, "HIGH");
  }

  const failed = findings.filter((f) => !f.ok);
  console.log(JSON.stringify({ pass: failed.length === 0, failed, findings }, null, 2));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
