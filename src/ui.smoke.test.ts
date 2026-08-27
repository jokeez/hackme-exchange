/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { pairById } from "./pairs";
import {
  readOrderForm,
  renderDualOrderPanel,
  setFormPrice,
  setOrderMsg,
  setOrderPreview,
  syncPctMarks,
  type OrderPanelCtx,
} from "./orderPanel";
import { renderPnlCalendarHtml, dailyPnlCalendar, volumeRatio5m } from "./pnl";
import { baseState, sampleMarket } from "./testFixtures";
import { labFeeWalletSection, renderAccountPage } from "./account";
import { parseHealthFeeWallet } from "./tradingGuards";
import { showChartContextMenu, closeChartContextMenu } from "./chartContextMenu";
import { toast } from "./toast";
import { applyTheme, defaultThemeForHost, loadTheme, saveTheme, STORAGE_KEY } from "./theme";
import { Ico, drawToolIcon } from "./icons";
import type { Trade } from "./types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function orderCtx(over: Partial<OrderPanelCtx> = {}): OrderPanelCtx {
  return {
    pair: pairById("HMC_USDT"),
    pairId: "HMC_USDT",
    mid: 0.00043,
    uiType: "limit",
    uiTif: "GTC",
    uiPostOnly: false,
    availQuote: 1000,
    availBase: 50_000,
    payFeesInHmc: false,
    hmcDiscountPct: 25,
    feeRole: "maker",
    feeBps: 10,
    showTif: true,
    ...over,
  };
}

function mountPanel(ctx = orderCtx()): void {
  document.body.innerHTML = renderDualOrderPanel(ctx);
}

