import type { Candle, PairId, Timeframe } from "./types";
import { TF_SEC, TIMEFRAMES } from "./types";
import {
  clampTickMid,
  clipBarWicks,
  constrainBarToOpen,
  isPriceDiscontinuity,
  maxBodyFracForTf,
  maxJumpFracForTf,
  maxWickFracForTf,
  sanitizeCandleExtremes,
} from "./chartScale";
import { paperPairMid } from "./market";

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

function candleVolume(pairId: PairId, tf: Timeframe, t = 0): number {
  const tfScale = Math.sqrt(TF_SEC[tf] / 60);
  const base =
    pairId === "HMC_USDT" || pairId === "HMC_SUP" || pairId === "HMC_BTC"
      ? 3500 + stableUnit([pairId, tf, t, "volume-base"]) * 55_000
      : 1200 + stableUnit([pairId, tf, t, "volume-base"]) * 18_000;
  // Per-bar jitter so volume hist is not a flat “barcode”.
  const jitter = 0.45 + stableUnit([pairId, tf, t, "volume-j"]) * 1.1;
  return base * tfScale * jitter;
}

/**
 * Exchange-like intra-bar extremes for paper seed bars.
 * Wicks track the body (CEX look) + tiny mid-relative micro-noise —
 * never a fixed ±bps forest that dwarfs small bodies.
 */
function wickSpread(
  open: number,
  close: number,
  pairId: PairId,
  tf: Timeframe,
  t: number,
): { high: number; low: number } {
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);
  const body = bodyHigh - bodyLow;
  const mid = (open + close) / 2 || bodyHigh || 1;
  // ~0.6–1.4 bps micro tape noise; BTC pairs slightly wider.
  const microBps = pairId.includes("BTC") ? 1.4 : pairId === "SUP_USDT" ? 1.1 : 0.85;
  const micro = mid * (microBps / 10_000);
  const hiSeed = stableUnit([tf, t, "wick-high"]);
  const loSeed = stableUnit([tf, t, "wick-low"]);
  // Body-relative: often 5–70% of body beyond the close/open (some bars nearly closed).
  const hiBeyond = micro * (0.25 + hiSeed * 0.9) + body * (0.04 + hiSeed * 0.55);
  const loBeyond = micro * (0.25 + loSeed * 0.9) + body * (0.04 + loSeed * 0.55);
  const cap = mid * maxWickFracForTf(tf);
  return {
    high: bodyHigh + Math.min(hiBeyond, cap),
    low: bodyLow - Math.min(loBeyond, cap),
  };
}

/** Seed one paper bar with CEX-valid OHLC (wicks = intra-bar extremes). */
function makeBar(pairId: PairId, t: number, open: number, close: number, tf: Timeframe): Candle {
  const wick = wickSpread(open, close, pairId, tf, t);
  return constrainBarToOpen(
    {
      time: t,
      open,
      high: Math.max(open, close, wick.high),
      low: Math.min(open, close, wick.low),
      close,
      volume: candleVolume(pairId, tf, t),
    },
    maxBodyFracForTf(tf),
    maxWickFracForTf(tf),
  );
}

