#!/usr/bin/env npx tsx
/**
 * Live Soft-MM tape → candle paint probe (all pairs × all TFs).
 *   npx vite-node scripts/live_candle_paint_probe.ts
 */
import { displayCapCandles, paintedCandleHealth, paintMaxBodyFracForTf } from "../src/chartScale";
import {
  CANDLE_BASE_TF,
  ensureContiguousCandles,
  ensureTfSeriesCadence,
  hydrateLiveCandlesFromPrints,
  type CandlePrint,
} from "../src/candles";
import { TIMEFRAMES, type PairId, type Timeframe } from "../src/types";

const API = (process.env.EXCHANGE_API || "https://exchange-api.hackme.tech").replace(/\/$/, "");

const PAIRS: { id: PairId; api: string }[] = [
  { id: "HMC_USDT", api: "HMC/USDT" },
  { id: "SUP_USDT", api: "SUP/USDT" },
  { id: "HMC_SUP", api: "HMC/SUP" },
  { id: "HMC_BTC", api: "HMC/BTC" },
  { id: "SUP_BTC", api: "SUP/BTC" },
];

async function load(apiPair: string): Promise<{ prints: CandlePrint[]; last: number }> {
  const enc = encodeURIComponent(apiPair);
  const trades =
    ((await (await fetch(`${API}/trades?pair=${enc}&limit=100`)).json()) as {
      trades?: { created_at?: string; price: number; qty?: number }[];
    }).trades || [];
  const tickers = (await (await fetch(`${API}/tickers`)).json()) as {
    tickers?: { pair: string; last: number }[];
  };
  const tk = (tickers.tickers || []).find((t) => t.pair === apiPair);
  const last = Number(tk?.last || 0) / 1e8;
  const prints: CandlePrint[] = trades
    .map((t) => ({
      ts: Date.parse(t.created_at || "") || Date.now(),
      price: Number(t.price) / 1e8,
      amountBase: Number(t.qty || 0) / 1e8,
    }))
    .filter((p) => p.price > 0)
    .sort((a, b) => a.ts - b.ts);
  return { prints, last };
}

async function main(): Promise<void> {
  const issues: string[] = [];
  for (const meta of PAIRS) {
    const { prints, last } = await load(meta.api);
    if (!(last > 0)) {
      issues.push(`${meta.id}: no last`);
      continue;
    }
    const all = hydrateLiveCandlesFromPrints(meta.id, prints, last, Date.now(), null);
    for (const tf of TIMEFRAMES) {
      const repaired = ensureTfSeriesCadence(all, meta.id, tf);
      let series = repaired[tf] || repaired[CANDLE_BASE_TF] || [];
      if (series.length < 2) {
        issues.push(`${meta.id}@${tf}: short series ${series.length}`);
        continue;
      }
      series = ensureContiguousCandles(series, tf, { pairId: meta.id, fillToNow: true });
      const painted = displayCapCandles(series, tf);
      const health = paintedCandleHealth(painted, last, tf);
      console.log(
        `${meta.id}@${tf}: n=${painted.length} tipDrift=${(health.tipDrift * 100).toFixed(3)}% tipBody=${(health.tipBody * 100).toFixed(2)}% histVsTip=${(health.histVsTip * 100).toFixed(2)}% span=${(health.spanFrac * 100).toFixed(2)}% islands=${health.islands} minBody=${(health.minClosedBody * 100).toFixed(3)}% squash=${health.floorSquash}`,
      );
      if (health.tipDrift > 0.008) {
        issues.push(`${meta.id}@${tf}: tip not Last (${(health.tipDrift * 100).toFixed(2)}%)`);
      }
      if (health.floorSquash) issues.push(`${meta.id}@${tf}: floor-squash screenshot class`);
      if (health.tipBody > paintMaxBodyFracForTf(tf) * 1.15) {
        issues.push(`${meta.id}@${tf}: tip body ${(health.tipBody * 100).toFixed(1)}%`);
      }
      // Tip open may bridge after body-cap; only fail closed-bar islands.
      let closedIslands = 0;
      for (let i = 1; i < painted.length - 1; i++) {
        const jump =
          Math.abs(painted[i]!.open - painted[i - 1]!.close) / Math.max(painted[i - 1]!.close, 1e-12);
        if (jump > 0.05) closedIslands++;
      }
      if (closedIslands > 0) issues.push(`${meta.id}@${tf}: ${closedIslands} closed islands`);
      const shortTf = (["30s", "1m", "3m", "5m", "15m"] as Timeframe[]).includes(tf);
      if (shortTf && health.minClosedBody < 0.0004 && painted.length > 10) {
        issues.push(`${meta.id}@${tf}: hairline closed bodies`);
      }
    }
  }
  console.log("\nISSUES", issues.length ? issues : "none");
  if (issues.length) process.exit(1);
  console.log("[live-candle-paint] PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
