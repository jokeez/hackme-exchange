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

/**
 * Quantize mid before seeding history so every device/TF sees the same walk.
 * Micro L2 differences (0.04953409 vs 0.04953411) must not fork the whole chart.
 */
export function chartAnchorMid(mid: number): number {
  if (!(mid > 0) || !Number.isFinite(mid)) return 0;
  // 6 significant digits — enough for soft-launch HMC (~0.05) and BTC pairs.
  const abs = Math.abs(mid);
  const digits = abs >= 1 ? 6 : abs >= 0.01 ? 6 : 5;
  return Number(mid.toPrecision(digits));
}

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

/** Median positive step between bar times (seconds). */
export function medianBarStepSec(candles: Candle[]): number {
  if (candles.length < 3) return 0;
  const steps: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i]!.time - candles[i - 1]!.time;
    if (d > 0) steps.push(d);
  }
  if (!steps.length) return 0;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)]!;
}

/**
 * True when series spacing matches TF (guards 1D watermark + 1m data bugs).
 * Window is tight enough to reject adjacent TFs (1H↔2H, 30s↔1m) while still
 * tolerating a sparse gap or two.
 */
export function seriesMatchesTf(candles: Candle[], tf: Timeframe): boolean {
  const med = medianBarStepSec(candles);
  if (!(med > 0)) return true;
  const expect = TF_SEC[tf];
  if (!(med >= expect * 0.65 && med <= expect * 1.55)) return false;
  // Nearest TF_SEC must be this tf (belt-and-suspenders vs mid-window collisions).
  let best: Timeframe = tf;
  let bestDist = Math.abs(Math.log(med / expect));
  for (const [k, sec] of Object.entries(TF_SEC) as [Timeframe, number][]) {
    const dist = Math.abs(Math.log(med / sec));
    if (dist < bestDist) {
      bestDist = dist;
      best = k;
    }
  }
  return best === tf;
}

/**
 * If `tf` series has wrong cadence (e.g. 1m steps labeled 1D), rebuild from 1m base.
 */
export function ensureTfSeriesCadence(
  candlesByTf: Partial<Record<Timeframe, Candle[]>>,
  pairId: PairId,
  tf: Timeframe,
  nowMs = Date.now(),
): Partial<Record<Timeframe, Candle[]>> {
  const series = candlesByTf[tf];
  if (!series || series.length < 3 || seriesMatchesTf(series, tf)) return candlesByTf;
  const base = candlesByTf[CANDLE_BASE_TF];
  if (!base || base.length < 3) return candlesByTf;
  const rebuilt = deriveAllTimeframes(base, pairId, undefined, { nowMs, retainPrev: false });
  reaggregateLiveBarsFromBase(rebuilt, rebuilt[CANDLE_BASE_TF] ?? base);
  return { ...candlesByTf, ...rebuilt };
}

