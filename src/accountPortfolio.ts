import { getLedgerHolds } from "./adapters/exchangeApi";
import { freeBalance, reservedBalances } from "./balance";
import { formatNum, formatPct, formatPrice, formatUiAbs } from "./market";
import { assetBadgeLg } from "./icons";
import { escapeHtml } from "./sanitize";
import { walletEquityFromMarket } from "./store";
import type { DemoState, EquitySnapshot, LedgerEntry, MarketSnapshot, Wallet } from "./types";

export const BALANCE_HIDE_KEY = "hackme.account.hideBalances";
export const EQUITY_DENOM_KEY = "hackme.account.equityDenom";
/** Demo fiat display — paper only, not a live FX feed. */
export const FIAT_USDT_RUB = 87;

export type EquityDenom = "USDT" | "BTC" | "HMC" | "RUB";

export function getEquityDenom(): EquityDenom {
  try {
    const v = localStorage.getItem(EQUITY_DENOM_KEY);
    if (v === "USDT" || v === "BTC" || v === "HMC" || v === "RUB") return v;
  } catch {
    /* ignore */
  }
  return "USDT";
}

export function setEquityDenom(denom: EquityDenom): void {
  try {
    localStorage.setItem(EQUITY_DENOM_KEY, denom);
  } catch {
    /* ignore */
  }
}

export function equityInDenom(
  eqUsdt: number,
  market: MarketSnapshot,
  denom: EquityDenom,
): { primary: string; unit: string; secondary: string } {
  switch (denom) {
    case "BTC": {
      const btc = market.btcUsd > 0 ? eqUsdt / market.btcUsd : 0;
      return {
        primary: formatPrice(btc),
        unit: "BTC",
        secondary: `≈ ${formatNum(eqUsdt, 2)} USDT`,
      };
    }
    case "HMC": {
      const hmc = market.hmcUsdt > 0 ? eqUsdt / market.hmcUsdt : 0;
      return {
        primary: formatNum(hmc, 2),
        unit: "HMC",
        secondary: `≈ ${formatNum(eqUsdt, 2)} USDT`,
      };
    }
    case "RUB":
      return {
        primary: formatNum(eqUsdt * FIAT_USDT_RUB, 2),
        unit: "₽",
        secondary: `≈ ${formatNum(eqUsdt, 2)} USDT`,
      };
    default:
      return {
        primary: formatNum(eqUsdt, 2),
        unit: "USDT",
        secondary: `≈ ${formatNum(eqUsdt * FIAT_USDT_RUB, 2)} ₽`,
      };
  }
}

/** Equity denom ring buttons — scoped so portfolio chart `data-chart-denom` never collides. */
export const DENOM_ORB_SEL = ".acct-denom-orb[data-denom]";

/** Keep denom ring in sync after soft account patches (oracle refresh). */
export function syncDenomRingDom(denom: EquityDenom): void {
  document.querySelectorAll<HTMLElement>(DENOM_ORB_SEL).forEach((orb) => {
    const on = orb.dataset.denom === denom;
    orb.classList.toggle("active", on);
    orb.setAttribute("aria-checked", on ? "true" : "false");
  });
}

export function renderDenomRing(active: EquityDenom): string {
  const items: { id: EquityDenom; label: string; icon?: string }[] = [
    { id: "USDT", label: "USDT", icon: "USDT" },
    { id: "BTC", label: "BTC", icon: "BTC" },
    { id: "HMC", label: "HMC", icon: "HMC" },
    { id: "RUB", label: "RUB" },
  ];
  return `<div class="acct-denom-ring" role="radiogroup" aria-label="Display currency">
    ${items
      .map((it) => {
        const on = it.id === active;
        const inner =
          it.id === "RUB"
            ? `<span class="acct-denom-fiat-mark" aria-hidden="true">₽</span>`
            : assetBadgeLg(it.icon!);
        return `<button type="button" class="acct-denom-orb${on ? " active" : ""}${it.id === "RUB" ? " fiat" : ""}"
          data-denom="${it.id}" role="radio" aria-checked="${on}" title="Show total in ${it.label}">
          <span class="acct-denom-glow" aria-hidden="true"></span>
          ${inner}
          <span class="acct-denom-label">${it.label}</span>
        </button>`;
      })
      .join("")}
  </div>`;
}

