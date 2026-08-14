import { applyFeeToWallet, calcFee, liquidityRole, type FeeQuote } from "./fees";
import { recordTradeLedger } from "./ledger";
import type { DemoState, MarketSnapshot, OrderKind, OrderSide, PairId, Trade } from "./types";
import { applyMarketTrade, uid } from "./store";

export type FillResult =
  | { ok: true; fee: FeeQuote; avgPrice: number; quote: number }
  | { ok: false; reason: string };

export function executeFill(
  state: DemoState,
  m: MarketSnapshot,
  pairId: PairId,
  side: OrderSide,
  price: number,
  amountBase: number,
  quoteGross: number,
  kind: OrderKind,
  triggered = false,
  immediateFill = false,
): FillResult {
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "Invalid price" };
  if (!Number.isFinite(amountBase) || amountBase <= 0) return { ok: false, reason: "Amount must be > 0" };
  if (!Number.isFinite(quoteGross) || quoteGross < 0) return { ok: false, reason: "Invalid quote amount" };

  const walletBefore = { ...state.wallet };
  const tradesSnapshot = state.trades.slice();
  const ledgerSnapshot = state.ledger.slice();

  const role = liquidityRole(kind, triggered, immediateFill);
  const fee = calcFee(state, m, pairId, quoteGross, role);
  const quoteNeed = side === "buy" ? quoteGross + (fee.paidInHmc ? 0 : fee.feeQuote) : quoteGross;

  const res = applyMarketTrade(state, pairId, side, price, amountBase, quoteNeed);
  if (!res.ok) return res;

  if (fee.paidInHmc || side === "sell") {
    const feeRes = applyFeeToWallet(state, pairId, fee);
    if (!feeRes.ok) {
      state.wallet = walletBefore;
      return feeRes;
    }
  }

  const trade: Trade = {
    id: uid(),
    pairId,
    side,
    price,
    amountBase,
    amountQuote: quoteGross,
    feeQuote: fee.feeQuote,
    feeHmc: fee.paidInHmc ? fee.feeHmc : 0,
    feeRole: role,
    feePaidInHmc: fee.paidInHmc,
    ts: Date.now(),
  };
  state.trades.unshift(trade);
  state.trades = state.trades.slice(0, 200);
  recordTradeLedger(state, m, pairId, side, amountBase, quoteGross, fee, kind);

  // Cap keeps length flat at 200 — verify by id, not length delta.
  // Rollback must restore snapshots (unshift + slice(0, n) is not reversible via slice(n)).
  if (state.trades[0]?.id !== trade.id) {
    state.wallet = walletBefore;
    state.trades = tradesSnapshot;
    state.ledger = ledgerSnapshot;
    return { ok: false, reason: "Trade rollback — inconsistent state" };
  }

  return { ok: true, fee, avgPrice: price, quote: quoteGross };
}