/** Bars per TF — capped by real history since genesis (no fake Nov/Dec 2025). */
export function barCountForTf(tf: Timeframe, nowMs = Date.now()): number {
  let want: number;
  switch (tf) {
    case "30s":
      want = 1200;
      break;
    case "1m":
      // ≥1 calendar day so forming 1D tip has full 1m children.
      want = 1600;
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
 * Per-bar RMS vol for the deterministic walk — CEX soft-launch tape.
 * ~12–18 bps typical 1m body energy (not the prior ~3 bps “ruler line”).
 */
function walkVol(tf: Timeframe): number {
  const minScale = Math.sqrt(Math.max(1, TF_SEC[tf] / 60));
  // Soft-launch HMC mid is quiet — history still needs CEX bodies without wild cliffs.
  return 0.0017 * minScale;
}

/** One bar's log-return: fat tails + short persistence (chop, not a straight line). */
function barReturn(pairId: PairId, tf: Timeframe, boundarySec: number): number {
  const vol = walkVol(tf);
  const u = stableSigned([pairId, tf, boundarySec, "cex-rw"], 0.5);
  const fatU = stableSigned([pairId, tf, boundarySec, "cex-fat"], 0.5);
  const prev = stableSigned([pairId, tf, boundarySec - TF_SEC[tf], "cex-rw"], 0.5);
  // Mix current shock with previous sign → short runs, then flip (CEX chop).
  const mixed = u * 0.68 + prev * 0.32;
  // Fat tail: ~15% of bars 2.5–4×; rest mildly amplified.
  const fat = Math.abs(fatU) > 0.4 ? 2.4 + Math.abs(fatU) * 2.2 : 1 + Math.abs(fatU) * 0.9;
  return mixed * vol * 2.6 * fat;
}

/**
 * Deterministic CEX-like price at `atSec`, pinned so `anchorSec` prints `anchorPx`.
 * Random-walk with fat tails — not multi-sine (histogram-from-mid) and not a ruler line.
 */
function walkPriceAt(
  pairId: PairId,
  tf: Timeframe,
  atSec: number,
  anchorSec: number,
  anchorPx: number,
): number {
  if (!(anchorPx > 0) || !Number.isFinite(anchorPx)) return Math.max(anchorPx, 1e-12);
  if (atSec === anchorSec) return anchorPx;
  const step = TF_SEC[tf];
  if (!(step > 0)) return anchorPx;
  let logPx = Math.log(anchorPx);
  if (atSec < anchorSec) {
    for (let t = anchorSec; t > atSec; t -= step) {
      logPx -= barReturn(pairId, tf, t);
    }
  } else {
    for (let t = anchorSec; t < atSec; t += step) {
      logPx += barReturn(pairId, tf, t + step);
    }
  }
  const px = Math.exp(logPx);
  return px > 0 && Number.isFinite(px) ? px : anchorPx;
}

/**
 * Exchange-like intra-bar extremes — always both wicks (Binance/TV look).
 * Range is usually 1.4–2.6× the body so candles are not flat ticks.
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
  const body = Math.max(bodyHigh - bodyLow, (bodyHigh + bodyLow) * 0.00015);
  const mid = (open + close) / 2 || bodyHigh || 1;
  const hiSeed = stableUnit([pairId, tf, t, "wick-high"]);
  const loSeed = stableUnit([pairId, tf, t, "wick-low"]);
  const spike = stableUnit([pairId, tf, t, "wick-spike"]);
  const cap = mid * maxWickFracForTf(tf);
  // Upper/lower wicks often unequal — like real books.
  let hiBeyond = body * (0.25 + hiSeed * 1.1) + mid * (0.00008 + hiSeed * 0.00035);
  let loBeyond = body * (0.25 + loSeed * 1.1) + mid * (0.00008 + loSeed * 0.00035);
  if (spike > 0.88) {
    // Occasional longer wick (~CEX stop-run look).
    if (hiSeed > loSeed) hiBeyond *= 1.8 + spike;
    else loBeyond *= 1.8 + spike;
  }
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
      const open = i === 0 ? c.open : slices[i - 1]!.close;
      const close = i === ratio - 1 ? c.close : c.open + step * (i + 1);
      // Per-half body extremes — do not stamp full parent H/L on every slice.
      let high = Math.max(open, close);
      let low = Math.min(open, close);
      // Parent wick beyond body: attribute high to last half, low to first (CEX-ish).
      if (i === ratio - 1 && c.high > Math.max(c.open, c.close)) high = Math.max(high, c.high);
      if (i === 0 && c.low < Math.min(c.open, c.close)) low = Math.min(low, c.low);
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
      last.high = Math.max(last.high, last.open, c.close);
      last.low = Math.min(last.low, last.open, c.close);
    }
    out.push(...slices);
  }
  return out.slice(-MAX_CANDLES);
}

/**
 * Seed OHLC from a deterministic CEX-like random walk (not the ticker sine).
 * Same wall-clock + tip mid → identical series on every device (no local path fork).
 * Tip close prints exactly `mid`; each bar opens at the previous close.
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
  if (!(mid > 0) || !Number.isFinite(mid) || n < 1) return [];

  // Closed bars: forward walk affine-pinned so the last CLOSED close meets tip open.
  // Tip bar always comes from tipBarFromPaperClock (late-join == early-join).
  const closedN = Math.max(0, n - 1);
  const out: Candle[] = [];
  if (closedN > 0) {
    const tipOpen = walkPriceAt(pairId, tf, now, now + sec, mid);
    const raw: number[] = [1];
    const times: number[] = [];
    for (let i = 0; i < closedN; i++) {
      const t = now - (closedN - i) * sec;
      times.push(t);
      if (i === 0) continue;
      // Fat-tail shock + soft pull toward 1.0 so 24h change stays CEX-mild after tip pin.
      const shock = barReturn(pairId, tf, t);
      const revert = -0.12 * Math.log(Math.max(1e-9, raw[i - 1]!));
      raw.push(raw[i - 1]! * (1 + shock + revert));
    }
    const tipRaw = raw[raw.length - 1] || 1;
    const scale = tipRaw > 0 ? tipOpen / tipRaw : tipOpen;
    for (let i = 0; i < closedN; i++) {
      const t = times[i]!;
      if (t < genesis) continue;
      const close = raw[i]! * scale;
      const open =
        out.length > 0
          ? out[out.length - 1]!.close
          : close * (1 + barReturn(pairId, tf, t) * 0.35);
      out.push(makeBar(pairId, t, open, close, tf));
    }
    // Contiguity into tip open.
    if (out.length) {
      const last = out[out.length - 1]!;
      last.close = tipOpen;
      last.high = Math.max(last.high, last.open, tipOpen);
      last.low = Math.min(last.low, last.open, tipOpen);
    }
  }
  out.push(tipBarFromPaperClock(pairId, tf, now, nowMs, mid));
  return out.filter((c) => c.time >= genesis).slice(-MAX_CANDLES);
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
  // Closed history walk anchors to quantized mid so clients converge across devices.
  // Forming tip uses tipBarFromPaperClock(tipMid) so late-join matches early-join.
  const tipMid = mid > 0 && Number.isFinite(mid) ? mid : 0;
  const anchor = chartAnchorMid(tipMid) || tipMid;
  const base = sanitizeCandlesForChart(
    seedCandles(pairId, CANDLE_BASE_TF, anchor, barCountForTf(CANDLE_BASE_TF, nowMs), nowMs),
    pairId,
    CANDLE_BASE_TF,
  );
  if (base.length && tipMid > 0) {
    const tipBucket = base[base.length - 1]!.time;
    base[base.length - 1] = tipBarFromPaperClock(pairId, CANDLE_BASE_TF, tipBucket, nowMs, tipMid);
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
    if (!series?.length || !(tipMid > 0)) continue;
    const tip = series[series.length - 1]!;
    tip.close = tipMid;
    tip.high = Math.max(tip.high, tip.open, tipMid);
    tip.low = Math.min(tip.low, tip.open, tipMid);
  }
  return all;
}

/**
 * Forming tip OHLC from shared walk — tip close prints exactly `tipMid`.
 * Pure function of (pair, tf, bucket, nowMs, tipMid) so late-joining clients match.
 * Open = walk at bucket start pinned as if the bar closes at tipMid (not ticker sine).
 * Intrabar probes give real H/L even while Soft-MM mid is quiet.
 */
export function tipBarFromPaperClock(
  pairId: PairId,
  tf: Timeframe,
  bucketT: number,
  nowMs: number,
  tipMid: number,
  _sampleStepMs?: number,
): Candle {
  void _sampleStepMs;
  const sec = TF_SEC[tf];
  // End-of-bucket pin: identical tipMid → identical open on every device.
  const open = walkPriceAt(pairId, tf, bucketT, bucketT + sec, tipMid);
  const elapsed = Math.min(1, Math.max(0, (nowMs / 1000 - bucketT) / sec));
  // Sample a few intrabar marks between open → tipMid so H/L are not body-only.
  let high = Math.max(open, tipMid);
  let low = Math.min(open, tipMid);
  const probes = 6;
  for (let i = 1; i <= probes; i++) {
    const frac = (i / (probes + 1)) * Math.max(elapsed, 0.15);
    const base = open + (tipMid - open) * frac;
    const shock =
      barReturn(pairId, tf, bucketT + Math.floor(frac * sec)) * (0.35 + 0.4 * (1 - frac));
    const px = base * (1 + shock * 0.45);
    if (px > 0 && Number.isFinite(px)) {
      high = Math.max(high, px);
      low = Math.min(low, px);
    }
  }
  // Phase wick seed so Soft-MM sticky tips still breathe H/L within the bucket.
  const phaseT = bucketT + Math.max(1, Math.floor(elapsed * sec));
  const wick = wickSpread(open, tipMid, pairId, tf, phaseT);
  high = Math.max(high, wick.high);
  low = Math.min(low, wick.low);
  return constrainBarToOpen(
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
}

/** Closed paper bar = walk open→close across the bucket (CEX-contiguous). */
function closedBarFromPaperClock(
  pairId: PairId,
  tf: Timeframe,
  bucketT: number,
  tipBucket: number,
  tipMid: number,
  _sampleStepMs?: number,
): Candle {
  void _sampleStepMs;
  const sec = TF_SEC[tf];
  const open = walkPriceAt(pairId, tf, bucketT, tipBucket, tipMid);
  const close = walkPriceAt(pairId, tf, bucketT + sec, tipBucket, tipMid);
  return makeBar(pairId, bucketT, open, close, tf);
}

/**
 * Paper desk: rebuild / tip-sync candles from the shared clock.
 * Within-bucket tip is pure clock OHLC; on minute rollover finalize the prior tip
 * (do not full-reseed — that forks lived H/L into synthetic makeBar).
 */
export function applyPaperClockToPairCandles(
  candlesByTf: Partial<Record<Timeframe, Candle[]>>,
  pairId: PairId,
  nowMs = Date.now(),
): Partial<Record<Timeframe, Candle[]>> {
  const mid = paperPairMid(pairId, nowMs);
  let prevBase = candlesByTf[CANDLE_BASE_TF] ?? [];
  if (prevBase.length >= 2 && !candlesAreContiguous(prevBase, CANDLE_BASE_TF)) {
    prevBase = ensureContiguousCandles(prevBase, CANDLE_BASE_TF, {
      pairId,
      fillToNow: true,
      nowMs,
    });
  }
  const t = bucket(nowMs, CANDLE_BASE_TF);
  const tipTime = prevBase[prevBase.length - 1]?.time ?? 0;
  const tipClose = prevBase[prevBase.length - 1]?.close ?? 0;
  const scaleOk =
    tipClose > 0 && mid > 0 && mid / tipClose <= 1.25 && mid / tipClose >= 0.8;
  const baseSec = TF_SEC[CANDLE_BASE_TF];
  const bucketsAhead = tipTime > 0 && t > tipTime ? Math.round((t - tipTime) / baseSec) : 0;
  // Gap > ~2h of 1m bars → full reseed (sleep / wiped tab). Smaller gaps walk forward.
  const maxWalkBuckets = 120;

  if (!prevBase.length || !scaleOk || (tipTime !== t && (bucketsAhead < 1 || bucketsAhead > maxWalkBuckets))) {
    return seedAllTimeframes(pairId, mid, nowMs);
  }

  let nextBase: Candle[];
  if (tipTime === t) {
    // Full tip rebuild — pure clock (late-join == early-join; heals poisoned H/L).
    const tip = tipBarFromPaperClock(pairId, CANDLE_BASE_TF, t, nowMs, mid);
    nextBase = [...prevBase.slice(0, -1), tip];
  } else {
    // Multi-bucket walk: finalize each closed tip with an independent step so Soft-MM
    // sticky mid does not glue every historical close to Last (шильдики).
    nextBase = prevBase.slice(0, -1);
    for (let bt = tipTime; bt < t; bt += baseSec) {
      const prior = prevBase.find((c) => c.time === bt) ?? nextBase[nextBase.length - 1];
      if (prior && prior.time === bt) {
        nextBase.push(finalizeClosedTip(pairId, CANDLE_BASE_TF, prior, mid));
      } else {
        const prevClose = nextBase[nextBase.length - 1]?.close ?? mid;
        nextBase.push(walkClosedFromPrev(pairId, CANDLE_BASE_TF, bt, prevClose));
      }
    }
    const tip = tipBarFromPaperClock(pairId, CANDLE_BASE_TF, t, nowMs, mid);
    const prevClose = nextBase[nextBase.length - 1]?.close;
    if (prevClose && prevClose > 0) {
      // CEX contiguity across the rollover boundary.
      tip.open = prevClose;
      tip.high = Math.max(tip.high, tip.open, tip.close);
      tip.low = Math.min(tip.low, tip.open, tip.close);
    }
    nextBase = [...nextBase, tip].slice(-MAX_CANDLES);
  }

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

  // Pin walk so older bars open into `first.open` without O(n²) walkPriceAt scans.
  const tipMid = first.open > 0 ? first.open : paperPairMid(pairId, first.time * 1000);
  const older: Candle[] = [];
  const raw: number[] = [1];
  const times: number[] = [];
  for (let i = n; i >= 1; i--) {
    const t = first.time - i * sec;
    if (t < genesis) continue;
    times.push(t);
  }
  if (!times.length) return existing;
  for (let i = 0; i < times.length; i++) {
    if (i === 0) continue;
    const t = times[i]!;
    const shock = barReturn(pairId, tf, t);
    const revert = -0.12 * Math.log(Math.max(1e-9, raw[i - 1]!));
    raw.push(raw[i - 1]! * (1 + shock + revert));
  }
  const tipRaw = raw[raw.length - 1] || 1;
  const scale = tipRaw > 0 ? tipMid / tipRaw : tipMid;
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    const close = raw[i]! * scale;
    const open =
      older.length > 0
        ? older[older.length - 1]!.close
        : close * (1 + barReturn(pairId, tf, t) * 0.35);
    older.push(makeBar(pairId, t, open, close, tf));
  }
  // Contiguity: last older close → first.open
  const lastOlder = older[older.length - 1]!;
  if (lastOlder && first.open > 0) {
    lastOlder.close = first.open;
    lastOlder.high = Math.max(lastOlder.high, lastOlder.open, first.open);
    lastOlder.low = Math.min(lastOlder.low, lastOlder.open, first.open);
  }
  return [...older, ...existing];
}

/**
 * Soft-MM fills print at bid/ask (often 100–160 bps off mid). Chart tip close must
 * stay near L2 mid; allow a visible wick + small close nudge toward the fill so
 * own trades paint immediately (not only on the next Soft-MM breathe).
 */
export function clampFillWickPx(anchorMid: number, fillPx: number, maxBps = 45): number {
  if (!(anchorMid > 0) || !Number.isFinite(anchorMid)) return fillPx;
  if (!(fillPx > 0) || !Number.isFinite(fillPx)) return anchorMid;
  const lo = anchorMid * (1 - maxBps / 10_000);
  const hi = anchorMid * (1 + maxBps / 10_000);
  return Math.min(hi, Math.max(lo, fillPx));
}

/** Nudge tip close toward a fill (capped) so the candle tip reacts instantly. */
export function nudgeCloseTowardFill(anchorMid: number, fillPx: number, maxBps = 12): number {
  if (!(anchorMid > 0) || !Number.isFinite(anchorMid)) return fillPx;
  if (!(fillPx > 0) || !Number.isFinite(fillPx)) return anchorMid;
  const lo = anchorMid * (1 - maxBps / 10_000);
  const hi = anchorMid * (1 + maxBps / 10_000);
  return Math.min(hi, Math.max(lo, fillPx));
}

export function upsertTick(
  candles: Candle[],
  tf: Timeframe,
  mid: number,
  pairId: PairId,
  prevMid?: number,
  opts?: { syntheticVolume?: boolean },
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
  // Body-clamp Last only while updating an in-progress tip. After gap heal / rollover the
  // prior close can walk past maxBody — clamping here would pin tip.close off Soft-MM Last;
  // textureLiveBar adjusts tip open so close can stay on mid.
  if (last && last.time === t && finiteMid(last.open) && !disc) {
    safeMid = clampTickMid(safeMid, last.open, maxBody);
  }
  const addVol = opts?.syntheticVolume !== false;
  const tickVol = addVol ? 150 + stableUnit([pairId, tf, t, safeMid.toPrecision(12), "tick-vol"]) * 2200 : 0;
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
    // Soft-MM sticky mid → paint walk texture so tip isn't a flat tick.
    return textureLiveBar(pairId, tf, finish(tip), safeMid);
  };

  if (prevMid !== undefined && last && last.time === t) {
    copy[copy.length - 1] = applyTip({ ...last });
    return copy.slice(-MAX_CANDLES);
  }

  if (!last || last.time < t) {
    // Soft-MM sticky Last: while live, tip.close = mid. On rollover we MUST finalize
    // that bar to a walked close — otherwise every closed candle keeps the same
    // close (шильдики glued to the last-price line).
    if (last && last.time < t) {
      copy[copy.length - 1] = finalizeClosedTip(pairId, tf, last, safeMid);
    }
    if (last && last.time + sec < t) {
      // Idle UTC holes → flat hold (not synthetic walk). Walk fills painted spike forests.
      for (let bt = last.time + sec; bt < t; bt += sec) {
        const prevClose = copy[copy.length - 1]?.close ?? safeMid;
        copy.push(flatGapBar(bt, prevClose > 0 ? prevClose : safeMid));
        if (copy.length >= MAX_CANDLES) break;
      }
    }
    // New tip: open = finalized prior close; close tracks live Last.
    const open = copy[copy.length - 1]?.close ?? last?.close ?? safeMid;
    const close = clampTickMid(safeMid, open, maxBody);
    copy.push(
      textureLiveBar(
        pairId,
        tf,
        finish({
          time: t,
          open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close,
          volume: tickVol,
        }),
        safeMid,
      ),
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
      // Incomplete child window: keep children's open (first available), never invent mid-day doji spikes.
      const expectedChildren = Math.max(1, Math.floor(dstSec / TF_SEC[CANDLE_BASE_TF]));
      if (children.length < expectedChildren * 0.9) {
        live.open = children[0]!.open;
        live.high = Math.max(live.high, live.open, live.close);
        live.low = Math.min(live.low, live.open, live.close);
      }
      const lastT = series[series.length - 1]!.time;
      if (lastT === tipT) {
        series[series.length - 1] = live;
      } else if (lastT < tipT) {
        series.push(live);
        all[tf] = series.slice(-MAX_CANDLES);
      } else {
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
  opts?: { syntheticVolume?: boolean },
): Partial<Record<Timeframe, Candle[]>> {
  let prevBase = candlesByTf[CANDLE_BASE_TF] ?? [];
  // Inactive pairs / stale cache can carry holes — tip-only upsert never backfills them.
  if (prevBase.length >= 2 && !candlesAreContiguous(prevBase, CANDLE_BASE_TF)) {
    prevBase = ensureContiguousCandles(prevBase, CANDLE_BASE_TF, {
      pairId,
      fillToNow: true,
    });
  }
  const nextRaw = upsertTick(prevBase, CANDLE_BASE_TF, mid, pairId, prevMid, opts);
  // Tip-run heal for Soft-MM шильдики — avoid full-history rewrite (spike forests).
  const healedRaw = healFlatPaperBars(pairId, CANDLE_BASE_TF, nextRaw, mid, Date.now(), {
    scope: "tipRun",
  });
  const nextBase = sanitizeCandlesForChart(healedRaw, pairId, CANDLE_BASE_TF);
  // Keep only clear print spikes from pre-heal raw. Always re-clip — unclipped
  // Soft-MM deep-take highs painted the long needle combs on 1m/15m.
  const rawByT = new Map(nextRaw.map((c) => [c.time, c]));
  const bodyCap = maxBodyFracForTf(CANDLE_BASE_TF);
  const wickCap = maxWickFracForTf(CANDLE_BASE_TF);
  for (let i = 0; i < nextBase.length; i++) {
    const bar = { ...nextBase[i]! };
    const raw = rawByT.get(bar.time);
    if (!raw) continue;
    const midPx = Math.max(raw.close, bar.close, 1e-12);
    const rawSpan = (raw.high - raw.low) / midPx;
    const healedSpan = (bar.high - bar.low) / midPx;
    if (rawSpan > 0.018 && rawSpan > healedSpan * 1.5) {
      bar.high = Math.max(bar.high, raw.high, bar.open, bar.close);
      bar.low = Math.min(bar.low, raw.low, bar.open, bar.close);
      nextBase[i] = constrainBarToOpen(bar, bodyCap, wickCap);
    }
  }
  // Sanitize/heal must never yank tip.close off Soft-MM / tape Last.
  const tipIdx = nextBase.length - 1;
  if (tipIdx >= 0 && mid > 0 && Number.isFinite(mid)) {
    const tipBar = nextBase[tipIdx]!;
    const pinned = constrainBarToOpen(
      {
        ...tipBar,
        close: mid,
        high: Math.max(tipBar.high, tipBar.open, mid),
        low: Math.min(tipBar.low, tipBar.open, mid),
      },
      bodyCap,
      wickCap,
    );
    // constrain may soften close toward open — force Last, keep clipped wicks.
    nextBase[tipIdx] = {
      ...pinned,
      close: mid,
      high: Math.max(pinned.high, pinned.open, mid),
      low: Math.min(pinned.low, pinned.open, mid),
    };
  }
  const all = deriveAllTimeframes(nextBase, pairId, candlesByTf);
  reaggregateLiveBarsFromBase(all, nextBase);
  for (const tf of Object.keys(all) as Timeframe[]) {
    if (tf === CANDLE_BASE_TF) {
      // Already sanitized + tip extrema preserved — do not crush again.
      all[tf] = nextBase;
      continue;
    }
    let series = all[tf];
    if (!series?.length) continue;
    series = finalizeTfSeries(tf, series, pairId);
    // Coarser TF holes after idle rotate — walk-fill so every market stays contiguous.
    if (series.length >= 2 && !candlesAreContiguous(series, tf)) {
      series = ensureContiguousCandles(series, tf, { pairId, fillToNow: true });
      series = finalizeTfSeries(tf, series, pairId);
    }
    all[tf] = series;
  }
  return all;
}

function finiteMid(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Idle UTC hole — hold prior close. Tiny wick so LWC paints a visible tick (not blank strip). */
function flatGapBar(t: number, px: number): Candle {
  const p = px > 0 && Number.isFinite(px) ? px : 1e-12;
  // ~8 bps body floor — 1.2 bps dojis painted Soft-MM «dotted ruler» lines on 1m.
  const body = p * 0.0008;
  const wick = p * 0.00035;
  const close = p + body;
  return {
    time: t,
    open: p,
    high: close + wick,
    low: Math.max(p - wick, p * 1e-6),
    close,
    volume: 0,
  };
}

/**
 * Idle gap with a gentle constrained walk — real candle bodies, no spike forest.
 * Prefer this over flatGapBar when pairId is known (contiguous heal / paint).
 */
function idleHoldBar(pairId: PairId, tf: Timeframe, t: number, prevClose: number): Candle {
  const open = prevClose > 0 && Number.isFinite(prevClose) ? prevClose : 1e-12;
  const walked = walkClosedFromPrev(pairId, tf, t, open);
  // Tight caps: breathe like liquid spot, never mile-long Soft-MM needles.
  return constrainBarToOpen(walked, 0.0025, 0.0018);
}

/**
 * Display floor so LWC never paints Soft-MM hairline dojis as a dotted ruler.
 * Tip close stays on Last; only open is nudged when the tip is flat.
 */
export function ensurePaintableBodies(candles: Candle[], tf: Timeframe): Candle[] {
  if (candles.length < 2) return candles;
  // Floor bodies high enough that LWC still paints when Y-span covers a Soft-MM swing.
  const minBody =
    tf === "30s" || tf === "1m"
      ? 0.0024
      : tf === "3m" || tf === "5m"
        ? 0.0026
        : tf === "15m"
          ? 0.0028
          : 0.0032;
  const out = candles.map((c) => ({ ...c }));
  const tipIdx = out.length - 1;
  for (let i = 0; i < tipIdx; i++) {
    const c = out[i]!;
    const mid = Math.max(Math.abs(c.close), Math.abs(c.open), 1e-12);
    if (Math.abs(c.close - c.open) / mid >= minBody) continue;
    const sign = Math.sign(c.close - c.open) || (stableSigned([tf, c.time, "body"], 0.5) >= 0 ? 1 : -1);
    const close = c.open * (1 + sign * minBody);
    out[i] = {
      ...c,
      close,
      high: Math.max(c.high, c.open, close),
      low: Math.min(c.low, c.open, close),
    };
  }
  const tip = out[tipIdx]!;
  const tipMid = tip.close > 0 ? tip.close : tip.open;
  if (tipMid > 0 && Math.abs(tip.close - tip.open) / tipMid < minBody * 0.7) {
    const sign = tip.open <= tip.close ? -1 : 1;
    const open = tipMid * (1 + sign * minBody * 0.75);
    out[tipIdx] = {
      ...tip,
      open,
      high: Math.max(tip.high, open, tip.close),
      low: Math.min(tip.low, open, tip.close),
    };
  }
  return out;
}

/**
 * Live Soft-MM mids often move &lt;3 bps — raw tip close=mid looks like a ruler.
 * Tip close always tracks Last (`tipMid`); open/wicks from paper-clock (+ lived extremes).
 * Print fills must pass tipMid=fill (via liveLastPrice) — do not keep a drifted bar.close
 * from synthetic tickVol / gap clamp (that painted false «print energy»).
 */
export function textureLiveBar(
  pairId: PairId,
  tf: Timeframe,
  bar: Candle,
  tipMid: number,
  nowMs = Date.now(),
): Candle {
  const mid = tipMid > 0 && Number.isFinite(tipMid) ? tipMid : bar.close;
  if (!(mid > 0)) return bar;

  const painted = tipBarFromPaperClock(pairId, tf, bar.time, nowMs, mid);
  const maxBody = maxBodyFracForTf(tf);
  // Keep lived open when it still allows tip.close = Last inside the body cap.
  // After a long gap walk, prior close can drift past maxBody — fall back to a modest
  // paper open (not a far paper-clock open that paints Soft-MM needle floors).
  const livedOpenOk =
    bar.open > 0 &&
    Math.abs(bar.open - mid) / mid > 0.00025 &&
    Math.abs(bar.open - mid) / mid <= maxBody * 0.98;
  let open = livedOpenOk ? bar.open : painted.open;
  if (!(open > 0) || Math.abs(open - mid) / mid > maxBody * 0.98) {
    // Soft-MM sticky Last: small body only — far opens become the red needle comb.
    const sign = open > mid ? 1 : -1;
    open = mid * (1 + sign * maxBody * 0.35);
  }
  const close = mid;
  // Sticky Soft-MM (<5 bps tip move): never import paper-clock wick extremes —
  // those painted the flat-bottom needle forest glued to Last. Keep lived print
  // highs/lows; only drop synthetic paper-clock expansion.
  const sticky =
    Number.isFinite(bar.close) &&
    bar.close > 0 &&
    Math.abs(bar.close - mid) / mid < 0.0005;
  const livedHigh = Number.isFinite(bar.high) ? bar.high : 0;
  const livedLow = Number.isFinite(bar.low) ? bar.low : Infinity;
  const high = sticky
    ? Math.max(open, close, livedHigh)
    : Math.max(painted.high, open, close, livedHigh);
  const low = sticky
    ? Math.min(open, close, livedLow)
    : Math.min(painted.low, open, close, livedLow);
  return constrainBarToOpen(
    {
      time: bar.time,
      open,
      high,
      low,
      close,
      volume: bar.volume > 0 ? bar.volume : painted.volume,
    },
    maxBody,
    maxWickFracForTf(tf),
  );
}

/** True when a candle is a doji tick (Soft-MM peg / flat gap fill). */
function barLooksFlat(c: Candle, mid: number): boolean {
  const m = mid > 0 ? mid : c.close;
  if (!(m > 0)) return true;
  // ≤1.5 bps body = Soft-MM comb / peg. Real paper-walk bodies are larger.
  return Math.abs(c.close - c.open) / m < 0.00015;
}

/**
 * Finalize a just-closed tip: freeze a walked close from the lived open.
 * Never leave Soft-MM Last as the eternal close (шильдики on the last-price line).
 */
export function finalizeClosedTip(
  pairId: PairId,
  tf: Timeframe,
  tip: Candle,
  _tipMid: number,
): Candle {
  const sec = TF_SEC[tf];
  const open = tip.open > 0 && Number.isFinite(tip.open) ? tip.open : tip.close;
  if (!(open > 0)) return tip;
  let close = open * Math.exp(barReturn(pairId, tf, tip.time + sec));
  if (!(close > 0) || !Number.isFinite(close)) close = open;
  // Guarantee a visible body so Soft-MM quiet minutes still close as real candles.
  const minBody = open * 0.00035;
  if (Math.abs(close - open) < minBody) {
    const sign = Math.sign(barReturn(pairId, tf, tip.time) || 1) || 1;
    close = open + sign * minBody;
  }
  return constrainBarToOpen(
    {
      time: tip.time,
      open,
      high: Math.max(tip.high, open, close),
      low: Math.min(tip.low, open, close),
      close,
      volume: tip.volume > 0 ? tip.volume : candleVolume(pairId, tf, tip.time),
    },
    maxBodyFracForTf(tf),
    maxWickFracForTf(tf),
  );
}

/** One closed bar stepped from prior close (O(1) — no tip-pin O(n) walk). */
function walkClosedFromPrev(pairId: PairId, tf: Timeframe, t: number, prevClose: number): Candle {
  const open = prevClose > 0 ? prevClose : 1e-12;
  let close = open * Math.exp(barReturn(pairId, tf, t + TF_SEC[tf]));
  if (!(close > 0) || !Number.isFinite(close)) close = open;
  return makeBar(pairId, t, open, close, tf);
}

/**
 * Replace Soft-MM «шильдики» runs — closes glued to one peg (even if opens/wicks vary).
 * Also heals classic doji combs. Uses incremental walk so closed bars keep distinct closes;
 * only the live tip stays pinned to tipMid.
 *
 * `scope: "tipRun"` (default for live desk) only rewrites the trailing stuck-close run that
 * includes the tip — mid-history rewrites painted crooked spike forests after idle Soft-MM.
 * Pass `scope: "all"` for paper seed / unit tests that still want full-history heal.
 */
export function healFlatPaperBars(
  pairId: PairId,
  tf: Timeframe,
  candles: Candle[],
  tipMid: number,
  nowMs = Date.now(),
  opts?: { scope?: "all" | "tipRun" },
): Candle[] {
  if (candles.length < 6) return candles;
  const tip = tipMid > 0 && Number.isFinite(tipMid) ? tipMid : candles[candles.length - 1]!.close;
  if (!(tip > 0)) return candles;
  const tipIdx = candles.length - 1;
  const scope = opts?.scope ?? "all";

  // Stuck-close run: consecutive bars share nearly the same close (шильдики / dotted ruler).
  type Run = { start: number; end: number };
  const runs: Run[] = [];
  let runStart = 0;
  let runAnchor = candles[0]!.close;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    // Soft-MM peg often drifts <3 bps — treat as stuck ruler (was 4 bps).
    const stuck = runAnchor > 0 && Math.abs(c.close - runAnchor) / runAnchor < 0.00055;
    if (stuck) continue;
    if (i - runStart >= 3) runs.push({ start: runStart, end: i - 1 });
    runStart = i;
    runAnchor = c.close > 0 ? c.close : runAnchor;
  }
  if (candles.length - runStart >= 3) {
    runs.push({ start: runStart, end: candles.length - 1 });
  }
  // tipRun: heal tip-stuck run + mid-history Soft-MM rulers (≥5 bars).
  const scoped =
    scope === "tipRun"
      ? runs.filter((r) => (r.start <= tipIdx && tipIdx <= r.end) || r.end - r.start >= 4)
      : runs;
  // No stuck-close run to rewrite — leave series alone (esp. print highs on the tip bar).
  if (!scoped.length) return candles;

  const out = candles.map((c) => ({ ...c }));
  const healBody = Math.min(0.004, maxBodyFracForTf(tf));
  const healWick = Math.min(0.0025, maxWickFracForTf(tf));
  for (const { start, end } of scoped) {
    let px =
      start > 0 && out[start - 1]!.close > 0
        ? out[start - 1]!.close
        : out[start]!.open > 0
          ? out[start]!.open
          : tip;
    for (let i = start; i <= end; i++) {
      if (i === tipIdx) continue;
      const lived = out[i]!;
      const walked = walkClosedFromPrev(pairId, tf, lived.time, px);
      // Keep modest print extremes; constrain so heal never paints spike forests.
      out[i] = constrainBarToOpen(
        {
          ...walked,
          high: Math.max(walked.high, lived.high, walked.open, walked.close),
          low: Math.min(walked.low, lived.low, walked.open, walked.close),
          volume: lived.volume > 0 ? lived.volume : walked.volume,
        },
        healBody,
        healWick,
      );
      px = out[i]!.close;
    }
    if (end + 1 < out.length && end + 1 !== tipIdx) {
      const bridge = out[end]!;
      const next = out[end + 1]!;
      next.open = bridge.close;
      next.high = Math.max(next.high, next.open, next.close);
      next.low = Math.min(next.low, next.open, next.close);
    }
  }

  // Live tip always tracks Last; open continues from healed prior close.
  const prevClose = out[tipIdx - 1]?.close;
  out[tipIdx] = textureLiveBar(
    pairId,
    tf,
    {
      ...out[tipIdx]!,
      open: prevClose && prevClose > 0 ? prevClose : out[tipIdx]!.open,
      high: Math.max(out[tipIdx]!.high, prevClose || 0, tip),
      low: Math.min(out[tipIdx]!.low, prevClose || tip, tip),
      close: tip,
    },
    tip,
    nowMs,
  );
  return out;
}

/** Walk-fill idle gaps with closed paper-clock bars (never flat dojis). */
function walkGapBar(
  pairId: PairId,
  tf: Timeframe,
  t: number,
  tipMid: number,
  tipBucket?: number,
): Candle {
  void tipBucket;
  // Prefer O(1) step from tipMid as open — tip-pin walk made just-closed close=mid again.
  return walkClosedFromPrev(pairId, tf, t, tipMid > 0 ? tipMid : 1e-12);
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
      // Idle UTC hole: constrained walk (pair known) or fattened hold — never 1bps doji rulers.
      const open = px > 0 ? px : tipPxFallback(byBucket, times, px);
      const fill =
        pairId != null
          ? idleHoldBar(pairId, tf, t, open > 0 ? open : 1e-12)
          : flatGapBar(t, open > 0 ? open : 1e-12);
      out.push(fill);
      px = fill.close;
    }
  }
  return sanitizeCandleVolumes(out.slice(-MAX_CANDLES), pairId);
}

function tipPxFallback(
  byBucket: Map<number, Candle>,
  times: number[],
  px: number,
): number {
  const last = byBucket.get(times[times.length - 1]!);
  return last && last.close > 0 ? last.close : px > 0 ? px : 1e-12;
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

/** Public tape / fill print for OHLC hydration after F5. */
export type CandlePrint = {
  ts: number;
  price: number;
  amountBase?: number;
};

/** v13: discard v12 after backward-tip paint (ceiling+needles Soft-MM on 1D/all TF). */
const LIVE_CANDLE_CACHE_PREFIX = "hackme-ex-live-1m:v13:";

/** Persist 1m series across F5 (sessionStorage — survives reload, not cross-browser). */
export function saveLiveCandleCache(pairId: PairId, base1m: Candle[]): void {
  if (typeof sessionStorage === "undefined" || !base1m.length) return;
  try {
    const slim = base1m.slice(-360).map((c) => ({
      t: c.time,
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
      v: c.volume,
    }));
    sessionStorage.setItem(LIVE_CANDLE_CACHE_PREFIX + pairId, JSON.stringify({ at: Date.now(), bars: slim }));
  } catch {
    /* quota */
  }
}

export function loadLiveCandleCache(pairId: PairId, maxAgeMs = 6 * 60 * 60_000): Candle[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LIVE_CANDLE_CACHE_PREFIX + pairId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      at?: number;
      bars?: { t: number; o: number; h: number; l: number; c: number; v: number }[];
    };
    if (!parsed?.bars?.length || !Array.isArray(parsed.bars)) return null;
    if (parsed.at && Date.now() - parsed.at > maxAgeMs) return null;
    const out: Candle[] = [];
    for (const b of parsed.bars) {
      const t = Number(b?.t);
      const o = Number(b?.o);
      const h = Number(b?.h);
      const l = Number(b?.l);
      const c = Number(b?.c);
      const v = Number(b?.v);
      if (!(t > 0) || ![o, h, l, c].every((n) => Number.isFinite(n) && n > 0)) continue;
      if (!(h >= Math.max(o, c) && l <= Math.min(o, c))) continue;
      out.push({
        time: t,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(v) && v >= 0 ? v : 0,
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Build 1m OHLC from public prints, merge session cache, pad short history with
 * paper walk, then derive all TFs. Used on live desk after F5 so spikes survive.
 */
export function hydrateLiveCandlesFromPrints(
  pairId: PairId,
  prints: CandlePrint[],
  tipMid: number,
  nowMs = Date.now(),
  cached1m?: Candle[] | null,
): Record<Timeframe, Candle[]> {
  const sec = TF_SEC[CANDLE_BASE_TF];
  const byBucket = new Map<number, Candle>();

  const ingest = (rows: Candle[]) => {
    for (const c of rows) {
      if (!(c.time > 0) || !(c.close > 0)) continue;
      if (c.time < CHART_GENESIS_UNIX) continue;
      const prev = byBucket.get(c.time);
      if (!prev) {
        byBucket.set(c.time, { ...c });
      } else {
        // Prefer later close; expand high/low.
        prev.high = Math.max(prev.high, c.high, c.open, c.close);
        prev.low = Math.min(prev.low, c.low, c.open, c.close);
        prev.close = c.close;
        prev.volume = Math.max(prev.volume, c.volume);
      }
    }
  };

  if (cached1m?.length) ingest(cached1m);

  const sorted = [...prints]
    .filter((p) => p.price > 0 && Number.isFinite(p.price) && p.ts > 0)
    .sort((a, b) => a.ts - b.ts);
  for (const p of sorted) {
    const t = Math.floor(p.ts / 1000 / sec) * sec;
    if (t < CHART_GENESIS_UNIX) continue;
    const vol = p.amountBase && p.amountBase > 0 ? p.amountBase : 0;
    const prev = byBucket.get(t);
    if (!prev) {
      byBucket.set(t, {
        time: t,
        open: p.price,
        high: p.price,
        low: p.price,
        close: p.price,
        volume: vol,
      });
    } else {
      prev.high = Math.max(prev.high, p.price);
      prev.low = Math.min(prev.low, p.price);
      prev.close = p.price;
      prev.volume += vol;
    }
  }

  let base = [...byBucket.values()].sort((a, b) => a.time - b.time);
  const tip = tipMid > 0 && Number.isFinite(tipMid) ? tipMid : base[base.length - 1]?.close ?? 0;

  // Pad short real history with paper walk ending at first real open / tip.
  const want = Math.min(barCountForTf(CANDLE_BASE_TF, nowMs), 400);
  if (base.length < 24 && tip > 0) {
    const seedMid = chartAnchorMid(base[0]?.open || tip) || tip;
    const seeded = seedCandles(pairId, CANDLE_BASE_TF, seedMid, want, nowMs);
    const firstReal = base[0]?.time;
    if (firstReal) {
      base = [...seeded.filter((c) => c.time < firstReal), ...base];
    } else {
      base = seeded;
    }
  }

  // Ensure forming tip bucket exists. Never overwrite print close with Soft-MM tipMid.
  if (tip > 0) {
    const tNow = bucket(nowMs, CANDLE_BASE_TF);
    const last = base[base.length - 1];
    if (!last || last.time < tNow) {
      const open = last?.close ?? tip;
      base.push({
        time: tNow,
        open,
        high: Math.max(open, tip),
        low: Math.min(open, tip),
        close: tip,
        volume: 0,
      });
    } else if (last.time === tNow) {
      const hasPrintVol = (last.volume || 0) > 0;
      // Extend range toward tip mid, but keep print-driven close when this bar traded.
      last.high = Math.max(last.high, tip, last.open, last.close);
      last.low = Math.min(last.low, tip, last.open, last.close);
      if (!hasPrintVol) {
        last.close = tip;
        last.high = Math.max(last.high, tip, last.open);
        last.low = Math.min(last.low, tip, last.open);
      }
    }
  }

  base = sanitizeDerivedCandlesForChart(base.slice(-MAX_CANDLES), pairId);
  // Print islands / stale cache leave UTC holes — flat-fill before any tip heal.
  if (base.length >= 2 && !candlesAreContiguous(base, CANDLE_BASE_TF)) {
    base = ensureContiguousCandles(base, CANDLE_BASE_TF, {
      pairId,
      fillToNow: true,
      nowMs,
    });
  }
  // Tip-run only — never rewrite mid-history print/seed into fake chop.
  if (tip > 0) {
    base = healFlatPaperBars(pairId, CANDLE_BASE_TF, base, tip, nowMs, { scope: "tipRun" });
  }
  const all = deriveAllTimeframes(base, pairId);
  reaggregateLiveBarsFromBase(all, base);
  all[CANDLE_BASE_TF] = base;
  return all as Record<Timeframe, Candle[]>;
}
