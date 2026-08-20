import type { OrderSide, PairId, Ticker, Trade } from "./types";

/** Public market-print row (synthetic + user fills share the tape UI). */
export type TapePrint = {
  id: string;
  pairId: PairId;
  side: OrderSide;
  price: number;
  amountBase: number;
  feeRole: "maker" | "taker";
  ts: number;
  synthetic: boolean;
};

function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function seedPublicTape(pairId: PairId, ticker: Ticker, count = 22, now = Date.now()): TapePrint[] {
  const out: TapePrint[] = [];
  for (let i = 0; i < count; i++) {
    const r = rnd(now * 0.001 + i * 17 + ticker.mid * 1e6);
    const side: OrderSide = r > 0.48 ? "buy" : "sell";
    const slip = (r - 0.5) * ticker.mid * 0.0022;
    const price = Math.max(ticker.mid * 0.98, ticker.mid + slip);
    const amountBase = 40 + r * 920 + (i % 5) * 35;
    out.push({
      id: `syn-${pairId}-${now}-${i}`,
      pairId,
      side,
      price,
      amountBase,
      feeRole: r > 0.62 ? "taker" : "maker",
      ts: now - (count - i) * (900 + Math.floor(r * 2400)),
      synthetic: true,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export function appendSyntheticTrade(
  tape: TapePrint[],
  ticker: Ticker,
  now = Date.now(),
  maxKeep = 48,
): TapePrint[] {
  // Deterministic given (pair, mid, now, prior length) — no Math.random across devices.
  const r = rnd(now * 0.001 + ticker.mid * 1e6 + tape.length * 31);
  const side: OrderSide = r > 0.5 ? "buy" : "sell";
  const slip = (r - 0.5) * ticker.mid * 0.0018;
  const print: TapePrint = {
    id: `syn-${ticker.pairId}-${now}-${Math.floor(r * 1e9)}`,
    pairId: ticker.pairId,
    side,
    price: Math.max(1e-12, ticker.mid + slip),
    amountBase: 25 + r * 1100,
    feeRole: r > 0.55 ? "taker" : "maker",
    ts: now,
    synthetic: true,
  };
  return [print, ...tape].slice(0, maxKeep);
}

export function tradeToPrint(t: Trade): TapePrint {
  return {
    id: t.id,
    pairId: t.pairId,
    side: t.side,
    price: t.price,
    amountBase: t.amountBase,
    feeRole: t.feeRole,
    ts: t.ts,
    synthetic: false,
  };
}

/** Merge user fills + public tape for a pair (newest first). */
export function mergeTapeRows(
  userTrades: Trade[],
  publicTape: TapePrint[],
  pairId: PairId,
  limit = 18,
): TapePrint[] {
  const user = userTrades.filter((t) => t.pairId === pairId).map(tradeToPrint);
  const pub = publicTape.filter((t) => t.pairId === pairId);
  return [...user, ...pub].sort((a, b) => b.ts - a.ts).slice(0, limit);
}
