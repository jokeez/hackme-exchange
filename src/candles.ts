import type { Candle, PairId, Timeframe } from "./types";
import { TF_SEC } from "./types";
import { clampTickMid, clipBarWicks, sanitizeCandleExtremes } from "./chartScale";

/** Soft cap — allows deep left-pan without unbounded growth. */
export const MAX_CANDLES = 5000;

/**
 * HackMe / HMC public listing era — MiningPoolStats + ops notes point to May 2026;
 * operator recalled launch ≈ 18 May. Chart history must not invent bars before this.
 */
export const CHART_GENESIS_ISO = "2026-05-18T00:00:00.000Z";
export const CHART_GENESIS_UNIX = Math.floor(Date.parse(CHART_GENESIS_ISO) / 1000);

function bucket(tsMs: number, tf: Timeframe): number {
  const sec = TF_SEC[tf];
  return Math.floor(tsMs / 1000 / sec) * sec;
}

/** First candle open time for TF at or after genesis (never before listing). */
export function genesisBucket(tf: Timeframe, nowSec = Math.floor(Date.now() / 1000)): number {
  const sec = TF_SEC[tf];
  const raw = Math.floor(CHART_GENESIS_UNIX / sec) * sec;
  const g = raw < CHART_GENESIS_UNIX ? raw + sec : raw;
  const nowB = Math.floor(nowSec / sec) * sec;
  return Math.min(g, nowB);
}

/** Max bars from genesis → now for this TF. */
export function maxBarsSinceGenesis(tf: Timeframe, nowMs = Date.now()): number {
  const sec = TF_SEC[tf];
  const nowB = bucket(nowMs, tf);
  const g = genesisBucket(tf, Math.floor(nowMs / 1000));
  if (nowB < g) return 1;
  return Math.floor((nowB - g) / sec) + 1;
}

/** Bars per TF — capped by real history since genesis (no fake Nov/Dec 2025). */
export function barCountForTf(tf: Timeframe, nowMs = Date.now()): number {
  let want: number;
  switch (tf) {
    case "30s":
      want = 1200;
      break;
    case "1m":
      want = 1440;
      break;
    case "3m":
      want = 960;
      break;
    case "5m":
      want = 864;
      break;
    case "15m":
      want = 960;
      break;
    case "1H":
      want = 720;
      break;
    case "2H":
      want = 420;
      break;
    case "4H":
      want = 360;
      break;
    case "1D":
      want = 365;
      break;
    case "1W":
      want = 156;
      break;
    default:
      want = 720;
  }
  return Math.min(want, maxBarsSinceGenesis(tf, nowMs), MAX_CANDLES);
}

function candleVolume(pairId: PairId, tf: Timeframe): number {
  const tfScale = Math.sqrt(TF_SEC[tf] / 60);
  const base =
    pairId === "HMC_USDT" || pairId === "HMC_SUP" || pairId === "HMC_BTC"
      ? 4000 + Math.random() * 80_000
      : 1500 + Math.random() * 25_000;
  return base * tfScale;
}

/** Micro-wick so candles are visible (fixes flat dot / circle look). */
function wickSpread(mid: number, pairId: PairId): { high: number; low: number } {
  const bps = pairId.includes("BTC") ? 12 : pairId === "SUP_USDT" ? 10 : 8;
  const half = (bps / 10_000) * mid;
  return {
    high: mid + half * (0.55 + Math.random() * 0.7),
    // Never allow a 50% dump wick — that alone squashes the Y-axis.
    low: Math.max(mid * 0.985, mid - half * (0.55 + Math.random() * 0.7)),
  };
}

function makeBar(pairId: PairId, t: number, open: number, close: number): Candle {
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);
  const wick = wickSpread((open + close) / 2, pairId);
  return {
    time: t,
    open,
    high: Math.max(bodyHigh, wick.high),
    low: Math.min(bodyLow, wick.low),
    close,
    volume: candleVolume(pairId, "1m"),
  };
}

