import type { Candle, DemoState, MarketSnapshot, MultiPanePairs, MultiPaneTfs, Order, OrderSide, PairId, Timeframe, Wallet } from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS, DEFAULT_FEE_CONFIG, DEFAULT_INDICATOR_CONFIG, DEFAULT_MULTI_PANE_PAIRS, DEFAULT_MULTI_PANE_TFS, STATE_VERSION, TIMEFRAMES, normalizeChartOverlays } from "./types";
import { barCountForTf, ensureContiguousCandles, prependOlderCandles, reaggregateLiveBarsFromBase, sanitizeCandlesForChart, seedAllTimeframes, trimCandlesToGenesis, CANDLE_BASE_TF, deriveAllTimeframes } from "./candles";
import { maxBodyFracForTf, clampTickMid } from "./chartScale";
import { midForPair } from "./market";
import { PAIRS } from "./pairs";
import {
  finiteNonNegCapped,
  MAX_WALLET_ASSET,
  sanitizeChartMode,
  sanitizeChartSettings,
  sanitizeDomId,
  sanitizeIndicatorConfig,
  sanitizeLedgerAsset,
  sanitizeLedgerKind,
  sanitizeMainView,
  sanitizeMultiChartLayout,
  migrateOracleAnchor,
  sanitizePlainNote,
} from "./sanitize";
import { sanitizeFeeConfig } from "./fees";
import { STORAGE_KEY } from "./theme";
import { uid } from "./id";
import { sanitizeImportedCandles, sanitizeImportedOrder, sanitizeImportedTrade } from "./stateSanitize";
import { MAX_DRAWINGS, sanitizeDrawings, stripPollutionKeys } from "./chartDraw";
import {
  chartPrefsFromState,
  clearChartPrefs,
  mergeChartPrefsOnLoad,
  saveChartPrefs,
} from "./chartPrefs";

/** Persist 1m base only — higher TFs re-derived (+ padded) on load. */
const STORAGE_BASE_CAP = 800;
const STORAGE_TRADES_CAP = 120;
const STORAGE_LEDGER_CAP = 80;
const STORAGE_EQUITY_CAP = 72;
const STORAGE_ORDERS_CAP = 80;

function compactForStorage(state: DemoState, aggressive = false): DemoState {
  const s = structuredClone(state);
  s.orders = s.orders.slice(0, STORAGE_ORDERS_CAP);
  s.trades = s.trades.slice(0, aggressive ? 40 : STORAGE_TRADES_CAP);
  s.ledger = s.ledger.slice(0, aggressive ? 40 : STORAGE_LEDGER_CAP);
  s.equitySnapshots = s.equitySnapshots.slice(0, aggressive ? 24 : STORAGE_EQUITY_CAP);
  s.drawings = sanitizeDrawings(s.drawings, aggressive ? 40 : Math.min(120, MAX_DRAWINGS));
  if (aggressive) {
    s.candles = {};
    return s;
  }
  for (const pid of Object.keys(s.candles)) {
    const byTf = s.candles[pid as PairId];
    if (!byTf) continue;
    const base = byTf[CANDLE_BASE_TF];
    const next: Partial<Record<Timeframe, Candle[]>> = {};
    if (base?.length) next[CANDLE_BASE_TF] = base.slice(-STORAGE_BASE_CAP);
    s.candles[pid as PairId] = next;
  }
  return s;
}

function tryPersist(payload: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      return false;
    }
    throw err;
  }
}

function sanitizeWallet(w: Partial<Wallet> | undefined, fallback: Wallet): Wallet {
  return {
    usdt: finiteNonNegCapped(w?.usdt, fallback.usdt, MAX_WALLET_ASSET),
    hmc: finiteNonNegCapped(w?.hmc, fallback.hmc, MAX_WALLET_ASSET),
    sup: finiteNonNegCapped(w?.sup, fallback.sup, MAX_WALLET_ASSET),
    btc: finiteNonNegCapped(w?.btc, fallback.btc, MAX_WALLET_ASSET),
  };
}

