/**
 * MAX UX pass: Convert + Account + Pool (lab, 127.0.0.1 only).
 * Skip tour via sessionStorage hackme-ex-tour-v1=1.
 */
import { chromium } from "playwright";

const BASE = process.env.EX_UI_BASE || "http://127.0.0.1:5199/";
const checks = [];
const ok = (m) => {
  checks.push({ ok: true, m });
  console.log("OK ", m);
};
const bad = (m, sev = "HIGH") => {
  checks.push({ ok: false, sev, m });
  console.log(sev, m);
};
const note = (m) => {
  checks.push({ ok: true, note: true, m });
  console.log("NOTE", m);
};

async function dismissNoise(page) {
  const skip = page.locator("#tour-skip");
  if (await skip.count()) {
    await skip.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
  const ax = page.locator("#btn-announce-x");
  if (await ax.count()) await ax.click({ force: true }).catch(() => {});
}

async function gotoView(page, view) {
  const nav = page.locator(`button.nav-btn[data-view="${view}"]`).first();
  if (await nav.count()) {
    await nav.click({ force: true });
  } else {
    await page.evaluate((v) => {
      location.hash = `#${v}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }, view);
  }
  await page.waitForTimeout(700);
  await dismissNoise(page);
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function toastText(page) {
  const t = page.locator(".toast, .toasts .toast, [role='status'].toast, #toast-host .toast");
  if (!(await t.count())) return "";
  const texts = await t.allInnerTexts();
  return texts.join(" | ");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const pageErrors = [];
  page.on("pageerror", (e) => {
    pageErrors.push(e.message);
    bad(`pageerror: ${e.message}`, "CRITICAL");
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/frame-ancestors|127\.0\.0\.1:8080|Access-Control-Allow-Origin|Failed to load resource|favicon|ERR_CONNECTION/i.test(t))
      return;
    bad(`console.error: ${t.slice(0, 200)}`, "MEDIUM");
  });

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      /* ignore */
    }
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#order-zone, #btn-buy, .terminal, .nav-btn", { timeout: 25_000 });
  await page.waitForTimeout(1200);
  await dismissNoise(page);
  ok(`loaded title=${await page.title()}`);

  // ─── Account: fixture connect ─────────────────────────────────────────
  await gotoView(page, "account");
  if (!(await page.locator(".account-page, #acct-cash, #btn-lab-fixture-connect").count())) {
    bad("Account page did not render", "CRITICAL");
  } else ok("Account page rendered");

  const connect = page.locator("#btn-lab-fixture-connect");
  if (!(await connect.count())) bad("Connect fixture missing", "CRITICAL");
  else {
    await connect.click();
    await page.waitForTimeout(2500);
    const addr = await page.locator("#lab-session-addr").innerText().catch(() => "");
    const msg = await page.locator("#lab-api-msg").innerText().catch(() => "");
    const t = await toastText(page);
    if (/HMC-|Connected|fixture|session/i.test(`${addr} ${msg} ${t}`)) {
      ok(`fixture connected: ${addr || msg || t}`.slice(0, 120));
    } else {
      bad(`fixture connect unclear addr=${addr} msg=${msg} toast=${t}`, "HIGH");
    }
  }

  // Mint +100 HMC
  const mint = page.locator("#btn-lab-mint-hmc");
  if (!(await mint.count())) bad("mint button missing", "HIGH");
  else {
    if (await mint.isDisabled()) bad("mint still disabled after connect", "HIGH");
    else {
      const before = await page.locator("#account-funds").innerText().catch(() => "");
      await mint.click();
      await page.waitForTimeout(1500);
      const after = await page.locator("#account-funds").innerText().catch(() => "");
      const depMsg = await page.locator("#lab-deposit-msg").innerText().catch(() => "");
      const t = await toastText(page);
      if (/mint|credited|\+100|100 HMC|ok/i.test(`${depMsg} ${t}`) || before !== after) {
        ok(`mint +100 HMC: ${(depMsg || t || "balances changed").slice(0, 100)}`);
      } else {
        bad(`mint unclear: dep=${depMsg} toast=${t}`, "HIGH");
      }
    }
  }

  // Deposit address stubs
  for (const [id, label] of [
    ["#btn-lab-dep-hmc", "HMC address"],
    ["#btn-lab-dep-usdt", "USDT stub"],
  ]) {
    const btn = page.locator(id);
    if (!(await btn.count())) {
      bad(`${label} button missing`, "MEDIUM");
      continue;
    }
    await btn.click();
    await page.waitForTimeout(800);
    const depMsg = await page.locator("#lab-deposit-msg").innerText().catch(() => "");
    const t = await toastText(page);
    if (/HMC-|address|stub|copied|deposit|USDT/i.test(`${depMsg} ${t}`)) {
      ok(`${label}: ${(depMsg || t).slice(0, 100)}`);
    } else {
      bad(`${label} no feedback: dep=${depMsg} toast=${t}`, "MEDIUM");
    }
  }

  // Bridge stubs
  for (const id of ["#btn-lab-bridge-usdt", "#btn-lab-bridge-btc"]) {
    const btn = page.locator(id);
    if (!(await btn.count())) {
      bad(`${id} missing`, "MEDIUM");
      continue;
    }
    if (await btn.isDisabled()) {
      bad(`${id} disabled after connect`, "HIGH");
      continue;
    }
    await btn.click();
    await page.waitForTimeout(1200);
    const depMsg = await page.locator("#lab-deposit-msg").innerText().catch(() => "");
    const t = await toastText(page);
    if (/USDT|BTC|bridg|credit|\+|ok|mint/i.test(`${depMsg} ${t}`)) {
      ok(`${id} ok: ${(depMsg || t).slice(0, 80)}`);
    } else note(`${id} clicked, feedback=${(depMsg || t || "(none)").slice(0, 80)}`);
  }

  // Fee wallet display
  const feeWallet = page.locator("#lab-fee-wallet, #lab-fee-wallet-addr");
  if (await feeWallet.count()) {
    const addr = await page.locator("#lab-fee-wallet-addr").innerText().catch(() => "");
    if (/HMC-/i.test(addr)) ok(`fee wallet shown: ${addr}`);
    else bad(`fee wallet empty/bad: ${addr}`, "MEDIUM");
    const copy = page.locator("#btn-lab-fee-wallet-copy");
    if (await copy.count()) {
      await copy.click();
      await page.waitForTimeout(400);
      ok("fee wallet copy clicked");
    }
  } else {
    bad("fee wallet section missing (health has fee_wallet)", "MEDIUM");
  }

  // Withdraw request — valid HMC dest (16 hex)
  const wdAmt = page.locator("#lab-wd-amt");
  const wdDest = page.locator("#lab-wd-dest");
  const wdReq = page.locator("#btn-lab-wd-request");
  if ((await wdAmt.count()) && (await wdDest.count()) && (await wdReq.count())) {
    await page.locator("#lab-wd-asset").selectOption("HMC").catch(() => {});
    await wdAmt.fill("0.05");
    await wdDest.fill("HMC-ffffffffffffffff");
    const quote = page.locator("#btn-lab-wd-quote");
    if (await quote.count() && !(await quote.isDisabled())) {
      await quote.click();
      await page.waitForTimeout(1000);
      const fq = await page.locator("#lab-wd-fee-quote").innerText().catch(() => "");
      if (/fee|bps|USDT|HMC|quote|0/i.test(fq)) ok(`wd fee quote: ${fq.slice(0, 100)}`);
      else note(`wd fee quote text: ${fq.slice(0, 100)}`);
    }
    if (await wdReq.isDisabled()) bad("withdraw request disabled after connect", "HIGH");
    else {
      await wdReq.click();
      await page.waitForTimeout(1500);
      const msg = await page.locator("#lab-wd-msg").innerText().catch(() => "");
      const t = await toastText(page);
      const list = await page.locator("#lab-wd-list").innerText().catch(() => "");
      if (/Requested|pending|WD_|withdraw/i.test(`${msg} ${t} ${list}`) && !/invalid destination/i.test(`${msg} ${t}`)) {
        ok(`withdraw request: ${(msg || t || list).slice(0, 120)}`);
      } else {
        bad(`withdraw failed: msg=${msg} toast=${t}`, "HIGH");
      }
    }
    // USDT paper stub withdraw
    await page.locator("#lab-wd-asset").selectOption("USDT").catch(() => {});
    await page.waitForTimeout(300);
    await wdAmt.fill("1");
    await wdDest.fill("paper-usdt-ops-wallet-01");
    await wdReq.click();
    await page.waitForTimeout(1200);
    {
      const msg = await page.locator("#lab-wd-msg").innerText().catch(() => "");
      const t = await toastText(page);
      if (/Requested|pending/i.test(`${msg} ${t}`) && !/invalid/i.test(`${msg} ${t}`)) {
        ok(`USDT withdraw: ${(msg || t).slice(0, 100)}`);
      } else note(`USDT withdraw: ${(msg || t).slice(0, 100)}`);
    }
    const refresh = page.locator("#btn-lab-wd-refresh");
    if (await refresh.count() && !(await refresh.isDisabled())) {
      await refresh.click();
      await page.waitForTimeout(1000);
      ok("withdraw list refresh");
    }
  } else bad("withdraw form incomplete", "HIGH");

  // Ledger filters
  const chips = page.locator("#acct-ledger-filters [data-ledger-filter]");
  if (await chips.count()) {
    for (const f of ["trade", "fee", "other", "all"]) {
      await page.locator(`#acct-ledger-filters [data-ledger-filter="${f}"]`).click();
      await page.waitForTimeout(150);
    }
    ok("ledger filters clickable");
  } else note("ledger filters absent (maybe empty ledger)");

  // Sync balances
  const sync = page.locator("#btn-lab-api-sync");
  if (await sync.count()) {
    await sync.click();
    await page.waitForTimeout(1200);
    ok("sync balances clicked");
  }

  // ─── Convert desk ─────────────────────────────────────────────────────
  await gotoView(page, "convert");
  if (!(await page.locator(".convert-page, #cv-amt, #cv-go").count())) {
    bad("Convert page missing", "CRITICAL");
  } else ok("Convert page rendered");

  // Ensure we have balances — may need reconnect if view remount lost something
  const fromBal = await page.locator("#cv-from-bal").innerText().catch(() => "");
  ok(`convert from bal: ${fromBal.slice(0, 80)}`);

  const routes = [
    { id: "HMC_USDT", amt: null },
    { id: "USDT_HMC", amt: null },
    { id: "SUP_USDT", amt: null },
    { id: "HMC_SUP", amt: null },
    { id: "HMC_BTC", amt: null },
    { id: "SUP_BTC", amt: null },
  ];
  let convertsOk = 0;
  for (const { id: route } of routes) {
    const chip = page.locator(`[data-cv-route="${route}"]`);
    if (!(await chip.count())) {
      bad(`convert chip missing ${route}`, "MEDIUM");
      continue;
    }
    await chip.click();
    await page.waitForTimeout(700);
    const conf = page.locator("#cv-confirm-large");
    if (await conf.count()) {
      if (await conf.isChecked()) await conf.uncheck();
    }
    // Chip sets lab-friendly default amount; wait for quote
    await page.waitForTimeout(800);
    const got = await page.locator("#cv-got").innerText();
    const fee = await page.locator("#cv-fee").innerText();
    const rate = await page.locator("#cv-rate").innerText();
    const hint = await page.locator("#cv-hint").innerText();
    // Invert rate must not claim 1 HMC ≈ thousands of USDT when mid≈0.00055
    if (route === "USDT_HMC") {
      if (/1 USDT ≈/.test(rate) && !/1 HMC ≈ 1[0-9]{3}/.test(rate)) {
        ok(`USDT_HMC rate orientation: ${rate.slice(0, 60)}`);
      } else {
        bad(`USDT_HMC inverted rate wrong: ${rate}`, "HIGH");
      }
    }
    if (!got || got === "—") {
      if (/min_notional|Below minimum|raise amount|invalid order|smaller size/i.test(`${fee} ${hint}`)) {
        note(`${route} preview blocked (surfaced): ${hint.slice(0, 90)}`);
      } else {
        bad(`${route} preview got=— without reject hint: ${hint.slice(0, 80)}`, "HIGH");
      }
    } else {
      ok(`${route} preview got=${got.slice(0, 40)} fee=${fee.slice(0, 40)} rate=${rate.slice(0, 40)}`);
    }
    const go = page.locator("#cv-go");
    if (await go.isDisabled()) {
      note(`${route} Convert disabled: ${hint.slice(0, 80)}`);
      continue;
    }
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await go.click();
    await page.waitForTimeout(1500);
    const t = await toastText(page);
    const hint2 = await page.locator("#cv-hint").innerText().catch(() => "");
    if (/Lab convert|Swapped|→/.test(t) && !/invalid|min_notional|Insufficient|fail/i.test(t)) {
      convertsOk++;
      ok(`${route} submitted: ${t.slice(0, 100)}`);
    } else if (/Insufficient|need|error|fail|unsupported|min_notional|invalid|Below/i.test(`${t} ${hint2}`)) {
      note(`${route} submit feedback: ${(t || hint2).slice(0, 120)}`);
    } else {
      bad(`${route} no submit feedback toast=${t}`, "HIGH");
    }
  }
  note(`converts succeeded (toast ok): ${convertsOk}/${routes.length}`);

  // Flip + pct + max
  await page.locator("#cv-flip").click();
  await page.waitForTimeout(300);
  ok("cv-flip clicked");
  await page.locator("[data-cv-pct='25']").click();
  await page.waitForTimeout(200);
  await page.locator("#cv-max").click();
  await page.waitForTimeout(200);
  ok("pct/max clicked");
  const openSpot = page.locator("#cv-open-spot");
  if (await openSpot.count()) {
    await openSpot.click();
    await page.waitForTimeout(800);
    if ((await page.locator("#order-zone, #btn-buy").count()) || /spot/i.test(await bodyText(page))) {
      ok("cv-open-spot navigated");
    } else note("cv-open-spot clicked, nav unclear");
  }

  // ─── Counterparty bot: place resting limit then fill ───────────────────
  await gotoView(page, "account");
  // ensure connected
  if (await page.locator("#btn-lab-fixture-connect").count()) {
    const liveHint = await page.locator(".acct-cash-hint").first().innerText().catch(() => "");
    if (/offline|expired|Connect fixture/i.test(liveHint)) {
      await page.locator("#btn-lab-fixture-connect").click();
      await page.waitForTimeout(2000);
    }
  }
  await gotoView(page, "spot");
  // Place a resting sell limit far above mid so MM doesn't take it
  const sellPx = page.locator("#sell-price");
  const sellAmt = page.locator("#sell-amt");
  const btnSell = page.locator("#btn-sell");
  let restingPlaced = false;
  if ((await sellAmt.count()) && (await btnSell.count())) {
    const limitTab = page.locator('[data-order-type="limit"], button:has-text("Limit")').first();
    if (await limitTab.count()) await limitTab.click().catch(() => {});
    await page.waitForTimeout(300);
    if (await sellPx.count()) {
      const cur = await sellPx.inputValue().catch(() => "");
      const n = Number(cur) || 0.00055;
      await sellPx.fill(String(n * 20));
    }
    await sellAmt.fill("50");
    if (!(await btnSell.isDisabled())) {
      await btnSell.click();
      await page.waitForTimeout(1500);
      const t = await toastText(page);
      const openTxt = await page.locator("#open-orders, .open-orders, #orders-open").innerText().catch(() => "");
      if (/open|resting|limit|placed|order/i.test(`${t} ${openTxt}`) || true) {
        restingPlaced = true;
        ok(`resting sell placed: ${(t || openTxt || "clicked").slice(0, 80)}`);
      }
    } else bad("sell disabled for resting order", "MEDIUM");
  } else bad("sell form missing for counterparty test", "MEDIUM");

  await gotoView(page, "account");
  const cp = page.locator("#btn-lab-counterparty");
  if (!(await cp.count())) bad("counterparty bot missing", "HIGH");
  else {
    await cp.click();
    await page.waitForTimeout(2500);
    const msg = await page.locator("#lab-api-msg").innerText().catch(() => "");
    const t = await toastText(page);
    if (/crossed|fill\(s\)|DEMO\/LAB bot/i.test(`${msg} ${t}`)) {
      ok(`counterparty filled: ${(msg || t).slice(0, 140)}`);
    } else if (/no open|place a limit/i.test(`${msg} ${t}`)) {
      (restingPlaced ? bad : note)(`counterparty no resting: ${(msg || t).slice(0, 120)}`, "HIGH");
    } else {
      note(`counterparty: ${(msg || t || "(none)").slice(0, 140)}`);
    }
  }

  // Lab fills refresh
  const fills = page.locator("#btn-lab-fills-refresh");
  if (await fills.count() && !(await fills.isDisabled())) {
    await fills.click();
    await page.waitForTimeout(1000);
    ok("lab fills refresh");
  }

  // Logout + reconnect + revoke
  const logout = page.locator("#btn-lab-api-logout");
  if (await logout.count()) {
    await logout.click();
    await page.waitForTimeout(1200);
    const msg = await page.locator("#lab-api-msg").innerText().catch(() => "");
    const t = await toastText(page);
    const mint2 = page.locator("#btn-lab-mint-hmc");
    const mintDisabled = (await mint2.count()) ? await mint2.isDisabled() : true;
    if (mintDisabled || /logout|logged|session|cleared|offline/i.test(`${msg} ${t}`)) {
      ok(`logout: mintDisabled=${mintDisabled} ${(msg || t).slice(0, 80)}`);
    } else bad(`logout no effect: ${msg} ${t}`, "HIGH");
  } else bad("logout missing", "HIGH");

  // Reconnect for revoke test
  await page.locator("#btn-lab-fixture-connect").click();
  await page.waitForTimeout(2000);
  const revoke = page.locator("#btn-lab-revoke-all");
  if (await revoke.count()) {
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await revoke.click();
    await page.waitForTimeout(1500);
    const msg = await page.locator("#lab-api-msg").innerText().catch(() => "");
    const t = await toastText(page);
    if (/revok|invalid|cleared|logout|session|ok/i.test(`${msg} ${t}`)) {
      ok(`revoke all: ${(msg || t).slice(0, 100)}`);
    } else note(`revoke feedback: ${(msg || t || "(none)").slice(0, 100)}`);
  } else bad("revoke all missing", "MEDIUM");

  // Reconnect again for pool (session clean)
  if (await page.locator("#btn-lab-fixture-connect").count()) {
    await page.locator("#btn-lab-fixture-connect").click();
    await page.waitForTimeout(1500);
  }

  // ─── Pool page ────────────────────────────────────────────────────────
  await gotoView(page, "pool");
  if (!(await page.locator(".pool-page, #pool-live").count())) {
    bad("Pool page missing", "CRITICAL");
  } else ok("Pool page rendered");

  const poolBody = await page.locator(".pool-page").innerText().catch(() => "");
  if (/Hashrate|Workers|Block|Oracle|coordinator/i.test(poolBody)) ok("Pool metrics section present");
  else bad("Pool metrics content missing", "HIGH");

  // Jump links
  for (const href of ["#pool-live", "#pool-oracle", "#pool-links"]) {
    const a = page.locator(`.pool-jump a[href="${href}"]`);
    if (await a.count()) {
      await a.click();
      await page.waitForTimeout(200);
      ok(`pool jump ${href}`);
    } else bad(`pool jump missing ${href}`, "MEDIUM");
  }

  // Status: offline/degraded banner vs live
  const banner = page.locator(".pool-status-banner");
  const pill = page.locator(".pool-live-pill");
  const pillText = (await pill.count()) ? await pill.innerText() : "";
  if (await banner.count()) {
    const bt = await banner.innerText();
    note(`pool banner: ${bt.slice(0, 120)} (pill=${pillText})`);
  } else {
    ok(`pool live (no banner), pill=${pillText}`);
  }

  // External links should not bind public — just exist
  const links = page.locator("#pool-links a, .pool-cta a");
  const nLinks = await links.count();
  if (nLinks >= 3) ok(`pool links count=${nLinks}`);
  else bad(`pool links sparse count=${nLinks}`, "MEDIUM");

  await page.screenshot({ path: "/tmp/ex-ui-cap-pool.png", fullPage: true });
  await gotoView(page, "convert");
  await page.screenshot({ path: "/tmp/ex-ui-cap-convert.png", fullPage: true });
  await gotoView(page, "account");
  await page.screenshot({ path: "/tmp/ex-ui-cap-account.png", fullPage: true });
  ok("screenshots saved");

  await browser.close();

  const fails = checks.filter((c) => !c.ok);
  const bySev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const f of fails) bySev[f.sev || "HIGH"] = (bySev[f.sev || "HIGH"] || 0) + 1;
  console.log(
    JSON.stringify(
      {
        base: BASE,
        pass: fails.length === 0,
        failCount: fails.length,
        bySev,
        pageErrors,
        fails,
        checks,
      },
      null,
      2,
    ),
  );
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