export function seedCandles(pairId: PairId, tf: Timeframe, mid: number, count?: number): Candle[] {
  const sec = TF_SEC[tf];
  const now = bucket(Date.now(), tf);
  const genesis = genesisBucket(tf);
  const maxN = Math.max(1, Math.floor((now - genesis) / sec) + 1);
  const n = Math.min(count ?? barCountForTf(tf), maxN, MAX_CANDLES);
  const out: Candle[] = [];
  let price = mid * (0.992 + Math.random() * 0.016);
  const volScale = Math.max(mid, 1e-12);

  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * sec;
    if (t < genesis) continue;
    const driftBps = (Math.random() - 0.48) * 28;
    const open = price;
    const close = Math.max(volScale * 0.85, Math.min(volScale * 1.15, open * (1 + driftBps / 10_000)));
    const bar = makeBar(pairId, t, open, close);
    bar.volume = candleVolume(pairId, tf);
    out.push(bar);
    price = close;
  }
  if (out.length) {
    const last = out[out.length - 1];
    const w = wickSpread(mid, pairId);
    last.close = mid;
    last.high = Math.max(last.high, w.high, mid);
    last.low = Math.min(last.low, w.low, mid);
  }
  return out;
}

/** Grow history to the left — never before CHART_GENESIS_UNIX. */
export function prependOlderCandles(
  existing: Candle[],
  pairId: PairId,
  tf: Timeframe,
  count: number,
): Candle[] {
  if (count <= 0) return existing;
  if (!existing.length) {
    const seedMid =
      pairId === "HMC_USDT"
        ? 0.00043
        : pairId === "SUP_USDT"
          ? 0.000047
          : pairId === "HMC_SUP"
            ? 9.1
            : pairId.endsWith("_BTC")
              ? 6.4e-9
              : 0.00043;
    return seedCandles(pairId, tf, seedMid, Math.min(count, MAX_CANDLES));
  }
  const room = MAX_CANDLES - existing.length;
  if (room <= 0) return existing;

  const sec = TF_SEC[tf];
  const genesis = genesisBucket(tf);
  const first = existing[0];
  if (first.time <= genesis) return existing;

  const maxAdd = Math.floor((first.time - genesis) / sec);
  if (maxAdd <= 0) return existing;
  const n = Math.min(count, room, maxAdd);
  if (n <= 0) return existing;

  const older: Candle[] = [];
  let price = first.open;
  for (let i = n; i >= 1; i--) {
    const t = first.time - i * sec;
    if (t < genesis) continue;
    const driftBps = (Math.random() - 0.5) * 26;
    const close = price;
    const open = Math.max(close * 0.85, Math.min(close * 1.15, close / (1 + driftBps / 10_000)));
    const bar = makeBar(pairId, t, open, close);
    bar.volume = candleVolume(pairId, tf);
    older.push(bar);
    price = open;
  }
  if (!older.length) return existing;

  // Walk forward so path lands near first.open
  let p = older[0].open;
  for (let i = 0; i < older.length; i++) {
    const driftBps = (Math.random() - 0.48) * 26;
    const open = p;
    const close =
      i === older.length - 1
        ? first.open
        : Math.max(open * 0.88, Math.min(open * 1.12, open * (1 + driftBps / 10_000)));
    older[i] = makeBar(pairId, older[i].time, open, close);
    older[i].volume = candleVolume(pairId, tf);
    p = close;
  }
  return [...older, ...existing];
}

