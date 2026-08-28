import "./styles.css";
import { patchAccountFundsDom, renderAccountPage, wireAccountFunding } from "./account";
import { validateLabWithdrawDestination } from "./labCustody";
import { captureEphemeralUi, restoreEphemeralUi } from "./uiPreserve";
import { aggregateBookLevels, buildOrderBook, matchMarket } from "./book";
import { bookStepsForPair } from "./bookSteps";
import {
  applyMidToPairCandles,
  CANDLE_BASE_TF,
  deriveAllTimeframes,
  prependOlderCandles,
  stats24h,
} from "./candles";
import {
  applyOverlays,
  chartScreenshot,
  clearAllIndicators,
  clearDrawingSelection,
  clearIndicatorConfig,
  countActiveIndicators,
  deleteSelectedDrawing,
  destroyChart,
  getDisplayedLastCandle,
  getChartMountOpts,
  getFocusedChartPaneId,
  getMainCrosshairPane,
  getSelectedDrawingId,
  mountChart,
  refreshDrawings,
  refreshOrderLines,
  resetChartView,
  applyChartInteractionOptions,
  resizeChart,
  scrollToTimestamp,
  setActiveDrawTool,
  setChartCrosshairMode,
  setCandleData,
  setChartMode,
  setContextPriceMarker,
  setDrawingsLockedFlag,
  softRefreshChart,
  updateLastCandle,
  updateLivePriceHud,
} from "./chart";
import { MAX_DRAWINGS } from "./chartDraw";
import { candleCountdown, fireBrowserAlert, yesterdayClose } from "./chartHud";
import { isHubEmbed, postHubGotoTab } from "./embed";
import { closeChartContextMenu, showChartContextMenu, showObjectTreeModal } from "./chartContextMenu";
import {
  loadLayoutPrefs,
  saveLayoutPrefs,
  setPanelWidth,
  terminalGridColumnsForView,
  togglePanelCollapsed,
  type LayoutPrefs,
} from "./layoutPrefs";
import { tickInputValue } from "./tick";
import { Ico, drawToolIcon, pairAssetIcons, type DrawIconId } from "./icons";
import { uid } from "./id";
import { destroySecondaryChart, resizeSecondaryCharts, resetSecondaryPaneView, syncSecondaryChart, updateSecondaryChart, listSecondaryCrosshairPanes } from "./chartSecondary";
import { registerCrosshairPane, setCrosshairSyncEnabled, getCrosshairSyncDebug } from "./chartCrosshairSync";
import { clearTimeSyncRegistry, registerTimeSyncPane, setTimeSyncEnabled, getTimeSyncDebug } from "./chartTimeSync";
import { renderOracleSettingsModal, trapModalFocus } from "./oracleSettings";
import {
  authLogout,
  authRevokeAll,
  displayToMinor,
  exchangeHealth,
  fetchCustodyFees,
  fetchDepositAddress,
  formatExchangeReject,
  listExchangeFills,
  listWithdrawals,
  minorToDisplay,
  getLabSessionMeta,
  postLabBridgeCredit,
  postLabConvert,
  postLabDeposit,
  getLabConvertQuote,
  requestWithdraw,
} from "./adapters/exchangeApi";
import { labFixtureConnect } from "./adapters/labFixture";
import {
  cancelLabOrder,
  clearLabBookCache,
  getLabBookCache,
  labBookMid,
  labMarketSlipHint,
  mergeServerFills,
  placeLabOrder,
  refreshLabBook,
  runLabCounterpartyCross,
  syncLabBalancesAndBook,
  useLabMatching,
  isLabSessionStale,
} from "./adapters/labMatching";
import {
  DEFAULT_TRADING_GUARDS,
  parseHealthFeeWallet,
  parseHealthTradingGuards,
  validatePaperTradingGuards,
  type TradingGuards,
} from "./tradingGuards";
import { INTEGRATION, isLabApiEnabled, isLiveModeBlocked, isPaperMode, modeChromeLabel, modeStatusPill } from "./config/integration";
import { assertOrderFunds, freeBalance, maxOrderBaseAmount } from "./balance";
import { nodeWalletUrl } from "./adapters/walletLinks";
import { fetchNodeWallet, mergeNodeIntoDemoWallet, probeNodeOnline } from "./adapters/nodeWallet";
import { markPerf, measurePerf, throttle } from "./perf";
import {
  CONVERT_ASSETS,
  CONVERT_ROUTES,
  assetSymbol,
  convert,
  convertChipDefaultAmount,
  convertFeeHintLine,
  convertNetReceive,
  convertRateLabel,
  pairQuoteSym,
  feeQuoteFromLabConvert,
  flipRoute,
  formatConvertFeeToast,
  formatLabConvertFeeToast,
  previewConvert,
  convertRouteDef,
  routeForAssets,
  type ConvertPreview,
  type ConvertRoute,
} from "./convert";
import { loadRecentPairs, pushRecentPair } from "./recentPairs";
import { downloadText, exportDemoJson, parseDemoImport } from "./demoIo";
import { renderDepthPanel, renderDepthSvg } from "./depth";
import { renderOracleStatusHtml, patchOracleStatusDom, type OracleMeta } from "./oracleStatus";
import { parseRouteHash, writeRouteHash } from "./routeHash";
import { appendSyntheticTrade, mergeTapeRows, seedPublicTape, type TapePrint } from "./tape";
import {
  activeVipTier,
  calcFee,
  feeScheduleLabel,
  formatBps,
  liquidityRole,
  nextVipProgress,
  previewFeeRole,
  volume30dUsdt,
} from "./fees";
import { executeFill } from "./execution";
import {
  showChartStyleModal,
  showGoToDateModal,
  showIndicatorModal,
  showMultiChartPicker,
  showOverlayMenu,
} from "./chartModals";
import {
  readOrderForm,
  renderDualOrderPanel,
  applyRestingLimitPrices,
  setFormPrice,
  setOrderMsg,
  setOrderPreview,
  syncOrderTypeTabs,
  syncPctMarks,
} from "./orderPanel";
import { recordConvert } from "./ledger";
import { buildPairQuote, quoteToneClass, type PairQuote } from "./quote";
import {
  DEFAULT_SUP_REFERENCE_MID,
  applyLivePaperMids,
  fetchMarket,
  formatGh,
  formatNum,
  formatPct,
  formatPrice,
  formatPriceCompact,
  formatRewardPerM,
  formatVolBase,
  localFallbackMarket,
  midForPair,
  pctTone,
  tickerFromMarket,
} from "./market";
import { isMarketableLimit, orderTypeLabel, placeOco, placeOrder, processOpenOrders, validateLimitOrder } from "./orders";
import { LANES, PAIRS, pairById } from "./pairs";
import {
  seedEquitySnapshots,
  snapshotEquity,
  volumeRatio5m,
} from "./pnl";
import { fetchPoolLive, offlinePoolLive, pendingPoolLive, renderPoolPage } from "./pool";
import { copyTextToClipboard, escapeHtml, sanitizeOracleAnchor } from "./sanitize";
import {
  cancelAllOpenOrders,
  cancelOrder,
  ensureCandles,
  loadState,
  pnlPct,
  reseedCandlesFromMarket,
  resetDemo,
  saveState,
  toggleFavorite,
  updateOrderPrice,
  walletEquityFromMarket,
} from "./store";
import { toast } from "./toast";
import { isMobileLayout, loadMobilePanel, loadMobileTradeSide, mobilePanelResizeEnabled, MOBILE_LAYOUT_MAX_PX, saveMobilePanel, saveMobileTradeSide, setMobileTradeSide, syncMobileLayoutClass, type MobilePanel } from "./mobile";
import { loadTheme, saveTheme } from "./theme";
import type {
  Candle,
  ChartMode,
  DemoState,
  DrawTool,
  IndicatorId,
  MainView,
  MarketSnapshot,
  MultiPanePairs,
  MultiPaneTfs,
  OrderKind,
  OrderSide,
  PairId,
  PoolLive,
  Ticker,
  Timeframe,
  ThemeId,
  TimeInForce,
  Wallet,
} from "./types";
import { QUICK_TFS, TIMEFRAMES, TF_SEC, DEFAULT_MULTI_PANE_PAIRS } from "./types";

let state = loadState();
let theme: ThemeId = loadTheme();
let layoutPrefs: LayoutPrefs = loadLayoutPrefs();
let market: MarketSnapshot | null = null;
let poolLive: PoolLive | null = null;
let tickers: Record<PairId, Ticker> = {} as Record<PairId, Ticker>;
let pollTimer: number | undefined;
/** Default Limit so price fields are visible (Market still one click away). */
let uiType: OrderKind = "limit";
let uiTif: TimeInForce = "GTC";
let uiPostOnly = false;
let activityTab: "tape" | "orders" | "history" | "alerts" = "orders";

function normalizeActivityTab(raw: string | null | undefined): typeof activityTab {
  if (raw === "tape" || raw === "history" || raw === "alerts" || raw === "orders") return raw;
  return "orders";
}

function gotoMainView(view: MainView): void {
  state.mainView = view;
  saveState(state);
  chartMounted = false;
  if (view === "account" && isLabApiEnabled()) void refreshTradingGuardsFromHealth();
  syncRouteHash();
  render();
}
let marketSearch = "";
let marketLane = "all";
let chartMounted = false;
/** After reseed / multi-bar gap — next patchLive must full-replace candle series. */
let chartNeedsFullReplace = false;
let refreshGen = 0;
let refreshInFlight: Promise<void> | null = null;
let hotkeysWired = false;
let lastOhlc: Candle | null = null;
let prevMids: Partial<Record<PairId, number>> = {};
let tickTimer: number | undefined;
let labBookTimer: number | undefined;
let oracleAgeTimer: number | undefined;
let publicTape: TapePrint[] = [];
let bookPhase = 0;
let announceDismissed =
  sessionStorage.getItem("hackme-ex-announce-dismiss") === "1" || isHubEmbed();
let liveTickN = 0;
let mobilePanel: MobilePanel = loadMobilePanel();
let mobileToolsOpen = false;

/** Session-only denser desk for hub iframe — do not persist over standalone prefs. */
function applyHubEmbedLayoutPrefs(): void {
  if (!isHubEmbed()) return;
  layoutPrefs = {
    ...layoutPrefs,
    toolsCollapsed: true,
    bookWidth: Math.min(layoutPrefs.bookWidth, 200),
    rightWidth: Math.min(Math.max(layoutPrefs.rightWidth, 240), 280),
  };
}

/** Phone: session-only tools sheet — never fold desktop draw-tools prefs. */
function applyMobileLayoutPrefs(): void {
  syncMobileLayoutClass();
  if (isHubEmbed()) return;
  if (isMobileLayout()) {
    mobileToolsOpen = false;
    document.getElementById("terminal")?.classList.remove("mobile-tools-open");
    return;
  }
  mobileToolsOpen = false;
  document.getElementById("terminal")?.classList.remove("mobile-tools-open");
}

function onMobileLayoutChange(): void {
  const wasMobile = document.documentElement.classList.contains("mobile-layout");
  syncMobileLayoutClass();
  const nowMobile = isMobileLayout();
  showChartTypeDrop(false);
  if (wasMobile !== nowMobile) {
    mobileToolsOpen = false;
    document.getElementById("terminal")?.classList.remove("mobile-tools-open");
    applyLayoutToDom();
    if (chartMounted) applyChartInteractionOptions();
  }
}


let oracleMeta: OracleMeta = {
  source: "fallback",
  fetchedAt: 0,
  poolStatus: "offline",
};
/** Soft-public guards from /health when present; else API-documented defaults. */
let tradingGuards: TradingGuards = { ...DEFAULT_TRADING_GUARDS };
/** Lab fee-collection address from /health `fee_wallet` (null → hide UI). */
let labFeeWallet: string | null = null;
/** Convert desk selection — survives re-render without form wipe. */
let convertFrom: keyof Wallet = "hmc";
let convertTo: keyof Wallet = "usdt";
let convertAmtStr = "100";
let convertConfirmLarge = true;
/** Ignore stale lab convert quotes when flip/amount races ahead of await. */
let convertPreviewSeq = 0;
/** Ignore stale custody fee quotes when asset/amount change mid-flight. */
let withdrawQuoteSeq = 0;
/** Ignore stale fills list paints after re-render / rapid Sync. */
let fillsRefreshSeq = 0;
/** Block double Convert clicks while the lab/paper swap is in flight. */
let convertInFlight = false;
/** Block double Spot submit while a lab order request is in flight. */
let orderInFlight = false;
/** Block double mint / bridge / withdraw while a custody call is in flight. */
let custodyInFlight = false;

const PAPER_BADGE = `<span class="demo-badge" title="Simulated exchange — not a real CEX">PAPER · SYNTHETIC</span>`;
const PAPER_BADGE_SM = `<span class="demo-badge sm" title="Simulated exchange — not a real CEX">PAPER</span>`;
const LAB_BOOK_BADGE = `<span class="demo-badge" title="Live L2 from private lab matching engine">DEMO/LAB · LIVE BOOK</span>`;
const LAB_BOOK_BADGE_SM = `<span class="demo-badge sm" title="Live L2 from private lab matching engine">LAB</span>`;

function bookHeaderBadge(): string {
  return useLabMatching() ? LAB_BOOK_BADGE_SM : PAPER_BADGE_SM;
}

function renderPanelRail(
  side: "left" | "right" | "tools",
  id: string,
  label: string,
  title: string,
): string {
  const chevron = side === "right" ? "‹" : "›";
  return `<button type="button" class="panel-rail ${side === "tools" ? "tools-rail" : side}" id="${id}" title="${title}" aria-label="${title}">
    <span class="rail-chevron" aria-hidden="true">${chevron}</span>
    <span class="rail-label">${label}</span>
  </button>`;
}

function renderMobilePanelTabs(): string {
  const tabs: { id: MobilePanel; label: string; ico: string; panelId: string }[] = [
    { id: "trade", label: "Trade", ico: "trade", panelId: "order-zone" },
    { id: "chart", label: "Chart", ico: "chart", panelId: "col-center" },
    { id: "markets", label: "Markets", ico: "markets", panelId: "col-right" },
    { id: "orders", label: "Orders", ico: "orders", panelId: "activity-panel" },
  ];
  return `<nav class="mobile-panel-tabs" id="mobile-panel-tabs" role="tablist" aria-label="Spot trading">
    ${tabs
      .map((t) => {
        const on = mobilePanel === t.id;
        return `<button type="button" role="tab" class="mp-tab ${on ? "active" : ""}" data-mp="${t.id}" id="mp-tab-${t.id}" aria-selected="${on}" aria-controls="${t.panelId}" tabindex="${on ? "0" : "-1"}"><span class="mp-ico mp-ico-${t.ico}" aria-hidden="true"></span><span class="mp-label">${t.label}</span></button>`;
      })
      .join("")}
  </nav>`;
}

function renderMobileChartTradeBar(): string {
  return `<div class="mobile-chart-trade-bar" id="mobile-chart-trade-bar" hidden aria-hidden="true">
    <button type="button" class="mctb buy" data-goto-trade="buy" aria-label="Open buy order form">Buy</button>
    <button type="button" class="mctb sell" data-goto-trade="sell" aria-label="Open sell order form">Sell</button>
  </div>`;
}

const app = document.getElementById("app")!;

function syncRouteHash(): void {
  writeRouteHash(state.mainView, state.activePair, state.activeTf);
}

function applyHashToState(): void {
  const h = parseRouteHash(typeof location !== "undefined" ? location.hash : "");
  if (h.view) state.mainView = h.view;
  if (h.pair) state.activePair = h.pair;
  if (h.tf) state.activeTf = h.tf;
}

function ensurePublicTape(force = false): void {
  if (useLabMatching()) return;
  const tk = tickers[state.activePair] ?? (market ? tickerFromMarket(market, state.activePair) : null);
  if (!tk) return;
  if (force || !publicTape.some((t) => t.pairId === state.activePair)) {
    publicTape = [
      ...publicTape.filter((t) => t.pairId !== state.activePair),
      ...seedPublicTape(state.activePair, tk),
    ].slice(0, 80);
  }
}

function renderAnnounce(): string {
  if (announceDismissed) return "";
  const lab = useLabMatching();
  const label = modeChromeLabel();
  const bold = isLiveModeBlocked()
    ? "Live mode blocked — exchange-api not connected"
    : lab
      ? "Private lab matching — not production custody or real money"
      : "Paper / synthetic demo — not real money or a real exchange";
  return `<div class="announce" id="announce-bar" role="status">
    <strong>${bold}</strong>
    · ${label}
    · ${lab ? "lab ledger balances" : "pool-oracle mids · paper balances in localStorage"}
    ${lab ? LAB_BOOK_BADGE : PAPER_BADGE}
    <button type="button" class="announce-x" id="btn-announce-x" aria-label="Dismiss">×</button>
  </div>`;
}

/** Refresh mode chrome without full render (lab connect/logout on Spot/Convert). */
function patchModeChrome(): void {
  if (!announceDismissed) {
    const html = renderAnnounce();
    const existing = document.getElementById("announce-bar");
    if (html && existing) {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      const next = wrap.firstElementChild;
      if (next) {
        existing.replaceWith(next);
        document.getElementById("btn-announce-x")?.addEventListener("click", () => {
          announceDismissed = true;
          sessionStorage.setItem("hackme-ex-announce-dismiss", "1");
          document.getElementById("announce-bar")?.remove();
        });
      }
    } else if (!html) {
      existing?.remove();
    }
  }
  const nodeEl = document.getElementById("node-status");
  if (nodeEl) {
    void probeNodeOnline().then((ok) => {
      const el = document.getElementById("node-status");
      if (!el) return;
      const base = modeStatusPill();
      el.textContent = ok ? `${base} · node up` : base;
    });
  }
  const tbSub = document.querySelector(".tb-sub");
  if (tbSub) {
    tbSub.textContent = useLabMatching() ? "Lab book · DEMO matching" : "Pool oracle · paper demo";
  }
  const bookTitle = document.querySelector(".col-book .col-title > span");
  if (bookTitle) {
    bookTitle.innerHTML = `Order Book ${bookHeaderBadge()}`;
  }
  const meta = document.getElementById("order-head-meta");
  const modeBadge = meta?.querySelector(".demo-badge.meta-compact:not([data-lab-mm-badge])");
  if (modeBadge) {
    if (useLabMatching()) {
      modeBadge.textContent = "LAB";
      modeBadge.setAttribute("title", "Private lab matching — not production");
    } else {
      modeBadge.textContent = "PAPER";
      modeBadge.setAttribute("title", "Simulated exchange — not real CEX");
    }
  }
}

function availBalance(pair = pairById(state.activePair)): { base: number; quote: number } {
  const bk = pair.base.toLowerCase() as keyof typeof state.wallet;
  const qk = pair.quote.toLowerCase() as keyof typeof state.wallet;
  if (!market) return { base: state.wallet[bk] ?? 0, quote: state.wallet[qk] ?? 0 };
  return { base: freeBalance(state, bk, market), quote: freeBalance(state, qk, market) };
}

/** Keep Avbl chips in sync after fills without full order-panel remount. */
function patchAvailChips(): void {
  if (state.mainView !== "spot") return;
  const pair = pairById(state.activePair);
  const av = availBalance(pair);
  const buy = document.querySelector('[data-avail-side="buy"] b');
  const sell = document.querySelector('[data-avail-side="sell"] b');
  if (buy) buy.textContent = `${formatNum(av.quote, 4)} ${pair.quote}`;
  if (sell) sell.textContent = `${formatNum(av.base, 2)} ${pair.base}`;
}

function placeOrderOrWarn(
  pairId: PairId,
  side: OrderSide,
  kind: OrderKind,
  amountBase: number,
  price: number,
  stopPrice?: number,
  trailPct?: number,
  timeInForce: TimeInForce = "GTC",
  postOnly = false,
): boolean {
  if (!market) return false;
  const res = placeOrder(
    state,
    pairId,
    side,
    kind,
    amountBase,
    price,
    stopPrice,
    trailPct,
    timeInForce,
    postOnly,
    market,
  );
  if ("ok" in res && res.ok === false) {
    toast(res.reason, "warn");
    return false;
  }
  return true;
}

function paperGuardsOrWarn(
  side: "buy" | "sell",
  kind: OrderKind,
  amountBase: number,
  price: number,
): boolean {
  if (isLabSessionStale()) {
    const msg = "Lab session stale — reconnect fixture (paper matching frozen)";
    setOrderMsg(side, msg, "err");
    toast(msg, "warn");
    return false;
  }
  const pair = pairById(state.activePair);
  const mid =
    (useLabMatching() ? labBookMid(state.activePair) : 0) ||
    (market ? midForPair(market, state.activePair) : activeTicker().mid);
  const check = validatePaperTradingGuards({
    side,
    kind,
    amountBase,
    price,
    mid,
    quoteSymbol: pair.quote,
    guards: tradingGuards,
  });
  if (!check.ok) {
    setOrderMsg(side, check.reason, "err");
    toast(check.reason, "warn");
    return false;
  }
  return true;
}

/** Lab POST opts: only send pay_fee_in_hmc when /health advertises support. */
function labOrderOpts(extra?: {
  stopLimitDisplay?: number;
  trailPct?: number;
  postOnly?: boolean;
  timeInForce?: TimeInForce;
}): {
  market: MarketSnapshot | null;
  payFeeInHmc?: boolean;
  stopLimitDisplay?: number;
  trailPct?: number;
  postOnly?: boolean;
  timeInForce?: TimeInForce;
} {
  return {
    market,
    payFeeInHmc: tradingGuards.hmcFeePayServer && state.feeConfig.payFeesInHmc ? true : undefined,
    ...extra,
  };
}

let healthBackoffUntil = 0;

async function refreshTradingGuardsFromHealth(): Promise<void> {
  if (!isLabApiEnabled()) return;
  if (Date.now() < healthBackoffUntil) return;
  const prevSeeded = tradingGuards.labMmSeeded;
  const prevFee = labFeeWallet;
  const prevDisc = state.feeConfig.hmcDiscountPct;
  try {
    const h = await exchangeHealth(2_000);
    if (!h.ok) {
      if ("code" in h && (h.code === "unreachable" || h.status === 0)) {
        healthBackoffUntil = Date.now() + 60_000;
      }
      return;
    }
    healthBackoffUntil = 0;
    tradingGuards = parseHealthTradingGuards(h);
    labFeeWallet = parseHealthFeeWallet(h);
    if (tradingGuards.hmcDiscountPctServer != null) {
      state.feeConfig.hmcDiscountPct = Math.min(
        25,
        Math.max(0, tradingGuards.hmcDiscountPctServer),
      );
    }
  } catch {
    /* keep last / defaults */
  }
  if (state.feeConfig.hmcDiscountPct !== prevDisc) saveState(state);
  if (
    (labFeeWallet !== prevFee || state.feeConfig.hmcDiscountPct !== prevDisc) &&
    state.mainView === "account"
  ) {
    render();
    return;
  }
  if (tradingGuards.labMmSeeded === prevSeeded) return;
  const meta = document.getElementById("order-head-meta");
  if (!meta) return;
  const existing = meta.querySelector("[data-lab-mm-badge]");
  if (tradingGuards.labMmSeeded && !existing) {
    const span = document.createElement("span");
    span.className = "demo-badge sm muted-badge";
    span.dataset.labMmBadge = "1";
    span.title = "Live book levels seeded by lab market-maker";
    span.textContent = "LAB MM";
    const fee = meta.querySelector("#fee-row");
    meta.insertBefore(span, fee ?? null);
  } else if (!tradingGuards.labMmSeeded && existing) {
    existing.remove();
  }
}

function placeOcoOrWarn(
  pairId: PairId,
  side: OrderSide,
  amountBase: number,
  tpPrice: number,
  slStop: number,
  slLimit: number,
): boolean {
  if (!market) return false;
  const res = placeOco(state, pairId, side, amountBase, tpPrice, slStop, slLimit, market);
  if ("ok" in res && res.ok === false) {
    toast(res.reason, "warn");
    return false;
  }
  return true;
}

function chartOpts() {
  const q = activePairQuote();
  return getChartMountOpts(state, state.activePair, state.activeTf, q.mid, {
    lastPriceUp: q.tone !== "down",
    yesterdayClose: q.refOpen > 0 ? q.refOpen : yesterdayClose(state.candles[state.activePair]?.[state.activeTf] ?? []),
    watermark: `${pairById(state.activePair).label} · ${state.activeTf}`,
  });
}

function chartAlertsForPair(pairId: PairId = state.activePair) {
  return state.priceAlerts.filter((a) => a.pairId === pairId).map((a) => ({ price: a.price, fired: a.fired }));
}

function refreshActivityPanel(): void {
  const body = document.getElementById("activity-body");
  if (!body) return;
  body.innerHTML = renderActivityBody();
  wireCancelButtons();
  wireFundsFunding();
  wireAlertButtons();
}

function refreshOpenOrderChartLines(): void {
  refreshOrderLines(
    state.orders.filter((o) => o.pairId === state.activePair),
    chartAlertsForPair(),
  );
}

let lastMidForAlerts = 0;

function activeTicker(): Ticker {
  return tickers[state.activePair] ?? tickerFromMarket(market!, state.activePair);
}

/** Spot mid for any pair — same source for toolbar, market rows, and chart HUD. */
function spotMidForPair(pairId: PairId): number {
  if (useLabMatching()) {
    const lab = labBookMid(pairId);
    if (lab > 0) return lab;
  }
  const blended = prevMids[pairId];
  if (blended != null && blended > 0) return blended;
  const tk = tickers[pairId];
  if (tk?.mid && tk.mid > 0) return tk.mid;
  return market ? midForPair(market, pairId) : 0;
}

/** Unified quote: one mid + 24h change from 15m candles everywhere. */
function pairQuote(pairId: PairId = state.activePair): PairQuote {
  return buildPairQuote({
    pairId,
    mid: spotMidForPair(pairId),
    candlesByTf: state.candles[pairId],
    fallbackTf: pairId === state.activePair ? state.activeTf : "15m",
  });
}

function activePairQuote(): PairQuote {
  return pairQuote(state.activePair);
}

function patchTickerBar(quote: PairQuote = activePairQuote()): void {
  const pair = pairById(state.activePair);
  const tone = quoteToneClass(quote.tone);
  const priceEl = document.querySelector(".tb-price");
  const chgEl = document.querySelector(".tb-chg");
  const fiatEl = document.querySelector("[data-tb-usdt]") as HTMLElement | null;
  const statsEl = document.querySelector(".tb-stats");
  if (priceEl) {
    priceEl.textContent = formatPrice(quote.mid);
    priceEl.className = `tb-price ${tone}`;
  }
  if (chgEl) {
    chgEl.textContent = formatPct(quote.changePct);
    chgEl.className = `tb-chg ${tone}`;
  }
  if (fiatEl && market && pair.quote !== "USDT") {
    const fx = pair.quote === "BTC" ? market.btcUsd : pair.quote === "SUP" ? market.supUsdt : 1;
    fiatEl.textContent = `≈ ${formatPrice(quote.mid * fx)} USDT`;
  }
  if (statsEl && quote.high24h > 0) {
    const spans = statsEl.querySelectorAll("span.mono");
    if (spans[0]) spans[0].textContent = formatPrice(quote.high24h);
    if (spans[1]) spans[1].textContent = formatPrice(quote.low24h);
    if (spans[2]) spans[2].textContent = formatVolBase(quote.vol24h, pair.base);
  }
}