function sanitizeChartOverlays(raw: unknown): DemoState["chartOverlays"] {
  const incoming = raw && typeof raw === "object" ? (raw as Partial<DemoState["chartOverlays"]>) : {};
  return normalizeChartOverlays({
    showVolume: typeof incoming.showVolume === "boolean" ? incoming.showVolume : DEFAULT_CHART_OVERLAYS.showVolume,
    showOrderLines:
      typeof incoming.showOrderLines === "boolean"
        ? incoming.showOrderLines
        : DEFAULT_CHART_OVERLAYS.showOrderLines,
    showLastPrice:
      typeof incoming.showLastPrice === "boolean"
        ? incoming.showLastPrice
        : DEFAULT_CHART_OVERLAYS.showLastPrice,
    orderPreview:
      typeof incoming.orderPreview === "boolean"
        ? incoming.orderPreview
        : DEFAULT_CHART_OVERLAYS.orderPreview,
    quickOrder:
      typeof incoming.quickOrder === "boolean"
        ? incoming.quickOrder
        : DEFAULT_CHART_OVERLAYS.quickOrder,
    quickOrderSkipConfirm:
      typeof incoming.quickOrderSkipConfirm === "boolean"
        ? incoming.quickOrderSkipConfirm
        : DEFAULT_CHART_OVERLAYS.quickOrderSkipConfirm,
  });
}

const DEFAULT: DemoState = {
  wallet: { usdt: 10_000, hmc: 50_000, sup: 8_000, btc: 0.15 },
  orders: [],
  trades: [],
  ledger: [],
  equitySnapshots: [],
  drawings: [],
  candles: {},
  activePair: "HMC_USDT",
  activeTf: "15m",
  chartMode: "candles",
  chartSettings: structuredClone(DEFAULT_CHART_SETTINGS),
  favoritePairs: ["HMC_USDT", "SUP_USDT", "HMC_SUP"],
  mainView: "spot",
  bookGrouping: 0,
  bookView: "book",
  oracleAnchor: 0.05,
  initialEquityUsdt: 0,
  priceAlerts: [],
  equityBaselineV: 2,
  stateVersion: STATE_VERSION,
  feeConfig: structuredClone(DEFAULT_FEE_CONFIG),
  secondaryTf: "4H",
  multiPaneTfs: [...DEFAULT_MULTI_PANE_TFS] as MultiPaneTfs,
  multiPanePairs: [...DEFAULT_MULTI_PANE_PAIRS] as MultiPanePairs,
  chartFullscreen: false,
  multiChart: false,
  multiChartLayout: "1",
  multiChartLinked: false,
  chartOverlays: structuredClone(DEFAULT_CHART_OVERLAYS),
  indicatorConfig: structuredClone(DEFAULT_INDICATOR_CONFIG),
  drawingsLocked: false,
  activeDrawTool: "cursor",
};

function migrateTf(tf: string | undefined): Timeframe {
  const valid = TIMEFRAMES as string[];
  if (tf && valid.includes(tf)) return tf as Timeframe;
  return "15m";
}

export function sanitizeMultiPaneTfs(raw: unknown, fallbackSecondary?: Timeframe): MultiPaneTfs {
  const base = [...DEFAULT_MULTI_PANE_TFS] as MultiPaneTfs;
  if (fallbackSecondary) base[0] = migrateTf(fallbackSecondary);
  if (!Array.isArray(raw)) return base;
  return [
    migrateTf(typeof raw[0] === "string" ? raw[0] : base[0]),
    migrateTf(typeof raw[1] === "string" ? raw[1] : base[1]),
    migrateTf(typeof raw[2] === "string" ? raw[2] : base[2]),
  ];
}

export function sanitizeMultiPanePairs(raw: unknown): MultiPanePairs {
  const base = [...DEFAULT_MULTI_PANE_PAIRS] as MultiPanePairs;
  const fallback = PAIRS[0]?.id ?? "HMC_USDT";
  const valid = (id: unknown, fb: PairId): PairId => {
    if (typeof id === "string" && PAIRS.some((p) => p.id === id)) return id as PairId;
    const safeFb = PAIRS.some((p) => p.id === fb) ? fb : fallback;
    return safeFb;
  };
  if (!Array.isArray(raw)) {
    return [valid(base[0], base[0]), valid(base[1], base[1]), valid(base[2], base[2])];
  }
  return [
    valid(raw[0], base[0]),
    valid(raw[1], base[1]),
    valid(raw[2], base[2]),
  ];
}

