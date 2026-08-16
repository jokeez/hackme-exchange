import type { DemoState, MarketSnapshot, Trade } from "./types";
import { walletEquityFromMarket } from "./store";

export type PnlWindow = { label: string; pct: number; abs: number };

export type DayPnl = {
  dateKey: string;
  label: string;
  pnl: number;
};

export function snapshotEquity(state: DemoState, m: MarketSnapshot): void {
  const now = Date.now();
  const last = state.equitySnapshots[0];
  if (last && now - last.ts < 60_000) return;
  const eq = walletEquityFromMarket(state.wallet, m);
  state.equitySnapshots.unshift({ ts: now, equityUsdt: eq });
  state.equitySnapshots = state.equitySnapshots.slice(0, 5000);
}

export function pnlWindows(state: DemoState, m: MarketSnapshot): PnlWindow[] {
  const eq = walletEquityFromMarket(state.wallet, m);
  const now = Date.now();
  const windows = [
    { label: "24h", ms: 86_400_000 },
    { label: "7d", ms: 7 * 86_400_000 },
    { label: "30d", ms: 30 * 86_400_000 },
  ];
  return windows.map((w) => {
    const target = now - w.ms;
    const snap = [...state.equitySnapshots].reverse().find((s) => s.ts <= target)
      ?? state.equitySnapshots[state.equitySnapshots.length - 1];
    const base = snap?.equityUsdt ?? state.initialEquityUsdt;
    const abs = eq - base;
    const pct = base > 0 ? (abs / base) * 100 : 0;
    return { label: w.label, pct, abs };
  });
}

export function seedEquitySnapshots(state: DemoState, m: MarketSnapshot): void {
  // Honest baseline only — never invent a sine-wave equity history.
  if (state.equitySnapshots.length > 0) return;
  const eq = walletEquityFromMarket(state.wallet, m);
  state.equitySnapshots = [{ ts: Date.now(), equityUsdt: eq }];
}

/** Last ~28 calendar days of net equity day-change for heat map. */
export function dailyPnlCalendar(state: DemoState, m: MarketSnapshot, days = 28): DayPnl[] {
  const byDay = new Map<string, { first: number; last: number; ts: number }>();
  const snaps = [...state.equitySnapshots].sort((a, b) => a.ts - b.ts);
  if (!snaps.length) {
    const eq = walletEquityFromMarket(state.wallet, m);
    snaps.push({ ts: Date.now(), equityUsdt: eq });
  }
  for (const s of snaps) {
    const d = new Date(s.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cur = byDay.get(key);
    if (!cur) byDay.set(key, { first: s.equityUsdt, last: s.equityUsdt, ts: s.ts });
    else {
      cur.last = s.equityUsdt;
      cur.ts = s.ts;
    }
  }
  const out: DayPnl[] = [];
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  let prevClose = state.initialEquityUsdt;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const entry = byDay.get(key);
    let pnl = 0;
    if (entry) {
      pnl = entry.last - prevClose;
      prevClose = entry.last;
    }
    out.push({
      dateKey: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      pnl,
    });
  }
  // Do not synthesize fake day deltas — empty calendar is honest for paper.
  return out;
}

export function volumeRatio5m(
  trades: Trade[],
  pairId: string,
): { buyPct: number; sellPct: number; buyVol: number; sellVol: number } {
  const since = Date.now() - 5 * 60_000;
  let buyVol = 0;
  let sellVol = 0;
  for (const t of trades) {
    if (t.pairId !== pairId || t.ts < since) continue;
    if (t.side === "buy") buyVol += t.amountBase;
    else sellVol += t.amountBase;
  }
  const total = buyVol + sellVol;
  if (total <= 0) return { buyPct: 50, sellPct: 50, buyVol: 0, sellVol: 0 };
  const buyPct = (buyVol / total) * 100;
  return { buyPct, sellPct: 100 - buyPct, buyVol, sellVol };
}

export function renderPnlCalendarHtml(days: DayPnl[]): string {
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.pnl)), 1);
  const hasAny = days.some((d) => Math.abs(d.pnl) > 1e-9);
  return `<div class="pnl-calendar">
    <h4>Daily PnL · last ${days.length}d</h4>
    <p class="muted small pnl-cal-note">${
      hasAny
        ? "Paper equity day-change · local snapshots"
        : "Paper equity · no day history yet (trade or wait for snapshots)"
    }</p>
    <div class="pnl-cal-grid">
      ${days.map((d) => {
        const strong = Math.abs(d.pnl) / maxAbs > 0.55;
        const cls = d.pnl > 0.01 ? `pos${strong ? " strong" : ""}` : d.pnl < -0.01 ? `neg${strong ? " strong" : ""}` : "";
        const sign = d.pnl >= 0 ? "+" : "";
        return `<div class="pnl-cal-cell ${cls}" title="${d.label}: ${sign}${d.pnl.toFixed(2)} USDT"></div>`;
      }).join("")}
    </div>
    <div class="pnl-cal-legend"><span class="pos">Profit</span><span class="neg">Loss</span></div>
  </div>`;
}