/** Spot header / order defaults: lab L2 mid when fixture matching is live. */
function spotTradeMid(): number {
  return spotMidForPair(state.activePair);
}

function filteredPairs() {
  return PAIRS.filter((p) => {
    if (marketLane !== "all" && p.lane !== marketLane) return false;
    const q = marketSearch.toLowerCase();
    if (!q) return true;
    return `${p.base}${p.quote}`.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
  });
}

function renderMarketsList(): string {
  const favs = filteredPairs().filter((p) => state.favoritePairs.includes(p.id));
  const rest = filteredPairs().filter((p) => !state.favoritePairs.includes(p.id));
  if (!favs.length && !rest.length) {
    const q = marketSearch.trim();
    return `<div class="markets-empty">
      <p class="empty-title">${q ? "No matches" : "No markets"}</p>
      <p class="muted small">${
        q ? `Nothing matches “${escapeHtml(q)}”. Try another symbol or lane.` : "This lane has no pairs yet."
      }</p>
      ${!q ? `<p class="muted small">Switch to <button type="button" class="link-inline" data-lane-jump="all">All</button> to see every pair.</p>` : ""}
    </div>`;
  }
  const row = (p: (typeof PAIRS)[0]) => {
    const q = pairQuote(p.id);
    const active = p.id === state.activePair ? "active" : "";
    const starred = state.favoritePairs.includes(p.id) ? "on" : "";
    return `<div class="market-row-wrap ${active}">
      <button type="button" class="star ${starred}" data-star="${p.id}" title="Favorite" aria-label="Favorite ${p.label}">★</button>
      <button type="button" class="market-row ${active}" data-pair="${p.id}">
      <div class="mr-left">
        ${pairAssetIcons(p.base, p.quote)}
        <span class="mr-sym" title="${p.label}"><strong>${p.base}</strong><span class="muted">/${p.quote}</span></span>
      </div>
      <div class="mr-right">
        <span class="mono mr-px">${q.mid > 0 ? formatPriceCompact(q.mid) : "—"}</span>
        <span class="mono mr-chg ${quoteToneClass(q.tone)}">${formatPct(q.changePct)}</span>
      </div>
    </button></div>`;
  };
  const total = favs.length + rest.length;
  let html = "";
  html += `<div class="col-title flush-top">Favorites</div>`;
  if (favs.length) {
    html += favs.map(row).join("");
  } else {
    html += `<div class="markets-fav-empty">
      <p class="muted small">No favorites in this view. Tap ★ on a pair to pin it here.</p>
    </div>`;
  }
  html += `<div class="col-title">All markets <span class="col-count mono">${rest.length}/${total}</span></div>`;
  html += rest.map(row).join("");
  if (rest.length + favs.length > 0 && rest.length === 0) {
    html += `<div class="markets-hint muted small">All matching pairs are in Favorites.</div>`;
  }
  return html;
}

function bookGroupStep(): number {
  // Auto (0) = raw L2 levels — do not invent a bucket size (wrong click prices).
  if (state.bookGrouping > 0) return state.bookGrouping;
  return 0;
}

function renderVolumeRatio(): string {
  const vr = volumeRatio5m(state.trades, state.activePair);
  const buyLabel = vr.buyVol > 0 || vr.sellVol > 0
    ? `${formatNum(vr.buyPct, 0)}% B`
    : "50% B";
  const sellLabel = vr.buyVol > 0 || vr.sellVol > 0
    ? `${formatNum(vr.sellPct, 0)}% S`
    : "50% S";
  return `<div class="volume-ratio" title="Buy/Sell volume · last 5 min">
    <div class="volume-ratio-labels"><span class="buy">${buyLabel}</span><span class="sell">${sellLabel}</span></div>
    <div class="volume-ratio-track">
      <div class="vr-buy" style="width:${vr.buyPct}%"></div>
      <div class="vr-sell" style="width:${vr.sellPct}%"></div>
    </div>
  </div>`;
}