/**
 * Aggregate finer candles into a coarser TF (exchange-correct OHLC).
 * High = max(child.high), Low = min(child.low) — never body-collapse.
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
  return [...map.values()]
    .sort((a, b) => a.time - b.time)
    .map((c) => {
      // Sacred OHLC from children — do NOT clipBarWicks (destroys CEX aggregation fidelity).
      const high = Math.max(c.high, c.open, c.close);
      const low = Math.min(c.low, c.open, c.close);
      return { ...c, high, low };
    })
    .slice(-MAX_CANDLES);
}

/** Build 30s from 1m by splitting each bar (demo-only finer resolution). */
export function expandToFinerTf(
  source: Candle[],
  sourceTf: Timeframe,
  targetTf: Timeframe,
  nowMs = Date.now(),
): Candle[] {
  const srcSec = TF_SEC[sourceTf];
  const dstSec = TF_SEC[targetTf];
  if (!(dstSec < srcSec) || !source.length) return [];
  const ratio = Math.round(srcSec / dstSec);
  if (ratio < 2) return [];
  const nowBucket = Math.floor(nowMs / 1000 / dstSec) * dstSec;
  const out: Candle[] = [];
  for (const c of source) {
    const step = (c.close - c.open) / ratio;
    const slices: Candle[] = [];
    for (let i = 0; i < ratio; i++) {
      const t = c.time + i * dstSec;
      if (t < CHART_GENESIS_UNIX) continue;
      // Do not invent a future half-bar beyond the live 30s bucket.
      if (t > nowBucket) continue;
      const open = c.open + step * i;
      const close = i === ratio - 1 ? c.close : c.open + step * (i + 1);
      // Both slices inherit parent extremes so 30s→1m high/low roundtrip holds.
      const high = Math.max(open, close, c.high);
      const low = Math.min(open, close, c.low);
      slices.push({
        time: t,
        open,
        high,
        low,
        close,
        volume: c.volume / ratio,
      });
    }
    // Forming minute: last emitted half prints live parent close (CEX tip continuity).
    if (slices.length && slices.length < ratio) {
      const last = slices[slices.length - 1]!;
      last.close = c.close;
      last.high = Math.max(last.high, last.open, c.close, c.high);
      last.low = Math.min(last.low, last.open, c.close, c.low);
    }
    out.push(...slices);
  }
  return out.slice(-MAX_CANDLES);
}

/**
 * Seed OHLC from the shared paper clock (`paperPairMid` at each bucket).
 * Same wall-clock + tip mid → identical series on every device (no local path fork).
 * `mid` scales the native clock path so tip close prints exactly `mid`.
 */
export function seedCandles(
  pairId: PairId,
  tf: Timeframe,
  mid: number,
  count?: number,
  nowMs = Date.now(),
): Candle[] {
  const sec = TF_SEC[tf];
  const now = bucket(nowMs, tf);
  const genesis = genesisBucket(tf, Math.floor(nowMs / 1000));
  const maxN = Math.max(1, Math.floor((now - genesis) / sec) + 1);
  const n = Math.min(count ?? barCountForTf(tf, nowMs), maxN, MAX_CANDLES);
  const out: Candle[] = [];
  const nativeTip = paperPairMid(pairId, nowMs);
  const scale = nativeTip > 0 && Number.isFinite(nativeTip) ? mid / nativeTip : 1;

  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * sec;
    if (t < genesis) continue;
    const isTip = i === 0;
    if (isTip) {
      // Same tip builder as live paper clock — identical H/L across seed vs micro-tick.
      out.push(tipBarFromPaperClock(pairId, tf, t, nowMs, mid));
      continue;
    }
    const open = paperPairMid(pairId, t * 1000) * scale;
    // Closed bars: close == next bucket open so series stay CEX-continuous across devices.
    const close = paperPairMid(pairId, (t + sec) * 1000) * scale;
    out.push(makeBar(pairId, t, open, close, tf));
  }
  return out;
}

/** Recompute all TFs from a 1m base series.
 * Higher TFs only cover the 1m window (~1–2 days) — pad left with synthetic
 * history (and keep prior older bars) so 1D/1W look like a real CEX desk, not 2–4 mega-candles.
 * Pass `opts.retainPrev=false` (paper clock) so devices never reattach forked left pads.
 */
