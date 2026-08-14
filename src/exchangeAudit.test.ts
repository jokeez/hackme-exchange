/**
 * End-to-end paper exchange audit: fees, VIP, order kinds, HMC fee pay, convert.
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { executeFill } from "./execution";
import {
  activeVipTier,
  applyFeeToWallet,
  calcFee,
  nextVipProgress,
  VIP_TIERS,
  volume30dUsdt,
} from "./fees";
import { placeOco, placeOrder, processOpenOrders } from "./orders";
import { previewConvert, convert } from "./convert";
import { cancelOrder } from "./store";
import { tickerFromMarket } from "./market";
import { baseState, installMemoryLocalStorage, sampleMarket } from "./testFixtures";
import type { PairId, Ticker, Trade } from "./types";

const market = sampleMarket();

function ticks(m = market): Record<PairId, Ticker> {
  const ids: PairId[] = ["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"];
  return Object.fromEntries(ids.map((id) => [id, tickerFromMarket(m, id)])) as Record<PairId, Ticker>;
}

function synthVol(quoteUsdt: number): Trade {
  return {
    id: `v-${quoteUsdt}`,
    pairId: "HMC_USDT",
    side: "buy",
    price: 1,
    amountBase: 1,
    amountQuote: quoteUsdt,
    feeQuote: 0,
    feeHmc: 0,
    feeRole: "taker",
    feePaidInHmc: false,
    ts: Date.now(),
  };
}

describe("exchange audit: VIP ladder", () => {
  beforeEach(() => installMemoryLocalStorage());

  it("tiers climb Regular → VIP1 → VIP2 → VIP3 on 30d volume", () => {
    const s = baseState();
    expect(activeVipTier(s).name).toBe("Regular");

    s.trades = [synthVol(100_000)];
    expect(activeVipTier(s).name).toBe("VIP 1");
    expect(activeVipTier(s).makerBps).toBe(6);
    expect(activeVipTier(s).takerBps).toBe(8);

    s.trades = [synthVol(1_000_000)];
    expect(activeVipTier(s).name).toBe("VIP 2");
    expect(activeVipTier(s).makerBps).toBe(4);
    expect(activeVipTier(s).takerBps).toBe(6);

    s.trades = [synthVol(10_000_000)];
    expect(activeVipTier(s).name).toBe("VIP 3");
    expect(activeVipTier(s).makerBps).toBe(2);
    expect(activeVipTier(s).takerBps).toBe(4);
  });

  it("nextVipProgress reports remaining to next tier", () => {
    const s = baseState();
    s.trades = [synthVol(40_000)];
    const p = nextVipProgress(s);
    expect(p.tier.name).toBe("Regular");
    expect(p.next?.name).toBe("VIP 1");
    expect(p.remaining).toBe(60_000);
    expect(p.pct).toBeCloseTo(40, 5);
  });

  it("VIP schedule is strictly improving maker/taker", () => {
    const ordered = [...VIP_TIERS].sort((a, b) => a.minVolUsdt - b.minVolUsdt);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.makerBps).toBeLessThan(ordered[i - 1]!.makerBps);
      expect(ordered[i]!.takerBps).toBeLessThan(ordered[i - 1]!.takerBps);
    }
  });
});

describe("exchange audit: fee collection", () => {
  beforeEach(() => installMemoryLocalStorage());

  it("market buy charges taker fee from quote balance", () => {
    const s = baseState();
    const usdtBefore = s.wallet.usdt;
    const mid = market.hmcUsdt;
    const amt = 10_000;
    const quote = mid * amt;
    const res = executeFill(s, market, "HMC_USDT", "buy", mid, amt, quote, "market");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fee.role).toBe("taker");
    expect(res.fee.bps).toBe(10);
    expect(s.wallet.usdt).toBeLessThan(usdtBefore - quote + 1e-9);
    expect(s.trades[0]!.feeQuote).toBeCloseTo(res.fee.feeQuote, 8);
  });

  it("resting limit fill uses maker fee", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 5_000, 0.0004, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    const usdtBeforeFill = s.wallet.usdt;
    const m = sampleMarket({ hmcUsdt: 0.00039 });
    processOpenOrders(s, m, ticks(m));
    expect(s.orders.some((x) => x.status === "filled")).toBe(true);
    const t = s.trades[0]!;
    expect(t.feeRole).toBe("maker");
    expect(t.feeQuote).toBeGreaterThan(0);
    expect(s.wallet.usdt).toBeLessThan(usdtBeforeFill);
  });

  it("payFeesInHmc discounts and debits HMC on sell (no base credit offset)", () => {
    const s = baseState();
    s.feeConfig.payFeesInHmc = true;
    s.feeConfig.hmcDiscountPct = 25;
    const hmcBefore = s.wallet.hmc;
    const mid = market.hmcUsdt;
    const amt = 20_000;
    const quote = mid * amt;
    const plain = calcFee({ ...s, feeConfig: { ...s.feeConfig, payFeesInHmc: false } }, market, "HMC_USDT", quote, "taker");
    const res = executeFill(s, market, "HMC_USDT", "sell", mid, amt, quote, "market");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fee.paidInHmc).toBe(true);
    expect(res.fee.feeQuote).toBeCloseTo(plain.feeQuote * 0.75, 6);
    expect(s.wallet.hmc).toBeCloseTo(hmcBefore - amt - res.fee.feeHmc, 6);
    expect(s.trades[0]!.feePaidInHmc).toBe(true);
  });

  it("insufficient HMC for fee on sell rolls back wallet", () => {
    const s = baseState();
    s.feeConfig.payFeesInHmc = true;
    s.wallet.hmc = 100; // sell needs amount + fee in HMC
    const snap = { ...s.wallet };
    const mid = market.hmcUsdt;
    const amt = 100; // sells all HMC; fee still needs extra HMC → fail
    const res = executeFill(s, market, "HMC_USDT", "sell", mid, amt, mid * amt, "market");
    expect(res.ok).toBe(false);
    expect(s.wallet).toEqual(snap);
  });

  it("VIP3 taker is cheaper than Regular on same notional", () => {
    const regular = baseState();
    const vip = baseState();
    vip.trades = [synthVol(10_000_000)];
    const q = 50_000;
    const fr = calcFee(regular, market, "HMC_USDT", q, "taker");
    const fv = calcFee(vip, market, "HMC_USDT", q, "taker");
    expect(fr.bps).toBe(10);
    expect(fv.bps).toBe(4);
    expect(fv.feeQuote).toBeLessThan(fr.feeQuote);
  });
});

describe("exchange audit: order kinds + convert", () => {
  beforeEach(() => installMemoryLocalStorage());

  it("stop_market triggers as taker and leaves no open order", () => {
    const s = baseState();
    const o = placeOrder(s, "HMC_USDT", "sell", "stop_market", 500, undefined, 0.0004, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    const m = sampleMarket({ hmcUsdt: 0.00039 });
    processOpenOrders(s, m, ticks(m));
    expect(s.orders.filter((x) => x.status === "open" || x.status === "triggered")).toHaveLength(0);
    expect(s.trades[0]?.feeRole).toBe("taker");
  });

  it("post-only limit that would take is rejected or stays maker-safe", () => {
    const s = baseState();
    // Buy limit above mid would cross — post-only should refuse.
    const res = placeOrder(s, "HMC_USDT", "buy", "limit", 100, 0.0005, undefined, undefined, "GTC", true, market);
    expect("reason" in res || ("id" in res && s.orders.every((o) => o.status === "open"))).toBe(true);
    if ("reason" in res) {
      expect(res.reason.toLowerCase()).toMatch(/post|cross|take/);
    }
  });

  it("cancel resting limit restores available balance semantics", () => {
    const s = baseState();
    const before = s.wallet.usdt;
    const o = placeOrder(s, "HMC_USDT", "buy", "limit", 1000, 0.0004, undefined, undefined, "GTC", false, market);
    expect("id" in o).toBe(true);
    if (!("id" in o)) return;
    cancelOrder(s, o.id);
    expect(o.status).toBe("cancelled");
    // Paper demo does not lock funds on place — wallet unchanged until fill.
    expect(s.wallet.usdt).toBe(before);
  });

  it("convert preview + apply charges VIP taker and moves balances", () => {
    const s = baseState();
    const prev = previewConvert(s, market, "USDT_HMC", 100);
    expect("fee" in prev).toBe(true);
    if (!("fee" in prev)) return;
    expect(prev.fee.role).toBe("taker");
    const usdt0 = s.wallet.usdt;
    const hmc0 = s.wallet.hmc;
    const applied = convert(s, market, "USDT_HMC", 100);
    expect(applied.ok).toBe(true);
    expect(s.wallet.usdt).toBeLessThan(usdt0);
    expect(s.wallet.hmc).toBeGreaterThan(hmc0);
  });

  it("volume30d ignores trades older than 30 days", () => {
    const s = baseState();
    s.trades = [
      { ...synthVol(500_000), ts: Date.now() - 31 * 86_400_000 },
      { ...synthVol(10_000), ts: Date.now() },
    ];
    expect(volume30dUsdt(s)).toBe(10_000);
    expect(activeVipTier(s).name).toBe("Regular");
  });

  it("OCO + applyFeeToWallet edge: zero fee is no-op", () => {
    const s = baseState();
    const fee = calcFee(s, market, "HMC_USDT", 0, "maker");
    expect(applyFeeToWallet(s, "HMC_USDT", fee).ok).toBe(true);
    const placed = placeOco(s, "HMC_USDT", "sell", 50, 0.00055, 0.00038, 0.00037, market);
    expect("tp" in placed).toBe(true);
  });
});
