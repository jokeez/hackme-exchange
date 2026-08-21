import { matchMarket } from "./book";
import { assertOrderFunds } from "./balance";
import { executeFill } from "./execution";
import type {
  DemoState,
  MarketSnapshot,
  Order,
  OrderKind,
  OrderSide,
  PairId,
  Ticker,
  TimeInForce,
} from "./types";
import { uid } from "./id";
import { midForPair } from "./market";

export function isMarketableLimit(side: OrderSide, price: number, mid: number): boolean {
  return side === "buy" ? price >= mid : price <= mid;
}

export function validateLimitOrder(
  side: OrderSide,
  price: number,
  mid: number,
  tif: TimeInForce,
  postOnly: boolean,
): { ok: true; immediate: boolean } | { ok: false; reason: string } {
  const immediate = isMarketableLimit(side, price, mid);
  if (postOnly && immediate) return { ok: false, reason: "Post-only would cross the market (maker only)" };
  if (tif === "FOK" && !immediate) return { ok: false, reason: "FOK: cannot fill immediately in full" };
  if (tif === "IOC" && !immediate) return { ok: false, reason: "IOC: no immediate fill — cancelled" };
  return { ok: true, immediate };
}

export function placeOrder(
  state: DemoState,
  pairId: PairId,
  side: OrderSide,
  kind: OrderKind,
  amountBase: number,
  price: number,
  stopPrice?: number,
  trailPct?: number,
  timeInForce: TimeInForce = "GTC",
  postOnly = false,
  m?: MarketSnapshot,
): Order | { ok: false; reason: string } {
  if ((kind === "limit" || kind === "stop_limit") && m) {
    const mid = midForPair(m, pairId);
    if (mid > 0) {
      const check = validateLimitOrder(side, price, mid, timeInForce, postOnly);
      if (!check.ok) return check;
      // Marketable GTC limit must take liquidity — never rest as maker (fee undercharge).
      if (kind === "limit" && check.immediate && timeInForce === "GTC" && !postOnly) {
        const funds = assertOrderFunds(state, m, pairId, side, amountBase, price, kind, true);
        if (!funds.ok) return funds;
        const quoteGross = price * amountBase;
        const fill = executeFill(state, m, pairId, side, price, amountBase, quoteGross, "limit", false, true);
        if (!fill.ok) return fill;
        const order: Order = {
          id: uid(),
          pairId,
          side,
          kind,
          price,
          amountBase,
          filledBase: amountBase,
          status: "filled",
          timeInForce,
          postOnly,
          source: "paper",
          createdAt: Date.now(),
        };
        state.orders.unshift(order);
        state.orders = state.orders.slice(0, 80);
        return order;
      }
    }
  }
  if (m && (kind === "limit" || kind === "stop_limit" || kind === "stop_market" || kind === "oco" || kind === "trailing_stop")) {
    const funds = assertOrderFunds(state, m, pairId, side, amountBase, price, kind);
    if (!funds.ok) return funds;
  }
  const order: Order = {
    id: uid(),
    pairId,
    side,
    kind,
    price,
    stopPrice,
    trailPct,
    trailAnchor: undefined,
    amountBase,
    filledBase: 0,
    status: "open",
    timeInForce,
    postOnly,
    source: "paper",
    createdAt: Date.now(),
  };
  state.orders.unshift(order);
  state.orders = state.orders.slice(0, 80);
  return order;
}

export function placeOco(
  state: DemoState,
  pairId: PairId,
  side: OrderSide,
  amountBase: number,
  tpPrice: number,
  slStop: number,
  slLimit: number,
  m?: MarketSnapshot,
): { tp: Order; sl: Order } | { ok: false; reason: string } {
  if (m) {
    const tpFunds = assertOrderFunds(state, m, pairId, side, amountBase, tpPrice, "oco");
    if (!tpFunds.ok) return tpFunds;
    // Buy OCO: SL limit may need more quote than TP — require free balance for the pricier leg.
    const slFunds = assertOrderFunds(state, m, pairId, side, amountBase, slLimit, "oco");
    if (!slFunds.ok) return slFunds;
  }
  const gid = uid();
  const tp: Order = {
    id: uid(),
    pairId,
    side,
    kind: "oco",
    price: tpPrice,
    amountBase,
    filledBase: 0,
    status: "open",
    ocoGroupId: gid,
    ocoRole: "tp",
    source: "paper",
    createdAt: Date.now(),
  };
  const sl: Order = {
    id: uid(),
    pairId,
    side,
    kind: "oco",
    price: slLimit,
    stopPrice: slStop,
    amountBase,
    filledBase: 0,
    status: "open",
    ocoGroupId: gid,
    ocoRole: "sl",
    source: "paper",
    createdAt: Date.now(),
  };
  state.orders.unshift(tp, sl);
  return { tp, sl };
}

export function cancelOcoGroup(state: DemoState, groupId: string): void {
  for (const o of state.orders) {
    if (o.ocoGroupId === groupId && (o.status === "open" || o.status === "triggered")) o.status = "cancelled";
  }
}