export function deriveAllTimeframes(
  base1m: Candle[],
  pairId?: PairId,
  prev?: Partial<Record<Timeframe, Candle[]>>,
  opts?: { nowMs?: number; retainPrev?: boolean },
): Partial<Record<Timeframe, Candle[]>> {
  const nowMs = opts?.nowMs ?? Date.now();
  const retainPrev = opts?.retainPrev !== false;
  let base = base1m.slice(-MAX_CANDLES);
  // Max out 1m history first so higher TFs aggregate the widest real window (CEX desk).
  if (pairId) {
    const target1m = barCountForTf(CANDLE_BASE_TF, nowMs);
    if (base.length < target1m) {
      base = prependOlderCandles(base, pairId, CANDLE_BASE_TF, target1m - base.length, nowMs);
    }
  }
  const out: Partial<Record<Timeframe, Candle[]>> = {
    [CANDLE_BASE_TF]: base,
  };
  for (const tf of TIMEFRAMES) {
    if (tf === CANDLE_BASE_TF) continue;
    let series: Candle[] =
      TF_SEC[tf] > TF_SEC[CANDLE_BASE_TF]
        ? aggregateCandles(base, CANDLE_BASE_TF, tf)
        : expandToFinerTf(base, CANDLE_BASE_TF, tf, nowMs);
    const firstT = series[0]?.time;
    if (retainPrev && prev?.[tf]?.length && firstT != null) {
      const older = prev[tf]!.filter((c) => c.time < firstT);
      if (older.length) series = [...older, ...series];
    }
    const need = barCountForTf(tf, nowMs);
    if (pairId && series.length > 0 && series.length < need) {
      series = prependOlderCandles(series, pairId, tf, need - series.length, nowMs);
    }
    out[tf] = series.slice(-MAX_CANDLES);
  }
  return out;
}

/** Seed base TF then derive every other TF — one market, all resolutions. */
export function seedAllTimeframes(
  pairId: PairId,
  mid: number,
  nowMs = Date.now(),
): Partial<Record<Timeframe, Candle[]>> {
  const base = sanitizeCandlesForChart(
    seedCandles(pairId, CANDLE_BASE_TF, mid, barCountForTf(CANDLE_BASE_TF, nowMs), nowMs),
    pairId,
    CANDLE_BASE_TF,
  );
  if (base.length) {
    const tip = base[base.length - 1]!;
    tip.close = mid;
    tip.high = Math.max(tip.high, tip.open, mid);
    tip.low = Math.min(tip.low, tip.open, mid);
  }
  const all = deriveAllTimeframes(base, pairId, undefined, { nowMs, retainPrev: false });
  reaggregateLiveBarsFromBase(all, all[CANDLE_BASE_TF] ?? base);
  for (const tf of Object.keys(all) as Timeframe[]) {
    const series = all[tf];
    if (series?.length) all[tf] = finalizeTfSeries(tf, series, pairId);
  }
  // Re-pin tip close after finalize/reagg so every TF prints the live mid.
  for (const tf of Object.keys(all) as Timeframe[]) {
    const series = all[tf];
    if (!series?.length) continue;
    const tip = series[series.length - 1]!;
    tip.close = mid;
    tip.high = Math.max(tip.high, tip.open, mid);
    tip.low = Math.min(tip.low, tip.open, mid);
  }
  return all;
}

/**
 * Forming tip OHLC from shared clock only — never accumulate path-dependent H/L.
 * Samples paperPairMid on a fixed 700ms grid inside the open bucket.
 * `tipMid` scales the native path so tip close prints exactly `tipMid`.
 */