export function loadState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return mergeChartPrefsOnLoad(freshState());
    if (raw.length > 4_500_000) {
      console.warn("[hackme-exchange] state blob too large — resetting candles/history");
      localStorage.removeItem(STORAGE_KEY);
      return mergeChartPrefsOnLoad(freshState());
    }
    const parsed = stripPollutionKeys(JSON.parse(raw)) as DemoState;
    const s: DemoState = {
      ...DEFAULT,
      ...parsed,
      wallet: sanitizeWallet(parsed.wallet, DEFAULT.wallet),
      favoritePairs: Array.isArray(parsed.favoritePairs)
        ? parsed.favoritePairs
            .filter((p): p is PairId => typeof p === "string" && PAIRS.some((x) => x.id === p))
            .slice(0, 20)
        : DEFAULT.favoritePairs,
      chartSettings: sanitizeChartSettings({
        ...DEFAULT_CHART_SETTINGS,
        ...parsed.chartSettings,
      }),
      equityBaselineV:
        typeof parsed.equityBaselineV === "number" && Number.isFinite(parsed.equityBaselineV)
          ? parsed.equityBaselineV
          : 0,
      chartMode: sanitizeChartMode(parsed.chartMode),
      activeTf: migrateTf(parsed.activeTf),
      activePair: PAIRS.some((p) => p.id === parsed.activePair) ? parsed.activePair : DEFAULT.activePair,
      stateVersion:
        typeof parsed.stateVersion === "number" && Number.isFinite(parsed.stateVersion)
          ? parsed.stateVersion
          : 0,
      feeConfig: sanitizeFeeConfig({ ...DEFAULT_FEE_CONFIG, ...parsed.feeConfig }),
      secondaryTf: migrateTf(parsed.secondaryTf === parsed.activeTf ? "4H" : parsed.secondaryTf),
      multiPaneTfs: sanitizeMultiPaneTfs(
        (parsed as { multiPaneTfs?: unknown }).multiPaneTfs,
        migrateTf(parsed.secondaryTf === parsed.activeTf ? "4H" : parsed.secondaryTf),
      ),
      multiPanePairs: sanitizeMultiPanePairs((parsed as { multiPanePairs?: unknown }).multiPanePairs),
      ledger: Array.isArray(parsed.ledger)
        ? parsed.ledger.slice(0, STORAGE_LEDGER_CAP).map((e) => ({
            id: sanitizeDomId(e.id, uid()),
            kind: sanitizeLedgerKind(e.kind),
            asset: sanitizeLedgerAsset(e.asset),
            note: sanitizePlainNote(e.note, 240),
            amount: typeof e.amount === "number" && Number.isFinite(e.amount) ? e.amount : 0,
            usdtValue:
              typeof e.usdtValue === "number" && Number.isFinite(e.usdtValue) ? e.usdtValue : 0,
            ts: typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : Date.now(),
          }))
        : [],
      equitySnapshots: Array.isArray(parsed.equitySnapshots)
        ? parsed.equitySnapshots
            .slice(0, STORAGE_EQUITY_CAP)
            .filter(
              (e) =>
                e &&
                typeof e === "object" &&
                typeof (e as { ts?: unknown }).ts === "number" &&
                typeof (e as { equityUsdt?: unknown }).equityUsdt === "number",
            )
        : [],
      drawings: sanitizeDrawings(parsed.drawings ?? [], MAX_DRAWINGS),
      candles: sanitizeImportedCandles(parsed.candles),
      bookGrouping:
        typeof parsed.bookGrouping === "number" && Number.isFinite(parsed.bookGrouping)
          ? Math.max(0, parsed.bookGrouping)
          : DEFAULT.bookGrouping,
      bookView: parsed.bookView === "depth" ? "depth" : "book",
      activeDrawTool:
        typeof parsed.activeDrawTool === "string" &&
        ["cursor", "hline", "vline", "cross", "trend", "ray", "fib", "rect", "text", "measure"].includes(parsed.activeDrawTool)
          ? parsed.activeDrawTool
          : "cursor",
      chartOverlays: sanitizeChartOverlays(parsed.chartOverlays),
      indicatorConfig: sanitizeIndicatorConfig(parsed.indicatorConfig),
      multiChartLayout: sanitizeMultiChartLayout(
        parsed.multiChartLayout ?? (parsed.multiChart ? "2v" : "1"),
      ),
      multiChartLinked: !!parsed.multiChartLinked,
      drawingsLocked: parsed.drawingsLocked ?? false,
      oracleAnchor: migrateOracleAnchor(parsed.oracleAnchor, DEFAULT.oracleAnchor),
      mainView: sanitizeMainView(parsed.mainView),
      orders: Array.isArray(parsed.orders)
        ? parsed.orders
            .slice(0, STORAGE_ORDERS_CAP)
            .map((o) => sanitizeImportedOrder(o as Order))
            .filter((o): o is Order => o != null)
        : [],
      priceAlerts: Array.isArray(parsed.priceAlerts)
        ? parsed.priceAlerts.slice(0, 50).map((a) => ({
            id: sanitizeDomId(a.id, uid()),
            pairId: PAIRS.some((p) => p.id === a.pairId) ? a.pairId : DEFAULT.activePair,
            price: typeof a.price === "number" && Number.isFinite(a.price) ? Math.max(0, a.price) : 0,
            fired: !!a.fired,
            createdAt:
              typeof a.createdAt === "number" && Number.isFinite(a.createdAt) ? a.createdAt : Date.now(),
          }))
        : [],
    };
    s.multiChart = s.multiChartLayout !== "1";
    s.secondaryTf = s.multiPaneTfs[0];
    if ((parsed as unknown as { feeRateBps?: number }).feeRateBps && !parsed.feeConfig) {
      s.feeConfig = sanitizeFeeConfig({ ...s.feeConfig, takerBps: (parsed as unknown as { feeRateBps: number }).feeRateBps });
    }
    s.trades = (parsed.trades ?? [])
      .slice(0, STORAGE_TRADES_CAP)
      .map((t) => sanitizeImportedTrade(t));
    if (s.equityBaselineV < 2) {
      s.initialEquityUsdt = walletEquityUsdt(s.wallet, 0.05, 0.01, 67_500);
      s.equityBaselineV = 2;
    }
    if (s.stateVersion < STATE_VERSION) {
      s.candles = {};
      s.stateVersion = STATE_VERSION;
    }
    return mergeChartPrefsOnLoad(s);
  } catch {
    return mergeChartPrefsOnLoad(freshState());
  }
}

