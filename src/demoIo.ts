import type {
  DemoState,
  Order,
  PairId,
  Timeframe,
  Trade,
  Wallet,
} from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS, DEFAULT_MULTI_PANE_TFS, TIMEFRAMES, normalizeChartOverlays } from "./types";
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
  sanitizeOracleAnchor,
  migrateOracleAnchor,
  sanitizePlainNote,
} from "./sanitize";
import { sanitizeDrawings, stripPollutionKeys } from "./chartDraw";
import { sanitizeFeeConfig } from "./fees";
import { defaultDemoState, sanitizeMultiPanePairs } from "./store";
import { uid } from "./id";
import {
  MAX_IMPORT_TRADE_QUOTE,
  sanitizeImportedCandles,
  sanitizeImportedOrder,
  sanitizeImportedTrade,
} from "./stateSanitize";

export { MAX_IMPORT_TRADE_QUOTE, sanitizeImportedOrder, sanitizeImportedTrade, sanitizeImportedCandles } from "./stateSanitize";

export function exportDemoJson(state: DemoState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "hackme-exchange-demo",
      state,
    },
    null,
    2,
  );
}

function sanitizeWallet(w: Partial<Wallet> | undefined): Wallet {
  return {
    usdt: finiteNonNegCapped(w?.usdt, 0, MAX_WALLET_ASSET),
    hmc: finiteNonNegCapped(w?.hmc, 0, MAX_WALLET_ASSET),
    sup: finiteNonNegCapped(w?.sup, 0, MAX_WALLET_ASSET),
    btc: finiteNonNegCapped(w?.btc, 0, MAX_WALLET_ASSET),
  };
}

/** Cap per-trade notional on import — blocks VIP tier farming via fake history. */
// MAX_IMPORT_TRADE_QUOTE re-exported from stateSanitize

const VIP_VOLUME_WINDOW_MS = 30 * 86_400_000;

const PAIR_IDS = new Set<PairId>(["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"]);

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

function sanitizePairId(raw: unknown, fallback: PairId = "HMC_USDT"): PairId {
  return typeof raw === "string" && PAIR_IDS.has(raw as PairId) ? (raw as PairId) : fallback;
}

function sanitizeTf(raw: unknown, fallback: Timeframe = "15m"): Timeframe {
  const valid = TIMEFRAMES as readonly string[];
  return typeof raw === "string" && valid.includes(raw) ? (raw as Timeframe) : fallback;
}

function sanitizeImportedMultiPaneTfs(raw: unknown, fallbackSecondary?: Timeframe): DemoState["multiPaneTfs"] {
  const base = [...DEFAULT_MULTI_PANE_TFS] as DemoState["multiPaneTfs"];
  if (fallbackSecondary) base[0] = sanitizeTf(fallbackSecondary);
  if (!Array.isArray(raw)) return base;
  return [
    sanitizeTf(typeof raw[0] === "string" ? raw[0] : base[0]),
    sanitizeTf(typeof raw[1] === "string" ? raw[1] : base[1]),
    sanitizeTf(typeof raw[2] === "string" ? raw[2] : base[2]),
  ];
}

/** Drop ancient inflated trades that exist only to inflate VIP volume. */
export function stripVipFarmTrades(trades: Trade[]): Trade[] {
  const cutoff = Date.now() - VIP_VOLUME_WINDOW_MS;
  return trades.filter((t) => {
    if (t.ts < cutoff) return false;
    if (t.amountQuote > MAX_IMPORT_TRADE_QUOTE) return false;
    return true;
  });
}

const MAX_IMPORT_BYTES = 2_000_000;