export function tipBarFromPaperClock(
  pairId: PairId,
  tf: Timeframe,
  bucketT: number,
  nowMs: number,
  tipMid: number,
): Candle {
  const nativeTip = paperPairMid(pairId, nowMs);
  const scale = nativeTip > 0 && Number.isFinite(nativeTip) ? tipMid / nativeTip : 1;
  const open = paperPairMid(pairId, bucketT * 1000) * scale;
  const sec = TF_SEC[tf];
  const endMs = Math.min(nowMs, (bucketT + sec) * 1000 - 1);
  let high = Math.max(open, tipMid);
  let low = Math.min(open, tipMid);
  // Fixed grid — identical extremes for every client at the same nowMs.
  for (let ms = bucketT * 1000; ms <= endMs; ms += 700) {
    const px = paperPairMid(pairId, ms) * scale;
    high = Math.max(high, px);
    low = Math.min(low, px);
  }
  const tipSample = paperPairMid(pairId, endMs) * scale;
  high = Math.max(high, tipSample, tipMid);
  low = Math.min(low, tipSample, tipMid);
  const bar = constrainBarToOpen(
    {
      time: bucketT,
      open,
      high,
      low,
      close: tipMid,
      volume: candleVolume(pairId, tf, bucketT),
    },
    maxBodyFracForTf(tf),
    maxWickFracForTf(tf),
  );
  bar.close = tipMid;
  bar.high = Math.max(bar.high, bar.open, tipMid);
  bar.low = Math.min(bar.low, bar.open, tipMid);
  return bar;
}

/**
 * Paper desk: rebuild / tip-sync candles from the shared clock.
 * Full reseed on empty history or bucket rollover; within-bucket tip is pure clock OHLC.
 */
export function applyPaperClockToPairCandles(
  candlesByTf: Partial<Record<Timeframe, Candle[]>>,
  pairId: PairId,
  nowMs = Date.now(),
): Partial<Record<Timeframe, Candle[]>> {
  const mid = paperPairMid(pairId, nowMs);
  const prevBase = candlesByTf[CANDLE_BASE_TF] ?? [];
  const t = bucket(nowMs, CANDLE_BASE_TF);
  const tipTime = prevBase[prevBase.length - 1]?.time ?? 0;
  const tipClose = prevBase[prevBase.length - 1]?.close ?? 0;
  const scaleOk =
    tipClose > 0 && mid > 0 && mid / tipClose <= 1.25 && mid / tipClose >= 0.8;
  if (!prevBase.length || tipTime !== t || !scaleOk) {
    return seedAllTimeframes(pairId, mid, nowMs);
  }
  const tip = tipBarFromPaperClock(pairId, CANDLE_BASE_TF, t, nowMs, mid);
  // Replace tip wholesale — do not Math.max with stale in-memory extremes.
  const nextBase = [...prevBase.slice(0, -1), tip];
  const all = deriveAllTimeframes(nextBase, pairId, undefined, { nowMs, retainPrev: false });
  reaggregateLiveBarsFromBase(all, nextBase);
  for (const tf of Object.keys(all) as Timeframe[]) {
    if (tf === CANDLE_BASE_TF) {
      all[tf] = nextBase;
      continue;
    }
    const series = all[tf];
    if (series?.length) all[tf] = finalizeTfSeries(tf, series, pairId);
  }
  return all;
}