export type AssetPortfolioRow = {
  symbol: string;
  name: string;
  amount: number;
  reserved: number;
  price: number;
  usdtValue: number;
  costBasisUsdt: number;
  floatingPnl: number;
  floatingPnlPct: number;
};

/** Symbol/name only — never match prices, PnL, or other row digits (avoids `hm`→USDT false hits via loose text). */
export function assetRowMatchesFilter(
  row: Pick<AssetPortfolioRow, "symbol" | "name" | "usdtValue">,
  query: string,
  hideSmallUsd: boolean,
): boolean {
  const q = query.trim().toLowerCase();
  const sym = row.symbol.toLowerCase();
  const name = row.name.toLowerCase();
  const matchQ = !q || sym.includes(q) || name.includes(q);
  // Hide dust and zero rows when "Hide < 1 USD" is on.
  const matchSize = !hideSmallUsd || row.usdtValue >= 1 - 1e-9;
  return matchQ && matchSize;
}

/** Spot pair for the Assets "Trade →" link (quote assets open a major USDT market). */
export function spotPairForAsset(symbol: string): string {
  const sym = symbol.toUpperCase();
  if (sym === "BTC") return "BTC_USDT";
  if (sym === "SUP") return "SUP_USDT";
  if (sym === "HMC") return "HMC_USDT";
  // USDT and unknowns: HMC/USDT is the desk's primary quote market.
  return "HMC_USDT";
}