describe("orderPanel HTML & controls", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders Buy/Sell columns with price, amount, BBO, quick-size, slider, exec", () => {
    const html = renderDualOrderPanel(orderCtx());
    expect(html).toContain("Buy HMC");
    expect(html).toContain("Sell HMC");
    expect(html).toContain('id="buy-price"');
    expect(html).toContain('id="sell-price"');
    expect(html).toContain('id="buy-amt"');
    expect(html).toContain('id="btn-buy"');
    expect(html).toContain('id="btn-sell"');
    expect(html).toContain('data-qs="50"');
    expect(html).toContain('data-qs="max"');
    expect(html).toContain("TP/SL");
    expect(html).toContain("Post Only");
    expect(html).toContain("HMC");
    expect(html).toContain('id="fee-row"');
    expect(html).toContain('id="pay-fees-hmc"');
    expect(html).toContain('data-type="market"');
    expect(html).toContain('data-type="limit"');
    expect(html).toContain('data-type="stop_limit"');
    expect(html).toContain('id="order-type-adv"');
    expect(html).toContain('value="oco"');
    expect(html).toContain("Avbl");
  });

  it("keeps HMC fee toggle outside TIF row so Market can use it", () => {
    const html = renderDualOrderPanel(orderCtx({ uiType: "market", showTif: false }));
    expect(html).toContain('id="fee-row"');
    expect(html).toContain('id="pay-fees-hmc"');
    expect(html).toContain("order-head-meta");
    expect(html).toContain("fee-meta");
    expect(html).toMatch(/tif-row[^>]*hidden/);
  });

  it("renders product mode row above order-type row (single active groups)", () => {
    const html = renderDualOrderPanel(orderCtx({ uiType: "market" }));
    const modeIdx = html.indexOf("order-mode-row");
    const typeIdx = html.indexOf("order-type-row");
    expect(modeIdx).toBeGreaterThan(-1);
    expect(typeIdx).toBeGreaterThan(modeIdx);
    expect(html).toMatch(/spot-mode active[^>]*>Spot/);
    expect(html).toContain('data-type="market"');
    expect(html).toMatch(/class="type active"[^>]*data-type="market"|data-type="market"[^>]*class="type active"/);
    expect(html).toContain("order-head-meta");
    expect(html.indexOf("pay-fees-hmc")).toBeGreaterThan(html.indexOf("order-head-meta"));
    expect(html.indexOf("pay-fees-hmc")).toBeLessThan(html.indexOf("order-type-row"));
  });

  it("shows LAB MM badge only when labMmSeeded is true", () => {
    const off = renderDualOrderPanel(orderCtx({ labMmSeeded: false }));
    expect(off).not.toContain("LAB MM");
    const on = renderDualOrderPanel(orderCtx({ labMmSeeded: true }));
    expect(on).toContain("LAB MM");
    expect(on).toContain("data-lab-mm-badge");
  });

  it("hides TP/SL block for stop_limit and shows for market/limit", () => {
    const stop = renderDualOrderPanel(orderCtx({ uiType: "stop_limit", showTif: true }));
    expect(stop).toMatch(/field-tpsl[^>]*hidden/);

    const mkt = renderDualOrderPanel(orderCtx({ uiType: "market", showTif: false }));
    expect(mkt).toContain("tpsl-block");
    expect(mkt).not.toMatch(/class="tpsl-block field-tpsl hidden"/);
  });

  it("hides TP/SL attachments in lab mode", () => {
    const html = renderDualOrderPanel(orderCtx({ uiType: "market", labLive: true }));
    expect(html).toMatch(/field-tpsl[^>]*hidden/);
    expect(html).toMatch(/id="buy-tpsl"[^>]*disabled/);
  });

  it("limit defaults rest off mid (buy below, sell above)", () => {
    const mid = 0.00041177652319212107;
    const html = renderDualOrderPanel(orderCtx({ mid, uiType: "limit" }));
    expect(html).toContain('value="0.00041116"');
    expect(html).toContain('value="0.00041239"');
    expect(html).not.toContain("0.00041177652319212107");
  });

  it("market panel still tick-rounds reference mid in hidden price fields", () => {
    const html = renderDualOrderPanel(orderCtx({ mid: 0.00041177652319212107, uiType: "market" }));
    expect(html).toContain('value="0.00041178"');
    expect(html).not.toContain("0.00041177652319212107");
  });

  it("readOrderForm / setFormPrice / preview / msg work in DOM", () => {
    mountPanel();
    setFormPrice("buy", 0.000411776, "HMC_USDT");
    expect((document.getElementById("buy-price") as HTMLInputElement).value).toBe("0.00041178");

    (document.getElementById("buy-amt") as HTMLInputElement).value = "2500";
    const form = readOrderForm("buy");
    expect(form.amt).toBe(2500);
    expect(form.price).toBeCloseTo(0.00041178, 8);

    setOrderPreview("buy", "Est. 1.03 USDT");
    expect(document.getElementById("buy-preview")!.textContent).toBe("Est. 1.03 USDT");

    setOrderMsg("sell", "Filled", "ok");
    expect(document.getElementById("sell-msg")!.className).toContain("ok");
    expect(document.getElementById("sell-msg")!.textContent).toBe("Filled");
  });

  it("syncPctMarks toggles .on up to slider value", () => {
    mountPanel();
    const slider = document.getElementById("buy-pct") as HTMLInputElement;
    slider.value = "50";
    syncPctMarks("buy");
    const marks = [...document.querySelectorAll('.pct-marks[data-side="buy"] button')];
    expect(marks.find((b) => b.getAttribute("data-pct") === "0")!.classList.contains("on")).toBe(true);
    expect(marks.find((b) => b.getAttribute("data-pct") === "50")!.classList.contains("on")).toBe(true);
    expect(marks.find((b) => b.getAttribute("data-pct") === "75")!.classList.contains("on")).toBe(false);
  });

  it("mounts dual columns into DOM with interactive ids", () => {
    mountPanel();
    expect(document.querySelectorAll(".order-col").length).toBe(2);
    expect(document.querySelectorAll(".quick-size button").length).toBe(8);
    expect(document.querySelectorAll(".pct-slider").length).toBe(2);
    expect(document.querySelectorAll("[data-avail-side]").length).toBe(2);
    expect(document.getElementById("type-tabs")!.querySelectorAll("button.type").length).toBe(3);
    expect(document.getElementById("order-type-adv")).toBeTruthy();
  });
});

