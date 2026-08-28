import { stats24h } from "./candles";
import { pctTone } from "./format";
import type { Candle, PairId, Timeframe } from "./types";

export type PairQuote = {
  mid: number;
  changePct: number;
  tone: ReturnType<typeof pctTone>;
  high24h: number;
  low24h: number;
  vol24h: number;
  /** 24h reference open — same window as changePct. */
  refOpen: number;
  refClose: number;
};

/** Pick 15m series for 24h stats; fall back to active TF only when 15m is missing. */
export function candlesFor24h(
  candlesByTf?: Partial<Record<Timeframe, Candle[]>>,
  fallbackTf?: Timeframe,
): Candle[] {
  const c15 = candlesByTf?.["15m"];
  if (c15 && c15.length >= 2) return c15;
  if (fallbackTf && candlesByTf?.[fallbackTf]?.length) return candlesByTf[fallbackTf]!;
  return c15 ?? [];
}

export function pairQuoteFromMid(
  mid: number,
  candlesByTf?: Partial<Record<Timeframe, Candle[]>>,
  fallbackTf?: Timeframe,
): PairQuote {
  const c15 = candlesFor24h(candlesByTf, fallbackTf);
  const s24 = stats24h(c15, "15m");
  return {
    mid,
    changePct: s24.changePct,
    tone: pctTone(s24.changePct),
    high24h: s24.high,
    low24h: s24.low,
    vol24h: s24.vol,
    refOpen: s24.refOpen,
    refClose: s24.refClose,
  };
}

export function quoteToneClass(tone: PairQuote["tone"]): string {
  return tone;
}

export type PairQuoteInputs = {
  pairId: PairId;
  mid: number;
  candlesByTf?: Partial<Record<Timeframe, Candle[]>>;
  fallbackTf?: Timeframe;
};

export function buildPairQuote(opts: PairQuoteInputs): PairQuote {
  return pairQuoteFromMid(opts.mid, opts.candlesByTf, opts.fallbackTf);
}