function fillOrder(
  state: DemoState,
  m: MarketSnapshot,
  order: Order,
  fillPrice: number,
  triggered: boolean,
  immediateFill = false,
): boolean {
  const quote = fillPrice * order.amountBase;
  const res = executeFill(
    state,
    m,
    order.pairId,
    order.side,
    fillPrice,
    order.amountBase,
    quote,
    order.kind,
    triggered,
    immediateFill,
  );
  if (!res.ok) {
    order.status = "cancelled";
    return false;
  }
  order.status = "filled";
  order.filledBase = order.amountBase;
  if (order.ocoGroupId) cancelOcoGroup(state, order.ocoGroupId);
  return true;
}

function limitShouldFill(order: Order, mid: number): boolean {
  if (order.kind === "limit" || order.kind === "oco") {
    return order.side === "buy" ? mid <= order.price : mid >= order.price;
  }
  return false;
}

function stopTriggered(order: Order, mid: number): boolean {
  if (order.kind === "stop_limit" || order.kind === "stop_market" || (order.kind === "oco" && order.ocoRole === "sl")) {
    const stop = order.stopPrice ?? order.price;
    return order.side === "buy" ? mid >= stop : mid <= stop;
  }
  if (order.kind === "trailing_stop" && order.trailPct && order.trailAnchor) {
    return order.side === "sell"
      ? mid <= order.trailAnchor * (1 - order.trailPct / 100)
      : mid >= order.trailAnchor * (1 + order.trailPct / 100);
  }
  return false;
}

export function processOpenOrders(state: DemoState, m: MarketSnapshot, tickers: Record<PairId, Ticker>): string[] {
  const notes: string[] = [];
  for (const order of state.orders.filter((o) => o.status === "open" || o.status === "triggered")) {
    const tk = tickers[order.pairId];
    const mid = tk?.mid && tk.mid > 0 ? tk.mid : midForPair(m, order.pairId);

    if (order.kind === "trailing_stop" && order.trailPct) {
      if (order.side === "sell") order.trailAnchor = Math.max(order.trailAnchor ?? mid, mid);
      else order.trailAnchor = Math.min(order.trailAnchor ?? mid, mid);
    }

    if (order.kind === "stop_limit" && order.status === "open" && stopTriggered(order, mid)) {
      order.status = "triggered";
      notes.push(`Stop-limit triggered ${order.id.slice(0, 6)}`);
    }

    if (order.kind === "stop_market" && order.status === "open" && stopTriggered(order, mid)) {
      order.status = "triggered";
      notes.push(`Stop-market triggered ${order.id.slice(0, 6)}`);
    }

    if (order.kind === "oco" && order.ocoRole === "sl" && order.status === "open" && stopTriggered(order, mid)) {
      order.status = "triggered";
    }

    if (order.kind === "trailing_stop" && order.status === "open" && stopTriggered(order, mid)) {
      order.status = "triggered";
      notes.push(`Trailing stop hit ${order.id.slice(0, 6)}`);
    }

    const readyLimit =
      order.kind === "limit" ||
      (order.kind === "oco" && order.ocoRole === "tp") ||
      (order.kind === "oco" && order.ocoRole === "sl" && order.status === "triggered") ||
      (order.status === "triggered" && order.kind === "stop_limit");

    if (readyLimit && limitShouldFill(order, mid)) {
      // Resting book hits are always maker. Placement-time crosses already
      // execute via executeFill(..., immediateFill=true) in the UI path —
      // never re-classify by mid at fill time (that would make every maker a taker).
      const triggered = order.status === "triggered";
      if (fillOrder(state, m, order, order.price, triggered, false)) {
        notes.push(`Filled ${order.kind} ${order.side}`);
      }
    }

    if ((order.kind === "trailing_stop" || order.kind === "stop_market") && order.status === "triggered") {
      const bookTk = tk ?? tickerStub(order.pairId, mid);
      const mm = matchMarket(bookTk, order.side, order.amountBase);
      if (fillOrder(state, m, order, mm.avgPrice, true)) notes.push(`${order.kind} filled`);
    }
  }
  return notes;
}

function tickerStub(pairId: PairId, mid: number): Ticker {
  return {
    pairId,
    mid,
    bid: mid * 0.9995,
    ask: mid * 1.0005,
    spreadBps: 10,
    change24hPct: 0,
    high24h: mid,
    low24h: mid,
    volume24hBase: 0,
    volume24hQuote: 0,
    source: "fallback",
    fetchedAt: Date.now(),
  };
}

export function orderTypeLabel(kind: OrderKind, o?: Order): string {
  if (kind === "oco" && o?.ocoRole) return o.ocoRole === "tp" ? "OCO TP" : "OCO SL";
  switch (kind) {
    case "market":
      return "Market";
    case "limit":
      return "Limit";
    case "stop_limit":
      return "Stop-Limit";
    case "stop_market":
      return "Stop-Market";
    case "trailing_stop":
      return "Trail Stop";
    case "oco":
      return "OCO";
  }
}
