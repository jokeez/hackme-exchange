import { MAX_CANDLES } from "./candles";
import type { Candle, Timeframe } from "./types";

/** Desk TF → GET /candles interval. Live desk has no sub-minute server series. */
export const LIVE_TF_INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "2H": "2h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

export function liveTf(tf: Timeframe): Timeframe {
  return LIVE_TF_INTERVAL[tf] ? tf : "1m";
}

/** Server bars win for every time they cover; older (paged-in) bars are kept. */
export function mergeServerBars(prev: Candle[], next: Candle[], cap = MAX_CANDLES): Candle[] {
  if (!next.length) return prev;
  if (!prev.length) return next.length > cap ? next.slice(-cap) : next;
  const first = next[0]!.time;
  const out = prev.filter((c) => c.time < first).concat(next);
  return out.length > cap ? out.slice(-cap) : out;
}