export function isBalanceHidden(): boolean {
  try {
    return localStorage.getItem(BALANCE_HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBalanceHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(BALANCE_HIDE_KEY, "1");
    else localStorage.removeItem(BALANCE_HIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function maskBalance(text: string, hidden = isBalanceHidden()): string {
  return hidden ? "****" : text;
}

export function todayPnl(state: DemoState, market: MarketSnapshot): { pct: number; abs: number } {
  const now = Date.now();
  const target = now - 86_400_000;
  const snaps = state.equitySnapshots;
  const snap =
    [...snaps].reverse().find((s) => s.ts <= target) ?? snaps[snaps.length - 1];
  const eq = walletEquityFromMarket(state.wallet, market);
  const base = snap?.equityUsdt ?? state.initialEquityUsdt;
  const abs = eq - base;
  const pct = base > 0 ? (abs / base) * 100 : 0;
  return { pct, abs };
}

/** Signed PnL absolute in the user's equity display currency. */
export function formatPnlAbsInDenom(
  absUsdt: number,
  market: MarketSnapshot,
  denom: EquityDenom,
): { amount: string; unit: string } {
  const sign = absUsdt >= 0 ? "+" : "-";
  const abs = Math.abs(absUsdt);
  const fmtTiny = (n: number): string => formatUiAbs(n);
  switch (denom) {
    case "BTC": {
      const btc = market.btcUsd > 0 ? abs / market.btcUsd : 0;
      return { amount: `${sign}${formatPrice(btc)}`, unit: "BTC" };
    }
    case "HMC": {
      const hmc = market.hmcUsdt > 0 ? abs / market.hmcUsdt : 0;
      return { amount: `${sign}${fmtTiny(hmc)}`, unit: "HMC" };
    }
    case "RUB":
      return { amount: `${sign}${fmtTiny(abs * FIAT_USDT_RUB)}`, unit: "₽" };
    default:
      return { amount: `${sign}${fmtTiny(abs)}`, unit: "USDT" };
  }
}

export function formatTodayPnlHtml(
  dayPnl: { pct: number; abs: number },
  market: MarketSnapshot,
  denom: EquityDenom,
  hidden = isBalanceHidden(),
): string {
  const cls = dayPnl.abs >= 0 ? "up" : "down";
  const pnl = formatPnlAbsInDenom(dayPnl.abs, market, denom);
  const primary = maskBalance(`${pnl.amount} ${pnl.unit}`, hidden);
  const usdtFallback =
    denom === "USDT"
      ? ""
      : ` <span class="dim">(${maskBalance(`${dayPnl.abs >= 0 ? "+" : ""}${formatNum(dayPnl.abs, 2)} USDT`, hidden)})</span>`;
  return `<p class="acct-today-pnl ${cls} mono small" id="acct-today-pnl">
    Today's PnL <strong>${primary}</strong>${usdtFallback}
    <span class="dim">${formatPct(dayPnl.pct)}</span>
  </p>`;
}

function equityUsdt(wallet: Wallet, market: MarketSnapshot): number {
  return walletEquityFromMarket(wallet, market);
}

const ASSET_META: { sym: string; name: string; key: keyof Wallet; price: (m: MarketSnapshot) => number }[] = [
  { sym: "USDT", name: "Tether USD", key: "usdt", price: () => 1 },
  { sym: "HMC", name: "HackMe Coin", key: "hmc", price: (m) => m.hmcUsdt },
  { sym: "SUP", name: "Superior Companion", key: "sup", price: (m) => m.supUsdt },
  { sym: "BTC", name: "Bitcoin", key: "btc", price: (m) => m.btcUsd },
];

function ledgerCostLots(ledger: LedgerEntry[]): Map<string, { qty: number; costUsdt: number }> {
  const lots = new Map<string, { qty: number; costUsdt: number }>();
  for (const a of ASSET_META) lots.set(a.sym, { qty: 0, costUsdt: 0 });

  const chronological = [...ledger].reverse();
  for (const e of chronological) {
    const sym = e.asset.toUpperCase();
    const lot = lots.get(sym) ?? { qty: 0, costUsdt: 0 };
    if (e.amount > 0) {
      const addCost = e.usdtValue > 0 ? e.usdtValue : 0;
      lot.qty += e.amount;
      lot.costUsdt += addCost;
    } else if (e.amount < 0 && lot.qty > 1e-12) {
      const sell = Math.min(lot.qty, Math.abs(e.amount));
      const avg = lot.costUsdt / lot.qty;
      lot.qty -= sell;
      lot.costUsdt -= avg * sell;
    }
    lots.set(sym, lot);
  }
  return lots;
}

export function buildAssetPortfolioRows(state: DemoState, market: MarketSnapshot): AssetPortfolioRow[] {
  const lots = ledgerCostLots(state.ledger);
  const reserved = reservedBalances(state, market);

  return ASSET_META.map((a) => {
    const amount = state.wallet[a.key];
    const reservedAmt = reserved[a.key];
    const price = a.price(market);
    const usdtValue = amount * price;
    const lot = lots.get(a.sym) ?? { qty: 0, costUsdt: 0 };
    let costBasisUsdt = 0;
    if (lot.qty > 1e-12 && amount > 0) {
      const avg = lot.costUsdt / lot.qty;
      const covered = Math.min(amount, lot.qty);
      costBasisUsdt = covered * avg + Math.max(0, amount - lot.qty) * price;
    } else if (amount > 0) {
      costBasisUsdt = usdtValue;
    }
    const floatingPnl = usdtValue - costBasisUsdt;
    let floatingPnlPct = costBasisUsdt > 1e-9 ? (floatingPnl / costBasisUsdt) * 100 : 0;
    // Deposit/sync with no trade lots: cost was marked at spot → honest flat, not fake 0.00%.
    const markedInAtSpot =
      amount > 0 &&
      !(lot.qty > 1e-12 && lot.costUsdt > 1e-9) &&
      Math.abs(floatingPnl) < Math.max(1e-6, usdtValue * 1e-9);
    if (markedInAtSpot) {
      floatingPnlPct = 0;
    }
    return {
      symbol: a.sym,
      name: a.name,
      amount,
      reserved: reservedAmt,
      price,
      usdtValue,
      costBasisUsdt,
      floatingPnl: markedInAtSpot ? 0 : floatingPnl,
      floatingPnlPct,
    };
  });
}

/** Absolute floating PnL that doesn't collapse tiny USDT moves to "+0". */
export function formatFloatingPnlDisplay(absUsdt: number, pct: number): string {
  const a = Math.abs(absUsdt);
  const p = Math.abs(pct);
  // No real mark-vs-cost move — show flat instead of "+0.00 (0.00%)" / "00%".
  if (a < 1e-9 && p < 5e-3) return "flat";
  const sign = absUsdt >= 0 ? "+" : "-";
  return `${sign}${formatUiAbs(a)} (${formatPct(pct)})`;
}

export function equitySparklineSvg(snapshots: EquitySnapshot[], w = 200, h = 72): string {
  const pts = [...snapshots].slice(0, 80).reverse();
  const uid = `sp${Math.abs(snapshots.length * 17 + w) % 9999}`;
  if (pts.length < 2) {
    return `<svg class="acct-sparkline acct-sparkline-empty" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <line x1="8" y1="${h / 2}" x2="${w - 8}" y2="${h / 2}" stroke="currentColor" stroke-opacity="0.15" stroke-width="1.5" stroke-dasharray="4 4"/>
    </svg>`;
  }
  const vals = pts.map((p) => p.equityUsdt);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const padX = 6;
  const padY = 8;
  const coords: { x: number; y: number }[] = vals.map((v, i) => ({
    x: padX + (i / (vals.length - 1)) * (w - padX * 2),
    y: padY + (1 - (v - min) / range) * (h - padY * 2),
  }));
  const linePts = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const baseY = (h - padY).toFixed(1);
  const areaD =
    `M ${first.x.toFixed(1)} ${baseY} ` +
    coords.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
    ` L ${last.x.toFixed(1)} ${baseY} Z`;
  const up = vals[vals.length - 1]! >= vals[0]!;
  const cls = up ? "up" : "down";
  return `<svg class="acct-sparkline ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.32"/>
        <stop offset="85%" stop-color="currentColor" stop-opacity="0.04"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
      </linearGradient>
      <filter id="${uid}-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <path class="acct-spark-area" d="${areaD}" fill="url(#${uid}-fill)"/>
    <polyline class="acct-spark-line" points="${linePts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#${uid}-glow)"/>
    <circle class="acct-spark-dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.5" fill="currentColor"/>
  </svg>`;
}

export type RecentTx = {
  id: string;
  label: string;
  asset: string;
  amount: number;
  usdtValue: number;
  ts: number;
  status: "completed" | "pending" | "failed";
  direction: "in" | "out";
};

export function recentTransactions(ledger: LedgerEntry[], limit = 8): RecentTx[] {
  return ledger.slice(0, limit).map((e, i) => ({
    id: `tx-${e.ts}-${i}`,
    label: ledgerKindLabel(e.kind, e.asset),
    asset: e.asset,
    amount: e.amount,
    usdtValue: e.usdtValue,
    ts: e.ts,
    status: "completed",
    direction: e.amount >= 0 ? "in" : "out",
  }));
}

function ledgerKindLabel(kind: LedgerEntry["kind"], asset: string): string {
  switch (kind) {
    case "deposit":
      return `Deposit ${asset}`;
    case "withdrawal":
      return `Withdraw ${asset}`;
    case "trade":
      return `Trade ${asset}`;
    case "convert":
      return `Convert ${asset}`;
    case "fee":
      return `Fee ${asset}`;
    case "transfer":
      return `Transfer ${asset}`;
    default:
      return `${kind} ${asset}`;
  }
}

/** Absolute qty for an asset — never scientific notation. */
export function formatAssetQty(n: number, asset?: string): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sym = String(asset || "").toUpperCase();
  if (a === 0 || a < 1e-12) return sym === "BTC" ? "0.00000000" : "0.00";
  if (sym === "BTC") {
    if (a >= 1) return formatNum(a, 4);
    return trimFrac(a.toFixed(8));
  }
  if (sym === "USDT") {
    if (a >= 1) return formatNum(a, 2);
    if (a >= 0.01) return formatNum(a, 4);
    return formatUiAbs(a);
  }
  return formatUiAbs(a);
}

/** Signed qty + asset label for ledger / recent-tx rows. */
export function formatSignedAssetQty(n: number, asset: string): string {
  if (!Number.isFinite(n)) return "—";
  const sym = String(asset || "").toUpperCase() || "?";
  if (Math.abs(n) < 1e-12) return `0.00 ${sym}`;
  const sign = n > 0 ? "+" : "-";
  return `${sign}${formatAssetQty(n, sym)} ${sym}`;
}

function trimFrac(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "") || "0";
}

/** Middle-ellipsis destination / id — keeps head + tail readable. */
export function truncateMid(s: string, head = 10, tail = 6): string {
  const t = String(s || "").trim();
  if (!t) return "—";
  if (t.length <= head + tail + 1) return t;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

export type TxStatusTone = "completed" | "pending" | "failed" | "review";

/** Normalize withdraw / custody status → CEX badge label + CSS tone. */
export function custodyStatusMeta(
  status: string,
  opts?: { asset?: string; ageMin?: number | null; failReason?: string },
): { label: string; tone: TxStatusTone; cssClass: string } {
  const st = String(status || "").toLowerCase().trim();
  const age =
    opts?.ageMin != null && Number.isFinite(opts.ageMin) ? ` · ${Math.max(0, Math.round(opts.ageMin))}m` : "";
  const assetU = String(opts?.asset || "").toUpperCase();
  if (st === "completed" || st === "complete" || st === "confirmed" || st === "credited") {
    return { label: `Complete${age}`, tone: "completed", cssClass: "completed" };
  }
  if (st === "failed" || st === "rejected" || st === "cancelled" || st === "canceled") {
    const reason = opts?.failReason ? ` · ${String(opts.failReason).slice(0, 36)}` : "";
    return { label: `Failed${reason}`, tone: "failed", cssClass: "failed" };
  }
  if (st === "kyt_pending" || st === "submitted" || st === "review") {
    return { label: `KYT review${age}`, tone: "review", cssClass: "pending" };
  }
  if (st === "pending" || st === "queued" || st === "processing") {
    const hint =
      assetU === "USDT" ? " · KYT / ops broadcast" : assetU ? " · waiting on-chain" : "";
    return { label: `Pending${age}${hint}`, tone: "pending", cssClass: "pending" };
  }
  const pretty = st ? st.replace(/_/g, " ") : "unknown";
  return { label: pretty + age, tone: "pending", cssClass: "pending" };
}

export function formatTxStatusLabel(status: RecentTx["status"]): string {
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  return "Complete";
}

/** Ledger / recent-tx timestamp — date + local HH:MM (CEX-style). */
export function formatTxTime(ts: number): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

/** Compact relative + absolute for withdraw history rows. */
export function formatCustodyWhen(isoOrTs?: string | number): { absolute: string; ageMin: number | null } {
  const ms =
    typeof isoOrTs === "number"
      ? isoOrTs
      : isoOrTs
        ? Date.parse(isoOrTs)
        : NaN;
  if (!Number.isFinite(ms)) return { absolute: "—", ageMin: null };
  const ageMin = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return { absolute: formatTxTime(ms), ageMin };
}

/** One ledger list row HTML (escaped). */
export function renderLedgerListItem(r: LedgerEntry): string {
  const bucket = r.kind === "trade" || r.kind === "fee" ? r.kind : "other";
  const amt = formatSignedAssetQty(r.amount, r.asset);
  const tone = r.amount >= 0 ? "up" : "down";
  const kind = escapeHtml(ledgerKindLabel(r.kind, r.asset));
  const note = r.note ? ` <span class="dim">${escapeHtml(r.note)}</span>` : "";
  const when = `<span class="dim acct-ledger-when">${escapeHtml(formatTxTime(r.ts))}</span>`;
  return `<li data-ledger-kind="${bucket}"><span class="acct-ledger-kind ${tone}">${kind}</span> <strong class="mono ${tone}">${escapeHtml(amt)}</strong>${note} ${when}</li>`;
}

/** Withdraw history row HTML (escaped) — amount, fee, destination, status, time. */
export function renderWithdrawHistoryItem(w: {
  id: string;
  asset: string;
  amount: number;
  fee?: number;
  status: string;
  destination: string;
  created_at?: string;
  fail_reason?: string;
  tx_id?: string;
}): string {
  const when = formatCustodyWhen(w.created_at);
  const meta = custodyStatusMeta(w.status, {
    asset: w.asset,
    ageMin: when.ageMin,
    failReason: w.fail_reason,
  });
  const amtDisp = formatAssetQty(w.amount, w.asset);
  const feePart =
    w.fee != null && Number.isFinite(w.fee) && w.fee > 0
      ? `<span class="dim">fee ${escapeHtml(formatAssetQty(w.fee, w.asset))} ${escapeHtml(w.asset)}</span>`
      : "";
  const dest = escapeHtml(truncateMid(w.destination, 12, 8));
  const idShort = escapeHtml(truncateMid(w.id, 8, 4));
  const txPart = w.tx_id
    ? `<span class="dim" title="${escapeHtml(w.tx_id)}">tx ${escapeHtml(truncateMid(w.tx_id, 8, 6))}</span>`
    : "";
  return `<li class="lab-wd-row">
    <div class="lab-wd-row-main">
      <span class="dim lab-wd-id">${idShort}</span>
      <strong class="mono">${escapeHtml(w.asset)} ${escapeHtml(amtDisp)}</strong>
      <span class="dim">→</span>
      <span class="mono lab-wd-dest" title="${escapeHtml(w.destination)}">${dest}</span>
      <span class="acct-tx-status ${meta.cssClass}">${escapeHtml(meta.label)}</span>
    </div>
    <div class="lab-wd-row-meta dim">
      <span>${escapeHtml(when.absolute)}</span>
      ${feePart}
      ${txPart}
    </div>
  </li>`;
}

export function renderAssetTableRows(
  rows: AssetPortfolioRow[],
  hidden: boolean,
  eq: number,
): string {
  return rows
    .map((r) => {
      const decimals = r.symbol === "BTC" ? 8 : r.symbol === "USDT" ? 2 : 4;
      // Amounts use formatAssetQty — formatPrice treats 0 as "—" (price-only helper).
      const amtStr = formatAssetQty(r.amount, r.symbol);
      const priceStr = r.symbol === "USDT" ? "1.00" : formatPrice(r.price);
      const valueStr = formatNum(r.usdtValue, 2);
      const costStr = formatNum(r.costBasisUsdt, 2);
      const pnlCls =
        Math.abs(r.floatingPnl) < 1e-9 && Math.abs(r.floatingPnlPct) < 5e-3
          ? "flat"
          : r.floatingPnl >= 0
            ? "up"
            : "down";
      const pnlStr = formatFloatingPnlDisplay(r.floatingPnl, r.floatingPnlPct);
      const allocPct = eq > 0 ? (r.usdtValue / eq) * 100 : 0;
      const screenHold = getLedgerHolds().find((h) => h.asset === r.symbol && h.hold > 0)?.hold ?? 0;
      const holdStr = formatNum(screenHold, decimals);
      const pair = spotPairForAsset(r.symbol);
      return `<tr class="acct-asset-row" data-asset="${r.symbol}" data-asset-name="${escapeHtml(r.name)}" data-usdt-value="${r.usdtValue.toFixed(4)}">
        <td class="acct-asset-cell">
          <button type="button" class="acct-asset-expand" data-asset-expand="${r.symbol}" aria-expanded="false" aria-label="Details ${r.symbol}">›</button>
          ${assetBadgeLg(r.symbol)}
          <div class="acct-asset-meta">
            <strong>${escapeHtml(r.symbol)}</strong>
            <span class="muted small">${escapeHtml(r.name)}</span>
          </div>
        </td>
        <td class="mono acct-asset-amt" data-col="free">${maskBalance(amtStr, hidden)}</td>
        <td class="mono acct-asset-price">
          <span>${maskBalance(priceStr, hidden)}</span>
          <span class="muted small acct-cost-line">Cost ${maskBalance(costStr, hidden)}</span>
        </td>
        <td class="mono ${pnlCls} acct-asset-pnl" data-col="pnl">${hidden ? "****" : pnlStr}</td>
        <td class="mono acct-asset-usdt" data-col="usdt">${maskBalance(valueStr, hidden)}</td>
      </tr>
      <tr class="acct-asset-detail" data-asset-detail="${r.symbol}" hidden>
        <td colspan="5">
          <div class="acct-asset-detail-inner">
            <span>Allocation <strong class="mono">${allocPct.toFixed(1)}%</strong></span>
            <span>Reserved <strong class="mono" data-raw="${escapeHtml(formatNum(r.reserved, decimals))}" data-raw-slot="reserved">${maskBalance(formatNum(r.reserved, decimals), hidden)}</strong></span>
            <span>Available <strong class="mono" data-raw="${escapeHtml(formatNum(Math.max(0, r.amount - r.reserved), decimals))}" data-raw-slot="avail">${maskBalance(formatNum(Math.max(0, r.amount - r.reserved), decimals), hidden)}</strong></span>
            ${
              screenHold > 0
                ? `<span>Screening hold <strong class="mono" data-raw="${escapeHtml(holdStr)}" data-raw-slot="hold">${maskBalance(holdStr, hidden)}</strong></span>`
                : ""
            }
            <a class="acct-asset-trade" href="#spot/${pair}/15m" data-goto-spot="${escapeHtml(r.symbol)}">Trade →</a>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

export function walletFreeSummary(state: DemoState, market: MarketSnapshot): {
  usdt: string;
  hmc: string;
  sup: string;
  btc: string;
} {
  const w = state.wallet;
  return {
    usdt: formatNum(freeBalance(state, "usdt", market), 2),
    hmc: formatNum(freeBalance(state, "hmc", market), 4),
    sup: formatNum(freeBalance(state, "sup", market), 4),
    btc: formatPrice(freeBalance(state, "btc", market)),
  };
}

export { equityUsdt };