function renderBook(): string {
  const t = activeTicker();
  const group = bookGroupStep();
  const labLive = useLabMatching();
  const lab = labLive ? getLabBookCache(state.activePair) : null;
  // Lab mode must never fall back to synthetic oracle book — empty until L2 arrives.
  const raw = labLive
    ? lab
      ? { bids: lab.bids, asks: lab.asks }
      : { bids: [], asks: [] }
    : buildOrderBook(t, 24, { phase: bookPhase });
  const bids = aggregateBookLevels(raw.bids, group, "bid");
  const asks = aggregateBookLevels(raw.asks, group, "ask");
  const pair = pairById(state.activePair);
  const bookView = state.bookView;
  if (!bids.length && !asks.length) {
    const emptyHint = labLive
      ? lab
        ? "Lab book empty — place a limit or wait for resting depth"
        : "Loading lab book…"
      : "Waiting for oracle mid…";
    return `<div class="book-view-tabs segmented">
      <button type="button" class="bv ${bookView !== "depth" ? "active" : ""}" data-bv="book">Book</button>
      <button type="button" class="bv ${bookView === "depth" ? "active" : ""}" data-bv="depth">Depth</button>
    </div><div class="markets-empty"><p class="empty-title">${labLive ? (lab ? "Lab book empty" : "Loading lab book") : "Order book unavailable"}</p><p class="muted small">${emptyHint}</p></div>`;
  }
  if (bookView === "depth") {
    return `<div class="book-view-tabs segmented">
      <button type="button" class="bv" data-bv="book">Book</button>
      <button type="button" class="bv active" data-bv="depth">Depth</button>
    </div>${renderVolumeRatio()}${renderDepthPanel(bids, asks, pair.base, pair.quote, { labLive })}`;
  }
  const max = Math.max(...bids.map((b) => b.amountBase), ...asks.map((a) => a.amountBase), 1);
  const row = (l: (typeof bids)[0], side: "bid" | "ask") => {
    const pct = (l.amountBase / max) * 100;
    const price = l.price;
    const title = labLive
      ? `Set ${side === "ask" ? "Buy" : "Sell"} limit to this lab price`
      : `Set ${side === "ask" ? "Buy" : "Sell"} limit to ${formatPrice(price)}`;
    const aria = side === "ask" ? `Buy at ${formatPrice(price)}` : `Sell at ${formatPrice(price)}`;
    return `<div class="ob-row ${side}" data-book-price="${price}" data-book-side="${side}" role="button" tabindex="0" title="${title}" aria-label="${aria}">
      <div class="ob-bar" style="width:${pct}%"></div>
      <span class="ob-price">${formatPrice(price)}</span>
      <span>${formatNum(l.amountBase, 1)}</span>
      <span class="dim ob-total">${formatPrice(l.totalQuote)}</span>
    </div>`;
  };
  const steps = bookStepsForPair(state.activePair);
  const bestBid = bids[0]?.price ?? (lab ? 0 : t.bid);
  const bestAsk = asks[0]?.price ?? (lab ? 0 : t.ask);
  const midPx = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : lab ? bestBid || bestAsk || t.mid : t.mid;
  const spreadAbs = bestBid > 0 && bestAsk > 0 ? Math.max(0, bestAsk - bestBid) : Math.max(0, t.ask - t.bid);
  const spreadPct = midPx > 0 ? (spreadAbs / midPx) * 100 : 0;
  const midHint = labLive
    ? "Lab L2 mid"
    : "Oracle · indicative";
  const midTitle = labLive
    ? "Lab L2 mid"
    : "Oracle · indicative (not tradeable L2)";
  return `
    <div class="book-view-tabs segmented">
      <button type="button" class="bv active" data-bv="book">Book</button>
      <button type="button" class="bv" data-bv="depth">Depth</button>
    </div>
    ${renderVolumeRatio()}
    <div class="depth-wrap" aria-hidden="true">${renderDepthSvg(bids, asks)}</div>
    <div class="book-group-row">
      <label class="muted small">Group</label>
      <select id="book-group-select" class="book-select mono">
        ${steps.map((s) => `<option value="${s.value}" ${state.bookGrouping === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
      </select>
    </div>
    <div class="ob-head"><span>Price (${pair.quote})</span><span>Amount (${pair.base})</span><span class="ob-total">Total</span></div>
    <div class="ob-asks">${asks.slice().reverse().map((l) => row(l, "ask")).join("")}</div>
    <div class="ob-mid" title="${midTitle}">
      <div class="ob-mid-price">${formatPrice(midPx)}</div>
      <div class="ob-mid-spread">Spread ${formatPrice(spreadAbs)} · ${formatNum(spreadPct, 3)}%</div>
      <div class="ob-mid-src muted small">${midHint}</div>
    </div>
    <div class="ob-bids">${bids.map((l) => row(l, "bid")).join("")}</div>`;
}

function renderTape(): string {
  ensurePublicTape();
  const rows = useLabMatching()
    ? mergeTapeRows(state.trades, [], state.activePair, 18)
    : mergeTapeRows(state.trades, publicTape, state.activePair, 18);
  if (!rows.length) {
    return `<div class="tape-empty">
      <p class="empty-title">No trades yet</p>
      <p class="muted small">${useLabMatching() ? "Lab fills will appear here." : "Synthetic tape fills in as the oracle ticks."}</p>
    </div>`;
  }
  return rows
    .map(
      (t) => `<div class="tape-row ${t.synthetic ? "syn" : "you"}" title="${t.synthetic ? "Synthetic public tape (simulated)" : useLabMatching() ? "Your lab fill" : "Your paper fill"}">
        <span class="${t.side === "buy" ? "up" : "down"}">${formatPrice(t.price)}</span>
        <span class="mono">${formatNum(t.amountBase, 2)}</span>
        <span class="role-badge sm ${t.synthetic ? "syn-badge" : t.feeRole}">${t.synthetic ? "SYN" : t.feeRole === "maker" ? "M" : "T"}</span>
        <span class="dim">${new Date(t.ts).toLocaleTimeString()}</span>
      </div>`,
    )
    .join("");
}

function renderMobileTradeTape(): string {
  ensurePublicTape();
  const rows = useLabMatching()
    ? mergeTapeRows(state.trades, [], state.activePair, 8)
    : mergeTapeRows(state.trades, publicTape, state.activePair, 8);
  if (!rows.length) {
    return `<div class="mobile-tape-empty muted small">No trades yet</div>`;
  }
  return rows
    .map(
      (t) => `<div class="mobile-tape-row ${t.side === "buy" ? "up" : "down"}">
        <span class="mono">${formatPrice(t.price)}</span>
        <span class="mono dim">${formatNum(t.amountBase, 2)}</span>
      </div>`,
    )
    .join("");
}

function patchMobileTradeTape(): void {
  const el = document.getElementById("mobile-trade-tape");
  if (el) el.innerHTML = renderMobileTradeTape();
}

function formatTradeFee(t: { feeQuote: number; feeHmc?: number; feePaidInHmc: boolean }, quoteSymbol = "USDT"): string {
  if (t.feePaidInHmc && (t.feeHmc ?? 0) > 0) return `${formatNum(t.feeHmc!, 4)} HMC`;
  if (t.feeQuote > 0) return `${formatPrice(t.feeQuote)} ${quoteSymbol}`;
  return "—";
}

function feeFillToast(
  side: "buy" | "sell",
  amt: number,
  base: string,
  fee: { role: string; bps: number; feeQuote: number; feeHmc: number; paidInHmc: boolean },
  quoteAsset: string,
): void {
  const feeStr = fee.paidInHmc
    ? `${formatNum(fee.feeHmc, 4)} HMC`
    : `${formatPrice(fee.feeQuote)} ${quoteAsset}`;
  toast(
    `${side.toUpperCase()} ${formatNum(amt, 0)} ${base} · ${fee.role} ${formatBps(fee.bps)} · fee ${feeStr}`,
    "ok",
  );
}

function renderActivityBody(): string {
  if (!market) return "";
  if (activityTab === "tape") {
    return `<div class="tape-head"><span>Price</span><span>Qty</span><span>M/T</span><span>Time</span></div>
      <div id="tape">${renderTape()}</div>`;
  }
  if (activityTab === "alerts") {
    const rows = state.priceAlerts.filter((a) => a.pairId === state.activePair);
    if (!rows.length) {
      return `<div class="bottom-empty act-empty">
        <p class="empty-title">No alerts</p>
        <p class="muted small">Chart right-click → Add alert</p>
        <button type="button" class="btn-sm" id="btn-alert-at-mid">Alert at mid</button>
      </div>`;
    }
    return `<div class="act-list">${rows
      .map(
        (a) => `<div class="act-row">
        <div class="act-line">
          <span class="mono">${formatPrice(a.price)}</span>
          <span class="${a.fired ? "down" : "up"}">${a.fired ? "Fired" : "Armed"}</span>
        </div>
        <div class="act-meta dim">${new Date(a.createdAt).toLocaleString()}</div>
        <div class="act-actions">
          ${a.fired ? `<button type="button" class="link" data-alert-reset="${escapeHtml(a.id)}">Re-arm</button>` : ""}
          <button type="button" class="link" data-alert-del="${escapeHtml(a.id)}">Remove</button>
        </div>
      </div>`,
      )
      .join("")}</div>`;
  }
  if (activityTab === "history") {
    const rows = state.trades.slice(0, 40);
    if (!rows.length) {
      return `<div class="bottom-empty act-empty">
        <p class="empty-title">No fills yet</p>
        <p class="muted small">Filled orders show here</p>
      </div>`;
    }
    return `<div class="act-list">${rows
      .map((t) => {
        const p = pairById(t.pairId);
        return `<div class="act-row">
        <div class="act-line">
          <span class="${t.side === "buy" ? "up" : "down"}">${escapeHtml(t.side).toUpperCase()}</span>
          <span class="dim">${p.label}</span>
          <span class="role-badge ${t.feeRole}">${t.feeRole}</span>
        </div>
        <div class="act-line mono">
          <span>${formatPrice(t.price)}</span>
          <span>×${formatNum(t.amountBase, 2)}</span>
        </div>
        <div class="act-meta dim">${formatTradeFee(t, p.quote)} · ${new Date(t.ts).toLocaleString()}</div>
      </div>`;
      })
      .join("")}</div>`;
  }
  const rows = state.orders.filter((o) => o.status === "open" || o.status === "triggered");
  if (!rows.length) {
    const fills = state.trades.filter((t) => t.pairId === state.activePair).length;
    return `<div class="bottom-empty act-empty">
      <p class="empty-title">No open orders</p>
      <p class="muted small">${
        fills
          ? `Fills are under the Fills tab · Limit rests off mid by default`
          : `Use Buy/Sell under the chart · Limit rests on the book; Market fills instantly`
      }</p>
    </div>`;
  }
  return `<div class="act-list">${rows
    .map((o) => {
      const p = pairById(o.pairId);
      return `<div class="act-row">
      <div class="act-line">
        <span class="${o.side === "buy" ? "up" : "down"}">${escapeHtml(o.side).toUpperCase()}</span>
        <span>${escapeHtml(orderTypeLabel(o.kind, o))}${o.postOnly ? " PO" : ""}</span>
        <span class="dim">${p.label}</span>
      </div>
      <div class="act-line mono">
        <span>${formatPrice(o.price)}</span>
        ${o.stopPrice ? `<span class="dim">stop ${formatPrice(o.stopPrice)}</span>` : ""}
        <span>×${formatNum(o.amountBase, 2)}</span>
      </div>
      <div class="act-actions">
        <span class="dim mono">${o.timeInForce ?? "GTC"}</span>
        <button type="button" class="link" data-cancel="${escapeHtml(o.id)}">Cancel</button>
      </div>
    </div>`;
    })
    .join("")}</div>`;
}

function renderConvert(): string {
  const vip = activeVipTier(state, market ?? undefined);
  const labReady = tradingGuards.convertFeeServer && useLabMatching();
  const labAvail = tradingGuards.convertFeeServer && isLabApiEnabled() && !useLabMatching();
  const feeNote = labReady
    ? `Lab <code>GET/POST /convert</code> · seed mid · VIP taker ${formatBps(vip.takerBps)} (${vip.name}) · net shown`
    : labAvail
      ? `Lab convert ready — connect fixture on Account · taker ${formatBps(vip.takerBps)} (${vip.name})`
      : `Paper convert · spot taker ${formatBps(vip.takerBps)} (${vip.name}) — same VIP schedule as Spot`;
  const hmcPay =
    state.feeConfig.payFeesInHmc
      ? `Pay fees in HMC on (−${state.feeConfig.hmcDiscountPct}%)${tradingGuards.hmcFeePayServer ? " · server honors" : " · paper only until health advertises hmc_fee_pay"}`
      : `Fees in quote asset · toggle HMC (−${state.feeConfig.hmcDiscountPct}%) on Account or Spot`;

  const fromOpts = CONVERT_ASSETS.map(
    (a) =>
      `<option value="${a.key}" ${a.key === convertFrom ? "selected" : ""}>${a.symbol}</option>`,
  ).join("");
  const toOpts = CONVERT_ASSETS.map(
    (a) =>
      `<option value="${a.key}" ${a.key === convertTo ? "selected" : ""}>${a.symbol}</option>`,
  ).join("");

  const balRows = CONVERT_ASSETS.map((a) => {
    const v = freeBalance(state, a.key);
    return `<li><span>${a.symbol}</span><strong class="mono">${formatNum(v, a.key === "btc" ? 8 : 4)}</strong></li>`;
  }).join("");

  const recent = state.ledger
    .filter((e) => e.kind === "convert" && e.amount < 0)
    .slice(-6)
    .reverse()
    .map(
      (e) =>
        `<li class="mono"><span>${escapeHtml(e.note ?? "")}</span><span>${formatNum(Math.abs(e.amount), 4)}</span></li>`,
    )
    .join("");

  const quickIds: ConvertRoute[] = [
    "HMC_USDT",
    "USDT_HMC",
    "SUP_USDT",
    "HMC_SUP",
    "HMC_BTC",
    "BTC_HMC",
    "SUP_BTC",
    "BTC_SUP",
  ];
  const quick = quickIds
    .map((id) => {
      const r = CONVERT_ROUTES.find((x) => x.id === id);
      if (!r) return "";
      const active = routeForAssets(convertFrom, convertTo) === r.id;
      return `<button type="button" class="cv-chip ${active ? "active" : ""}" data-cv-route="${r.id}">${r.label}</button>`;
    })
    .join("");

  return `
  <section class="convert-page glass">
    <div class="convert-shell">
      <header class="convert-hero">
        <p class="kicker">Instant swap · demo</p>
        <h2>Convert</h2>
        <p class="muted convert-lead">Swap at mid · ${feeNote}. No book, no futures.</p>
        <p class="muted small convert-fee-mode mono">${hmcPay}</p>
      </header>
      <div class="convert-desk-wrap">
      <div class="convert-desk glass-inset">
        <div class="cv-quick" id="cv-quick">${quick}</div>
        <div class="cv-leg">
          <div class="cv-leg-head">
            <span>From</span>
            <button type="button" class="linkish" id="cv-max">Max</button>
          </div>
          <div class="cv-leg-row">
            <select id="cv-from" class="inp mono" aria-label="From asset">${fromOpts}</select>
            <input id="cv-amt" class="inp mono" type="number" min="0" step="any" value="${escapeHtml(convertAmtStr)}" aria-label="Amount" />
          </div>
          <div class="cv-bal muted small mono" id="cv-from-bal"></div>
          <div class="cv-pct" role="group" aria-label="Quick size">
            <button type="button" data-cv-pct="25">25%</button>
            <button type="button" data-cv-pct="50">50%</button>
            <button type="button" data-cv-pct="75">75%</button>
            <button type="button" data-cv-pct="100">Max</button>
          </div>
        </div>
        <button type="button" class="cv-flip" id="cv-flip" title="Flip direction" aria-label="Flip From and To">⇅</button>
        <div class="cv-leg">
          <div class="cv-leg-head"><span>To</span><span class="muted small" id="cv-to-label">You receive</span></div>
          <div class="cv-leg-row">
            <select id="cv-to" class="inp mono" aria-label="To asset">${toOpts}</select>
            <div class="cv-receive mono" id="cv-got">—</div>
          </div>
        </div>
        <div class="cv-quote mono" id="cv-quote">
          <div class="cv-q-row"><span>Rate</span><span id="cv-rate">—</span></div>
          <div class="cv-q-row"><span>Fee</span><span id="cv-fee">—</span></div>
          <div class="cv-q-row"><span>Route</span><span id="cv-route-label">—</span></div>
        </div>
        <label class="cv-confirm-row muted small">
          <input type="checkbox" id="cv-confirm-large" ${convertConfirmLarge ? "checked" : ""} />
          Confirm when spending &gt;50% of available balance
        </label>
        <button type="button" class="btn-primary btn-block cv-go" id="cv-go">Convert</button>
        <p class="muted small cv-hint" id="cv-hint">Pick two assets · live preview before you confirm</p>
        <div class="cv-actions">
          <button type="button" class="btn-sm" id="cv-open-spot" title="Open matching Spot market">Trade on Spot →</button>
        </div>
      </div>
      <aside class="convert-side glass-inset">
        <h3>Balances</h3>
        <ul class="cv-bal-list">${balRows}</ul>
        <h3>Recent</h3>
        ${recent ? `<ul class="cv-recent">${recent}</ul>` : `<p class="muted small">No converts yet</p>`}
      </aside>
      </div>
    </div>
  </section>`;
}

function refreshConvertPreview(): void {
  void refreshConvertPreviewAsync();
}

async function refreshConvertPreviewAsync(): Promise<void> {
  const seq = ++convertPreviewSeq;
  const balEl = document.getElementById("cv-from-bal");
  const gotEl = document.getElementById("cv-got");
  const rateEl = document.getElementById("cv-rate");
  const feeEl = document.getElementById("cv-fee");
  const routeEl = document.getElementById("cv-route-label");
  const hint = document.getElementById("cv-hint");
  const go = document.getElementById("cv-go") as HTMLButtonElement | null;
  if (!balEl || !gotEl || !rateEl || !feeEl || !routeEl) return;

  const avail = freeBalance(state, convertFrom, market ?? undefined);
  balEl.textContent = `Available ${formatNum(avail, convertFrom === "btc" ? 8 : 4)} ${assetSymbol(convertFrom)}`;

  const route = routeForAssets(convertFrom, convertTo);
  if (!route) {
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = "—";
    routeEl.textContent = "Unsupported pair";
    if (hint) hint.textContent = "No direct route for this pair — pick another To asset";
    if (go) go.disabled = true;
    return;
  }
  if (go) go.disabled = false;
  routeEl.textContent = CONVERT_ROUTES.find((r) => r.id === route)?.label ?? route;

  const amt = Number(convertAmtStr);
  if (!market || !(amt > 0)) {
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = "—";
    if (hint) hint.textContent = "Enter amount to see live receive + fee";
    return;
  }

  const r = CONVERT_ROUTES.find((x) => x.id === route)!;
  const def = convertRouteDef(route)!;
  const [fromSym, toSym] = r.label.split(" → ").map((s) => s.trim());
  const fromSnap = convertFrom;
  const toSnap = convertTo;
  const amtSnap = convertAmtStr;

  // Lab session: preview from server ConvertMid (seed/default) — not pool-oracle / last trade.
  // Never fall back to paper mids while lab matching is live (misleading preview → failed submit).
  if (tradingGuards.convertFeeServer && useLabMatching()) {
    const q = await getLabConvertQuote({
      from: fromSym,
      to: toSym,
      amount: displayToMinor(amt),
      pay_fee_in_hmc:
        tradingGuards.hmcFeePayServer && state.feeConfig.payFeesInHmc ? true : undefined,
    });
    // Stale response after flip/amount/re-render — do not paint over newer preview.
    if (seq !== convertPreviewSeq) return;
    if (
      convertFrom !== fromSnap ||
      convertTo !== toSnap ||
      convertAmtStr !== amtSnap ||
      !document.getElementById("cv-got")
    ) {
      return;
    }
    if (q.ok) {
      const midDisp = minorToDisplay(q.mid);
      const gotDisp = minorToDisplay(q.got);
      const netDisp = minorToDisplay(q.net_to);
      const feeQ = minorToDisplay(q.fee_quote);
      const feeH = minorToDisplay(q.fee_hmc);
      gotEl.textContent = formatPrice(netDisp);
      rateEl.textContent = convertRateLabel(
        assetSymbol(convertFrom),
        assetSymbol(convertTo),
        midDisp,
        def.invert,
        formatPrice,
      );
      feeEl.textContent = q.paid_in_hmc
        ? `Taker ${formatBps(q.fee_bps)} · lab · est ${formatPrice(feeH)} HMC`
        : `Taker ${formatBps(q.fee_bps)} · lab · est ${formatPrice(feeQ)} ${pairQuoteSym(def.pair)}`;
      if (hint) {
        hint.textContent =
          avail < amt
            ? `Need ${formatPrice(amt - avail)} more ${assetSymbol(convertFrom)}`
            : `You receive ≈ ${formatPrice(netDisp)} ${assetSymbol(convertTo)} net (gross ${formatPrice(gotDisp)}) · server seed mid`;
      }
      if (go) go.disabled = avail < amt;
      document.querySelectorAll("#cv-quick .cv-chip").forEach((btn) => {
        btn.classList.toggle("active", (btn as HTMLElement).dataset.cvRoute === route);
      });
      return;
    }
    const reject = formatExchangeReject(q);
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = reject;
    if (hint) {
      hint.textContent =
        q.code === "min_notional"
          ? `${reject} — raise amount (BTC routes often need ≥~200 HMC / ≥~500 SUP)`
          : q.code === "invalid_order"
            ? `${reject} — try a smaller size (pair qty/price caps)`
            : q.code === "convert_inventory"
              ? `${reject} — try Spot book or a smaller convert`
              : reject;
    }
    if (go) go.disabled = true;
    document.querySelectorAll("#cv-quick .cv-chip").forEach((btn) => {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.cvRoute === route);
    });
    return;
  }

  const prev = previewConvert(state, market, route, amt);
  if ("ok" in prev && prev.ok === false) {
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = prev.reason;
    if (hint) hint.textContent = prev.reason;
    if (go) go.disabled = true;
    return;
  }
  const p = prev as ConvertPreview;
  const net = convertNetReceive(p);
  gotEl.textContent = formatPrice(net);
  rateEl.textContent = convertRateLabel(
    assetSymbol(convertFrom),
    assetSymbol(convertTo),
    p.mid,
    def.invert,
    formatPrice,
  );
  feeEl.textContent = convertFeeHintLine(p);
  if (hint) {
    hint.textContent =
      avail < amt
        ? `Need ${formatPrice(amt - avail)} more ${assetSymbol(convertFrom)}`
        : `You receive ≈ ${formatPrice(net)} ${assetSymbol(convertTo)} net${
            p.fee.paidInHmc ? " · fee in HMC" : p.fee.feeQuote > 0 ? " · fee from quote" : ""
          }`;
  }
  if (go) go.disabled = avail < amt;

  document.querySelectorAll("#cv-quick .cv-chip").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.cvRoute === route);
  });
}

/** Max convertible amount reserving fee buffer (HMC pay or quote-fee on invert routes). */
function maxConvertibleFrom(): number {
  const avail = freeBalance(state, convertFrom, market ?? undefined);
  if (!(avail > 0) || !market) return 0;
  const route = routeForAssets(convertFrom, convertTo);
  if (!route) return avail;
  const def = convertRouteDef(route);
  if (!def) return avail;
  if (state.feeConfig.payFeesInHmc) {
    if (convertFrom !== "hmc") return avail;
    // Leave ~0.2% headroom for HMC fee on rough quote notional.
    const headroom = avail * 0.002;
    return Math.max(0, avail - Math.max(headroom, 1e-6));
  }
  // Invert spends quote then pays fee from leftover quote — Max must leave fee room.
  if (def.invert) {
    const vip = activeVipTier(state, market);
    return Math.max(0, (avail / (1 + vip.takerBps / 10_000)) * 0.999);
  }
  return avail;
}

async function runConvertDesk(): Promise<void> {
  if (!market) return;
  if (convertInFlight) {
    toast("Convert already in progress", "info");
    return;
  }
  const route = routeForAssets(convertFrom, convertTo);
  if (!route) {
    toast("Unsupported convert route", "warn");
    return;
  }
  const amt = Number(convertAmtStr);
  if (!(amt > 0)) {
    toast("Amount > 0", "warn");
    return;
  }
  const avail = freeBalance(state, convertFrom, market ?? undefined);
  if (convertConfirmLarge && amt > avail * 0.5) {
    if (!confirm(`Convert ${formatNum(amt, 4)} ${assetSymbol(convertFrom)} (>50% of balance)?`)) return;
  }

  const r = CONVERT_ROUTES.find((x) => x.id === route)!;
  const def = convertRouteDef(route);
  const [from, to] = r.label.split(" → ").map((s) => s.trim());
  const go = document.getElementById("cv-go") as HTMLButtonElement | null;
  convertInFlight = true;
  if (go) go.disabled = true;

  try {
  if (isLabSessionStale()) {
    toast("Lab session stale — reconnect fixture (convert frozen)", "warn");
    return;
  }
  if (tradingGuards.convertFeeServer && useLabMatching() && def) {
    const apiRes = await postLabConvert({
      from,
      to,
      amount: displayToMinor(amt),
      pay_fee_in_hmc:
        tradingGuards.hmcFeePayServer && state.feeConfig.payFeesInHmc ? true : undefined,
    });
    if (apiRes.ok) {
      const got = minorToDisplay(apiRes.got);
      const net =
        apiRes.net_to != null ? minorToDisplay(apiRes.net_to) : got;
      const feeQuoteDisplay = minorToDisplay(Number(apiRes.fee_quote ?? 0));
      const feeHmcDisplay = minorToDisplay(Number(apiRes.fee_hmc ?? 0));
      const vip = activeVipTier(state, market);
      const labFee = feeQuoteFromLabConvert(apiRes, {
        feeQuoteDisplay,
        feeHmcDisplay,
        hmcUsdt: market.hmcUsdt,
        vipName: vip.name,
        hmcDiscountPct: state.feeConfig.hmcDiscountPct,
        fallbackTakerBps: vip.takerBps,
      });
      await syncLabBalancesAndBook(state, market);
      recordConvert(state, from, to, amt, got, market, labFee, def.pair);
      saveState(state);
      toast(
        `Lab convert → ${formatNum(net, 4)} net${formatLabConvertFeeToast(
          {
            ...apiRes,
            feeQuoteDisplay,
            feeHmcDisplay,
          },
          def ? pairQuoteSym(def.pair) : "USDT",
        )}`,
        "ok",
      );
      softPatchConvertDesk();
      return;
    }
    // Lab session + advertised /convert: don't invent balances — surface API error.
    toast(formatExchangeReject(apiRes), "warn");
    return;
  }

  // Lab connected without /convert advertisement — never paper-convert (ledger desync).
  if (useLabMatching() && !tradingGuards.convertFeeServer) {
    toast("Lab /convert not advertised — enable on exchange-api or disconnect fixture", "warn");
    return;
  }

  const res = convert(state, market, route, amt);
  if (!res.ok) {
    toast(res.reason, "warn");
    return;
  }
  recordConvert(state, from, to, amt, res.got, market, res.fee, def?.pair);
  saveState(state);
  const net = def
    ? convertNetReceive({ got: res.got, fee: res.fee, to: def.to, pair: def.pair })
    : res.got;
  toast(`Swapped → ${formatNum(net, 4)} net${def ? formatConvertFeeToast(res.fee, def.pair) : ""}`, "ok");
  softPatchConvertDesk();
  } finally {
    convertInFlight = false;
    const go2 = document.getElementById("cv-go") as HTMLButtonElement | null;
    if (go2 && !go2.isConnected) {
      /* re-render replaced the button */
    } else if (go2) {
      refreshConvertPreview();
    }
  }
}

/** Soft-update Convert balances / recent / fee chrome — keep From/To/amount intact. */
function softPatchConvertDesk(): void {
  if (state.mainView !== "convert" || !document.getElementById("cv-amt")) return;
  const list = document.querySelector(".cv-bal-list");
  if (list) {
    list.innerHTML = CONVERT_ASSETS.map((a) => {
      const v = freeBalance(state, a.key);
      return `<li><span>${a.symbol}</span><strong class="mono">${formatNum(v, a.key === "btc" ? 8 : 4)}</strong></li>`;
    }).join("");
  }
  const side = document.querySelector(".convert-side");
  if (side) {
    const recentHtml = state.ledger
      .filter((e) => e.kind === "convert" && e.amount < 0)
      .slice(-6)
      .reverse()
      .map(
        (e) =>
          `<li class="mono"><span>${escapeHtml(e.note ?? "")}</span><span>${formatNum(Math.abs(e.amount), 4)}</span></li>`,
      )
      .join("");
    const recentH = [...side.querySelectorAll("h3")].find((h) => /recent/i.test(h.textContent || ""));
    if (recentH) {
      let node = recentH.nextElementSibling;
      while (node && (node.matches("p.muted") || node.matches("ul.cv-recent"))) {
        const next = node.nextElementSibling;
        node.remove();
        node = next;
      }
      if (recentHtml) {
        const ul = document.createElement("ul");
        ul.className = "cv-recent";
        ul.innerHTML = recentHtml;
        recentH.after(ul);
      } else {
        const p = document.createElement("p");
        p.className = "muted small";
        p.textContent = "No converts yet";
        recentH.after(p);
      }
    }
  }
  softPatchFeePayChrome();
  refreshConvertPreview();
}

/** Update VIP / pay-in-HMC copy on Account + Convert without remount. */
function softPatchFeePayChrome(): void {
  const vip = activeVipTier(state, market ?? undefined);
  const feeCard = document.querySelector("#acct-fees .muted.small");
  if (feeCard && feeCard.querySelector("strong.mono")) {
    const vol = volume30dUsdt(state, market ?? undefined);
    feeCard.innerHTML = `30d <strong class="mono">${formatNum(vol, 0)} USDT</strong> · ${feeScheduleLabel(state, market ?? undefined)}`;
  }
  const mode = document.querySelector(".convert-fee-mode");
  if (mode) {
    mode.textContent = state.feeConfig.payFeesInHmc
      ? `Pay fees in HMC on (−${state.feeConfig.hmcDiscountPct}%)${tradingGuards.hmcFeePayServer ? " · server honors" : " · paper only until health advertises hmc_fee_pay"}`
      : `Fees in quote asset · toggle HMC (−${state.feeConfig.hmcDiscountPct}%) on Account or Spot`;
  }
  const lead = document.querySelector(".convert-lead");
  if (lead) {
    const labReady = tradingGuards.convertFeeServer && useLabMatching();
    const labAvail = tradingGuards.convertFeeServer && isLabApiEnabled() && !useLabMatching();
    const feeNote = labReady
      ? `Lab <code>GET/POST /convert</code> · seed mid · VIP taker ${formatBps(vip.takerBps)} (${vip.name}) · net shown`
      : labAvail
        ? `Lab convert ready — connect fixture on Account · taker ${formatBps(vip.takerBps)} (${vip.name})`
        : `Paper convert · spot taker ${formatBps(vip.takerBps)} (${vip.name}) — same VIP schedule as Spot`;
    lead.innerHTML = `Swap at mid · ${feeNote}. No book, no futures.`;
  }
  // Keep Spot + Account checkboxes in sync when either is toggled.
  const acct = document.getElementById("acct-pay-hmc") as HTMLInputElement | null;
  const spot = document.getElementById("pay-fees-hmc") as HTMLInputElement | null;
  if (acct) acct.checked = state.feeConfig.payFeesInHmc;
  if (spot) spot.checked = state.feeConfig.payFeesInHmc;
}

function wireConvertDesk(): void {
  const fromSel = document.getElementById("cv-from") as HTMLSelectElement | null;
  const toSel = document.getElementById("cv-to") as HTMLSelectElement | null;
  const amtInp = document.getElementById("cv-amt") as HTMLInputElement | null;
  if (!fromSel || !toSel || !amtInp) return;

  const sync = () => {
    convertFrom = fromSel.value as keyof Wallet;
    convertTo = toSel.value as keyof Wallet;
    convertAmtStr = amtInp.value;
    document.querySelectorAll("[data-cv-pct]").forEach((btn) => btn.classList.remove("active"));
    if (convertFrom === convertTo) {
      const alt = CONVERT_ASSETS.find((a) => a.key !== convertFrom);
      if (alt) {
        convertTo = alt.key;
        toSel.value = alt.key;
      }
    }
    refreshConvertPreview();
  };

  fromSel.addEventListener("change", sync);
  toSel.addEventListener("change", sync);
  amtInp.addEventListener("input", sync);

  document.getElementById("cv-flip")?.addEventListener("click", () => {
    const route = routeForAssets(convertFrom, convertTo);
    const flipped = route ? flipRoute(route) : null;
    if (flipped) {
      const d = convertRouteDef(flipped)!;
      convertFrom = d.from;
      convertTo = d.to;
    } else {
      const tmp = convertFrom;
      convertFrom = convertTo;
      convertTo = tmp;
    }
    fromSel.value = convertFrom;
    toSel.value = convertTo;
    refreshConvertPreview();
  });

  document.getElementById("cv-max")?.addEventListener("click", () => {
    convertAmtStr = String(maxConvertibleFrom());
    amtInp.value = convertAmtStr;
    markConvertPct(100);
    refreshConvertPreview();
  });

  document.querySelectorAll("[data-cv-pct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pct = Number((btn as HTMLElement).dataset.cvPct ?? 0);
      const avail = maxConvertibleFrom();
      convertAmtStr = String((avail * pct) / 100);
      amtInp.value = convertAmtStr;
      markConvertPct(pct);
      refreshConvertPreview();
    });
  });

  document.querySelectorAll("[data-cv-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.cvRoute as ConvertRoute;
      const d = convertRouteDef(id);
      if (!d) return;
      convertFrom = d.from;
      convertTo = d.to;
      fromSel.value = convertFrom;
      toSel.value = convertTo;
      const defAmt = convertChipDefaultAmount(id);
      if (defAmt) {
        convertAmtStr = defAmt;
        amtInp.value = defAmt;
      }
      refreshConvertPreview();
    });
  });

  document.getElementById("cv-confirm-large")?.addEventListener("change", (e) => {
    convertConfirmLarge = (e.target as HTMLInputElement).checked;
  });

  document.getElementById("cv-go")?.addEventListener("click", () => {
    void runConvertDesk();
  });

  document.getElementById("cv-open-spot")?.addEventListener("click", () => {
    const route = routeForAssets(convertFrom, convertTo);
    const pair = route ? convertRouteDef(route)?.pair : null;
    if (pair) {
      state.activePair = pair;
      pushRecentPair(pair);
    }
    state.mainView = "spot";
    saveState(state);
    syncRouteHash();
    render();
  });

  refreshConvertPreview();
}

function markConvertPct(pct: number): void {
  document.querySelectorAll("[data-cv-pct]").forEach((btn) => {
    btn.classList.toggle("active", Number((btn as HTMLElement).dataset.cvPct) === pct);
  });
}

function renderSpot(): string {
  const pair = pairById(state.activePair);
  const t = activeTicker();
  const quote = activePairQuote();
  const tradeMid = quote.mid;
  const s24 = quote;
  const ch = quote.changePct;
  const tone = quoteToneClass(quote.tone);
  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
  const pnl = market ? pnlPct(state, market) : 0;
  const av = availBalance(pair);
  const displayTip = state.chartMode === "heikin" ? (getDisplayedLastCandle() ?? candles.slice(-1)[0] ?? null) : (candles.slice(-1)[0] ?? null);
  const ohlcSource = lastOhlc ?? displayTip;
  const ohlc = ohlcSource
    ? `${state.chartMode === "heikin" ? "HA " : ""}O ${formatPrice(ohlcSource.open)} H ${formatPrice(ohlcSource.high)} L ${formatPrice(ohlcSource.low)} C ${formatPrice(ohlcSource.close)}`
    : `${state.chartMode === "heikin" ? "HA " : ""}O — H — L — C ${formatPrice(t.mid)}`;
  const chartModes: { id: ChartMode; label: string }[] = [
    { id: "candles", label: "Candles" },
    { id: "bars", label: "Bars" },
    { id: "heikin", label: "Heikin" },
    { id: "line", label: "Line" },
    { id: "area", label: "Area" },
  ];
  const indicators: { id: IndicatorId; label: string }[] = [
    { id: "ema20", label: "EMA20" }, { id: "ema50", label: "EMA50" }, { id: "ema100", label: "EMA100" }, { id: "ema200", label: "EMA200" },
    { id: "sma20", label: "SMA20" }, { id: "bb", label: "BB" }, { id: "vwap", label: "VWAP" },
    { id: "rsi", label: "RSI" }, { id: "macd", label: "MACD" }, { id: "stoch", label: "Stoch" },
  ];
  const drawTools: { id: DrawTool | "clear" | "lock"; title: string }[] = [
    { id: "cursor", title: "Select / move drawings" },
    { id: "hline", title: "Horizontal line · click" },
    { id: "vline", title: "Vertical line · click" },
    { id: "cross", title: "Cross line · click" },
    { id: "trend", title: "Trend line · drag" },
    { id: "ray", title: "Ray · drag (extends forward)" },
    { id: "fib", title: "Fibonacci retracement · drag" },
    { id: "rect", title: "Rectangle · drag" },
    { id: "text", title: "Text label · click" },
    { id: "measure", title: "Ruler · drag for Δprice / % / bars / time" },
    { id: "clear", title: "Delete selected (or clear all)" },
    { id: "lock", title: "Lock drawings (no edit)" },
  ];
  const layoutClass = state.multiChartLayout !== "1" ? `layout-${state.multiChartLayout} multi-chart-sync` : "";

  const vip = activeVipTier(state, market);
  const vipProg = nextVipProgress(state, market);
  const feeRole = previewFeeRole(uiType);
  const feeBps = feeRole === "maker" ? vip.makerBps : vip.takerBps;
  const showTif = uiType === "limit" || uiType === "stop_limit";
  const alertCount = state.priceAlerts.filter((a) => a.pairId === state.activePair && !a.fired).length;
  const recentPairs = loadRecentPairs().filter((p) => p !== state.activePair);

  return `
  <div class="spot-layout">
  <div class="ticker-bar binance-ticker">
    <div class="tb-left">
      <button type="button" class="tb-pair tb-pair-btn" id="btn-mobile-pair" aria-label="Switch trading pair">
        <span class="tb-pair-icons">${pairAssetIcons(pair.base, pair.quote)}</span>
        <div>
          <h1>${pair.label}</h1>
          <span class="tb-sub muted small">${
            useLabMatching() ? "Lab book · DEMO matching" : "Pool oracle · paper demo"
          }</span>
        </div>
        <span class="tb-chev" aria-hidden="true">▾</span>
      </button>
      <div class="tb-quote">
        <span class="tb-price ${tone}">${formatPrice(tradeMid)}</span>
        <span class="tb-chg ${tone}">${formatPct(ch)}</span>
        ${
          pair.quote !== "USDT" && market
            ? `<span class="tb-fiat muted small" data-tb-usdt="1">≈ ${formatPrice(
                tradeMid *
                  (pair.quote === "BTC" ? market.btcUsd : pair.quote === "SUP" ? market.supUsdt : 1),
              )} USDT</span>`
            : ""
        }
      </div>
    </div>
    <div class="tb-stats">
      <div><label>24h High</label><span class="mono">${formatPrice(s24.high24h || t.high24h)}</span></div>
      <div><label>24h Low</label><span class="mono">${formatPrice(s24.low24h || t.low24h)}</span></div>
      <div><label>24h Vol (${pair.base})</label><span class="mono">${formatVolBase(s24.vol24h || t.volume24hBase, pair.base)}</span></div>
      <div><label>Spread</label><span class="mono">${formatNum(t.spreadBps / 100, 3)}%</span></div>
    </div>
    <div class="tb-right">
      <div class="vip-badge mono" title="30d vol ${formatNum(vipProg.vol, 0)} USDT${vipProg.next ? ` · next ${vipProg.next.name}` : ""}">
        <span class="vip-name" title="Demo VIP from local trade history — not server volume">${vip.name}</span>
        <span class="vip-demo muted small">demo</span>
        <span class="vip-rates">${formatBps(vip.makerBps)} / ${formatBps(vip.takerBps)}</span>
        <div class="vip-bar"><i style="width:${vipProg.pct.toFixed(0)}%"></i></div>
      </div>
      <button type="button" class="btn-sm alerts-chip" id="btn-open-alerts" title="Price alerts">Alerts${alertCount ? ` · ${alertCount}` : ""}</button>
      <button type="button" class="btn-sm" id="btn-hotkeys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
      <div class="pnl-chip mono">PnL <span class="${pnl >= 0 ? "up" : "down"}">${pnl >= 0 ? "+" : ""}${formatNum(pnl, 2)}%</span></div>
    </div>
  </div>
  ${
    recentPairs.length
      ? `<div class="recent-pairs" id="recent-pairs" aria-label="Recent markets">${recentPairs
          .map((p) => {
            const meta = pairById(p);
            const mid = pairQuote(p).mid;
            return `<button type="button" class="recent-pair" data-recent-pair="${p}"><span>${meta.label}</span>${
              mid ? `<span class="mono muted">${formatPrice(mid)}</span>` : ""
            }</button>`;
          })
          .join("")}</div>`
      : ""
  }

  <div class="terminal mobile-stack ${state.chartFullscreen ? "chart-fullscreen" : ""} ${layoutPrefs.bookCollapsed ? "book-collapsed" : ""} ${layoutPrefs.rightCollapsed ? "right-collapsed" : ""} ${layoutPrefs.toolsCollapsed ? "tools-collapsed" : ""} ${mobileToolsOpen ? "mobile-tools-open" : ""}" id="terminal" data-mobile-panel="${mobilePanel}" style="grid-template-columns:${terminalGridColumnsForView(layoutPrefs, state.chartFullscreen)}">
    <aside class="col-book ${state.chartFullscreen || layoutPrefs.bookCollapsed ? "hidden" : ""}" id="col-book">
      <div class="col-title">
        <span>Order Book ${bookHeaderBadge()}</span>
        <button type="button" class="btn-panel-toggle" id="btn-collapse-book" title="Hide order book">‹</button>
      </div>
      <div id="book">${renderBook()}</div>
      <div class="mobile-trade-tape-wrap" id="mobile-trade-tape-wrap" aria-label="Recent trades">
        <div class="mobile-trade-tape-head muted small">Trades</div>
        <div class="mobile-trade-tape" id="mobile-trade-tape">${renderMobileTradeTape()}</div>
      </div>
      <div class="panel-resize" id="resize-book" title="Drag to resize"></div>
    </aside>

    <section class="col-center">
      <div class="chart-chrome" id="chart-chrome">
      <div class="chart-topbar">
        <div class="tf-block">
          ${QUICK_TFS.map((tf) => `<button type="button" class="tfq ${tf === state.activeTf ? "active" : ""}" data-tf="${tf}">${tf}</button>`).join("")}
          <select id="tf-more" class="tf-more mono" title="More timeframes">
            ${TIMEFRAMES.filter((tf) => !(QUICK_TFS as string[]).includes(tf)).map((tf) => `<option value="${tf}" ${tf === state.activeTf ? "selected" : ""}>${tf}</option>`).join("")}
            <option disabled>──</option>
            ${QUICK_TFS.map((tf) => `<option value="${tf}" ${tf === state.activeTf ? "selected" : ""}>${tf} ✓</option>`).join("")}
          </select>
        </div>
        <div class="layout-chip-row" id="layout-chip-row" aria-label="Panel visibility">
          <button type="button" class="layout-chip ${!layoutPrefs.bookCollapsed ? "active" : ""}" id="chip-book" data-panel="book" title="Order book" aria-pressed="${!layoutPrefs.bookCollapsed ? "true" : "false"}">Book</button>
          <button type="button" class="layout-chip ${!layoutPrefs.toolsCollapsed ? "active" : ""}" id="chip-tools" data-panel="tools" title="Drawing tools" aria-pressed="${!layoutPrefs.toolsCollapsed ? "true" : "false"}">Tools</button>
          <button type="button" class="layout-chip ${!layoutPrefs.rightCollapsed ? "active" : ""}" id="chip-right" data-panel="right" title="Markets" aria-pressed="${!layoutPrefs.rightCollapsed ? "true" : "false"}">Mkts</button>
        </div>
        <div class="chart-mode-menu">
          <button type="button" class="btn-ico" id="btn-chart-type" title="Chart type" aria-label="Chart type" aria-haspopup="true" aria-expanded="false">${state.chartMode === "candles" || state.chartMode === "heikin" || state.chartMode === "bars" ? Ico.candlestick() : Ico.chartLine()}<span class="ico-chev" aria-hidden="true">${Ico.chevronDown()}</span></button>
          <button type="button" class="btn-ico btn-mobile-chart-more" id="btn-mobile-chart-more" title="More chart tools" aria-label="More chart tools" aria-haspopup="true" aria-expanded="false">${Ico.more()}</button>
        </div>
        <div class="chart-actions">
          <button type="button" class="btn-ico btn-mobile-tools ${mobileToolsOpen ? "active" : ""}" id="btn-mobile-tools" title="Drawing tools" aria-label="Drawing tools" aria-pressed="${mobileToolsOpen ? "true" : "false"}">${Ico.mousePointer()}</button>
          <button type="button" class="btn-ico" id="btn-goto-date" title="Go to date" aria-label="Go to date">${Ico.clock()}</button>
          <button type="button" class="btn-ico" id="btn-indicators" title="Indicators" aria-label="Indicators">${Ico.activity()}</button>
          <button type="button" class="btn-ico" id="btn-overlays" aria-label="Overlays">${Ico.list()}</button>
          <button type="button" class="btn-ico" id="btn-chart-settings" title="Chart style" aria-label="Chart style">${Ico.settings()}</button>
          <button type="button" class="btn-ico" id="btn-screenshot" title="Screenshot" aria-label="Screenshot">${Ico.camera()}</button>
          <button type="button" class="btn-ico ${state.multiChartLayout !== "1" ? "active" : ""}" id="btn-multi" title="Multi chart" aria-label="Multi chart">${Ico.layout()}</button>
          <button type="button" class="btn-ico ${state.chartFullscreen ? "active" : ""}" id="btn-fullscreen" title="${state.chartFullscreen ? "Exit fullscreen" : "Fullscreen"}" aria-label="${state.chartFullscreen ? "Exit fullscreen" : "Fullscreen"}" aria-pressed="${state.chartFullscreen ? "true" : "false"}">${state.chartFullscreen ? Ico.minimize() : Ico.maximize()}</button>
        </div>
      </div>
      <div class="ind-tabs compact" id="ind-tabs">
        ${indicators.map((i) => `<button type="button" class="ind ${state.chartSettings.indicators[i.id] ? "active" : ""}" data-ind="${i.id}">${i.label}</button>`).join("")}
      </div>
      </div>
      <div class="chart-body ${layoutPrefs.toolsCollapsed ? "tools-collapsed" : ""}">
        ${renderPanelRail("tools", "btn-expand-tools", "Tools", "Show drawing tools")}
        <aside class="draw-tools ${layoutPrefs.toolsCollapsed ? "hidden" : ""}" id="draw-tools">
          <button type="button" class="btn-panel-toggle btn-collapse-tools" id="btn-collapse-tools" title="Hide drawing tools" aria-label="Hide drawing tools">‹</button>
          ${drawTools.map((d) => {
            const active = d.id === "lock" ? state.drawingsLocked : state.activeDrawTool === d.id;
            return `<button type="button" class="dt ${active ? "active" : ""}" data-dt="${d.id}" title="${d.title}" aria-label="${d.title}" aria-pressed="${active}">${drawToolIcon(d.id as DrawIconId)}</button>`;
          }).join("")}
        </aside>
        <div class="chart-main">
          <div class="ohlc-legend mono" id="ohlc-legend">${ohlc}</div>
          <div class="chart-split ${layoutClass}">
            <div id="chart-host" class="chart-host"></div>
            ${state.multiChartLayout !== "1" ? `<div id="chart-host-2" class="chart-host chart-host-sub"></div>` : ""}
            ${state.multiChartLayout === "4" ? `<div id="chart-host-3" class="chart-host chart-host-sub"></div><div id="chart-host-4" class="chart-host chart-host-sub"></div>` : ""}
          </div>
        </div>
      </div>
      <div class="order-zone ${state.chartFullscreen ? "hidden" : ""}" id="order-zone">
        ${renderDualOrderPanel({
          pair,
          pairId: state.activePair,
          mid: tradeMid,
          uiType,
          uiTif,
          uiPostOnly,
          availQuote: av.quote,
          availBase: av.base,
          payFeesInHmc: state.feeConfig.payFeesInHmc,
          hmcDiscountPct: state.feeConfig.hmcDiscountPct,
          feeRole,
          feeBps,
          showTif,
          labMmSeeded: tradingGuards.labMmSeeded,
          labLive: useLabMatching(),
        })}
      </div>
    </section>

    <aside class="col-right ${state.chartFullscreen || layoutPrefs.rightCollapsed ? "hidden" : ""}" id="col-right">
      <div class="panel-resize left" id="resize-right" title="Drag to resize"></div>
      <div class="markets-panel">
        <div class="col-title">
          <span>Markets</span>
          <button type="button" class="btn-panel-toggle" id="btn-collapse-right" title="Hide markets">›</button>
        </div>
        ${renderOracleStatusHtml(oracleMeta)}
        <input class="market-search" id="market-search" type="search" placeholder="Search…" aria-label="Search markets" value="${escapeHtml(marketSearch)}" />
        <div class="lane-tabs" id="lane-tabs">
          <button type="button" class="lane-tab ${marketLane === "all" ? "active" : ""}" data-lane="all">All</button>
          ${LANES.map((l) => `<button type="button" class="lane-tab ${marketLane === l.id ? "active" : ""}" data-lane="${l.id}">${l.label}</button>`).join("")}
        </div>
        <div class="markets-list" id="markets-list">${renderMarketsList()}</div>
      </div>
      <div class="activity-panel" id="activity-panel">
        <div class="activity-tabs" id="activity-tabs" role="tablist" aria-label="Spot activity">
          <button type="button" class="${activityTab === "orders" ? "active" : ""}" data-tab="orders" role="tab" aria-selected="${activityTab === "orders"}">Orders</button>
          <button type="button" class="${activityTab === "history" ? "active" : ""}" data-tab="history" role="tab" aria-selected="${activityTab === "history"}">Fills</button>
          <button type="button" class="${activityTab === "tape" ? "active" : ""}" data-tab="tape" role="tab" aria-selected="${activityTab === "tape"}">Tape</button>
          <button type="button" class="${activityTab === "alerts" ? "active" : ""}" data-tab="alerts" role="tab" aria-selected="${activityTab === "alerts"}">Alerts</button>
        </div>
        <div class="activity-body" id="activity-body">${renderActivityBody()}</div>
      </div>
    </aside>
    <div class="terminal-rails" id="terminal-rails">
      ${renderPanelRail("left", "btn-expand-book", "Book", "Show order book")}
      ${renderPanelRail("right", "btn-expand-right", "Mkts", "Show markets panel")}
    </div>
  </div>

  <div class="mining-strip mono" id="mining-strip">
    ${pair.label} · ${formatGh(poolLive!.poolGh)} · ${poolLive!.workers} workers · reward/M ${formatRewardPerM(poolLive!.rewardPerM)} · #${formatNum(poolLive!.blockHeight, 0)}
  </div>
  <div class="mobile-footer-stack" id="mobile-footer-stack">
    ${renderMobileChartTradeBar()}
    <div class="mobile-panel-wrap mobile-bottom-nav">${renderMobilePanelTabs()}</div>
  </div>
  <div class="chart-type-backdrop hidden" id="chart-type-backdrop" aria-hidden="true"></div>
  <div class="mode-drop hidden" id="chart-type-drop" role="menu" aria-label="Chart type">
    ${chartModes.map((m) => `<button type="button" class="cm ${m.id === state.chartMode ? "active" : ""}" data-mode="${m.id}" role="menuitem">${m.label}</button>`).join("")}
  </div>
  <div class="chart-more-backdrop hidden" id="chart-more-backdrop" aria-hidden="true"></div>
  <div class="mode-drop hidden" id="chart-more-drop" role="menu" aria-label="Chart tools">
    <p class="muted small sheet-title">Chart tools</p>
    <button type="button" class="cm" data-chart-more="indicators" role="menuitem">Indicators</button>
    <button type="button" class="cm" data-chart-more="overlays" role="menuitem">Overlays</button>
    <button type="button" class="cm" data-chart-more="style" role="menuitem">Chart style</button>
    <button type="button" class="cm" data-chart-more="goto" role="menuitem">Go to date</button>
    <button type="button" class="cm" data-chart-more="screenshot" role="menuitem">Screenshot</button>
  </div>
  </div>
  <div class="kbd-hint">? help · Shift+B/S market · Esc cancel all · 1-0 TF · Alt+R reset · charts by TradingView</div>`;
}

function render(): void {
  if (!market || !poolLive) {
    app.innerHTML = `<div class="boot">
      <img class="boot-logo" src="/logo-hex.png" alt="" width="68" height="68" />
      <p class="boot-title">HackMe Exchange</p>
      <div class="spinner" aria-hidden="true"></div>
      <p class="boot-sub">Syncing pool oracle…</p>
    </div>`;
    return;
  }

  const view = state.mainView;
  syncRouteHash();
  const embed = isHubEmbed();
  const brandTitle = embed ? "Exchange" : "HackMe Exchange";
  const brandSub = embed ? "hub embed · lab" : `Spot · ${INTEGRATION.mode}`;
  // Live oracle / lab sync used to remount the whole tree every few seconds and
  // collapse <details>, wipe withdraw fields, etc. Capture → restore after wire.
  const uiSnap = captureEphemeralUi(app);
  app.innerHTML = `
  ${renderAnnounce()}
  <header class="ex-header">
    <div class="ex-brand">
      <img class="brand-logo" src="/logo-hex.png" alt="HackMe" />
      <div><strong>${brandTitle}</strong><span>${brandSub}</span></div>
    </div>
    <nav class="ex-nav" id="main-nav">
      <button type="button" class="nav-btn ${view === "spot" ? "active" : ""}" data-view="spot">Spot</button>
      <button type="button" class="nav-btn ${view === "convert" ? "active" : ""}" data-view="convert">Convert</button>
      <button type="button" class="nav-btn ${view === "account" ? "active" : ""}" data-view="account">Account</button>
      <button type="button" class="nav-btn ${view === "pool" ? "active" : ""}" data-view="pool">Pool</button>
    </nav>
    <div class="ex-actions">
      <span class="pill-live paper" id="node-status">${modeStatusPill()}</span>
      <div class="sys-menu-wrap">
        <button type="button" class="btn-sm" id="btn-system-status" aria-haspopup="true" aria-expanded="false">⚙ System</button>
        <div class="sys-backdrop hidden" id="sys-backdrop" aria-hidden="true"></div>
        <div class="sys-drop hidden" id="sys-drop" role="menu">
          <p class="muted small">Mode <b class="mono">${INTEGRATION.mode}</b> · ${modeChromeLabel()}</p>
          <a class="sys-link" href="${escapeHtml(nodeWalletUrl())}" id="link-node-wallet" target="_blank" rel="noreferrer">${embed ? "Hub wallet" : "Node wallet"}</a>
          <button type="button" class="sys-item" id="btn-sync-node-header">↻ Sync HMC/SUP</button>
          <button type="button" class="sys-item" id="btn-settings">Oracle anchor</button>
          <button type="button" class="sys-item" id="btn-export-demo">↓ Export state</button>
          <button type="button" class="sys-item" id="btn-import-demo">↑ Import state</button>
          <input type="file" id="import-demo-file" accept="application/json,.json" class="hidden" />
          <button type="button" class="sys-item ${theme === "hub" ? "active" : ""}" id="btn-theme-hub" data-theme="hub" aria-pressed="${theme === "hub"}">Theme: Hub (hackme.tech)</button>
          <button type="button" class="sys-item ${theme === "wallet" ? "active" : ""}" id="btn-theme-wallet" data-theme="wallet" aria-pressed="${theme === "wallet"}">Theme: Wallet (lab)</button>
          <a class="sys-link" href="https://hackme.tech/pool/coordinator" target="_blank" rel="noreferrer">Official pool</a>
          <a class="sys-link" href="https://hackme.tech/downloads.html#start" target="_blank" rel="noreferrer">Mine ${pairById(state.activePair).base}</a>
          <button type="button" class="sys-item danger" id="btn-reset">Reset demo</button>
        </div>
      </div>
    </div>
  </header>
  ${view === "spot" ? renderSpot() : view === "convert" ? renderConvert() : view === "account" ? renderAccountPage(state, market, { feeWallet: labFeeWallet }) : renderPoolPage(poolLive, market)}
  ${view === "pool" ? `<div class="mining-strip mono" id="mining-strip">
    ${pairById(state.activePair).base}_${pairById(state.activePair).quote} · ${formatGh(poolLive.poolGh)} · ${poolLive.workers} workers · #${formatNum(poolLive.blockHeight, 0)}
  </div>` : ""}`;

  wireEvents();
  if (view === "spot") {
    ensurePublicTape();
    mountChartPanel();
    if (isHubEmbed()) {
      requestAnimationFrame(() => {
        resizeChart();
        requestAnimationFrame(() => resizeChart());
      });
    }
  }
  if (view === "account") {
    wireAccountFunding(state, market, () => {
      saveState(state);
      softPatchFeePayChrome();
    });
    wireLabApiButtons();
    wireFundsFunding();
    if (isLabApiEnabled()) {
      void maybeAutoReconnectLabSession();
      if (useLabMatching()) {
        void labFillsRefreshUi();
        void labWithdrawRefreshUi();
        void labWithdrawQuoteUi();
      }
    }
  }
  restoreEphemeralUi(app, uiSnap);
  probeNodeOnline().then((ok) => {
    const el = document.getElementById("node-status");
    if (!el) return;
    const base = modeStatusPill();
    el.textContent = ok ? `${base} · node up` : base;
  });
}

/** Soft-update chrome on Convert / Account / Pool — never wipe forms or <details>. */
function patchNonSpotChrome(): void {
  if (state.mainView === "spot") return;
  const strip = document.getElementById("mining-strip");
  if (strip && poolLive) {
    const p = pairById(state.activePair);
    strip.textContent = `${p.base}_${p.quote} · ${formatGh(poolLive.poolGh)} · ${poolLive.workers} workers · #${formatNum(poolLive.blockHeight, 0)}`;
  }
  if (state.mainView === "account" && market) {
    const eq = walletEquityFromMarket(state.wallet, market);
    const eqEl = document.querySelector(".account-eq");
    if (eqEl) {
      eqEl.innerHTML = `${formatNum(eq, 2)} <span class="muted">USDT</span>`;
    }
  }
  if (state.mainView === "convert") {
    refreshConvertPreview();
  }
}

