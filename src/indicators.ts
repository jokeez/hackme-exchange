import type { Candle } from "./types";

export type LinePoint = { time: number; value: number };

export function sma(candles: Candle[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - j].close;
    out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

export function ema(candles: Candle[], period: number): LinePoint[] {
  // TradingView-style: seed with SMA(period), then EMA. Avoids first-bar bias.
  if (period < 1 || candles.length < period) return [];
  const out: LinePoint[] = [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let prev = sum / period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

export function bollinger(candles: Candle[], period = 20, mult = 2): { mid: LinePoint[]; upper: LinePoint[]; lower: LinePoint[] } {
  const mid: LinePoint[] = [];
  const upper: LinePoint[] = [];
  const lower: LinePoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - j].close;
    const m = sum / period;
    let varSum = 0;
    for (let j = 0; j < period; j++) varSum += (candles[i - j].close - m) ** 2;
    const sd = Math.sqrt(varSum / period);
    const t = candles[i].time;
    mid.push({ time: t, value: m });
    upper.push({ time: t, value: m + mult * sd });
    lower.push({ time: t, value: m - mult * sd });
  }
  return { mid, upper, lower };
}

export function vwap(candles: Candle[]): LinePoint[] {
  let cumVol = 0;
  let cumPv = 0;
  return candles.map((c) => {
    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumPv += tp * c.volume;
    return { time: c.time, value: cumVol > 0 ? cumPv / cumVol : tp };
  });
}

export function rsi(candles: Candle[], period = 14): LinePoint[] {
  const out: LinePoint[] = [];
  if (candles.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9): { macd: LinePoint[]; signal: LinePoint[]; hist: LinePoint[] } {
  const emaFast = emaFull(candles, fast);
  const emaSlow = emaFull(candles, slow);
  const macdLine: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    macdLine.push({ time: candles[i].time, value: emaFast[i] - emaSlow[i] });
  }
  const signalLine: LinePoint[] = [];
  const sigArr = emaFromPoints(macdLine, signal);
  for (let i = 0; i < macdLine.length; i++) {
    signalLine.push({ time: macdLine[i].time, value: sigArr[i] ?? 0 });
  }
  const hist: LinePoint[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    const sig = signalLine[i]?.value ?? 0;
    hist.push({ time: macdLine[i].time, value: macdLine[i].value - sig });
  }
  return { macd: macdLine, signal: signalLine, hist };
}

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: LinePoint[]; d: LinePoint[] } {
  const k: LinePoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < kPeriod; j++) {
      lo = Math.min(lo, candles[i - j].low);
      hi = Math.max(hi, candles[i - j].high);
    }
    const kv = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
    k.push({ time: candles[i].time, value: kv });
  }
  const d: LinePoint[] = [];
  for (let i = dPeriod - 1; i < k.length; i++) {
    let sum = 0;
    for (let j = 0; j < dPeriod; j++) sum += k[i - j].value;
    d.push({ time: k[i].time, value: sum / dPeriod });
  }
  return { k, d };
}

function emaFull(candles: Candle[], period: number): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  if (!candles.length) return out;
  if (candles.length < period) {
    // Degenerate: fall back to recursive from first close (short series).
    const k = 2 / (period + 1);
    let prev = candles[0].close;
    for (let i = 0; i < candles.length; i++) {
      prev = i === 0 ? candles[i].close : candles[i].close * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let prev = sum / period;
  for (let i = 0; i < period - 1; i++) out[i] = candles[i].close; // unused by MACD until slow period
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function emaFromPoints(points: LinePoint[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = points[0]?.value ?? 0;
  for (let i = 0; i < points.length; i++) {
    prev = i === 0 ? points[i].value : points[i].value * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function toHeikin(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevHaClose = candles[0]?.close ?? 0;
  for (const c of candles) {
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = out.length ? (out[out.length - 1].open + prevHaClose) / 2 : (c.open + c.close) / 2;
    out.push({
      time: c.time,
      open: haOpen,
      high: Math.max(c.high, haOpen, haClose),
      low: Math.min(c.low, haOpen, haClose),
      close: haClose,
      volume: c.volume,
    });
    prevHaClose = haClose;
  }
  return out;
}
