import type { BookLevel, Ticker } from "./types";

export type BookOpts = {
  /** Phase shifts size waves so the ladder feels alive between polls. */
  phase?: number;
};

export function buildOrderBook(
  ticker: Ticker,
  levels = 14,
  opts: BookOpts = {},
): { bids: BookLevel[]; asks: BookLevel[] } {
  const mid = ticker.mid;
  if (!Number.isFinite(mid) || mid <= 0) return { bids: [], asks: [] };
  const bid0 = Number.isFinite(ticker.bid) && ticker.bid > 0 ? ticker.bid : mid * 0.999;
  const ask0 = Number.isFinite(ticker.ask) && ticker.ask > 0 ? ticker.ask : mid * 1.001;
  const step = mid * 0.0011;
  const phase = opts.phase ?? 0;
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];
  for (let i = 0; i < levels; i++) {
    const bidPrice = bid0 - step * i;
    const askPrice = ask0 + step * i;
    if (bidPrice <= 0 || askPrice <= 0) continue;
    const wave = 1 + Math.sin(i * 1.6 + mid * 8000 + phase) * 0.32;
    const wobble = 1 + Math.sin(phase * 1.7 + i * 0.9) * 0.08;
    const bidAmt = (600 + i * 380) * wave * wobble;
    const askAmt = (580 + i * 360) * wave * (2 - wobble);
    bids.push({ price: bidPrice, amountBase: bidAmt, totalQuote: bidPrice * bidAmt });
    asks.push({ price: askPrice, amountBase: askAmt, totalQuote: askPrice * askAmt });
  }
  return { bids, asks };
}

/**
 * Merge ladder rows onto a price grid (Group select).
 * Bids round down toward mid; asks round up — avoids collapsing across the spread.
 */
export function aggregateBookLevels(
  levels: BookLevel[],
  step: number,
  side: "bid" | "ask",
): BookLevel[] {
  if (!(step > 0) || !levels.length) return levels;
  const buckets = new Map<number, { price: number; amountBase: number }>();
  for (const l of levels) {
    if (!Number.isFinite(l.price) || !Number.isFinite(l.amountBase) || l.amountBase <= 0) continue;
    const raw = side === "bid" ? Math.floor(l.price / step) * step : Math.ceil(l.price / step) * step;
    const price = Number(raw.toPrecision(14));
    if (!(price > 0)) continue;
    const prev = buckets.get(price);
    if (prev) prev.amountBase += l.amountBase;
    else buckets.set(price, { price, amountBase: l.amountBase });
  }
  const out = [...buckets.values()].map((b) => ({
    price: b.price,
    amountBase: b.amountBase,
    totalQuote: b.price * b.amountBase,
  }));
  out.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return out;
}

export function matchMarket(
  ticker: Ticker,
  side: "buy" | "sell",
  amountBase: number,
  bookOverride?: { bids: BookLevel[]; asks: BookLevel[] } | null,
): { avgPrice: number; quote: number; slippageBps: number } {
  if (!Number.isFinite(amountBase) || amountBase <= 0) {
    return { avgPrice: Number.isFinite(ticker.mid) ? ticker.mid : 0, quote: 0, slippageBps: 0 };
  }
  if (!Number.isFinite(ticker.mid) || ticker.mid <= 0) {
    return { avgPrice: 0, quote: 0, slippageBps: 0 };
  }
  const { bids, asks } = bookOverride ?? buildOrderBook(ticker, 18);
  const book = side === "buy" ? asks : bids;
  let left = amountBase;
  let quote = 0;
  for (const lvl of book) {
    if (left <= 0) break;
    const take = Math.min(left, lvl.amountBase);
    quote += take * lvl.price;
    left -= take;
  }
  if (left > 0) {
    const last = book[book.length - 1]?.price ?? ticker.mid;
    quote += left * last * (side === "buy" ? 1.002 : 0.998);
  }
  const avg = quote / amountBase;
  const slippageBps = ((avg - ticker.mid) / ticker.mid) * 10_000 * (side === "buy" ? 1 : -1);
  return {
    avgPrice: Number.isFinite(avg) ? avg : ticker.mid,
    quote: Number.isFinite(quote) ? quote : 0,
    slippageBps: Number.isFinite(slippageBps) ? slippageBps : 0,
  };
}
