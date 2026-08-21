import type { Candle, PairId, Timeframe } from "./types";
import { TF_SEC, TIMEFRAMES } from "./types";
import {
  clampTickMid,
  clipBarWicks,
  constrainBarToOpen,
  isPriceDiscontinuity,
  maxBodyFracForTf,
  maxJumpFracForTf,
  sanitizeCandleExtremes,
} from "./chartScale";

/** Soft cap — allows deep left-pan without unbounded growth. */
export const MAX_CANDLES = 5000;

/**
 * Finest *source* TF. Higher TFs aggregate from this series so 1m/5m/1D
 * show the same market — not independent random walks.
 * 30s is derived by splitting 1m bars (demo finer resolution).
 */
export const CANDLE_BASE_TF: Timeframe = "1m";

/**
 * HackMe / HMC public listing era — MiningPoolStats + ops notes point to May 2026;
 * operator recalled launch ≈ 18 May. Chart history must not invent bars before this.
 */
export const CHART_GENESIS_ISO = "2026-05-18T00:00:00.000Z";
export const CHART_GENESIS_UNIX = Math.floor(Date.parse(CHART_GENESIS_ISO) / 1000);

function stableHash(parts: Array<string | number>): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function stableUnit(parts: Array<string | number>): number {
  return stableHash(parts) / 0xffffffff;
}

function stableSigned(parts: Array<string | number>, center = 0.5): number {
  return stableUnit(parts) - center;
}

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
      want = 1000;
      break;
    case "3m":
      want = 800;
      break;
    case "5m":
      want = 800;
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
      ? 4000 + stableUnit([pairId, tf, "volume"]) * 80_000
      : 1500 + stableUnit([pairId, tf, "volume"]) * 25_000;
  return base * tfScale;
}

/** Micro-wick scaled to TF — capped so 1D does not look like a crash tape. */
function wickSpread(mid: number, pairId: PairId, tf: Timeframe = CANDLE_BASE_TF): { high: number; low: number } {
  const bpsBase = pairId.includes("BTC") ? 10 : pairId === "SUP_USDT" ? 8 : 6;
  // Cap TF scale (~1H equivalent) — daily bars stay calm around reference mid.
  const bps = bpsBase * Math.min(Math.sqrt(TF_SEC[tf] / 60), 8);
  const half = (bps / 10_000) * mid;
  const bodyCap = maxBodyFracForTf(tf);
  const hiSeed = stableUnit([pairId, tf, mid.toPrecision(12), "wick-high"]);
  const loSeed = stableUnit([pairId, tf, mid.toPrecision(12), "wick-low"]);
  return {
    high: Math.min(mid * (1 + bodyCap), mid + half * (0.55 + hiSeed * 0.7)),
    low: Math.max(mid * (1 - bodyCap), mid - half * (0.55 + loSeed * 0.7)),
  };
}

function makeBar(pairId: PairId, t: number, open: number, close: number, tf: Timeframe): Candle {
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);
  const wick = wickSpread((open + close) / 2, pairId, tf);
  return constrainBarToOpen(
    {
      time: t,
      open,
      high: Math.max(bodyHigh, wick.high),
      low: Math.min(bodyLow, wick.low),
      close,
      volume: candleVolume(pairId, tf),
    },
    maxBodyFracForTf(tf),
  );
}

/**
 * Aggregate finer candles into a coarser TF (exchange-correct OHLC).
 * `sourceTf` must be strictly finer than `targetTf`.
 */