function freshState(): DemoState {
  const s = structuredClone(DEFAULT);
      s.initialEquityUsdt = walletEquityUsdt(s.wallet, 0.05, 0.01, 67_500);
  s.equityBaselineV = 2;
  return s;
}

/** Clean default demo state — used by reset and import merge. */
export function defaultDemoState(): DemoState {
  return freshState();
}

export function healStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    // Proactively compact before quota / CSP-heavy sessions — silent under 1.2MB.
    if (raw.length > 520_000) {
      const s = loadState();
      if (!saveState(s)) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function saveState(state: DemoState): boolean {
  // Always try to persist appearance prefs first — small blob, survives demo wipe.
  saveChartPrefs(chartPrefsFromState(state));
  const compact = compactForStorage(state);
  let raw = JSON.stringify(compact);
  if (tryPersist(raw)) return true;

  console.warn("[hackme-exchange] localStorage quota exceeded — compacting demo state");
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const aggressive = compactForStorage(state, true);
  raw = JSON.stringify(aggressive);
  if (tryPersist(raw)) return true;

  console.warn("[hackme-exchange] could not persist state — running in memory only");
  return false;
}

export function resetDemo(): DemoState {
  clearChartPrefs();
  const s = freshState();
  saveState(s);
  return s;
}

export { uid };

function balKey(asset: string): keyof Wallet {
  return asset.toLowerCase() as keyof Wallet;
}

export function walletEquityUsdt(w: Wallet, hmcU: number, supU: number, btcUsd: number): number {
  return w.usdt + w.hmc * hmcU + w.sup * supU + w.btc * btcUsd;
}

export function walletEquityFromMarket(w: Wallet, m: MarketSnapshot): number {
  return walletEquityUsdt(w, m.hmcUsdt, m.supUsdt, m.btcUsd);
}

export function applyMarketTrade(
  state: DemoState,
  pairId: PairId,
  side: OrderSide,
  price: number,
  amountBase: number,
  amountQuote: number,
): { ok: true } | { ok: false; reason: string } {
  const pair = PAIRS.find((p) => p.id === pairId)!;
  const baseK = balKey(pair.base);
  const quoteK = balKey(pair.quote);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "Invalid price" };
  if (!Number.isFinite(amountBase) || amountBase <= 0) return { ok: false, reason: "Amount must be > 0" };
  if (!Number.isFinite(amountQuote) || amountQuote < 0) return { ok: false, reason: "Invalid quote amount" };
  // Dust / abuse: reject microscopic and absurd sizes (demo risk controls)
  if (amountBase < 1e-12) return { ok: false, reason: "Size too small" };
  if (amountBase > 1e15 || amountQuote > 1e15) return { ok: false, reason: "Size too large" };

  if (side === "buy") {
    if (state.wallet[quoteK] < amountQuote) return { ok: false, reason: `Insufficient ${pair.quote}` };
    state.wallet[quoteK] -= amountQuote;
    state.wallet[baseK] += amountBase;
  } else {
    if (state.wallet[baseK] < amountBase) return { ok: false, reason: `Insufficient ${pair.base}` };
    state.wallet[baseK] -= amountBase;
    state.wallet[quoteK] += amountQuote;
  }

  // Hard invariant: balances never NaN/negative after trade
  for (const k of Object.keys(state.wallet) as (keyof Wallet)[]) {
    const v = state.wallet[k];
    if (!Number.isFinite(v) || v < 0) state.wallet[k] = 0;
  }

  // Wallet only — trade history is recorded by executeFill (with fees).
  return { ok: true };
}