function evaluatePriceAlerts(mid: number): void {
  if (!lastMidForAlerts) {
    lastMidForAlerts = mid;
    return;
  }
  let changed = false;
  for (const a of state.priceAlerts) {
    if (a.fired || a.pairId !== state.activePair) continue;
    const crossed =
      (lastMidForAlerts < a.price && mid >= a.price) ||
      (lastMidForAlerts > a.price && mid <= a.price);
    if (crossed) {
      a.fired = true;
      changed = true;
      void fireBrowserAlert(
        `${pairById(a.pairId).label} alert`,
        `Price reached ${formatPrice(a.price)} (now ${formatPrice(mid)})`,
      );
      toast(`Alert hit @ ${formatPrice(a.price)}`, "ok");
    }
  }
  lastMidForAlerts = mid;
  if (changed) {
    saveState(state);
    refreshOpenOrderChartLines();
    if (activityTab === "alerts") refreshActivityPanel();
  }
}

function wireBookClicks(): void {
  // Delegate on col-book so innerHTML refreshes of #book don't stack row listeners.
  const host = document.getElementById("col-book");
  if (!host || host.dataset.bookClickWired === "1") return;
  host.dataset.bookClickWired = "1";
  const applyRow = (row: HTMLElement) => {
    const price = Number(row.dataset.bookPrice);
    const side = row.dataset.bookSide === "ask" ? "buy" : "sell";
    if (!Number.isFinite(price) || price <= 0) return;
    fillOrderPanelAtPrice(side, uiType === "stop_limit" ? "stop_limit" : "limit", price);
    toast(`${side === "buy" ? "Buy" : "Sell"} price ← ${formatPrice(price)}`, "info");
  };
  host.addEventListener("click", (ev) => {
    const row = (ev.target as HTMLElement | null)?.closest?.("[data-book-price]") as HTMLElement | null;
    if (!row || !host.contains(row)) return;
    applyRow(row);
  });
  host.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const row = (ev.target as HTMLElement | null)?.closest?.("[data-book-price]") as HTMLElement | null;
    if (!row || !host.contains(row)) return;
    ev.preventDefault();
    applyRow(row);
  });
}

let sysDropCloser: ((ev: MouseEvent) => void) | null = null;
let chartTypeDropOpenedAt = 0;
let chartMoreDropOpenedAt = 0;

function mobileFooterInsetPx(): number {
  const footer = document.getElementById("mobile-footer-stack");
  if (!footer) return 0;
  const style = getComputedStyle(footer);
  if (style.display === "none" || style.visibility === "hidden") return 0;
  const h = footer.getBoundingClientRect().height;
  return h > 0 ? Math.ceil(h) : 0;
}