/** Grow history to the left — never before CHART_GENESIS_UNIX. */
export function prependOlderCandles(
  existing: Candle[],
  pairId: PairId,
  tf: Timeframe,
  count: number,
  nowMs = Date.now(),
): Candle[] {
  if (count <= 0) return existing;
  if (!existing.length) {
    const seedMid = paperPairMid(pairId, nowMs);
    return seedCandles(pairId, tf, seedMid, Math.min(count, MAX_CANDLES), nowMs);
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

  const nativeFirst = paperPairMid(pairId, first.time * 1000);
  const scale = nativeFirst > 0 ? first.open / nativeFirst : 1;
  const older: Candle[] = [];
  for (let i = n; i >= 1; i--) {
    const t = first.time - i * sec;
    if (t < genesis) continue;
    const open = paperPairMid(pairId, t * 1000) * scale;
    const close =
      i === 1 ? first.open : paperPairMid(pairId, (t + sec) * 1000) * scale;
    older.push(makeBar(pairId, t, open, close, tf));
  }
  if (!older.length) return existing;
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
  const wickCap = maxWickFracForTf(tf);

  const finish = (bar: Candle): Candle => {
    // Cap body vs open; keep wicks within TF pad — never unbounded tip.low from mid walks,
    // but also never shrink a legitimate wick when close mean-reverts inside the body.
    const open = bar.open;
    const close = clampTickMid(bar.close, open, maxBody);
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    const midBody = (open + close) / 2 || open;
    const wickPad = midBody * wickCap;
    let high = Math.max(bodyHigh, Number.isFinite(bar.high) ? bar.high : bodyHigh);
    let low = Math.min(bodyLow, Number.isFinite(bar.low) ? bar.low : bodyLow);
    high = Math.min(high, bodyHigh + wickPad);
    low = Math.max(low, Math.max(midBody * 1e-6, bodyLow - wickPad));
    high = Math.max(high, bodyHigh);
    low = Math.min(low, bodyLow);
    return { ...bar, open, high, low, close, volume: bar.volume };
  };

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
    tip.high = Math.max(tip.high, safeMid);
    tip.low = Math.min(tip.low, safeMid);
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
        high: Math.max(open, close),
        low: Math.min(open, close),
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
        high: safeMid,
        low: safeMid,
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
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: tickVol,
    }),
  );
  return healed.slice(-MAX_CANDLES);
}

/**
 * In-progress higher-TF bars must match 1m child extremes (CEX forming candle).
 * Replaces the live bucket on each coarser TF with aggregation from base 1m.
 */
export function reaggregateLiveBarsFromBase(
  all: Partial<Record<Timeframe, Candle[]>>,
  base1m: Candle[],
): void {
  if (!base1m.length) return;
  const baseTip = base1m[base1m.length - 1]!;
  for (const tf of TIMEFRAMES) {
    if (tf === CANDLE_BASE_TF) continue;
    const series = all[tf];
    if (!series?.length) continue;
    const dstSec = TF_SEC[tf];
    if (TF_SEC[tf] > TF_SEC[CANDLE_BASE_TF]) {
      const tipT = Math.floor(baseTip.time / dstSec) * dstSec;
      const children = base1m.filter((c) => Math.floor(c.time / dstSec) * dstSec === tipT);
      if (!children.length) continue;
      const agg = aggregateCandles(children, CANDLE_BASE_TF, tf);
      const live = agg.find((b) => b.time === tipT);
      if (!live) continue;
      const lastT = series[series.length - 1]!.time;
      if (lastT === tipT) {
        series[series.length - 1] = live;
      } else if (lastT < tipT) {
        series.push(live);
        all[tf] = series.slice(-MAX_CANDLES);
      } else {
        // Orphan / future tip with no children — replace with current base bucket.
        const keep = series.filter((c) => c.time < tipT);
        all[tf] = [...keep, live].slice(-MAX_CANDLES);
      }
    } else if (tf === "30s") {
      const parentT = Math.floor(baseTip.time / TF_SEC[CANDLE_BASE_TF]) * TF_SEC[CANDLE_BASE_TF];
      const parent = base1m.find((c) => c.time === parentT);
      if (!parent) continue;
      const expanded = expandToFinerTf([parent], CANDLE_BASE_TF, "30s");
      if (!expanded.length) continue;
      const keep = series.filter((c) => c.time < parentT);
      all[tf] = [...keep, ...expanded].slice(-MAX_CANDLES);
    }
  }
}