export function upsertTick(
  candles: Candle[],
  tf: Timeframe,
  mid: number,
  pairId: PairId,
  prevMid?: number,
): Candle[] {
  const t = bucket(Date.now(), tf);
  const sec = TF_SEC[tf];
  const copy = [...candles];
  const last = copy[copy.length - 1];
  const ref = last?.close ?? (finiteMid(prevMid) ? prevMid! : mid);
  const safeMid = clampTickMid(mid, ref);
  const tickVol = 150 + Math.random() * 2200;
  const w = wickSpread(safeMid, pairId);

  if (prevMid !== undefined && last && last.time === t) {
    const step = (safeMid - clampTickMid(prevMid, ref)) * 0.45;
    const blended = last.close + step;
    last.close = safeMid;
    last.high = Math.max(last.high, w.high, safeMid, blended);
    last.low = Math.min(last.low, w.low, safeMid, blended);
    last.volume += tickVol;
    Object.assign(last, clipBarWicks(last));
    return copy.slice(-MAX_CANDLES);
  }

  if (!last || last.time < t) {
    // Fill skipped buckets (e.g. 1D offline 23→31 Jul) so the chart stays contiguous.
    if (last && last.time + sec < t) {
      const bridgePx = last.close;
      for (let bt = last.time + sec; bt < t; bt += sec) {
        copy.push(flatGapBar(bt, bridgePx));
        if (copy.length >= MAX_CANDLES) break;
      }
    }
    const open = copy[copy.length - 1]?.close ?? last?.close ?? safeMid;
    const bar = clipBarWicks({
      time: t,
      open,
      high: Math.max(open, safeMid, w.high),
      low: Math.min(open, safeMid, w.low),
      close: safeMid,
      volume: tickVol,
    });
    copy.push(bar);
    return copy.slice(-MAX_CANDLES);
  }

  if (last.time === t) {
    last.close = safeMid;
    last.high = Math.max(last.high, w.high, safeMid);
    last.low = Math.min(last.low, w.low, safeMid);
    last.volume += tickVol;
    Object.assign(last, clipBarWicks(last));
    return copy.slice(-MAX_CANDLES);
  }

  // last.time > t — clock skew / corrupt storage: drop future bars, heal, apply tick.
  const clipped = copy.filter((c) => c.time <= t);
  const healed = ensureContiguousCandles(clipped.length ? clipped : copy.slice(0, 1), tf, {
    pairId,
    fillToNow: true,
    nowMs: t * 1000,
  });
  if (!healed.length) {
    return [
      clipBarWicks({
        time: t,
        open: safeMid,
        high: Math.max(safeMid, w.high),
        low: Math.min(safeMid, w.low),
        close: safeMid,
        volume: tickVol,
      }),
    ];
  }
  const tip = healed[healed.length - 1]!;
  if (tip.time === t) {
    tip.close = safeMid;
    tip.high = Math.max(tip.high, w.high, safeMid);
    tip.low = Math.min(tip.low, w.low, safeMid);
    tip.volume += tickVol;
    Object.assign(tip, clipBarWicks(tip));
    return healed.slice(-MAX_CANDLES);
  }
  // Still behind after heal — append one live bar (gaps already filled by ensureContiguous).
  const open = tip.close;
  healed.push(
    clipBarWicks({
      time: t,
      open,
      high: Math.max(open, safeMid, w.high),
      low: Math.min(open, safeMid, w.low),
      close: safeMid,
      volume: tickVol,
    }),
  );
  return healed.slice(-MAX_CANDLES);
}

