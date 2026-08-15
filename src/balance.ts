import { calcFee, liquidityRole } from "./fees";
import { midForPair } from "./market";
import { PAIRS } from "./pairs";
import type { DemoState, MarketSnapshot, Order, PairId, Wallet } from "./types";

function balKey(asset: string): keyof Wallet {
  return asset.toLowerCase() as keyof Wallet;
}

function quoteNeedForLeg(
  state: DemoState,
  m: MarketSnapshot | undefined,
  o: Order,
  remaining: number,
): number {
  let need = o.price * remaining;
  if (m) {
    const fee = calcFee(state, m, o.pairId, need, liquidityRole(o.kind));
    if (!fee.paidInHmc) need += fee.feeQuote;
  }
  return need;
}

/** Quote/base locked by open resting orders (demo reservation — not on-chain). */
export function reservedBalances(state: DemoState, m?: MarketSnapshot): Wallet {
  const reserved: Wallet = { usdt: 0, hmc: 0, sup: 0, btc: 0 };
  const ocoSeen = new Set<string>();

  for (const o of state.orders) {
    if (o.status !== "open" && o.status !== "triggered") continue;
    // Server-side lab orders: balances sync uses available (already net of reserve).
    if (o.source === "lab") continue;
    const pair = PAIRS.find((p) => p.id === o.pairId);
    if (!pair) continue;

    // OCO TP+SL are mutually exclusive — reserve once per group (max leg), not 2×.
    if (o.ocoGroupId) {
      if (ocoSeen.has(o.ocoGroupId)) continue;
      ocoSeen.add(o.ocoGroupId);
      const legs = state.orders.filter(
        (x) =>
          x.ocoGroupId === o.ocoGroupId && (x.status === "open" || x.status === "triggered"),
      );
      if (o.side === "sell") {
        const remaining = Math.max(0, ...legs.map((x) => x.amountBase - x.filledBase), 0);
        reserved[balKey(pair.base)] += remaining;
      } else {
        let maxNeed = 0;
        for (const leg of legs) {
          const remaining = Math.max(0, leg.amountBase - leg.filledBase);
          if (remaining <= 0) continue;
          maxNeed = Math.max(maxNeed, quoteNeedForLeg(state, m, leg, remaining));
        }
        reserved[balKey(pair.quote)] += maxNeed;
      }
      continue;
    }

    const remaining = Math.max(0, o.amountBase - o.filledBase);
    if (remaining <= 0) continue;
    if (o.side === "buy") {
      reserved[balKey(pair.quote)] += quoteNeedForLeg(state, m, o, remaining);
    } else {
      reserved[balKey(pair.base)] += remaining;
    }
  }
  return reserved;
}

export function freeBalance(state: DemoState, asset: keyof Wallet, m?: MarketSnapshot): number {
  const reserved = reservedBalances(state, m);
  return Math.max(0, state.wallet[asset] - reserved[asset]);
}

/**
 * Largest whole-base buy that still passes assertOrderFunds at `pct` of free quote.
 * Accounts for maker/taker fees (quote or HMC) so 100% / MAX never overshoots.
 */
export function maxBuyBaseAmount(
  state: DemoState,
  m: MarketSnapshot,
  pairId: PairId,
  price: number,
  kind: Order["kind"],
  pct = 1,
): number {
  if (!(price > 0) || !Number.isFinite(price)) return 0;
  const pair = PAIRS.find((p) => p.id === pairId);
  if (!pair) return 0;
  const p = Math.min(1, Math.max(0, pct));
  if (p <= 0) return 0;
  const quoteK = balKey(pair.quote);
  const budget = freeBalance(state, quoteK, m) * p;
  if (budget <= 0) return 0;
  let lo = 0;
  let hi = Math.floor(budget / price);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (assertOrderFunds(state, m, pairId, "buy", mid, price, kind).ok) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function assertOrderFunds(
  state: DemoState,
  m: MarketSnapshot,
  pairId: PairId,
  side: "buy" | "sell",
  amountBase: number,
  price: number,
  kind: Order["kind"] = "limit",
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(amountBase) || amountBase <= 0) {
    return { ok: false, reason: "Amount must be > 0" };
  }
  const pair = PAIRS.find((p) => p.id === pairId)!;
  if (side === "sell") {
    const baseK = balKey(pair.base);
    const free = freeBalance(state, baseK, m);
    if (free < amountBase) {
      return { ok: false, reason: `Insufficient ${pair.base} (reserved in open orders)` };
    }
    if (state.feeConfig.payFeesInHmc) {
      const quoteGross = price * amountBase;
      const fee = calcFee(state, m, pairId, quoteGross, liquidityRole(kind));
      if (fee.paidInHmc) {
        // Selling HMC reduces free HMC — fee must fit in leftover (or other free HMC).
        const hmcFree = freeBalance(state, "hmc", m);
        const leftover = baseK === "hmc" ? hmcFree - amountBase : hmcFree;
        if (leftover < fee.feeHmc) {
          return { ok: false, reason: "Insufficient HMC for fee (reserved in open orders)" };
        }
      }
    }
    return { ok: true };
  }
  const quoteK = balKey(pair.quote);
  const quoteGross = price * amountBase;
  const fee = calcFee(state, m, pairId, quoteGross, liquidityRole(kind));
  const quoteNeed = quoteGross + (fee.paidInHmc ? 0 : fee.feeQuote);
  const free = freeBalance(state, quoteK, m);
  if (free < quoteNeed) {
    return { ok: false, reason: `Insufficient ${pair.quote} (reserved in open orders)` };
  }
  if (fee.paidInHmc) {
    const hmcFree = freeBalance(state, "hmc", m);
    if (hmcFree < fee.feeHmc) {
      return { ok: false, reason: "Insufficient HMC for fee (reserved in open orders)" };
    }
  }
  return { ok: true };
}

/** Mid-based sanity check for market-style sizing previews. */
export function assertMarketFunds(
  state: DemoState,
  m: MarketSnapshot,
  pairId: PairId,
  side: "buy" | "sell",
  amountBase: number,
): { ok: true } | { ok: false; reason: string } {
  const mid = midForPair(m, pairId);
  return assertOrderFunds(state, m, pairId, side, amountBase, mid, "market");
}