/** Import demo state — validates shape and clamps numeric abuse / NaN / XSS payloads. */
export function parseDemoImport(raw: string): DemoState {
  if (typeof raw !== "string") throw new Error("Invalid JSON");
  if (raw.length > MAX_IMPORT_BYTES) throw new Error("Import too large (max 2MB)");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
  const data = stripPollutionKeys(parsed) as { state?: DemoState } & DemoState;
  const incoming = (data && "state" in data && data.state ? data.state : data) as Partial<DemoState>;
  if (!incoming?.wallet || typeof incoming.wallet !== "object") {
    throw new Error("Invalid demo export (missing wallet)");
  }
  if (!Array.isArray(incoming.orders) || !Array.isArray(incoming.trades)) {
    throw new Error("Invalid demo export (orders/trades)");
  }

  // Merge onto defaults so missing candles/equitySnapshots/etc. never crash save/render.
  const state: DemoState = { ...defaultDemoState(), ...incoming };
  state.wallet = sanitizeWallet(incoming.wallet);
  state.orders = incoming.orders
    .slice(0, 200)
    .map(sanitizeImportedOrder)
    .filter((o): o is Order => o != null);
  state.trades = stripVipFarmTrades(incoming.trades.slice(0, 200).map(sanitizeImportedTrade));
  state.feeConfig = sanitizeFeeConfig(incoming.feeConfig);
  state.chartSettings = sanitizeChartSettings({
    ...DEFAULT_CHART_SETTINGS,
    ...incoming.chartSettings,
  });
  state.indicatorConfig = sanitizeIndicatorConfig(incoming.indicatorConfig);
  if (Array.isArray(incoming.ledger)) {
    state.ledger = incoming.ledger.slice(0, 300).map((e) => ({
      id: sanitizeDomId(e.id, uid()),
      kind: sanitizeLedgerKind(e.kind),
      asset: sanitizeLedgerAsset(e.asset),
      note: sanitizePlainNote(e.note, 240),
      amount: typeof e.amount === "number" && Number.isFinite(e.amount) ? e.amount : 0,
      usdtValue: typeof e.usdtValue === "number" && Number.isFinite(e.usdtValue) ? e.usdtValue : 0,
      ts: typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : Date.now(),
    }));
  } else {
    state.ledger = [];
  }
  if (Array.isArray(incoming.priceAlerts)) {
    state.priceAlerts = incoming.priceAlerts
      .slice(0, 50)
      .map((a) => {
        const id = sanitizeDomId(a.id, uid());
        return {
          id,
          pairId: sanitizePairId(a.pairId),
          price: typeof a.price === "number" && Number.isFinite(a.price) ? Math.max(0, a.price) : 0,
          fired: !!a.fired,
          createdAt:
            typeof a.createdAt === "number" && Number.isFinite(a.createdAt) ? a.createdAt : Date.now(),
        };
      })
      .filter((a) => a.id.length > 0);
  } else {
    state.priceAlerts = [];
  }
  state.drawings = sanitizeDrawings(incoming.drawings);
  state.candles = sanitizeImportedCandles(incoming.candles);
  state.equitySnapshots = Array.isArray(incoming.equitySnapshots)
    ? incoming.equitySnapshots.slice(0, 200).filter(
        (e) =>
          e &&
          typeof e === "object" &&
          typeof (e as { ts?: unknown }).ts === "number" &&
          typeof (e as { equityUsdt?: unknown }).equityUsdt === "number",
      )
    : [];
  state.chartOverlays = sanitizeChartOverlays(incoming.chartOverlays);
  state.activePair = sanitizePairId(incoming.activePair);
  state.activeTf = sanitizeTf(incoming.activeTf);
  state.secondaryTf = sanitizeTf(incoming.secondaryTf, "4H");
  state.multiPaneTfs = sanitizeImportedMultiPaneTfs(incoming.multiPaneTfs, state.secondaryTf);
  state.multiPanePairs = sanitizeMultiPanePairs(incoming.multiPanePairs);
  state.oracleAnchor = migrateOracleAnchor(incoming.oracleAnchor);
  state.mainView = sanitizeMainView(incoming.mainView);
  state.chartMode = sanitizeChartMode(incoming.chartMode);
  state.multiChartLayout = sanitizeMultiChartLayout(
    incoming.multiChartLayout ?? (incoming.multiChart ? "2v" : "1"),
  );
  state.multiChart = state.multiChartLayout !== "1";
  state.multiChartLinked = !!incoming.multiChartLinked;
  if (Array.isArray(incoming.favoritePairs)) {
    state.favoritePairs = incoming.favoritePairs
      .filter((p): p is PairId => typeof p === "string" && PAIR_IDS.has(p as PairId))
      .slice(0, 20);
  } else {
    state.favoritePairs = ["HMC_USDT", "SUP_USDT", "HMC_SUP"];
  }
  if (!state.favoritePairs.length) state.favoritePairs = ["HMC_USDT"];
  state.bookGrouping =
    typeof incoming.bookGrouping === "number" && Number.isFinite(incoming.bookGrouping)
      ? Math.max(0, incoming.bookGrouping)
      : 0;
  state.bookView = incoming.bookView === "depth" ? "depth" : "book";
  state.chartFullscreen = !!incoming.chartFullscreen;
  state.drawingsLocked = !!incoming.drawingsLocked;
  state.activeDrawTool =
    typeof incoming.activeDrawTool === "string" &&
    ["cursor", "hline", "vline", "cross", "trend", "ray", "fib", "rect", "text", "measure"].includes(incoming.activeDrawTool)
      ? incoming.activeDrawTool
      : "cursor";
  state.initialEquityUsdt =
    typeof incoming.initialEquityUsdt === "number" && Number.isFinite(incoming.initialEquityUsdt)
      ? Math.max(0, incoming.initialEquityUsdt)
      : state.initialEquityUsdt;
  state.equityBaselineV =
    typeof incoming.equityBaselineV === "number" && Number.isFinite(incoming.equityBaselineV)
      ? incoming.equityBaselineV
      : state.equityBaselineV;
  return state;
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
