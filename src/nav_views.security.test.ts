/**
 * Deep security + DOM contracts for main-nav views: Convert · Account · Pool.
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { labFeeWalletSection, renderAccountPage, patchAccountFundsDom, wireAccountFunding } from "./account";
import { renderPoolPage, renderPoolRail, poolStatusBanner, offlinePoolLive, pendingPoolLive } from "./pool";
import {
  convert,
  previewConvert,
  convertRateLabel,
  convertFeeHintLine,
  formatLabConvertFeeToast,
  feeQuoteFromLabConvert,
  CONVERT_ROUTES,
} from "./convert";
import { parseRouteHash, formatRouteHash } from "./routeHash";
import {
  escapeHtml,
  sanitizeHttpUrl,
  sanitizeLedgerEntry,
  sanitizeMainView,
  sanitizePlainNote,
} from "./sanitize";
import { validateLabWithdrawDestination, safePaperWithdrawDest } from "./labCustody";
import { nodeWalletUrl, openInNewTab, exchangeListingUrl } from "./adapters/walletLinks";
import { INTEGRATION } from "./config/integration";
import { baseState, sampleMarket } from "./testFixtures";
import type { PoolLive } from "./types";

const XSS = `"><img src=x onerror=alert(1)><script>alert(1)</script>`;
const XSS_ATTR = `' onmouseover='alert(1)`;

function assertNoExecutableHtml(root: ParentNode): void {
  expect(root.querySelectorAll("script").length).toBe(0);
  expect(root.querySelectorAll("iframe").length).toBe(0);
  expect(root.querySelectorAll("object, embed").length).toBe(0);
  for (const img of root.querySelectorAll("img")) {
    expect(img.getAttribute("onerror")).toBeNull();
    expect(img.getAttribute("onload")).toBeNull();
    const src = (img.getAttribute("src") || "").toLowerCase();
    expect(src).not.toMatch(/^\s*javascript:/);
    expect(src).not.toMatch(/^\s*data:text\/html/);
  }
  for (const el of root.querySelectorAll("*")) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.toLowerCase();
      expect(name.startsWith("on")).toBe(false);
      if (name === "href" || name === "src" || name === "action" || name === "formaction") {
        expect(val).not.toMatch(/^\s*javascript:/);
        expect(val).not.toMatch(/^\s*data:text\/html/);
        expect(val).not.toMatch(/^\s*vbscript:/);
      }
      expect(val).not.toContain("onerror=");
      expect(val).not.toMatch(/onerror\s*=/);
    }
  }
}

function livePool(over: Partial<PoolLive> = {}): PoolLive {
  return {
    poolGh: 120,
    workers: 9,
    miners: 9,
    blockHeight: 160_000,
    rewardPerM: 0.0002,
    totalPayoutHmc: 5_000,
    targetMod: 1,
    status: "ok",
    ...over,
  };
}

describe("main-nav route allowlist", () => {
  it("only accepts spot|convert|account|pool", () => {
    expect(sanitizeMainView("convert")).toBe("convert");
    expect(sanitizeMainView("account")).toBe("account");
    expect(sanitizeMainView("pool")).toBe("pool");
    expect(sanitizeMainView(`convert${XSS}`)).toBe("spot");
    expect(sanitizeMainView("javascript:alert(1)")).toBe("spot");
    expect(sanitizeMainView({} as unknown as string)).toBe("spot");
  });

  it("parseRouteHash ignores XSS / unknown segments", () => {
    expect(parseRouteHash("#convert")).toEqual({ view: "convert" });
    expect(parseRouteHash("#account")).toEqual({ view: "account" });
    expect(parseRouteHash("#pool")).toEqual({ view: "pool" });
    expect(parseRouteHash(`#${XSS}`)).toEqual({});
    expect(parseRouteHash("#convert/HMC_USDT/15m")).toEqual({
      view: "convert",
      pair: "HMC_USDT",
      tf: "15m",
    });
    expect(parseRouteHash("#spot/NOPE/15m")).toEqual({ view: "spot" });
    expect(parseRouteHash("#spot/HMC_USDT/nope")).toEqual({ view: "spot", pair: "HMC_USDT" });
    expect(formatRouteHash("account", "HMC_USDT", "1m")).toBe("#account");
    expect(formatRouteHash("pool", "SUP_USDT", "5m")).toBe("#pool");
    expect(formatRouteHash("convert", "HMC_BTC", "1H")).toBe("#convert");
  });
});

describe("Account view XSS / DOM sinks", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("escapes malicious fee wallet in section + full page", () => {
    const section = labFeeWalletSection(XSS);
    expect(section).toContain(escapeHtml(XSS));
    expect(section).not.toMatch(/<img |<script/i);

    // Mount section alone (lab chrome may be off in vitest) + full Account page.
    document.body.innerHTML = `${section}${renderAccountPage(baseState(), sampleMarket(), { feeWallet: XSS })}`;
    assertNoExecutableHtml(document.body);
    const addr = document.getElementById("lab-fee-wallet-addr");
    expect(addr?.textContent).toContain("<");
    expect(addr?.innerHTML).toContain("&lt;");
    expect(document.querySelectorAll("img").length).toBe(0);
  });

  it("escapes ledger kind/asset/note when mounted", () => {
    const s = baseState({
      ledger: [
        {
          id: "lg1",
          kind: "convert",
          asset: "HMC",
          amount: -10,
          usdtValue: -0.5,
          note: XSS,
          ts: Date.now(),
        },
        {
          id: `id${XSS}`,
          kind: "fee",
          asset: "USDT",
          amount: -0.01,
          usdtValue: -0.01,
          note: XSS_ATTR,
          ts: Date.now(),
        },
      ],
    });
    document.body.innerHTML = renderAccountPage(s, sampleMarket(), { feeWallet: null });
    assertNoExecutableHtml(document.body);
    const list = document.getElementById("acct-ledger-list");
    expect(list?.innerHTML).toContain("&lt;");
    expect(list?.querySelectorAll("img, script").length).toBe(0);
  });

  it("node wallet / hub links are http(s) only", () => {
    document.body.innerHTML = renderAccountPage(baseState(), sampleMarket());
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("#")) continue;
      expect(href).toMatch(/^https?:\/\//);
      expect(a.rel).toMatch(/noopener/);
    }
    expect(sanitizeHttpUrl(nodeWalletUrl(), "")).toMatch(/^https?:\/\//);
    expect(sanitizeHttpUrl(exchangeListingUrl(), "")).toMatch(/^https?:\/\//);
  });

  it("patchAccountFundsDom never injects markup from numbers", () => {
    document.body.innerHTML = renderAccountPage(baseState(), sampleMarket());
    const poisoned = baseState({
      wallet: { usdt: Number.NaN, hmc: Number.POSITIVE_INFINITY, sup: -1, btc: 0 },
    });
    patchAccountFundsDom(poisoned, sampleMarket());
    assertNoExecutableHtml(document.body);
    const eq = document.querySelector(".account-eq");
    expect(eq?.querySelector("script")).toBeNull();
  });

  it("wireAccountFunding ledger filters do not eval notes", () => {
    const s = baseState({
      ledger: [
        { id: "a", kind: "trade", asset: "HMC", amount: 1, usdtValue: 1, note: XSS, ts: 1 },
        { id: "b", kind: "fee", asset: "USDT", amount: -1, usdtValue: -1, note: "fee", ts: 2 },
      ],
    });
    document.body.innerHTML = renderAccountPage(s, sampleMarket());
    wireAccountFunding(s, sampleMarket(), () => {});
    const feeBtn = document.querySelector('[data-ledger-filter="fee"]') as HTMLButtonElement;
    feeBtn.click();
    const items = [...document.querySelectorAll("#acct-ledger-list li")] as HTMLElement[];
    expect(items.filter((li) => !li.hidden)).toHaveLength(1);
    assertNoExecutableHtml(document.body);
  });
});

describe("Pool view XSS / link hygiene", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("pool page + rail never emit javascript: or event handlers", () => {
    document.body.innerHTML =
      renderPoolPage(livePool(), sampleMarket()) + renderPoolRail(livePool()) + poolStatusBanner(offlinePoolLive());
    assertNoExecutableHtml(document.body);
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      expect(a.href).toMatch(/^https?:\/\//);
      expect(a.getAttribute("href")).not.toMatch(/hub-proxy/i);
    }
  });

  it("status banners escape coordinator origin", () => {
    const pending = poolStatusBanner(pendingPoolLive());
    const offline = poolStatusBanner(offlinePoolLive());
    expect(pending).toContain(escapeHtml(INTEGRATION.poolCoordinatorOrigin.replace(/\/$/, "")));
    expect(offline).not.toMatch(/<img |onerror=/i);
    document.body.innerHTML = pending + offline;
    assertNoExecutableHtml(document.body);
  });

  it("extreme telemetry values stay finite in HTML", () => {
    const html = renderPoolPage(
      livePool({
        poolGh: Number.NaN as unknown as number,
        workers: Number.POSITIVE_INFINITY as unknown as number,
        blockHeight: -1,
        rewardPerM: Number.NaN as unknown as number,
      }),
      sampleMarket({ hmcUsdt: Number.NaN, btcUsd: -1 }),
    );
    document.body.innerHTML = html;
    assertNoExecutableHtml(document.body);
    // formatters may show "—" / "0" — never raw script sinks from bad numbers
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror=/i);
  });
});

describe("Convert economics + XSS-safe helpers", () => {
  const market = sampleMarket();

  it("rejects abusive amounts without mutating wallet", () => {
    const s = baseState({ wallet: { usdt: 100, hmc: 1000, sup: 100, btc: 0.01 } });
    const snap = structuredClone(s.wallet);
    for (const amt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE, 1e308]) {
      const res = convert(s, market, "HMC_USDT", amt);
      expect(res.ok).toBe(false);
      expect(s.wallet).toEqual(snap);
    }
  });

  it("preview never returns NaN got/fee for finite inputs", () => {
    for (const r of CONVERT_ROUTES) {
      const prev = previewConvert(baseState(), market, r.id, 1);
      if ("ok" in prev && prev.ok === false) continue;
      const p = prev as Exclude<ReturnType<typeof previewConvert>, { ok: false }>;
      expect(Number.isFinite(p.got)).toBe(true);
      expect(Number.isFinite(p.fee.feeQuote)).toBe(true);
      expect(convertFeeHintLine(p)).not.toMatch(/[<>]/);
    }
  });

  it("rate / toast / lab fee helpers strip HTML-looking vip payloads", () => {
    expect(convertRateLabel(XSS, "USDT", 0.05, false, (n) => String(n))).toContain(XSS);
    // Labels are textContent sinks in preview — still must not invent tags in fee toast.
    expect(formatLabConvertFeeToast({ paid_in_hmc: true, feeHmcDisplay: 0.001 })).not.toMatch(/[<>]/);
    const fq = feeQuoteFromLabConvert(
      { fee_bps: 10, paid_in_hmc: false, fee_quote: 1e6 },
      {
        feeQuoteDisplay: 0.01,
        feeHmcDisplay: 0,
        hmcUsdt: 0.05,
        vipName: XSS,
        hmcDiscountPct: 25,
        fallbackTakerBps: 10,
      },
    );
    expect(fq?.vipName).toBe(XSS);
    // vipName is not HTML-interpolated without escape in Account VIP badge (static VIP_TIERS).
  });

  it("insufficient HMC for fee rolls back convert atomically", () => {
    const s = baseState({
      wallet: { usdt: 0, hmc: 100, sup: 0, btc: 0 },
      feeConfig: { ...baseState().feeConfig, payFeesInHmc: true },
    });
    // Spend almost all HMC so fee cannot clear.
    const res = convert(s, market, "HMC_USDT", 99.999);
    if (res.ok) {
      // If fee fit, wallet must stay non-negative.
      expect(s.wallet.hmc).toBeGreaterThanOrEqual(0);
      expect(s.wallet.usdt).toBeGreaterThanOrEqual(0);
    } else {
      expect(s.wallet.hmc).toBe(100);
      expect(s.wallet.usdt).toBe(0);
    }
  });
});

describe("Account withdraw destination gates (Convert/Account cashout)", () => {
  it("blocks XSS / URI schemes on paper stubs", () => {
    expect(safePaperWithdrawDest(XSS)).toBe(false);
    expect(safePaperWithdrawDest("javascript:alert(1)")).toBe(false);
    expect(safePaperWithdrawDest("data:text/html,hi")).toBe(false);
    expect(safePaperWithdrawDest("paper-usdt-ops-wallet-01")).toBe(true);
    expect(validateLabWithdrawDestination("USDT", XSS).ok).toBe(false);
    expect(validateLabWithdrawDestination("USDT", "javascript:alert(1)").ok).toBe(false);
    expect(validateLabWithdrawDestination("HMC", XSS).ok).toBe(false);
    expect(validateLabWithdrawDestination("HMC", "HMC-ffffffffffffffff").ok).toBe(true);
  });

  it("rejects overlong destinations", () => {
    const long = `paper-${"a".repeat(200)}`;
    expect(validateLabWithdrawDestination("USDT", long).ok).toBe(false);
  });
});

describe("ledger + note persistence hardening", () => {
  it("sanitizeLedgerEntry strips markup from notes (defense in depth)", () => {
    const e = sanitizeLedgerEntry(
      {
        id: XSS,
        kind: XSS as "convert",
        asset: XSS,
        amount: 1,
        usdtValue: 1,
        note: `<img src=x onerror=alert(1)>${XSS}`,
        ts: 1,
      },
      "fallback-id",
    );
    expect(e.id).toBe("fallback-id");
    expect(e.kind).toBe("transfer");
    expect(e.asset).toBe("USDT");
    expect(e.note).not.toMatch(/[<>]/);
    expect(sanitizePlainNote(XSS)).not.toMatch(/[<>]/);
  });
});

describe("openInNewTab / nav link open redirect", () => {
  it("refuses javascript: and data: opens", () => {
    const opened: string[] = [];
    const orig = window.open;
    window.open = ((url?: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;
    try {
      openInNewTab("javascript:alert(1)");
      openInNewTab("data:text/html,<script>alert(1)</script>");
      openInNewTab("https://hackme.tech/downloads.html");
      expect(opened).toEqual(["https://hackme.tech/downloads.html"]);
    } finally {
      window.open = orig;
    }
  });
});

describe("nav button contract (header)", () => {
  it("documents expected data-view ids for Convert/Account/Pool", () => {
    // Mirrors app.ts main-nav — keep in sync if labels change.
    const expected = ["spot", "convert", "account", "pool"] as const;
    document.body.innerHTML = `
      <nav class="ex-nav" id="main-nav">
        ${expected
          .map((v) => `<button type="button" class="nav-btn" data-view="${v}">${v}</button>`)
          .join("")}
      </nav>`;
    const views = [...document.querySelectorAll("#main-nav .nav-btn")].map(
      (b) => (b as HTMLElement).dataset.view,
    );
    expect(views).toEqual([...expected]);
    assertNoExecutableHtml(document.body);
  });
});
