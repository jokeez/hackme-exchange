import type { DemoState, LedgerEntry, MarketSnapshot, OrderKind, PairId } from "./types";
import type { FeeQuote } from "./fees";
import { formatBps } from "./fees";
import { uid } from "./id";
import { pairById } from "./pairs";
import { midForPair } from "./market";
import { orderTypeLabel } from "./orders";

export function appendLedger(
  state: DemoState,
  entry: Omit<LedgerEntry, "id">,
): void {
  state.ledger.unshift({ ...entry, id: uid() });
  state.ledger = state.ledger.slice(0, 300);
}

export function recordTradeLedger(
  state: DemoState,
  m: MarketSnapshot,
  pairId: PairId,
  side: "buy" | "sell",
  amountBase: number,
  amountQuote: number,
  fee: FeeQuote,
  kind: OrderKind,
  labFillId?: string,
): void {
  const pair = pairById(pairId);
  const ts = Date.now();
  const labTag = labFillId ? ` · lab:${labFillId}` : "";
  appendLedger(state, {
    kind: "trade",
    asset: pair.base,
    amount: side === "buy" ? amountBase : -amountBase,
    usdtValue: amountBase * midForPair(m, pairId),
    note: `${side.toUpperCase()} ${orderTypeLabel(kind)} · ${pair.label}${labTag}`,
    ts,
    pairId,
  });
  if (fee.feeQuote > 0 || fee.feeHmc > 0) {
    const asset = fee.paidInHmc ? "HMC" : pair.quote;
    appendLedger(state, {
      kind: "fee",
      asset,
      amount: fee.paidInHmc ? -fee.feeHmc : -fee.feeQuote,
      usdtValue: -fee.feeQuote,
      note: `${fee.role.toUpperCase()} fee ${formatBps(fee.bps)}${fee.paidInHmc ? ` (HMC −${fee.hmcDiscountPct}%)` : ""} · ${fee.vipName}${labTag}`,
      ts,
      pairId,
    });
  }
}

export function recordDeposit(state: DemoState, asset: keyof DemoState["wallet"], amount: number, m: MarketSnapshot): void {
  const price =
    asset === "usdt" ? 1 : asset === "hmc" ? m.hmcUsdt : asset === "sup" ? m.supUsdt : m.btcUsd;
  state.wallet[asset] += amount;
  appendLedger(state, {
    kind: "deposit",
    asset: asset.toUpperCase(),
    amount,
    usdtValue: amount * price,
    note: `Demo deposit ${asset.toUpperCase()}`,
    ts: Date.now(),
  });
}

export function recordWithdrawal(state: DemoState, asset: keyof DemoState["wallet"], amount: number, m: MarketSnapshot): boolean {
  if (state.wallet[asset] < amount) return false;
  const price =
    asset === "usdt" ? 1 : asset === "hmc" ? m.hmcUsdt : asset === "sup" ? m.supUsdt : m.btcUsd;
  state.wallet[asset] -= amount;
  appendLedger(state, {
    kind: "withdrawal",
    asset: asset.toUpperCase(),
    amount: -amount,
    usdtValue: -amount * price,
    note: `Demo withdrawal ${asset.toUpperCase()}`,
    ts: Date.now(),
  });
  return true;
}

export function recordConvert(
  state: DemoState,
  from: string,
  to: string,
  fromAmt: number,
  toAmt: number,
  m: MarketSnapshot,
  fee?: FeeQuote | null,
  pairId?: PairId,
): void {
  const ts = Date.now();
  const fromPrice =
    from === "USDT" ? 1 : from === "HMC" ? m.hmcUsdt : from === "SUP" ? m.supUsdt : m.btcUsd;
  appendLedger(state, {
    kind: "convert",
    asset: from,
    amount: -fromAmt,
    usdtValue: -fromAmt * fromPrice,
    note: `Convert ${from} → ${to}`,
    ts,
    pairId,
  });
  const toPrice = to === "USDT" ? 1 : to === "HMC" ? m.hmcUsdt : to === "SUP" ? m.supUsdt : m.btcUsd;
  appendLedger(state, {
    kind: "convert",
    asset: to,
    amount: toAmt,
    usdtValue: toAmt * toPrice,
    note: `Convert ${from} → ${to}`,
    ts,
    pairId,
  });
  if (fee && fee.feeQuote > 0) {
    const feeAsset = fee.paidInHmc ? "HMC" : pairId ? pairById(pairId).quote : to === "USDT" || from === "USDT" ? "USDT" : to;
    appendLedger(state, {
      kind: "fee",
      asset: feeAsset,
      amount: fee.paidInHmc ? -fee.feeHmc : -fee.feeQuote,
      usdtValue: -fee.feeQuote,
      note: `CONVERT TAKER fee ${formatBps(fee.bps)}${fee.paidInHmc ? ` (HMC −${fee.hmcDiscountPct}%)` : ""} · ${fee.vipName}`,
      ts,
      pairId,
    });
  }
}