describe("PnL calendar & volume ratio metrics UI", () => {
  it("renderPnlCalendarHtml emits day cells with titles", () => {
    const days = [
      { dateKey: "2026-07-01", label: "Jul 1", pnl: 12.5 },
      { dateKey: "2026-07-02", label: "Jul 2", pnl: -3.2 },
      { dateKey: "2026-07-03", label: "Jul 3", pnl: 0 },
    ];
    const html = renderPnlCalendarHtml(days);
    expect(html).toContain("pnl-calendar");
    expect(html).toContain("title=");
    expect(html).toContain("pos");
    expect(html).toContain("neg");
  });

  it("dailyPnlCalendar returns requested day count", () => {
    const s = baseState({
      equitySnapshots: [
        { ts: Date.now() - 86400000 * 2, equityUsdt: 10000 },
        { ts: Date.now(), equityUsdt: 10150 },
      ],
    });
    const cal = dailyPnlCalendar(s, sampleMarket(), 14);
    expect(cal).toHaveLength(14);
    expect(cal[0].dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("volumeRatio5m reports buy/sell share summing ~100", () => {
    const now = Date.now();
    const mk = (over: Partial<Trade>): Trade => ({
      id: "t",
      pairId: "HMC_USDT",
      side: "buy",
      price: 0.0004,
      amountBase: 1000,
      amountQuote: 0.4,
      feeQuote: 0,
      feeHmc: 0,
      feeRole: "taker",
      feePaidInHmc: false,
      ts: now - 30_000,
      ...over,
    });
    const trades: Trade[] = [
      mk({ id: "1", side: "buy", amountBase: 1000 }),
      mk({ id: "2", side: "sell", amountBase: 500 }),
      mk({ id: "3", pairId: "SUP_USDT", side: "buy", amountBase: 9999 }),
    ];
    const r = volumeRatio5m(trades, "HMC_USDT");
    expect(r.buyPct + r.sellPct).toBeCloseTo(100, 5);
    expect(r.buyPct).toBeGreaterThan(r.sellPct);
  });
});

describe("account page HTML metrics", () => {
  it("renders VIP, balances, custody/fee controls (no demo top-up)", () => {
    const html = renderAccountPage(baseState(), sampleMarket());
    expect(html.length).toBeGreaterThan(200);
    expect(html.toLowerCase()).toMatch(/usdt|hmc|vip|fee/);
    expect(html).not.toMatch(/\+1000 USDT/);
    expect(html).not.toMatch(/\+5000 HMC/);
    // Lab custody UI (deposit stubs / revoke) only when loopback API is opted in.
    if (html.includes("lab-api-card")) {
      expect(html.toLowerCase()).toMatch(/bridge|revoke|withdraw/);
    }
  });

  it("lab fee wallet section hides when missing and escapes address", () => {
    expect(labFeeWalletSection(null)).toBe("");
    expect(labFeeWalletSection("")).toBe("");
    expect(labFeeWalletSection("   ")).toBe("");
    const html = labFeeWalletSection(`HMC-fee"><img src=x onerror=alert(1)>`);
    expect(html).toContain("USDT / BTC / SUP");
    expect(html).toContain("GET /admin/fees");
    expect(html).toContain("/admin/fees");
    expect(html).toContain("/admin/fees/sweep");
    expect(html).toContain("$EXCHANGE_ADMIN_TOKEN");
    expect(html).toContain("Fee sweep (lab CLI)");
    expect(html).toContain("btn-lab-fee-wallet-copy");
    expect(html).toContain("&quot;");
    expect(html).not.toContain(`"><img`);
    // Token only as env var name in CLI hint — never a literal secret value.
    expect(html).not.toMatch(/X-Admin-Token:\s*[A-Za-z0-9+/=]{16,}/);
    expect(html.toLowerCase()).toMatch(/convert/);
    expect(html).toContain("Verify fee credits");
    const withFee = renderAccountPage(baseState(), sampleMarket(), {
      feeWallet: "HMC-labfeewallet0001",
    });
    if (withFee.includes("lab-custody-card")) {
      expect(withFee).toContain("HMC-labfeewallet0001");
      expect(withFee).toContain("USDT / BTC / SUP");
      expect(withFee).toContain("/admin/fees");
      expect(withFee).toContain("/admin/fees/sweep");
    }
    const without = renderAccountPage(baseState(), sampleMarket(), { feeWallet: null });
    expect(without).not.toContain("lab-fee-wallet");
  });

  it("Account custody shows fee wallet when /health fee_wallet is object", () => {
    const addr = parseHealthFeeWallet({
      ok: true,
      fee_wallet: {
        address: "HMC-726a266afdaec757",
        note: "spot fee collection wallet (lab)",
      },
    });
    expect(addr).toBe("HMC-726a266afdaec757");
    const page = renderAccountPage(baseState(), sampleMarket(), { feeWallet: addr });
    expect(page).toContain("HMC-726a266afdaec757");
    expect(page).toContain("lab-fee-wallet");
    expect(page).toContain("USDT / BTC / SUP");
    expect(page).toContain("until ops sweeps");
  });
});

describe("chart context menu actions", () => {
  afterEach(() => closeChartContextMenu());

  it("shows Buy/Sell/Alert items at price and closes", () => {
    const opens: number[] = [];
    const closes: number[] = [];
    showChartContextMenu(40, 80, 0.00043, {
      baseSymbol: "HMC",
      indicatorCount: 2,
      marksHidden: false,
      onOpen: (p) => opens.push(p),
      onClose: () => closes.push(1),
      onAction: () => {},
    });
    const menu = document.querySelector(".chart-ctx-menu");
    expect(menu).toBeTruthy();
    expect(opens).toEqual([0.00043]);
    expect(menu!.textContent).toContain("Buy HMC");
    expect(menu!.textContent).toContain("Sell HMC");
    expect(menu!.textContent).toContain("Add Alert");
    expect(menu!.innerHTML).toContain("add_alert");
    // Menu must not inject a sticky orange price-line DOM node
    expect(document.querySelector("[title='↕']")).toBeNull();
    closeChartContextMenu();
    expect(closes).toEqual([1]);
    expect(document.querySelector(".chart-ctx-menu")).toBeNull();
  });
});

describe("toast + theme", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="toast-root"></div>`;
    document.documentElement.dataset.theme = "";
    localStorage.clear();
  });

  it("toast appends typed message", () => {
    vi.useFakeTimers();
    toast("Synced", "ok");
    const el = document.querySelector(".toast-ok");
    expect(el?.textContent).toBe("Synced");
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("save/load/apply theme round-trip", () => {
    saveTheme("wallet");
    expect(localStorage.getItem(`${STORAGE_KEY}-theme`)).toBe("wallet");
    expect(document.documentElement.dataset.theme).toBe("wallet");
    expect(loadTheme()).toBe("wallet");
    applyTheme("hub");
    expect(document.documentElement.dataset.theme).toBe("hub");
  });

  it("defaultThemeForHost: loopback=wallet, hackme.tech=hub", () => {
    expect(defaultThemeForHost("127.0.0.1")).toBe("wallet");
    expect(defaultThemeForHost("localhost")).toBe("wallet");
    expect(defaultThemeForHost("hackme.tech")).toBe("hub");
    expect(defaultThemeForHost("exchange.hackme.tech")).toBe("hub");
  });

  it("loadTheme without saved key uses host default", () => {
    localStorage.clear();
    // happy-dom hostname is often localhost → wallet
    const t = loadTheme();
    expect(t === "wallet" || t === "hub").toBe(true);
    expect(t).toBe(defaultThemeForHost());
  });
});

describe("icons UI consistency", () => {
  it("toolbar icons are SVG with shared stroke and draw tools cover all ids", () => {
    for (const fn of [Ico.clock, Ico.activity, Ico.camera, Ico.settings, Ico.candlestick, Ico.trash]) {
      const s = fn();
      expect(s).toContain("<svg");
      expect(s).toContain('stroke-width="1.5"');
    }
    for (const id of [
      "cursor",
      "hline",
      "vline",
      "cross",
      "trend",
      "ray",
      "fib",
      "rect",
      "text",
      "measure",
      "clear",
      "lock",
    ] as const) {
      expect(drawToolIcon(id)).toContain("<svg");
    }
  });
});

describe("visual CSS tokens & critical rules", () => {
  const css = readFileSync(resolve(__dirname, "styles.css"), "utf8");

  it("defines buy/sell/radius/edge palette variables", () => {
    expect(css).toContain("--buy: #00c073");
    expect(css).toContain("--sell: #db4455");
    expect(css).toContain("--radius: 6px");
    expect(css).toMatch(/--edge:\s*#2a2e39/);
  });

  it("ships centered convert desk with readable chips", () => {
    expect(css).toContain(".convert-shell");
    expect(css).toContain(".convert-desk-wrap");
    expect(css).toContain(".cv-chip.active");
    expect(css).toContain(".cv-pct button.active");
    expect(css).toMatch(/\.convert-shell\s*\{[^}]*margin:\s*0 auto/s);
    expect(css).toMatch(/\.cv-chip\s*\{[^}]*font-weight:\s*600/s);
  });

  it("keeps thin scrollbars on terminal panes", () => {
    expect(css).toContain("scrollbar-width: thin");
    expect(css).toContain(".order-zone");
    expect(css).toContain("#book");
  });

  it("order-book mid band fits price+spread+source without fixed 28px clip", () => {
    expect(css).toMatch(/\.ob-mid\s*\{[^}]*min-height:\s*3\.4rem/s);
    expect(css).not.toMatch(/\.ob-mid\s*\{[^}]*max-height:\s*28px/s);
    expect(css).toContain(".ob-mid-src");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).toMatch(/\.tour-backdrop\s*\{[^}]*pointer-events:\s*none/s);
  });

  it("styles cancel muted and volume-ratio / pnl-calendar / quick-size", () => {
    expect(css).toContain(".data-table button.link");
    expect(css).toContain("volume-ratio");
    expect(css).toContain("pnl-calendar");
    expect(css).toContain("quick-size");
    expect(css).toContain(".ob-mid");
  });

  it("ships announce bar + mobile terminal stack", () => {
    expect(css).toContain(".announce");
    expect(css).toContain(".announce-x");
    expect(css).toContain("@media (max-width: 1024px)");
  });

  it("soft depth bar colors are low-opacity", () => {
    expect(css).toContain("rgba(0, 192, 115, 0.08)");
    expect(css).toContain("rgba(219, 68, 85, 0.08)");
  });

  it("mining strip is readable (padding + type size)", () => {
    expect(css).toMatch(/\.mining-strip\s*\{[^}]*min-height:\s*2\.15rem/s);
    expect(css).toMatch(/\.mining-strip\s*\{[^}]*font-size:\s*0\.78rem/s);
  });

  it("price pill pulse is one-shot (not infinite glow)", () => {
    expect(css).toMatch(/\.last-pill\.pulse\s*\{[^}]*animation:\s*price-pulse[^;]*\s+1\s*;/s);
    expect(css).not.toMatch(/price-pulse[^}]*infinite/);
  });

  it("side panels support collapse rail + resize handle", () => {
    expect(css).toContain(".panel-rail");
    expect(css).toContain(".panel-resize");
    expect(css).toContain(".btn-panel-toggle");
    expect(css).toContain("body.resizing-panels");
  });
});
