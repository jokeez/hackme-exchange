import type { DemoState, LedgerEntry, MarketSnapshot, Trade } from "./types";
import { walletEquityFromMarket } from "./store";

export type PnlWindow = { label: string; pct: number; abs: number };

export type DayPnl = {
  dateKey: string;
  label: string;
  /** Day-of-month number for calendar cell. */
  dayNum: number;
  pnl: number;
  /** True when this cell is today. */
  isToday?: boolean;
  /** True when we have any snapshot/ledger signal for the day. */
  hasData?: boolean;
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
  state.equitySnapshots = [{ ts: nowSafe(), equityUsdt: eq }];
}

function nowSafe(): number {
  return Date.now();
}

function dayKeyFromTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fee / withdrawal / deposit USDT flow per calendar day (not full mark-to-market). */
export function ledgerDayCashflow(ledger: LedgerEntry[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const e of ledger) {
    if (e.kind === "trade") continue; // trade usdtValue is notional, not PnL
    // Deposits/withdrawals move equity by transfer, not trading PnL — skip for day heat.
    if (e.kind === "deposit" || e.kind === "withdrawal" || e.kind === "transfer") continue;
    const key = dayKeyFromTs(e.ts);
    byDay.set(key, (byDay.get(key) ?? 0) + (Number.isFinite(e.usdtValue) ? e.usdtValue : 0));
  }
  return byDay;
}

/** Last ~28 calendar days of net equity day-change for heat map. */
export function dailyPnlCalendar(state: DemoState, m: MarketSnapshot, days = 28): DayPnl[] {
  const byDay = new Map<string, { first: number; last: number; ts: number }>();
  const snaps = [...state.equitySnapshots].sort((a, b) => a.ts - b.ts);
  if (!snaps.length) {
    const eq = walletEquityFromMarket(state.wallet, m);
    snaps.push({ ts: nowSafe(), equityUsdt: eq });
  }
  for (const s of snaps) {
    const key = dayKeyFromTs(s.ts);
    const cur = byDay.get(key);
    if (!cur) byDay.set(key, { first: s.equityUsdt, last: s.equityUsdt, ts: s.ts });
    else {
      cur.last = s.equityUsdt;
      cur.ts = s.ts;
    }
  }
  const cashflow = ledgerDayCashflow(state.ledger);
  const out: DayPnl[] = [];
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const todayKey = dayKeyFromTs(now.getTime());
  // Do not seed prevClose from initialEquity — a stale paper baseline paints one
  // giant red cliff day after Connect/sync to a dust/empty desk ledger.
  let prevClose: number | null = null;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dayKeyFromTs(d.getTime());
    const entry = byDay.get(key);
    const flow = cashflow.get(key) ?? 0;
    let pnl = 0;
    let hasData = false;
    if (entry) {
      hasData = true;
      // Prefer intraday change; fall back to overnight vs prior close when we have one.
      if (prevClose != null && Number.isFinite(prevClose)) {
        pnl = entry.last - prevClose;
      } else {
        pnl = entry.last - entry.first;
      }
      // Drop absurd cliffs from paper→desk resets (same heuristic as equity repair).
      if (prevClose != null && prevClose >= 1 && entry.last / prevClose < 0.05 && prevClose - entry.last > 0.5) {
        pnl = entry.last - entry.first;
      }
      // Flat equity snap but meaningful fee burn today — surface cashflow (ignore dust).
      if (Math.abs(pnl) < 1e-9 && Math.abs(flow) >= 0.01) {
        pnl = flow;
      }
      prevClose = entry.last;
    } else if (Math.abs(flow) >= 0.01) {
      // No equity snapshot that day — show fee cashflow only when material.
      hasData = true;
      pnl = flow;
    }
    out.push({
      dateKey: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      dayNum: d.getDate(),
      pnl,
      isToday: key === todayKey,
      hasData,
    });
  }
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

