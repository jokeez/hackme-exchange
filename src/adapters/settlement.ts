import { isLabApiEnabled, isLiveMode } from "../config/integration";
import type { OrderSide, PairId, Wallet } from "../types";
import type { FeeQuote } from "../fees";
import { fetchNodeWallet, mergeNodeIntoDemoWallet } from "./nodeWallet";
import {
  buildPlaceOrderBody,
  fetchExchangeBalances,
  formatExchangeReject,
  mergeApiBalancesIntoWallet,
  postExchangeOrder,
} from "./exchangeApi";

/** Future: swap demo localStorage backend for exchange API + on-chain settlement. */
export type SettlementAdapter = {
  name: string;
  /** Pull real balances where available */
  syncBalances?(demo: Wallet): Promise<{ wallet: Wallet; note: string }>;
  /** Place trade — demo instant; live/lab would lock + match + settle */
  settleTrade?(
    pairId: PairId,
    side: OrderSide,
    amountBase: number,
    quoteGross: number,
    fee: FeeQuote,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Withdraw to external address — production live only (not lab) */
  withdraw?(
    asset: keyof Wallet,
    amount: number,
    address: string,
  ): Promise<{ ok: true; txId?: string } | { ok: false; reason: string }>;
};

export const demoSettlement: SettlementAdapter = {
  name: "demo-localStorage",
};

export const hybridSettlement: SettlementAdapter = {
  name: "hybrid-node-read",
  async syncBalances(demo) {
    const snap = await fetchNodeWallet();
    if (!snap.ok) return { wallet: demo, note: snap.reason };
    return {
      wallet: mergeNodeIntoDemoWallet(demo, snap),
      note: `Synced HMC/SUP from node (${snap.address.slice(0, 12)}…)`,
    };
  },
};

/**
 * Private lab server settlement path (balances + market place via exchange-api).
 * Selected when VITE_EXCHANGE_API_ORIGIN / VITE_LAB_API is set (loopback only).
 * Does **not** enable isLiveMode() — public builds stay paper.
 */
export const liveSettlement: SettlementAdapter = {
  name: "liveSettlement",
  async syncBalances(demo) {
    const bal = await fetchExchangeBalances();
    if (!bal.ok) {
      // FE-M03: fail closed — do not merge node into lab wallet (hybrid balances lie).
      return { wallet: demo, note: `Lab API: ${bal.message} — balances frozen (no node merge)` };
    }
    return {
      wallet: mergeApiBalancesIntoWallet(demo, bal.balances ?? [], { labAuthoritative: true }),
      note: `Server settlement balances · ${bal.address.slice(0, 14)}… (lab liveSettlement)`,
    };
  },
  async settleTrade(pairId, side, amountBase, quoteGross, fee) {
    const mid = amountBase > 0 ? quoteGross / amountBase : 0;
    // Market buy needs a price ceiling; use ~2% slip over mid when available.
    const ceiling = mid > 0 ? mid * 1.02 : undefined;
    const body = buildPlaceOrderBody(pairId, side, "market", amountBase, ceiling, undefined, {
      payFeeInHmc: !!fee?.paidInHmc,
    });
    if ("error" in body) return { ok: false, reason: body.error };
    const res = await postExchangeOrder(body);
    if (res.ok) return { ok: true };
    return { ok: false, reason: formatExchangeReject(res) };
  },
};

/** @deprecated alias — use liveSettlement */
export const labApiSettlement = liveSettlement;

/**
 * Demo/paper default: hybrid node-read (or localStorage-only when sync unused).
 * Lab API opt-in (loopback origin set): liveSettlement server path.
 * isLiveMode() never selects a production live adapter (always false).
 */
export function activeSettlement(): SettlementAdapter {
  // Guard: even if isLiveMode is ever unblocked, refuse production adapter here.
  if (isLiveMode()) return demoSettlement;
  if (isLabApiEnabled()) return liveSettlement;
  return hybridSettlement;
}

/** True when SPA uses server settlement (lab loopback), not paper-only. */
export function isServerSettlementActive(): boolean {
  return activeSettlement().name === "liveSettlement";
}