export function placeLimitOrder(
  state: DemoState,
  pairId: PairId,
  side: OrderSide,
  price: number,
  amountBase: number,
): Order {
  const order: Order = {
    id: uid(),
    pairId,
    side,
    kind: "limit",
    price,
    amountBase,
    filledBase: 0,
    status: "open",
    source: "paper",
    createdAt: Date.now(),
  };
  state.orders.unshift(order);
  state.orders = state.orders.slice(0, 80);
  saveState(state);
  return order;
}

export function cancelOrder(state: DemoState, id: string): void {
  const o = state.orders.find((x) => x.id === id);
  if (o) {
    o.status = "cancelled";
    if (o.ocoGroupId) {
      for (const x of state.orders) {
        if (
          x.ocoGroupId === o.ocoGroupId &&
          x.id !== o.id &&
          (x.status === "open" || x.status === "triggered")
        ) {
          x.status = "cancelled";
        }
      }
    }
  }
  saveState(state);
}

export function cancelAllOpenOrders(state: DemoState): number {
  let n = 0;
  for (const o of state.orders) {
    if (o.status === "open" || o.status === "triggered") {
      o.status = "cancelled";
      n++;
    }
  }
  if (n) saveState(state);
  return n;
}

export function updateOrderPrice(state: DemoState, id: string, price: number): boolean {
  const o = state.orders.find((x) => x.id === id);
  if (!o || (o.status !== "open" && o.status !== "triggered")) return false;
  if (!(price > 0)) return false;
  o.price = price;
  saveState(state);
  return true;
}

export function updateOrderAmount(state: DemoState, id: string, amountBase: number): boolean {
  const o = state.orders.find((x) => x.id === id);
  if (!o || (o.status !== "open" && o.status !== "triggered")) return false;
  if (!(amountBase > 0)) return false;
  o.amountBase = amountBase;
  saveState(state);
  return true;
}

export function toggleFavorite(state: DemoState, pairId: PairId): void {
  const i = state.favoritePairs.indexOf(pairId);
  if (i >= 0) state.favoritePairs.splice(i, 1);
  else state.favoritePairs.unshift(pairId);
  saveState(state);
}