/** Order-book depth imbalance from visible L2 quote notional (not fake 50/50). */
export function bookDepthRatio(
  bids: { totalQuote: number; amountBase?: number }[],
  asks: { totalQuote: number; amountBase?: number }[],
): { buyPct: number; sellPct: number; buyVol: number; sellVol: number; known: boolean } {
  let buyVol = 0;
  let sellVol = 0;
  for (const l of bids) buyVol += Math.max(0, Number(l.totalQuote) || 0);
  for (const l of asks) sellVol += Math.max(0, Number(l.totalQuote) || 0);
  const total = buyVol + sellVol;
  if (!(total > 0)) return { buyPct: 50, sellPct: 50, buyVol: 0, sellVol: 0, known: false };
  const buyPct = (buyVol / total) * 100;
  return { buyPct, sellPct: 100 - buyPct, buyVol, sellVol, known: true };
}

/** Tape B/S volume from arbitrary prints (public tape + local fills). */
export function volumeRatioFromPrints(
  prints: { pairId?: string; ts: number; side: "buy" | "sell"; amountBase: number; price?: number }[],
  pairId: string,
  windowMs = 5 * 60_000,
  useQuoteNotional = false,
): { buyPct: number; sellPct: number; buyVol: number; sellVol: number; known: boolean } {
  const since = Date.now() - windowMs;
  let buyVol = 0;
  let sellVol = 0;
  for (const t of prints) {
    if (t.pairId && t.pairId !== pairId) continue;
    if (t.ts < since) continue;
    const w =
      useQuoteNotional && t.price && t.price > 0 ? t.amountBase * t.price : t.amountBase;
    if (!(w > 0)) continue;
    if (t.side === "buy") buyVol += w;
    else sellVol += w;
  }
  const total = buyVol + sellVol;
  if (!(total > 0)) return { buyPct: 50, sellPct: 50, buyVol: 0, sellVol: 0, known: false };
  const buyPct = (buyVol / total) * 100;
  return { buyPct, sellPct: 100 - buyPct, buyVol, sellVol, known: true };
}

function formatCalPnl(pnl: number): string {
  const a = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (a >= 1) return `${sign}${a.toFixed(2)}`;
  if (a >= 0.01) return `${sign}${a.toFixed(4)}`;
  if (a >= 0.0001) return `${sign}${a.toFixed(6)}`;
  if (a < 1e-12) return "+0.00";
  return `${sign}${a.toExponential(1)}`;
}

export function renderPnlCalendarHtml(days: DayPnl[]): string {
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.pnl)), 1e-9);
  const hasAny = days.some((d) => Math.abs(d.pnl) > 1e-9);
  const periodTotal = days.reduce((s, d) => s + d.pnl, 0);
  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
  // Align first cell to Monday of the first day in the window.
  const first = days[0];
  let pad = 0;
  if (first) {
    const dow = new Date(first.dateKey + "T12:00:00").getDay(); // 0=Sun
    pad = dow === 0 ? 6 : dow - 1;
  }
  const pads = Array.from({ length: pad }, () => `<div class="pnl-cal-cell pad" aria-hidden="true"></div>`).join("");
  return `<div class="pnl-calendar">
    <div class="pnl-cal-head">
      <h4>Daily PnL · last ${days.length}d</h4>
      <span class="pnl-cal-total mono ${periodTotal >= 0 ? "up" : "down"}">${formatCalPnl(periodTotal)} USDT</span>
    </div>
    <p class="muted small pnl-cal-note">${
      hasAny
        ? "Equity day-change from local snapshots (fees only when ≥0.01 USDT and no snap move)"
        : "Tracking starts after trades or a longer session — cells fill as equity moves"
    }</p>
    <div class="pnl-cal-weekdays" aria-hidden="true">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="pnl-cal-grid">
      ${pads}
      ${days.map((d) => {
        const strong = Math.abs(d.pnl) / maxAbs > 0.55;
        const cls = [
          d.pnl > 1e-6 ? `pos${strong ? " strong" : ""}` : d.pnl < -1e-6 ? `neg${strong ? " strong" : ""}` : "flat",
          d.isToday ? "today" : "",
          d.hasData ? "has-data" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<div class="pnl-cal-cell ${cls}" title="${d.label}: ${formatCalPnl(d.pnl)} USDT" data-day="${d.dateKey}"><span class="pnl-cal-daynum">${d.dayNum}</span></div>`;
      }).join("")}
    </div>
    <div class="pnl-cal-legend"><span class="pos">Profit</span><span class="flat">Flat</span><span class="neg">Loss</span></div>
  </div>`;
}
