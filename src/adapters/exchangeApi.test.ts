/**
 * Exchange API client unit tests (mocked fetch).
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiPairToId,
  balancesToWalletPartial,
  buildPlaceOrderBody,
  clearLabSessionMeta,
  displayPriceToApi,
  displayToMinor,
  exchangeHealth,
  fetchExchangeBalances,
  fetchExchangeBook,
  listExchangeFills,
  listExchangeOrders,
  mergeApiBalancesIntoWallet,
  minorToDisplay,
  pairIdToApi,
  postExchangeOrder,
  postLabCounterparty,
  authChallenge,
  authVerify,
  authRevokeAll,
  fetchDepositAddress,
  listWithdrawals,
  requestWithdraw,
  postLabBridgeCredit,
} from "./exchangeApi";
import { addressFromPubKey, labFixtureIdentity, signLabFixtureMessage, LAB_FIXTURE_SEED_HEX } from "./labFixture";
import {
  apiFillToTrade,
  apiOrderToDemo,
  clearLabBookCache,
  getLabBookCache,
  labBookMid,
  labMarketSlipHint,
  mergeServerFills,
  mergeServerOpenOrders,
  refreshLabBook,
  seedLabBookCacheForTest,
} from "./labMatching";
import { isLabApiEnabled, isLiveMode, INTEGRATION } from "../config/integration";
import { activeSettlement } from "./settlement";
import { loadState } from "../store";
import { sampleMarket } from "../testFixtures";
import type { ApiFill, ApiOrder } from "./exchangeApi";

describe("exchangeApi mapping", () => {
  it("converts minor units at 1e8 scale", () => {
    expect(minorToDisplay(100_000_000)).toBe(1);
    expect(displayToMinor(1.5)).toBe(150_000_000);
  });

  it("maps pair ids and prices to API units", () => {
    expect(pairIdToApi("HMC_USDT")).toBe("HMC/USDT");
    expect(apiPairToId("HMC/USDT")).toBe("HMC_USDT");
    expect(displayPriceToApi(0.00042)).toBe(42000);
    const body = buildPlaceOrderBody("HMC_USDT", "sell", "limit", 1, 0.00042);
    expect(body).toEqual({
      pair: "HMC/USDT",
      side: "sell",
      type: "limit",
      qty: 100_000_000,
      price: 42000,
    });
    const withHmc = buildPlaceOrderBody("HMC_USDT", "sell", "limit", 1, 0.00042, undefined, {
      payFeeInHmc: true,
    });
    expect(withHmc).toMatchObject({ pay_fee_in_hmc: true });
    const withTif = buildPlaceOrderBody("HMC_USDT", "buy", "limit", 1, 0.00042, undefined, {
      postOnly: true,
      timeInForce: "IOC",
    });
    expect(withTif).toMatchObject({ post_only: true, time_in_force: "IOC" });
    const marketNoTif = buildPlaceOrderBody("HMC_USDT", "buy", "market", 1, 0.00042, undefined, {
      postOnly: true,
      timeInForce: "FOK",
    });
    expect(marketNoTif).not.toHaveProperty("post_only");
    expect(marketNoTif).not.toHaveProperty("time_in_force");
  });

  it("maps balance rows into wallet fields", () => {
    const partial = balancesToWalletPartial([
      { asset: "USDT", available: 1_000_000_000, reserved: 0, amount: 1_000_000_000 },
      { asset: "HMC", available: 50_000_000_000, reserved: 0, amount: 50_000_000_000 },
    ]);
    expect(partial.usdt).toBe(10);
    expect(partial.hmc).toBe(500);
    const merged = mergeApiBalancesIntoWallet(
      { usdt: 1, hmc: 2, sup: 3, btc: 0.1 },
      [
        { asset: "USDT", available: 200_000_000, reserved: 0, amount: 200_000_000 },
        { asset: "BTC", available: 10_000_000, reserved: 0, amount: 10_000_000 },
      ],
    );
    expect(merged.usdt).toBe(2);
    expect(merged.btc).toBe(0.1);
    expect(merged.hmc).toBe(2);
    expect(merged.sup).toBe(3);
    const lab = mergeApiBalancesIntoWallet(
      { usdt: 1, hmc: 2, sup: 3, btc: 0.1 },
      [
        { asset: "USDT", available: 200_000_000, reserved: 0, amount: 200_000_000 },
        { asset: "BTC", available: 10_000_000, reserved: 0, amount: 10_000_000 },
      ],
      { labAuthoritative: true },
    );
    expect(lab.usdt).toBe(2);
    expect(lab.btc).toBe(0.1);
    expect(lab.hmc).toBe(0);
    expect(lab.sup).toBe(0);
  });
});

describe("labMatching mappers", () => {
  it("labBookMid / labMarketSlipHint prefer book mid and stay inside ±15% band", () => {
    clearLabBookCache();
    expect(labBookMid("HMC_USDT")).toBe(0);
    expect(labMarketSlipHint("buy", "HMC_USDT", 0.00055, 0.02)).toBeCloseTo(0.00055 * 1.02, 10);
    seedLabBookCacheForTest({
      pairId: "HMC_USDT",
      bids: [{ price: 0.000548, amountBase: 1000, totalQuote: 0.548 }],
      asks: [{ price: 0.000552, amountBase: 1000, totalQuote: 0.552 }],
      ts: Date.now(),
      fingerprint: "test",
    });
    const mid = labBookMid("HMC_USDT");
    expect(mid).toBeCloseTo(0.00055, 10);
    const buy = labMarketSlipHint("buy", "HMC_USDT", 0.0007, 0.02);
    const sell = labMarketSlipHint("sell", "HMC_USDT", 0.0007, 0.02);
    expect(buy).toBeCloseTo(mid * 1.02, 10);
    expect(sell).toBeCloseTo(mid * 0.98, 10);
    expect(buy).toBeLessThanOrEqual(mid * 1.15);
    expect(sell).toBeGreaterThanOrEqual(mid * 0.85);
    clearLabBookCache();
  });

  it("maps API order/fill into demo shapes", () => {
    const order: ApiOrder = {
      id: "ord-1",
      pair: "HMC/USDT",
      side: "buy",
      type: "limit",
      price: 42000,
      qty: 100_000_000,
      remaining: 50_000_000,
      status: "partial",
    };
    const demo = apiOrderToDemo(order)!;
    expect(demo.pairId).toBe("HMC_USDT");
    expect(demo.price).toBe(0.00042);
    expect(demo.amountBase).toBe(1);
    expect(demo.filledBase).toBe(0.5);
    expect(demo.status).toBe("open");

    const fill: ApiFill = {
      id: "f1",
      pair: "HMC/USDT",
      price: 42000,
      qty: 50_000_000,
      quote: 21_000,
      taker_account: "HMC-aaa",
      maker_account: "HMC-bbb",
      taker_side: "buy",
      taker_fee_quote: 21,
      maker_fee_quote: 17,
      taker_fee_hmc: 50_000_000,
      maker_fee_hmc: 0,
    };
    const takerTrade = apiFillToTrade(fill, "HMC-aaa")!;
    expect(takerTrade.side).toBe("buy");
    expect(takerTrade.feeRole).toBe("taker");
    expect(takerTrade.feePaidInHmc).toBe(true);
    expect(takerTrade.feeHmc).toBe(0.5);
    const makerTrade = apiFillToTrade(fill, "HMC-bbb")!;
    expect(makerTrade.side).toBe("sell");
    expect(makerTrade.feeRole).toBe("maker");
    expect(makerTrade.feePaidInHmc).toBe(false);
    expect(makerTrade.feeQuote).toBeGreaterThan(0);
  });

  it("merges server open orders including trailing; keeps paper with source", () => {
    const state = loadState();
    state.orders = [
      {
        id: "paper-local",
        pairId: "HMC_USDT",
        side: "sell",
        kind: "limit",
        price: 0.00045,
        amountBase: 10,
        filledBase: 0,
        status: "open",
        source: "paper",
        createdAt: 1,
      },
    ];
    mergeServerOpenOrders(state, [
      {
        id: "srv-1",
        pair: "HMC/USDT",
        side: "buy",
        type: "limit",
        price: 40000,
        qty: 100_000_000,
        remaining: 100_000_000,
        status: "open",
      },
      {
        id: "srv-stop",
        pair: "HMC/USDT",
        side: "sell",
        type: "stop_limit",
        price: 38500,
        stop_price: 39000,
        qty: 100_000_000,
        remaining: 100_000_000,
        status: "open",
      },
      {
        id: "srv-trail",
        pair: "HMC/USDT",
        side: "sell",
        type: "trailing_stop",
        price: 0,
        stop_price: 38000,
        qty: 50_000_000,
        remaining: 50_000_000,
        status: "open",
      },
    ]);
    expect(state.orders.some((o) => o.id === "srv-1")).toBe(true);
    expect(state.orders.some((o) => o.id === "srv-stop" && o.kind === "stop_limit")).toBe(true);
    expect(state.orders.some((o) => o.id === "srv-trail" && o.kind === "trailing_stop")).toBe(true);
    expect(state.orders.some((o) => o.id === "paper-local")).toBe(true);
    const n = mergeServerFills(
      state,
      [
        {
          id: "fill-x",
          pair: "HMC/USDT",
          price: 40000,
          qty: 10_000_000,
          quote: 4_000,
          taker_account: "HMC-me",
          maker_account: "HMC-other",
          taker_side: "buy",
          taker_fee_quote: 4,
        },
      ],
      "HMC-me",
    );
    expect(n).toBe(1);
    expect(state.trades[0]?.id).toBe("fill-x");
  });

  it("mergeServerFills mirrors into Account ledger when market is passed", () => {
    const state = loadState();
    state.trades = [];
    state.ledger = [];
    const market = sampleMarket({ hmcUsdt: 0.0004 });
    const n = mergeServerFills(
      state,
      [
        {
          id: "fill-ledger-1",
          pair: "HMC/USDT",
          price: 40000,
          qty: 10_000_000,
          quote: 4_000,
          taker_account: "HMC-me",
          maker_account: "HMC-other",
          taker_side: "buy",
          taker_fee_quote: 4,
        },
      ],
      "HMC-me",
      market,
    );
    expect(n).toBe(1);
    expect(state.ledger.some((e) => e.kind === "trade" && e.note?.includes("lab:fill-ledger-1"))).toBe(true);
    const again = mergeServerFills(
      state,
      [
        {
          id: "fill-ledger-1",
          pair: "HMC/USDT",
          price: 40000,
          qty: 10_000_000,
          quote: 4_000,
          taker_account: "HMC-me",
          maker_account: "HMC-other",
          taker_side: "buy",
          taker_fee_quote: 4,
        },
      ],
      "HMC-me",
      market,
    );
    expect(again).toBe(0);
    expect(state.ledger.filter((e) => e.note?.includes("lab:fill-ledger-1")).length).toBeLessThanOrEqual(2);
  });
});

describe("labFixture crypto", () => {
  it("derives known DEMO/LAB address from fixed seed", () => {
    const id = labFixtureIdentity(LAB_FIXTURE_SEED_HEX);
    expect(id.label).toBe("DEMO/LAB fixture");
    expect(id.address).toBe("HMC-65b60673d6ed884b");
    expect(id.pubkeyHex).toHaveLength(64);
    const pubBytes = Uint8Array.from({ length: 32 }, (_, i) => parseInt(id.pubkeyHex.slice(i * 2, i * 2 + 2), 16));
    expect(addressFromPubKey(pubBytes)).toBe(id.address);
  });

  it("signs deterministically", () => {
    const a = signLabFixtureMessage("challenge-msg");
    const b = signLabFixtureMessage("challenge-msg");
    expect(a).toBe(b);
    expect(a).toHaveLength(128);
  });
});

describe("exchangeApi HTTP (mocked)", () => {
  const prevFetch = globalThis.fetch;

  beforeEach(() => {
    clearLabSessionMeta();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/health")) {
          return new Response(
            JSON.stringify({ ok: true, service: "hackme-exchange-api", phase: "2-matching-lab", matching: "ok" }),
            { status: 200 },
          );
        }
        if (url.includes("/auth/challenge")) {
          return new Response(
            JSON.stringify({
              challenge_id: "ch1",
              address: "HMC-65b60673d6ed884b",
              nonce: "n1",
              message: "sign-me",
              expires_at: "2099-01-01T00:00:00Z",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/auth/verify")) {
          return new Response(
            JSON.stringify({
              ok: true,
              address: "HMC-65b60673d6ed884b",
              csrf_token: "csrf-lab",
              expires_at: "2099-01-01T00:00:00Z",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/balances")) {
          return new Response(
            JSON.stringify({
              address: "HMC-65b60673d6ed884b",
              balances: [{ asset: "USDT", available: 500_000_000, reserved: 0, amount: 500_000_000 }],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/fills")) {
          return new Response(JSON.stringify({ fills: [] }), { status: 200 });
        }
        if (url.includes("/book?")) {
          return new Response(
            JSON.stringify({
              ok: true,
              pair: "HMC/USDT",
              bids: [{ price: 41000, qty: 50_000_000, n: 1 }],
              asks: [{ price: 42000, qty: 100_000_000, n: 1 }],
              ts: new Date().toISOString(),
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/lab/counterparty") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ok: true,
              warning: "DEMO/LAB",
              bot_address: "HMC-counterparty000",
              crossed_order_id: "ord-x",
              order: {
                id: "bot-1",
                pair: "HMC/USDT",
                side: "buy",
                type: "limit",
                price: 42000,
                qty: 100_000_000,
                remaining: 0,
                status: "filled",
              },
              fills: [
                {
                  id: "f-bot",
                  pair: "HMC/USDT",
                  price: 42000,
                  qty: 100_000_000,
                  quote: 42000,
                  taker_account: "HMC-counterparty000",
                  maker_account: "HMC-65b60673d6ed884b",
                  taker_side: "buy",
                  taker_fee_quote: 1,
                  maker_fee_quote: 1,
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/orders") || url.includes("/orders?")) {
          if (init?.method === "POST") {
            return new Response(
              JSON.stringify({
                ok: true,
                order: {
                  id: "o1",
                  pair: "HMC/USDT",
                  side: "buy",
                  type: "limit",
                  price: 42000,
                  qty: 100_000_000,
                  remaining: 100_000_000,
                  status: "open",
                },
                fills: [],
              }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ orders: [] }), { status: 200 });
        }
        return new Response("missing", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = prevFetch;
    clearLabSessionMeta();
  });

  it("health / challenge / verify / balances / place order", async () => {
    const base = "http://127.0.0.1:18443";
    const health = await exchangeHealth(2_500, base);
    expect(health).toMatchObject({ ok: true, phase: "2-matching-lab" });
    const ch = await authChallenge("HMC-65b60673d6ed884b", 5_000, base);
    expect(ch).toMatchObject({ challenge_id: "ch1" });
    const ver = await authVerify(
      {
        challenge_id: "ch1",
        address: "HMC-65b60673d6ed884b",
        pubkey_ed25519: "aa".repeat(32),
        sig_ed25519: "bb".repeat(64),
      },
      5_000,
      base,
    );
    expect(ver).toMatchObject({ ok: true, csrf_token: "csrf-lab" });
    const bal = await fetchExchangeBalances(5_000, base);
    expect(bal).toMatchObject({ ok: true });
    if (bal.ok) expect(minorToDisplay(bal.balances[0]!.available)).toBe(5);
    const ord = await postExchangeOrder(
      { pair: "HMC/USDT", side: "buy", type: "limit", qty: 100_000_000, price: 42000 },
      3_000,
      base,
    );
    expect(ord).toMatchObject({ ok: true, order: { id: "o1" } });
    const listed = await listExchangeOrders(undefined, 3_000, base);
    expect(listed).toMatchObject({ ok: true, orders: [] });
    const fills = await listExchangeFills(10, 3_000, base);
    expect(fills).toMatchObject({ ok: true, fills: [] });
    const book = await fetchExchangeBook("HMC/USDT", 3_000, base);
    expect(book).toMatchObject({
      ok: true,
      pair: "HMC/USDT",
      asks: [{ price: 42000, qty: 100_000_000 }],
    });
    const cross = await postLabCounterparty({ pair: "HMC/USDT" }, 3_000, base);
    expect(cross).toMatchObject({ ok: true, bot_address: "HMC-counterparty000" });
  });

  it("maps deposit/withdraw/bridge and revoke-all client calls", async () => {
    const base = "http://127.0.0.1:18443";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/deposit/address")) {
          return new Response(
            JSON.stringify({
              ok: true,
              account_address: "HMC-a",
              asset: "USDT",
              deposit_address: "labdep1usdtabcdef01",
              kind: "lab_stub",
              bridge_model: "paper_bridge_stub",
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/lab/bridge-credit") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ok: true,
              balance_after: 1_000_000_000,
              deposit_address: "labdep1usdtabcdef01",
              bridge_model: "paper_bridge_stub",
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/withdraw") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ok: true,
              withdraw: {
                id: "wd1",
                asset: "HMC",
                amount: 5_000_000,
                destination: "HMC-ffffffffffffffff",
                status: "pending",
              },
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/withdrawals")) {
          return new Response(
            JSON.stringify({
              ok: true,
              withdrawals: [{ id: "wd1", asset: "HMC", amount: 5_000_000, destination: "HMC-ff", status: "pending" }],
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/auth/revoke-all") && init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true, session_version: 2 }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      }),
    );
    // seed csrf for mutating calls
    sessionStorage.setItem("hackme-ex-lab-csrf", "csrf-lab");
    sessionStorage.setItem("hackme-ex-lab-address", "HMC-a");
    const dep = await fetchDepositAddress("USDT", 3_000, base);
    expect(dep).toMatchObject({ ok: true, bridge_model: "paper_bridge_stub" });
    const br = await postLabBridgeCredit({ asset: "USDT", amount: 10_000_000 }, 3_000, base);
    expect(br).toMatchObject({ ok: true, bridge_model: "paper_bridge_stub" });
    const wd = await requestWithdraw(
      { asset: "HMC", amount: 5_000_000, destination: "HMC-ffffffffffffffff" },
      3_000,
      base,
    );
    expect(wd).toMatchObject({ ok: true, withdraw: { id: "wd1", status: "pending" } });
    const list = await listWithdrawals(3_000, base);
    expect(list).toMatchObject({ ok: true });
    if (list.ok) expect(list.withdrawals).toHaveLength(1);
    const rev = await authRevokeAll(3_000, base);
    expect(rev).toMatchObject({ ok: true, session_version: 2 });
  });

  it("refreshLabBook maps minors into display cache", async () => {
    clearLabBookCache();
    // Exercise mapping via mocked fetch when lab origin is set; otherwise skip network.
    const base = "http://127.0.0.1:18443";
    const book = await fetchExchangeBook("HMC/USDT", 3_000, base);
    expect(book.ok).toBe(true);
    if (!isLabApiEnabled()) return;
    const r = await refreshLabBook("HMC_USDT");
    expect(r.ok).toBe(true);
    const cache = getLabBookCache("HMC_USDT");
    expect(cache?.asks[0]?.price).toBe(0.00042);
    expect(cache?.asks[0]?.amountBase).toBe(1);
  });

  it("returns disabled when no origin configured", async () => {
    const h = await exchangeHealth();
    if (!isLabApiEnabled()) expect(h).toMatchObject({ ok: false, code: "disabled" });
  });
});

describe("mode / settlement gates", () => {
  it("never enables public isLiveMode", () => {
    expect(isLiveMode()).toBe(false);
  });

  it("default settlement is hybrid unless lab API origin opted in", () => {
    if (isLabApiEnabled()) {
      expect(activeSettlement().name).toBe("liveSettlement");
      expect(INTEGRATION.exchangeApiOrigin).toMatch(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/);
    } else {
      expect(activeSettlement().name).toBe("hybrid-node-read");
      expect(INTEGRATION.exchangeApiOrigin).toBe("");
    }
  });

  it("isLiveMode stays false even when lab settlement is active", () => {
    expect(isLiveMode()).toBe(false);
  });
});