function positionChartTypeDrop(): void {
  const drop = document.getElementById("chart-type-drop");
  const btn = document.getElementById("btn-chart-type");
  if (!drop || !btn || drop.classList.contains("hidden")) return;

  const margin = 8;
  const mobileSheet = isMobileLayout();
  drop.classList.toggle("mode-drop-sheet", mobileSheet);
  if (mobileSheet) {
    const footerInset = mobileFooterInsetPx();
    drop.style.position = "fixed";
    drop.style.left = "0";
    drop.style.right = "0";
    drop.style.bottom = `${footerInset}px`;
    drop.style.top = "auto";
    drop.style.zIndex = "2000";
    drop.style.maxHeight = `min(48vh, calc(100dvh - ${footerInset + 96}px))`;
    drop.style.overflowY = "auto";
    return;
  }

  drop.style.position = "fixed";
  drop.style.zIndex = "2000";
  const rect = btn.getBoundingClientRect();
  drop.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - 148))}px`;
  drop.style.right = "auto";
  drop.style.top = `${rect.bottom + margin}px`;
  drop.style.bottom = "auto";
  drop.style.maxHeight = `${Math.max(120, window.innerHeight - rect.bottom - margin * 2)}px`;
  drop.style.overflowY = "auto";
}

function showChartTypeDrop(show?: boolean): void {
  const drop = document.getElementById("chart-type-drop");
  const backdrop = document.getElementById("chart-type-backdrop");
  const btn = document.getElementById("btn-chart-type");
  if (!drop) return;
  const currentlyHidden = drop.classList.contains("hidden");
  const willOpen = show === undefined ? currentlyHidden : show;
  drop.classList.toggle("hidden", !willOpen);
  backdrop?.classList.toggle("hidden", !willOpen);
  backdrop?.setAttribute("aria-hidden", willOpen ? "false" : "true");
  btn?.setAttribute("aria-expanded", willOpen ? "true" : "false");
  document.body.classList.toggle("chart-type-open", willOpen);
  if (willOpen) {
    chartTypeDropOpenedAt = Date.now();
    showChartMoreDrop(false);
    if (backdrop) document.body.appendChild(backdrop);
    document.body.appendChild(drop);
    requestAnimationFrame(() => positionChartTypeDrop());
  } else {
    drop.classList.remove("mode-drop-sheet");
    drop.style.cssText = "";
    const host = document.querySelector(".spot-layout");
    if (host) {
      if (backdrop) host.appendChild(backdrop);
      host.appendChild(drop);
    }
  }
}

function positionChartMoreDrop(): void {
  const drop = document.getElementById("chart-more-drop");
  const btn = document.getElementById("btn-mobile-chart-more");
  if (!drop || !btn || drop.classList.contains("hidden")) return;
  const margin = 8;
  const footerInset = mobileFooterInsetPx();
  const rect = btn.getBoundingClientRect();
  if (isMobileLayout()) {
    drop.classList.add("mode-drop-sheet");
    drop.style.position = "fixed";
    drop.style.left = `${margin}px`;
    drop.style.right = `${margin}px`;
    drop.style.bottom = `${footerInset + margin}px`;
    drop.style.top = "auto";
    drop.style.zIndex = "2000";
    drop.style.maxHeight = `${Math.max(160, window.innerHeight - footerInset - margin * 2 - 48)}px`;
    drop.style.overflowY = "auto";
    return;
  }
  drop.classList.remove("mode-drop-sheet");
  drop.style.position = "fixed";
  drop.style.top = `${rect.bottom + 4}px`;
  drop.style.left = `${Math.max(8, Math.min(rect.left - 80, window.innerWidth - 200))}px`;
  drop.style.right = "auto";
  drop.style.bottom = "auto";
  drop.style.zIndex = "1200";
  drop.style.maxHeight = `${Math.max(120, window.innerHeight - rect.bottom - 16)}px`;
  drop.style.overflowY = "auto";
}

function showChartMoreDrop(show?: boolean): void {
  const drop = document.getElementById("chart-more-drop");
  const backdrop = document.getElementById("chart-more-backdrop");
  const btn = document.getElementById("btn-mobile-chart-more");
  if (!drop) return;
  const currentlyHidden = drop.classList.contains("hidden");
  const willOpen = show === undefined ? currentlyHidden : show;
  drop.classList.toggle("hidden", !willOpen);
  backdrop?.classList.toggle("hidden", !willOpen);
  backdrop?.setAttribute("aria-hidden", willOpen ? "false" : "true");
  btn?.setAttribute("aria-expanded", willOpen ? "true" : "false");
  document.body.classList.toggle("chart-more-open", willOpen);
  if (willOpen) {
    chartMoreDropOpenedAt = Date.now();
    showChartTypeDrop(false);
    if (backdrop) document.body.appendChild(backdrop);
    document.body.appendChild(drop);
    requestAnimationFrame(() => positionChartMoreDrop());
  } else {
    drop.classList.remove("mode-drop-sheet");
    drop.style.cssText = "";
    const host = document.querySelector(".spot-layout");
    if (host) {
      if (backdrop) host.appendChild(backdrop);
      host.appendChild(drop);
    }
  }
}

function positionSystemDrop(): void {
  const drop = document.getElementById("sys-drop");
  const btn = document.getElementById("btn-system-status");
  if (!drop || !btn || drop.classList.contains("hidden")) return;

  const margin = 8;
  const useFixed = isHubEmbed() || window.matchMedia("(max-width: 1024px)").matches;
  if (!useFixed) {
    drop.style.position = "";
    drop.style.top = "";
    drop.style.right = "";
    drop.style.bottom = "";
    drop.style.left = "";
    drop.style.maxHeight = "";
    return;
  }

  drop.style.position = "fixed";
  drop.style.left = "auto";
  drop.style.zIndex = "1000";
  const rect = btn.getBoundingClientRect();
  drop.style.right = `${Math.max(margin, window.innerWidth - rect.right)}px`;
  const maxH = Math.min(
    window.innerHeight * 0.72,
    520,
    Math.max(160, window.innerHeight - rect.bottom - margin * 2),
  );
  drop.style.maxHeight = `${maxH}px`;
  drop.style.overflowY = "auto";
  drop.style.top = `${rect.bottom + margin}px`;
  drop.style.bottom = "auto";
}

function showSystemDrop(show?: boolean): void {
  const drop = document.getElementById("sys-drop");
  const backdrop = document.getElementById("sys-backdrop");
  const btn = document.getElementById("btn-system-status");
  if (!drop) return;
  const currentlyHidden = drop.classList.contains("hidden");
  const willOpen = show === undefined ? currentlyHidden : show;
  drop.classList.toggle("hidden", !willOpen);
  backdrop?.classList.toggle("hidden", !willOpen);
  document.body.classList.toggle("sys-menu-open", willOpen);
  btn?.setAttribute("aria-expanded", willOpen ? "true" : "false");
  if (willOpen) {
    requestAnimationFrame(() => positionSystemDrop());
  }
  if (sysDropCloser) {
    document.removeEventListener("click", sysDropCloser);
    sysDropCloser = null;
  }
  if (!willOpen) return;
  window.setTimeout(() => {
    sysDropCloser = (ev: MouseEvent) => {
      const t = ev.target as Node | null;
      if (!t) return;
      if (drop.contains(t) || btn?.contains(t)) return;
      showSystemDrop(false);
    };
    document.addEventListener("click", sysDropCloser);
  }, 0);
}

function refreshAfterLabTrade(): void {
  saveState(state);
  patchModeChrome();
  patchLive();
  patchAvailChips();
  refreshOpenOrderChartLines();
  refreshActivityPanel();
  const tape = document.getElementById("tape");
  if (tape) tape.innerHTML = renderTape();
  patchMobileTradeTape();
}

/**
 * After mint/sync/bridge/withdraw — update Account numbers without remounting
 * (Asset roadmap / withdraw form stay put). Connect/logout still full-render.
 */
function refreshAccountAfterLab(): void {
  if (!market) return;
  if (state.mainView === "account") {
    patchAccountFundsDom(state, market);
    patchNonSpotChrome();
    return;
  }
  refreshAfterLabTrade();
}

/** Apply paper matching against live blended mids; refresh Orders + chart lines when anything fills/cancels. */
function settleOpenOrdersFromTickers(showToast = false): string[] {
  if (!market || useLabMatching()) return [];
  const notes = processOpenOrders(state, market, tickers);
  if (!notes.length) return notes;
  saveState(state);
  patchAvailChips();
  refreshOpenOrderChartLines();
  const openLeft = state.orders.some((o) => o.status === "open" || o.status === "triggered");
  if (!openLeft && activityTab === "orders") activityTab = "history";
  refreshActivityPanel();
  if (showToast) toast(notes[0], "info");
  return notes;
}

/** Reconnect DEMO/LAB fixture when address survived reload but CSRF did not. */
async function maybeAutoReconnectLabSession(): Promise<void> {
  const meta = getLabSessionMeta();
  if (meta.hasCsrf || !meta.address) return;
  const msg = document.getElementById("lab-api-msg");
  if (msg) msg.textContent = "Session address present — reconnecting fixture…";
  await labFixtureConnectUi();
}

/** Lab ledger sync (balances, open orders, fills, book). Does not touch node /api/wallet. */
async function syncLabLedgerUi(): Promise<void> {
  const res = await syncLabBalancesAndBook(state, market);
  if (!res.ok) {
    const msgEl = document.getElementById("lab-api-msg") ?? document.getElementById("sync-node-msg");
    if (msgEl) msgEl.textContent = res.message;
    toast(res.message, "warn");
    return;
  }
  saveState(state);
  const msgEl = document.getElementById("lab-api-msg") ?? document.getElementById("sync-node-msg");
  if (msgEl) msgEl.textContent = res.note;
  toast(res.note, "ok");
  refreshAccountAfterLab();
}

/**
 * Sync HMC/SUP from local node wallet (read-only).
 * When a lab session owns Spot balances, report node figures without overwriting the ledger.
 */
async function syncNodeHmcSupUi(): Promise<void> {
  if (isLabSessionStale()) {
    const note = "Lab session stale — reconnect fixture before node sync (balances frozen)";
    const msgEl = document.getElementById("sync-node-msg");
    if (msgEl) msgEl.textContent = note;
    toast(note, "warn");
    return;
  }
  const snap = await fetchNodeWallet({ timeoutMs: 10_000, retries: 1 });
  const msgEl = document.getElementById("sync-node-msg");
  if (!snap.ok) {
    if (msgEl) msgEl.textContent = snap.reason;
    toast(snap.reason, "warn");
    return;
  }
  if (useLabMatching() || isLabApiEnabled()) {
    // FE-M-STALE: never overwrite lab/paper hybrid when lab API is opted in.
    const note = useLabMatching()
      ? `Node ${formatNum(snap.hmc, 4)} HMC / ${formatNum(snap.sup, 4)} SUP · Spot uses lab ledger — Sync balances`
      : `Node online · lab API opted in — connect fixture (no paper merge)`;
    if (msgEl) msgEl.textContent = note;
    toast(note, "info");
    if (isHubEmbed()) postHubGotoTab("wallet");
    return;
  }
  state.wallet = mergeNodeIntoDemoWallet(state.wallet, snap);
  saveState(state);
  const note = `Synced HMC/SUP from node (${snap.address.slice(0, 12)}…)`;
  if (msgEl) msgEl.textContent = note;
  toast(note, "ok");
  if (state.mainView === "account") {
    patchAccountFundsDom(state, market!);
    patchNonSpotChrome();
  } else patchLive();
}

async function syncFromNode(): Promise<void> {
  toast("Syncing HMC/SUP from node…", "info");
  await syncNodeHmcSupUi();
}

async function labFixtureConnectUi(): Promise<void> {
  const msg = document.getElementById("lab-api-msg");
  if (msg) msg.textContent = "Connecting DEMO/LAB fixture…";
  const res = await labFixtureConnect();
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(`Lab fixture: ${res.message}`, "warn");
    return;
  }
  if (msg) msg.textContent = `Connected ${res.fixture.address} (DEMO/LAB only)`;
  toast(`DEMO/LAB fixture connected · ${res.fixture.address.slice(0, 14)}…`, "ok");
  const sync = await syncLabBalancesAndBook(state, market);
  if (sync.ok) {
    saveState(state);
    if (msg) msg.textContent = `${msg.textContent} · ${sync.note}`;
  }
  // Full remount so Deposit/Withdraw buttons + hints match live CSRF session.
  if (state.mainView === "account") render();
  else {
    const addrEl = document.getElementById("lab-session-addr");
    if (addrEl) addrEl.textContent = res.fixture.address;
    refreshAfterLabTrade();
  }
}

async function labApiLogoutUi(): Promise<void> {
  const res = await authLogout();
  clearLabBookCache();
  const msg = document.getElementById("lab-api-msg");
  if (msg) msg.textContent = res.ok ? "Logged out" : res.message;
  toast(res.ok ? "Lab session cleared" : res.message, res.ok ? "info" : "warn");
  if (state.mainView === "account") render();
  else {
    const addrEl = document.getElementById("lab-session-addr");
    if (addrEl) addrEl.textContent = "not connected";
    patchModeChrome();
    if (state.mainView === "spot") {
      const book = document.getElementById("book");
      if (book) {
        book.innerHTML = renderBook();
        wireBookTabs();
      }
    }
  }
}

async function labRevokeAllUi(): Promise<void> {
  const res = await authRevokeAll();
  clearLabBookCache();
  const msg = document.getElementById("lab-api-msg");
  if (msg) msg.textContent = res.ok ? `All sessions revoked (sv=${res.session_version ?? "?"})` : res.message;
  toast(res.ok ? "All lab sessions revoked — reconnect" : res.message, res.ok ? "info" : "warn");
  if (state.mainView === "account") render();
  else {
    const addrEl = document.getElementById("lab-session-addr");
    if (addrEl) addrEl.textContent = "not connected";
    patchModeChrome();
  }
}

async function labShowDepositAddr(asset: string): Promise<void> {
  if (!useLabMatching()) {
    toast("Connect DEMO/LAB fixture first", "warn");
    return;
  }
  const msg = document.getElementById("lab-deposit-msg");
  const res = await fetchDepositAddress(asset);
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(res.message, "warn");
    return;
  }
  const line = `${res.asset} · ${res.kind} · ${res.bridge_model ?? ""} · ${res.deposit_address}`;
  if (msg) msg.textContent = `${line} — ${res.warning ?? ""}`;
  toast(`${asset} deposit: ${res.deposit_address.slice(0, 22)}…`, "ok");
  void copyTextToClipboard(res.deposit_address).then((ok) => {
    if (ok) toast(`${asset} address copied`, "info");
  });
}

async function labMintHmcUi(displayAmt = 100): Promise<void> {
  const msg = document.getElementById("lab-deposit-msg");
  if (!useLabMatching()) {
    toast("Connect DEMO/LAB fixture first", "warn");
    return;
  }
  if (custodyInFlight) {
    toast("Custody request already in flight", "info");
    return;
  }
  custodyInFlight = true;
  if (msg) msg.textContent = `Minting +${displayAmt} HMC…`;
  try {
    const res = await postLabDeposit({
      asset: "HMC",
      amount: displayToMinor(displayAmt),
      reason: "spa_hmc_mint",
    });
    if (!res.ok) {
      if (msg) msg.textContent = res.message;
      toast(res.message, "warn");
      return;
    }
    const after =
      res.balance_after != null ? ` · bal=${minorToDisplay(res.balance_after)}` : "";
    if (msg) msg.textContent = `+${displayAmt} HMC minted${after}`;
    toast(`Lab mint +${displayAmt} HMC`, "ok");
    const sync = await syncLabBalancesAndBook(state, market);
    if (sync.ok) {
      saveState(state);
      refreshAccountAfterLab();
    }
  } finally {
    custodyInFlight = false;
  }
}

async function labBridgeCreditUi(asset: "USDT" | "BTC", displayAmt: number): Promise<void> {
  const msg = document.getElementById("lab-deposit-msg");
  if (!useLabMatching()) {
    toast("Connect DEMO/LAB fixture first", "warn");
    return;
  }
  if (custodyInFlight) {
    toast("Custody request already in flight", "info");
    return;
  }
  custodyInFlight = true;
  try {
    const amount = displayToMinor(displayAmt);
    const res = await postLabBridgeCredit({ asset, amount });
    if (!res.ok) {
      if (msg) msg.textContent = res.message;
      toast(res.message, "warn");
      return;
    }
    if (msg) msg.textContent = `Paper ${asset} credited · bal=${minorToDisplay(res.balance_after)} · ${res.deposit_address}`;
    toast(`Paper bridge +${displayAmt} ${asset}`, "ok");
    const sync = await syncLabBalancesAndBook(state, market);
    if (sync.ok) {
      saveState(state);
      refreshAccountAfterLab();
    }
  } finally {
    custodyInFlight = false;
  }
}

function renderLabWithdrawList(rows: { id: string; asset: string; amount: number; status: string; destination: string }[]): void {
  const ul = document.getElementById("lab-wd-list");
  if (!ul) return;
  if (!rows.length) {
    ul.innerHTML = "<li class=\"dim\">No withdraw requests</li>";
    return;
  }
  ul.innerHTML = rows
    .map(
      (w) =>
        `<li><span class="dim">${escapeHtml(w.id.slice(0, 8))}…</span> ${escapeHtml(w.asset)} ${minorToDisplay(w.amount)} → ${escapeHtml(w.destination.slice(0, 18))}… <strong>${escapeHtml(w.status)}</strong></li>`,
    )
    .join("");
}

async function labWithdrawRefreshUi(): Promise<void> {
  const msg = document.getElementById("lab-wd-msg");
  const res = await listWithdrawals();
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(res.message, "warn");
    return;
  }
  renderLabWithdrawList(res.withdrawals);
  if (msg) msg.textContent = `${res.withdrawals.length} withdraw request(s)`;
}

async function labWithdrawRequestUi(): Promise<void> {
  const msg = document.getElementById("lab-wd-msg");
  if (!useLabMatching()) {
    toast("Connect DEMO/LAB fixture first", "warn");
    return;
  }
  if (custodyInFlight) {
    toast("Custody request already in flight", "info");
    return;
  }
  const asset = ((document.getElementById("lab-wd-asset") as HTMLSelectElement | null)?.value || "HMC").toUpperCase();
  const amtDisp = Number((document.getElementById("lab-wd-amt") as HTMLInputElement | null)?.value || 0);
  const destination = ((document.getElementById("lab-wd-dest") as HTMLInputElement | null)?.value || "").trim();
  const totp = ((document.getElementById("lab-wd-2fa") as HTMLInputElement | null)?.value || "").trim();
  const amount = displayToMinor(amtDisp);
  if (!(amount > 0) || !destination) {
    toast("Amount and destination required", "warn");
    return;
  }
  const destCheck = validateLabWithdrawDestination(asset, destination);
  if (!destCheck.ok) {
    if (msg) msg.textContent = destCheck.hint;
    toast(destCheck.hint, "warn");
    return;
  }
  custodyInFlight = true;
  try {
    const body: { asset: string; amount: number; destination: string; totp_code?: string } = {
      asset,
      amount,
      destination,
    };
    if (totp) body.totp_code = totp;
    const res = await requestWithdraw(body);
    if (!res.ok) {
      if (msg) msg.textContent = res.message;
      toast(res.message, "warn");
      return;
    }
    if (msg) msg.textContent = `Requested ${res.withdraw.id} · ${res.withdraw.status}${
      res.fee_quote && res.fee_quote.fee > 0
        ? ` · fee ${minorToDisplay(res.fee_quote.fee)} ${res.withdraw.asset} (debit ${minorToDisplay(res.fee_quote.debit_total)})`
        : ""
    } — admin complete via CLI (no SPA token)`;
    toast("Withdraw pending — operator CLI to complete", "ok");
    await labWithdrawRefreshUi();
    const sync = await syncLabBalancesAndBook(state, market);
    if (sync.ok) {
      saveState(state);
      refreshAccountAfterLab();
    }
  } finally {
    custodyInFlight = false;
  }
}

async function labWithdrawQuoteUi(): Promise<void> {
  const seq = ++withdrawQuoteSeq;
  const quoteEl = document.getElementById("lab-wd-fee-quote");
  const asset = ((document.getElementById("lab-wd-asset") as HTMLSelectElement | null)?.value || "HMC").toUpperCase();
  const amtDisp = Number((document.getElementById("lab-wd-amt") as HTMLInputElement | null)?.value || 0);
  const amount = displayToMinor(amtDisp);
  if (!(amount > 0)) {
    if (quoteEl) quoteEl.textContent = "Enter amount to quote custody fee";
    return;
  }
  const res = await fetchCustodyFees({ side: "withdraw", asset, amount });
  if (seq !== withdrawQuoteSeq) return;
  const quoteEl2 = document.getElementById("lab-wd-fee-quote");
  if (!quoteEl2) return;
  if (!res.ok) {
    quoteEl2.textContent = res.message;
    return;
  }
  const pause = document.getElementById("lab-custody-pause");
  if (pause) {
    const bits: string[] = [];
    if (!res.deposit_enabled) bits.push("deposits paused");
    if (!res.withdraw_enabled) bits.push("withdrawals paused");
    if (!res.custody_fees_on) bits.push("custody fees off");
    pause.hidden = bits.length === 0;
    pause.textContent = bits.length ? `Runbook: ${bits.join(" · ")}` : "";
  }
  const q = res.quote;
  if (!q) return;
  quoteEl2.textContent = q.paused
    ? `Paused — ${q.note || "unavailable"}`
    : `Fee ${minorToDisplay(q.fee)} ${q.asset} on top · dest gets ${minorToDisplay(q.receive)} · wallet debit ${minorToDisplay(q.debit_total)}`;
}

async function labFillsRefreshUi(): Promise<void> {
  const seq = ++fillsRefreshSeq;
  const msg = document.getElementById("lab-fills-msg");
  const ul = document.getElementById("lab-fills-list");
  const res = await listExchangeFills(40);
  if (seq !== fillsRefreshSeq) return;
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    return;
  }
  const account = getLabSessionMeta().address;
  const added = mergeServerFills(state, res.fills, account, market);
  if (added > 0) saveState(state);
  const ul2 = document.getElementById("lab-fills-list");
  const msg2 = document.getElementById("lab-fills-msg");
  if (ul2) {
    ul2.innerHTML = res.fills.length
      ? res.fills
          .map((f) => {
            const acct = (account || "").toLowerCase();
            const isMaker = !!f.maker_account && String(f.maker_account).toLowerCase() === acct;
            const takerSide = String(f.taker_side || "").toLowerCase();
            const mySide =
              takerSide === "buy" || takerSide === "sell"
                ? isMaker
                  ? takerSide === "buy"
                    ? "sell"
                    : "buy"
                  : takerSide
                : "?";
            const side = escapeHtml(mySide);
            const pair = escapeHtml(f.pair || "");
            const px = minorToDisplay(Number(f.price || 0));
            const qty = minorToDisplay(Number(f.qty || 0));
            const id = escapeHtml(String(f.id || "").slice(0, 10));
            return `<li><span class="dim">${id}…</span> ${pair} ${side} ${qty} @ ${px}</li>`;
          })
          .join("")
      : `<li class="dim">No fills yet — Sync after trading</li>`;
  }
  if (msg2) {
    msg2.textContent = res.fills.length
      ? `${res.fills.length} fill(s)${res.source ? ` · ${res.source}` : ""}${added ? ` · +${added} ledger` : ""}`
      : "No fills yet";
  }
}

async function labCounterpartyUi(): Promise<void> {
  const msg = document.getElementById("lab-api-msg");
  if (msg) msg.textContent = "DEMO/LAB counterparty bot crossing…";
  // Refresh open orders from server so SPA state matches the book before cross.
  await syncLabBalancesAndBook(state, market);
  let openLab = state.orders.find(
    (o) => o.source === "lab" && (o.status === "open" || o.status === "triggered") && o.pairId === state.activePair,
  );
  if (!openLab) {
    openLab = state.orders.find(
      (o) => o.source === "lab" && (o.status === "open" || o.status === "triggered"),
    );
  }
  const pairForCross = openLab?.pairId ?? state.activePair;
  const res = await runLabCounterpartyCross(state, pairForCross, openLab?.id, market);
  if (!res.ok) {
    if (msg) msg.textContent = res.reason;
    toast(`Lab fill helper: ${res.reason}`, "warn");
    return;
  }
  saveState(state);
  if (msg) msg.textContent = res.note;
  toast(res.note, "ok");
  refreshAfterLabTrade();
}

function wireLabApiButtons(): void {
  const click = (id: string, fn: () => void) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Re-render-safe: clone strips prior listeners (fixes double mint/withdraw).
    const next = el.cloneNode(true) as HTMLElement;
    el.replaceWith(next);
    next.addEventListener("click", fn);
  };
  click("btn-lab-fixture-connect", () => void labFixtureConnectUi());
  click("btn-lab-api-sync", () => void syncLabLedgerUi());
  click("btn-lab-api-logout", () => void labApiLogoutUi());
  click("btn-lab-revoke-all", () => void labRevokeAllUi());
  click("btn-lab-counterparty", () => void labCounterpartyUi());
  click("btn-lab-mint-hmc", () => void labMintHmcUi(100));
  click("btn-lab-dep-hmc", () => void labShowDepositAddr("HMC"));
  click("btn-lab-dep-usdt", () => void labShowDepositAddr("USDT"));
  click("btn-lab-bridge-usdt", () => void labBridgeCreditUi("USDT", 10));
  click("btn-lab-bridge-btc", () => void labBridgeCreditUi("BTC", 0.01));
  click("btn-lab-wd-request", () => void labWithdrawRequestUi());
  click("btn-lab-wd-refresh", () => void labWithdrawRefreshUi());
  click("btn-lab-wd-quote", () => void labWithdrawQuoteUi());
  click("btn-lab-fills-refresh", () => void labFillsRefreshUi());
  click("btn-lab-fee-wallet-copy", () => {
    const addr =
      labFeeWallet ||
      document.getElementById("lab-fee-wallet-addr")?.textContent?.trim() ||
      "";
    if (!addr) return;
    void copyTextToClipboard(addr).then((ok) => {
      toast(ok ? "Fee wallet copied" : "Copy failed — select address manually", ok ? "ok" : "warn");
    });
  });

  const assetSel = document.getElementById("lab-wd-asset") as HTMLSelectElement | null;
  if (assetSel) {
    const next = assetSel.cloneNode(true) as HTMLSelectElement;
    assetSel.replaceWith(next);
    next.addEventListener("change", () => {
      const dest = document.getElementById("lab-wd-dest") as HTMLInputElement | null;
      if (dest) {
        const a = (next.value || "HMC").toLowerCase();
        const ph = dest.getAttribute(`data-ph-${a}`) || dest.getAttribute("data-ph-hmc") || "HMC-ffffffffffffffff";
        dest.placeholder = ph;
        if (!dest.value.trim()) dest.value = "";
      }
      void labWithdrawQuoteUi();
    });
  }
  const amt = document.getElementById("lab-wd-amt");
  if (amt) {
    const next = amt.cloneNode(true) as HTMLInputElement;
    amt.replaceWith(next);
    next.addEventListener("change", () => void labWithdrawQuoteUi());
    next.addEventListener("input", () => void labWithdrawQuoteUi());
  }
}

function runLockedLabOrder(work: () => Promise<void>): void {
  orderInFlight = true;
  void work().finally(() => {
    orderInFlight = false;
  });
}

function fillOrderPanelAtPrice(
  side: "buy" | "sell",
  kind: "limit" | "stop_limit",
  price: number,
  pairId: PairId = state.activePair,
): void {
  uiType = kind;
  setFormPrice(side, price, pairId);
  const stopInp = document.getElementById(`${side}-stop`) as HTMLInputElement | null;
  if (kind === "stop_limit" && stopInp) stopInp.value = tickInputValue(price, pairId);
  syncOrderTypeTabs(kind);
  toggleOrderFields();
  updatePreviewForSide(side);
  if (isMobileLayout()) setMobileTradeSide(side);
  document.getElementById("order-zone")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function quickPlaceFromChart(
  side: "buy" | "sell",
  kind: "limit" | "stop_limit",
  price: number,
  pairId: PairId = state.activePair,
): void {
  const pair = pairById(pairId);
  const amtInp = document.getElementById(`${side}-amt`) as HTMLInputElement | null;
  let amt = Number(amtInp?.value ?? 0);
  if (amt <= 0) {
    if (!market || !(price > 0)) {
      toast("Insufficient balance — set amount", "warn");
      fillOrderPanelAtPrice(side, kind, price, pairId);
      return;
    }
    const mid = midForPair(market, pairId);
    amt = maxOrderBaseAmount(state, market, pairId, side, price, kind, 0.25, mid);
  }
  if (amt <= 0) {
    toast("Insufficient balance — set amount", "warn");
    fillOrderPanelAtPrice(side, kind, price, pairId);
    return;
  }
  if (useLabMatching()) {
    if (orderInFlight) {
      toast("Order already in progress", "info");
      return;
    }
    runLockedLabOrder(async () => {
      await refreshLabBook(pairId);
      if (!paperGuardsOrWarn(side, kind, amt, price)) return;
      if (kind === "limit") {
        const mid = labBookMid(pairId) || (market ? midForPair(market, pairId) : price);
        const check = validateLimitOrder(side, price, mid, uiTif, uiPostOnly);
        if (!check.ok) {
          toast(check.reason, "warn");
          fillOrderPanelAtPrice(side, kind, price, pairId);
          return;
        }
        const lab = await placeLabOrder(
          state,
          pairId,
          side,
          "limit",
          amt,
          price,
          undefined,
          labOrderOpts({ postOnly: uiPostOnly, timeInForce: uiTif }),
        );
        if (!lab.ok) {
          toast(lab.reason, "warn");
          return;
        }
        toast(lab.note, "ok");
        if (lab.fillCount === 0) toast("Resting on book — use Counterparty bot (Account) to fill", "info");
        refreshAfterLabTrade();
        return;
      }
      const mid = labBookMid(pairId) || (market ? midForPair(market, pairId) : price);
      const check = validateLimitOrder(side, price, mid, uiTif, uiPostOnly);
      if (!check.ok) {
        toast(check.reason, "warn");
        fillOrderPanelAtPrice(side, kind, price, pairId);
        return;
      }
      const lab = await placeLabOrder(
        state,
        pairId,
        side,
        "stop_limit",
        amt,
        price,
        price,
        labOrderOpts(),
      );
      if (!lab.ok) {
        toast(lab.reason, "warn");
        return;
      }
      toast(lab.note, "ok");
      refreshAfterLabTrade();
    });
    return;
  }
  if (!paperGuardsOrWarn(side, kind, amt, price)) return;
  if (kind === "limit") {
    const mid = market ? midForPair(market, pairId) : price;
    const check = validateLimitOrder(side, price, mid, uiTif, uiPostOnly);
    if (!check.ok) {
      toast(check.reason, "warn");
      fillOrderPanelAtPrice(side, kind, price, pairId);
      return;
    }
    if (check.immediate && market) {
      const quote = price * amt;
      const pair = pairById(pairId);
      const fee = calcFee(state, market, pairId, quote, "taker");
      const res = executeFill(state, market, pairId, side, price, amt, quote, "limit", false, true);
      if (!res.ok) { toast(res.reason, "warn"); return; }
      toast(`${side.toUpperCase()} filled @ ${formatPrice(price)} · ${previewFeeLabel(fee, pair.quote)}`, "ok");
      saveState(state);
      patchLive();
      document.getElementById("activity-body")!.innerHTML = renderActivityBody();
      return;
    }
    placeOrderOrWarn(pairId, side, "limit", amt, price, undefined, undefined, uiTif, uiPostOnly);
  } else {
    const mid = market ? midForPair(market, pairId) : price;
    const check = validateLimitOrder(side, price, mid, uiTif, uiPostOnly);
    if (!check.ok) {
      toast(check.reason, "warn");
      fillOrderPanelAtPrice(side, kind, price, pairId);
      return;
    }
    placeOrderOrWarn(pairId, side, "stop_limit", amt, price, price, undefined, uiTif, uiPostOnly);
  }
  saveState(state);
  toast(`${kind === "limit" ? "Limit" : "Stop"} ${side} @ ${formatPrice(price)}`, "ok");
  refreshOrderLines(state.orders.filter((o) => o.pairId === state.activePair));
  activityTab = "orders";
  document.querySelectorAll("#activity-tabs button").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.tab === "orders");
  });
  document.getElementById("activity-body")!.innerHTML = renderActivityBody();
}

function handleChartContextAction(
  action: string,
  price: number,
  ctx?: { pairId: PairId; paneHostId: string },
): void {
  const pairId = ctx?.pairId ?? state.activePair;
  const paneHostId = ctx?.paneHostId ?? "chart-host";
  const isMainPane = paneHostId === "chart-host";
  switch (action) {
    case "buy_limit":
      quickPlaceFromChart("buy", "limit", price, pairId);
      break;
    case "buy_stop":
      quickPlaceFromChart("buy", "stop_limit", price, pairId);
      break;
    case "sell_limit":
      quickPlaceFromChart("sell", "limit", price, pairId);
      break;
    case "sell_stop":
      quickPlaceFromChart("sell", "stop_limit", price, pairId);
      break;
    case "create_order":
      fillOrderPanelAtPrice("buy", "limit", price, pairId);
      toast(`Price → ${formatPrice(price)}`, "info");
      break;
    case "add_alert": {
      state.priceAlerts.push({
        id: uid(),
        pairId,
        price,
        fired: false,
        createdAt: Date.now(),
      });
      saveState(state);
      void Notification.requestPermission?.();
      activityTab = "alerts";
      refreshActivityPanel();
      refreshOpenOrderChartLines();
      toast(`Alert @ ${formatPrice(price)}`, "ok");
      break;
    }
    case "reset_view":
      if (isMainPane) resetChartView();
      else resetSecondaryPaneView(paneHostId);
      toast("Chart view reset", "info");
      break;
    case "copy_price":
      void copyTextToClipboard(String(price)).then((ok) => {
        if (ok) toast(`Copied ${formatPrice(price)}`, "ok");
        else toast("Clipboard blocked", "warn");
      });
      break;
    case "paste":
      void navigator.clipboard.readText().then((t) => {
        const n = Number(t.replace(/[,\s]/g, ""));
        if (!Number.isFinite(n) || n <= 0) { toast("Clipboard is not a price", "warn"); return; }
        fillOrderPanelAtPrice("buy", uiType === "stop_limit" ? "stop_limit" : "limit", n);
        toast(`Pasted ${formatPrice(n)}`, "ok");
      }).catch(() => toast("Clipboard read blocked", "warn"));
      break;
    case "object_tree": {
      const drawings = state.drawings.filter((d) => d.pairId === pairId);
      showObjectTreeModal(
        drawings.map((d) => ({ id: d.id, tool: d.tool, text: d.text })),
        (id) => {
          state.drawings = state.drawings.filter((d) => d.id !== id);
          saveState(state);
          refreshDrawings(state.drawings.filter((d) => d.pairId === state.activePair));
          toast("Drawing removed", "info");
        },
        () => {
          state.drawings = state.drawings.filter((d) => d.pairId !== pairId);
          saveState(state);
          refreshDrawings(state.drawings.filter((d) => d.pairId === state.activePair));
          toast("All drawings cleared", "info");
        },
      );
      break;
    }
    case "remove_indicators":
      if (!isMainPane) break;
      saveChartPatch({
        chartSettings: clearAllIndicators(state.chartSettings),
        indicatorConfig: clearIndicatorConfig(),
      });
      break;
    case "toggle_marks":
      if (!isMainPane) break;
      state.chartOverlays.showVolume = !state.chartOverlays.showVolume;
      saveState(state);
      applyOverlays(state.chartOverlays, state.orders.filter((o) => o.pairId === state.activePair), activeTicker().mid);
      toast(state.chartOverlays.showVolume ? "Volume shown" : "Volume hidden", "info");
      break;
    case "settings":
      showChartStyleModal(state, (patch) => saveChartPatch(patch));
      break;
  }
}

function openPaneContextMenu(pairId: PairId, paneHostId: string, price: number, x: number, y: number): void {
  const pair = pairById(pairId);
  const isMain = paneHostId === "chart-host";
  showChartContextMenu(x, y, price, {
    baseSymbol: pair.base,
    indicatorCount: isMain ? countActiveIndicators(state.chartSettings, state.indicatorConfig) : 0,
    marksHidden: isMain ? !state.chartOverlays.showVolume : true,
    onOpen: () => setContextPriceMarker(null),
    onClose: () => setContextPriceMarker(null),
    onAction: (action, p) => handleChartContextAction(action, p, { pairId, paneHostId }),
  });
}

function refreshOhlcLegendIdle(): void {
  const el = document.getElementById("ohlc-legend");
  if (!el) return;
  const ha = state.chartMode === "heikin" ? "HA " : "";
  const tip =
    state.chartMode === "heikin"
      ? getDisplayedLastCandle()
      : (state.candles[state.activePair]?.[state.activeTf]?.slice(-1)[0] ?? null);
  if (tip) {
    el.textContent = `${ha}O ${formatPrice(tip.open)} H ${formatPrice(tip.high)} L ${formatPrice(tip.low)} C ${formatPrice(tip.close)}`;
  } else {
    el.textContent = `${ha}O — H — L — C ${formatPrice(activeTicker().mid)}`;
  }
}

function mountChartPanel(): void {
  const host = document.getElementById("chart-host");
  if (!host) return;
  closeChartContextMenu();
  destroyChart();
  chartMounted = false;
  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
  const opts: import("./types").ChartMountOpts = {
    ...chartOpts(),
    drawingsLocked: state.drawingsLocked,
    onCrosshair: (c) => {
      lastOhlc = c;
      const el = document.getElementById("ohlc-legend");
      if (!el) return;
      const ha = state.chartMode === "heikin" ? "HA " : "";
      if (c) {
        el.textContent = `${ha}O ${formatPrice(c.open)} H ${formatPrice(c.high)} L ${formatPrice(c.low)} C ${formatPrice(c.close)}`;
        return;
      }
      // Idle: last bar OHLC — never fake C=ticker.mid with empty O/H/L.
      refreshOhlcLegendIdle();
    },
    onOrderPriceDrag: (id, price) => {
      updateOrderPrice(state, id, price);
      refreshOrderLines(state.orders.filter((o) => o.pairId === state.activePair));
      toast(`Order price → ${formatPrice(price)}`, "info");
    },
    onContextMenu: (price, x, y) => openPaneContextMenu(state.activePair, "chart-host", price, x, y),
    onUpdateDrawing: (d) => {
      const i = state.drawings.findIndex((x) => x.id === d.id);
      if (i >= 0) state.drawings[i] = d;
      saveState(state);
    },
    onNeedHistory: (bars) => {
      if (!market) return 0;
      const pair = state.activePair;
      const tf = state.activeTf;
      const before = (state.candles[pair]?.[tf] ?? []).length;
      const base = state.candles[pair]?.[CANDLE_BASE_TF] ?? [];
      const baseBars = Math.max(
        1,
        Math.ceil(bars * (TF_SEC[tf] / TF_SEC[CANDLE_BASE_TF])),
      );
      const nextBase = prependOlderCandles(base, pair, CANDLE_BASE_TF, baseBars);
      const addedBase = nextBase.length - base.length;
      if (addedBase <= 0) return 0;
      const all = deriveAllTimeframes(nextBase, pair, state.candles[pair]);
      state.candles[pair] = all;
      saveState(state);
      const next = all[tf] ?? [];
      const added = next.length - before;
      if (added <= 0) return 0;
      const refreshed = { ...chartOpts(), drawingsLocked: state.drawingsLocked };
      setCandleData(next, refreshed, { preserveLogicalRange: true, prepended: added });
      if (state.multiChartLayout !== "1") {
        const n = state.multiChartLayout === "4" ? 4 : 2;
        for (let i = 2; i <= n; i++) {
          const ptf = paneTf(i);
          const pid = panePair(i);
          const c2 = state.candles[pid]?.[ptf] ?? [];
          if (c2.length) updateSecondaryChart(c2, `chart-host-${i}`);
        }
      }
      return added;
    },
  };
  mountChart(host, candles, opts, (d) => {
    if (state.drawings.length >= MAX_DRAWINGS) {
      toast(`Drawing limit (${MAX_DRAWINGS}) — delete some first`, "warn");
      return;
    }
    state.drawings.push(d);
    saveState(state);
    refreshDrawings(state.drawings.filter((x) => x.pairId === state.activePair));
  });
  chartMounted = true;
  setActiveDrawTool(state.activeDrawTool);
  syncMultiCharts();
  // Mode / remount must refresh idle OHLC (incl. HA prefix) without waiting for crosshair.
  refreshOhlcLegendIdle();
}

function paneTf(pane: number): Timeframe {
  if (pane <= 1) return state.activeTf;
  const idx = pane - 2;
  const tfs = state.multiPaneTfs ?? (["15m", "1H", "1D"] as MultiPaneTfs);
  return tfs[idx] ?? state.secondaryTf ?? "1H";
}

function panePair(pane: number): PairId {
  if (pane <= 1) return state.activePair;
  const idx = pane - 2;
  const pairs = state.multiPanePairs ?? DEFAULT_MULTI_PANE_PAIRS;
  return pairs[idx] ?? state.activePair;
}

function setPanePair(pane: number, pairId: PairId): void {
  if (pane <= 1) {
    if (pairId === state.activePair) return;
    state.activePair = pairId;
    saveState(state);
    syncRouteHash();
    render();
    refresh();
    return;
  }
  const next = [...(state.multiPanePairs ?? DEFAULT_MULTI_PANE_PAIRS)] as MultiPanePairs;
  if (next[pane - 2] === pairId) return;
  next[pane - 2] = pairId;
  state.multiPanePairs = next;
  saveState(state);
  syncMultiCharts();
}

function setPaneTf(pane: number, tf: Timeframe): void {
  if (pane <= 1) {
    state.activeTf = tf;
    saveState(state);
    syncRouteHash();
    mountChartPanel();
    document.querySelectorAll(".tfq").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tf === tf));
    const more = document.getElementById("tf-more") as HTMLSelectElement | null;
    if (more) more.value = tf;
    return;
  }
  const next = [...(state.multiPaneTfs ?? ["15m", "1H", "1D"])] as MultiPaneTfs;
  next[pane - 2] = tf;
  state.multiPaneTfs = next;
  if (pane === 2) state.secondaryTf = tf;
  saveState(state);
  syncMultiCharts();
}

let crosshairPaneCleanups: Array<() => void> = [];
let timeSyncPaneCleanups: Array<() => void> = [];

function syncCrosshairPanes(): void {
  crosshairPaneCleanups.forEach((fn) => fn());
  crosshairPaneCleanups = [];
  timeSyncPaneCleanups.forEach((fn) => fn());
  timeSyncPaneCleanups = [];
  const multi = state.multiChartLayout !== "1";
  setCrosshairSyncEnabled(multi);
  setTimeSyncEnabled(multi);
  setChartCrosshairMode(multi ? 1 : 0);
  if (!multi) return;
  const main = getMainCrosshairPane();
  if (main) {
    crosshairPaneCleanups.push(registerCrosshairPane(main));
    timeSyncPaneCleanups.push(registerTimeSyncPane({ id: main.id, chart: main.chart }));
  }
  for (const pane of listSecondaryCrosshairPanes()) {
    crosshairPaneCleanups.push(registerCrosshairPane(pane));
    timeSyncPaneCleanups.push(registerTimeSyncPane({ id: pane.id, chart: pane.chart }));
  }
}

function syncMultiCharts(): void {
  if (state.multiChartLayout === "1") {
    destroySecondaryChart();
    syncCrosshairPanes();
    return;
  }
  if (market) ensureCandles(state, market);
  const pairOpts = PAIRS.map((p) => ({ id: p.id, label: p.label }));
  const n = state.multiChartLayout === "4" ? 4 : 2;
  for (let i = 2; i <= n; i++) {
    const host = document.getElementById(`chart-host-${i}`);
    if (!host) continue;
    const pairId = panePair(i);
    const pair = pairById(pairId);
    const tf = paneTf(i);
    const c = state.candles[pairId]?.[tf] ?? [];
    if (c.length < 2) {
      host.innerHTML = `<div class="sub-chart-chrome"><span class="muted small">Loading ${pair.label} · ${tf}</span></div>`;
      continue;
    }
    syncSecondaryChart(host, c, {
      pairId,
      pairLabel: pair.label,
      tf,
      pairs: pairOpts,
      timeframes: TIMEFRAMES,
      onTfChange: (next) => setPaneTf(i, next),
      onPairChange: (next) => setPanePair(i, next),
      onContextMenu: (price, x, y) => openPaneContextMenu(pairId, `chart-host-${i}`, price, x, y),
      getDrawings: () => state.drawings.filter((d) => d.pairId === pairId),
      drawingsLocked: () => state.drawingsLocked,
      onAddDrawing: (d) => {
        if (state.drawings.length >= MAX_DRAWINGS) {
          toast(`Drawing limit (${MAX_DRAWINGS}) — delete some first`, "warn");
          return;
        }
        state.drawings.push(d);
        saveState(state);
        refreshDrawings(state.drawings.filter((x) => x.pairId === state.activePair));
      },
      onUpdateDrawing: (d) => {
        const idx = state.drawings.findIndex((x) => x.id === d.id);
        if (idx >= 0) state.drawings[idx] = d;
        saveState(state);
        refreshDrawings(state.drawings.filter((x) => x.pairId === state.activePair));
      },
    });
  }
  const resizeAll = () => {
    resizeChart();
    resizeSecondaryCharts();
  };
  requestAnimationFrame(() => {
    resizeAll();
    requestAnimationFrame(() => {
      resizeAll();
      requestAnimationFrame(() => {
        resizeAll();
        syncCrosshairPanes();
      });
    });
  });
}

function patchLive(): void {
  if (state.mainView !== "spot") return;
  markPerf("patchLive-start");
  const quote = activePairQuote();
  patchTickerBar(quote);
  patchMarketRowsInPlace();
  // Book/tape DOM is heavier — throttle like microTick (avoid full rewire every call).
  throttledBookTapePatch();
  if (chartMounted) {
    const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
    const opts = chartOpts();
    const last = candles[candles.length - 1];
    if (chartNeedsFullReplace || !last) {
      setCandleData(candles, opts, { scrollToLive: chartNeedsFullReplace });
      chartNeedsFullReplace = false;
    } else if (!updateLastCandle(last, opts)) {
      setCandleData(candles, opts, { preserveLogicalRange: true });
    }
    refreshOrderLines(opts.orders, opts.alerts);
    updateLivePriceHud(quote.mid, quote.tone !== "down", candleCountdown(state.activeTf));
    if (state.multiChartLayout !== "1") {
      const n = state.multiChartLayout === "4" ? 4 : 2;
      const focused = getFocusedChartPaneId();
      const mobileSkip = isMobileLayout() && state.multiChartLayout === "4";
      for (let i = 2; i <= n; i++) {
        const hostId = `chart-host-${i}`;
        if (mobileSkip && focused !== hostId && liveTickN % 3 !== 0) continue;
        const tf = paneTf(i);
        const pid = panePair(i);
        const c2 = state.candles[pid]?.[tf] ?? [];
        if (c2.length) updateSecondaryChart(c2, hostId);
      }
    }
  }
  evaluatePriceAlerts(quote.mid);
  const strip = document.getElementById("mining-strip");
  if (strip && poolLive) {
    const p = pairById(state.activePair);
    strip.textContent = `${p.label} · ${formatGh(poolLive.poolGh)} · ${poolLive.workers} workers · reward/M ${formatRewardPerM(poolLive.rewardPerM)} · #${formatNum(poolLive.blockHeight, 0)}`;
  }
  updatePreview();
  patchAvailChips();
  patchOracleStatus();
  const ms = measurePerf("patchLive", "patchLive-start", "patchLive-end");
  if (ms != null && ms > 32) console.debug(`[perf] patchLive ${ms.toFixed(1)}ms`);
}

