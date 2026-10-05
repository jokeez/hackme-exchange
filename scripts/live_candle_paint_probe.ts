#!/usr/bin/env npx tsx
/**
 * Live Soft-MM tape → candle paint probe (all pairs × all TFs).
 *   npx tsx scripts/live_candle_paint_probe.ts
 */
import { displayCapCandles } from "../src/chartScale";
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
  const trades = ((await (await fetch(`${API}/trades?pair=${enc}&limit=100`)).json()) as { trades?: { created_at?: string; price: number; qty?: number }[] }).trades || [];
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
      // Same path as chart.ts prepCandles.
      series = ensureContiguousCandles(series, tf, { pairId: meta.id, fillToNow: true });
      const painted = displayCapCandles(series, tf);
      const tip = painted[painted.length - 1]!;
      const tipDrift = Math.abs(tip.close - last) / last;
      let islands = 0;
      let maxBodyClosed = 0;
      let maxWick = 0;
      let maxOpenJump = 0;
      const tipBody = Math.abs(tip.close - tip.open) / Math.max(tip.open, 1e-18);
      for (let i = 0; i < painted.length; i++) {
        const c = painted[i]!;
        const midb = (c.open + c.close) / 2;
        if (i < painted.length - 1) {
          maxBodyClosed = Math.max(maxBodyClosed, Math.abs(c.close - c.open) / Math.max(c.open, 1e-18));
        }
        maxWick = Math.max(maxWick, (c.high - c.low) / Math.max(midb, 1e-18));
        if (i > 0) {
          const jump = Math.abs(c.open - painted[i - 1]!.close) / Math.max(painted[i - 1]!.close, 1e-18);
          maxOpenJump = Math.max(maxOpenJump, jump);
          if (jump > 0.05) islands++;
        }
      }
      const closed = painted.slice(0, -1);
      const uniq = new Set(closed.map((c) => c.close.toFixed(8))).size;
      const sticky =
        closed.length > 0
          ? closed.filter((c) => Math.abs(c.close - last) / last < 0.0002).length / closed.length
          : 0;
      const shortTf = (["30s", "1m", "3m", "5m", "15m"] as Timeframe[]).includes(tf);
      const bodyCap = shortTf ? 0.08 : 0.15;
      const wickCap = shortTf ? 0.12 : 0.4;
      console.log(
        `${meta.id}@${tf}: n=${painted.length} tipDrift=${(tipDrift * 100).toFixed(3)}% closedBody=${(maxBodyClosed * 100).toFixed(2)}% tipBody=${(tipBody * 100).toFixed(2)}% maxWick=${(maxWick * 100).toFixed(2)}% islands=${islands} openJump=${(maxOpenJump * 100).toFixed(2)}% uniqClosed=${uniq} stickyTail=${(sticky * 100).toFixed(0)}%`,
      );
      // Ticker vs last print can race a few bps on live Soft-MM.
      if (tipDrift > 0.008) issues.push(`${meta.id}@${tf}: tip not Last (${(tipDrift * 100).toFixed(2)}%)`);
      if (islands > 0) issues.push(`${meta.id}@${tf}: ${islands} islands`);
      if (maxBodyClosed > bodyCap) {
        issues.push(`${meta.id}@${tf}: closed body ${(maxBodyClosed * 100).toFixed(1)}%>${bodyCap * 100}%`);
      }
      if (maxWick > wickCap) issues.push(`${meta.id}@${tf}: wick ${(maxWick * 100).toFixed(1)}%>${wickCap * 100}%`);
      if (shortTf && sticky > 0.85 && closed.length > 8) {
        issues.push(`${meta.id}@${tf}: Soft-MM ruler sticky=${(sticky * 100).toFixed(0)}%`);
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