function finiteMid(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function flatGapBar(t: number, px: number): Candle {
  return { time: t, open: px, high: px, low: px, close: px, volume: 0 };
}

/**
 * Sort · dedupe buckets · fill missing TF steps · optional bridge to "now".
 * Fixes 1D chart jumps (23 → 25 → 31) after idle / corrupt localStorage.
 */
export function ensureContiguousCandles(
  candles: Candle[],
  tf: Timeframe,
  opts?: { pairId?: PairId; fillToNow?: boolean; nowMs?: number },
): Candle[] {
  if (!candles.length) return candles;
  const sec = TF_SEC[tf];
  const g = genesisBucket(tf);
  const pairId = opts?.pairId ?? "HMC_USDT";

  const byBucket = new Map<number, Candle>();
  for (const c of candles) {
    if (!c || !Number.isFinite(c.time) || c.time < g) continue;
    const b = Math.floor(c.time / sec) * sec;
    if (b < g) continue;
    const prev = byBucket.get(b);
    if (!prev) {
      byBucket.set(b, {
        time: b,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      // Merge duplicates in same bucket (abuse / double-write).
      prev.high = Math.max(prev.high, c.high, c.open, c.close);
      prev.low = Math.min(prev.low, c.low, c.open, c.close);
      prev.close = c.close;
      prev.volume += c.volume;
    }
  }

  const times = [...byBucket.keys()].sort((a, b) => a - b);
  if (!times.length) return candles.slice(-1);

  let end = times[times.length - 1];
  if (opts?.fillToNow) {
    const nowB = bucket(opts.nowMs ?? Date.now(), tf);
    if (nowB > end) end = nowB;
  }

  let start = times[0];
  const spanBars = Math.floor((end - start) / sec) + 1;
  if (spanBars > MAX_CANDLES) {
    start = end - (MAX_CANDLES - 1) * sec;
    if (start < g) start = g;
    // Align to bucket
    start = Math.floor(start / sec) * sec;
  }

  const out: Candle[] = [];
  let px =
    byBucket.get(start)?.open ??
    byBucket.get(times.find((x) => x >= start) ?? times[0])!.close;
  // Carry price from last known bar before start if we clipped the window.
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i] <= start) {
      px = byBucket.get(times[i])!.close;
      break;
    }
  }

  for (let t = start; t <= end; t += sec) {
    if (t < g) continue;
    const hit = byBucket.get(t);
    if (hit) {
      out.push(hit);
      px = hit.close;
    } else {
      out.push(flatGapBar(t, px));
    }
  }
  return sanitizeCandleVolumes(out.slice(-MAX_CANDLES), pairId);
}

/** True when every adjacent pair differs by exactly one TF step. */
export function candlesAreContiguous(candles: Candle[], tf: Timeframe): boolean {
  if (candles.length < 2) return true;
  const sec = TF_SEC[tf];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time - candles[i - 1].time !== sec) return false;
  }
  return true;
}

/** Drop synthetic bars invented before listing / genesis. */
export function trimCandlesToGenesis(candles: Candle[], tf: Timeframe): Candle[] {
  if (!candles.length) return candles;
  const g = genesisBucket(tf);
  const filtered = candles.filter((c) => c.time >= g);
  return filtered.length ? filtered : candles.slice(-1);
}

export function stats24h(candles: Candle[], tf: Timeframe = "15m"): { changePct: number; high: number; low: number; vol: number } {
  if (candles.length < 2) return { changePct: 0, high: 0, low: 0, vol: 0 };
  const bars24 = Math.min(candles.length, Math.max(2, Math.ceil(86_400 / TF_SEC[tf])));
  const slice = candles.slice(-bars24);
  const first = slice[0].open;
  const last = slice[slice.length - 1].close;
  let high = -Infinity;
  let low = Infinity;
  let vol = 0;
  for (const c of slice) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
    vol += c.volume;
  }
  return {
    changePct: first > 0 ? ((last - first) / first) * 100 : 0,
    high,
    low,
    vol,
  };
}

export function sanitizeCandleVolumes(candles: Candle[], pairId: PairId): Candle[] {
  const maxVol = pairId.startsWith("HMC") ? 500_000 : 200_000;
  return candles.map((c) => ({
    ...c,
    volume: Math.min(c.volume, maxVol),
  }));
}

/** Heal OHLC spikes after load / before chart paint (does not rewrite volumes). */
export function sanitizeCandlesForChart(candles: Candle[], pairId: PairId): Candle[] {
  return sanitizeCandleExtremes(sanitizeCandleVolumes(candles, pairId));
}