const throttledBookTapePatch = throttle(() => {
  const book = document.getElementById("book");
  if (book) {
    book.innerHTML = renderBook();
    // Preserve delegation flag after innerHTML wipe
    book.dataset.bookTabsWired = "1";
    wireBookTabs();
  }
  const tape = document.getElementById("tape");
  if (tape) tape.innerHTML = renderTape();
  patchMobileTradeTape();
}, 350);

function previewFeeLabel(fee: { feeQuote: number; feeHmc: number; paidInHmc: boolean }, quote: string): string {
  // Client float estimate — server quotes in minor units; label as estimate.
  if (fee.paidInHmc) return `est. fee ≈ ${formatNum(fee.feeHmc, 4)} HMC`;
  return `est. fee ≈ ${formatPrice(fee.feeQuote)} ${quote}`;
}

function updatePreviewForSide(side: "buy" | "sell"): void {
  if (!market) return;
  const form = readOrderForm(side);
  const pair = pairById(state.activePair);
  const t = activeTicker();
  if (form.amt <= 0) { setOrderPreview(side, ""); return; }
  if (uiType === "limit" || uiType === "stop_limit") {
    const total = form.amt * form.price;
    const mid = spotTradeMid();
    const role =
      uiType === "limit" && isMarketableLimit(side, form.price, mid) ? "taker" : previewFeeRole(uiType);
    const fee = calcFee(state, market, state.activePair, total, role);
    setOrderPreview(side, `${formatNum(form.amt, 0)} @ ${formatPriceCompact(form.price)} · ${previewFeeLabel(fee, pair.quote)}`);
    return;
  }
  if (uiType === "trailing_stop") {
    setOrderPreview(side, `Trail ${form.trail}% · ${formatNum(form.amt, 0)} ${pair.base}`);
    return;
  }
  if (uiType === "oco") {
    setOrderPreview(side, `OCO TP ${formatPriceCompact(form.tp)} · SL ${formatPriceCompact(form.stop)}`);
    return;
  }
  if (useLabMatching()) {
    const lab = getLabBookCache(state.activePair);
    if (!lab || (!lab.bids.length && !lab.asks.length)) {
      setOrderPreview(side, "Waiting for lab book…");
      return;
    }
    const m = matchMarket(t, side, form.amt, lab);
    const fee = calcFee(state, market, state.activePair, m.quote, "taker");
    setOrderPreview(side, `≈ ${formatPriceCompact(m.avgPrice)} · ${formatNum(m.quote, 4)} ${pair.quote} · ${previewFeeLabel(fee, pair.quote)}`);
    return;
  }
  const m = matchMarket(t, side, form.amt);
  const fee = calcFee(state, market, state.activePair, m.quote, "taker");
  setOrderPreview(side, `≈ ${formatPriceCompact(m.avgPrice)} · ${formatNum(m.quote, 4)} ${pair.quote} · ${previewFeeLabel(fee, pair.quote)}`);
}

function updatePreview(): void {
  updatePreviewForSide("buy");
  updatePreviewForSide("sell");
}

function placeAttachedTpsl(side: "buy" | "sell", amountBase: number, exitSide: "buy" | "sell"): void {
  const form = readOrderForm(side);
  if (!form.tpslEnabled) return;
  if (form.takeProfit > 0 && form.stopLoss > 0) {
    placeOcoOrWarn(state.activePair, exitSide, amountBase, form.takeProfit, form.stopLoss, form.stopLoss);
    return;
  }
  if (form.takeProfit > 0) {
    placeOrderOrWarn(state.activePair, exitSide, "limit", amountBase, form.takeProfit);
  }
  if (form.stopLoss > 0) {
    placeOrderOrWarn(state.activePair, exitSide, "stop_limit", amountBase, form.stopLoss, form.stopLoss);
  }
}

function submitOrder(side: "buy" | "sell"): void {
  if (orderInFlight) {
    toast("Order already in progress", "info");
    return;
  }
  const form = readOrderForm(side);
  const pair = pairById(state.activePair);
  if (form.amt <= 0) { setOrderMsg(side, "Enter amount", "err"); return; }
  const exitSide: "buy" | "sell" = side === "buy" ? "sell" : "buy";
  if (useLabMatching() && form.tpslEnabled) {
    setOrderMsg(side, "TP/SL attachments are paper-only right now", "err");
    return;
  }

  if (uiType === "market") {
    if (useLabMatching()) {
      runLockedLabOrder(async () => {
        // Refresh L2 so slip hint tracks lab MM mid (not stale pool-oracle mid).
        await refreshLabBook(state.activePair);
        const t = activeTicker();
        const slip = labMarketSlipHint(side, state.activePair, t.mid);
        if (!paperGuardsOrWarn(side, "market", form.amt, slip || t.mid)) return;
        const lab = await placeLabOrder(
          state,
          state.activePair,
          side,
          "market",
          form.amt,
          slip,
          undefined,
          labOrderOpts(),
        );
        if (!lab.ok) {
          setOrderMsg(side, lab.reason, "err");
          toast(lab.reason, "warn");
          return;
        }
        setOrderMsg(side, lab.note, "ok");
        toast(lab.note, "ok");
        if (lab.fillCount > 0) upsertAllCandles(lab.order.price || labBookMid(state.activePair) || t.mid);
        refreshAfterLabTrade();
      });
      return;
    }
    if (!paperGuardsOrWarn(side, "market", form.amt, 0)) return;
    const t = activeTicker();
    const m = matchMarket(t, side, form.amt);
    const res = executeFill(state, market!, state.activePair, side, m.avgPrice, form.amt, m.quote, "market");
    if (!res.ok) { setOrderMsg(side, res.reason, "err"); toast(res.reason, "warn"); return; }
    placeAttachedTpsl(side, form.amt, exitSide);
    setOrderMsg(side, `Filled @ ${formatPrice(m.avgPrice)} · ${res.fee.role} ${formatBps(res.fee.bps)}${form.tpslEnabled ? " · TP/SL" : ""}`, "ok");
    feeFillToast(side, form.amt, pair.base, res.fee, pair.quote);
    upsertAllCandles(m.avgPrice);
    saveState(state);
    patchLive();
    const openLeft = state.orders.some((o) => o.status === "open" || o.status === "triggered");
    activityTab = openLeft ? "orders" : "history";
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    return;
  }

  if (uiType === "limit") {
    if (useLabMatching()) {
      runLockedLabOrder(async () => {
        await refreshLabBook(state.activePair);
        if (!paperGuardsOrWarn(side, "limit", form.amt, form.price)) return;
        const mid = labBookMid(state.activePair) || midForPair(market!, state.activePair);
        const check = validateLimitOrder(side, form.price, mid, uiTif, uiPostOnly);
        if (!check.ok) {
          setOrderMsg(side, check.reason, "err");
          toast(check.reason, "warn");
          return;
        }
        const lab = await placeLabOrder(
          state,
          state.activePair,
          side,
          "limit",
          form.amt,
          form.price,
          undefined,
          labOrderOpts({ postOnly: uiPostOnly, timeInForce: uiTif }),
        );
        if (!lab.ok) {
          setOrderMsg(side, lab.reason, "err");
          toast(lab.reason, "warn");
          return;
        }
        setOrderMsg(side, lab.note, "ok");
        toast(lab.note, "ok");
        if (lab.fillCount > 0) upsertAllCandles(form.price);
        else toast("Resting on book — Account → Counterparty bot to fill", "info");
        refreshAfterLabTrade();
      });
      return;
    }
    if (!paperGuardsOrWarn(side, "limit", form.amt, form.price)) return;
    const mid = midForPair(market!, state.activePair);
    const check = validateLimitOrder(side, form.price, mid, uiTif, uiPostOnly);
    if (!check.ok) { setOrderMsg(side, check.reason, "err"); toast(check.reason, "warn"); return; }
    if (check.immediate) {
      const quote = form.price * form.amt;
      const res = executeFill(state, market!, state.activePair, side, form.price, form.amt, quote, "limit", false, true);
      if (!res.ok) { setOrderMsg(side, res.reason, "err"); return; }
      placeAttachedTpsl(side, form.amt, exitSide);
      setOrderMsg(
        side,
        `Filled @ limit (crossed mid) · ${res.fee.role} ${formatBps(res.fee.bps)}${form.tpslEnabled ? " · TP/SL" : ""}`,
        "ok",
      );
      feeFillToast(side, form.amt, pair.base, res.fee, pair.quote);
      upsertAllCandles(form.price);
      saveState(state);
      patchLive();
      activityTab = "history";
      toast("Filled instantly — see Fills tab", "info");
      refreshActivityPanel();
      return;
    }
    if (!placeOrderOrWarn(state.activePair, side, "limit", form.amt, form.price, undefined, undefined, uiTif, uiPostOnly)) return;
    placeAttachedTpsl(side, form.amt, exitSide);
    saveState(state);
    setOrderMsg(side, `Limit · ${uiTif}${form.tpslEnabled ? " · TP/SL" : ""}`, "ok");
    toast("Limit placed — Open orders", "ok");
    activityTab = "orders";
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    return;
  }

  if (uiType === "stop_limit") {
    if (useLabMatching()) {
      runLockedLabOrder(async () => {
        if (!paperGuardsOrWarn(side, "stop_limit", form.amt, form.price)) return;
        const mid = labBookMid(state.activePair) || midForPair(market!, state.activePair);
        const check = validateLimitOrder(side, form.price, mid, uiTif, uiPostOnly);
        if (!check.ok) {
          setOrderMsg(side, check.reason, "err");
          toast(check.reason, "warn");
          return;
        }
        if (uiPostOnly || uiTif !== "GTC") {
          toast("Stop-limit: TIF/Post-only applied client-side; lab trigger rests as GTC", "info");
        }
        const lab = await placeLabOrder(
          state,
          state.activePair,
          side,
          "stop_limit",
          form.amt,
          form.price,
          form.stop,
          labOrderOpts(),
        );
        if (!lab.ok) {
          setOrderMsg(side, lab.reason, "err");
          toast(lab.reason, "warn");
          return;
        }
        setOrderMsg(side, lab.note, "ok");
        toast(lab.note, "ok");
        refreshAfterLabTrade();
      });
      return;
    }
    if (!paperGuardsOrWarn(side, "stop_limit", form.amt, form.price)) return;
    const mid = midForPair(market!, state.activePair);
    const check = validateLimitOrder(side, form.price, mid, uiTif, uiPostOnly);
    if (!check.ok) { setOrderMsg(side, check.reason, "err"); toast(check.reason, "warn"); return; }
    if (!placeOrderOrWarn(state.activePair, side, "stop_limit", form.amt, form.price, form.stop, undefined, uiTif, uiPostOnly)) return;
    saveState(state);
    setOrderMsg(side, `Stop-limit · ${uiTif}`, "ok");
    activityTab = "orders";
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    return;
  }

  if (uiType === "stop_market") {
    if (useLabMatching()) {
      runLockedLabOrder(async () => {
        if (!paperGuardsOrWarn(side, "stop_market", form.amt, side === "buy" ? form.price : form.stop)) return;
        const lab = await placeLabOrder(
          state,
          state.activePair,
          side,
          "stop_market",
          form.amt,
          side === "buy" ? form.price : undefined,
          form.stop,
          labOrderOpts(),
        );
        if (!lab.ok) {
          setOrderMsg(side, lab.reason, "err");
          toast(lab.reason, "warn");
          return;
        }
        setOrderMsg(side, lab.note, "ok");
        toast(lab.note, "ok");
        refreshAfterLabTrade();
      });
      return;
    }
    if (!paperGuardsOrWarn(side, "stop_market", form.amt, side === "buy" ? form.price : form.stop)) return;
    if (!placeOrderOrWarn(state.activePair, side, "stop_market", form.amt, side === "buy" ? form.price : form.stop, form.stop)) return;
    saveState(state);
    setOrderMsg(side, "Stop-market placed", "ok");
    activityTab = "orders";
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    return;
  }

  if (uiType === "trailing_stop") {
    if (useLabMatching()) {
      const t = activeTicker();
      runLockedLabOrder(async () => {
        const lab = await placeLabOrder(
          state,
          state.activePair,
          side,
          "trailing_stop",
          form.amt,
          t.mid,
          undefined,
          { trailPct: form.trail, market },
        );
        if (!lab.ok) {
          setOrderMsg(side, lab.reason, "err");
          toast(lab.reason, "warn");
          return;
        }
        setOrderMsg(side, lab.note, "ok");
        toast(lab.note, "ok");
        refreshAfterLabTrade();
      });
      return;
    }
    const t = activeTicker();
    if (!paperGuardsOrWarn(side, "trailing_stop", form.amt, t.mid)) return;
    if (!placeOrderOrWarn(state.activePair, side, "trailing_stop", form.amt, t.mid, undefined, form.trail)) return;
    saveState(state);
    setOrderMsg(side, `Trail ${form.trail}%`, "ok");
    activityTab = "orders";
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    return;
  }

  if (uiType === "oco") {
    if (useLabMatching()) {
      runLockedLabOrder(async () => {
        if (!paperGuardsOrWarn(side, "oco", form.amt, form.tp)) return;
        if (form.slLimit > 0 && !paperGuardsOrWarn(side, "stop_limit", form.amt, form.slLimit)) return;
        const lab = await placeLabOrder(
          state,
          state.activePair,
          side,
          "oco",
          form.amt,
          form.tp,
          form.stop,
          labOrderOpts({ stopLimitDisplay: form.slLimit }),
        );
        if (!lab.ok) {
          setOrderMsg(side, lab.reason, "err");
          toast(lab.reason, "warn");
          return;
        }
        setOrderMsg(side, lab.note, "ok");
        toast(lab.note, "ok");
        refreshAfterLabTrade();
      });
      return;
    }
    if (!paperGuardsOrWarn(side, "oco", form.amt, form.tp)) return;
    if (form.slLimit > 0 && !paperGuardsOrWarn(side, "stop_limit", form.amt, form.slLimit)) return;
    if (!placeOcoOrWarn(state.activePair, side, form.amt, form.tp, form.stop, form.slLimit)) return;
    saveState(state);
    setOrderMsg(side, "OCO placed", "ok");
    activityTab = "orders";
    refreshOpenOrderChartLines();
    refreshActivityPanel();
  }
}

function wireAlertButtons(): void {
  document.getElementById("btn-alert-at-mid")?.addEventListener("click", () => {
    if (!market) return;
    const price =
      (useLabMatching() ? labBookMid(state.activePair) : 0) || midForPair(market, state.activePair);
    state.priceAlerts.push({
      id: uid(),
      pairId: state.activePair,
      price,
      fired: false,
      createdAt: Date.now(),
    });
    saveState(state);
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    toast(`Alert armed @ ${formatPrice(price)}`, "ok");
  });
  document.querySelectorAll("[data-alert-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.alertDel!;
      state.priceAlerts = state.priceAlerts.filter((a) => a.id !== id);
      saveState(state);
      refreshOpenOrderChartLines();
      refreshActivityPanel();
    });
  });
  document.querySelectorAll("[data-alert-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.alertReset!;
      const a = state.priceAlerts.find((x) => x.id === id);
      if (a) a.fired = false;
      saveState(state);
      refreshOpenOrderChartLines();
      refreshActivityPanel();
      toast("Alert re-armed", "ok");
    });
  });
}

function wireFundsFunding(): void {
  if (!market) return;
  document.querySelectorAll("[data-lab-bridge]").forEach((btn) => {
    // Re-render-safe: clone strips prior listeners (same pattern as wireLabApiButtons).
    const el = btn as HTMLElement;
    const next = el.cloneNode(true) as HTMLElement;
    el.replaceWith(next);
    next.addEventListener("click", () => {
      const asset = (next.dataset.labBridge || "USDT").toUpperCase() as "USDT" | "BTC";
      const amt = asset === "BTC" ? 0.01 : 10;
      void labBridgeCreditUi(asset, amt);
    });
  });
  document.querySelectorAll("[data-goto-account-custody]").forEach((btn) => {
    const el = btn as HTMLElement;
    const next = el.cloneNode(true) as HTMLElement;
    el.replaceWith(next);
    next.addEventListener("click", () => {
      gotoMainView("account");
      toast("Account → Custody · Deposit & withdraw", "info");
    });
  });
}

function wireCancelButtons(): void {
  document.querySelectorAll("[data-cancel]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = (b as HTMLElement).dataset.cancel!;
      if (useLabMatching()) {
        void (async () => {
          const local = state.orders.find((o) => o.id === id);
          const lab = await cancelLabOrder(state, id);
          if (lab.ok) {
            refreshAfterLabTrade();
            toast(lab.note, "info");
            return;
          }
          const reason = lab.reason.toLowerCase();
          const notOnServer =
            reason.includes("not_found") ||
            reason.includes("order_not_found") ||
            local?.source === "paper";
          // Never cancel locally on CORS/network/unreachable — that desyncs the ledger.
          if (!notOnServer) {
            toast(`Lab cancel failed: ${lab.reason}`, "warn");
            return;
          }
          cancelOrder(state, id);
          refreshOpenOrderChartLines();
          refreshActivityPanel();
          toast(
            local?.source === "paper" ? "Order cancelled (paper)" : `Lab cancel: ${lab.reason} · cancelled locally`,
            "info",
          );
        })();
        return;
      }
      cancelOrder(state, id);
      refreshOpenOrderChartLines();
      refreshActivityPanel();
      toast("Order cancelled", "info");
    });
  });
}

function submitMarketHotkey(side: "buy" | "sell"): void {
  const prev = uiType;
  uiType = "market";
  submitOrder(side);
  uiType = prev;
  toggleOrderFields();
}

function saveChartPatch(patch: Partial<typeof state>): void {
  Object.assign(state, patch);
  saveState(state);
  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
  const opts = { ...chartOpts(), drawingsLocked: state.drawingsLocked };
  if (!softRefreshChart(candles, opts)) mountChartPanel();
  else {
    // Keep mode/tool in sync without remount
    setChartMode(state.chartMode);
    setActiveDrawTool(state.activeDrawTool);
  }
  toast("Chart updated", "ok");
}

function toggleOrderFields(): void {
  document.querySelectorAll(".field-limit").forEach((el) => {
    const side = el.closest(".order-col")?.classList.contains("buy") ? "buy" : "sell";
    const hide =
      uiType === "market" ||
      uiType === "trailing_stop" ||
      (uiType === "stop_market" && side === "sell");
    el.classList.toggle("hidden", hide);
  });
  document.querySelectorAll(".field-stop").forEach((el) =>
    el.classList.toggle("hidden", uiType !== "stop_limit" && uiType !== "oco" && uiType !== "stop_market"),
  );
  document.querySelectorAll(".field-trail").forEach((el) => el.classList.toggle("hidden", uiType !== "trailing_stop"));
  document.querySelectorAll(".field-oco").forEach((el) => el.classList.toggle("hidden", uiType !== "oco"));
  document.querySelectorAll(".field-tpsl").forEach((el) => el.classList.toggle("hidden", uiType !== "market" && uiType !== "limit"));
  const tifRow = document.getElementById("tif-row");
  if (tifRow) tifRow.classList.toggle("hidden", uiType !== "limit" && uiType !== "stop_limit");
}

function setAmountPct(side: "buy" | "sell", pct: number): void {
  const amtInp = document.getElementById(`${side}-amt`) as HTMLInputElement | null;
  if (!amtInp || !market) return;
  const mid = midForPair(market, state.activePair);
  const t = activeTicker();
  let price = side === "buy" ? t.ask : t.bid;
  if (useLabMatching()) {
    const lab = getLabBookCache(state.activePair);
    if (side === "buy" && lab?.asks[0]?.price) price = lab.asks[0].price;
    if (side === "sell" && lab?.bids[0]?.price) price = lab.bids[0].price;
  }
  if (uiType === "limit" || uiType === "stop_limit" || uiType === "oco" || (uiType === "stop_market" && side === "buy")) {
    const fromInp = Number((document.getElementById(`${side}-price`) as HTMLInputElement)?.value ?? price);
    if (fromInp > 0) price = fromInp;
  }
  if (!(price > 0)) {
    amtInp.value = "0";
    return;
  }
  // Fee-aware + reserve-aware: 100%/MAX never exceeds free balance (buy quote fee / sell HMC fee).
  amtInp.value = String(
    maxOrderBaseAmount(state, market, state.activePair, side, price, uiType, pct, mid),
  );
}

/** Re-apply pct slider sizing after price / fee-mode changes so 100% stays valid. */
function resyncPctSizedAmounts(): void {
  for (const side of ["buy", "sell"] as const) {
    const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
    if (!slider) continue;
    const pct = Number(slider.value);
    if (pct > 0) setAmountPct(side, pct / 100);
  }
}

function showSettings(): void {
  document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
  const bd = document.createElement("div");
  bd.className = "modal-backdrop";
  const anchor = sanitizeOracleAnchor(state.oracleAnchor);
  bd.innerHTML = renderOracleSettingsModal(anchor);
  const modal = bd.querySelector(".modal") as HTMLElement;
  const close = () => {
    window.removeEventListener("keydown", onKey);
    untrap?.();
    bd.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.body.appendChild(bd);
  window.addEventListener("keydown", onKey);
  const untrap = modal ? trapModalFocus(modal) : undefined;
  bd.querySelector("#modal-close")?.addEventListener("click", close);
  bd.addEventListener("click", (e) => {
    if (e.target === bd) close();
  });
  bd.querySelector("#modal-save")?.addEventListener("click", () => {
    const v = sanitizeOracleAnchor(Number((bd.querySelector("#anchor-inp") as HTMLInputElement).value), 0);
    if (v > 0) {
      state.oracleAnchor = v;
      saveState(state);
      toast(`Anchor → ${v} USDT/HMC`, "ok");
      close();
      refresh();
    } else {
      toast("Anchor must be a positive number", "warn");
    }
  });
  (bd.querySelector("#anchor-inp") as HTMLInputElement | null)?.focus();
}

function syncLayoutChips(): void {
  if (isMobileLayout()) return;
  const fs = state.chartFullscreen;
  const set = (id: string, visible: boolean) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("active", visible);
    el.setAttribute("aria-pressed", visible ? "true" : "false");
  };
  set("chip-book", !fs && !layoutPrefs.bookCollapsed);
  set("chip-tools", !layoutPrefs.toolsCollapsed);
  set("chip-right", !fs && !layoutPrefs.rightCollapsed);
}

