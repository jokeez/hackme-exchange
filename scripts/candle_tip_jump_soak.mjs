#!/usr/bin/env node
/**
 * Node soak: 50 tip jumps 0.05→0.08 — closed OHLC must stay frozen.
 *   node --import tsx scripts/candle_tip_jump_soak.mjs
 *   npx vite-node scripts/candle_tip_jump_soak.ts
 */
import {
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  hydrateLiveCandlesFromPrints,
  mergeDurableApiCandlesIntoBase,
} from "../src/candles.ts";

const nowMs = Date.UTC(2026, 9, 24, 12, 0, 0);
const sec = 60;
const tNow = Math.floor(nowMs / 1000 / sec) * sec;
const path = [];
const hours = 48;
const n = hours * 60;
for (let i = 0; i < n; i++) {
  const t = tNow - (n - i) * sec;
  const frac = i / Math.max(1, n - 1);
  const px = 0.05 + (0.072 - 0.05) * frac;
  path.push({
    time: t,
    open: px,
    high: px * 1.002,
    low: px * 0.998,
    close: px,
    volume: i % 5 === 0 ? 2 : 0,
  });
}

const tip0 = 0.072;
const tipBucketSeed = path[path.length - 1].time;
const prints0 = [
  { ts: (path[path.length - 3].time) * 1000, price: 0.071, amountBase: 2 },
  { ts: (path[path.length - 2].time) * 1000, price: 0.0715, amountBase: 1 },
  { ts: tipBucketSeed * 1000, price: tip0, amountBase: 3 },
];
// Durable SoT for closed bars (excludes forming tip) — same as GET /candles.
const durable = path
  .filter((c) => c.time < tipBucketSeed)
  .map((c) => ({ ...c, volume: Math.max(c.volume, 1) }));

let all = hydrateLiveCandlesFromPrints(
  "HMC_USDT",
  prints0,
  tip0,
  nowMs,
  path,
  { high: 0.083, low: 0.05, open: 0.07 },
  durable,
);
let base = all[CANDLE_BASE_TF];
const tipBucket = base[base.length - 1].time;
const yday = tipBucket - 24 * 3600;
const y0 = base.find((c) => c.time === yday);
if (!y0) {
  console.error("FAIL: yesterday bar missing after initial hydrate");
  process.exit(1);
}
const closedSnap = new Map();
for (const c of base) {
  if (c.time < tipBucket) closedSnap.set(c.time, { ...c });
}

let prev = tip0;
for (let i = 0; i < 50; i++) {
  const tip = 0.06 + ((i % 17) / 16) * 0.022;
  const prints = [...prints0, { ts: tipBucket * 1000 + i * 10, price: tip, amountBase: 1 }];
  all = hydrateLiveCandlesFromPrints(
    "HMC_USDT",
    prints,
    tip,
    nowMs,
    all[CANDLE_BASE_TF],
    { high: Math.max(0.083, tip), low: 0.05, open: 0.07 },
    durable,
  );
  // Freeze soak clock — wall Date.now() would fillToNow→truncate left history.
  all = applyMidToPairCandles(all, "HMC_USDT", tip, prev, {
    syntheticVolume: false,
    dayRange: { high: Math.max(0.083, tip), low: 0.05, open: 0.07 },
    nowMs,
  });
  prev = tip;
  base = all[CANDLE_BASE_TF];
  for (const c of base) {
    if (c.time >= tipBucket) continue;
    const prevBar = closedSnap.get(c.time);
    if (!prevBar) continue;
    if (
      Math.abs(c.open - prevBar.open) > 1e-12 ||
      Math.abs(c.high - prevBar.high) > 1e-12 ||
      Math.abs(c.low - prevBar.low) > 1e-12 ||
      Math.abs(c.close - prevBar.close) > 1e-12
    ) {
      console.error(`FAIL soak#${i} tip=${tip} t=${c.time} remapped`, prevBar, c);
      process.exit(1);
    }
  }
  const y = base.find((c) => c.time === yday);
  if (!y || Math.abs(y.close - y0.close) > 1e-12 || y.close >= 0.065) {
    console.error(`FAIL soak#${i} yesterday remapped`, y0, y);
    process.exit(1);
  }
}

const merged = mergeDurableApiCandlesIntoBase(
  [{ time: tipBucket, open: 0.08, high: 0.081, low: 0.079, close: 0.08, volume: 1 }],
  durable,
  tipBucket,
);
const early = merged.find((c) => c.time === durable[5].time);
if (!early || early.close !== durable[5].close) {
  console.error("FAIL mergeDurable remapped server bar");
  process.exit(1);
}

console.log("PASS candle tip-jump soak 50 cycles + durable merge");