export function aggregateCandles(
  source: Candle[],
  sourceTf: Timeframe,
  targetTf: Timeframe,
): Candle[] {
  const srcSec = TF_SEC[sourceTf];
  const dstSec = TF_SEC[targetTf];
  if (!(dstSec > srcSec) || !source.length) return [];
  const map = new Map<number, Candle>();
  for (const c of source) {
    const bt = Math.floor(c.time / dstSec) * dstSec;
    if (bt < CHART_GENESIS_UNIX) continue;
    const prev = map.get(bt);
    if (!prev) {
      map.set(bt, {
        time: bt,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      prev.high = Math.max(prev.high, c.high);
      prev.low = Math.min(prev.low, c.low);
      prev.close = c.close;
      prev.volume += c.volume;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time).slice(-MAX_CANDLES);
}

/** Build 30s from 1m by splitting each bar (demo-only finer resolution). */
export function expandToFinerTf(source: Candle[], sourceTf: Timeframe, targetTf: Timeframe): Candle[] {
  const srcSec = TF_SEC[sourceTf];
  const dstSec = TF_SEC[targetTf];
  if (!(dstSec < srcSec) || !source.length) return [];
  const ratio = Math.round(srcSec / dstSec);
  if (ratio < 2) return [];
  const out: Candle[] = [];
  for (const c of source) {
    const step = (c.close - c.open) / ratio;
    for (let i = 0; i < ratio; i++) {
      const t = c.time + i * dstSec;
      if (t < CHART_GENESIS_UNIX) continue;
      const open = c.open + step * i;
      const close = i === ratio - 1 ? c.close : c.open + step * (i + 1);
      out.push({
        time: t,
        open,
        high: Math.max(open, close, i === 0 ? c.high : Math.max(open, close)),
        low: Math.min(open, close, i === 0 ? c.low : Math.min(open, close)),
        close,
        volume: c.volume / ratio,
      });
    }
  }
  return out.slice(-MAX_CANDLES);
}

export function seedCandles(pairId: PairId, tf: Timeframe, mid: number, count?: number): Candle[] {
  const sec = TF_SEC[tf];
  const now = bucket(Date.now(), tf);
  const genesis = genesisBucket(tf);
  const maxN = Math.max(1, Math.floor((now - genesis) / sec) + 1);
  const n = Math.min(count ?? barCountForTf(tf), maxN, MAX_CANDLES);
  const out: Candle[] = [];
  const maxBody = maxBodyFracForTf(tf);
  // Mild OU noise around mid — paper reference desk, not a multi-day dump/pump.
  // Previous open random-walk drifted ~10%+ over 24h and painted fake −chg + red tip.
  const noiseAmp = 3.2 * Math.sqrt(sec / 60);
  const reversion = 0.42;
  let price = mid * (0.999 + stableUnit([pairId, tf, now, n, "seed-start"]) * 0.002);

  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * sec;
    if (t < genesis) continue;
    const shockBps = stableSigned([pairId, tf, t, "seed-drift"], 0.48) * noiseAmp;
    const open = price;
    const meanPull = (mid - open) * reversion;
    const rawClose = open + meanPull + open * (shockBps / 10_000);
    const close = clampTickMid(rawClose, open, maxBody);
    out.push(makeBar(pairId, t, open, close, tf));
    price = close;
  }
  if (out.length) {
    const last = out[out.length - 1]!;
    // Tip must print the live mid exactly — re-anchor open if body would clip it.
    if (Math.abs(mid - last.open) / Math.max(last.open, 1e-18) > maxBody) {
      last.open = mid;
      last.high = mid;
      last.low = mid;
      last.close = mid;
    } else {
      const w = wickSpread(mid, pairId, tf);
      last.close = mid;
      last.high = Math.max(last.open, mid, w.high);
      last.low = Math.min(last.open, mid, w.low);
      Object.assign(last, constrainBarToOpen(last, maxBody));
      last.close = mid; // constrain may nudge; force mid on tip
      last.high = Math.max(last.high, mid, last.open);
      last.low = Math.min(last.low, mid, last.open);
    }
  }
  return out;
}

/** Recompute all TFs from a 1m base series.
 * Higher TFs only cover the 1m window (~1–2 days) — pad left with synthetic
 * history (and keep prior older bars) so 1D/1W look like a real CEX desk, not 2–4 mega-candles.
 */
export function deriveAllTimeframes(
  base1m: Candle[],
  pairId?: PairId,
  prev?: Partial<Record<Timeframe, Candle[]>>,
): Partial<Record<Timeframe, Candle[]>> {
  const out: Partial<Record<Timeframe, Candle[]>> = {
    [CANDLE_BASE_TF]: base1m.slice(-MAX_CANDLES),
  };
  for (const tf of TIMEFRAMES) {
    if (tf === CANDLE_BASE_TF) continue;
    let series: Candle[] =
      TF_SEC[tf] > TF_SEC[CANDLE_BASE_TF]
        ? aggregateCandles(base1m, CANDLE_BASE_TF, tf)
        : expandToFinerTf(base1m, CANDLE_BASE_TF, tf);
    const firstT = series[0]?.time;
    if (prev?.[tf]?.length && firstT != null) {
      const older = prev[tf]!.filter((c) => c.time < firstT);
      if (older.length) series = [...older, ...series];
    }
    const need = barCountForTf(tf);
    if (pairId && series.length > 0 && series.length < need) {
      series = prependOlderCandles(series, pairId, tf, need - series.length);
    }
    out[tf] = series.slice(-MAX_CANDLES);
  }
  return out;
}

/** Seed base TF then derive every other TF — one market, all resolutions. */
export function seedAllTimeframes(
  pairId: PairId,
  mid: number,
): Partial<Record<Timeframe, Candle[]>> {
  const base = seedCandles(pairId, CANDLE_BASE_TF, mid, barCountForTf(CANDLE_BASE_TF));
  return deriveAllTimeframes(base, pairId);
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
        ? 0.05
        : pairId === "SUP_USDT"
          ? 0.01
          : pairId === "HMC_SUP"
            ? 5
            : pairId === "HMC_BTC"
              ? 0.05 / 67_500
              : pairId === "SUP_BTC"
                ? 0.01 / 67_500
                : 0.05;
    return seedCandles(pairId, tf, seedMid, Math.min(count, MAX_CANDLES));
  }
  const room = MAX_CANDLES - existing.length;
  if (room <= 0) return existing;

  const sec = TF_SEC[tf];
  const genesis = genesisBucket(tf);
  const first = existing[0]!;
  if (first.time <= genesis) return existing;

  const maxAdd = Math.floor((first.time - genesis) / sec);
  if (maxAdd <= 0) return existing;
  const n = Math.min(count, room, maxAdd);
  if (n <= 0) return existing;

  const maxBody = maxBodyFracForTf(tf);
  const noiseAmp = 3.2 * Math.sqrt(sec / 60);
  const reversion = 0.42;
  const older: Candle[] = [];
  let price = first.open;
  for (let i = n; i >= 1; i--) {
    const t = first.time - i * sec;
    if (t < genesis) continue;
    const shockBps = stableSigned([pairId, tf, t, "prepend-open"], 0.5) * noiseAmp;
    const close = price;
    const meanPull = (first.open - close) * reversion;
    const rawOpen = close - meanPull - close * (shockBps / 10_000);
    const open = clampTickMid(rawOpen, close, maxBody);
    older.push(makeBar(pairId, t, open, close, tf));
    price = open;
  }
  if (!older.length) return existing;

  let p = older[0]!.open;
  for (let i = 0; i < older.length; i++) {
    const shockBps = stableSigned([pairId, tf, older[i]!.time, "prepend-close"], 0.48) * noiseAmp;
    const open = p;
    const meanPull = (first.open - open) * reversion;
    const close =
      i === older.length - 1
        ? first.open
        : clampTickMid(open + meanPull + open * (shockBps / 10_000), open, maxBody);
    older[i] = makeBar(pairId, older[i]!.time, open, close, tf);
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
  const maxJump = maxJumpFracForTf(tf);
  const maxBody = maxBodyFracForTf(tf);
  const copy = [...candles];
  const last = copy[copy.length - 1];
  const ref = last?.close ?? (finiteMid(prevMid) ? prevMid! : mid);
  const disc = isPriceDiscontinuity(mid, ref, maxJump);
  let safeMid = clampTickMid(mid, ref, maxJump);
  const openRef = last && last.time === t ? last.open : ref;
  if (finiteMid(openRef) && !disc) {
    safeMid = clampTickMid(safeMid, openRef, maxBody);
  }
  const tickVol = 150 + stableUnit([pairId, tf, t, safeMid.toPrecision(12), "tick-vol"]) * 2200;
  const w = disc ? { high: safeMid, low: safeMid } : wickSpread(safeMid, pairId, tf);

  const finish = (bar: Candle): Candle => constrainBarToOpen(clipBarWicks(bar), maxBody);

  const applyTip = (tip: Candle): Candle => {
    if (disc) {
      // Walk close toward mid in capped steps — never rewrite open (CEX continuity).
      const px = clampTickMid(mid, tip.close || tip.open, maxJump);
      return finish({
        ...tip,
        high: Math.max(tip.open, tip.high, px),
        low: Math.min(tip.open, tip.low, px),
        close: px,
        volume: tip.volume + tickVol,
      });
    }
    tip.close = safeMid;
    tip.high = Math.max(tip.high, w.high, safeMid);
    tip.low = Math.min(tip.low, w.low, safeMid);
    tip.volume += tickVol;
    return finish(tip);
  };

  if (prevMid !== undefined && last && last.time === t) {
    copy[copy.length - 1] = applyTip({ ...last });
    return copy.slice(-MAX_CANDLES);
  }

  if (!last || last.time < t) {
    if (last && last.time + sec < t) {
      const bridgePx = last.close;
      for (let bt = last.time + sec; bt < t; bt += sec) {
        copy.push(flatGapBar(bt, bridgePx));
        if (copy.length >= MAX_CANDLES) break;
      }
    }
    // Always continue from previous close — never leave a visual gap between bars.
    const open = copy[copy.length - 1]?.close ?? last?.close ?? safeMid;
    const close = clampTickMid(safeMid, open, maxBody);
    copy.push(
      finish({
        time: t,
        open,
        high: Math.max(open, close, disc ? close : w.high),
        low: Math.min(open, close, disc ? close : w.low),
        close,
        volume: tickVol,
      }),
    );
    return copy.slice(-MAX_CANDLES);
  }

  if (last.time === t) {
    copy[copy.length - 1] = applyTip({ ...last });
    return copy.slice(-MAX_CANDLES);
  }

  const clipped = copy.filter((c) => c.time <= t);
  const healed = ensureContiguousCandles(clipped.length ? clipped : copy.slice(0, 1), tf, {
    pairId,
    fillToNow: true,
    nowMs: t * 1000,
  });
  if (!healed.length) {
    return [
      finish({
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
    healed[healed.length - 1] = applyTip({ ...tip });
    return healed.slice(-MAX_CANDLES);
  }
  const open = tip.close;
  const close = clampTickMid(safeMid, open, maxBody);
  healed.push(
    finish({
      time: t,
      open,
      high: Math.max(open, close, disc ? close : w.high),
      low: Math.min(open, close, disc ? close : w.low),
      close,
      volume: tickVol,
    }),
  );
  return healed.slice(-MAX_CANDLES);
}

/**
 * Live mid update: tick the 1m base, then refresh every TF from it.
 * Guarantees 5m/1D tips match 1m — no independent cliffs per TF.
 */
export function applyMidToPairCandles(
  candlesByTf: Partial<Record<Timeframe, Candle[]>>,
  pairId: PairId,
  mid: number,
  prevMid?: number,
): Partial<Record<Timeframe, Candle[]>> {
  const prevBase = candlesByTf[CANDLE_BASE_TF] ?? [];
  const nextBase = upsertTick(prevBase, CANDLE_BASE_TF, mid, pairId, prevMid);
  return deriveAllTimeframes(nextBase, pairId, candlesByTf);
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
      prev.high = Math.max(prev.high, c.high, c.open, c.close);
      prev.low = Math.min(prev.low, c.low, c.open, c.close);
      prev.close = c.close;
      prev.volume += c.volume;
    }
  }

  const times = [...byBucket.keys()].sort((a, b) => a - b);
  if (!times.length) return candles.slice(-1);

  let end = times[times.length - 1]!;
  if (opts?.fillToNow) {
    const nowB = bucket(opts.nowMs ?? Date.now(), tf);
    if (nowB > end) end = nowB;
  }

  let start = times[0]!;
  const spanBars = Math.floor((end - start) / sec) + 1;
  if (spanBars > MAX_CANDLES) {
    start = end - (MAX_CANDLES - 1) * sec;
    if (start < g) start = g;
    start = Math.floor(start / sec) * sec;
  }

  const out: Candle[] = [];
  let px =
    byBucket.get(start)?.open ??
    byBucket.get(times.find((x) => x >= start) ?? times[0]!)!.close;
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i]! <= start) {
      px = byBucket.get(times[i]!)!.close;
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
    if (candles[i]!.time - candles[i - 1]!.time !== sec) return false;
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

export function stats24h(
  candles: Candle[],
  tf: Timeframe = "15m",
): { changePct: number; high: number; low: number; vol: number } {
  if (candles.length < 2) return { changePct: 0, high: 0, low: 0, vol: 0 };
  const bars24 = Math.min(candles.length, Math.max(2, Math.ceil(86_400 / TF_SEC[tf])));
  const slice = sanitizeCandleExtremes(candles.slice(-bars24), maxBodyFracForTf(tf));
  if (slice.length < 2) return { changePct: 0, high: 0, low: 0, vol: 0 };
  const first = slice[0]!.open;
  const last = slice[slice.length - 1]!.close;
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
  return sanitizeCandleExtremes(sanitizeCandleVolumes(candles, pairId), maxBodyFracForTf(CANDLE_BASE_TF));
}