function applyLayoutToDom(): void {
  const term = document.getElementById("terminal");
  const fs = state.chartFullscreen;
  const mobile = isMobileLayout() && !fs;
  document.documentElement.classList.toggle("ex-chart-fs", fs);
  document.body.classList.toggle("ex-chart-fs", fs);
  if (term) {
    term.classList.toggle("chart-fullscreen", fs);
    if (mobile) {
      // Mobile tabs own panel visibility — desktop collapse prefs must not hide book/markets.
      term.classList.remove("book-collapsed", "right-collapsed", "tools-collapsed");
      term.style.setProperty("grid-template-columns", "1fr", "important");
    } else {
      term.classList.toggle("book-collapsed", layoutPrefs.bookCollapsed);
      term.classList.toggle("right-collapsed", layoutPrefs.rightCollapsed);
      term.classList.toggle("tools-collapsed", layoutPrefs.toolsCollapsed);
      term.style.setProperty(
        "grid-template-columns",
        terminalGridColumnsForView(layoutPrefs, fs),
        "important",
      );
    }
  }
  ensurePanelRails();
  const book = document.getElementById("col-book");
  const right = document.getElementById("col-right");
  const tools = document.getElementById("draw-tools");
  const chartBody = document.querySelector(".chart-body");
  const orderZone = document.getElementById("order-zone");
  const rails = document.getElementById("terminal-rails");
  const hideBook = mobile ? false : fs || layoutPrefs.bookCollapsed;
  const hideRight = mobile ? false : fs || layoutPrefs.rightCollapsed;
  if (book) {
    book.classList.toggle("hidden", hideBook);
    if (fs) book.style.setProperty("display", "none", "important");
    else book.style.removeProperty("display");
  }
  if (right) {
    right.classList.toggle("hidden", hideRight);
    if (fs) right.style.setProperty("display", "none", "important");
    else right.style.removeProperty("display");
  }
  if (orderZone) {
    orderZone.classList.toggle("hidden", fs);
    if (fs) orderZone.style.setProperty("display", "none", "important");
    else orderZone.style.removeProperty("display");
  }
  if (rails) {
    // Rails stay in DOM; CSS hides them in fullscreen. Never leave .hidden stuck.
    rails.classList.remove("hidden");
    rails.style.removeProperty("display");
    if (fs) rails.style.setProperty("display", "none", "important");
  }
  if (tools) {
    const hideToolsMobile = isMobileLayout() && !mobileToolsOpen;
    const hideToolsDesktop = !isMobileLayout() && layoutPrefs.toolsCollapsed;
    const hideTools = fs || hideToolsMobile || hideToolsDesktop;
    tools.classList.toggle("hidden", hideTools);
    if (fs) tools.style.setProperty("display", "none", "important");
    else tools.style.removeProperty("display");
  }
  if (chartBody) {
    chartBody.classList.toggle("tools-collapsed", !isMobileLayout() && layoutPrefs.toolsCollapsed);
  }
  // Expand rails: desktop only — mobile uses topbar tools toggle.
  syncExpandRail("btn-expand-book", !fs && !isMobileLayout() && layoutPrefs.bookCollapsed);
  syncExpandRail("btn-expand-right", !fs && !isMobileLayout() && layoutPrefs.rightCollapsed);
  syncExpandRail("btn-expand-tools", !fs && !isMobileLayout() && layoutPrefs.toolsCollapsed);
  syncFullscreenButton();
  syncLayoutChips();
  scheduleChartResize();
}

/** Re-inject expand rails if a soft fullscreen path removed them from the tree. */
function ensurePanelRails(): void {
  const term = document.getElementById("terminal");
  if (!term) return;
  let rails = document.getElementById("terminal-rails");
  if (!rails) {
    rails = document.createElement("div");
    rails.id = "terminal-rails";
    rails.className = "terminal-rails";
    rails.innerHTML =
      renderPanelRail("left", "btn-expand-book", "Book", "Show order book") +
      renderPanelRail("right", "btn-expand-right", "Mkts", "Show markets panel");
    term.appendChild(rails);
  } else {
    if (!document.getElementById("btn-expand-book")) {
      rails.insertAdjacentHTML(
        "afterbegin",
        renderPanelRail("left", "btn-expand-book", "Book", "Show order book"),
      );
    }
    if (!document.getElementById("btn-expand-right")) {
      rails.insertAdjacentHTML(
        "beforeend",
        renderPanelRail("right", "btn-expand-right", "Mkts", "Show markets panel"),
      );
    }
  }
  const chartBody = document.querySelector(".chart-body");
  if (chartBody && !document.getElementById("btn-expand-tools")) {
    chartBody.insertAdjacentHTML(
      "afterbegin",
      renderPanelRail("tools", "btn-expand-tools", "Tools", "Show drawing tools"),
    );
  }
}

function setMobileToolsOpen(open?: boolean): void {
  if (!isMobileLayout()) {
    mobileToolsOpen = false;
    return;
  }
  mobileToolsOpen = open === undefined ? !mobileToolsOpen : open;
  const term = document.getElementById("terminal");
  term?.classList.toggle("mobile-tools-open", mobileToolsOpen);
  const btn = document.getElementById("btn-mobile-tools");
  btn?.classList.toggle("active", mobileToolsOpen);
  btn?.setAttribute("aria-pressed", mobileToolsOpen ? "true" : "false");
  applyLayoutToDom();
  scheduleChartResize();
}

function syncExpandRail(id: string, show: boolean): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (isMobileLayout()) {
    el.classList.remove("is-visible");
    el.style.removeProperty("display");
    return;
  }
  el.classList.toggle("is-visible", show);
  if (show) {
    el.style.setProperty("display", "flex", "important");
  } else {
    el.style.removeProperty("display");
  }
}

function syncFullscreenButton(): void {
  const btn = document.getElementById("btn-fullscreen");
  if (!btn) return;
  const on = state.chartFullscreen;
  btn.title = on ? "Exit fullscreen" : "Fullscreen";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.classList.toggle("active", on);
  btn.innerHTML = on ? Ico.minimize() : Ico.maximize();
}

function scheduleChartResize(): void {
  if (!chartMounted) return;
  requestAnimationFrame(() => {
    resizeChart();
    resizeSecondaryCharts();
    requestAnimationFrame(() => {
      resizeChart();
      resizeSecondaryCharts();
    });
  });
}

/** Soft chart focus mode — no full remount (full render was blanking LWC). */
function setChartFullscreen(on: boolean): void {
  if (state.chartFullscreen === on) {
    applyLayoutToDom();
    return;
  }
  state.chartFullscreen = on;
  saveState(state);
  applyLayoutToDom();
  toast(on ? "Chart fullscreen — Esc to exit" : "Fullscreen off", "info");
}

function toggleChartFullscreen(): void {
  setChartFullscreen(!state.chartFullscreen);
}

function wirePanelResize(handleId: string, side: "book" | "right"): void {
  if (!mobilePanelResizeEnabled()) return;
  const handle = document.getElementById(handleId);
  if (!handle) return;
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === "book" ? layoutPrefs.bookWidth : layoutPrefs.rightWidth;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const next = side === "book" ? startW + dx : startW - dx;
      layoutPrefs = setPanelWidth(layoutPrefs, side, next);
      applyLayoutToDom();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("resizing-panels");
      saveLayoutPrefs(layoutPrefs);
    };
    document.body.classList.add("resizing-panels");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function wireLayoutPanels(): void {
  const term = document.getElementById("terminal");
  if (!term || term.dataset.layoutWired === "1") return;
  term.dataset.layoutWired = "1";
  const collapseBook = () => {
    layoutPrefs = togglePanelCollapsed(layoutPrefs, "book");
    saveLayoutPrefs(layoutPrefs);
    applyLayoutToDom();
  };
  const collapseRight = () => {
    layoutPrefs = togglePanelCollapsed(layoutPrefs, "right");
    saveLayoutPrefs(layoutPrefs);
    applyLayoutToDom();
  };
  const collapseTools = () => {
    if (isMobileLayout()) {
      setMobileToolsOpen();
      return;
    }
    layoutPrefs = togglePanelCollapsed(layoutPrefs, "tools");
    saveLayoutPrefs(layoutPrefs);
    applyLayoutToDom();
  };
  // Buttons are recreated on render — bind via terminal delegation so collapse works once.
  term.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement | null)?.closest?.("button") as HTMLElement | null;
    if (!t) return;
    const panel = t.dataset.panel;
    if (panel === "book" || t.id === "btn-collapse-book" || t.id === "btn-expand-book") collapseBook();
    else if (panel === "right" || t.id === "btn-collapse-right" || t.id === "btn-expand-right") collapseRight();
    else if (panel === "tools" || t.id === "btn-collapse-tools" || t.id === "btn-expand-tools") collapseTools();
  });
  wirePanelResize("resize-book", "book");
  wirePanelResize("resize-right", "right");
}

function syncMobileChrome(mp: MobilePanel): void {
  const mobile = isMobileLayout();
  const root = document.documentElement;
  if (mobile) root.setAttribute("data-mobile-panel", mp);
  else root.removeAttribute("data-mobile-panel");
  document.getElementById("terminal")?.setAttribute("data-mobile-panel", mp);
  const bar = document.getElementById("mobile-chart-trade-bar");
  if (bar) {
    const onChart = mp === "chart" && mobile;
    bar.hidden = !onChart;
    bar.setAttribute("aria-hidden", onChart ? "false" : "true");
  }
}

function switchMobilePanel(mp: MobilePanel, opts?: { tradeSide?: "buy" | "sell" }): void {
  if (opts?.tradeSide) {
    saveMobileTradeSide(opts.tradeSide);
    const dual = document.getElementById("dual-order");
    if (dual) dual.setAttribute("data-mobile-side", opts.tradeSide);
    wireMobileTradeSide();
  }
  if (!mp || mp === mobilePanel) {
    syncMobileChrome(mobilePanel);
    return;
  }
  if (mp !== "chart") setMobileToolsOpen(false);
  mobilePanel = mp;
  saveMobilePanel(mp);
  document.getElementById("terminal")?.setAttribute("data-mobile-panel", mp);
  syncMobileTabAria(mp);
  syncMobileChrome(mp);
  applyLayoutToDom();
  if (mp === "chart") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (chartMounted) resizeChart();
        else mountChartPanel();
      });
    });
  }
  if (mp === "trade") {
    wireMobileTradeSide();
    document.getElementById("order-zone")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

let mobilePanelsDelegated = false;

function syncMobileTabAria(mp: MobilePanel): void {
  document.querySelectorAll("#mobile-panel-tabs .mp-tab").forEach((b) => {
    const on = (b as HTMLElement).dataset.mp === mp;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.setAttribute("tabindex", on ? "0" : "-1");
  });
}

function wireMobilePanels(): void {
  if (!mobilePanelsDelegated) {
    mobilePanelsDelegated = true;
    app.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement).closest("#mobile-panel-tabs .mp-tab") as HTMLElement | null;
      if (!tab) return;
      const mp = tab.dataset.mp as MobilePanel;
      if (mp) switchMobilePanel(mp);
    });
    app.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("#mobile-chart-trade-bar [data-goto-trade]") as HTMLElement | null;
      if (!btn) return;
      const side = btn.dataset.gotoTrade as "buy" | "sell";
      switchMobilePanel("trade", { tradeSide: side });
    });
    app.addEventListener("click", (e) => {
      if (!mobileToolsOpen || !isMobileLayout()) return;
      const t = e.target as HTMLElement;
      if (!t.closest(".chart-body")) return;
      if (t.closest(".draw-tools") || t.closest("#btn-mobile-tools")) return;
      if (t.closest(".chart-topbar") || t.closest(".ind-tabs")) return;
      setMobileToolsOpen(false);
    });
  }
  syncMobileTabAria(mobilePanel);
  syncMobileChrome(mobilePanel);
}

function wireMobileTradeSide(): void {
  if (!isMobileLayout()) return;
  const tabs = Array.from(document.querySelectorAll("#trade-side-toggle .ts")) as HTMLElement[];
  if (!tabs.length) return;
  setMobileTradeSide(loadMobileTradeSide());
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setMobileTradeSide((tab.dataset.mobileSide as "buy" | "sell") || "buy"));
  });
}

function wireOracleRetry(): void {
  document.getElementById("btn-oracle-retry")?.addEventListener("click", () => {
    toast("Refreshing oracle…", "info");
    void refresh();
  });
}

function patchMarketRowsInPlace(): void {
  document.querySelectorAll<HTMLElement>(".market-row[data-pair]").forEach((row) => {
    const pid = row.dataset.pair as PairId | undefined;
    if (!pid) return;
    const q = pairQuote(pid);
    const px = row.querySelector(".mr-px");
    const ch = row.querySelector(".mr-chg");
    if (px) px.textContent = q.mid > 0 ? formatPriceCompact(q.mid) : "—";
    if (ch) {
      ch.textContent = formatPct(q.changePct);
      ch.className = `mono mr-chg ${quoteToneClass(q.tone)}`;
    }
  });
}

function patchOracleStatus(): void {
  const panel = document.querySelector(".markets-panel");
  if (panel && patchOracleStatusDom(panel, oracleMeta)) return;
  const existing = document.querySelector(".markets-panel .oracle-status");
  if (!existing) return;
  existing.outerHTML = renderOracleStatusHtml(oracleMeta);
  wireOracleRetry();
}

function tickOracleAge(): void {
  patchOracleStatus();
}

function wireEvents(): void {
  document.getElementById("btn-announce-x")?.addEventListener("click", () => {
    announceDismissed = true;
    sessionStorage.setItem("hackme-ex-announce-dismiss", "1");
    document.getElementById("announce-bar")?.remove();
  });

  document.getElementById("link-node-wallet")?.addEventListener("click", (ev) => {
    if (!postHubGotoTab("wallet")) return;
    ev.preventDefault();
    showSystemDrop(false);
  });

  document.getElementById("btn-mobile-pair")?.addEventListener("click", () => {
    if (!isMobileLayout()) return;
    switchMobilePanel("markets");
    document.getElementById("market-search")?.focus();
  });

  wireLayoutPanels();
  applyLayoutToDom();
  wireMobilePanels();
  wireMobileTradeSide();
  wireOracleRetry();

  document.getElementById("btn-mobile-tools")?.addEventListener("click", () => setMobileToolsOpen());

  document.getElementById("btn-reset")?.addEventListener("click", () => {
    if (useLabMatching()) {
      toast("Reset blocked during lab session — logout first (avoids ledger desync)", "warn");
      return;
    }
    if (!confirm("Reset paper wallet, orders, trades and chart state?")) return;
    state = resetDemo();
    publicTape = [];
    chartMounted = false;
    toast("Demo wallet reset", "info");
    render();
    refresh();
  });

  document.getElementById("btn-export-demo")?.addEventListener("click", () => {
    showSystemDrop(false);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadText(`hackme-exchange-demo-${stamp}.json`, exportDemoJson(state));
    toast("State exported", "ok");
  });
  document.getElementById("btn-import-demo")?.addEventListener("click", () => {
    showSystemDrop(false);
    document.getElementById("import-demo-file")?.click();
  });
  document.getElementById("import-demo-file")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (useLabMatching()) {
      toast("Import blocked during lab session — logout first (avoids ledger desync)", "warn");
      (e.target as HTMLInputElement).value = "";
      return;
    }
    if (file.size > 2_000_000) {
      toast("Import too large (max 2MB)", "warn");
      (e.target as HTMLInputElement).value = "";
      return;
    }
    if (!confirm(`Import demo state from ${file.name}? This replaces wallet, orders, and trades.`)) {
      (e.target as HTMLInputElement).value = "";
      return;
    }
    try {
      const raw = await file.text();
      state = parseDemoImport(raw);
      saveState(state);
      publicTape = [];
      chartMounted = false;
      toast("State imported", "ok");
      render();
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed", "warn");
    }
    (e.target as HTMLInputElement).value = "";
  });

  document.getElementById("btn-settings")?.addEventListener("click", () => {
    showSystemDrop(false);
    showSettings();
  });
  document.getElementById("btn-oracle-anchor")?.addEventListener("click", () => showSettings());
  document.getElementById("btn-sync-node-header")?.addEventListener("click", () => {
    showSystemDrop(false);
    void syncFromNode();
  });
  document.getElementById("btn-sync-node")?.addEventListener("click", () => void syncFromNode());
  // Lab Account buttons are wired only from the account render branch (clone-safe).

  document.getElementById("btn-system-status")?.addEventListener("click", (e) => {
    e.stopPropagation();
    showSystemDrop();
  });
  document.getElementById("sys-backdrop")?.addEventListener("click", () => showSystemDrop(false));
  document.getElementById("sys-drop")?.addEventListener("click", (e) => e.stopPropagation());
  document.querySelectorAll("#btn-theme-hub, #btn-theme-wallet").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = (btn as HTMLElement).dataset.theme;
      if (next !== "hub" && next !== "wallet") return;
      theme = next;
      saveTheme(theme);
      showSystemDrop(false);
      toast(theme === "hub" ? "Theme → Hub" : "Theme → Wallet", "ok");
      render();
    });
  });

  document.querySelectorAll("#main-nav .nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      gotoMainView((btn as HTMLElement).dataset.view as MainView);
    });
  });

  document.getElementById("market-search")?.addEventListener("input", (e) => {
    marketSearch = (e.target as HTMLInputElement).value;
    const list = document.getElementById("markets-list");
    if (list) list.innerHTML = renderMarketsList();
    wireMarketRows();
  });

  document.querySelectorAll("#lane-tabs .lane-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMarketLane((btn as HTMLElement).dataset.lane ?? "all");
    });
  });

  wireMarketRows();

  if (state.mainView === "convert") {
    wireConvertDesk();
  }

  if (!hotkeysWired) {
    document.addEventListener("keydown", onKeydown);
    hotkeysWired = true;
  }

  if (state.mainView !== "spot") return;

  const setTf = (tf: Timeframe) => {
    state.activeTf = tf;
    saveState(state);
    syncRouteHash();
    mountChartPanel();
    document.querySelectorAll(".tfq").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tf === tf));
    const more = document.getElementById("tf-more") as HTMLSelectElement | null;
    if (more) more.value = tf;
  };

  document.querySelectorAll(".tfq").forEach((btn) => {
    btn.addEventListener("click", () => setTf((btn as HTMLElement).dataset.tf as Timeframe));
  });
  document.getElementById("tf-more")?.addEventListener("change", (e) => {
    setTf((e.target as HTMLSelectElement).value as Timeframe);
  });

  document.querySelectorAll("#chart-type-drop .cm, #chart-type-drop button[data-mode]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.chartMode = (btn as HTMLElement).dataset.mode as ChartMode;
      saveState(state);
      showChartTypeDrop(false);
      mountChartPanel();
    });
  });

  document.getElementById("btn-chart-type")?.addEventListener("click", (e) => {
    e.stopPropagation();
    showChartTypeDrop();
  });
  document.getElementById("chart-type-backdrop")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (Date.now() - chartTypeDropOpenedAt < 320) return;
    showChartTypeDrop(false);
  });
  document.getElementById("chart-type-drop")?.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  document.getElementById("btn-mobile-chart-more")?.addEventListener("click", (e) => {
    e.stopPropagation();
    showChartMoreDrop();
  });
  document.getElementById("chart-more-backdrop")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (Date.now() - chartMoreDropOpenedAt < 320) return;
    showChartMoreDrop(false);
  });
  document.getElementById("chart-more-drop")?.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });
  document.querySelectorAll("#chart-more-drop [data-chart-more]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.chartMore;
      showChartMoreDrop(false);
      if (action === "indicators") showIndicatorModal(state, (patch) => saveChartPatch(patch));
      else if (action === "overlays") {
        const anchor = document.getElementById("btn-mobile-chart-more");
        if (anchor) {
          anchor.classList.add("active");
          showOverlayMenu(
            state,
            anchor,
            (patch) => {
              Object.assign(state, patch);
              saveState(state);
              applyOverlays(
                state.chartOverlays,
                state.orders.filter((o) => o.pairId === state.activePair),
                activeTicker().mid,
              );
            },
            () => anchor.classList.remove("active"),
          );
        }
      } else if (action === "style") showChartStyleModal(state, (patch) => saveChartPatch(patch));
      else if (action === "goto") {
        showGoToDateModal((ts) => {
          scrollToTimestamp(ts);
          toast("Jumped to date", "info");
        });
      } else if (action === "screenshot") {
        chartScreenshot();
        toast("Screenshot saved", "ok");
      }
    });
  });

  document.getElementById("btn-indicators")?.addEventListener("click", () => {
    showIndicatorModal(state, (patch) => saveChartPatch(patch));
  });

  document.getElementById("btn-goto-date")?.addEventListener("click", () => {
    showGoToDateModal((ts) => { scrollToTimestamp(ts); toast("Jumped to date", "info"); });
  });

  document.querySelectorAll("#ind-tabs .ind").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.ind as IndicatorId;
      state.chartSettings.indicators[id] = !state.chartSettings.indicators[id];
      saveState(state);
      btn.classList.toggle("active", state.chartSettings.indicators[id]);
      const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
      const opts = { ...chartOpts(), drawingsLocked: state.drawingsLocked };
      if (!softRefreshChart(candles, opts)) mountChartPanel();
    });
  });

  document.querySelectorAll("#draw-tools .dt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.dt!;
      if (id === "clear") {
        if (state.drawingsLocked) {
          toast("Drawings locked", "warn");
          return;
        }
        const selected = getSelectedDrawingId();
        if (selected) {
          state.drawings = state.drawings.filter((d) => d.id !== selected);
          deleteSelectedDrawing();
          saveState(state);
          refreshDrawings(state.drawings.filter((d) => d.pairId === state.activePair));
          toast("Drawing removed", "info");
          return;
        }
        state.drawings = state.drawings.filter((d) => d.pairId !== state.activePair);
        saveState(state);
        clearDrawingSelection();
        refreshDrawings([]);
        toast("Drawings cleared", "info");
        return;
      }
      if (id === "lock") {
        state.drawingsLocked = !state.drawingsLocked;
        saveState(state);
        btn.classList.toggle("active", state.drawingsLocked);
        setDrawingsLockedFlag(state.drawingsLocked);
        toast(state.drawingsLocked ? "Drawings locked" : "Drawings unlocked", "info");
        return;
      }
      state.activeDrawTool = id as DrawTool;
      saveState(state);
      setActiveDrawTool(state.activeDrawTool);
      document.querySelectorAll("#draw-tools .dt").forEach((b) => {
        const bid = (b as HTMLElement).dataset.dt;
        if (bid === "lock") b.classList.toggle("active", state.drawingsLocked);
        else b.classList.toggle("active", bid === id);
      });
    });
  });

  document.getElementById("btn-chart-settings")?.addEventListener("click", () => {
    showChartStyleModal(state, (patch) => saveChartPatch(patch));
  });
  document.getElementById("btn-overlays")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.classList.add("active");
    showOverlayMenu(state, el, (patch) => {
      Object.assign(state, patch);
      saveState(state);
      applyOverlays(state.chartOverlays, state.orders.filter((o) => o.pairId === state.activePair), activeTicker().mid);
    }, () => el.classList.remove("active"));
  });
  document.getElementById("btn-screenshot")?.addEventListener("click", () => { chartScreenshot(); toast("Screenshot saved", "ok"); });
  document.getElementById("btn-fullscreen")?.addEventListener("click", () => {
    toggleChartFullscreen();
  });
  document.getElementById("btn-multi")?.addEventListener("click", (e) => {
    showMultiChartPicker(state, e.currentTarget as HTMLElement, (patch) => {
      if (patch.multiChartLayout === "4" && isMobileLayout()) {
        patch.multiChartLayout = "2v";
        patch.multiChart = true;
        toast("2×2 grid works best on desktop — using 2 vertical on mobile", "info");
      }
      Object.assign(state, patch);
      saveState(state);
      render();
    });
  });

  document.getElementById("book-group-select")?.addEventListener("change", (e) => {
    state.bookGrouping = Number((e.target as HTMLSelectElement).value);
    saveState(state);
    document.getElementById("book")!.innerHTML = renderBook();
    wireBookTabs();
  });

  wireBookTabs();

  document.querySelectorAll("#type-tabs .type").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = (btn as HTMLElement).dataset.type as OrderKind;
      const prev = uiType;
      uiType = next;
      syncOrderTypeTabs(uiType);
      toggleOrderFields();
      if ((next === "limit" || next === "stop_limit") && prev !== next) {
        applyRestingLimitPrices(spotTradeMid(), state.activePair);
      }
      updatePreview();
    });
  });
  document.getElementById("order-type-adv")?.addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value as OrderKind;
    if (!v) return;
    const prev = uiType;
    uiType = v;
    syncOrderTypeTabs(uiType);
    toggleOrderFields();
    if ((v === "limit" || v === "stop_limit") && prev !== v) {
      applyRestingLimitPrices(spotTradeMid(), state.activePair);
    }
    updatePreview();
  });

  (["buy", "sell"] as const).forEach((side) => {
    document.getElementById(`btn-${side}`)?.addEventListener("click", () => submitOrder(side));
    document.getElementById(`${side}-amt`)?.addEventListener("input", () => {
      const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
      if (slider) {
        slider.value = "0";
        syncPctMarks(side);
      }
      updatePreviewForSide(side);
    });
    document.getElementById(`${side}-price`)?.addEventListener("input", () => {
      const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
      const pct = Number(slider?.value ?? 0);
      if (pct > 0) setAmountPct(side, pct / 100);
      updatePreviewForSide(side);
    });
  });

  document.querySelectorAll("[data-avail-side]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = (btn as HTMLElement).dataset.availSide as "buy" | "sell";
      setAmountPct(side, 1);
      const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
      if (slider) slider.value = "100";
      syncPctMarks(side);
      updatePreviewForSide(side);
    });
  });

  document.querySelectorAll(".pct-slider").forEach((el) => {
    el.addEventListener("input", () => {
      const side = (el as HTMLElement).dataset.side as "buy" | "sell";
      const pct = Number((el as HTMLInputElement).value) / 100;
      setAmountPct(side, pct);
      syncPctMarks(side);
      updatePreviewForSide(side);
    });
  });

  document.querySelectorAll(".pct-marks button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = (btn as HTMLElement).dataset.side as "buy" | "sell";
      const pct = Number((btn as HTMLElement).dataset.pct);
      const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
      if (slider) slider.value = String(pct);
      setAmountPct(side, pct / 100);
      syncPctMarks(side);
      updatePreviewForSide(side);
    });
  });

  document.querySelectorAll(".quick-size button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = (btn as HTMLElement).dataset.side as "buy" | "sell";
      const qs = (btn as HTMLElement).dataset.qs!;
      const amtInp = document.getElementById(`${side}-amt`) as HTMLInputElement | null;
      if (!amtInp) return;
      if (qs === "max") {
        if (!confirm(`Set amount to MAX available ${side.toUpperCase()}? (Paper demo)`)) return;
        setAmountPct(side, 1);
        const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
        if (slider) slider.value = "100";
        syncPctMarks(side);
      } else {
        const add = Number(qs);
        const cur = Number(amtInp.value) || 0;
        amtInp.value = String(cur + add);
      }
      updatePreviewForSide(side);
    });
  });

  document.querySelectorAll("[data-tpsl-side]").forEach((el) => {
    el.addEventListener("change", () => {
      const side = (el as HTMLElement).dataset.tpslSide as "buy" | "sell";
      const fields = document.getElementById(`${side}-tpsl-fields`);
      fields?.classList.toggle("hidden", !(el as HTMLInputElement).checked);
    });
  });

  document.querySelectorAll(".btn-bbo").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = (btn as HTMLElement).dataset.bbo as "buy" | "sell";
      const t = activeTicker();
      const labLive = useLabMatching();
      const lab = labLive ? getLabBookCache(state.activePair) : null;
      if (labLive && (!lab || (!lab.bids.length && !lab.asks.length))) {
        toast("Lab book not ready", "warn");
        return;
      }
      const ask = lab?.asks[0]?.price || t.ask;
      const bid = lab?.bids[0]?.price || t.bid;
      // Resting BBO: buy→bid, sell→ask (does not instantly cross).
      const inp = document.getElementById(`${side}-price`) as HTMLInputElement;
      if (inp) inp.value = tickInputValue(side === "buy" ? bid : ask, state.activePair);
      const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
      const pct = Number(slider?.value ?? 0);
      if (pct > 0) setAmountPct(side, pct / 100);
      updatePreviewForSide(side);
    });
  });

  document.getElementById("pay-fees-hmc")?.addEventListener("change", (e) => {
    state.feeConfig.payFeesInHmc = (e.target as HTMLInputElement).checked;
    saveState(state);
    softPatchFeePayChrome();
    resyncPctSizedAmounts();
    updatePreview();
  });

  document.getElementById("order-tif")?.addEventListener("change", (e) => {
    uiTif = (e.target as HTMLSelectElement).value as TimeInForce;
    updatePreview();
  });

  document.getElementById("post-only")?.addEventListener("change", (e) => {
    uiPostOnly = (e.target as HTMLInputElement).checked;
    updatePreview();
  });

  document.querySelectorAll("#activity-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activityTab = normalizeActivityTab((btn as HTMLElement).dataset.tab);
      document.querySelectorAll("#activity-tabs button").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      document.getElementById("activity-body")!.innerHTML = renderActivityBody();
      wireCancelButtons();
      wireAlertButtons();
    });
  });

  document.getElementById("btn-open-alerts")?.addEventListener("click", () => {
    openAlertsPanel();
  });

  document.getElementById("btn-hotkeys")?.addEventListener("click", () => showHotkeysHelp());

  wireCancelButtons();
  wireAlertButtons();
  wireFundsFunding();
  syncPctMarks("buy");
  syncPctMarks("sell");

  updatePreview();
}