/** True when live oracle mid is on a different scale than stored candles (needs reseed, not every boot). */
export function needsCandleReseedForMarket(state: DemoState, market: MarketSnapshot): boolean {
  for (const p of PAIRS) {
    const existingBase = state.candles[p.id]?.[CANDLE_BASE_TF];
    if (!existingBase?.length) return true;
    const tipClose = existingBase[existingBase.length - 1]?.close ?? 0;
    const mid = midForPair(market, p.id);
    if (tipClose > 0 && mid > 0) {
      const ratio = mid / tipClose;
      if (ratio > 1.25 || ratio < 0.8) return true;
    }
  }
  return false;
}

export function ensureCandles(state: DemoState, market: MarketSnapshot): void {
  for (const p of PAIRS) {
    if (!state.candles[p.id]) state.candles[p.id] = {};
    const mid = midForPair(market, p.id);
    const existingBase = state.candles[p.id]![CANDLE_BASE_TF];
    if (!existingBase?.length) {
      const all = seedAllTimeframes(p.id, mid);
      for (const tf of TIMEFRAMES) {
        state.candles[p.id]![tf] = all[tf] ?? [];
      }
      continue;
    }
    // Mid scale jump (e.g. 0.00064 → 0.05) — snap tip alone paints a fake cliff candle.
    const tipClose = existingBase[existingBase.length - 1]?.close ?? 0;
    if (tipClose > 0 && mid > 0) {
      const ratio = mid / tipClose;
      if (ratio > 1.25 || ratio < 0.8) {
        const all = seedAllTimeframes(p.id, mid);
        for (const tf of TIMEFRAMES) {
          state.candles[p.id]![tf] = all[tf] ?? [];
        }
        continue;
      }
    }
    // Heal / extend base, then re-derive every TF so resolutions stay aligned.
    const need = barCountForTf(CANDLE_BASE_TF);
    const trimmed = trimCandlesToGenesis(existingBase, CANDLE_BASE_TF);
    let healed = ensureContiguousCandles(trimmed, CANDLE_BASE_TF, {
      pairId: p.id,
      fillToNow: true,
    });
    if (healed.length < need) {
      healed = prependOlderCandles(healed, p.id, CANDLE_BASE_TF, need - healed.length);
    }
    healed = sanitizeCandlesForChart(healed, p.id, CANDLE_BASE_TF);
    // Snap tip toward live mid without inventing a cliff body — keep CEX OHLC wicks.
    if (healed.length) {
      const tip = { ...healed[healed.length - 1]! };
      const maxBody = maxBodyFracForTf(CANDLE_BASE_TF);
      const safe = clampTickMid(mid, tip.close, maxBody);
      tip.close = safe;
      tip.high = Math.max(tip.high, tip.open, safe);
      tip.low = Math.min(tip.low, tip.open, safe);
      healed[healed.length - 1] = sanitizeCandlesForChart([tip], p.id, CANDLE_BASE_TF)[0] ?? tip;
    }
    const all = deriveAllTimeframes(healed, p.id, state.candles[p.id]);
    reaggregateLiveBarsFromBase(all, all[CANDLE_BASE_TF] ?? healed);
    for (const tf of TIMEFRAMES) {
      const series = all[tf] ?? [];
      state.candles[p.id]![tf] = series.length
        ? sanitizeCandlesForChart(series, p.id, tf)
        : series;
    }
  }
}

/** Drop boot-fallback history and reseed around live mid — avoids fake cliff candle. */
export function reseedCandlesFromMarket(state: DemoState, market: MarketSnapshot): void {
  for (const p of PAIRS) {
    if (!state.candles[p.id]) state.candles[p.id] = {};
    const mid = midForPair(market, p.id);
    const all = seedAllTimeframes(p.id, mid);
    for (const tf of TIMEFRAMES) {
      state.candles[p.id]![tf] = all[tf] ?? [];
    }
  }
}

export function pnlPct(state: DemoState, m: MarketSnapshot): number {
  const eq = walletEquityFromMarket(state.wallet, m);
  const base = state.initialEquityUsdt;
  if (base <= 0) return 0;
  return ((eq - base) / base) * 100;
}

export function syncEquityBaseline(state: DemoState, m: MarketSnapshot): void {
  state.initialEquityUsdt = walletEquityFromMarket(state.wallet, m);
  state.equityBaselineV = 2;
  saveState(state);
}
