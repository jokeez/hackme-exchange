import type {
  DemoState,
  Order,
  OrderKind,
  OrderSide,
  PairId,
  Timeframe,
  Trade,
  Wallet,
} from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS, DEFAULT_MULTI_PANE_TFS, TIMEFRAMES } from "./types";
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
  sanitizePlainNote,
} from "./sanitize";
import { sanitizeDrawings, stripPollutionKeys } from "./chartDraw";
import { sanitizeFeeConfig } from "./fees";
import { defaultDemoState } from "./store";
import { uid } from "./id";

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
export const MAX_IMPORT_TRADE_QUOTE = 1_000_000;

const VIP_VOLUME_WINDOW_MS = 30 * 86_400_000;

const PAIR_IDS = new Set<PairId>(["HMC_USDT", "SUP_USDT", "HMC_SUP", "HMC_BTC", "SUP_BTC"]);
const ORDER_SIDES = new Set<OrderSide>(["buy", "sell"]);
const ORDER_KINDS = new Set<OrderKind>([
  "market",
  "limit",
  "stop_limit",
  "stop_market",
  "trailing_stop",
  "oco",
]);

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

function sanitizeImportedTrade(t: Trade): Trade {
  const amountQuote = Math.min(
    typeof t.amountQuote === "number" && Number.isFinite(t.amountQuote) ? Math.max(0, t.amountQuote) : 0,
    MAX_IMPORT_TRADE_QUOTE,
  );
  const amountBase = Math.min(
    typeof t.amountBase === "number" && Number.isFinite(t.amountBase) ? Math.max(0, t.amountBase) : 0,
    MAX_IMPORT_TRADE_QUOTE,
  );
  const ts = typeof t.ts === "number" && Number.isFinite(t.ts) ? t.ts : Date.now();
  return {
    id: sanitizeDomId(t.id, uid()),
    pairId: sanitizePairId(t.pairId),
    side: ORDER_SIDES.has(t.side) ? t.side : "buy",
    price: typeof t.price === "number" && Number.isFinite(t.price) ? Math.max(0, t.price) : 0,
    amountQuote,
    amountBase,
    ts,
    feeQuote: typeof t.feeQuote === "number" && Number.isFinite(t.feeQuote) ? Math.max(0, t.feeQuote) : 0,
    feeHmc: typeof t.feeHmc === "number" && Number.isFinite(t.feeHmc) ? Math.max(0, t.feeHmc) : 0,
    feeRole: t.feeRole === "maker" ? "maker" : "taker",
    feePaidInHmc: !!t.feePaidInHmc,
  };
}

function sanitizeImportedOrder(o: Order): Order | null {
  const id = sanitizeDomId(o.id);
  if (!id) return null;
  const side = ORDER_SIDES.has(o.side) ? o.side : null;
  const kind = ORDER_KINDS.has(o.kind) ? o.kind : null;
  if (!side || !kind) return null;
  return {
    id,
    pairId: sanitizePairId(o.pairId),
    side,
    kind,
    price: typeof o.price === "number" && Number.isFinite(o.price) ? Math.max(0, o.price) : 0,
    amountBase:
      typeof o.amountBase === "number" && Number.isFinite(o.amountBase) ? Math.max(0, o.amountBase) : 0,
    filledBase:
      typeof o.filledBase === "number" && Number.isFinite(o.filledBase) ? Math.max(0, o.filledBase) : 0,
    status:
      o.status === "open" ||
      o.status === "triggered" ||
      o.status === "filled" ||
      o.status === "cancelled"
        ? o.status
        : "cancelled",
    source: o.source === "lab" ? "lab" : "paper",
    createdAt: typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now(),
    stopPrice: typeof o.stopPrice === "number" && Number.isFinite(o.stopPrice) ? o.stopPrice : undefined,
    trailPct: typeof o.trailPct === "number" && Number.isFinite(o.trailPct) ? o.trailPct : undefined,
    trailAnchor:
      typeof o.trailAnchor === "number" && Number.isFinite(o.trailAnchor) ? o.trailAnchor : undefined,
    timeInForce:
      o.timeInForce === "IOC" || o.timeInForce === "FOK" || o.timeInForce === "GTC" ? o.timeInForce : undefined,
    postOnly: o.postOnly ? true : undefined,
    ocoGroupId: o.ocoGroupId ? sanitizeDomId(o.ocoGroupId) || undefined : undefined,
    ocoRole: o.ocoRole === "tp" || o.ocoRole === "sl" ? o.ocoRole : undefined,
  };
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
  state.drawings = sanitizeDrawings(incoming.drawings, 200);
  state.candles =
    incoming.candles && typeof incoming.candles === "object" && !Array.isArray(incoming.candles)
      ? incoming.candles
      : {};
  state.equitySnapshots = Array.isArray(incoming.equitySnapshots)
    ? incoming.equitySnapshots.slice(0, 200).filter(
        (e) =>
          e &&
          typeof e === "object" &&
          typeof (e as { ts?: unknown }).ts === "number" &&
          typeof (e as { equityUsdt?: unknown }).equityUsdt === "number",
      )
    : [];
  state.chartOverlays = {
    ...DEFAULT_CHART_OVERLAYS,
    ...(incoming.chartOverlays && typeof incoming.chartOverlays === "object" ? incoming.chartOverlays : {}),
  };
  state.activePair = sanitizePairId(incoming.activePair);
  state.activeTf = sanitizeTf(incoming.activeTf);
  state.secondaryTf = sanitizeTf(incoming.secondaryTf, "4H");
  state.multiPaneTfs = sanitizeImportedMultiPaneTfs(incoming.multiPaneTfs, state.secondaryTf);
  state.oracleAnchor = sanitizeOracleAnchor(incoming.oracleAnchor);
  state.mainView = sanitizeMainView(incoming.mainView);
  state.chartMode = sanitizeChartMode(incoming.chartMode);
  state.multiChartLayout = sanitizeMultiChartLayout(
    incoming.multiChartLayout ?? (incoming.multiChart ? "2v" : "1"),
  );
  state.multiChart = state.multiChartLayout !== "1";
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
    ["cursor", "hline", "trend", "fib", "rect", "text", "measure"].includes(incoming.activeDrawTool)
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