function openAlertsPanel(): void {
  activityTab = "alerts";
  // Uncollapse markets column if needed so Alerts tab is visible.
  if (layoutPrefs.rightCollapsed) {
    layoutPrefs = togglePanelCollapsed(layoutPrefs, "right");
    saveLayoutPrefs(layoutPrefs);
  }
  if (state.chartFullscreen) {
    setChartFullscreen(false);
  } else {
    applyLayoutToDom();
  }
  switchMobilePanel("orders");
  document.querySelectorAll("#activity-tabs button").forEach((b) => {
    const on = (b as HTMLElement).dataset.tab === "alerts";
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  const body = document.getElementById("activity-body");
  if (body) {
    body.innerHTML = renderActivityBody();
    wireAlertButtons();
  }
  document.getElementById("activity-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function wireBookTabs(): void {
  const book = document.getElementById("book");
  if (!book) return;
  if (book.dataset.bookTabsWired !== "1") {
    book.dataset.bookTabsWired = "1";
    book.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest?.(".book-view-tabs .bv") as HTMLElement | null;
      if (!btn || !book.contains(btn)) return;
      state.bookView = btn.dataset.bv as "book" | "depth";
      saveState(state);
      book.innerHTML = renderBook();
      wireBookClicks();
    });
    book.addEventListener("change", (ev) => {
      const sel = ev.target as HTMLElement | null;
      if (!sel || sel.id !== "book-group-select") return;
      state.bookGrouping = Number((sel as HTMLSelectElement).value);
      saveState(state);
      book.innerHTML = renderBook();
      wireBookClicks();
    });
  }
  wireBookClicks();
}

function setMarketLane(lane: string): void {
  marketLane = lane || "all";
  document.querySelectorAll("#lane-tabs .lane-tab").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.lane === marketLane);
  });
  const list = document.getElementById("markets-list");
  if (list) list.innerHTML = renderMarketsList();
  wireMarketRows();
}

function wireMarketRows(): void {
  document.querySelectorAll(".market-row").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("star")) return;
      const pair = (btn as HTMLElement).dataset.pair as PairId;
      if (isMobileLayout()) {
        mobilePanel = "trade";
        saveMobilePanel("trade");
      }
      state.activePair = pair;
      pushRecentPair(pair);
      saveState(state);
      ensurePublicTape(true);
      chartMounted = false;
      syncRouteHash();
      render();
    });
  });
  document.querySelectorAll(".star").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(state, (btn as HTMLElement).dataset.star as PairId);
      document.getElementById("markets-list")!.innerHTML = renderMarketsList();
      wireMarketRows();
    });
  });
  document.querySelectorAll("[data-lane-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMarketLane((btn as HTMLElement).dataset.laneJump ?? "all");
    });
  });
  document.querySelectorAll("[data-recent-pair]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pair = (btn as HTMLElement).dataset.recentPair as PairId;
      state.activePair = pair;
      pushRecentPair(pair);
      saveState(state);
      ensurePublicTape(true);
      chartMounted = false;
      syncRouteHash();
      render();
    });
  });
}

function showHotkeysHelp(): void {
  if (document.getElementById("hotkeys-overlay")) return;
  const el = document.createElement("div");
  el.id = "hotkeys-overlay";
  el.className = "hotkeys-overlay";
  el.innerHTML = `
    <div class="hotkeys-card glass" role="dialog" aria-modal="true" aria-labelledby="hotkeys-title">
      <div class="hotkeys-head">
        <h3 id="hotkeys-title">Shortcuts</h3>
        <button type="button" class="btn-sm" id="hotkeys-close" aria-label="Close">Esc</button>
      </div>
      <ul class="hotkeys-list mono">
        <li><kbd>Shift</kbd>+<kbd>B</kbd> Market buy</li>
        <li><kbd>Shift</kbd>+<kbd>S</kbd> Market sell</li>
        <li><kbd>Esc</kbd> Cancel all open / close help</li>
        <li><kbd>1</kbd>–<kbd>0</kbd> Timeframes</li>
        <li><kbd>C</kbd> / <kbd>L</kbd> / <kbd>A</kbd> Candles / Line / Area</li>
        <li><kbd>F</kbd> Chart fullscreen · Esc exits</li>
        <li><kbd>Alt</kbd>+<kbd>R</kbd> Reset chart view</li>
        <li><kbd>Del</kbd> Remove selected drawing</li>
        <li><kbd>?</kbd> This help</li>
        <li>Click book row → fill Limit price</li>
        <li>BBO → best bid/offer into price</li>
        <li>Convert → flip · Max · % · live fee</li>
      </ul>
      <p class="muted small">Tip: collapse Book / Markets rails to widen the chart when you need focus.</p>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener("click", (ev) => {
    if (ev.target === el) close();
  });
  document.getElementById("hotkeys-close")?.addEventListener("click", close);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "?" || (e.shiftKey && e.key === "/")) {
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
    if (document.getElementById("hotkeys-overlay")) {
      document.getElementById("hotkeys-overlay")?.remove();
    } else {
      showHotkeysHelp();
    }
    return;
  }

  if (e.key === "Escape" && document.getElementById("hotkeys-overlay")) {
    e.preventDefault();
    document.getElementById("hotkeys-overlay")?.remove();
    return;
  }

  if (state.mainView !== "spot") return;
  if (isTypingTarget(e.target)) return;

  if ((e.key === "Delete" || e.key === "Backspace") && getSelectedDrawingId()) {
    if (state.drawingsLocked) {
      toast("Drawings locked", "warn");
      return;
    }
    e.preventDefault();
    const id = deleteSelectedDrawing();
    if (id) {
      state.drawings = state.drawings.filter((d) => d.id !== id);
      saveState(state);
      refreshDrawings(state.drawings.filter((d) => d.pairId === state.activePair));
      toast("Drawing removed", "info");
    }
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    if (document.querySelector(".modal-backdrop")) {
      document.querySelector(".modal-backdrop")?.remove();
      return;
    }
    if (state.chartFullscreen) {
      setChartFullscreen(false);
      return;
    }
    if (getSelectedDrawingId()) {
      clearDrawingSelection();
      return;
    }
    const n = cancelAllOpenOrders(state);
    document.getElementById("activity-body")!.innerHTML = renderActivityBody();
    wireCancelButtons();
    refreshOrderLines(state.orders.filter((o) => o.pairId === state.activePair));
    toast(n ? `Cancelled ${n} order(s)` : "No open orders", "info");
    return;
  }

  if (e.key === "f" || e.key === "F") {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    toggleChartFullscreen();
    return;
  }

  if (e.shiftKey && (e.key === "B" || e.key === "b")) {
    e.preventDefault();
    submitMarketHotkey("buy");
    return;
  }
  if (e.shiftKey && (e.key === "S" || e.key === "s")) {
    e.preventDefault();
    submitMarketHotkey("sell");
    return;
  }

  if (e.key >= "1" && e.key <= "9") {
    state.activeTf = TIMEFRAMES[Number(e.key) - 1];
    saveState(state);
    mountChartPanel();
    document.querySelectorAll("#tf-tabs .tf").forEach((b, i) => b.classList.toggle("active", TIMEFRAMES[i] === state.activeTf));
  }
  if (e.key === "0") {
    state.activeTf = TIMEFRAMES[9];
    saveState(state);
    mountChartPanel();
    document.querySelectorAll("#tf-tabs .tf").forEach((b, i) => b.classList.toggle("active", TIMEFRAMES[i] === state.activeTf));
  }
  if (e.key === "c" || e.key === "C") {
    state.chartMode = "candles";
    saveState(state);
    setChartMode("candles");
    document.querySelectorAll("#chart-mode-tabs .cm").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.mode === "candles"));
  }
  if (e.key === "l" || e.key === "L") {
    state.chartMode = "line";
    saveState(state);
    setChartMode("line");
    document.querySelectorAll("#chart-mode-tabs .cm").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.mode === "line"));
  }
  if (e.key === "a" || e.key === "A") {
    state.chartMode = "area";
    saveState(state);
    setChartMode("area");
    document.querySelectorAll("#chart-mode-tabs .cm").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.mode === "area"));
  }
  if (e.key === "r" || e.key === "R") {
    if (e.altKey) {
      e.preventDefault();
      resetChartView();
      toast("Chart view reset", "info");
    }
  }
}

function upsertAllCandles(mid: number): void {
  if (!state.candles[state.activePair]) return;
  const prev = prevMids[state.activePair];
  const next = applyMidToPairCandles(state.candles[state.activePair]!, state.activePair, mid, prev);
  state.candles[state.activePair] = next;
  prevMids[state.activePair] = mid;
}

function microTickPrices(): void {
  if (!market || state.mainView !== "spot") return;
  let changed = false;
  bookPhase += 0.38;
  liveTickN += 1;
  // Breathe around operator refs; keep HMC/SUP/BTC crosses coherent every tick.
  market = applyLivePaperMids(market, state.oracleAnchor, DEFAULT_SUP_REFERENCE_MID);
  const labLive = useLabMatching();
  for (const p of PAIRS) {
    const oracleTarget = midForPair(market, p.id);
    const labMid = labLive ? labBookMid(p.id) : 0;
    const target = labMid > 0 ? labMid : oracleTarget;
    const prev = prevMids[p.id] ?? target;
    // Lab: raw book mid. Paper: soft blend so candle tip does not teleport every 700ms.
    const displayMid = labMid > 0 ? labMid : prev * 0.72 + target * 0.28;
    if (!state.candles[p.id]) state.candles[p.id] = {};
    state.candles[p.id] = applyMidToPairCandles(state.candles[p.id]!, p.id, displayMid, prev);
    prevMids[p.id] = displayMid;
    if (tickers[p.id]) {
      if (labLive && labMid > 0) {
        tickers[p.id] = { ...tickers[p.id]!, mid: labMid };
      } else {
        tickers[p.id] = { ...tickers[p.id]!, mid: displayMid, bid: displayMid * 0.9995, ask: displayMid * 1.0005 };
      }
    }
    changed = true;
  }
  if (!labLive && liveTickN % 2 === 0) {
    publicTape = appendSyntheticTrade(publicTape, activeTicker());
  }
  // Match resting paper orders against live blended mids every ~1.4s.
  if (changed && liveTickN % 2 === 0) {
    const notes = settleOpenOrdersFromTickers(true);
    if (notes.length) {
      /* activity + chart already refreshed */
    }
  }
  if (!changed || !chartMounted) return;

  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
  const last = candles[candles.length - 1];
  const opts = chartOpts();
  if (chartNeedsFullReplace || !last) {
    setCandleData(candles, opts, { scrollToLive: chartNeedsFullReplace });
    chartNeedsFullReplace = false;
  } else if (!updateLastCandle(last, opts)) {
    setCandleData(candles, opts, { preserveLogicalRange: true });
  }
  if (state.multiChartLayout !== "1") {
    const n = state.multiChartLayout === "4" ? 4 : 2;
    const focused = getFocusedChartPaneId();
    const mobileSkip = isMobileLayout() && state.multiChartLayout === "4";
    for (let i = 2; i <= n; i++) {
      const hostId = `chart-host-${i}`;
      if (mobileSkip && focused !== hostId && liveTickN % 3 !== 0) continue;
      const tf = paneTf(i);
      const pid = panePair(i);
      const c2 = state.candles[pid]?.[tf] ?? [];
      if (c2.length) updateSecondaryChart(c2, hostId);
    }
  }
  const quote = activePairQuote();
  updateLivePriceHud(quote.mid, quote.tone !== "down", candleCountdown(state.activeTf));
  evaluatePriceAlerts(quote.mid);
  patchTickerBar(quote);
  const tape = document.getElementById("tape");
  if (tape) tape.innerHTML = renderTape();
  patchMobileTradeTape();
  // Book DOM is heavier — refresh every ~2.1s at 700ms tick (paper synthetic only;
  // lab book updates via labBookTimer / fill sync).
  if (!useLabMatching() && liveTickN % 3 === 0) {
    const book = document.getElementById("book");
    if (book) {
      book.innerHTML = renderBook();
      wireBookTabs();
    }
  }
  if (liveTickN % 2 === 0) {
    patchMarketRowsInPlace();
  }
  if (liveTickN % 30 === 0) {
    const list = document.getElementById("markets-list");
    if (list) {
      list.innerHTML = renderMarketsList();
      wireMarketRows();
    }
  }
}

async function refresh(): Promise<void> {
  if (refreshInFlight) {
    await refreshInFlight;
    return;
  }
  const myGen = ++refreshGen;
  refreshInFlight = (async () => {
  markPerf("oracle-refresh-start");
  const prevMarket = market;
  const prevLive = poolLive;

  const raceMs = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> =>
    Promise.race([
      p.then((v) => v as T | undefined),
      new Promise<undefined>((resolve) => {
        window.setTimeout(() => resolve(undefined), ms);
      }),
    ]);

  let m = prevMarket;
  let source: "live" | "fallback" = oracleMeta.source === "live" ? "live" : "fallback";
  let live = prevLive;

  // First paint uses pending placeholders. Do NOT race-discard that warm-up —
  // a 1.8s race was keeping offline zeros while /pool-proxy answered ~200ms later.
  const warming =
    oracleMeta.fetchedAt === 0 ||
    !prevLive ||
    prevLive.status === "pending" ||
    (prevLive.status === "offline" && prevLive.poolGh === 0 && prevLive.blockHeight === 0);

  const marketP = fetchMarket(state.oracleAnchor);
  const liveP = fetchPoolLive();
  const [mRes, liveRes] = warming
    ? await Promise.all([marketP, liveP])
    : await Promise.all([raceMs(marketP, 2_500), raceMs(liveP, 2_500)]);

  if (myGen !== refreshGen) return;

  if (mRes) {
    // Don't let a single failed poll overwrite live mids with boot fallback (chart cliff).
    if (mRes.source === "live" || !market || oracleMeta.source !== "live") {
      m = mRes.market;
      source = mRes.source;
    } else {
      // Keep newest live — not the start-of-call snapshot (overlapping refresh race).
      m = market;
      source = "live";
    }
  } else if (!m) {
    m = applyLivePaperMids(localFallbackMarket(state.oracleAnchor), state.oracleAnchor);
    source = "fallback";
  } else if (warming) {
    source = "fallback";
  }
  // else keep previous live mids on a slow tick

  if (liveRes) {
    if (liveRes.status === "ok" || !poolLive || poolLive.status !== "ok") {
      live = liveRes;
    } else {
      live = poolLive;
    }
  } else if (!live || live.status === "pending") {
    live = offlinePoolLive();
  }
  // else keep previous live telemetry on a slow tick

  const firstLiveAfterBoot =
    warming && source === "live" && (oracleMeta.fetchedAt === 0 || oracleMeta.source === "fallback");

  market = m!;
  poolLive = live!;
  oracleMeta = { source, fetchedAt: Date.now(), poolStatus: live!.status };
  if (firstLiveAfterBoot) {
    reseedCandlesFromMarket(state, market);
    chartNeedsFullReplace = true;
  } else {
    ensureCandles(state, market);
  }
  seedEquitySnapshots(state, market);
  snapshotEquity(state, market);

  for (const p of PAIRS) {
    const tk = tickerFromMarket(market, p.id);
    tk.source = source;
    const c15 = state.candles[p.id]?.["15m"] ?? [];
    const s = stats24h(c15, "15m");
    tk.change24hPct = s.changePct;
    tk.high24h = s.high;
    tk.low24h = s.low;
    tk.volume24hBase = s.vol;
    const labMid = useLabMatching() ? labBookMid(p.id) : 0;
    const displayMid = labMid > 0 ? labMid : midForPair(market, p.id);
    if (labMid > 0) {
      // Preserve lab L2 mid/bid/ask if we already have a book; only refresh 24h stats fields.
      const prevTk = tickers[p.id];
      if (prevTk && prevTk.bid > 0 && prevTk.ask > 0) {
        tickers[p.id] = {
          ...tk,
          mid: labMid,
          bid: prevTk.bid,
          ask: prevTk.ask,
        };
      } else {
        tickers[p.id] = { ...tk, mid: labMid };
      }
    } else {
      tickers[p.id] = tk;
    }
    const mid = displayMid;
    const prev = firstLiveAfterBoot ? undefined : prevMids[p.id];
    if (!firstLiveAfterBoot) {
      if (!state.candles[p.id]) state.candles[p.id] = {};
      state.candles[p.id] = applyMidToPairCandles(state.candles[p.id]!, p.id, mid, prev);
    }
    prevMids[p.id] = mid;
  }
  settleOpenOrdersFromTickers(true);
  ensurePublicTape();
  if (!saveState(state)) {
    console.warn("[hackme-exchange] refresh: state not persisted (quota)");
  }

  // Spot: soft-patch chart/book. Other views: never full-remount on oracle tick
  // (that collapsed Asset roadmap / wiped withdraw fields every ~4s).
  if (state.mainView === "spot") {
    if (chartMounted) patchLive();
    else render();
  } else {
    patchNonSpotChrome();
  }
  const ms = measurePerf("oracle-refresh", "oracle-refresh-start", "oracle-refresh-end");
  if (ms != null && ms > 100) console.debug(`[perf] oracle refresh ${ms.toFixed(0)}ms (${source})`);
  })();
  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function boot(): Promise<void> {
  applyHubEmbedLayoutPrefs();
  applyMobileLayoutPrefs();
  applyHashToState();
  saveState(state);
  // Instant desk — never block first paint on oracle RTT / VPN / CORS.
  if (!market || !poolLive) {
    market = applyLivePaperMids(localFallbackMarket(state.oracleAnchor), state.oracleAnchor);
    poolLive = pendingPoolLive();
    oracleMeta = { source: "fallback", fetchedAt: 0, poolStatus: "pending" };
    ensureCandles(state, market);
    for (const p of PAIRS) {
      tickers[p.id] = tickerFromMarket(market, p.id);
      tickers[p.id]!.source = "fallback";
      prevMids[p.id] = tickers[p.id]!.mid;
    }
  }
  render();
  try {
    await refresh();
    // One soft retry — first paint / aborted navigations can miss a healthy proxy.
    if (oracleMeta.source !== "live" || poolLive?.status !== "ok") {
      await new Promise((r) => window.setTimeout(r, 400));
      await refresh();
    }
  } catch (err) {
    console.warn("[hackme-exchange] initial oracle sync failed — using fallback", err);
    if (!market || !poolLive || poolLive.status === "pending") {
      market = applyLivePaperMids(localFallbackMarket(state.oracleAnchor), state.oracleAnchor);
      poolLive = offlinePoolLive();
      oracleMeta = { source: "fallback", fetchedAt: Date.now(), poolStatus: "offline" };
      ensureCandles(state, market);
      saveState(state);
      render();
    }
  }
  if (!isHubEmbed()) {
    // Don't claim "offline" while still pending / first paint — only after confirmed miss.
    if (oracleMeta.source === "live" && oracleMeta.poolStatus === "ok") {
      toast(
        isPaperMode() ? "Paper mode · pool oracle connected" : "Pool oracle connected",
        "ok",
      );
    } else if (oracleMeta.poolStatus === "offline") {
      toast("Pool oracle offline — local fallback mids", "info");
    }
  }
  maybeShowTour();
  void refreshTradingGuardsFromHealth();
  pollTimer = window.setInterval(async () => {
    try {
      await refresh();
      if (isLabApiEnabled()) void refreshTradingGuardsFromHealth();
    } catch (err) {
      console.warn("[hackme-exchange] poll refresh failed", err);
    }
  }, 4_000);
  tickTimer = window.setInterval(microTickPrices, 700);
  oracleAgeTimer = window.setInterval(tickOracleAge, 1000);
  labBookTimer = window.setInterval(() => {
    void (async () => {
      if (!useLabMatching() || state.mainView !== "spot") return;
      const res = await refreshLabBook(state.activePair);
      if (!res.ok || !res.changed) return;
      const book = document.getElementById("book");
      if (!book) return;
      book.innerHTML = renderBook();
      wireBookTabs();
    })();
  }, 350);
  window.addEventListener("resize", () => {
    onMobileLayoutChange();
    positionSystemDrop();
    if (!chartMounted || state.mainView !== "spot") return;
    requestAnimationFrame(() => {
      resizeChart();
      requestAnimationFrame(() => resizeChart());
    });
  });
  try {
    window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_PX}px)`).addEventListener("change", onMobileLayoutChange);
  } catch {
    /* ignore */
  }
  window.addEventListener("hashchange", () => {
    applyHashToState();
    saveState(state);
    chartMounted = false;
    ensurePublicTape(true);
    render();
  });
  if (typeof window !== "undefined") {
    const w = window as Window & { __hackmeExchangeDebug?: Record<string, unknown> };
    w.__hackmeExchangeDebug = { getCrosshairSyncDebug, getTimeSyncDebug };
  }
}

function maybeShowTour(): void {
  if (isHubEmbed()) return;
  if (sessionStorage.getItem("hackme-ex-tour-v1") === "1") return;
  const labOn = isLabApiEnabled();
  const steps = [
    {
      t: "Welcome · 60s tour",
      d: labOn
        ? "HackMe Spot can run as paper or private DEMO/LAB matching. Connect a fixture on Account for live L2 — still not production custody."
        : "HackMe Spot is a paper demo. Prices follow the live pool oracle — not a live CEX matching engine.",
    },
    { t: "Chart · tools", d: "Ruler: click-drag for Δprice / % / bars / time. Cursor: drag handles or whole object. Delete removes selected; lock freezes edits." },
    {
      t: "Trade",
      d: labOn
        ? "Market/Limit hit the lab book when connected; otherwise paper fills. Alerts: right-click chart or the Alerts tab. VIP fees show on the ticker."
        : "Use Market/Limit on the dual panel. Alerts: right-click chart or the Alerts tab. VIP fees show on the ticker.",
    },
    {
      t: "Convert & Pool",
      d: labOn
        ? "Convert uses server seed mid + inventory when LAB is connected (not BBO). Pool page shows live hashrate feeding the oracle."
        : "Convert both ways (HMC/SUP/USDT/BTC). Pool page shows live hashrate feeding the oracle.",
    },
  ];
  let i = 0;
  const bd = document.createElement("div");
  bd.className = "tour-backdrop";
  const dismiss = (doneToast = false) => {
    sessionStorage.setItem("hackme-ex-tour-v1", "1");
    window.removeEventListener("keydown", onKey);
    bd.remove();
    if (doneToast) toast("You're set — try a market buy", "ok");
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") dismiss();
  };
  const paint = () => {
    const s = steps[i];
    bd.innerHTML = `<div class="tour-card glass" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <p class="kicker">Step ${i + 1}/${steps.length}</p>
      <h3 id="tour-title">${s.t}</h3>
      <p class="muted">${s.d}</p>
      <div class="tour-actions">
        <button type="button" class="btn-sm" id="tour-skip">Skip</button>
        <button type="button" class="btn-primary" id="tour-next">${i + 1 >= steps.length ? "Start trading" : "Next"}</button>
      </div>
    </div>`;
    bd.querySelector("#tour-skip")?.addEventListener("click", () => dismiss());
    bd.querySelector("#tour-next")?.addEventListener("click", () => {
      if (i + 1 >= steps.length) {
        dismiss(true);
        return;
      }
      i += 1;
      paint();
    });
  };
  // Block desk clicks while tour is open; backdrop click dismisses.
  bd.addEventListener("click", (e) => {
    if (e.target === bd) dismiss();
  });
  window.addEventListener("keydown", onKey);
  document.body.appendChild(bd);
  paint();
}

window.addEventListener("beforeunload", () => {
  if (pollTimer) clearInterval(pollTimer);
  if (tickTimer) clearInterval(tickTimer);
  if (oracleAgeTimer) clearInterval(oracleAgeTimer);
  if (labBookTimer) clearInterval(labBookTimer);
  clearTimeSyncRegistry();
  destroyChart();
});