export function applyMidToPairCandles(
  candlesByTf: Partial<Record<Timeframe, Candle[]>>,
  pairId: PairId,
  mid: number,
  prevMid?: number,
): Partial<Record<Timeframe, Candle[]>> {
  const prevBase = candlesByTf[CANDLE_BASE_TF] ?? [];
  const nextRaw = upsertTick(prevBase, CANDLE_BASE_TF, mid, pairId, prevMid);
  const tipRaw = nextRaw[nextRaw.length - 1];
  const nextBase = sanitizeCandlesForChart(nextRaw, pairId, CANDLE_BASE_TF);
  // Preserve tip intrabar extremes through sanitize (forming candle must not shrink).
  if (tipRaw && nextBase.length) {
    const tip = { ...nextBase[nextBase.length - 1]! };
    tip.high = Math.max(tip.high, tipRaw.high, tip.open, tip.close);
    tip.low = Math.min(tip.low, tipRaw.low, tip.open, tip.close);
    nextBase[nextBase.length - 1] = tip;
  }
  const all = deriveAllTimeframes(nextBase, pairId, candlesByTf);
  reaggregateLiveBarsFromBase(all, nextBase);
  for (const tf of Object.keys(all) as Timeframe[]) {
    if (tf === CANDLE_BASE_TF) {
      // Already sanitized + tip extrema preserved — do not crush again.
      all[tf] = nextBase;
      continue;
    }
    const series = all[tf];
    if (series?.length) all[tf] = finalizeTfSeries(tf, series, pairId);
  }
  return all;
}

function finiteMid(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function flatGapBar(t: number, px: number): Candle {
  return { time: t, open: px, high: px, low: px, close: px, volume: 0 };
}

/** Close ÷ tip close — shared silhouette check across pairs (scale-invariant). */
export function relativeClosePath(candles: Candle[]): number[] {
  if (!candles.length) return [];
  const tip = candles[candles.length - 1]!.close;
  if (!(tip > 0) || !Number.isFinite(tip)) return candles.map(() => 1);
  return candles.map((c) => c.close / tip);
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
): { changePct: number; high: number; low: number; vol: number; refOpen: number; refClose: number } {
  if (candles.length < 2) return { changePct: 0, high: 0, low: 0, vol: 0, refOpen: 0, refClose: 0 };
  const bars24 = Math.min(candles.length, Math.max(2, Math.ceil(86_400 / TF_SEC[tf])));
  // Soft-heal cliffs for HUD stats only — does not mutate the chart series.
  const slice = sanitizeCandleExtremes(candles.slice(-bars24), maxBodyFracForTf(tf), {
    maxWick: maxWickFracForTf(tf),
  }).map((c) => ({
    ...c,
    high: Math.max(c.high, c.open, c.close),
    low: Math.min(c.low, c.open, c.close),
  }));
  if (slice.length < 2) return { changePct: 0, high: 0, low: 0, vol: 0, refOpen: 0, refClose: 0 };
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
    refOpen: first,
    refClose: last,
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
export function sanitizeCandlesForChart(
  candles: Candle[],
  pairId: PairId,
  tf: Timeframe = CANDLE_BASE_TF,
): Candle[] {
  const bodyCap = maxBodyFracForTf(tf);
  const wickCap = maxWickFracForTf(tf);
  return sanitizeCandleExtremes(sanitizeCandleVolumes(candles, pairId), bodyCap, { maxWick: wickCap });
}

/**
 * Light heal for bars derived from 1m aggregation — volume + OHLC invariants only.
 * Does NOT constrain body/wicks (would destroy CEX child extremes on 5m/1D).
 */
export function sanitizeDerivedCandlesForChart(candles: Candle[], pairId: PairId): Candle[] {
  return sanitizeCandleVolumes(candles, pairId).map((c) => {
    let open = c.open;
    let close = c.close;
    if (!(open > 0) || !Number.isFinite(open)) open = close > 0 ? close : 0;
    if (!(close > 0) || !Number.isFinite(close)) close = open;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    return { ...c, open, high, low, close };
  });
}

function finalizeTfSeries(
  tf: Timeframe,
  series: Candle[],
  pairId: PairId,
): Candle[] {
  if (!series.length) return series;
  if (tf === CANDLE_BASE_TF) return sanitizeCandlesForChart(series, pairId, tf);
  return sanitizeDerivedCandlesForChart(series, pairId);
}
