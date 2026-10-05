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

/**
 * Expand 24h high/low so live last never sits above High / below Low
 * (sanitize on 15m can crush pump wicks that still paint on 1m/30s).
 */
export function enrichQuoteExtremes(
  q: PairQuote,
  candlesByTf?: Partial<Record<Timeframe, Candle[]>>,
  liveMid = 0,
): PairQuote {
  let high = q.high24h;
  let low = q.low24h;
  const tipCandidates: number[] = [];
  if (liveMid > 0) tipCandidates.push(liveMid);
  for (const tf of ["1m", "30s", "15m", "5m"] as Timeframe[]) {
    const series = candlesByTf?.[tf];
    const tip = series?.[series.length - 1];
    if (!tip) continue;
    tipCandidates.push(tip.high, tip.low, tip.close, tip.open);
  }
  for (const px of tipCandidates) {
    if (!(px > 0) || !Number.isFinite(px)) continue;
    if (!(high > 0) || px > high) high = px;
    if (!(low > 0) || px < low) low = px;
  }
  return { ...q, high24h: high, low24h: low > 0 ? low : q.low24h };
}

/** Sum 1m (or fallback TF) volume over ~24h — better than a thin public-tape buffer. */
export function candleVol24h(
  candlesByTf?: Partial<Record<Timeframe, Candle[]>>,
  preferTf: Timeframe = "1m",
): number {
  const series =
    (candlesByTf?.[preferTf]?.length ? candlesByTf[preferTf] : null) ??
    candlesByTf?.["15m"] ??
    candlesByTf?.["5m"] ??
    [];
  if (!series.length) return 0;
  const sec = preferTf === "15m" ? 900 : preferTf === "5m" ? 300 : 60;
  const bars24 = Math.min(series.length, Math.max(2, Math.ceil(86_400 / sec)));
  let vol = 0;
  for (const c of series.slice(-bars24)) vol += Math.max(0, c.volume || 0);
  return vol;
}

export function pairQuoteFromMid(
  mid: number,
  candlesByTf?: Partial<Record<Timeframe, Candle[]>>,
  fallbackTf?: Timeframe,
): PairQuote {
  const c15 = candlesFor24h(candlesByTf, fallbackTf);
  const s24 = stats24h(c15, "15m");
  const base: PairQuote = {
    mid,
    changePct: s24.changePct,
    tone: pctTone(s24.changePct),
    high24h: s24.high,
    low24h: s24.low,
    vol24h: s24.vol,
    refOpen: s24.refOpen,
    refClose: s24.refClose,
  };
  return enrichQuoteExtremes(base, candlesByTf, mid);
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
