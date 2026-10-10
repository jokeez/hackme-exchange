import "./styles.css";
import QRCode from "qrcode";
import { patchAccountFundsDom, renderAccountPage, wireAccountFunding } from "./account";
import { validateLabWithdrawDestination, validateLabWithdrawAmount } from "./labCustody";
import {
  USDT_DEPOSIT_MIN,
  USDT_CONFIRMATIONS,
  withdrawLimitsPlateHtml,
  withdrawDestHint,
  withdrawMinForAsset,
} from "./custodyLimits";
import { captureEphemeralUi, restoreEphemeralUi } from "./uiPreserve";
import { aggregateBookLevels, buildOrderBook, matchMarket } from "./book";
import { bookStepsForPair } from "./bookSteps";
import {
  applyMidToPairCandles,
  applyPaperClockToPairCandles,
  CANDLE_BASE_TF,
  chartAnchorMid,
  clampFillWickPx,
  deriveAllTimeframes,
  ensureTfSeriesCadence,
  hydrateLiveCandlesFromPrints,
  loadLiveCandleCache,
  nudgeCloseTowardFill,
  prependOlderCandles,
  saveLiveCandleCache,
  seedAllTimeframes,
  stats24h,
  type CandlePrint,
  type LiveDayRange,
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
  getMainViewportDebug,
  applyChartInteractionOptions,
  resizeChart,
  scrollToTimestamp,
  setActiveDrawTool,
  setChartCrosshairMode,
  switchChartPair,
  switchChartTimeframe,
  setCandleData,
  setChartMode,
  setChartPreviewPrice,
  getChartPreviewState,
  setContextPriceMarker,
  setDrawingsLockedFlag,
  softRefreshChart,
  updateLastCandle,
  updateLivePriceHud,
  isChartPointerBusy,
} from "./chart";
import { MAX_DRAWINGS } from "./chartDraw";
import { candleCountdown, fireBrowserAlert, yesterdayClose } from "./chartHud";
import { isHubEmbed, postHubGotoTab } from "./embed";
import { closeChartContextMenu, showChartContextMenu, showObjectTreeModal } from "./chartContextMenu";
import { closeQuickOrderPopup, showQuickOrderPopup, type QuickOrderValidation } from "./chartQuickOrder";
import { hapticError, hapticLight, hapticSuccess } from "./haptic";
import { applyBookFlashes, snapshotBookLevels, type BookLevelSnap } from "./bookFlash";
import { bookLadderFingerprint, bookPriceSkeletonFingerprint, paintBookPreservingScroll, patchBookRowsInPlace, wireBookScrollIdle, type BookRowPatch } from "./bookDom";
import {
  loadLayoutPrefs,
  saveLayoutPrefs,
  setPanelWidth,
  terminalGridColumnsForView,
  togglePanelCollapsed,
  toggleBottomCollapsed,
  applyLayoutPreset,
  LAYOUT_DEFAULTS,
  type LayoutPrefs,
  type LayoutPresetId,
} from "./layoutPrefs";
import { tickInputValue } from "./tick";
import { Ico, drawToolIcon, pairAssetIcons, type DrawIconId } from "./icons";
import { uid } from "./id";
import { destroySecondaryChart, resizeSecondaryCharts, resetSecondaryPaneView, scrollSecondaryToTimestamp, syncSecondaryChart, updateSecondaryChart, getSecondaryViewportDebug, listSecondaryCrosshairPanes, refreshSecondaryPaneOrderLines, setSecondaryCrosshairMode } from "./chartSecondary";
import { detectMultiChartLayout, listChartPaneHosts } from "./chartScreenshot";
import { registerCrosshairPane, setCrosshairSyncEnabled, getCrosshairSyncDebug } from "./chartCrosshairSync";
import { clearTimeSyncRegistry, registerTimeSyncPane, setTimeSyncEnabled, getTimeSyncDebug } from "./chartTimeSync";
import { showUnifiedSettingsModal, patchSettingsWalletSessionChrome, formatDeskMatchingLabel, isDeskMatchingLive, type SettingsWalletChrome } from "./settingsModal";
import {
  auth2faConfirm,
  auth2faDisable,
  auth2faRecoveryRotate,
  auth2faSetup,
  auth2faStatus,
  authLogout,
  authRevokeAll,
  apiPairToId,
  apiPriceToDisplay,
  displayToMinor,
  exchangeHealth,
  fetchCustodyFees,
  fetchDepositAddress,
  fetchPublicTrades,
  fetchPublicTickers,
  formatExchangeReject,
  getLedgerHolds,
  hubEmbedSessionBlockedHint,
  isSessionRequiredError,
  listExchangeFills,
  listWithdrawals,
  minorToDisplay,
  getLabSessionMeta,
  labSessionLabel,
  sessionMsRemaining,
  pairIdToApi,
  postLabBridgeCredit,
  postLabConvert,
  postLabDeposit,
  getLabConvertQuote,
  requestWithdraw,
} from "./adapters/exchangeApi";
import { labFixtureConnect } from "./adapters/labFixture";
import { clearDeskSeed, deskWalletConnect, deskWalletIdentity, buildDeskSeedBackup, hasDeskSeed, parseDeskSeedImport, persistDeskSeed, deskSeedStorageKind } from "./adapters/deskWallet";
import { labSessionRestoreOrConnect } from "./adapters/labSessionRestore";
import {
  cancelLabOrder,
  clearLabBookCache,
  getLabBookCache,
  labBookMid,
  labMarketSlipHint,
  lastPublicMid,
  lastPublicTs,
  setLastPublicMid,
  mergeServerFills,
  placeLabOrder,
  refreshLabBook,
  refreshLabBooks,
  runLabCounterpartyCross,
  syncLabBalancesAndBook,
  useLabMatching,
  useDeskMatching,
  useServerMatching,
  usePublicDeskBook,
  useLiveBook,
  setDeskMatchingStatus,
  isLabSessionStale,
} from "./adapters/labMatching";
import {
  DEFAULT_TRADING_GUARDS,
  parseHealthFeeWallet,
  parseHealthTradingGuards,
  validatePaperTradingGuards,
  type TradingGuards,
} from "./tradingGuards";
import { INTEGRATION, isDeskConnectEnabled, isLabApiEnabled, isLabLoopbackApi, isLiveModeBlocked, isPaperMode, modeChromeLabel, modeStatusPill } from "./config/integration";
import { assertOrderFunds, freeBalance, fundsImmediateFill, maxOrderBaseAmount } from "./balance";
import { nodeWalletUrl } from "./adapters/walletLinks";
import { fetchNodeWallet, mergeNodeIntoDemoWallet, probeNodeOnline } from "./adapters/nodeWallet";
import { markPerf, measurePerf, throttle } from "./perf";
import {
  CONVERT_ROUTES,
  CONVERT_UI_ASSETS,
  applyConvertPrimaryPair,
  assetSymbol,
  clampPrimaryConvertLegs,
  convert,
  convertChipDefaultAmount,
  convertCtaLabel,
  convertFeeHintLine,
  convertNetReceive,
  convertPrimaryPair,
  convertRateLabel,
  convertSlippageDriftBps,
  pairQuoteSym,
  feeQuoteFromLabConvert,
  flipRoute,
  formatConvertFeeToast,
  formatConvertQuoteAge,
  formatLabConvertFeeToast,
  isConvertPreviewError,
  isPrimaryConvertRoute,
  previewConvert,
  convertRouteDef,
  routeForAssets,
  type ConvertPreview,
  type ConvertPrimaryPair,
} from "./convert";
import {
  patchConvertPickerBalances,
  renderConvertAssetOptions,
  renderConvertAssetPicker,
  renderConvertBalanceList,
  renderConvertPairTabs,
  renderConvertRecentList,
  syncConvertPickerUi,
  wireConvertAssetPickers,
} from "./convertUi";
import { loadRecentPairs, pushRecentPair } from "./recentPairs";
import { loadConvertDesk, loadActivityTab, loadConvertSlippageBps, loadOrderDesk, saveActivityTab, saveConvertDesk, saveConvertSlippageBps, saveOrderDesk, type SettingsTabId } from "./uiPrefs";
import { downloadText, exportDemoJson, parseDemoImport } from "./demoIo";
import { exportFillsCsv, exportOrdersCsv, exportOrdersFilename } from "./product/exportOrders";
import { renderSpotEmptyState } from "./product/emptyStates";
import { lookupWorkersByAddress, renderWorkerLookupResult } from "./product/poolWorker";
import { renderOracleTransparencyPanel, patchOracleTransparencyDom } from "./product/oraclePanel";
import { TOUR_V2_STEPS, markTourV2Done, renderTourV2Overlay, tourV2Done } from "./product/tourV2";
import { renderDepthPanel, renderDepthSvg } from "./depth";
import { markNoTranslate, noTranslateText } from "./notranslate";
import { applyFirstVisitPrefs, scheduleChartTapHint } from "./onboarding";
import { createMarketStream, type MarketStream } from "./adapters/marketStream";
import { startLabSessionGuard, stopLabSessionGuard } from "./adapters/labSession";
import { renderOracleStatusHtml, patchOracleStatusDom, type OracleMeta } from "./oracleStatus";
import { parseRouteHash, writeRouteHash } from "./routeHash";
import { appendSyntheticTrade, mergeTapeRows, seedPublicTape, type TapePrint } from "./tape";
import {
  activeVipTier,
  calcFee,
  feeScheduleLabel,
  formatBps,
  hasServerVipVolume,
  liquidityRole,
  nextVipProgress,
  previewFeeRole,
  volume30dUsdt,
  type CalcFeeOpts,
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
  DEFAULT_REFERENCE_MID,
  DEFAULT_SUP_REFERENCE_MID,
  applyLivePaperMids,
  fetchMarket,
  formatGh,
  formatNum,
  formatPct,
  formatPrice,
  formatPriceCompact,
  formatRewardPerM,
  formatVol,
  formatVolBase,
  formatBookQty,
  localFallbackMarket,
  midForPair,
  pctTone,
  tickerFromMarket,
} from "./market";
import { isMarketableLimit, orderTypeLabel, placeOco, placeOrder, processOpenOrders, validateLimitOrder } from "./orders";
import { LANES, PAIRS, pairById } from "./pairs";
import {
  bookDepthRatio,
  seedEquitySnapshots,
  snapshotEquity,
  volumeRatio5m,
  volumeRatioFromPrints,
} from "./pnl";
import { fetchPoolLive, offlinePoolLive, pendingPoolLive, patchPoolLiveDom, renderPoolPage } from "./pool";
import { copyTextToClipboard, escapeHtml, sanitizeOracleAnchor, sanitizeOtpauthUrl } from "./sanitize";
import {
  cancelAllOpenOrders,
  cancelOrder,
  ensureCandles,
  loadState,
  needsCandleReseedForMarket,
  pnlPct,
  repairStaleEquityBaseline,
  reseedCandlesFromMarket,
  resetDemo,
  saveState,
  toggleFavorite,
  updateOrderAmount,
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
  Order,
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
import { QUICK_TFS, TIMEFRAMES, TF_SEC, DEFAULT_MULTI_PANE_PAIRS, normalizeChartOverlays } from "./types";

let bookFlashSnap: BookLevelSnap = new Map();
let state = loadState();
let theme: ThemeId = loadTheme();
let layoutPrefs: LayoutPrefs = loadLayoutPrefs();
let market: MarketSnapshot | null = null;
let poolLive: PoolLive | null = null;
let tickers: Record<PairId, Ticker> = {} as Record<PairId, Ticker>;
let pollTimer: number | undefined;
/** Default Limit so price fields are visible (Market still one click away). */
const orderDeskInit = loadOrderDesk();
let uiType: OrderKind = orderDeskInit.kind;
let uiTif: TimeInForce = orderDeskInit.tif;
let uiPostOnly = orderDeskInit.postOnly;
let activityTab: "tape" | "orders" | "history" | "alerts" = loadActivityTab();
let lastConvertPreviewNet = 0;
let cachedNodeWallet: { hmc: number; sup: number } | null = null;
let pendingAccountSection: string | undefined;
let pendingPoolAddress: string | undefined;
/** Survives render/oracle refresh so syncRouteHash keeps account/pool deep links. */
let accountRouteSection: string | undefined;
let poolRouteAddress: string | undefined;

function normalizeActivityTab(raw: string | null | undefined): typeof activityTab {
  if (raw === "tape" || raw === "history" || raw === "alerts" || raw === "orders") return raw;
  return "orders";
}

function gotoMainView(view: MainView): void {
  state.mainView = view;
  if (view !== "account") accountRouteSection = undefined;
  if (view !== "pool") poolRouteAddress = undefined;
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
let lastPaintedTipTime = 0;
let refreshGen = 0;
let refreshInFlight: Promise<void> | null = null;
let hotkeysWired = false;
let lastOhlc: Candle | null = null;
let prevMids: Partial<Record<PairId, number>> = {};
let tickTimer: number | undefined;
let oracleAgeTimer: number | undefined;
let marketStream: MarketStream | null = null;
let stopLabGuard: (() => void) | null = null;
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
    // Hub iframe is short — never leave Orders/Cancel buried behind bottomCollapsed.
    bottomCollapsed: false,
    bookWidth: Math.min(layoutPrefs.bookWidth, 200),
    rightWidth: Math.min(Math.max(layoutPrefs.rightWidth, 240), 280),
  };
}

/** Phone: session-only tools sheet — never fold desktop draw-tools prefs. */
function applyMobileLayoutPrefs(): void {
  syncMobileLayoutClass();
  bootstrapMobileQuickOrder();
  if (isHubEmbed()) return;
  if (isMobileLayout()) {
    mobileToolsOpen = false;
    document.getElementById("terminal")?.classList.remove("mobile-tools-open");
    return;
  }
  mobileToolsOpen = false;
  document.getElementById("terminal")?.classList.remove("mobile-tools-open");
}

const MOBILE_QO_BOOT_KEY = "hackme-ex-mobile-qo-boot-v1";

/** One-time: enable chart quick-order on phones (users can still disable in settings). */
function bootstrapMobileQuickOrder(): void {
  if (!isMobileLayout()) return;
  try {
    if (localStorage.getItem(MOBILE_QO_BOOT_KEY)) return;
    localStorage.setItem(MOBILE_QO_BOOT_KEY, "1");
    if (!state.chartOverlays.quickOrder) {
      state.chartOverlays = normalizeChartOverlays({ ...state.chartOverlays, quickOrder: true });
      saveState(state);
    }
  } catch {
    /* ignore */
  }
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
let labUser2faEnabled = false;
let labDepositEnabled = true;
let labWithdrawEnabled = true;
/** Last /health edge snapshot for Settings → Wallet HOLD badges. */
let deskEdgeSnap: {
  matching: string;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  maxOpenOrders: number;
  minNotional: number;
  priceBandBps: number;
} = {
  // Pending until first /health — avoid false Deposit·HOLD flash on cold load.
  matching: "…",
  depositEnabled: false,
  withdrawEnabled: false,
  maxOpenOrders: 0,
  minNotional: 0,
  priceBandBps: 0,
};
const cvDeskInit = (() => {
  const raw = loadConvertDesk();
  const clamped = clampPrimaryConvertLegs(raw.from, raw.to);
  return { ...raw, ...clamped };
})();
/** Convert desk selection — survives re-render without form wipe. */
let convertFrom: keyof Wallet = cvDeskInit.from;
let convertTo: keyof Wallet = cvDeskInit.to;
let convertAmtStr = cvDeskInit.amt;
let convertConfirmLarge = (() => {
  try {
    return sessionStorage.getItem("hackme-ex-cv-confirm-large") !== "0";
  } catch {
    return true;
  }
})();
/** Ignore stale lab convert quotes when flip/amount races ahead of await. */
let convertPreviewSeq = 0;
/** Last successful Convert quote timestamp (ms) for freshness chrome. */
let lastConvertQuoteAt = 0;
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

const PAPER_BADGE = `<span class="demo-badge" title="Paper desk — operator reference mid, not a live market price">PAPER · REF MID</span>`;
const PAPER_BADGE_SM = `<span class="demo-badge sm" title="Paper desk — operator reference mid, not a live market price">PAPER</span>`;
const LAB_BOOK_BADGE = `<span class="demo-badge" title="Live L2 from private lab matching engine">LAB · LIVE BOOK</span>`;
const LAB_BOOK_BADGE_SM = `<span class="demo-badge sm" title="Live L2 from private lab matching engine">LAB</span>`;
const DESK_BOOK_BADGE = `<span class="demo-badge" title="Live matching soft-launch — public L2 + tape">SPOT · LIVE</span>`;
const DESK_BOOK_BADGE_SM = `<span class="demo-badge sm" title="Live matching soft-launch">LIVE</span>`;

function bookHeaderBadge(): string {
  if (useLabMatching()) return LAB_BOOK_BADGE_SM;
  if (useDeskMatching() || usePublicDeskBook()) return DESK_BOOK_BADGE_SM;
  return PAPER_BADGE_SM;
}

function renderPanelRail(
  side: "left" | "right" | "tools" | "orders",
  id: string,
  label: string,
  title: string,
): string {
  const chevron = side === "right" || side === "orders" ? "‹" : "›";
  const cls = side === "tools" ? "tools-rail" : side;
  return `<button type="button" class="panel-rail ${cls}" id="${id}" title="${title}" aria-label="${title}">
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
  writeRouteHash({
    view: state.mainView,
    pair: state.activePair,
    tf: state.activeTf,
    convertFrom: state.mainView === "convert" ? convertFrom : undefined,
    convertTo: state.mainView === "convert" ? convertTo : undefined,
    accountSection: state.mainView === "account" ? accountRouteSection : undefined,
    poolAddress: state.mainView === "pool" ? poolRouteAddress : undefined,
  });
}

function ensureDistinctConvertLegs(): void {
  const next = clampPrimaryConvertLegs(convertFrom, convertTo);
  convertFrom = next.from;
  convertTo = next.to;
}

/** Lab or desk session with advertised /convert — use server quote/swap (never invent). */
function useServerConvert(): boolean {
  return tradingGuards.convertFeeServer && useServerMatching();
}

function applyHashToState(): void {
  const h = parseRouteHash(typeof location !== "undefined" ? location.hash : "");
  if (h.view) state.mainView = h.view;
  if (h.pair) state.activePair = h.pair;
  if (h.tf) state.activeTf = h.tf;
  if (h.convertFrom) convertFrom = h.convertFrom;
  if (h.convertTo) convertTo = h.convertTo;
  if (h.convertFrom || h.convertTo) {
    ensureDistinctConvertLegs();
    saveConvertDesk(convertFrom, convertTo, convertAmtStr);
  }
  if (h.section) {
    accountRouteSection = h.section;
    pendingAccountSection = h.section;
  } else if (h.view === "account") {
    accountRouteSection = undefined;
    pendingAccountSection = undefined;
  } else if (h.view) {
    accountRouteSection = undefined;
  }
  if (h.poolAddress) {
    poolRouteAddress = h.poolAddress;
    pendingPoolAddress = h.poolAddress;
  } else if (h.view === "pool") {
    poolRouteAddress = undefined;
    pendingPoolAddress = undefined;
  } else if (h.view) {
    poolRouteAddress = undefined;
  }
}

function applyPendingDeepLinks(): void {
  if (state.mainView === "account" && pendingAccountSection) {
    const section = pendingAccountSection;
    pendingAccountSection = undefined;
    if (section === "deposit") {
      document.getElementById("btn-acct-deposit")?.dispatchEvent(new Event("click"));
    } else if (section === "withdraw") {
      document.getElementById("btn-acct-withdraw")?.dispatchEvent(new Event("click"));
    }
    const anchor =
      section === "fees"
        ? "acct-fees"
        : section === "activity"
          ? "acct-activity"
          : section === "dust"
            ? "acct-dust"
            : section === "deposit"
              ? "acct-cash-deposit"
              : section === "withdraw"
                ? "acct-cash-withdraw"
                : `acct-${section}`;
    window.setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
  if (state.mainView === "pool" && pendingPoolAddress) {
    const addr = pendingPoolAddress;
    pendingPoolAddress = undefined;
    const inp = document.getElementById("pool-worker-addr") as HTMLInputElement | null;
    if (inp) inp.value = addr;
    window.setTimeout(() => {
      document.getElementById("pool-worker-search")?.dispatchEvent(new Event("click"));
    }, 120);
  }
}

async function ensureAlertNotifications(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted" || Notification.permission === "denied") return;
  try {
    await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

const liveHydratedPairs = new Set<PairId>();

function ensurePublicTape(force = false): void {
  // Live L2: public prints come from GET /trades (marketStream), never oracle seeds.
  if (useLiveBook()) return;
  const tk = tickers[state.activePair] ?? (market ? tickerFromMarket(market, state.activePair) : null);
  if (!tk) return;
  if (force || !publicTape.some((t) => t.pairId === state.activePair)) {
    publicTape = [
      ...publicTape.filter((t) => t.pairId !== state.activePair),
      ...seedPublicTape(state.activePair, tk),
    ].slice(0, 80);
  }
}

let lastLiveCandleCacheSaveAt = 0;
function persistLiveCandleCache(pairId: PairId = state.activePair, force = false): void {
  if (!useLiveBook()) return;
  const now = Date.now();
  if (!force && now - lastLiveCandleCacheSaveAt < 2_500) return;
  const base = state.candles[pairId]?.[CANDLE_BASE_TF];
  if (base?.length) {
    saveLiveCandleCache(pairId, base);
    lastLiveCandleCacheSaveAt = now;
  }
}

function candlePrintsFromApiTrades(
  trades: { id?: string; pair?: string; price: number; qty: number; taker_side?: string; created_at?: string }[],
  pairId: PairId,
): CandlePrint[] {
  const out: CandlePrint[] = [];
  for (const t of trades) {
    const pid = t.pair ? apiPairToId(t.pair) ?? pairId : pairId;
    if (pid !== pairId) continue;
    const price = apiPriceToDisplay(Number(t.price));
    const amountBase = minorToDisplay(Number(t.qty));
    if (!(price > 0) || !Number.isFinite(price)) continue;
    const ts = t.created_at ? Date.parse(t.created_at) || Date.now() : Date.now();
    out.push({ ts, price, amountBase: amountBase > 0 ? amountBase : 0 });
  }
  return out;
}

function liveDayRangeForPair(pairId: PairId): LiveDayRange | undefined {
  const api = deskApiTickers.get(pairId);
  if (!api) return undefined;
  const out: LiveDayRange = {};
  if (api.high24h > 0) out.high = api.high24h;
  if (api.low24h > 0) out.low = api.low24h;
  if (api.open24h > 0) out.open = api.open24h;
  return out.high || out.low || out.open ? out : undefined;
}

function candlePrintsFromLocalTape(pairId: PairId): CandlePrint[] {
  const out: CandlePrint[] = [];
  for (const t of publicTape) {
    if (t.pairId !== pairId || !(t.price > 0)) continue;
    out.push({ ts: t.ts, price: t.price, amountBase: t.amountBase > 0 ? t.amountBase : 0 });
  }
  for (const t of state.trades) {
    if (t.pairId !== pairId || !(t.price > 0)) continue;
    out.push({ ts: t.ts, price: t.price, amountBase: t.amountBase > 0 ? t.amountBase : 0 });
  }
  return out;
}

/** Restore live OHLC from session cache + public tape / GET /trades (survives F5). */
async function hydrateLivePairCandlesFromApi(pairId: PairId, tipMid: number): Promise<boolean> {
  let cached =
    loadLiveCandleCache(pairId) ??
    (state.candles[pairId]?.[CANDLE_BASE_TF]?.length
      ? state.candles[pairId]![CANDLE_BASE_TF]!
      : null);
  let apiPrints: CandlePrint[] = [];
  await hydrateDeskApiTickers();
  const res = await fetchPublicTrades(pairIdToApi(pairId), 2000, 15_000, undefined, { window: "24h" });
  if (res.ok) {
    apiPrints = candlePrintsFromApiTrades(res.trades, pairId);
    // Same /trades payload feeds 24h Vol — don't wait for WS/poll push.
    const volPrints: { id?: string; ts: number; amountBase: number; price?: number }[] = [];
    for (const t of res.trades) {
      const pid = t.pair ? apiPairToId(t.pair) ?? pairId : pairId;
      if (pid !== pairId) continue;
      const amountBase = minorToDisplay(Number(t.qty));
      if (!(amountBase > 0)) continue;
      const price = apiPriceToDisplay(Number(t.price));
      const ts = t.created_at ? Date.parse(t.created_at) || Date.now() : Date.now();
      volPrints.push({ id: t.id, ts, amountBase, price: price > 0 ? price : undefined });
    }
    ingestDeskVolPrints(pairId, volPrints);
    markDeskVolReady(pairId);
    if (pairId === state.activePair) patchTickerBar();
  }
  const prints = [...apiPrints, ...candlePrintsFromLocalTape(pairId)];
  // Prefer last trade over Soft-MM book mid — mid can lag Last by 1–3% and desync the tip bar.
  const lastPrint = prints.length
    ? [...prints].sort((a, b) => a.ts - b.ts).at(-1)?.price ?? 0
    : 0;
  const tip =
    lastPrint > 0
      ? lastPrint
      : tipMid > 0
        ? tipMid
        : lastPublicMid(pairId) ||
          labBookMid(pairId) ||
          cached?.[cached.length - 1]?.close ||
          0;
  // Soft-MM quiet pairs: no tape yet — still seed from tip so 24h Vol / OHLC aren't blank.
  if (!prints.length && !(cached?.length) && !(tip > 0)) return false;
  if (!(tip > 0)) return false;
  // Never wipe session cache here — pruneLiveCacheForHydration inside hydrate keeps the
  // tape envelope. Clearing on tip drift was reseeding fake bars over real Soft-MM history.
  state.candles[pairId] = hydrateLiveCandlesFromPrints(
    pairId,
    prints,
    tip,
    Date.now(),
    cached,
    liveDayRangeForPair(pairId),
  );
  prevMids[pairId] = tip;
  persistLiveCandleCache(pairId, true);
  liveHydratedPairs.add(pairId);
  return true;
}

/** Sync path: session cache only (before GET /trades returns). */
function restoreLiveCandlesFromCache(pairId: PairId, tipMid: number): boolean {
  const cached = loadLiveCandleCache(pairId);
  if (!cached?.length) return false;
  const tip = tipMid > 0 ? tipMid : cached[cached.length - 1]?.close ?? 0;
  if (!(tip > 0)) return false;
  // Pass cache through even on tip drift — hydrate prunes to the tape envelope.
  // Do not clear sessionStorage: a later /trades hydrate needs those bars for gap fill.
  state.candles[pairId] = hydrateLiveCandlesFromPrints(
    pairId,
    candlePrintsFromLocalTape(pairId),
    tip,
    Date.now(),
    cached,
    liveDayRangeForPair(pairId),
  );
  prevMids[pairId] = tip;
  if (cached.length >= 24) liveHydratedPairs.add(pairId);
  return true;
}

/** L2 spread % from best bid/ask; falls back to ticker.spreadBps only in paper/oracle mode. */
function liveSpreadPct(t: Ticker = activeTicker()): number {
  if (useLiveBook()) {
    const book = getLabBookCache(state.activePair);
    const bid = book?.bids[0]?.price ?? t.bid;
    const ask = book?.asks[0]?.price ?? t.ask;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : t.mid;
    if (bid > 0 && ask > 0 && mid > 0 && ask >= bid) return ((ask - bid) / mid) * 100;
    return 0;
  }
  return (t.spreadBps || 0) / 100;
}

/** Desk 24h vol: public tape only (never seed/tickVol candle sums — those fake ~20M HMC). */
const deskVolSeen = new Map<string, { ts: number; qty: number }>();
/** Pair has completed at least one /trades hydrate (even if empty) — paint 0 instead of "—". */
const deskVolReady = new Set<PairId>();
const DESK_VOL_CACHE_PREFIX = "hackme-ex-desk-vol-v1:";
let lastDeskVolPersistAt = 0;

function ingestDeskVolPrints(
  pairId: PairId,
  prints: { id?: string; ts: number; amountBase: number; price?: number }[],
): void {
  const cutoff = Date.now() - 24 * 3600_000;
  for (const p of prints) {
    if (!(p.amountBase > 0) || p.ts < cutoff) continue;
    const key =
      p.id && String(p.id).trim()
        ? `${pairId}:${p.id}`
        : `${pairId}:${p.ts}:${p.price ?? 0}:${p.amountBase}`;
    if (deskVolSeen.has(key)) continue;
    deskVolSeen.set(key, { ts: p.ts, qty: p.amountBase });
  }
  // Bound map — drop oldest outside 24h.
  if (deskVolSeen.size > 8_000) {
    for (const [k, v] of deskVolSeen) {
      if (v.ts < cutoff) deskVolSeen.delete(k);
    }
  }
}

/** Paper-only: candle-derived 24h base vol. Never used on live desk. */
function candleVol24hFallback(pairId: PairId): number {
  const c15 = state.candles[pairId]?.["15m"];
  if (c15 && c15.length >= 4) {
    const v = stats24h(c15, "15m").vol;
    if (v > 0) return v;
  }
  const c1 = state.candles[pairId]?.["1m"];
  if (c1 && c1.length >= 8) {
    const v = stats24h(c1, "1m").vol;
    if (v > 0) return v;
  }
  return 0;
}

/** Durable 24h ticker from GET /tickers (fills DB) — display units. */
type DeskApiTicker = {
  last: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volume24hBase: number;
  nTrades24h: number;
  changePct: number;
};
const deskApiTickers = new Map<PairId, DeskApiTicker>();
let deskApiTickersReady = false;
let lastDeskApiTickersAt = 0;

async function hydrateDeskApiTickers(force = false): Promise<boolean> {
  if (!useLiveBook()) return false;
  const now = Date.now();
  if (!force && now - lastDeskApiTickersAt < 8_000) return deskApiTickersReady;
  const res = await fetchPublicTickers(5_000);
  lastDeskApiTickersAt = now;
  if (!res.ok) return deskApiTickersReady;
  for (const row of res.tickers) {
    const pid = apiPairToId(row.pair);
    if (!pid) continue;
    const open = apiPriceToDisplay(Number(row.open_24h ?? 0));
    const last = apiPriceToDisplay(Number(row.last ?? 0));
    const high = apiPriceToDisplay(Number(row.high_24h ?? 0));
    const low = apiPriceToDisplay(Number(row.low_24h ?? 0));
    const vol = minorToDisplay(Number(row.volume_24h_base ?? 0));
    const bps = Number(row.change_bps ?? 0);
    const changePct =
      Number.isFinite(bps) && bps !== 0
        ? bps / 100
        : open > 0 && last > 0
          ? ((last - open) / open) * 100
          : 0;
    deskApiTickers.set(pid, {
      last,
      open24h: open,
      high24h: high,
      low24h: low,
      volume24hBase: vol > 0 ? vol : 0,
      nTrades24h: Number(row.n_trades_24h ?? 0) || 0,
      changePct,
    });
    deskVolReady.add(pid);
  }
  deskApiTickersReady = true;
  if (state.mainView === "spot") {
    patchTickerBar();
    patchMarketRowsInPlace();
  }
  return true;
}

function deskVolTapeBase(pairId: PairId): number {
  const cutoff = Date.now() - 24 * 3600_000;
  let sum = 0;
  const prefix = `${pairId}:`;
  for (const [k, v] of deskVolSeen) {
    if (!k.startsWith(prefix)) continue;
    if (v.ts < cutoff) {
      deskVolSeen.delete(k);
      continue;
    }
    sum += v.qty;
  }
  for (const row of publicTape) {
    if (row.pairId !== pairId || row.ts < cutoff) continue;
    const key = row.id ? `${pairId}:${row.id}` : `${pairId}:${row.ts}:${row.price}:${row.amountBase}`;
    if (!deskVolSeen.has(key)) sum += row.amountBase;
  }
  return sum;
}

function deskVol24hBase(pairId: PairId = state.activePair): number {
  if (!useLiveBook()) {
    const t = tickers[pairId];
    const fromTk = t?.volume24hBase ?? 0;
    return fromTk > 0 ? fromTk : candleVol24hFallback(pairId);
  }
  // Live: durable /tickers is SoT; tape can only raise (never undercut) while WS catches up.
  const api = deskApiTickers.get(pairId);
  const apiVol = api && api.volume24hBase > 0 ? api.volume24hBase : 0;
  const tape = deskVolTapeBase(pairId);
  if (apiVol > 0 || tape > 0) return Math.max(apiVol, tape);
  if (api) return 0;
  return 0;
}

function persistDeskVolCache(pairId: PairId = state.activePair, force = false): void {
  if (typeof sessionStorage === "undefined") return;
  const now = Date.now();
  if (!force && now - lastDeskVolPersistAt < 2_000) return;
  const cutoff = now - 24 * 3600_000;
  const prefix = `${pairId}:`;
  const entries: { k: string; ts: number; qty: number }[] = [];
  for (const [k, v] of deskVolSeen) {
    if (!k.startsWith(prefix) || v.ts < cutoff || !(v.qty > 0)) continue;
    entries.push({ k, ts: v.ts, qty: v.qty });
  }
  try {
    sessionStorage.setItem(
      DESK_VOL_CACHE_PREFIX + pairId,
      JSON.stringify({ at: now, ready: deskVolReady.has(pairId), entries: entries.slice(-2_000) }),
    );
    lastDeskVolPersistAt = now;
  } catch {
    /* quota */
  }
}

/** Sync restore so first paint can show last-known 24h Vol (survives F5). */
function restoreDeskVolCache(pairId: PairId): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(DESK_VOL_CACHE_PREFIX + pairId);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      at?: number;
      ready?: boolean;
      entries?: { k?: string; ts?: number; qty?: number }[];
    };
    if (!parsed?.at || Date.now() - parsed.at > 24 * 3600_000) return false;
    const cutoff = Date.now() - 24 * 3600_000;
    let n = 0;
    for (const e of parsed.entries ?? []) {
      if (!e?.k || !(e.qty! > 0) || !(e.ts! >= cutoff)) continue;
      if (!deskVolSeen.has(e.k)) deskVolSeen.set(e.k, { ts: e.ts!, qty: e.qty! });
      n += 1;
    }
    if (parsed.ready || n > 0) deskVolReady.add(pairId);
    return parsed.ready === true || n > 0;
  } catch {
    return false;
  }
}

function markDeskVolReady(pairId: PairId): void {
  deskVolReady.add(pairId);
  persistDeskVolCache(pairId, true);
}

function formatLiveVol24h(pairId: PairId, base: string): string {
  const vol = deskVol24hBase(pairId);
  if (vol > 0) return formatVolBase(vol, base);
  // Ready (tickers/trades hydrate) with no fills → honest 0, never seed/demo vol.
  if (deskVolReady.has(pairId) || deskApiTickersReady) return formatVolBase(0, base);
  return "—";
}

/** Eager GET /trades → deskVolSeen so ticker Vol paints without waiting for WS push. */
async function hydrateDeskVolFromApi(pairId: PairId): Promise<boolean> {
  if (!useLiveBook()) return false;
  const res = await fetchPublicTrades(pairIdToApi(pairId), 100, 5_000);
  if (res.ok) {
    const prints: { id?: string; ts: number; amountBase: number; price?: number }[] = [];
    for (const t of res.trades) {
      const pid = t.pair ? apiPairToId(t.pair) ?? pairId : pairId;
      if (pid !== pairId) continue;
      const price = apiPriceToDisplay(Number(t.price));
      const amountBase = minorToDisplay(Number(t.qty));
      if (!(amountBase > 0)) continue;
      const ts = t.created_at ? Date.parse(t.created_at) || Date.now() : Date.now();
      prints.push({ id: t.id, ts, amountBase, price: price > 0 ? price : undefined });
    }
    ingestDeskVolPrints(pairId, prints);
  }
  // Always mark ready so quiet pairs paint candle/seed Vol instead of staying on "—".
  markDeskVolReady(pairId);
  if (pairId === state.activePair) patchTickerBar();
  patchMarketRowsInPlace();
  return res.ok;
}

function renderAnnounce(): string {
  if (announceDismissed) return "";
  const lab = useLabMatching();
  const deskLive = useDeskMatching();
  const deskBook = usePublicDeskBook();
  const desk = isDeskConnectEnabled();
  const label = modeChromeLabel();
  const bold = isLiveModeBlocked()
    ? "Live mode blocked — matching API not connected"
    : lab
      ? "Private lab matching — not production custody"
      : deskLive
        ? "Soft-launch Spot — live matching · deposit/withdraw on"
        : deskBook
          ? "Soft-launch Spot — live book · Connect to trade"
          : desk
            ? "Soft-launch Spot — Connect wallet to trade when matching is GO"
            : "Paper Spot — simulated balances · reference mids";
  const detail = lab
    ? "lab ledger"
    : deskLive || deskBook
      ? "live L2 · public tape"
      : desk
        ? "browser wallet · Connect for live session"
        : "paper balances in localStorage";
  const badge = lab ? LAB_BOOK_BADGE : deskLive || deskBook ? DESK_BOOK_BADGE : PAPER_BADGE;
  return `<div class="announce" id="announce-bar" role="status">
    <strong>${bold}</strong>
    · ${label}
    · ${detail}
    ${badge}
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
    tbSub.textContent = useLabMatching()
      ? "Lab book · DEMO matching"
      : useDeskMatching()
        ? "Desk book · live matching"
        : usePublicDeskBook()
          ? "Desk book · Connect to trade"
          : "Pool oracle · paper preview";
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
    } else if (useDeskMatching() || usePublicDeskBook()) {
      modeBadge.textContent = "DESK";
      modeBadge.setAttribute("title", "Public desk matching live — soft-launch");
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
): Order | null {
  if (!market) return null;
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
    return null;
  }
  return res as Order;
}

function paperGuardsOrWarn(
  side: "buy" | "sell",
  kind: OrderKind,
  amountBase: number,
  price: number,
): boolean {
  // Live public book without a CSRF session: do not paper-fill against the live L2.
  if (usePublicDeskBook() && !useDeskMatching() && !useLabMatching()) {
    const msg = "Connect desk wallet to trade on the live book";
    setOrderMsg(side, msg, "err");
    toast(msg, "warn");
    return false;
  }
  if (isLabSessionStale()) {
    const msg = "Lab session stale — reconnect fixture (paper matching frozen)";
    setOrderMsg(side, msg, "err");
    toast(msg, "warn");
    return false;
  }
  const pair = pairById(state.activePair);
  const mid =
    (useLiveBook() ? labBookMid(state.activePair) : 0) ||
    (useLiveBook() ? 0 : market ? midForPair(market, state.activePair) : 0) ||
    activeTicker().mid;
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
    hapticError();
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
  const prevEdge = { ...deskEdgeSnap };
  try {
    const h = await exchangeHealth(2_000);
    if (!h.ok) {
      if ("code" in h && (h.code === "unreachable" || h.status === 0)) {
        healthBackoffUntil = Date.now() + 60_000;
      }
      return;
    }
    healthBackoffUntil = 0;
    const rawMatching =
      typeof h.matching === "string" && h.matching
        ? h.matching
        : useLabMatching()
          ? "ok"
          : "disabled";
    setDeskMatchingStatus(rawMatching);
    // Keep raw matching status ("ok" | "disabled" | …) — labels are derived at render time.
    deskEdgeSnap = {
      matching: rawMatching,
      depositEnabled: h.deposit?.enabled === true,
      withdrawEnabled: h.withdraw?.enabled === true,
      maxOpenOrders: 0,
      minNotional: 0,
      priceBandBps: 0,
    };
    tradingGuards = parseHealthTradingGuards(h);
    deskEdgeSnap.maxOpenOrders = tradingGuards.maxOpenOrders;
    deskEdgeSnap.minNotional = tradingGuards.minNotionalQuote;
    deskEdgeSnap.priceBandBps = tradingGuards.priceBandBps;
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
  const edgeChanged =
    prevEdge.matching !== deskEdgeSnap.matching ||
    prevEdge.depositEnabled !== deskEdgeSnap.depositEnabled ||
    prevEdge.withdrawEnabled !== deskEdgeSnap.withdrawEnabled ||
    prevEdge.maxOpenOrders !== deskEdgeSnap.maxOpenOrders ||
    prevEdge.minNotional !== deskEdgeSnap.minNotional ||
    prevEdge.priceBandBps !== deskEdgeSnap.priceBandBps;
  if (
    (labFeeWallet !== prevFee || state.feeConfig.hmcDiscountPct !== prevDisc || edgeChanged) &&
    (state.mainView === "account" || state.mainView === "convert" || state.mainView === "spot")
  ) {
    render();
    return;
  }
  if (edgeChanged) {
    patchModeChrome();
    patchOpenSettingsWalletChrome();
    if (usePublicDeskBook()) {
      // Matching flipped to ok — start public L2 poll even without Connect.
      startMarketStreamLoop();
      void refreshLabBooks(["HMC_USDT", "HMC_SUP", "SUP_USDT"] as PairId[]).then(() => {
        patchBookTapeDom();
      });
    }
  }
  if (tradingGuards.labMmSeeded === prevSeeded) return;
  const meta = document.getElementById("order-head-meta");
  if (!meta) return;
  const existing = meta.querySelector("[data-lab-mm-badge]");
  if (tradingGuards.labMmSeeded && !existing) {
    const span = document.createElement("span");
    span.className = "demo-badge sm muted-badge";
    span.dataset.labMmBadge = "1";
    span.title = "Soft-MM liquidity on the live book";
    span.textContent = "SOFT MM";
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

function secondaryPaneLineOpts(hostId: string, pairId: PairId) {
  const preview = getChartPreviewState();
  return {
    orders: state.orders.filter((o) => o.pairId === pairId),
    alerts: chartAlertsForPair(pairId),
    overlays: {
      showOrderLines: state.chartOverlays.showOrderLines,
      orderPreview: state.chartOverlays.orderPreview,
    },
    previewPrice: preview.price,
    previewSide: preview.side,
    previewPaneId: preview.paneId,
  };
}

function refreshSecondaryChartOrderLines(): void {
  if (state.multiChartLayout === "1") return;
  const n = state.multiChartLayout === "4" ? 4 : 2;
  for (let i = 2; i <= n; i++) {
    const hostId = `chart-host-${i}`;
    refreshSecondaryPaneOrderLines(hostId, secondaryPaneLineOpts(hostId, panePair(i)));
  }
}

function refreshActivityPanel(): void {
  const body = document.getElementById("activity-body");
  if (!body) return;
  body.innerHTML = renderActivityBody();
  wireCancelButtons();
  wireOrderAmendButtons();
  wireFundsFunding();
  wireAlertButtons();
  wireActivityExports();
}

function wireActivityExports(): void {
  document.getElementById("btn-export-fills")?.addEventListener("click", () => {
    downloadText(exportOrdersFilename("fills"), exportFillsCsv(state));
    toast("Fills exported", "ok");
  });
  document.getElementById("btn-export-orders")?.addEventListener("click", () => {
    downloadText(exportOrdersFilename("orders"), exportOrdersCsv(state));
    toast("Orders exported", "ok");
  });
}

function refreshOpenOrderChartLines(): void {
  refreshOrderLines(
    state.orders.filter((o) => o.pairId === state.activePair),
    chartAlertsForPair(),
  );
  refreshSecondaryChartOrderLines();
}

let lastMidForAlertsByPair = new Map<PairId, number>();

function activeTicker(): Ticker {
  return tickers[state.activePair] ?? tickerFromMarket(market!, state.activePair);
}

/**
 * Last tradeable print for ticker/chart tip (CEX "Last").
 * Prefer public prints over Soft-MM mid — Soft-MM re-pegs BBO and stays sticky for
 * minutes (top-up skip_existing), which paints a horizontal ruler if used as tip.
 */
function liveLastPrice(pairId: PairId): number {
  const tape = lastPublicMid(pairId);
  const tapeTs = lastPublicTs(pairId);
  const lab = labBookMid(pairId);
  const tipTf = pairId === state.activePair ? state.activeTf : CANDLE_BASE_TF;
  const tip = state.candles[pairId]?.[tipTf]?.slice(-1)[0]?.close ?? 0;
  const ageMs = tapeTs > 0 ? Date.now() - tapeTs : Number.POSITIVE_INFINITY;
  // Short freshness — Soft-MM peg must not own Last for minutes after tape dies.
  const tapeFresh = tape > 0 && ageMs < 45_000;

  if (tapeFresh) return tape;
  // Stale print: blend toward Soft-MM so Last drifts instead of snapping to a peg.
  if (tape > 0 && lab > 0) {
    const w = Math.min(1, Math.max(0, (ageMs - 45_000) / (3 * 60_000)));
    return tape * (1 - w) + lab * w;
  }
  if (tape > 0) return tape;
  if (lab > 0) return lab;
  if (tip > 0) return tip;
  const tk = tickers[pairId];
  if (tk?.mid && tk.mid > 0) return tk.mid;
  const prev = prevMids[pairId];
  if (prev != null && prev > 0) return prev;
  return 0;
}

/** Live desk mid for book/spread math (true BBO when two-sided). */
function liveSpotMid(pairId: PairId): number {
  const lab = labBookMid(pairId);
  if (lab > 0) return lab;
  return liveLastPrice(pairId);
}

function bookMidFromLevels(
  pairId: PairId,
  bestBid: number,
  bestAsk: number,
  labLive: boolean,
  fallbackMid: number,
): { midPx: number; spreadAbs: number; spreadPct: number; midHint: string; midTitle: string } {
  if (bestBid > 0 && bestAsk > 0 && bestAsk >= bestBid) {
    const midPx = (bestBid + bestAsk) / 2;
    const spreadAbs = Math.max(0, bestAsk - bestBid);
    const spreadPct = midPx > 0 ? (spreadAbs / midPx) * 100 : 0;
    const hint = labLive ? "Live L2 mid" : "Oracle · indicative";
    return { midPx, spreadAbs, spreadPct, midHint: hint, midTitle: hint };
  }
  const printMid = labLive ? liveLastPrice(pairId) : fallbackMid;
  const midPx = printMid > 0 ? printMid : bestBid || bestAsk || fallbackMid;
  const oneSided = labLive && (bestBid <= 0 || bestAsk <= 0);
  const midHint = oneSided ? "Last print · one-sided L2" : labLive ? "Live L2 mid" : "Oracle · indicative";
  const midTitle = oneSided
    ? "Book is one-sided — mid from last public trade print"
    : midHint;
  return { midPx, spreadAbs: 0, spreadPct: 0, midHint, midTitle };
}

/** Spot last for toolbar, market rows, and chart tip — one source. */
function spotMidForPair(pairId: PairId): number {
  if (useLiveBook()) {
    const last = liveLastPrice(pairId);
    if (last > 0) return last;
    const book = labBookMid(pairId);
    if (book > 0) return book;
    const api = deskApiTickers.get(pairId);
    if (api && api.last > 0) return api.last;
    // Live book expected — never fall back to paper/oracle 0.05 seed (H-13).
    return 0;
  }
  const blended = prevMids[pairId];
  if (blended != null && blended > 0) return blended;
  const tk = tickers[pairId];
  if (tk?.mid && tk.mid > 0) return tk.mid;
  return market ? midForPair(market, pairId) : 0;
}

/** Unified quote: live desk uses durable /tickers; paper uses candle 24h. */
function pairQuote(pairId: PairId = state.activePair): PairQuote {
  const mid = spotMidForPair(pairId);
  if (useLiveBook()) {
    const api = deskApiTickers.get(pairId);
    if (api) {
      const changePct = api.changePct;
      return {
        mid: mid > 0 ? mid : api.last,
        changePct,
        tone: pctTone(changePct),
        high24h: api.high24h,
        low24h: api.low24h,
        vol24h: api.volume24hBase,
        refOpen: api.open24h,
        refClose: api.last,
      };
    }
  }
  return buildPairQuote({
    pairId,
    mid,
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
  const icons = document.querySelector(".tb-pair-icons");
  if (icons) icons.innerHTML = pairAssetIcons(pair.base, pair.quote);
  const pairTitle = document.querySelector(".tb-pair h1");
  if (pairTitle) {
    pairTitle.textContent = pair.label;
    markNoTranslate(pairTitle);
  }
  const priceEl = document.querySelector(".tb-price");
  const chgEl = document.querySelector(".tb-chg");
  const fiatEl = document.querySelector("[data-tb-usdt]") as HTMLElement | null;
  const statsEl = document.querySelector(".tb-stats");
  if (priceEl) {
    priceEl.textContent = formatPrice(quote.mid);
    priceEl.className = `tb-price notranslate ${tone}`;
    priceEl.setAttribute("translate", "no");
  }
  if (chgEl) {
    chgEl.textContent = formatPct(quote.changePct);
    chgEl.className = `tb-chg notranslate ${tone}`;
    chgEl.setAttribute("translate", "no");
  }
  if (fiatEl && market && pair.quote !== "USDT") {
    const fx = pair.quote === "BTC" ? market.btcUsd : pair.quote === "SUP" ? market.supUsdt : 1;
    fiatEl.textContent = `≈ ${formatPrice(quote.mid * fx)} USDT`;
    markNoTranslate(fiatEl);
  }
  if (statsEl) {
    const spans = statsEl.querySelectorAll("span.mono");
    const live = useLiveBook();
    const vol = live ? deskVol24hBase() : quote.vol24h;
    if (spans[0] && quote.high24h > 0) {
      spans[0].textContent = formatPrice(quote.high24h);
      markNoTranslate(spans[0]);
    }
    if (spans[1] && quote.low24h > 0) {
      spans[1].textContent = formatPrice(quote.low24h);
      markNoTranslate(spans[1]);
    }
    if (spans[2]) {
      spans[2].textContent = live ? formatLiveVol24h(state.activePair, pair.base) : formatVolBase(vol, pair.base);
      markNoTranslate(spans[2]);
    }
    if (spans[3]) {
      spans[3].textContent = `${formatNum(liveSpreadPct(), 3)}%`;
      markNoTranslate(spans[3]);
    }
  }
}

let lastOhlcLegendText = "";

function formatOhlcLegendText(c: Pick<Candle, "open" | "high" | "low" | "close" | "volume"> | null, midFallback: number): string {
  const ha = state.chartMode === "heikin" ? "HA " : "";
  if (!c) return `${ha}O — H — L — C ${formatPrice(midFallback)}`;
  const base = `${ha}O ${formatPrice(c.open)} H ${formatPrice(c.high)} L ${formatPrice(c.low)} C ${formatPrice(c.close)}`;
  if (!isMobileLayout()) return base;
  const vol = Number(c.volume);
  if (!(vol > 0)) return base;
  return `${base} · V ${formatVol(vol)}`;
}

function updateOhlcDisplays(c: Candle | null): void {
  // Caller (chart crosshair) is already rAF-coalesced — paint sync to avoid +1 frame lag.
  paintOhlcLegend(c);
}

function paintOhlcLegend(c: Candle | null): void {
  const el = document.getElementById("ohlc-legend");
  const mob = document.getElementById("mobile-ohlc-bar");
  if (!c) {
    refreshOhlcLegendIdle();
    mob?.classList.remove("live");
    return;
  }
  const text = formatOhlcLegendText(c, activeTicker().mid);
  if (text === lastOhlcLegendText) return;
  lastOhlcLegendText = text;
  if (el) el.textContent = text;
  if (mob && isMobileLayout()) {
    mob.textContent = text;
    mob.classList.remove("hidden");
    mob.classList.add("live");
  }
}

function patchRecentPairsStrip(): void {
  const ticker = document.querySelector(".ticker-bar.binance-ticker");
  if (!ticker) return;
  const recentPairs = loadRecentPairs().filter((p) => p !== state.activePair);
  const existing = document.getElementById("recent-pairs");
  if (!recentPairs.length) {
    existing?.remove();
    return;
  }
  const html = `<div class="recent-pairs" id="recent-pairs" aria-label="Recent markets">${recentPairs
    .map((p) => {
      const meta = pairById(p);
      const mid = pairQuote(p).mid;
      return `<button type="button" class="recent-pair" data-recent-pair="${escapeHtml(p)}"><span>${escapeHtml(meta.label)}</span>${
        mid ? `<span class="mono muted">${formatPrice(mid)}</span>` : ""
      }</button>`;
    })
    .join("")}</div>`;
  if (existing) existing.outerHTML = html;
  else ticker.insertAdjacentHTML("afterend", html);
  document.querySelectorAll("[data-recent-pair]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchActivePair((btn as HTMLElement).dataset.recentPair as PairId);
    });
  });
}

function refreshOrderZone(): void {
  const zone = document.getElementById("order-zone");
  if (!zone || !market) return;
  const pair = pairById(state.activePair);
  const quote = activePairQuote();
  const av = availBalance(pair);
  const vip = activeVipTier(state, market);
  const feeRole = previewFeeRole(uiType);
  const feeBps = feeRole === "maker" ? vip.makerBps : vip.takerBps;
  const showTif = uiType === "limit" || uiType === "stop_limit";
  zone.innerHTML = renderDualOrderPanel({
    pair,
    pairId: state.activePair,
    mid: quote.mid,
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
    deskEdgeLive: usePublicDeskBook(),
    deskSession: useDeskMatching(),
  });
  applyRestingLimitPrices(spotTradeMid(), state.activePair);
  wireOrderPanelEvents();
  toggleOrderFields();
  syncPctMarks("buy");
  syncPctMarks("sell");
  updatePreview();
  syncExecButtonsEnabled();
}

function wireOrderPanelEvents(): void {
  document.querySelectorAll("#type-tabs .type").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = (btn as HTMLElement).dataset.type as OrderKind;
      const prev = uiType;
      uiType = next;
      syncOrderTypeTabs(uiType);
      saveOrderDesk(uiType, uiTif, uiPostOnly);
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
    saveOrderDesk(uiType, uiTif, uiPostOnly);
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
        if (!confirm(`Set amount to MAX available ${side.toUpperCase()}?`)) return;
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
      const labLive = useLiveBook();
      const lab = labLive ? getLabBookCache(state.activePair) : null;
      if (labLive && (!lab || (!lab.bids.length && !lab.asks.length))) {
        toast("Live book not ready", "warn");
        return;
      }
      const ask = lab?.asks[0]?.price || t.ask;
      const bid = lab?.bids[0]?.price || t.bid;
      const inp = document.getElementById(`${side}-price`) as HTMLInputElement;
      if (inp) inp.value = tickInputValue(side === "buy" ? bid : ask, state.activePair);
      const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
      const pct = Number(slider?.value ?? 0);
      if (pct > 0) setAmountPct(side, pct / 100);
      updatePreviewForSide(side);
    });
  });
}

function forcePaintBook(): void {
  const book = document.getElementById("book");
  if (!book) return;
  delete book.dataset.bookFp;
  delete book.dataset.bookSkel;
  paintBookPreservingScroll(book, renderBook(), "force");
  const { bids, asks, group } = activeBookLevels();
  book.dataset.bookSkel = bookPriceSkeletonFingerprint(bids, asks, group, state.bookView);
  book.dataset.bookFp = bookLadderFingerprint(bids, asks, group, state.bookView);
  wireBookTabs();
}

function patchActivePairChrome(): void {
  patchTickerBar();
  patchRecentPairsStrip();
  patchMarketRowsInPlace();
  softPatchFeePayChrome();
  const alertCount = state.priceAlerts.filter((a) => a.pairId === state.activePair && !a.fired).length;
  const alertsBtn = document.getElementById("btn-open-alerts");
  if (alertsBtn) alertsBtn.textContent = `Alerts${alertCount ? ` · ${alertCount}` : ""}`;
  const book = document.getElementById("book");
  if (book) forcePaintBook();
  const tape = document.getElementById("mobile-trade-tape");
  if (tape) tape.innerHTML = renderMobileTradeTape();
  const strip = document.getElementById("mining-strip");
  if (strip && poolLive) {
    const pair = pairById(state.activePair);
    strip.textContent = `${pair.label} · ${formatGh(poolLive.poolGh)} · ${poolLive.workers} workers · reward/M ${formatRewardPerM(poolLive.rewardPerM)} · #${formatNum(poolLive.blockHeight, 0)}`;
  }
  refreshOrderZone();
}

function switchActivePair(pairId: PairId, opts?: { mobileTrade?: boolean }): void {
  if (pairId === state.activePair) return;
  state.activePair = pairId;
  paperBookAnchorMid = 0;
  // Keep prior L2 until the new pair lands — multi-pair cache; never paint paper demo L2.
  pushRecentPair(pairId);
  saveState(state);
  syncRouteHash();
  ensurePublicTape(true);
  lastOhlc = null;
  closeQuickOrderPopup();
  setChartPreviewPrice(null);
  refreshSecondaryChartOrderLines();

  if (opts?.mobileTrade && isMobileLayout()) {
    mobilePanel = "trade";
    saveMobilePanel("trade");
    document.getElementById("terminal")?.setAttribute("data-mobile-panel", "trade");
    document.querySelectorAll(".mp-tab").forEach((tab) => {
      const on = (tab as HTMLElement).id === "mp-tab-trade";
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  patchActivePairChrome();

  if (useLiveBook()) {
    restoreDeskVolCache(pairId);
    void hydrateDeskVolFromApi(pairId);
    void refreshLabBook(pairId).then((r) => {
      const bookEl = document.getElementById("book");
      if (bookEl) {
        bookEl.innerHTML = renderBook();
        wireBookTabs();
      }
      throttledBookTapePatch();
      patchMobileTradeTape();
      // Re-seed limit prices from the live L2 mid once the book for this pair arrives.
      if (r.ok && state.activePair === pairId && (uiType === "limit" || uiType === "stop_limit")) {
        applyRestingLimitPrices(spotTradeMid(), pairId);
        updatePreview();
        resyncPctSizedAmounts();
      }
    });
  }

  repairPairTfCandles(pairId, state.activeTf);
  const candles = state.candles[pairId]?.[state.activeTf] ?? [];
  const chartOpt = { ...chartOpts(), drawingsLocked: state.drawingsLocked };
  if (chartMounted && switchChartPair(candles, chartOpt)) {
    refreshOhlcLegendIdle();
    refreshDrawings(state.drawings.filter((d) => d.pairId === pairId));
    setActiveDrawTool(state.activeDrawTool);
  } else {
    mountChartPanel();
  }

  bookFlashSnap = snapshotBookLevels(document.getElementById("book"));
  refreshActivityPanel();
  // Do NOT await full oracle refresh() here — it blocks Markets clicks for seconds.
  // Book for the new pair is fetched above; ticker/oracle keep polling on their timers.
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
    const vol = useLiveBook() ? deskVol24hBase(p.id) : q.vol24h;
    const volTxt = vol > 0 ? formatVolBase(vol, p.base) : "—";
    return `<div class="market-row-wrap ${active}">
      <button type="button" class="star ${starred}" data-star="${p.id}" title="Favorite" aria-label="Favorite ${p.label}">★</button>
      <button type="button" class="market-row ${active}" data-pair="${p.id}">
      <div class="mr-left">
        ${pairAssetIcons(p.base, p.quote)}
        <span class="mr-sym notranslate" translate="no" title="${p.label}"><strong>${p.base}</strong><span class="muted">/${p.quote}</span></span>
      </div>
      <div class="mr-right">
        <span class="mono mr-px notranslate" translate="no">${q.mid > 0 ? formatPriceCompact(q.mid) : "—"}</span>
        <span class="mono mr-chg notranslate ${quoteToneClass(q.tone)}" translate="no">${formatPct(q.changePct)}</span>
        <span class="mono mr-vol muted notranslate" translate="no" title="24h volume">${escapeHtml(volTxt)}</span>
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
  // Live desk: B/S bar from L2 quote depth (visible book), not empty local trades → fake 50/50.
  // Fallback: public tape + session fills in the last 5m.
  let buyPct = 50;
  let sellPct = 50;
  let known = false;
  let title = "Buy/Sell volume · last 5 min";
  if (useLiveBook()) {
    const { bids, asks } = activeBookLevels();
    const depth = bookDepthRatio(bids, asks);
    if (depth.known) {
      buyPct = depth.buyPct;
      sellPct = depth.sellPct;
      known = true;
      title = "Bid/Ask depth · visible L2 notional";
    } else {
      const tapePrints = [
        ...publicTape.map((t) => ({
          pairId: t.pairId,
          ts: t.ts,
          side: t.side,
          amountBase: t.amountBase,
          price: t.price,
        })),
        ...state.trades.map((t) => ({
          pairId: t.pairId,
          ts: t.ts,
          side: t.side,
          amountBase: t.amountBase,
          price: t.price,
        })),
      ];
      const tape = volumeRatioFromPrints(tapePrints, state.activePair, 5 * 60_000, true);
      if (tape.known) {
        buyPct = tape.buyPct;
        sellPct = tape.sellPct;
        known = true;
        title = "Buy/Sell notional · last 5 min (tape)";
      }
    }
  } else {
    const vr = volumeRatio5m(state.trades, state.activePair);
    buyPct = vr.buyPct;
    sellPct = vr.sellPct;
    known = vr.buyVol > 0 || vr.sellVol > 0;
  }
  const buyLabel = known ? `${formatNum(buyPct, 0)}% B` : "—% B";
  const sellLabel = known ? `${formatNum(sellPct, 0)}% S` : "—% S";
  const buyW = known ? buyPct : 50;
  const sellW = known ? sellPct : 50;
  return `<div class="volume-ratio" title="${title}">
    <div class="volume-ratio-labels"><span class="buy">${buyLabel}</span><span class="sell">${sellLabel}</span></div>
    <div class="volume-ratio-track">
      <div class="vr-buy" style="width:${buyW}%"></div>
      <div class="vr-sell" style="width:${sellW}%"></div>
    </div>
  </div>`;
}

/** Paper ladder mid — hold until live mid moves enough (avoids 700ms thrash). */
let paperBookAnchorMid = 0;
const PAPER_BOOK_MID_REANCHOR = 0.00028; // ~2.8 bps

let liveBookKickAt = 0;
let liveBookKickPair: PairId | null = null;
function kickLiveBookFetch(pairId: PairId): void {
  const now = Date.now();
  // Don't stampede BookLimit — pair switch / empty cache kicks at most ~1.2s.
  if (liveBookKickPair === pairId && now - liveBookKickAt < 1_200) return;
  liveBookKickAt = now;
  liveBookKickPair = pairId;
  void refreshLabBook(pairId).then((r) => {
    if (r.ok) patchBookTapeDom();
  });
}

function tickerForPaperBook(t: Ticker): Ticker {
  const mid = t.mid;
  if (
    !(paperBookAnchorMid > 0) ||
    !Number.isFinite(mid) ||
    mid <= 0 ||
    Math.abs(mid - paperBookAnchorMid) / paperBookAnchorMid >= PAPER_BOOK_MID_REANCHOR
  ) {
    paperBookAnchorMid = mid > 0 && Number.isFinite(mid) ? mid : paperBookAnchorMid;
  }
  const a = paperBookAnchorMid > 0 ? paperBookAnchorMid : mid;
  return { ...t, mid: a, bid: a * 0.999, ask: a * 1.001 };
}

function activeBookLevels(): {
  bids: ReturnType<typeof aggregateBookLevels>;
  asks: ReturnType<typeof aggregateBookLevels>;
  labLive: boolean;
  lab: ReturnType<typeof getLabBookCache>;
  /** True when live L2 is expected but not yet in cache (empty — never paper demo). */
  waitingLive: boolean;
  t: Ticker;
  group: number;
} {
  const t = activeTicker();
  const group = bookGroupStep();
  const labLive = useLiveBook();
  const lab = labLive ? getLabBookCache(state.activePair) : null;
  let waitingLive = false;
  let raw: { bids: { price: number; amountBase: number; totalQuote: number }[]; asks: { price: number; amountBase: number; totalQuote: number }[] };
  if (labLive) {
    if (lab && (lab.bids.length || lab.asks.length)) {
      raw = { bids: lab.bids, asks: lab.asks };
      // Crossed L2 (STP leftovers): hide impossible top of book so mid/spread aren't nonsense.
      const bestBid = raw.bids[0]?.price ?? 0;
      const bestAsk = raw.asks[0]?.price ?? 0;
      if (bestBid > 0 && bestAsk > 0 && bestBid >= bestAsk) {
        raw = {
          bids: raw.bids.filter((l) => l.price < bestAsk),
          asks: raw.asks.filter((l) => l.price > bestBid),
        };
      }
      // Soft-launch: drop orphan far rungs. Anchor to Last when it diverges from BBO
      // (pump/dump): otherwise sticky old 0.069 BBO mid hides the live 0.094 ladder
      // and the mid band disagrees with the chart tip.
      const bb = raw.bids[0]?.price ?? 0;
      const ba = raw.asks[0]?.price ?? 0;
      if (bb > 0 && ba > 0 && ba > bb) {
        const bboMid = (bb + ba) / 2;
        const lastPx = liveLastPrice(state.activePair) || t.mid || 0;
        const desync =
          lastPx > 0 && bboMid > 0 ? Math.abs(lastPx - bboMid) / lastPx : 0;
        const anchor = lastPx > 0 && desync > 0.025 ? lastPx : bboMid;
        const maxDev = anchor * (desync > 0.08 ? 0.035 : 0.025); // 250–350 bps
        const filtered = {
          bids: raw.bids.filter((l) => anchor - l.price <= maxDev && l.price <= anchor * 1.002),
          asks: raw.asks.filter((l) => l.price - anchor <= maxDev && l.price >= anchor * 0.998),
        };
        // Keep filtered book when we still have two-sided depth near Last; else keep BBO
        // cluster so an empty filter doesn't blank the panel mid-rebuild.
        if (
          (filtered.bids.length || filtered.asks.length) &&
          (desync <= 0.025 || (filtered.bids.length && filtered.asks.length))
        ) {
          raw = filtered;
        } else if (desync > 0.025 && lastPx > 0) {
          // Stale BBO cluster far from Last — hide it; mid falls back to last print.
          raw = { bids: [], asks: [] };
          kickLiveBookFetch(state.activePair);
        }
      }
    } else if (lab) {
      // Health+poll succeeded but Soft-MM depth is empty — not "still fetching".
      waitingLive = false;
      raw = { bids: [], asks: [] };
      kickLiveBookFetch(state.activePair);
    } else {
      // Public desk matching is live — never paint a synthetic paper ladder.
      waitingLive = true;
      raw = { bids: [], asks: [] };
      kickLiveBookFetch(state.activePair);
    }
  } else {
    raw = buildOrderBook(tickerForPaperBook(t), 24, { phase: bookPhase });
  }
  return {
    bids: aggregateBookLevels(raw.bids, group, "bid"),
    asks: aggregateBookLevels(raw.asks, group, "ask"),
    labLive,
    lab,
    waitingLive,
    t,
    group,
  };
}

function renderBook(): string {
  const { bids, asks, labLive, lab, waitingLive, t } = activeBookLevels();
  const pair = pairById(state.activePair);
  const bookView = state.bookView;
  if (!bids.length && !asks.length) {
    const emptyHint = labLive
      ? lab && !waitingLive
        ? "Live book empty — place a limit or wait for resting depth"
        : "Loading live L2 depth…"
      : "Waiting for oracle mid…";
    const emptyTitle = labLive
      ? lab && !waitingLive
        ? "Live book empty"
        : "Live book"
      : "Order book unavailable";
    return `<div class="book-view-tabs segmented">
      <button type="button" class="bv ${bookView !== "depth" ? "active" : ""}" data-bv="book">Book</button>
      <button type="button" class="bv ${bookView === "depth" ? "active" : ""}" data-bv="depth">Depth</button>
    </div><div class="markets-empty"><p class="empty-title">${emptyTitle}</p><p class="muted small">${emptyHint}</p></div>`;
  }
  if (bookView === "depth") {
    return `<div class="book-view-tabs segmented">
      <button type="button" class="bv" data-bv="book">Book</button>
      <button type="button" class="bv active" data-bv="depth">Depth</button>
    </div>${renderVolumeRatio()}${renderDepthPanel(bids, asks, pair.base, pair.quote, { labLive })}`;
  }
  const visibleBids = bids.filter((l) => l.amountBase > 0);
  const visibleAsks = asks.filter((l) => l.amountBase > 0);
  const max = Math.max(...visibleBids.map((b) => b.amountBase), ...visibleAsks.map((a) => a.amountBase), 1);
  const row = (l: (typeof bids)[0], side: "bid" | "ask") => {
    const pct = (l.amountBase / max) * 100;
    const price = l.price;
    const title = labLive
      ? `Set ${side === "ask" ? "Buy" : "Sell"} limit to this live price`
      : `Set ${side === "ask" ? "Buy" : "Sell"} limit to ${formatPrice(price)}`;
    const aria = side === "ask" ? `Buy at ${formatPrice(price)}` : `Sell at ${formatPrice(price)}`;
    return `<div class="ob-row ${side}" data-book-price="${price}" data-book-side="${side}" role="button" tabindex="0" title="${title}" aria-label="${aria}">
      <div class="ob-bar" style="width:${pct}%"></div>
      <span class="ob-price">${formatPrice(price)}</span>
      <span class="ob-amt">${formatBookQty(l.amountBase)}</span>
      <span class="dim ob-total">${formatPrice(l.totalQuote)}</span>
    </div>`;
  };
  const steps = bookStepsForPair(state.activePair);
  const bestBid = visibleBids[0]?.price ?? (lab ? 0 : t.bid);
  const bestAsk = visibleAsks[0]?.price ?? (lab ? 0 : t.ask);
  const {
    midPx,
    spreadAbs,
    spreadPct,
    midHint,
    midTitle,
  } = bookMidFromLevels(state.activePair, bestBid, bestAsk, labLive, t.mid);
  const mobileBook = isMobileLayout();
  return `
    ${
      mobileBook
        ? ""
        : `<div class="book-view-tabs segmented">
      <button type="button" class="bv active" data-bv="book">Book</button>
      <button type="button" class="bv" data-bv="depth">Depth</button>
    </div>`
    }
    ${renderVolumeRatio()}
    ${mobileBook ? "" : `<div class="depth-wrap" aria-hidden="true">${renderDepthSvg(visibleBids, visibleAsks)}</div>`}
    ${
      mobileBook
        ? ""
        : `<div class="book-group-row">
      <label class="muted small">Group</label>
      <select id="book-group-select" class="book-select mono">
        ${steps.map((s) => `<option value="${s.value}" ${state.bookGrouping === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
      </select>
    </div>`
    }
    <div class="ob-head"><span>${mobileBook ? "Price" : `Price (${pair.quote})`}</span><span>${mobileBook ? "Amt" : `Amount (${pair.base})`}</span><span class="ob-total">${mobileBook ? "Tot" : "Total"}</span></div>
    <div class="book-ladder">
      <div class="ob-asks-pane" data-book-pane="asks">${visibleAsks.slice().reverse().map((l) => row(l, "ask")).join("")}</div>
      <div class="ob-mid" title="${midTitle}">
        <div class="ob-mid-price">${formatPrice(midPx)}</div>
        <div class="ob-mid-spread">${
          spreadAbs > 0
            ? `Spread ${formatPrice(spreadAbs)} · ${formatNum(spreadPct, 3)}%`
            : midHint
        }</div>
        ${mobileBook ? "" : `<div class="ob-mid-src muted small">${midHint}</div>`}
      </div>
      <div class="ob-bids-pane" data-book-pane="bids">${visibleBids.map((l) => row(l, "bid")).join("")}</div>
    </div>`;
}

function renderTape(): string {
  ensurePublicTape();
  const live = useLiveBook();
  const rows = mergeTapeRows(state.trades, publicTape, state.activePair, 18);
  if (!rows.length) {
    return `<div class="tape-empty">
      <p class="empty-title">${live ? "No market prints yet" : "No trades yet"}</p>
      <p class="muted small">${
        live
          ? "Public tape fills as the desk matches · your fills highlight here."
          : "Synthetic tape fills in as the oracle ticks."
      }</p>
    </div>`;
  }
  return rows
    .map((t) => {
      const mine = !t.synthetic && state.trades.some((u) => u.id === t.id);
      const cls = t.synthetic ? "syn" : mine ? "you" : "mkt";
      const tip = t.synthetic
        ? "Synthetic public tape (simulated)"
        : mine
          ? live
            ? "Your fill"
            : "Your paper fill"
          : "Public market print";
      const badge = t.synthetic ? "SYN" : mine ? (t.feeRole === "maker" ? "M" : "T") : "MKT";
      return `<div class="tape-row ${cls}" title="${tip}">
        <span class="${t.side === "buy" ? "up" : "down"}">${formatPrice(t.price)}</span>
        <span class="mono">${formatBookQty(t.amountBase)}</span>
        <span class="role-badge sm ${t.synthetic ? "syn-badge" : t.feeRole}">${badge}</span>
        <span class="dim">${new Date(t.ts).toLocaleTimeString()}</span>
      </div>`;
    })
    .join("");
}

function renderMobileTradeTape(): string {
  ensurePublicTape();
  const live = useLiveBook();
  const rows = mergeTapeRows(state.trades, publicTape, state.activePair, 8);
  if (!rows.length) {
    return `<div class="mobile-tape-empty muted small">${live ? "No market prints yet" : "No trades yet"}</div>`;
  }
  return rows
    .slice(0, 4)
    .map(
      (t) => `<div class="mobile-tape-row ${t.side === "buy" ? "up" : "down"}">
        <span class="mono">${formatPrice(t.price)}</span>
        <span class="mono dim">${formatBookQty(t.amountBase)}</span>
      </div>`,
    )
    .join("");
}

function patchMobileTradeTape(): void {
  const el = document.getElementById("mobile-trade-tape");
  const wrap = document.getElementById("mobile-trade-tape-wrap");
  if (el) el.innerHTML = renderMobileTradeTape();
  if (wrap) {
    ensurePublicTape();
    const rows = mergeTapeRows(state.trades, publicTape, state.activePair, 8);
    wrap.classList.toggle("is-empty", rows.length === 0);
    wrap.hidden = rows.length === 0;
  }
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
      return renderSpotEmptyState("alerts");
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
      return `${renderSpotEmptyState("history")}
        <div class="act-export-row">
          <button type="button" class="btn-sm" id="btn-export-fills" disabled>Export fills CSV</button>
          <button type="button" class="btn-sm" id="btn-export-orders">Export orders CSV</button>
    </div>`;
  }
    return `<div class="act-export-row">
        <button type="button" class="btn-sm" id="btn-export-fills">Export fills CSV</button>
        <button type="button" class="btn-sm" id="btn-export-orders">Export orders CSV</button>
      </div>
      <div class="act-list">${rows
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
    return `${renderSpotEmptyState("orders")}
      <p class="muted small act-empty-hint">${
        fills
          ? `Past fills are under Fills · resting limits stay here until hit or cancel`
          : isDeskConnectEnabled()
            ? `Use Trade tab Buy/Sell · Limit rests on the live book; Market fills against L2`
            : `Use Trade tab Buy/Sell · Limit rests on the book; Market fills instantly`
      }</p>`;
  }
  return `<div class="act-list">${rows
    .map((o) => {
      const p = pairById(o.pairId);
      const priceCell =
        o.kind === "limit"
          ? `<button type="button" class="link mono act-edit" data-amend-id="${escapeHtml(o.id)}" data-amend-field="price" title="Edit price">${formatPrice(o.price)}</button>`
          : `<span>${formatPrice(o.price)}</span>`;
      const stopCell = o.stopPrice
        ? o.kind === "stop_limit"
          ? `<button type="button" class="link mono act-edit dim" data-amend-id="${escapeHtml(o.id)}" data-amend-field="stop" title="Edit stop">stop ${formatPrice(o.stopPrice)}</button>`
          : `<span class="dim">stop ${formatPrice(o.stopPrice)}</span>`
        : "";
      return `<div class="act-row">
      <div class="act-line">
        <span class="${o.side === "buy" ? "up" : "down"}">${escapeHtml(o.side).toUpperCase()}</span>
        <span>${escapeHtml(orderTypeLabel(o.kind, o))}${o.postOnly ? " PO" : ""}</span>
        <span class="dim">${p.label}</span>
      </div>
      <div class="act-line mono">
        ${priceCell}
        ${stopCell}
        <button type="button" class="link mono act-edit" data-amend-id="${escapeHtml(o.id)}" data-amend-field="amount" title="Edit amount">×${formatNum(o.amountBase, 2)}</button>
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
  ensureDistinctConvertLegs();
  const vip = activeVipTier(state, market ?? undefined);
  const serverReady = useServerConvert();
  const serverAvail = tradingGuards.convertFeeServer && isLabApiEnabled() && !useServerMatching();
  const feeNote = serverReady
    ? `Server <code>GET/POST /convert</code> · desk mid · VIP taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)}) · net shown`
    : serverAvail
      ? `Server convert ready — Connect on Account · taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)})`
      : isDeskConnectEnabled() && isDeskMatchingLive(deskEdgeSnap.matching)
        ? `Local preview · Connect for server convert · taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)})`
        : `Paper convert · spot taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)}) — same VIP schedule as Spot`;
  const hmcPay =
    state.feeConfig.payFeesInHmc
      ? `Pay fees in HMC on (−${state.feeConfig.hmcDiscountPct}%)${tradingGuards.hmcFeePayServer ? " · server honors" : " · enabled when health advertises hmc_fee_pay"}`
      : `Fees in quote asset · toggle HMC (−${state.feeConfig.hmcDiscountPct}%) on Account or Spot`;

  const activePair = convertPrimaryPair(convertFrom, convertTo);
  const fromOpts = renderConvertAssetOptions(convertFrom);
  const toOpts = renderConvertAssetOptions(convertTo);

  const balRows = CONVERT_UI_ASSETS.map((a) => ({
    symbol: a.symbol,
    name: a.name,
    value: formatNum(freeBalance(state, a.key), 4),
  }));

  const recentRows = state.ledger
    .filter((e) => e.kind === "convert" && e.amount < 0)
    .slice(-6)
    .reverse()
    .map((e) => ({
      note: e.note ?? "",
      amount: formatNum(Math.abs(e.amount), 4),
    }));

  const kicker = isDeskConnectEnabled()
    ? serverReady
      ? "Instant swap · desk convert live"
      : isDeskMatchingLive(deskEdgeSnap.matching)
        ? "Instant swap · Connect for server convert"
        : "Instant swap · paper balances"
    : isLabLoopbackApi()
      ? serverReady
        ? "Instant swap · lab convert"
        : "Instant swap · lab"
      : "Instant swap · paper";

  const holdBanner = isDeskConnectEnabled()
    ? serverReady
      ? `<p class="muted small convert-hold-banner convert-hold-banner--live" role="status">Desk convert uses server mid + VIP taker on HMC/USDT and HMC/SUP (inventory-backed · not the spot book).</p>`
      : isDeskMatchingLive(deskEdgeSnap.matching)
        ? `<p class="muted small convert-hold-banner" role="status">Spot matching is live — Connect on Account to unlock server Convert (HMC/USDT · HMC/SUP). Until then local preview only.</p>`
        : `<p class="muted small convert-hold-banner" role="status">Matching not live on this edge yet — Convert uses local paper balances · HMC/USDT · HMC/SUP.</p>`
    : "";

  return `
  <section class="convert-page glass">
    <div class="convert-shell">
      <header class="convert-hero">
        <p class="kicker">${kicker}</p>
        <h2>Convert</h2>
        <p class="muted convert-lead">Swap at mid · ${feeNote}. No book, no futures.</p>
        ${holdBanner}
        <p class="muted small convert-fee-mode mono">${hmcPay}</p>
      </header>
      <div class="convert-desk-wrap">
      <div class="convert-desk glass-inset">
        ${renderConvertPairTabs(activePair)}
        <div class="cv-swap-stack">
        <div class="cv-leg cv-leg-from">
          <div class="cv-leg-head">
            <span>You pay</span>
            <button type="button" class="linkish" id="cv-max">Max</button>
          </div>
          <div class="cv-leg-row">
            ${renderConvertAssetPicker("from", convertFrom, convertTo)}
            <select id="cv-from" class="cv-sel-native" aria-hidden="true" tabindex="-1">${fromOpts}</select>
            <div class="cv-amt-wrap cv-amt-wrap-inline">
              <label class="muted small cv-amt-label" for="cv-amt">Amount</label>
              <input id="cv-amt" class="inp mono cv-amt-inp" type="number" min="0" step="any" value="${escapeHtml(convertAmtStr)}" aria-label="Amount you pay" placeholder="0.00" inputmode="decimal" />
            </div>
          </div>
          <div class="cv-bal muted small mono" id="cv-from-bal"></div>
          <div class="cv-pct" role="group" aria-label="Quick size">
            <button type="button" data-cv-pct="25">25%</button>
            <button type="button" data-cv-pct="50">50%</button>
            <button type="button" data-cv-pct="75">75%</button>
            <button type="button" data-cv-pct="100">Max</button>
          </div>
        </div>
        <div class="cv-flip-wrap">
          <button type="button" class="cv-flip" id="cv-flip" title="Flip direction" aria-label="Flip You pay and You receive">${Ico.swap()}</button>
        </div>
        <div class="cv-leg cv-leg-to">
          <div class="cv-leg-head"><span>You receive</span><span class="muted small" id="cv-to-label">Net after fee</span></div>
          <div class="cv-leg-row">
            ${renderConvertAssetPicker("to", convertTo, convertFrom)}
            <select id="cv-to" class="cv-sel-native" aria-hidden="true" tabindex="-1">${toOpts}</select>
            <div class="cv-receive-wrap cv-receive-wrap-inline">
              <span class="muted small cv-receive-label">Estimated receive</span>
              <div class="cv-receive mono" id="cv-got" aria-live="polite">—</div>
            </div>
          </div>
        </div>
        </div>
        <div class="cv-quote mono" id="cv-quote">
          <div class="cv-q-head">
            <span>Quote details</span>
            <span class="cv-quote-age" id="cv-quote-age" aria-live="polite">—</span>
          </div>
          <div class="cv-q-row"><span>You pay</span><span id="cv-pay">—</span></div>
          <div class="cv-q-row"><span>You receive</span><span id="cv-recv-line">—</span></div>
          <div class="cv-q-row"><span>Rate</span><span id="cv-rate">—</span></div>
          <div class="cv-q-row"><span>Fee</span><span id="cv-fee">—</span></div>
          <div class="cv-q-row"><span>Pair</span><span id="cv-route-label">—</span></div>
        </div>
        <div class="cv-slippage-row">
          <span class="cv-slippage-label muted small">Slippage guard</span>
          <div class="cv-slippage-field mono">
            <input id="cv-slippage-bps" class="cv-slippage-inp" type="number" min="0" max="500" step="5" value="${loadConvertSlippageBps()}" aria-label="Slippage guard bps" />
            <span class="cv-slippage-suffix">bps</span>
          </div>
        </div>
        <label class="cv-confirm-row muted small">
          <input type="checkbox" id="cv-confirm-large" ${convertConfirmLarge ? "checked" : ""} />
          Confirm when spending &gt;50% of available balance
        </label>
        <button type="button" class="btn-primary btn-block cv-go" id="cv-go" aria-live="polite">Convert</button>
        <p class="muted small cv-hint" id="cv-hint">HMC/USDT or HMC/SUP · live preview before you confirm</p>
        <div class="cv-actions">
          <button type="button" class="btn-sm" id="cv-open-spot" title="Open matching Spot market">Trade on Spot →</button>
        </div>
      </div>
      <aside class="convert-side glass-inset">
        <h3>Balances</h3>
        <ul class="cv-bal-list">${renderConvertBalanceList(balRows)}</ul>
        <h3>Recent</h3>
        ${renderConvertRecentList(
          recentRows,
          isDeskConnectEnabled() ? "desk" : isLabLoopbackApi() ? "lab" : "paper",
        )}
      </aside>
      </div>
    </div>
  </section>`;
}

function refreshConvertPreview(): void {
  void refreshConvertPreviewAsync();
}

function paintConvertCta(go: HTMLButtonElement | null, amt: number, disabled: boolean): void {
  if (!go) return;
  go.disabled = disabled;
  go.textContent = convertCtaLabel(
    assetSymbol(convertFrom),
    assetSymbol(convertTo),
    amt,
    (n) => formatNum(n, convertFrom === "usdt" ? 4 : 4),
  );
}

function paintConvertQuoteAge(ok: boolean): void {
  const ageEl = document.getElementById("cv-quote-age");
  if (!ageEl) return;
  if (!ok) {
    ageEl.textContent = "—";
    ageEl.classList.remove("fresh", "stale");
    return;
  }
  lastConvertQuoteAt = Date.now();
  ageEl.textContent = formatConvertQuoteAge(lastConvertQuoteAt);
  ageEl.classList.add("fresh");
  ageEl.classList.remove("stale");
}

async function refreshConvertPreviewAsync(): Promise<void> {
  const seq = ++convertPreviewSeq;
  const balEl = document.getElementById("cv-from-bal");
  const gotEl = document.getElementById("cv-got");
  const rateEl = document.getElementById("cv-rate");
  const feeEl = document.getElementById("cv-fee");
  const routeEl = document.getElementById("cv-route-label");
  const payEl = document.getElementById("cv-pay");
  const recvLine = document.getElementById("cv-recv-line");
  const hint = document.getElementById("cv-hint");
  const go = document.getElementById("cv-go") as HTMLButtonElement | null;
  if (!balEl || !gotEl || !rateEl || !feeEl || !routeEl) return;

  ensureDistinctConvertLegs();
  const avail = freeBalance(state, convertFrom, market ?? undefined);
  balEl.textContent = `Available ${formatNum(avail, 4)} ${assetSymbol(convertFrom)}`;
  const pickerBals: Partial<Record<keyof Wallet, string>> = {};
  for (const a of CONVERT_UI_ASSETS) {
    pickerBals[a.key] = formatNum(freeBalance(state, a.key, market ?? undefined), 4);
  }
  patchConvertPickerBalances(pickerBals);
  syncConvertPickerUi(convertFrom, convertTo);

  const route = routeForAssets(convertFrom, convertTo);
  if (!route || !isPrimaryConvertRoute(route)) {
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = "—";
    if (payEl) payEl.textContent = "—";
    if (recvLine) recvLine.textContent = "—";
    routeEl.textContent = "Pick HMC/USDT or HMC/SUP";
    paintConvertQuoteAge(false);
    if (hint) hint.textContent = "Primary pairs only — HMC/USDT or HMC/SUP";
    paintConvertCta(go, 0, true);
    return;
  }
  routeEl.textContent = CONVERT_ROUTES.find((r) => r.id === route)?.label ?? route;

  const amt = Number(convertAmtStr);
  if (!market || !(amt > 0)) {
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = "—";
    if (payEl) payEl.textContent = "—";
    if (recvLine) recvLine.textContent = "—";
    paintConvertQuoteAge(false);
    if (hint) hint.textContent = "Enter amount to see live receive + fee";
    paintConvertCta(go, amt, !(amt > 0));
    return;
  }

  const r = CONVERT_ROUTES.find((x) => x.id === route)!;
  const def = convertRouteDef(route)!;
  const [fromSym, toSym] = r.label.split(" → ").map((s) => s.trim());
  const fromSnap = convertFrom;
  const toSnap = convertTo;
  const amtSnap = convertAmtStr;

  // Server session: preview from ConvertMid (seed/default) — not pool-oracle / last trade.
  // Never fall back to paper mids while server convert is live (misleading preview → failed submit).
  if (useServerConvert()) {
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
      lastConvertPreviewNet = netDisp;
      gotEl.textContent = formatPrice(netDisp);
      if (payEl) payEl.textContent = `${formatPrice(amt)} ${assetSymbol(convertFrom)}`;
      if (recvLine) recvLine.textContent = `${formatPrice(netDisp)} ${assetSymbol(convertTo)}`;
      rateEl.textContent = convertRateLabel(
        assetSymbol(convertFrom),
        assetSymbol(convertTo),
        midDisp,
        def.invert,
        formatPrice,
      );
      feeEl.textContent = q.paid_in_hmc
        ? `Taker ${formatBps(q.fee_bps)} · server · est ${formatPrice(feeH)} HMC`
        : `Taker ${formatBps(q.fee_bps)} · server · est ${formatPrice(feeQ)} ${pairQuoteSym(def.pair)}`;
      paintConvertQuoteAge(true);
      if (hint) {
        hint.textContent =
          avail < amt
            ? `Need ${formatPrice(amt - avail)} more ${assetSymbol(convertFrom)}`
            : `You receive ≈ ${formatPrice(netDisp)} ${assetSymbol(convertTo)} net (gross ${formatPrice(gotDisp)}) · desk mid (Soft-MM / last trade)`;
      }
      const maxOk = maxConvertibleFrom();
      paintConvertCta(go, amt, avail < amt || amt > maxOk + 1e-12);
      return;
    }
    const reject = formatExchangeReject(q);
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = reject;
    if (payEl) payEl.textContent = "—";
    if (recvLine) recvLine.textContent = "—";
    paintConvertQuoteAge(false);
    if (hint) {
      hint.textContent =
        q.code === "min_notional"
          ? `${reject} — raise amount`
          : q.code === "invalid_order"
            ? `${reject} — try a smaller size (pair qty/price caps)`
            : q.code === "convert_inventory"
              ? `${reject} — clamp Max or open Spot book`
              : reject;
    }
    paintConvertCta(go, amt, true);
    return;
  }

  const prev = previewConvert(state, market, route, amt);
  if (isConvertPreviewError(prev)) {
    gotEl.textContent = "—";
    rateEl.textContent = "—";
    feeEl.textContent = prev.reason;
    if (payEl) payEl.textContent = "—";
    if (recvLine) recvLine.textContent = "—";
    paintConvertQuoteAge(false);
    if (hint) hint.textContent = prev.reason;
    paintConvertCta(go, amt, true);
    return;
  }
  const p = prev as ConvertPreview;
  const net = convertNetReceive(p);
  lastConvertPreviewNet = net;
  gotEl.textContent = formatPrice(net);
  if (payEl) payEl.textContent = `${formatPrice(amt)} ${assetSymbol(convertFrom)}`;
  if (recvLine) recvLine.textContent = `${formatPrice(net)} ${assetSymbol(convertTo)}`;
  rateEl.textContent = convertRateLabel(
    assetSymbol(convertFrom),
    assetSymbol(convertTo),
    p.mid,
    def.invert,
    formatPrice,
  );
  feeEl.textContent = convertFeeHintLine(p);
  paintConvertQuoteAge(true);
  if (hint) {
    hint.textContent =
      avail < amt
        ? `Need ${formatPrice(amt - avail)} more ${assetSymbol(convertFrom)}`
        : amt > maxConvertibleFrom() + 1e-12
          ? `Leave fee buffer — Max uses ≈ ${formatPrice(maxConvertibleFrom())}`
          : `You receive ≈ ${formatPrice(net)} ${assetSymbol(convertTo)} net${
              p.fee.paidInHmc ? " · fee in HMC" : p.fee.feeQuote > 0 ? " · fee from quote" : ""
            }`;
  }
  const maxOk = maxConvertibleFrom();
  paintConvertCta(go, amt, avail < amt || amt > maxOk + 1e-12);
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
  if (amt > avail) {
    toast("Insufficient free balance (reserved in open orders)", "warn");
    return;
  }
  const maxOk = maxConvertibleFrom();
  if (amt > maxOk + 1e-12) {
    toast("Amount leaves no room for convert fee — use Max or lower", "warn");
    return;
  }
  if (convertConfirmLarge && amt > avail * 0.5) {
    if (!confirm(`Convert ${formatNum(amt, 4)} ${assetSymbol(convertFrom)} (>50% of balance)?`)) return;
  }

  const r = CONVERT_ROUTES.find((x) => x.id === route)!;
  const def = convertRouteDef(route)!;
  const [from, to] = r.label.split(" → ").map((s) => s.trim());

  const slippageBps = loadConvertSlippageBps();
  if (slippageBps > 0 && lastConvertPreviewNet > 0) {
    let freshNet = 0;
    if (useServerConvert()) {
      const q = await getLabConvertQuote({
        from,
        to,
        amount: displayToMinor(amt),
        pay_fee_in_hmc:
          tradingGuards.hmcFeePayServer && state.feeConfig.payFeesInHmc ? true : undefined,
      });
      if (q.ok) freshNet = minorToDisplay(q.net_to);
    } else {
      const fresh = previewConvert(state, market, route, amt);
      if (!isConvertPreviewError(fresh)) freshNet = convertNetReceive(fresh);
    }
    const driftBps = convertSlippageDriftBps(lastConvertPreviewNet, freshNet);
    if (driftBps > slippageBps) {
      const driftPct = (driftBps / 100).toFixed(2);
      if (
        !confirm(
          `Quote moved ${driftPct}% since preview (guard ${slippageBps} bps). Continue with ≈ ${formatPrice(freshNet)} ${assetSymbol(convertTo)}?`,
        )
      ) {
        return;
      }
    }
  }
  const go = document.getElementById("cv-go") as HTMLButtonElement | null;
  convertInFlight = true;
  if (go) go.disabled = true;

  try {
  if (isLabSessionStale()) {
    toast("Session stale — reconnect (convert frozen)", "warn");
    return;
  }
  if (useServerConvert() && def) {
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
      const resultDriftBps =
        slippageBps > 0 && lastConvertPreviewNet > 0
          ? convertSlippageDriftBps(lastConvertPreviewNet, net)
          : 0;
      const driftNote =
        resultDriftBps > slippageBps
          ? ` · preview drift ${(resultDriftBps / 100).toFixed(2)}%`
          : "";
      const lane = useDeskMatching() ? "Desk" : "Lab";
      toast(
        `${lane} convert → ${formatNum(net, 4)} net${formatLabConvertFeeToast(
          {
            ...apiRes,
            feeQuoteDisplay,
            feeHmcDisplay,
          },
          def ? pairQuoteSym(def.pair) : "USDT",
        )}${driftNote}`,
        resultDriftBps > slippageBps ? "warn" : "ok",
      );
      softPatchConvertDesk();
      return;
    }
    // Session + advertised /convert: don't invent balances — surface API error.
    toast(formatExchangeReject(apiRes), "warn");
    return;
  }

  // Lab connected without /convert advertisement — never paper-convert (ledger desync).
  // Desk without convert GO may still paper-convert (soft-launch).
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
    list.innerHTML = renderConvertBalanceList(
      CONVERT_UI_ASSETS.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        value: formatNum(freeBalance(state, a.key), 4),
      })),
    );
  }
  const side = document.querySelector(".convert-side");
  if (side) {
    const recentRows = state.ledger
      .filter((e) => e.kind === "convert" && e.amount < 0)
      .slice(-6)
      .reverse()
      .map((e) => ({
        note: e.note ?? "",
        amount: formatNum(Math.abs(e.amount), 4),
      }));
    const recentH = [...side.querySelectorAll("h3")].find((h) => /recent/i.test(h.textContent || ""));
    if (recentH) {
      let node = recentH.nextElementSibling;
      while (
        node &&
        (node.matches("p.muted") ||
          node.matches("ul.cv-recent") ||
          node.matches("p.cv-recent-empty") ||
          node.matches(".cv-recent-empty"))
      ) {
        const next = node.nextElementSibling;
        node.remove();
        node = next;
      }
      const wrap = document.createElement("div");
      wrap.innerHTML = renderConvertRecentList(
        recentRows,
        isDeskConnectEnabled() ? "desk" : isLabLoopbackApi() ? "lab" : "paper",
      );
      const child = wrap.firstElementChild;
      if (child) recentH.after(child);
    }
  }
  softPatchFeePayChrome();
  refreshConvertPreview();
  patchAccountDomIfPresent();
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
    const deskReady = tradingGuards.convertFeeServer && useServerMatching();
    const feeNote = deskReady
      ? `Server <code>GET/POST /convert</code> · desk mid · VIP taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)}) · net shown`
      : labReady
        ? `Lab <code>GET/POST /convert</code> · desk mid · VIP taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)}) · net shown`
        : labAvail
          ? `Lab convert ready — connect fixture on Account · taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)})`
          : `Paper convert · spot taker ${formatBps(vip.takerBps)} (${escapeHtml(vip.name)}) — same VIP schedule as Spot`;
    lead.innerHTML = `Swap at desk mid · ${feeNote}. No book, no futures.`;
  }
  // Keep Spot + Account checkboxes in sync when either is toggled.
  const acct = document.getElementById("acct-pay-hmc") as HTMLInputElement | null;
  const spot = document.getElementById("pay-fees-hmc") as HTMLInputElement | null;
  if (acct) acct.checked = state.feeConfig.payFeesInHmc;
  if (spot) spot.checked = state.feeConfig.payFeesInHmc;
}

function persistConvertDesk(): void {
  ensureDistinctConvertLegs();
  saveConvertDesk(convertFrom, convertTo, convertAmtStr);
  if (state.mainView === "convert") syncRouteHash();
}

function wireConvertDesk(): void {
  const desk = document.querySelector(".convert-desk");
  if (!desk || desk.getAttribute("data-cv-wired") === "1") return;
  desk.setAttribute("data-cv-wired", "1");

  const fromSel = document.getElementById("cv-from") as HTMLSelectElement | null;
  const toSel = document.getElementById("cv-to") as HTMLSelectElement | null;
  const amtInp = document.getElementById("cv-amt") as HTMLInputElement | null;
  if (!fromSel || !toSel || !amtInp) return;

  const sync = () => {
    convertFrom = fromSel.value as keyof Wallet;
    convertTo = toSel.value as keyof Wallet;
    convertAmtStr = amtInp.value;
    document.querySelectorAll("[data-cv-pct]").forEach((btn) => btn.classList.remove("active"));
    ensureDistinctConvertLegs();
    fromSel.value = convertFrom;
    toSel.value = convertTo;
    syncConvertPickerUi(convertFrom, convertTo);
    persistConvertDesk();
    refreshConvertPreview();
  };

  fromSel.addEventListener("change", sync);
  toSel.addEventListener("change", sync);
  amtInp.addEventListener("input", sync);
  wireConvertAssetPickers(fromSel, toSel, sync);

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
    syncConvertPickerUi(convertFrom, convertTo);
    persistConvertDesk();
    refreshConvertPreview();
  });

  document.getElementById("cv-max")?.addEventListener("click", () => {
    convertAmtStr = String(maxConvertibleFrom());
    amtInp.value = convertAmtStr;
    markConvertPct(100);
    persistConvertDesk();
    refreshConvertPreview();
  });

  document.querySelectorAll("[data-cv-pct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pct = Number((btn as HTMLElement).dataset.cvPct ?? 0);
      const avail = maxConvertibleFrom();
      convertAmtStr = String((avail * pct) / 100);
      amtInp.value = convertAmtStr;
      markConvertPct(pct);
      persistConvertDesk();
      refreshConvertPreview();
    });
  });

  document.querySelectorAll("[data-cv-pair]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.cvPair as ConvertPrimaryPair | undefined;
      if (!id) return;
      const next = applyConvertPrimaryPair(id, convertFrom, convertTo);
      convertFrom = next.from;
      convertTo = next.to;
      fromSel.value = convertFrom;
      toSel.value = convertTo;
      const route = routeForAssets(convertFrom, convertTo);
      const defAmt = route ? convertChipDefaultAmount(route) : null;
      if (defAmt && !(Number(convertAmtStr) > 0)) {
        convertAmtStr = defAmt;
        amtInp.value = defAmt;
      }
      syncConvertPickerUi(convertFrom, convertTo);
      persistConvertDesk();
      refreshConvertPreview();
    });
  });

  document.getElementById("cv-confirm-large")?.addEventListener("change", (e) => {
    convertConfirmLarge = (e.target as HTMLInputElement).checked;
    try {
      sessionStorage.setItem("hackme-ex-cv-confirm-large", convertConfirmLarge ? "1" : "0");
    } catch {
      /* ignore */
    }
  });

  document.getElementById("cv-slippage-bps")?.addEventListener("change", (e) => {
    const n = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(n)) saveConvertSlippageBps(n);
  });

  document.getElementById("cv-go")?.addEventListener("click", () => {
    void runConvertDesk();
  });

  document.getElementById("cv-open-spot")?.addEventListener("click", () => {
    const route = routeForAssets(convertFrom, convertTo);
    const pair = route ? convertRouteDef(route)?.pair : null;
    const viewWasSpot = state.mainView === "spot";
    state.mainView = "spot";
    saveState(state);
    syncRouteHash();
    if (viewWasSpot && pair) {
      switchActivePair(pair);
      return;
    }
    if (pair) {
      state.activePair = pair;
      pushRecentPair(pair);
      saveState(state);
    }
    ensurePublicTape(true);
    chartMounted = false;
    render();
    void refresh();
  });

  refreshConvertPreview();
}

function runPoolWorkerLookup(): Promise<void> {
  return (async () => {
    const inp = document.getElementById("pool-worker-addr") as HTMLInputElement | null;
    const out = document.getElementById("pool-worker-result");
    if (!inp || !out) return;
    out.innerHTML = `<span class="muted small">Looking up…</span>`;
    const result = await lookupWorkersByAddress(inp.value);
    out.innerHTML = renderWorkerLookupResult(result);
  })();
}

function wirePoolPage(): void {
  const page = document.querySelector(".pool-page");
  if (!page || page.getAttribute("data-pool-wired") === "1") return;
  page.setAttribute("data-pool-wired", "1");

  document.getElementById("pool-worker-search")?.addEventListener("click", () => {
    void runPoolWorkerLookup();
  });
  document.getElementById("pool-worker-addr")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runPoolWorkerLookup();
    }
  });

  document.getElementById("pool-copy-url")?.addEventListener("click", async () => {
    const url = document.getElementById("pool-endpoint-url")?.textContent?.trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Pool API URL copied", "ok");
    } catch {
      toast("Copy failed — select the URL manually", "info");
    }
  });
  document.querySelectorAll(".pool-jump a").forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = (link as HTMLAnchorElement).getAttribute("href");
      if (!href?.startsWith("#")) return;
      e.preventDefault();
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  applyPendingDeepLinks();
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
  if (market && repairStaleEquityBaseline(state, market)) saveState(state);
  const pnl = market ? pnlPct(state, market) : 0;
  const av = availBalance(pair);
  const displayTip = state.chartMode === "heikin" ? (getDisplayedLastCandle() ?? candles.slice(-1)[0] ?? null) : (candles.slice(-1)[0] ?? null);
  const ohlcSource = lastOhlc ?? displayTip;
  const ohlc = formatOhlcLegendText(ohlcSource, t.mid);
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
  const layoutClass = state.multiChartLayout !== "1" ? `layout-${state.multiChartLayout} multi-chart-grid` : "";

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
      <h1 class="notranslate" translate="no">${pair.label}</h1>
          <span class="tb-sub muted small">${
            useLabMatching()
              ? "Lab book · live matching"
              : useDeskMatching()
                ? "Desk book · live matching"
                : usePublicDeskBook()
                  ? "Desk book · Connect to trade"
                  : "Paper Spot · reference mids"
          }</span>
    </div>
        <span class="tb-chev" aria-hidden="true">▾</span>
      </button>
      <div class="tb-quote">
        <span class="tb-price notranslate ${tone}" translate="no">${formatPrice(tradeMid)}</span>
        <span class="tb-chg notranslate ${tone}" translate="no">${formatPct(ch)}</span>
        ${
          pair.quote !== "USDT" && market
            ? `<span class="tb-fiat muted small notranslate" translate="no" data-tb-usdt="1">≈ ${formatPrice(
                tradeMid *
                  (pair.quote === "BTC" ? market.btcUsd : pair.quote === "SUP" ? market.supUsdt : 1),
              )} USDT</span>`
            : ""
        }
      </div>
    </div>
    <div class="tb-stats">
      <div><label>24h High</label><span class="mono notranslate" translate="no">${formatPrice(s24.high24h || t.high24h)}</span></div>
      <div><label>24h Low</label><span class="mono notranslate" translate="no">${formatPrice(s24.low24h || t.low24h)}</span></div>
      <div title="Rolling 24h base volume from durable fills (not calendar midnight reset)"><label>24h Vol (${noTranslateText(pair.base)})</label><span class="mono notranslate" translate="no">${
        useLiveBook()
          ? formatLiveVol24h(pair.id, pair.base)
          : formatVolBase(s24.vol24h || t.volume24hBase, pair.base)
      }</span></div>
      <div><label>Spread</label><span class="mono notranslate" translate="no">${formatNum(liveSpreadPct(t), 3)}%</span></div>
    </div>
    <div class="tb-right">
      <div class="vip-badge mono" title="30d vol ${formatNum(vipProg.vol, 0)} USDT${vipProg.next ? ` · next ${vipProg.next.name}` : ""}">
        <span class="vip-name" title="${
          hasServerVipVolume()
            ? "VIP from server GET /vip (30d USDT fills)"
            : useServerMatching()
              ? "VIP pending server sync — local estimate"
              : useLiveBook()
                ? "Live book — Connect to sync desk VIP volume"
                : "VIP from local paper trade history"
        }">${escapeHtml(vip.name)}</span>
        ${
          hasServerVipVolume()
            ? `<span class="vip-demo muted small">live</span>`
            : useServerMatching()
              ? `<span class="vip-demo muted small">sync…</span>`
              : useLiveBook()
                ? `<span class="vip-demo muted small">live</span>`
                : `<span class="vip-demo muted small">paper</span>`
        }
        <span class="vip-rates">${formatBps(vip.makerBps)} / ${formatBps(vip.takerBps)}</span>
        <div class="vip-bar"><i style="width:${vipProg.pct.toFixed(0)}%"></i></div>
      </div>
      <button type="button" class="btn-sm alerts-chip" id="btn-open-alerts" title="Price alerts">Alerts${alertCount ? ` · ${alertCount}` : ""}</button>
      <button type="button" class="btn-sm" id="btn-hotkeys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
    <div class="pnl-chip mono">PnL <span class="${Math.abs(pnl) < 5e-3 ? "flat" : pnl >= 0 ? "up" : "down"}">${Math.abs(pnl) < 5e-3 ? "flat" : `${pnl >= 0 ? "+" : ""}${formatNum(pnl, 2)}%`}</span></div>
  </div>
  </div>
  ${
    recentPairs.length
      ? `<div class="recent-pairs" id="recent-pairs" aria-label="Recent markets">${recentPairs
          .map((p) => {
            const meta = pairById(p);
            const mid = pairQuote(p).mid;
            return `<button type="button" class="recent-pair" data-recent-pair="${escapeHtml(p)}"><span class="notranslate" translate="no">${escapeHtml(meta.label)}</span>${
              mid ? `<span class="mono muted notranslate" translate="no">${formatPrice(mid)}</span>` : ""
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
      <div class="mobile-trade-tape-wrap is-empty" id="mobile-trade-tape-wrap" aria-label="Recent trades" hidden>
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
          <button type="button" class="layout-chip ${!layoutPrefs.bottomCollapsed ? "active" : ""}" id="chip-orders" data-panel="orders" title="Orders · fills · cancel" aria-pressed="${!layoutPrefs.bottomCollapsed ? "true" : "false"}">Orders</button>
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
          <div class="mobile-ohlc-bar mono" id="mobile-ohlc-bar" aria-live="polite">${ohlc}</div>
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
          deskEdgeLive: usePublicDeskBook(),
          deskSession: useDeskMatching(),
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
        <details class="oracle-transparency-details" id="oracle-transparency-details">
          <summary class="muted small">Oracle transparency</summary>
          ${market && poolLive ? renderOracleTransparencyPanel(oracleMeta, market, poolLive) : ""}
        </details>
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
      ${renderPanelRail("orders", "btn-expand-orders", "Orders", "Show orders · fills · cancel")}
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
    <button type="button" class="cm" data-chart-more="fullscreen" role="menuitem">${state.chartFullscreen ? "Exit fullscreen" : "Fullscreen"}</button>
    <button type="button" class="cm" data-chart-more="volume" role="menuitem">${state.chartOverlays.showVolume ? "Hide volume" : "Show volume"}</button>
    <button type="button" class="cm" data-chart-more="indicators" role="menuitem">Indicators</button>
    <button type="button" class="cm" data-chart-more="overlays" role="menuitem">Overlays</button>
    <button type="button" class="cm" data-chart-more="style" role="menuitem">Chart style</button>
    <button type="button" class="cm" data-chart-more="goto" role="menuitem">Go to date</button>
    <button type="button" class="cm" data-chart-more="screenshot" role="menuitem">Screenshot</button>
    <button type="button" class="cm" data-chart-more="hotkeys" role="menuitem">Shortcuts</button>
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
  const brandTitle = embed ? "Exchange" : isMobileLayout() ? "HackMe" : "HackMe Exchange";
  const brandSub = embed
    ? isDeskConnectEnabled()
      ? useDeskMatching() || usePublicDeskBook()
        ? "hub embed · desk live"
        : "hub embed · desk"
      : isLabLoopbackApi()
        ? "hub embed · lab"
        : "hub embed · paper"
    : isDeskConnectEnabled()
      ? useDeskMatching()
        ? "Spot · desk live"
        : usePublicDeskBook()
          ? "Spot · desk · Connect to trade"
          : "Spot · desk"
      : isLabLoopbackApi()
        ? "Spot · lab"
        : "Spot · paper";
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
      <button type="button" class="nav-btn ${view === "account" ? "active" : ""}" data-view="account"><span class="nav-label-full">Account</span><span class="nav-label-short" aria-hidden="true">Acct</span></button>
      <button type="button" class="nav-btn ${view === "pool" ? "active" : ""}" data-view="pool">Pool</button>
    </nav>
    <div class="ex-actions">
      <span class="pill-live paper" id="node-status">${modeStatusPill()}</span>
      <button type="button" class="btn-ico btn-settings-quick" id="btn-settings-quick" title="Settings" aria-label="Open settings">${Ico.settings()}</button>
      <div class="sys-menu-wrap">
        <button type="button" class="btn-sm" id="btn-system-status" aria-haspopup="true" aria-expanded="false" aria-label="System menu">⚙ <span class="sys-label">System</span></button>
        <div class="sys-backdrop hidden" id="sys-backdrop" aria-hidden="true"></div>
        <div class="sys-drop hidden" id="sys-drop" role="menu">
          <p class="muted small">${
            useDeskMatching() || usePublicDeskBook()
              ? `Soft-launch Spot · ${modeChromeLabel()}`
              : useLabMatching()
                ? `Lab · ${modeChromeLabel()}`
                : `Mode <b class="mono">${INTEGRATION.mode}</b> · ${modeChromeLabel()}`
          }</p>
          <button type="button" class="sys-item" id="btn-settings">${Ico.settings()} Settings</button>
          <button type="button" class="sys-item" id="btn-settings-wallet" data-settings-tab="wallet">${Ico.wallet()} Wallet &amp; security</button>
          ${
            embed
              ? `<button type="button" class="sys-item" id="btn-sync-node-header" title="Hub wallet balances">↻ Sync HMC/SUP</button>
          <a class="sys-link" href="${escapeHtml(nodeWalletUrl())}" id="link-node-wallet" target="_blank" rel="noreferrer">Hub wallet</a>`
              : `<a class="sys-link" href="${escapeHtml(nodeWalletUrl())}" id="link-node-wallet" target="_blank" rel="noreferrer">Node wallet</a>
          <button type="button" class="sys-item" id="btn-sync-node-header" title="Local hackme-node on this device (127.0.0.1:8080) or Hub embed">↻ Sync HMC/SUP (local node)</button>
          <a class="sys-link" href="https://hackme.tech/pool/coordinator/api/pool/stats" target="_blank" rel="noreferrer">Official pool</a>
          <a class="sys-link" href="https://hackme.tech/downloads.html#start" target="_blank" rel="noreferrer">Mine ${pairById(state.activePair).base}</a>`
          }
          <input type="file" id="import-demo-file" accept="application/json,.json" class="hidden" />
          <button type="button" class="sys-item danger" id="btn-reset">Reset demo</button>
        </div>
      </div>
    </div>
  </header>
  ${view === "spot" ? renderSpot() : view === "convert" ? renderConvert() : view === "account" ? renderAccountPage(state, market, { feeWallet: labFeeWallet, nodeWallet: cachedNodeWallet, deskEdge: deskEdgeSnap, wallet: state.wallet, totpEnabled: labUser2faEnabled }) : renderPoolPage(poolLive, market, { poolAddress: pendingPoolAddress, oracleMeta })}
  ${view === "pool" && !embed ? `<div class="mining-strip mono" id="mining-strip">
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
    applyPendingDeepLinks();
    if (isLabApiEnabled()) {
      void maybeAutoReconnectLabSession();
      if (useServerMatching()) {
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
    patchAccountFundsDom(state, market, { feeWallet: labFeeWallet, nodeWallet: cachedNodeWallet });
  }
  if (state.mainView === "pool" && poolLive && market) {
    patchPoolLiveDom(poolLive, market, oracleMeta);
  }
  if (state.mainView === "convert") {
    refreshConvertPreview();
  }
}

function evaluatePriceAlerts(mid: number, pairId: PairId = state.activePair): void {
  const last = lastMidForAlertsByPair.get(pairId) ?? 0;
  if (!last) {
    lastMidForAlertsByPair.set(pairId, mid);
    return;
  }
  let changed = false;
  for (const a of state.priceAlerts) {
    if (a.fired || a.pairId !== pairId) continue;
    const crossed =
      (last < a.price && mid >= a.price) || (last > a.price && mid <= a.price);
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
  lastMidForAlertsByPair.set(pairId, mid);
  if (changed) {
    saveState(state);
    refreshOpenOrderChartLines();
    if (activityTab === "alerts") refreshActivityPanel();
  }
}

/** Fire alerts for active + multi-pane pairs (not only the focused chart). */
function evaluateAllPriceAlerts(): void {
  const ids = new Set<PairId>([state.activePair]);
  if (state.multiChartLayout !== "1") {
    const n = state.multiChartLayout === "4" ? 4 : 2;
    for (let i = 1; i <= n; i++) ids.add(panePair(i));
  }
  for (const a of state.priceAlerts) {
    if (!a.fired) ids.add(a.pairId);
  }
  for (const pid of ids) {
    const mid = spotMidForPair(pid);
    if (mid > 0) evaluatePriceAlerts(mid, pid);
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
    hapticLight();
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

/** Soft-update Account balances when the page is mounted (trade/convert without remount). */
function patchAccountDomIfPresent(): void {
  if (!market || !document.getElementById("acct-total-eq")) return;
  snapshotEquity(state, market);
  patchAccountFundsDom(state, market, { feeWallet: labFeeWallet, nodeWallet: cachedNodeWallet });
}

function refreshAfterLabTrade(): void {
  if (market && repairStaleEquityBaseline(state, market)) saveState(state);
  saveState(state);
  patchModeChrome();
  patchLive();
  patchAvailChips();
  refreshOpenOrderChartLines();
  refreshActivityPanel();
  const tape = document.getElementById("tape");
  if (tape) tape.innerHTML = renderTape();
  patchMobileTradeTape();
  patchAccountDomIfPresent();
}

/**
 * After mint/sync/bridge/withdraw — update Account numbers without remounting
 * (Asset roadmap / withdraw form stay put). Connect/logout still full-render.
 */
function refreshAccountAfterLab(): void {
  if (!market) return;
  if (repairStaleEquityBaseline(state, market)) saveState(state);
  if (state.mainView === "account") {
    snapshotEquity(state, market);
    patchAccountFundsDom(state, market, { feeWallet: labFeeWallet, nodeWallet: cachedNodeWallet });
    patchNonSpotChrome();
    return;
  }
  refreshAfterLabTrade();
}

/** Apply paper matching against live blended mids; refresh Orders + chart lines when anything fills/cancels. */
function settleOpenOrdersFromTickers(showToast = false): string[] {
  if (!market || useServerMatching()) return [];
  const notes = processOpenOrders(state, market, tickers);
  const attached = flushPendingTpslAttaches();
  if (!notes.length && !attached) return notes;
  saveState(state);
  patchAvailChips();
  refreshOpenOrderChartLines();
  const openLeft = state.orders.some((o) => o.status === "open" || o.status === "triggered");
  if (!openLeft && activityTab === "orders") activityTab = "history";
  refreshActivityPanel();
  if (showToast && notes.length) toast(notes[0], "info");
  return notes;
}

/** Reconnect when address/seed survived reload but CSRF did not — cookie first, then desk/lab re-sign. */
async function maybeAutoReconnectLabSession(): Promise<void> {
  const meta = getLabSessionMeta();
  if (meta.hasCsrf) return;
  if (!meta.address && !(isDeskConnectEnabled() && hasDeskSeed())) return;
  const desk = isDeskConnectEnabled();
  const msg =
    document.getElementById(desk ? "desk-api-msg" : "lab-api-msg") ||
    document.getElementById("lab-api-msg") ||
    document.getElementById("desk-api-msg");
  if (msg) msg.textContent = "Restoring desk session…";
  const res = await labSessionRestoreOrConnect();
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    return;
  }
  const sync = await syncLabBalancesAndBook(state, market);
  if (sync.ok) {
    saveState(state);
    const note =
      res.via === "session"
        ? "Session restored from cookie"
        : res.via === "desk"
          ? "Desk wallet reconnected"
          : "Fixture re-signed";
    if (msg) msg.textContent = `${note} · ${res.address.slice(0, 14)}…`;
    toast(note, "ok");
    refreshAccountAfterLab();
    patchOpenSettingsWalletChrome();
  } else if (msg) {
    msg.textContent = sync.message;
    if (isHubEmbed() && isSessionRequiredError(sync)) {
      toast(hubEmbedSessionBlockedHint(), "warn");
    }
  }
}

/** Lab ledger sync (balances, open orders, fills, book). Does not touch node /api/wallet. */
async function syncLabLedgerUi(): Promise<void> {
  const desk = isDeskConnectEnabled();
  const msgEl =
    document.getElementById(desk ? "desk-api-msg" : "lab-api-msg") ||
    document.getElementById("lab-api-msg") ||
    document.getElementById("desk-api-msg") ||
    document.getElementById("sync-node-msg");
  const res = await syncLabBalancesAndBook(state, market);
  if (!res.ok) {
    if (msgEl) msgEl.textContent = res.message;
    toast(
      isHubEmbed() && isSessionRequiredError(res) ? hubEmbedSessionBlockedHint() : res.message,
      "warn",
    );
    return;
  }
  saveState(state);
  if (msgEl) msgEl.textContent = res.note;
  if (desk && !isLabLoopbackApi()) {
    toast(
      useServerMatching() ? "Desk ledger synced · live matching" : useLiveBook() ? "Desk ledger synced · live book (Connect to trade)" : "Desk ledger synced · paper Spot",
      "info",
    );
  } else {
    toast(res.note, "ok");
  }
  refreshAccountAfterLab();
}

function currentSettingsWalletChrome(): SettingsWalletChrome {
  const sess = labSessionLabel();
  let deskAddr = sess.address;
  if (!deskAddr && isDeskConnectEnabled()) {
    try {
      deskAddr = deskWalletIdentity().address;
    } catch {
      /* ignore */
    }
  }
  return {
    deskConnect: isDeskConnectEnabled(),
    deskSessionLabel: sess.label,
    deskAddress: deskAddr || undefined,
    sessionLive: sess.live,
    labLoopback: isLabLoopbackApi(),
    hubWalletHref: nodeWalletUrl(),
    hubEmbed: isHubEmbed(),
    matching: deskEdgeSnap.matching,
    depositEnabled: deskEdgeSnap.depositEnabled,
    withdrawEnabled: deskEdgeSnap.withdrawEnabled,
    maxOpenOrders: deskEdgeSnap.maxOpenOrders,
    minNotional: deskEdgeSnap.minNotional,
    priceBandBps: deskEdgeSnap.priceBandBps,
  };
}

function patchOpenSettingsWalletChrome(): void {
  patchSettingsWalletSessionChrome(currentSettingsWalletChrome());
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
    const soft = /Local node only/i.test(snap.reason);
    toast(snap.reason, soft ? "info" : "warn");
    return;
  }
  cachedNodeWallet = { hmc: snap.hmc, sup: snap.sup };
  if (useServerMatching() || isLabApiEnabled()) {
    // FE-M-STALE: never overwrite lab/desk ledger when exchange API is opted in.
    const note = useServerMatching()
      ? `Node ${formatNum(snap.hmc, 4)} HMC / ${formatNum(snap.sup, 4)} SUP · Spot uses server ledger — Sync balances`
      : isDeskConnectEnabled()
        ? `Node online · desk Connect — Spot stays paper until matching GO (no paper merge)`
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
    patchAccountFundsDom(state, market!, { feeWallet: labFeeWallet, nodeWallet: cachedNodeWallet });
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
  startMarketStreamLoop();
  // Full remount so Deposit/Withdraw buttons + hints match live CSRF session.
  if (state.mainView === "account") render();
  else {
    const addrEl = document.getElementById("lab-session-addr");
    if (addrEl) addrEl.textContent = res.fixture.address;
    refreshAfterLabTrade();
  }
}

async function deskWalletConnectUi(): Promise<void> {
  const msg = document.getElementById("desk-api-msg");
  if (msg) msg.textContent = "Connecting browser HMC wallet…";
  const paperEq =
    state.wallet.usdt + state.wallet.hmc + state.wallet.sup + state.wallet.btc;
  if (paperEq > 0 && !useServerMatching()) {
    if (
      !window.confirm(
        "Connect desk wallet?\n\nPaper Spot balances stay in this browser until matching is live. Desk Connect opens a session only — it will not wipe your paper funds.",
      )
    ) {
      if (msg) msg.textContent = "Connect canceled";
      return;
    }
  }
  const res = await deskWalletConnect();
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(`Desk Connect: ${res.message}`, "warn");
    return;
  }
  if (msg) msg.textContent = `Connected ${res.wallet.address} · ${useServerMatching() ? "matching live" : useLiveBook() ? "live book · Connect to trade" : "paper Spot"}`;
  toast(`Desk wallet connected · ${res.wallet.address.slice(0, 14)}…`, "ok");
  // Sync desk ledger (or HOLD probe). Cookie must ride for /balances.
  {
    const sync = await syncLabBalancesAndBook(state, market);
    if (sync.ok) {
      saveState(state);
      if (msg) msg.textContent = `${msg.textContent} · ${sync.note}`;
    } else {
      if (msg) msg.textContent = `${msg.textContent} · ledger sync: ${sync.message}`;
      if (isHubEmbed() && isSessionRequiredError(sync)) {
        toast(hubEmbedSessionBlockedHint(), "warn");
      } else {
        toast(formatExchangeReject(sync), "warn");
      }
    }
  }
  if (market && repairStaleEquityBaseline(state, market)) saveState(state);
  if (state.mainView === "account") render();
  else {
    const addrEl = document.getElementById("desk-session-addr");
    if (addrEl) addrEl.textContent = res.wallet.address;
  }
  patchOpenSettingsWalletChrome();
}

async function deskCopyAddressUi(): Promise<void> {
  const sess = labSessionLabel();
  let addr = sess.address;
  if (!addr && isDeskConnectEnabled()) {
    try {
      addr = deskWalletIdentity().address;
    } catch {
      /* ignore */
    }
  }
  if (!addr) {
    toast("No desk address yet — Connect first", "warn");
    return;
  }
  const ok = await copyTextToClipboard(addr);
  if (deskEdgeSnap.depositEnabled) {
    toast(
      ok
        ? `Copied Connect/login ${addr.slice(0, 14)}… — NOT for deposits. Use Account → Deposit → Show HMC / SUP / USDT deposit address`
        : "Clipboard blocked",
      ok ? "warn" : "warn",
    );
    return;
  }
  toast(ok ? `Copied ${addr.slice(0, 18)}…` : "Clipboard blocked", ok ? "ok" : "warn");
}

async function deskNewWalletUi(): Promise<void> {
  if (labSessionLabel().live) {
    await authLogout();
    clearLabBookCache();
  }
  clearDeskSeed();
  toast("Desk seed cleared — connecting new wallet…", "info");
  await deskWalletConnectUi();
}

function deskExportSeedUi(): void {
  if (!isDeskConnectEnabled()) {
    toast("Desk Connect off in this build", "warn");
    return;
  }
  if (
    !window.confirm(
      "Export SECRET desk seed backup?\n\nAnyone with this file can Connect as your HMC address. Never share, screenshot, or commit it.",
    )
  ) {
    return;
  }
  const backup = buildDeskSeedBackup();
  const stamp = backup.address.replace(/^HMC-/, "").slice(0, 8);
  downloadText(`hackme-desk-seed-${stamp}.json`, `${JSON.stringify(backup, null, 2)}\n`);
  toast(`Seed backup saved · ${backup.address.slice(0, 14)}… — keep offline`, "warn");
}

async function applyDeskSeedImport(raw: string): Promise<void> {
  const parsed = parseDeskSeedImport(raw);
  if (!parsed.ok) {
    toast(`Import failed: ${parsed.message}`, "warn");
    return;
  }
  const paperEq =
    state.wallet.usdt + state.wallet.hmc + state.wallet.sup + state.wallet.btc;
  if (paperEq > 0 && useServerMatching()) {
    if (
      !window.confirm(
        `Import seed ${parsed.address.slice(0, 14)}…?\n\n` +
          `This browser still shows paper Spot balances (~${paperEq.toFixed(2)} units).\n` +
          `After Connect, Account shows the DESK ledger for this seed (server balances).\n` +
          `Paper demo funds are NOT moved to the desk. Continue?`,
      )
    ) {
      return;
    }
  }
  try {
    localStorage.setItem(
      "hackme.paper.wallet.snapshot.v1",
      JSON.stringify({
        at: new Date().toISOString(),
        wallet: { ...state.wallet },
        note: "Saved before desk seed import — paper only, not desk custody",
      }),
    );
  } catch {
    /* ignore quota */
  }
  if (labSessionLabel().live) {
    await authLogout();
    clearLabBookCache();
  }
  persistDeskSeed(parsed.seedHex);
  toast(`Seed imported · ${parsed.address.slice(0, 14)}… — syncing desk ledger…`, "info");
  await deskWalletConnectUi();
  // Second sync — first paint can race CSRF/session; ensure ledger lands in UI.
  if (useServerMatching()) {
    const sync = await syncLabBalancesAndBook(state, market);
    if (sync.ok) {
      saveState(state);
      toast(
        `Desk ledger · ${formatNum(state.wallet.hmc, 4)} HMC · ${formatNum(state.wallet.usdt, 2)} USDT · ${formatNum(state.wallet.sup, 4)} SUP`,
        "ok",
      );
    } else if (isHubEmbed() && isSessionRequiredError(sync)) {
      toast(hubEmbedSessionBlockedHint(), "warn");
    } else {
      toast(`Connected but ledger sync failed: ${sync.message} — tap Reconnect desk`, "warn");
    }
  }
  const deskEq = state.wallet.usdt + state.wallet.hmc + state.wallet.sup + state.wallet.btc;
  if (useServerMatching() && deskEq <= 0) {
    toast(
      "Desk ledger is 0 for this seed — use Account → Deposit (not Connect addr). Paper snapshot kept if you had demo funds.",
      "warn",
    );
  }
  // Remount Account so asset table / empty-state aren't stuck on pre-sync zeros.
  if (state.mainView === "account") render();
  else patchOpenSettingsWalletChrome();
  patchOpenSettingsWalletChrome();
}

function deskImportSeedUi(): void {
  if (!isDeskConnectEnabled()) {
    toast("Desk Connect off in this build", "warn");
    return;
  }
  if (
    !window.confirm(
      "Import replaces this tab’s desk seed and reconnects.\n\nUse a backup JSON or 64-hex seed from your other device. Continue?",
    )
  ) {
    return;
  }
  const pasted = window.prompt("Paste backup JSON or 64-hex seed.\nLeave empty to choose a file instead:", "");
  if (pasted === null) return;
  if (pasted.trim()) {
    void applyDeskSeedImport(pasted);
    return;
  }
  const existing = document.getElementById("desk-seed-import-file") as HTMLInputElement | null;
  const input = existing ?? document.createElement("input");
  if (!existing) {
    input.type = "file";
    input.accept = "application/json,.json,.txt,text/plain";
    input.className = "hidden";
    document.body.appendChild(input);
  }
  input.value = "";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 32_768) {
      toast("Backup file too large", "warn");
      return;
    }
    void file.text().then((text) => applyDeskSeedImport(text));
  };
  input.click();
}

async function refreshDeskEdgeHealthUi(): Promise<boolean> {
  healthBackoffUntil = 0;
  const before = { ...deskEdgeSnap };
  try {
    await refreshTradingGuardsFromHealth();
  } catch {
    return false;
  }
  const changed =
    before.matching !== deskEdgeSnap.matching ||
    before.depositEnabled !== deskEdgeSnap.depositEnabled ||
    before.withdrawEnabled !== deskEdgeSnap.withdrawEnabled;
  // If health failed silently (unreachable), snap stays default/previous — still refresh DOM.
  const row = document.getElementById("set-desk-hold");
  if (row) {
    const matching = formatDeskMatchingLabel(deskEdgeSnap.matching);
    const vals = [
      { on: isDeskMatchingLive(deskEdgeSnap.matching), text: `matching · ${matching}` },
      { on: deskEdgeSnap.depositEnabled, text: `deposit · ${deskEdgeSnap.depositEnabled ? "on" : "HOLD"}` },
      { on: deskEdgeSnap.withdrawEnabled, text: `withdraw · ${deskEdgeSnap.withdrawEnabled ? "on" : "HOLD"}` },
    ];
    row.querySelectorAll(".settings-hold-pill").forEach((el, i) => {
      const v = vals[i];
      if (!v) return;
      el.setAttribute("data-on", v.on ? "1" : "0");
      el.textContent = v.text;
    });
  }
  patchOpenSettingsWalletChrome();
  // Treat unchanged default HOLD after failed probe as soft fail when API wired but backoff set.
  if (isDeskConnectEnabled() || isLabApiEnabled()) {
    if (Date.now() < healthBackoffUntil && !changed) return false;
  }
  return true;
}

async function labApiLogoutUi(): Promise<void> {
  const res = await authLogout();
  clearLabBookCache();
  const desk = isDeskConnectEnabled();
  const msg =
    document.getElementById(desk ? "desk-api-msg" : "lab-api-msg") ||
    document.getElementById("lab-api-msg") ||
    document.getElementById("desk-api-msg");
  if (msg) msg.textContent = res.ok ? "Logged out" : res.message;
  toast(
    res.ok ? (desk ? "Desk session cleared" : "Lab session cleared") : res.message,
    res.ok ? "info" : "warn",
  );
  if (state.mainView === "account") render();
  else {
    for (const id of ["lab-session-addr", "desk-session-addr"]) {
      const addrEl = document.getElementById(id);
      if (addrEl) addrEl.textContent = "not connected";
    }
    patchModeChrome();
    if (state.mainView === "spot") forcePaintBook();
  }
  patchOpenSettingsWalletChrome();
}

async function labRevokeAllUi(): Promise<void> {
  const res = await authRevokeAll();
  clearLabBookCache();
  const desk = isDeskConnectEnabled();
  const msg =
    document.getElementById(desk ? "desk-api-msg" : "lab-api-msg") ||
    document.getElementById("lab-api-msg") ||
    document.getElementById("desk-api-msg");
  if (msg) msg.textContent = res.ok ? `All sessions revoked (sv=${res.session_version ?? "?"})` : res.message;
  toast(
    res.ok
      ? desk
        ? "All desk sessions revoked — reconnect"
        : "All lab sessions revoked — reconnect"
      : res.message,
    res.ok ? "info" : "warn",
  );
  if (state.mainView === "account") render();
  else {
    for (const id of ["lab-session-addr", "desk-session-addr"]) {
      const addrEl = document.getElementById(id);
      if (addrEl) addrEl.textContent = "not connected";
    }
    patchModeChrome();
  }
  patchOpenSettingsWalletChrome();
}

async function showDepositAddrUi(asset: string): Promise<void> {
  const deskOk = isDeskConnectEnabled() && getLabSessionMeta().hasCsrf;
  const labOk = useLabMatching();
  if (!labOk && !deskOk) {
    toast(isDeskConnectEnabled() ? "Connect desk wallet first" : "Connect DEMO/LAB fixture first", "warn");
    return;
  }
  if (isDeskConnectEnabled() && !deskEdgeSnap.depositEnabled && !labOk) {
    toast("Deposits are HOLD on this edge", "warn");
    return;
  }
  const msg = document.getElementById("lab-deposit-msg");
  const res = await fetchDepositAddress(asset);
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(res.message, "warn");
    return;
  }
  const dep = res.deposit_address;
  const connectAddr = getLabSessionMeta().address || (() => {
    try {
      return deskWalletIdentity().address;
    } catch {
      return "";
    }
  })();
  if (connectAddr && dep.toLowerCase() === connectAddr.toLowerCase()) {
    toast("Server returned Connect address as deposit — refuse (bug)", "warn");
    return;
  }
  const reveal = document.getElementById("lab-deposit-reveal");
  const addrInp = document.getElementById("lab-deposit-addr") as HTMLInputElement | null;
  const metaEl = document.getElementById("lab-deposit-meta");
  const chipsEl = document.getElementById("lab-deposit-chips");
  const stepsEl = document.getElementById("lab-deposit-steps");
  const qrHost = document.getElementById("lab-deposit-qr-host");
  const qrImg = document.getElementById("lab-deposit-qr") as HTMLImageElement | null;
  if (reveal) reveal.hidden = false;
  if (addrInp) addrInp.value = dep;
  if (stepsEl) stepsEl.hidden = false;
  // Mark active asset pill
  document.querySelectorAll(".cex-asset-pill").forEach((el) => {
    el.classList.toggle("active", (el as HTMLElement).dataset.asset === res.asset);
  });
  if (metaEl) {
    if (res.kind === "evm_bep20" || res.asset === "USDT") {
      const bits = [
        res.standard || "BEP-20",
        res.network || (res.chain_id === 97 ? "BSC_TESTNET" : res.chain_id === 56 ? "BSC" : "BSC"),
        res.chain_id ? `chain ${res.chain_id}` : "",
        res.contract ? `contract ${res.contract}` : "",
      ].filter(Boolean);
      metaEl.hidden = false;
      metaEl.textContent = bits.join(" · ");
    } else {
      metaEl.hidden = true;
      metaEl.textContent = "";
    }
  }
  if (chipsEl) {
    const chips: string[] = [];
    if (res.asset === "USDT" || res.kind === "evm_bep20") {
      chips.push(`<span class="cex-chip">${escapeHtml(res.standard || "BEP-20")}</span>`);
      chips.push(
        `<span class="cex-chip cex-chip--net">${escapeHtml(
          res.chain_id === 56 ? "BSC mainnet · 56" : res.chain_id === 97 ? "BSC testnet · 97" : `chain ${res.chain_id ?? "?"}`,
        )}</span>`,
      );
      chips.push(`<span class="cex-chip cex-chip--min">min ${USDT_DEPOSIT_MIN} USDT</span>`);
      chips.push(`<span class="cex-chip">≥${USDT_CONFIRMATIONS} conf</span>`);
    } else {
      chips.push(`<span class="cex-chip">${escapeHtml(res.asset)}</span>`);
      chips.push(`<span class="cex-chip cex-chip--net">HackMe chain</span>`);
    }
    chipsEl.hidden = false;
    chipsEl.innerHTML = chips.join("");
  }
  if (qrImg && qrHost) {
    try {
      qrImg.src = await QRCode.toDataURL(dep, {
        width: 148,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#061018", light: "#ffffff" },
      });
      qrImg.hidden = false;
      qrHost.hidden = false;
    } catch {
      qrImg.hidden = true;
      qrHost.hidden = true;
    }
  }
  if (msg) {
    const creditHint =
      res.kind === "evm_bep20"
        ? res.chain_id === 56
          ? `MAINNET BSC · min ${USDT_DEPOSIT_MIN} USDT · watcher → HOLD → KYT → release; send only USDT BEP-20 (not testnet/TRC/ERC)`
          : "watcher → HOLD → KYT screen → release; send only USDT BEP-20 on this network"
        : "credits usually within ~30s after chain confirm";
    const usdtHoldHint =
      res.kind === "evm_bep20"
        ? ` · after ≥${USDT_CONFIRMATIONS} confs USDT stays in screening hold until ops approve KYT (manual — not instant)`
        : "";
    msg.innerHTML = `<strong>${escapeHtml(res.asset)} deposit ready</strong> · ${creditHint}${usdtHoldHint}${
      res.warning ? ` · <span class="muted">${escapeHtml(res.warning)}</span>` : ""
    }`;
  }
  toast(`${asset} deposit: ${dep.slice(0, 22)}…`, "ok");
  void copyTextToClipboard(dep).then((ok) => {
    if (ok) toast(`${asset} deposit address copied`, "info");
  });
  // Poll ledger so on-chain → node-watch / BSC watch credits appear without a manual Sync.
  void watchDeskBalancesAfterDeposit(asset);
}

let depositWatchTimer: number | undefined;
let depositWatchLeft = 0;
let depositWatchAsset = "";

async function watchDeskBalancesAfterDeposit(asset = ""): Promise<void> {
  if (depositWatchTimer) window.clearInterval(depositWatchTimer);
  depositWatchAsset = (asset || "").toUpperCase();
  // USDT needs BSC confs + KYT — poll longer; HMC/SUP ~30s node-watch.
  depositWatchLeft = depositWatchAsset === "USDT" ? 24 : 10; // ×8s
  const prev = { ...state.wallet };
  const prevHolds = getLedgerHolds().map((h) => `${h.asset}:${h.hold}`).join("|");
  const tick = async () => {
    depositWatchLeft -= 1;
    const sync = await syncLabBalancesAndBook(state, market);
    if (sync.ok) {
      saveState(state);
      const grew =
        state.wallet.usdt > prev.usdt ||
        state.wallet.hmc > prev.hmc ||
        state.wallet.sup > prev.sup ||
        state.wallet.btc > prev.btc;
      const holdNow = getLedgerHolds().map((h) => `${h.asset}:${h.hold}`).join("|");
      const holdGrew = holdNow !== prevHolds && getLedgerHolds().some((h) => h.hold > 0);
      if (grew) {
        toast("Deposit credited — Available updated", "ok");
        refreshAccountAfterLab();
        patchAvailChips();
        if (depositWatchTimer) window.clearInterval(depositWatchTimer);
        depositWatchTimer = undefined;
        return;
      }
      if (holdGrew && depositWatchAsset === "USDT") {
        toast("USDT seen — screening hold until ops approve KYT (manual)", "info");
        refreshAccountAfterLab();
        if (depositWatchTimer) window.clearInterval(depositWatchTimer);
        depositWatchTimer = undefined;
        return;
      }
      if (state.mainView === "account") refreshAccountAfterLab();
    }
    if (depositWatchLeft <= 0 && depositWatchTimer) {
      window.clearInterval(depositWatchTimer);
      depositWatchTimer = undefined;
      const stillHeld = getLedgerHolds().some((h) => h.hold > 0 && (!depositWatchAsset || h.asset === depositWatchAsset));
      if (stillHeld) {
        toast("Deposit in screening hold — waiting for ops KYT approve (not automatic)", "info");
        const msg = document.getElementById("lab-deposit-msg");
        if (msg) {
          msg.textContent =
            "Screening hold — ops must approve KYT before Available updates (manual soft-launch; not automatic).";
        }
      } else if (depositWatchAsset === "USDT") {
        toast("No USDT credit yet — after ≥15 BSC confs it lands in hold for manual KYT", "info");
        const msg = document.getElementById("lab-deposit-msg");
        if (msg) {
          msg.textContent =
            "Watching BSC… after ≥15 confs USDT lands in screening hold for manual KYT — Sync on Account if status looks stale.";
        }
      } else if (depositWatchAsset) {
        toast(`${depositWatchAsset} not credited yet — node-watch can take a bit; Sync on Account or wait`, "info");
        const msg = document.getElementById("lab-deposit-msg");
        if (msg) {
          msg.textContent = `${depositWatchAsset} not credited yet — node-watch can take a bit; Sync on Account or wait.`;
        }
      }
      if (state.mainView === "account") refreshAccountAfterLab();
    }
  };
  void tick();
  depositWatchTimer = window.setInterval(() => void tick(), 8_000);
}

async function labShowDepositAddr(asset: string): Promise<void> {
  await showDepositAddrUi(asset);
}

async function labMintHmcUi(displayAmt = 100): Promise<void> {
  const msg = document.getElementById("lab-deposit-msg");
  if (!useLabMatching()) {
    toast("Connect DEMO/LAB fixture first", "warn");
    return;
  }
  if (!labDepositEnabled) {
    toast("Deposits paused — check runbook hint", "warn");
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
  if (!labDepositEnabled) {
    toast("Deposits paused — check runbook hint", "warn");
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

function renderLabWithdrawList(
  rows: {
    id: string;
    asset: string;
    amount: number;
    status: string;
    destination: string;
    created_at?: string;
    fail_reason?: string;
  }[],
): void {
  const ul = document.getElementById("lab-wd-list");
  if (!ul) return;
  if (!rows.length) {
    ul.innerHTML = "<li class=\"dim\">No withdraw requests</li>";
    return;
  }
  ul.innerHTML = rows
    .map((w) => {
      const st = String(w.status || "").toLowerCase();
      const age = w.created_at ? Date.parse(w.created_at) : NaN;
      const ageMin = Number.isFinite(age) ? Math.max(0, Math.round((Date.now() - age) / 60_000)) : null;
      const assetU = String(w.asset || "").toUpperCase();
      const statusLabel =
        st === "pending"
          ? assetU === "USDT"
            ? `pending${ageMin != null ? ` · ${ageMin}m` : ""} · KYT / ops broadcast (no auto hot-send)`
            : `pending${ageMin != null ? ` · ${ageMin}m` : ""} · waiting ops on-chain`
          : st === "kyt_pending" || st === "submitted"
            ? `KYT review${ageMin != null ? ` · ${ageMin}m` : ""}`
            : st === "failed"
              ? `failed${w.fail_reason ? ` · ${escapeHtml(String(w.fail_reason).slice(0, 40))}` : ""}`
              : escapeHtml(w.status);
      const tone = st === "pending" ? "warn" : st === "completed" ? "up" : st === "failed" ? "down" : "dim";
      return `<li><span class="dim">${escapeHtml(w.id.slice(0, 8))}…</span> ${escapeHtml(w.asset)} ${minorToDisplay(w.amount)} → ${escapeHtml(w.destination.slice(0, 18))}… <strong class="${tone}">${statusLabel}</strong></li>`;
    })
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
  const deskOk = isDeskConnectEnabled() && getLabSessionMeta().hasCsrf;
  const labOk = useLabMatching();
  if (!labOk && !deskOk) {
    toast(isDeskConnectEnabled() ? "Connect desk wallet first" : "Connect DEMO/LAB fixture first", "warn");
    return;
  }
  if (isDeskConnectEnabled() && !deskEdgeSnap.withdrawEnabled && !labOk) {
    toast("Withdrawals are HOLD on this edge", "warn");
    return;
  }
  if (!labWithdrawEnabled) {
    toast("Withdrawals paused — check runbook hint above", "warn");
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
  const amtCheck = validateLabWithdrawAmount(amtDisp, asset);
  if (!amtCheck.ok) {
    if (msg) msg.textContent = amtCheck.hint;
    toast(amtCheck.hint, "warn");
    return;
  }
  if (!destination) {
    toast("Amount and destination required", "warn");
    return;
  }
  // Public desk always requires TOTP/recovery; lab requires once enrolled.
  const deskNeeds2fa = deskOk && !labOk;
  if (deskNeeds2fa && !labUser2faEnabled) {
    toast("Enable 2FA first — enroll Authenticator under Desk session", "warn");
    document.getElementById("acct-security-2fa")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!totp && (labUser2faEnabled || deskNeeds2fa)) {
    toast("2FA code required — enter TOTP or recovery code", "warn");
    document.getElementById("lab-wd-2fa")?.focus();
    return;
  }
  const selfAddr = getLabSessionMeta().address || "";
  const destCheck = validateLabWithdrawDestination(asset, destination, selfAddr);
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
      const lower = res.message.toLowerCase();
      if (lower.includes("2fa") || lower.includes("totp")) {
        document.getElementById("acct-security-2fa")?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (msg) msg.textContent = `${res.message} — enroll 2FA below if needed`;
        toast(res.message, "warn");
        return;
      }
      if (msg) msg.textContent = res.message;
      toast(res.message, "warn");
      return;
    }
    const totpEl = document.getElementById("lab-wd-2fa") as HTMLInputElement | null;
    if (totpEl) totpEl.value = "";
    if (msg) msg.textContent = `Requested ${res.withdraw.id.slice(0, 8)}… · pending — funds reserved until ops sends on-chain (not automatic)${
      res.fee_quote && res.fee_quote.fee > 0
        ? ` · fee ${minorToDisplay(res.fee_quote.fee)} ${res.withdraw.asset}`
        : ""
    }`;
    toast("Withdraw queued · pending until ops completes on-chain", "info");
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
    if (quoteEl) quoteEl.textContent = "Enter amount · Quote fee for custody total";
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
  labDepositEnabled = res.deposit_enabled !== false;
  labWithdrawEnabled = res.withdraw_enabled !== false;
  applyLabCustodyPauseUi();
  const q = res.quote;
  if (!q) return;
  const minW = q.min_withdraw && q.min_withdraw > 0 ? q.min_withdraw : 0;
  const minLine =
    minW > 0 ? ` · min ${minorToDisplay(minW)} ${asset}` : "";
  quoteEl2.textContent = q.paused
    ? `Paused — ${q.note || "unavailable"}`
    : q.note === "below minimum withdraw for asset"
      ? `Below min withdraw${minLine} · fee would be ${minorToDisplay(q.fee)} ${q.asset} on top`
      : `Fee ${minorToDisplay(q.fee)} ${q.asset} on top · dest gets ${minorToDisplay(q.receive)} · wallet debit ${minorToDisplay(q.debit_total)}${minLine}`;
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

function canManage2fa(): boolean {
  return useLabMatching() || (isDeskConnectEnabled() && getLabSessionMeta().hasCsrf);
}

function applyLab2faPanels(enabled: boolean, pending: boolean, recoveryLeft = 0): void {
  const status = document.getElementById("lab-2fa-status");
  const setupPanel = document.getElementById("lab-2fa-setup-panel");
  const enabledPanel = document.getElementById("lab-2fa-enabled-panel");
  const idlePanel = document.getElementById("lab-2fa-idle-panel");
  const wd2fa = document.getElementById("lab-wd-2fa") as HTMLInputElement | null;
  if (status) {
    status.classList.remove("acct-2fa-status--on", "acct-2fa-status--pending", "acct-2fa-status--off");
    if (enabled) {
      status.classList.add("acct-2fa-status--on");
      status.textContent = `On · ${recoveryLeft} recovery left`;
    } else if (pending) {
      status.classList.add("acct-2fa-status--pending");
      status.textContent = "Pending confirm";
    } else {
      status.classList.add("acct-2fa-status--off");
      status.textContent = "Off";
    }
  }
  if (setupPanel) setupPanel.hidden = !pending;
  if (enabledPanel) enabledPanel.hidden = !enabled;
  if (idlePanel) idlePanel.hidden = enabled || pending;
  if (!pending) clearTotpQr();
  const leftEl = document.getElementById("lab-2fa-recovery-left");
  if (leftEl) leftEl.textContent = enabled ? `Recovery codes remaining: ${recoveryLeft}` : "";
  if (wd2fa) {
    wd2fa.placeholder = enabled ? "TOTP or recovery code" : "enable 2FA first";
    wd2fa.inputMode = "text";
  }
  labUser2faEnabled = enabled;
}

function clearTotpQr(): void {
  const img = document.getElementById("lab-2fa-qr") as HTMLImageElement | null;
  const host = document.getElementById("lab-2fa-qr-host");
  if (img) {
    img.hidden = true;
    img.removeAttribute("src");
  }
  if (host) host.hidden = true;
}

const PENDING_2FA_KEY = "hmc.desk.2fa.pending.v1";
const PENDING_2FA_MAX_AGE_MS = 15 * 60_000;

function savePending2faEnrollment(secret: string, otpauth: string): void {
  const safe = sanitizeOtpauthUrl(otpauth);
  if (!safe || !secret) return;
  try {
    sessionStorage.setItem(
      PENDING_2FA_KEY,
      JSON.stringify({ secret, otpauth: safe, ts: Date.now() }),
    );
  } catch {
    /* ignore quota */
  }
}

function loadPending2faEnrollment(): { secret: string; otpauth: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_2FA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { secret?: string; otpauth?: string; ts?: number };
    if (!parsed.secret || !parsed.otpauth) return null;
    if (parsed.ts && Date.now() - parsed.ts > PENDING_2FA_MAX_AGE_MS) {
      clearPending2faEnrollment();
      return null;
    }
    const safe = sanitizeOtpauthUrl(parsed.otpauth);
    if (!safe) {
      clearPending2faEnrollment();
      return null;
    }
    return { secret: parsed.secret, otpauth: safe };
  } catch {
    return null;
  }
}

function clearPending2faEnrollment(): void {
  try {
    sessionStorage.removeItem(PENDING_2FA_KEY);
  } catch {
    /* ignore */
  }
}

async function restorePending2faIntoDom(): Promise<boolean> {
  const cached = loadPending2faEnrollment();
  if (!cached) return false;
  const secretEl = document.getElementById("lab-2fa-secret");
  const linkEl = document.getElementById("lab-2fa-otpauth") as HTMLAnchorElement | null;
  if (secretEl) secretEl.textContent = cached.secret;
  if (linkEl) {
    linkEl.href = cached.otpauth;
    linkEl.textContent = "Open otpauth link";
    linkEl.rel = "noopener noreferrer";
  }
  await paintTotpQr(cached.otpauth);
  return true;
}

async function paintTotpQr(otpauthUrl: string): Promise<void> {
  const img = document.getElementById("lab-2fa-qr") as HTMLImageElement | null;
  const host = document.getElementById("lab-2fa-qr-host");
  const safe = sanitizeOtpauthUrl(otpauthUrl);
  if (!img || !safe) {
    clearTotpQr();
    return;
  }
  try {
    // Static import (top-level) — CF part-loader breaks relative dynamic chunks.
    img.src = await QRCode.toDataURL(safe, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#061018", light: "#ffffff" },
    });
    img.hidden = false;
    if (host) host.hidden = false;
  } catch {
    clearTotpQr();
  }
}

function showRecoveryCodesOnce(codes: string[] | undefined): void {
  const block = document.getElementById("lab-2fa-recovery-block");
  const grid = document.getElementById("lab-2fa-recovery-codes");
  const actions = document.getElementById("lab-2fa-recovery-actions");
  const copySrc = document.getElementById("lab-2fa-recovery-copy-src") as HTMLTextAreaElement | null;
  if (!grid) return;
  if (!codes?.length) {
    if (block) block.hidden = true;
    grid.hidden = true;
    grid.replaceChildren();
    if (copySrc) copySrc.value = "";
    if (actions) actions.hidden = true;
    return;
  }
  const plain = codes.join("\n");
  if (copySrc) copySrc.value = plain;
  if (block) block.hidden = false;
  grid.hidden = false;
  grid.replaceChildren(
    ...codes.map((code) => {
      const chip = document.createElement("code");
      chip.className = "acct-2fa-recovery-chip mono";
      chip.setAttribute("role", "listitem");
      chip.textContent = code;
      return chip;
    }),
  );
  if (actions) actions.hidden = false;
}

async function lab2faRefreshUi(): Promise<void> {
  const msg = document.getElementById("lab-2fa-msg");
  if (!canManage2fa()) {
    applyLab2faPanels(false, false);
    if (msg) {
      msg.textContent = isDeskConnectEnabled()
        ? "Connect desk wallet to manage 2FA"
        : "Connect LAB session to manage 2FA";
    }
    return;
  }
  const res = await auth2faStatus();
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    return;
  }
  applyLab2faPanels(res.enabled, res.pending, res.recovery_left ?? 0);
  if (msg) msg.textContent = res.note || "";
  // Pending enrollment after reload — restore QR from cache or resume via setup.
  if (res.pending && !res.enabled) {
    if (await restorePending2faIntoDom()) return;
    await lab2faSetupUi({ silent: true });
  } else if (!res.pending) {
    clearPending2faEnrollment();
  }
}

async function lab2faSetupUi(opts?: { silent?: boolean }): Promise<void> {
  const msg = document.getElementById("lab-2fa-msg");
  if (!canManage2fa()) {
    if (!opts?.silent) {
      toast(isDeskConnectEnabled() ? "Connect desk wallet first" : "Connect DEMO/LAB fixture first", "warn");
    }
    return;
  }
  const res = await auth2faSetup();
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    if (!opts?.silent) toast(res.message, "warn");
    return;
  }
  const secretEl = document.getElementById("lab-2fa-secret");
  const linkEl = document.getElementById("lab-2fa-otpauth") as HTMLAnchorElement | null;
  const otpauth = sanitizeOtpauthUrl(res.otpauth_url);
  if (!otpauth) {
    if (msg) msg.textContent = "Invalid otpauth URL from server";
    if (!opts?.silent) toast("2FA setup failed — bad otpauth URL", "warn");
    return;
  }
  if (secretEl) secretEl.textContent = res.secret_base32;
  if (linkEl) {
    linkEl.href = otpauth;
    linkEl.textContent = "Open otpauth link";
    linkEl.rel = "noopener noreferrer";
  }
  savePending2faEnrollment(res.secret_base32, otpauth);
  applyLab2faPanels(false, true);
  await paintTotpQr(otpauth);
  if (!opts?.silent) document.getElementById("lab-2fa-confirm-code")?.focus();
  if (msg) msg.textContent = res.note || "Scan QR on phone → enter 6-digit code";
  if (!opts?.silent) toast("2FA setup started — scan QR, then confirm", "ok");
}

async function lab2faConfirmUi(): Promise<void> {
  const msg = document.getElementById("lab-2fa-msg");
  const code = ((document.getElementById("lab-2fa-confirm-code") as HTMLInputElement | null)?.value || "").trim();
  if (!code) {
    toast("Enter 6-digit code", "warn");
    return;
  }
  const res = await auth2faConfirm(code);
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(res.message, "warn");
    return;
  }
  showRecoveryCodesOnce(res.recovery_codes);
  clearPending2faEnrollment();
  clearTotpQr();
  if (msg) msg.textContent = res.note || "2FA enabled — save recovery codes now";
  toast(res.recovery_codes?.length ? "2FA enabled — save recovery codes" : "2FA enabled", "ok");
  await lab2faRefreshUi();
}

async function lab2faDisableUi(): Promise<void> {
  const msg = document.getElementById("lab-2fa-msg");
  const code = ((document.getElementById("lab-2fa-disable-code") as HTMLInputElement | null)?.value || "").trim();
  if (!code) {
    toast("Enter TOTP or recovery code to disable", "warn");
    return;
  }
  const res = await auth2faDisable(code);
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(res.message, "warn");
    return;
  }
  showRecoveryCodesOnce(undefined);
  clearPending2faEnrollment();
  clearTotpQr();
  if (msg) msg.textContent = res.note || "2FA disabled";
  toast("2FA disabled", "ok");
  await lab2faRefreshUi();
}

async function lab2faRotateUi(): Promise<void> {
  const msg = document.getElementById("lab-2fa-msg");
  const code = ((document.getElementById("lab-2fa-rotate-code") as HTMLInputElement | null)?.value || "").trim();
  if (!code) {
    toast("Enter current TOTP to rotate recovery codes", "warn");
    return;
  }
  const res = await auth2faRecoveryRotate(code);
  if (!res.ok) {
    if (msg) msg.textContent = res.message;
    toast(res.message, "warn");
    return;
  }
  showRecoveryCodesOnce(res.recovery_codes);
  if (msg) msg.textContent = res.note || "Recovery codes rotated";
  toast("New recovery codes — store offline", "ok");
  await lab2faRefreshUi();
}

function applyLabCustodyPauseUi(): void {
  const live = useLabMatching() || (isDeskConnectEnabled() && getLabSessionMeta().hasCsrf);
  const gate = (
    id: string,
    allow: boolean,
    pausedTitle: string,
    offlineTitle = isDeskConnectEnabled() ? "Connect desk wallet first" : "Connect fixture first",
  ) => {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (!el) return;
    el.disabled = !live || !allow;
    if (!live) el.title = offlineTitle;
    else if (!allow) el.title = pausedTitle;
    else el.removeAttribute("title");
  };
  const wdAllow = labWithdrawEnabled && (useLabMatching() || deskEdgeSnap.withdrawEnabled);
  const deskNeeds2faEnroll = isDeskConnectEnabled() && !useLabMatching() && !labUser2faEnabled;
  const wdRequestAllow = wdAllow && !deskNeeds2faEnroll;
  const depAllow = labDepositEnabled && (useLabMatching() || deskEdgeSnap.depositEnabled);
  gate("btn-lab-wd-request", wdRequestAllow, deskNeeds2faEnroll ? "Enable 2FA first" : "Withdrawals paused");
  gate("btn-lab-wd-refresh", wdAllow, "Withdrawals paused");
  gate("btn-lab-wd-quote", wdRequestAllow, deskNeeds2faEnroll ? "Enable 2FA first" : "Withdrawals paused");
  gate("btn-lab-mint-hmc", depAllow && useLabMatching(), "Deposits paused");
  gate("btn-lab-dep-hmc", depAllow, "Deposits paused");
  gate("btn-lab-dep-usdt", depAllow && useLabMatching(), "Deposits paused");
  gate("btn-lab-bridge-usdt", depAllow && useLabMatching(), "Deposits paused");
  gate("btn-lab-bridge-btc", depAllow && useLabMatching(), "Deposits paused");
  const pause = document.getElementById("lab-custody-pause");
  if (pause) {
    const parts: string[] = [];
    if (!labDepositEnabled) parts.push("Deposits paused (health deposit.enabled=false)");
    if (!labWithdrawEnabled) parts.push("Withdrawals paused (health withdraw.enabled=false)");
    if (parts.length) {
      pause.hidden = false;
      pause.textContent = parts.join(" · ");
    } else {
      pause.hidden = true;
      pause.textContent = "";
    }
  }
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
  click("btn-desk-wallet-connect", () => void deskWalletConnectUi());
  click("btn-desk-cash-connect", () => void deskWalletConnectUi());
  click("btn-desk-jump-panel", () => {
    document.getElementById("acct-desk")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  click("btn-desk-api-sync", () => void syncLabLedgerUi());
  click("btn-desk-api-logout", () => void labApiLogoutUi());
  click("btn-desk-api-revoke", () => {
    if (!window.confirm("Revoke all desk sessions for this address?")) return;
    void labRevokeAllUi();
  });
  click("btn-desk-copy-addr", () => void deskCopyAddressUi());
  click("btn-desk-export-seed", () => deskExportSeedUi());
  click("btn-desk-import-seed", () => deskImportSeedUi());
  click("btn-desk-new-key", () => {
    if (
      !window.confirm(
        "Create a new browser desk wallet? This clears the durable browser seed (localStorage) and logs out. Export a backup first if you need this address again.",
      )
    ) {
      return;
    }
    void deskNewWalletUi();
  });
  const seedFile = document.getElementById("desk-seed-import-file") as HTMLInputElement | null;
  if (seedFile) {
    const next = seedFile.cloneNode(true) as HTMLInputElement;
    seedFile.replaceWith(next);
    next.addEventListener("change", () => {
      const file = next.files?.[0];
      if (!file) return;
      if (file.size > 32_768) {
        toast("Backup file too large", "warn");
        return;
      }
      void file.text().then((text) => applyDeskSeedImport(text));
    });
  }
  click("btn-lab-api-sync", () => void syncLabLedgerUi());
  click("btn-lab-api-logout", () => void labApiLogoutUi());
  click("btn-lab-revoke-all", () => void labRevokeAllUi());
  click("btn-lab-counterparty", () => void labCounterpartyUi());
  click("btn-lab-mint-hmc", () => void labMintHmcUi(100));
  click("btn-lab-dep-hmc", () => void labShowDepositAddr("HMC"));
  click("btn-lab-dep-usdt", () => void labShowDepositAddr("USDT"));
  click("btn-desk-dep-hmc", () => void showDepositAddrUi("HMC"));
  click("btn-desk-dep-sup", () => void showDepositAddrUi("SUP"));
  click("btn-desk-dep-usdt", () => void showDepositAddrUi("USDT"));
  click("btn-desk-dep-copy", () => {
    const addr = (document.getElementById("lab-deposit-addr") as HTMLInputElement | null)?.value?.trim() || "";
    if (!addr) {
      toast("Reveal a deposit address first", "warn");
      return;
    }
    void copyTextToClipboard(addr).then((ok) => {
      toast(ok ? "Deposit address copied" : "Copy failed", ok ? "ok" : "warn");
    });
  });
  click("btn-lab-bridge-usdt", () => void labBridgeCreditUi("USDT", 10));
  click("btn-lab-bridge-btc", () => void labBridgeCreditUi("BTC", 0.01));
  click("btn-lab-wd-request", () => void labWithdrawRequestUi());
  click("btn-lab-wd-refresh", () => void labWithdrawRefreshUi());
  click("btn-lab-wd-quote", () => void labWithdrawQuoteUi());
  click("btn-acct-jump-2fa", () => {
    document.getElementById("acct-security-2fa")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("acct-desk")?.setAttribute("open", "");
    document.getElementById("acct-lab")?.setAttribute("open", "");
  });
  click("btn-lab-fills-refresh", () => void labFillsRefreshUi());
  click("btn-lab-2fa-setup", () => void lab2faSetupUi());
  click("btn-lab-2fa-confirm", () => void lab2faConfirmUi());
  click("btn-lab-2fa-disable", () => void lab2faDisableUi());
  click("btn-lab-2fa-rotate", () => void lab2faRotateUi());
  click("btn-lab-2fa-copy-secret", () => {
    const secret = document.getElementById("lab-2fa-secret")?.textContent?.trim() || "";
    if (!secret) {
      toast("No secret yet — start Enable authenticator", "warn");
      return;
    }
    void copyTextToClipboard(secret).then((ok) => {
      toast(ok ? "2FA secret copied" : "Copy failed", ok ? "ok" : "warn");
    });
  });
  click("btn-lab-2fa-copy-recovery", () => {
    const copySrc = (document.getElementById("lab-2fa-recovery-copy-src") as HTMLTextAreaElement | null)?.value?.trim();
    const fromGrid =
      copySrc ||
      [...document.querySelectorAll("#lab-2fa-recovery-codes .acct-2fa-recovery-chip")]
        .map((el) => el.textContent?.trim() || "")
        .filter(Boolean)
        .join("\n");
    if (!fromGrid) {
      toast("No recovery codes on screen", "warn");
      return;
    }
    void copyTextToClipboard(fromGrid).then((ok) => {
      toast(ok ? "Recovery codes copied" : "Copy failed", ok ? "ok" : "warn");
    });
  });
  void lab2faRefreshUi();
  void labWithdrawQuoteUi();
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
    const syncWdAssetUi = () => {
      const asset = (next.value || "HMC").toUpperCase();
      const dest = document.getElementById("lab-wd-dest") as HTMLInputElement | null;
      if (dest) {
        const a = asset.toLowerCase();
        const ph = dest.getAttribute(`data-ph-${a}`) || dest.getAttribute("data-ph-hmc") || "HMC-ffffffffffffffff";
        dest.placeholder = ph;
        if (!dest.value.trim()) dest.value = "";
      }
      const hint = document.getElementById("lab-wd-dest-hint");
      if (hint) hint.textContent = withdrawDestHint(asset);
      const plate = document.getElementById("lab-wd-limits-plate");
      if (plate) {
        plate.outerHTML = withdrawLimitsPlateHtml(asset);
      }
      const availEl = document.getElementById("lab-wd-avail");
      if (availEl) {
        const key = asset.toLowerCase() as "hmc" | "sup" | "usdt" | "btc";
        const raw = Number(availEl.getAttribute(`data-${key}`) || 0);
        const decimals = key === "btc" ? 8 : key === "usdt" ? 4 : 4;
        availEl.innerHTML = `Available: <strong>${raw.toFixed(decimals)} ${asset}</strong>`;
      }
      const amtInp = document.getElementById("lab-wd-amt") as HTMLInputElement | null;
      if (amtInp) {
        amtInp.placeholder = String(withdrawMinForAsset(asset));
        amtInp.min = String(withdrawMinForAsset(asset));
      }
      void labWithdrawQuoteUi();
    };
    next.addEventListener("change", syncWdAssetUi);
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

function activeTradeSide(): "buy" | "sell" {
  if (isMobileLayout()) return loadMobileTradeSide();
  const sellTab = document.querySelector("#trade-side-toggle .ts.sell.active");
  return sellTab ? "sell" : "buy";
}

function fillOrderPanelAtPrice(
  side: "buy" | "sell",
  kind: "limit" | "stop_limit",
  price: number,
  pairId: PairId = state.activePair,
  opts?: { scroll?: boolean },
): void {
  uiType = kind;
  setFormPrice(side, price, pairId);
  const stopInp = document.getElementById(`${side}-stop`) as HTMLInputElement | null;
  if (kind === "stop_limit" && stopInp) stopInp.value = tickInputValue(price, pairId);
  syncOrderTypeTabs(kind);
  toggleOrderFields();
  updatePreviewForSide(side);
  if (isMobileLayout()) setMobileTradeSide(side);
  if (opts?.scroll !== false) {
  document.getElementById("order-zone")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function quickPlaceFromChart(
  side: "buy" | "sell",
  kind: "limit" | "stop_limit",
  price: number,
  pairId: PairId = state.activePair,
  amountOverride?: number,
): void {
  const pair = pairById(pairId);
  const amtInp = document.getElementById(`${side}-amt`) as HTMLInputElement | null;
  let amt = amountOverride ?? Number(amtInp?.value ?? 0);
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
  if (useServerMatching()) {
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
        if (lab.fillCount > 0) {
          upsertAllCandles(lab.order.price || labBookMid(pairId) || price);
        } else {
          toast("Resting on book — use Counterparty bot (Account) to fill", "info");
        }
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
      upsertAllCandles(price);
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
  hapticSuccess();
  refreshOrderLines(state.orders.filter((o) => o.pairId === state.activePair));
  activityTab = "orders";
  document.querySelectorAll("#activity-tabs button").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.tab === "orders");
  });
  document.getElementById("activity-body")!.innerHTML = renderActivityBody();
}

function scrollFocusedChartToTimestamp(ts: number): void {
  const paneId = getFocusedChartPaneId();
  if (paneId === "chart-host") scrollToTimestamp(ts);
  else scrollSecondaryToTimestamp(paneId, ts);
}

function resetFocusedChartView(): void {
  const paneId = getFocusedChartPaneId();
  if (paneId === "chart-host") resetChartView();
  else resetSecondaryPaneView(paneId);
}

function toastChartScreenshot(): void {
  const shot = chartScreenshot();
  if (!shot.ok) {
    toast("Chart not ready", "warn");
    return;
  }
  toast(shot.panes > 1 ? `Screenshot saved (${shot.panes} panes)` : "Screenshot saved", "ok");
}

function quickOrderMid(pairId: PairId): number {
  if (useLiveBook()) {
    return labBookMid(pairId) || tickers[pairId]?.mid || 0;
  }
  return (market ? midForPair(market, pairId) : 0) || activeTicker().mid;
}

function buildQuickOrderValidation(pairId: PairId, price: number): QuickOrderValidation {
  const pair = pairById(pairId);
  return {
    validate: (side, amount) => {
      if (!market) return { ok: false, reason: "Market not ready — wait for sync" };
      const mid = quickOrderMid(pairId);
      const guard = validatePaperTradingGuards({
        side,
        kind: "limit",
        amountBase: amount,
        price,
        mid,
        quoteSymbol: pair.quote,
        guards: tradingGuards,
      });
      if (!guard.ok) return guard;
      return assertOrderFunds(state, market, pairId, side, amount, price, "limit");
    },
    hintForSide: (side) => {
      if (!market) return "";
      const mid = quickOrderMid(pairId);
      const max = maxOrderBaseAmount(state, market, pairId, side, price, "limit", 1, mid);
      if (!(max > 0)) return `No free ${side === "buy" ? pair.quote : pair.base}`;
      return `Max ~${formatNum(max, 4)} ${pair.base}`;
    },
  };
}

function handleChartPricePick(
  price: number,
  clientX: number,
  clientY: number,
  pairId: PairId,
  dragging: boolean,
  paneHostId = "chart-host",
): void {
  const overlays = state.chartOverlays;
  if (!overlays.quickOrder) return;
  const side = activeTradeSide();
  if (dragging) {
    if (overlays.orderPreview) {
      setChartPreviewPrice(price, side, paneHostId);
      fillOrderPanelAtPrice(side, "limit", price, pairId, { scroll: false });
      refreshSecondaryChartOrderLines();
    }
    return;
  }
  if (overlays.orderPreview) {
    setChartPreviewPrice(price, side, paneHostId);
    fillOrderPanelAtPrice(side, "limit", price, pairId);
    refreshSecondaryChartOrderLines();
  }
  const pair = pairById(pairId);
  const buyAmt = Number((document.getElementById("buy-amt") as HTMLInputElement | null)?.value ?? 0);
  const sellAmt = Number((document.getElementById("sell-amt") as HTMLInputElement | null)?.value ?? 0);
  const defaultAmount = buyAmt > 0 ? buyAmt : sellAmt > 0 ? sellAmt : 0;
  showQuickOrderPopup(clientX, clientY, price, {
    baseSymbol: pair.base,
    quoteSymbol: pair.quote,
    defaultAmount,
    mobileSheet: isMobileLayout(),
    skipConfirm: state.chartOverlays.quickOrderSkipConfirm,
    validate: buildQuickOrderValidation(pairId, price),
    onSidePreview: (side) => {
      if (overlays.orderPreview) {
        setChartPreviewPrice(price, side, paneHostId);
        refreshSecondaryChartOrderLines();
      }
    },
    onPlace: (side, p, amt) => {
      if (overlays.orderPreview) {
        setChartPreviewPrice(p, side, paneHostId);
        refreshSecondaryChartOrderLines();
      }
      quickPlaceFromChart(side, "limit", p, pairId, amt);
      if (!overlays.orderPreview) setChartPreviewPrice(null, null, paneHostId);
    },
    onClose: () => {
      if (!overlays.orderPreview) {
        setChartPreviewPrice(null, null, paneHostId);
        refreshSecondaryChartOrderLines();
      }
    },
  });
}

function amendOpenOrder(id: string, field: "price" | "amount" | "stop", raw: string): void {
  const o = state.orders.find((x) => x.id === id);
  if (!o || (o.status !== "open" && o.status !== "triggered")) {
    toast("Order not open", "warn");
    return;
  }
  if (field === "price" && o.kind !== "limit") {
    toast("Only limit price can be edited inline", "warn");
    return;
  }
  if (field === "stop" && o.kind !== "stop_limit") {
    toast("Stop price only for stop-limit orders", "warn");
    return;
  }
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    toast("Invalid value", "warn");
    return;
  }
  if (field === "stop") {
    if (o.stopPrice === n) {
      refreshActivityPanel();
      return;
    }
    o.stopPrice = n;
    saveState(state);
    toast(`Stop → ${formatPrice(n)}`, "ok");
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    return;
  }
  if (field === "price" && o.price === n) {
    refreshActivityPanel();
    return;
  }
  if (field === "amount" && o.amountBase === n) {
    refreshActivityPanel();
    return;
  }
  if (field === "price") {
    if (market && (o.kind === "limit" || o.kind === "stop_limit")) {
      const mid = midForPair(market, o.pairId);
      const check = validateLimitOrder(o.side, n, mid, o.timeInForce ?? uiTif, o.postOnly ?? uiPostOnly);
      if (!check.ok) {
        toast(check.reason, "warn");
        return;
      }
      if (o.source !== "lab") {
        const funds = assertOrderFunds(
          state,
          market,
          o.pairId,
          o.side,
          o.amountBase,
          n,
          o.kind,
          check.immediate,
          o.id,
          o.stopPrice,
        );
        if (!funds.ok) {
          toast(funds.reason, "warn");
          return;
        }
      }
    }
    if (!updateOrderPrice(state, id, n)) {
      toast("Could not update price", "warn");
      return;
    }
    toast(`Order price → ${formatPrice(n)}`, "ok");
  } else {
    if (market && o.source !== "lab") {
      const funds = assertOrderFunds(state, market, o.pairId, o.side, n, o.price, o.kind, false, o.id, o.stopPrice);
      if (!funds.ok) {
        toast(funds.reason, "warn");
        return;
      }
    }
    if (!updateOrderAmount(state, id, n)) {
      toast("Could not update amount", "warn");
      return;
    }
    toast(`Order amount → ${formatNum(n, 2)}`, "ok");
  }
  refreshOpenOrderChartLines();
  refreshActivityPanel();
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
      ensureActivityPanelVisible("orders");
      break;
    case "buy_stop":
      quickPlaceFromChart("buy", "stop_limit", price, pairId);
      ensureActivityPanelVisible("orders");
      break;
    case "sell_limit":
      quickPlaceFromChart("sell", "limit", price, pairId);
      ensureActivityPanelVisible("orders");
      break;
    case "sell_stop":
      quickPlaceFromChart("sell", "stop_limit", price, pairId);
      ensureActivityPanelVisible("orders");
      break;
    case "create_order":
      fillOrderPanelAtPrice("buy", "limit", price, pairId);
      ensureActivityPanelVisible("orders");
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
      ensureActivityPanelVisible("alerts");
      refreshActivityPanel();
      refreshOpenOrderChartLines();
      toast(`Alert @ ${formatPrice(price)}`, "ok");
      break;
    }
    case "cancel_nearest": {
      const open = state.orders.filter(
        (o) => (o.status === "open" || o.status === "triggered") && o.pairId === pairId,
      );
      if (!open.length) {
        toast("No open orders", "info");
        break;
      }
      let best = open[0]!;
      let bestDist = Math.abs(best.price - price);
      for (const o of open) {
        const d = Math.abs(o.price - price);
        const dStop = o.stopPrice ? Math.abs(o.stopPrice - price) : Infinity;
        const dist = Math.min(d, dStop);
        if (dist < bestDist) {
          best = o;
          bestDist = dist;
        }
      }
      cancelOrder(state, best.id);
      saveState(state);
      ensureActivityPanelVisible("orders");
      refreshOpenOrderChartLines();
      refreshActivityPanel();
      toast(`Cancelled ${orderTypeLabel(best.kind, best)} @ ${formatPrice(best.price)}`, "ok");
      break;
    }
    case "cancel_all": {
      const n = cancelAllOpenOrders(state);
      saveState(state);
      ensureActivityPanelVisible("orders");
      refreshOpenOrderChartLines();
      refreshActivityPanel();
      toast(n ? `Cancelled ${n} order${n === 1 ? "" : "s"}` : "No open orders", n ? "ok" : "info");
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
  const openOrderCount = state.orders.filter(
    (o) => (o.status === "open" || o.status === "triggered") && o.pairId === pairId,
  ).length;
  showChartContextMenu(x, y, price, {
    baseSymbol: pair.base,
    indicatorCount: isMain ? countActiveIndicators(state.chartSettings, state.indicatorConfig) : 0,
    marksHidden: isMain ? !state.chartOverlays.showVolume : true,
    openOrderCount,
    onOpen: () => setContextPriceMarker(null),
    onClose: () => setContextPriceMarker(null),
    onAction: (action, p) => handleChartContextAction(action, p, { pairId, paneHostId }),
  });
}

function refreshOhlcLegendIdle(): void {
  const el = document.getElementById("ohlc-legend");
  const mob = document.getElementById("mobile-ohlc-bar");
  const tip =
    state.chartMode === "heikin"
      ? getDisplayedLastCandle()
      : (state.candles[state.activePair]?.[state.activeTf]?.slice(-1)[0] ?? null);
  const text = formatOhlcLegendText(tip, activeTicker().mid);
  if (text !== lastOhlcLegendText) {
    lastOhlcLegendText = text;
    if (el) el.textContent = text;
  }
  if (mob && isMobileLayout()) {
    if (mob.textContent !== text) mob.textContent = text;
    mob.classList.remove("hidden", "live");
  }
}

/** Repair corrupt TF series before any paint (F5 / hotkeys / hash). */
function repairPairTfCandles(pairId: PairId, tf: Timeframe): void {
  state.candles[pairId] = ensureTfSeriesCadence(state.candles[pairId] ?? {}, pairId, tf);
}

function mountChartPanel(): void {
  const host = document.getElementById("chart-host");
  if (!host) return;
  closeChartContextMenu();
  destroyChart();
  chartMounted = false;
  repairPairTfCandles(state.activePair, state.activeTf);
  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
  const opts: import("./types").ChartMountOpts = {
    ...chartOpts(),
    drawingsLocked: state.drawingsLocked,
    onCrosshair: (c) => {
      lastOhlc = c;
      updateOhlcDisplays(c);
    },
    onOrderPriceDrag: (id, price) => {
      updateOrderPrice(state, id, price);
      refreshOrderLines(state.orders.filter((o) => o.pairId === state.activePair));
      toast(`Order price → ${formatPrice(price)}`, "info");
    },
    onContextMenu: (price, x, y) => openPaneContextMenu(state.activePair, "chart-host", price, x, y),
    onChartPricePick: (price, x, y, dragging) =>
      handleChartPricePick(price, x, y, state.activePair, dragging, "chart-host"),
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
      const all = deriveAllTimeframes(nextBase, pair, state.candles[pair], {
        retainPrev: false,
        nowMs: Date.now(),
      });
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
    switchActivePair(pairId);
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
    if (tf === state.activeTf) return;
    state.activeTf = tf;
    repairPairTfCandles(state.activePair, tf);
    saveState(state);
    syncRouteHash();
    document.querySelectorAll(".tfq").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tf === tf));
    const more = document.getElementById("tf-more") as HTMLSelectElement | null;
    if (more) more.value = tf;
    const candles = state.candles[state.activePair]?.[tf] ?? [];
    const opts = { ...chartOpts(), drawingsLocked: state.drawingsLocked };
    if (!switchChartTimeframe(candles, opts)) mountChartPanel();
    else refreshOhlcLegendIdle();
    return;
  }
  const next = [...(state.multiPaneTfs ?? ["15m", "1H", "1D"])] as MultiPaneTfs;
  next[pane - 2] = tf;
  state.multiPaneTfs = next;
  if (pane === 2) state.secondaryTf = tf;
  repairPairTfCandles(panePair(pane), tf);
  saveState(state);
  syncMultiCharts();
}

/** Multi-chart: independent by default; optional linked zoom/crosshair. */
let crosshairPaneCleanups: Array<() => void> = [];
let timeSyncPaneCleanups: Array<() => void> = [];

function wireMultiChartSync(): void {
  crosshairPaneCleanups.forEach((fn) => fn());
  crosshairPaneCleanups = [];
  timeSyncPaneCleanups.forEach((fn) => fn());
  timeSyncPaneCleanups = [];
  const multi = state.multiChartLayout !== "1";
  const linked = multi && state.multiChartLinked;
  setCrosshairSyncEnabled(linked);
  setTimeSyncEnabled(linked);
  setChartCrosshairMode(linked ? 1 : 0);
  setSecondaryCrosshairMode(linked ? 1 : 0);
  if (!linked) return;
  const main = getMainCrosshairPane();
  if (main) {
    crosshairPaneCleanups.push(registerCrosshairPane(main));
    timeSyncPaneCleanups.push(
      registerTimeSyncPane({ id: main.id, chart: main.chart, barCount: () => main.candles().length }),
    );
  }
  for (const pane of listSecondaryCrosshairPanes()) {
    crosshairPaneCleanups.push(registerCrosshairPane(pane));
    timeSyncPaneCleanups.push(
      registerTimeSyncPane({ id: pane.id, chart: pane.chart, barCount: () => pane.candles().length }),
    );
  }
}

function syncMultiCharts(): void {
  if (state.multiChartLayout === "1") {
    destroySecondaryChart();
    wireMultiChartSync();
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
    repairPairTfCandles(pairId, tf);
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
      onChartPricePick: (price, x, y, dragging) =>
        handleChartPricePick(price, x, y, pairId, dragging, `chart-host-${i}`),
      getDrawings: () => state.drawings.filter((d) => d.pairId === pairId),
      drawingsLocked: () => state.drawingsLocked,
      onAddDrawing: (d) => {
        if (state.drawings.length >= MAX_DRAWINGS) {
          toast(`Drawing limit (${MAX_DRAWINGS}) — delete some first`, "warn");
          return;
        }
        state.drawings.push(d);
        saveState(state);
        refreshDrawings(state.drawings.filter((x) => x.pairId === pairId));
      },
      onUpdateDrawing: (d) => {
        const idx = state.drawings.findIndex((x) => x.id === d.id);
        if (idx >= 0) state.drawings[idx] = d;
        saveState(state);
        refreshDrawings(state.drawings.filter((x) => x.pairId === pairId));
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
        wireMultiChartSync();
        refreshSecondaryChartOrderLines();
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
  // Order book is NOT patched here — chart ticks must stay smooth (see startBookLoop).
  if (chartMounted) {
  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
    const opts = chartOpts();
    const last = candles[candles.length - 1];
    const scrubbing = isChartPointerBusy();
    if (chartNeedsFullReplace || !last) {
      setCandleData(candles, opts, { scrollToLive: chartNeedsFullReplace });
      chartNeedsFullReplace = false;
    } else if (!updateLastCandle(last, opts)) {
      setCandleData(candles, opts, { preserveLogicalRange: true });
    }
    if (!scrubbing) {
      refreshOrderLines(opts.orders, opts.alerts);
    }
    updateLivePriceHud(quote.mid, quote.tone !== "down", candleCountdown(state.activeTf));
    if (!scrubbing && state.multiChartLayout !== "1") {
      const n = state.multiChartLayout === "4" ? 4 : 2;
      for (let i = 2; i <= n; i++) {
        const hostId = `chart-host-${i}`;
        const tf = paneTf(i);
        const pid = panePair(i);
        const c2 = state.candles[pid]?.[tf] ?? [];
        if (c2.length) updateSecondaryChart(c2, hostId);
      }
      refreshSecondaryChartOrderLines();
    }
  }
  evaluateAllPriceAlerts();
  const strip = document.getElementById("mining-strip");
  if (strip && poolLive) {
    const p = pairById(state.activePair);
    strip.textContent = `${p.label} · ${formatGh(poolLive.poolGh)} · ${poolLive.workers} workers · reward/M ${formatRewardPerM(poolLive.rewardPerM)} · #${formatNum(poolLive.blockHeight, 0)}`;
  }
  updatePreview();
  patchAvailChips();
  patchOracleStatus();
  if (market && poolLive) patchOracleTransparencyDom(oracleMeta, market, poolLive);
  const ms = measurePerf("patchLive", "patchLive-start", "patchLive-end");
  if (ms != null && ms > 32) console.debug(`[perf] patchLive ${ms.toFixed(1)}ms`);
}

const throttledBookTapePatch = throttle(() => {
  patchBookTapeDom();
}, 1400);

let bookLoopTimer: number | null = null;

function startBookLoop(): void {
  if (bookLoopTimer != null) return;
  // Independent of chart 700ms tick — book never shares the candle paint frame.
  bookLoopTimer = window.setInterval(() => {
    if (state.mainView !== "spot") return;
    if (isChartPointerBusy()) return;
    if (document.hidden) return;
    bookPhase += 0.18;
    throttledBookTapePatch();
  }, 1600);
}

function stopBookLoop(): void {
  if (bookLoopTimer != null) {
    clearInterval(bookLoopTimer);
    bookLoopTimer = null;
  }
}

function patchBookTapeDom(): void {
  const book = document.getElementById("book");
  if (!book) return;
  wireBookScrollIdle(book, () => {
    if (book.dataset.bookPatchPending === "1") {
      book.dataset.bookPatchPending = "0";
      patchBookTapeDom();
    }
  });
  if (book.dataset.bookScrolling === "1") {
    book.dataset.bookPatchPending = "1";
    return;
  }

  const { bids, asks, group } = activeBookLevels();
  const fp = bookLadderFingerprint(bids, asks, group, state.bookView);
  if (book.dataset.bookFp === fp && book.querySelector(".book-ladder, .depth-panel, .markets-empty")) {
    return;
  }

  // Same row counts → update cells in place (prices+amounts). Never resets scroll panes.
  if (state.bookView === "book" && book.querySelector(".book-ladder")) {
    const max = Math.max(...bids.map((b) => b.amountBase), ...asks.map((a) => a.amountBase), 1);
    const toPatch = (levels: typeof bids): BookRowPatch[] =>
      levels.map((l) => ({
        price: l.price,
        amountBase: l.amountBase,
        totalQuote: l.totalQuote,
        priceLabel: formatPrice(l.price),
        amountLabel: formatBookQty(l.amountBase),
        totalLabel: formatPrice(l.totalQuote),
        barPct: (l.amountBase / max) * 100,
      }));
    if (patchBookRowsInPlace(book, toPatch(asks), toPatch(bids))) {
      book.dataset.bookFp = fp;
      book.dataset.bookSkel = bookPriceSkeletonFingerprint(bids, asks, group, state.bookView);
      const bestBid = bids[0]?.price ?? 0;
      const bestAsk = asks[0]?.price ?? 0;
      const { midPx, spreadAbs, spreadPct, midHint } = bookMidFromLevels(
        state.activePair,
        bestBid,
        bestAsk,
        useLiveBook(),
        activeTicker().mid,
      );
      const midEl = book.querySelector(".ob-mid-price");
      const spreadEl = book.querySelector(".ob-mid-spread");
      const srcEl = book.querySelector(".ob-mid-src");
      const midTxt = formatPrice(midPx);
      const spreadTxt =
        spreadAbs > 0
          ? `Spread ${formatPrice(spreadAbs)} · ${formatNum(spreadPct, 3)}%`
          : midHint;
      if (midEl && midEl.textContent !== midTxt) midEl.textContent = midTxt;
      if (spreadEl && spreadEl.textContent !== spreadTxt) spreadEl.textContent = spreadTxt;
      if (srcEl && srcEl.textContent !== midHint) srcEl.textContent = midHint;
      return;
    }
  }

  const prevSnap = snapshotBookLevels(book);
  const painted = paintBookPreservingScroll(book, renderBook(), fp);
  if (!painted) return;
  book.dataset.bookSkel = bookPriceSkeletonFingerprint(bids, asks, group, state.bookView);
  bookFlashSnap = applyBookFlashes(prevSnap.size ? prevSnap : bookFlashSnap, book);
  book.dataset.bookTabsWired = "1";
  wireBookTabs();
}

function handleMarketStreamEvent(ev: import("./adapters/marketStream").MarketStreamEvent): void {
  if (state.mainView !== "spot") return;
  if (ev.type === "book" && ev.changed) {
    throttledBookTapePatch();
    patchTickerBar();
    updatePreview();
    return;
  }
  if (ev.type === "public_tape") {
    publicTape = [
      ...publicTape.filter((t) => t.pairId !== ev.pairId),
      ...ev.prints,
    ].slice(0, 120);
    ingestDeskVolPrints(ev.pairId, ev.prints);
    markDeskVolReady(ev.pairId);
    const newest = ev.prints[0];
    if (newest?.price && newest.price > 0) {
      setLastPublicMid(ev.pairId, newest.price, newest.ts || Date.now());
      // Rebuild OHLC from tape+cache so F5-restored spikes and multi-print moves stick.
      if (ev.pairId === state.activePair && useLiveBook()) {
        // Tip MUST be the print — Soft-MM mid flattens the chart after re-peg.
        const tip = newest.price;
        const baseLen = state.candles[ev.pairId]?.[CANDLE_BASE_TF]?.length ?? 0;
        // Full hydrate needs a dense tape. Sparse WS bursts + seed pad were wiping the chart
        // the user was watching — only rebuild when we already have a long series to merge
        // or enough local prints; otherwise upsert the print onto the existing series.
        const localPrints = candlePrintsFromLocalTape(ev.pairId);
        const needHydrate =
          (!liveHydratedPairs.has(ev.pairId) && (baseLen < 12 || localPrints.length >= 40)) ||
          (baseLen < 8 && localPrints.length >= 20);
        if (needHydrate) {
          const cached =
            state.candles[ev.pairId]?.[CANDLE_BASE_TF] ?? loadLiveCandleCache(ev.pairId);
          const seen = new Set<string>();
          const prints: CandlePrint[] = [];
          const pushPrint = (p: CandlePrint) => {
            const k = `${p.ts}:${p.price}:${p.amountBase ?? 0}`;
            if (seen.has(k)) return;
            seen.add(k);
            prints.push(p);
          };
          for (const p of ev.prints) {
            pushPrint({
              ts: p.ts,
              price: p.price,
              amountBase: p.amountBase > 0 ? p.amountBase : 0,
            });
          }
          for (const p of localPrints) pushPrint(p);
          if (prints.length >= 8) {
            state.candles[ev.pairId] = hydrateLiveCandlesFromPrints(
              ev.pairId,
              prints,
              tip,
              Date.now(),
              cached,
              liveDayRangeForPair(ev.pairId),
            );
            prevMids[ev.pairId] = tip;
            persistLiveCandleCache(ev.pairId, true);
            liveHydratedPairs.add(ev.pairId);
            tipCandlesForPair(ev.pairId, tip, true);
            if (state.mainView === "spot") patchLive();
          } else {
            upsertAllCandles(newest.price, newest.amountBase);
            tipCandlesForPair(ev.pairId, tip, true);
            if (state.mainView === "spot") patchLive();
          }
        } else {
          upsertAllCandles(newest.price, newest.amountBase);
          tipCandlesForPair(ev.pairId, tip, true);
          if (state.mainView === "spot") patchLive();
        }
      }
    }
    const tape = document.getElementById("tape");
    if (tape) tape.innerHTML = renderTape();
    patchMobileTradeTape();
    patchTickerBar();
    throttledBookTapePatch();
    const list = document.getElementById("markets-list");
    if (list) list.innerHTML = renderMarketsList();
    return;
  }
  if (ev.type === "tape") {
    const tape = document.getElementById("tape");
    if (tape) tape.innerHTML = renderTape();
    patchMobileTradeTape();
    return;
  }
  if (ev.type === "trades") {
    // Session fills (own + counterparty) — paint tip immediately from latest trade.
    const last = state.trades[0];
    if (last?.pairId === state.activePair && last.price > 0) {
      upsertAllCandles(last.price, last.amountBase || 0);
      if (state.mainView === "spot") patchLive();
    }
    refreshActivityPanel();
    throttledBookTapePatch();
  }
}

function startMarketStreamLoop(): void {
  marketStream?.stop();
  marketStream = createMarketStream(
    { onEvent: handleMarketStreamEvent },
    {
      getActivePair: () => state.activePair,
      isSpotView: () => state.mainView === "spot",
      useLiveBook: () => useLiveBook(),
      useSession: () => useServerMatching(),
      getState: () => state,
      getMarket: () => market,
      saveState: () => saveState(state),
    },
  );
  marketStream.start();
}

function startSessionExpiryWatch(): void {
  let warned15 = false;
  let warned2 = false;
  window.setInterval(() => {
    const rem = sessionMsRemaining();
    if (rem == null) {
      warned15 = false;
      warned2 = false;
      return;
    }
    if (rem <= 0) {
      if (!warned2) {
        warned2 = true;
        toast("Desk session expired — Connect again to trade", "warn");
      }
      return;
    }
    const mins = Math.ceil(rem / 60_000);
    const chip = document.getElementById("lab-session-expires");
    if (chip) {
      chip.hidden = false;
      chip.textContent = rem < 60_000 ? `Session <1m` : `Session ~${mins}m`;
      chip.title =
        deskSeedStorageKind() === "session"
          ? "JWT cookie expiry · browser seed is session-only (export backup to keep)"
          : "JWT cookie expiry";
    }
    if (rem <= 15 * 60_000 && rem > 2 * 60_000 && !warned15) {
      warned15 = true;
      toast(`Desk session expires in ~${mins} min — reconnect soon`, "info");
    }
    if (rem <= 2 * 60_000 && !warned2) {
      warned2 = true;
      toast("Desk session expires in under 2 min — Connect again", "warn");
    }
  }, 30_000);
}

function startLabSessionLoop(): void {
  stopLabGuard?.();
  stopLabGuard = startLabSessionGuard({
    getState: () => state,
    getMarket: () => market,
    saveState: () => saveState(state),
    onStale: (note) => {
      const msg = document.getElementById("lab-api-msg");
      if (msg) msg.textContent = note;
    },
    onReconnected: (note) => toast(note, "ok"),
    onSync: () => {
      // Deposit credits + fills — refresh Account / Avbl without waiting for manual Sync.
      if (state.mainView === "account") refreshAccountAfterLab();
      else {
        patchAvailChips();
        patchLive();
      }
    },
    onBookRefresh: () => throttledBookTapePatch(),
  });
}

function previewFeeLabel(fee: { feeQuote: number; feeHmc: number; paidInHmc: boolean }, quote: string): string {
  // Client float estimate — server quotes in minor units; label as estimate.
  if (fee.paidInHmc) return `est. fee ≈ ${formatNum(fee.feeHmc, 4)} HMC`;
  return `est. fee ≈ ${formatPrice(fee.feeQuote)} ${quote}`;
}

/** Live matching: only show HMC −discount when health advertises hmc_fee_pay. */
function liveFeeOpts(): CalcFeeOpts | undefined {
  if (!useServerMatching()) return undefined;
  return {
    honorPayFeesInHmc: tradingGuards.hmcFeePayServer && state.feeConfig.payFeesInHmc,
  };
}

function updatePreviewForSide(side: "buy" | "sell"): void {
  if (!market) return;
  const form = readOrderForm(side);
  const pair = pairById(state.activePair);
  const t = activeTicker();
  const feeOpts = liveFeeOpts();
  if (form.amt <= 0) { setOrderPreview(side, ""); return; }
  if (uiType === "limit" || uiType === "stop_limit") {
    const total = form.amt * form.price;
    const mid = spotTradeMid();
    const role =
      uiType === "limit" && isMarketableLimit(side, form.price, mid) ? "taker" : previewFeeRole(uiType);
    const fee = calcFee(state, market, state.activePair, total, role, feeOpts);
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
  if (useServerMatching() || useLiveBook()) {
    const lab = getLabBookCache(state.activePair);
    if (!lab || (!lab.bids.length && !lab.asks.length)) {
      // Keep a usable estimate from last ticker bid/ask while L2 loads / rate-limits.
      if (t.bid > 0 && t.ask > 0) {
        const m = matchMarket(t, side, form.amt);
        const fee = calcFee(state, market, state.activePair, m.quote, "taker", feeOpts);
        setOrderPreview(
          side,
          `≈ ${formatPriceCompact(m.avgPrice)} · ${formatBookQty(form.amt)} ${pair.base} · ${previewFeeLabel(fee, pair.quote)} · loading L2`,
        );
        return;
      }
      setOrderPreview(side, "Loading live L2…");
      return;
    }
    const m = matchMarket(t, side, form.amt, lab);
    const fee = calcFee(state, market, state.activePair, m.quote, "taker", feeOpts);
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
  syncExecButtonsEnabled();
}

/** Disable Buy/Sell when Avbl is 0 — avoid POST /orders 400 (M-24). */
function syncExecButtonsEnabled(): void {
  const av = availBalance();
  for (const side of ["buy", "sell"] as const) {
    const btn = document.getElementById(`btn-${side}`) as HTMLButtonElement | null;
    if (!btn) continue;
    const need = side === "buy" ? av.quote : av.base;
    const dead = !(need > 0);
    btn.disabled = dead;
    if (dead) {
      btn.title = side === "buy" ? "Avbl 0 quote — deposit first" : "Avbl 0 base — deposit or free reserves";
    } else {
      btn.removeAttribute("title");
    }
  }
}

/** Paper TP/SL attached after a resting entry fills. */
type PendingTpslAttach = {
  entryOrderId: string;
  pairId: PairId;
  exitSide: OrderSide;
  amountBase: number;
  takeProfit: number;
  stopLoss: number;
};
let pendingTpslAttaches: PendingTpslAttach[] = [];

/** Slip buffer so attached SL limit sits past stop — gaps fill instead of sticking triggered. */
function attachedSlLimit(exitSide: OrderSide, stopLoss: number, mid: number): number {
  const slip = Math.max(stopLoss * 0.002, mid > 0 ? mid * 0.0005 : 0, 1e-12);
  return exitSide === "sell" ? Math.max(1e-12, stopLoss - slip) : stopLoss + slip;
}

function validateAttachedTpslGeometry(
  exitSide: OrderSide,
  takeProfit: number,
  stopLoss: number,
  mid: number,
): string | null {
  if (!(mid > 0)) return null;
  if (exitSide === "sell") {
    if (takeProfit > 0 && takeProfit <= mid) return "TP must be above market for long exit";
    if (stopLoss > 0 && stopLoss >= mid) return "SL must be below market for long exit";
  } else {
    if (takeProfit > 0 && takeProfit >= mid) return "TP must be below market for short exit";
    if (stopLoss > 0 && stopLoss <= mid) return "SL must be above market for short exit";
  }
  return null;
}

/** Returns true if TP/SL exits were placed (or none requested). */
function placeAttachedTpsl(
  side: "buy" | "sell",
  amountBase: number,
  exitSide: "buy" | "sell",
  formOverride?: { takeProfit: number; stopLoss: number; tpslEnabled: boolean },
  pairId: PairId = state.activePair,
): boolean {
  const form = formOverride ?? readOrderForm(side);
  if (!form.tpslEnabled) return true;
  if (!(form.takeProfit > 0) && !(form.stopLoss > 0)) return true;
  const mid =
    (tickers[pairId]?.mid || 0) > 0 ? tickers[pairId]!.mid : midForPair(market!, pairId);
  const geo = validateAttachedTpslGeometry(exitSide, form.takeProfit, form.stopLoss, mid);
  if (geo) {
    toast(geo, "warn");
    return false;
  }
  if (form.takeProfit > 0 && form.stopLoss > 0) {
    const slLim = attachedSlLimit(exitSide, form.stopLoss, mid);
    return placeOcoOrWarn(pairId, exitSide, amountBase, form.takeProfit, form.stopLoss, slLim);
  }
  let ok = true;
  if (form.takeProfit > 0) {
    ok = !!placeOrderOrWarn(pairId, exitSide, "limit", amountBase, form.takeProfit) && ok;
  }
  if (form.stopLoss > 0) {
    // stop_market — protective exit on spike/gap (not stop==limit stuck).
    ok =
      !!placeOrderOrWarn(
        pairId,
        exitSide,
        "stop_market",
        amountBase,
        exitSide === "buy" ? form.stopLoss * 1.01 : form.stopLoss,
        form.stopLoss,
      ) && ok;
  }
  return ok;
}

function queuePendingTpsl(entry: Order, side: "buy" | "sell", exitSide: OrderSide, form: ReturnType<typeof readOrderForm>): void {
  if (!form.tpslEnabled) return;
  if (!(form.takeProfit > 0) && !(form.stopLoss > 0)) return;
  pendingTpslAttaches.push({
    entryOrderId: entry.id,
    pairId: entry.pairId,
    exitSide,
    amountBase: entry.amountBase,
    takeProfit: form.takeProfit,
    stopLoss: form.stopLoss,
  });
}

function flushPendingTpslAttaches(): boolean {
  if (!pendingTpslAttaches.length || !market) return false;
  const keep: PendingTpslAttach[] = [];
  let did = false;
  for (const p of pendingTpslAttaches) {
    const o = state.orders.find((x) => x.id === p.entryOrderId);
    if (!o || o.status === "cancelled") continue;
    if (o.status !== "filled") {
      keep.push(p);
      continue;
    }
    const ok = placeAttachedTpsl(
      "buy",
      p.amountBase,
      p.exitSide,
      { takeProfit: p.takeProfit, stopLoss: p.stopLoss, tpslEnabled: true },
      p.pairId,
    );
    did = true;
    if (!ok) toast("TP/SL attach after fill failed", "warn");
    else toast("TP/SL attached after entry fill", "ok");
  }
  pendingTpslAttaches = keep;
  return did;
}

function submitOrder(side: "buy" | "sell"): void {
  if (orderInFlight) {
    toast("Order already in progress", "info");
    return;
  }
  const av = availBalance();
  const need = side === "buy" ? av.quote : av.base;
  if (!(need > 0)) {
    setOrderMsg(side, side === "buy" ? "Avbl 0 quote — deposit first" : "Avbl 0 base — deposit first", "err");
    return;
  }
  const form = readOrderForm(side);
  const pair = pairById(state.activePair);
  if (form.amt <= 0) { setOrderMsg(side, "Enter amount", "err"); return; }
  const exitSide: "buy" | "sell" = side === "buy" ? "sell" : "buy";
  if (useServerMatching() && form.tpslEnabled) {
    setOrderMsg(side, "TP/SL attachments are paper-only right now", "err");
    return;
  }

  if (uiType === "market") {
    if (useServerMatching()) {
      runLockedLabOrder(async () => {
        // Refresh L2 so slip hint tracks lab MM mid (not stale pool-oracle mid).
        await refreshLabBook(state.activePair);
        const t = activeTicker();
        const book = getLabBookCache(state.activePair);
        const mid =
          labBookMid(state.activePair) ||
          lastPublicMid(state.activePair) ||
          midForPair(market!, state.activePair) ||
          t.mid;
        let slip = labMarketSlipHint(side, state.activePair, mid, 0.05);
        // Hard fallback: never POST market buy without a ceiling (API used to → invalid_order).
        if (side === "buy" && !(slip > 0)) {
          const ask = book?.asks[0]?.price || t.ask || 0;
          const anchor = ask > 0 ? ask : mid;
          if (anchor > 0) slip = anchor * 1.05;
        }
        if (side === "buy" && !(slip > 0)) {
          setOrderMsg(side, "Market buy needs live L2 — wait for book, then retry", "err");
          return;
        }
        // Re-clamp to fee+slip safe size — avoids server "Insufficient balance" after 100% on best ask.
        const safePx =
          side === "buy"
            ? Math.max(slip || book?.asks[0]?.price || t.ask || 0, book?.asks[0]?.price || t.ask || 0) * 1.002
            : Math.min(slip || book?.bids[0]?.price || t.bid || mid, book?.bids[0]?.price || t.bid || mid) * 0.998;
        const maxAmt = maxOrderBaseAmount(state, market!, state.activePair, side, safePx, "market", 1, mid);
        let amt = form.amt;
        if (maxAmt > 0 && amt > maxAmt) {
          amt = maxAmt;
          const inp = document.getElementById(`${side}-amt`) as HTMLInputElement | null;
          if (inp) inp.value = String(amt);
        }
        if (!paperGuardsOrWarn(side, "market", amt, slip || mid)) return;
        let lab = await placeLabOrder(
          state,
          state.activePair,
          side,
          "market",
          amt,
          side === "buy" ? slip : slip > 0 ? slip : undefined,
          undefined,
          labOrderOpts(),
        );
        // One shrink retry — server VWAP/fee rounding can still reject a borderline 100%.
        if (!lab.ok && /insufficient.?balance/i.test(lab.reason) && amt > 0) {
          const retry = maxOrderBaseAmount(
            state,
            market!,
            state.activePair,
            side,
            safePx * (side === "buy" ? 1.01 : 0.99),
            "market",
            0.92,
            mid,
          );
          if (retry > 0 && retry < amt) {
            amt = retry;
            const inp = document.getElementById(`${side}-amt`) as HTMLInputElement | null;
            if (inp) inp.value = String(amt);
            lab = await placeLabOrder(
              state,
              state.activePair,
              side,
              "market",
              amt,
              slip,
              undefined,
              labOrderOpts(),
            );
          }
        }
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
    const funds = assertOrderFunds(
      state,
      market!,
      state.activePair,
      side,
      form.amt,
      m.avgPrice,
      "market",
      true,
    );
    if (!funds.ok) {
      setOrderMsg(side, funds.reason, "err");
      toast(funds.reason, "warn");
      return;
    }
    const res = executeFill(state, market!, state.activePair, side, m.avgPrice, form.amt, m.quote, "market");
    if (!res.ok) { setOrderMsg(side, res.reason, "err"); toast(res.reason, "warn"); return; }
    const tpslOk = placeAttachedTpsl(side, form.amt, exitSide);
    const tpslNote = form.tpslEnabled ? (tpslOk ? " · TP/SL" : " · TP/SL failed") : "";
    setOrderMsg(side, `Filled @ ${formatPrice(m.avgPrice)} · ${res.fee.role} ${formatBps(res.fee.bps)}${tpslNote}`, tpslOk ? "ok" : "err");
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
    if (useServerMatching()) {
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
      const tpslOk = placeAttachedTpsl(side, form.amt, exitSide);
      const tpslNote = form.tpslEnabled ? (tpslOk ? " · TP/SL" : " · TP/SL failed") : "";
      setOrderMsg(
        side,
        `Filled @ limit (crossed mid) · ${res.fee.role} ${formatBps(res.fee.bps)}${tpslNote}`,
        tpslOk ? "ok" : "err",
      );
      feeFillToast(side, form.amt, pair.base, res.fee, pair.quote);
      upsertAllCandles(form.price);
      saveState(state);
      patchLive();
      activityTab = "history";
      toast(tpslOk ? "Filled instantly — see Fills tab" : "Filled — TP/SL attach failed", tpslOk ? "info" : "warn");
      refreshActivityPanel();
      return;
    }
    if (!placeOrderOrWarn(state.activePair, side, "limit", form.amt, form.price, undefined, undefined, uiTif, uiPostOnly)) return;
    const entry = state.orders.find(
      (o) =>
        o.status === "open" &&
        o.pairId === state.activePair &&
        o.side === side &&
        o.kind === "limit" &&
        o.price === form.price &&
        o.amountBase === form.amt,
    );
    if (form.tpslEnabled && entry) {
      queuePendingTpsl(entry, side, exitSide, form);
      toast("Limit resting — TP/SL will attach on fill", "info");
    } else if (form.tpslEnabled) {
      toast("TP/SL: use Advanced OCO if attach queue missed", "info");
    }
    saveState(state);
    setOrderMsg(side, `Limit · ${uiTif}`, "ok");
    toast("Limit placed — Open orders", "ok");
    activityTab = "orders";
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    return;
  }

  if (uiType === "stop_limit") {
    if (useServerMatching()) {
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
    if (useServerMatching()) {
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
    if (useServerMatching()) {
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
    if (useServerMatching()) {
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

function focusOrderFormUi(): void {
  gotoMainView("spot");
  const zone = document.getElementById("order-zone");
  zone?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  const buyAmt = document.getElementById("buy-amt") as HTMLInputElement | null;
  const sellAmt = document.getElementById("sell-amt") as HTMLInputElement | null;
  const target = buyAmt ?? sellAmt;
  if (target) {
    target.focus({ preventScroll: true });
    target.select?.();
  }
}

function wireAlertButtons(): void {
  document.getElementById("btn-focus-order-form")?.addEventListener("click", () => {
    focusOrderFormUi();
  });
  document.getElementById("btn-alert-at-mid")?.addEventListener("click", () => {
    void ensureAlertNotifications();
    if (!market) return;
    const price =
      (useServerMatching() ? labBookMid(state.activePair) : 0) || midForPair(market, state.activePair);
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

function wireOrderAmendButtons(): void {
  document.querySelectorAll(".act-edit").forEach((btn) => {
    const el = btn as HTMLElement;
    const next = el.cloneNode(true) as HTMLElement;
    el.replaceWith(next);
    next.addEventListener("click", () => {
      const id = next.dataset.amendId;
      const field = next.dataset.amendField as "price" | "amount" | "stop" | undefined;
      if (!id || !field) return;
      const o = state.orders.find((x) => x.id === id);
      if (!o) return;
      const inp = document.createElement("input");
      inp.type = "number";
      inp.className = "inp mono act-edit-inp";
      inp.step = "any";
      inp.value =
        field === "price" ? String(o.price) : field === "stop" ? String(o.stopPrice ?? "") : String(o.amountBase);
      const commit = () => {
        if (cancelled) return;
        amendOpenOrder(id, field, inp.value);
      };
      let cancelled = false;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        commit();
      };
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelled = true;
          done = true;
          refreshActivityPanel();
        }
      });
      inp.addEventListener("blur", () => {
        if (!done) finish();
      });
      next.replaceWith(inp);
      inp.focus();
      inp.select();
    });
  });
}

/** Prevent double-taps / stacked listeners from freezing Cancel on mobile. */
const cancelInFlight = new Set<string>();

async function handleCancelOrderClick(btn: HTMLElement): Promise<void> {
  const id = btn.dataset.cancel;
  if (!id || cancelInFlight.has(id)) return;
  cancelInFlight.add(id);
  const prevLabel = btn.textContent ?? "Cancel";
  const asBtn = btn as HTMLButtonElement;
  asBtn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.classList.add("is-busy");
  btn.textContent = "Cancelling…";
  try {
    if (useServerMatching()) {
      const local = state.orders.find((o) => o.id === id);
      const lab = await cancelLabOrder(state, id);
      if (lab.ok) {
        refreshAfterLabTrade();
        toast(lab.note, "info");
        // Background ledger sync — never block the Cancel button on this.
        if (lab.syncPending) {
          void syncLabBalancesAndBook(state, market).then((sync) => {
            if (sync.ok) {
              refreshAfterLabTrade();
            }
          });
        }
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
        asBtn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.classList.remove("is-busy");
        btn.textContent = prevLabel;
        return;
      }
      cancelOrder(state, id);
      refreshOpenOrderChartLines();
      refreshActivityPanel();
      toast(
        local?.source === "paper" ? "Order cancelled (paper)" : `Lab cancel: ${lab.reason} · cancelled locally`,
        "info",
      );
      return;
    }
    cancelOrder(state, id);
    refreshOpenOrderChartLines();
    refreshActivityPanel();
    toast("Order cancelled", "info");
  } finally {
    cancelInFlight.delete(id);
  }
}

function wireCancelButtons(): void {
  document.querySelectorAll("[data-cancel]").forEach((b) => {
    const el = b as HTMLElement;
    // Clone strips stacked listeners if wireCancelButtons runs without innerHTML replace.
    const next = el.cloneNode(true) as HTMLElement;
    el.replaceWith(next);
    next.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void handleCancelOrderClick(next);
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

function syncChartOverlayEffects(): void {
  if (!state.chartOverlays.orderPreview) {
    setChartPreviewPrice(null);
    refreshSecondaryChartOrderLines();
  }
  if (!state.chartOverlays.quickOrder) closeQuickOrderPopup();
}

function saveChartPatch(patch: Partial<typeof state>, opts?: { silent?: boolean }): void {
  if (patch.chartOverlays) {
    patch = {
      ...patch,
      chartOverlays: normalizeChartOverlays({ ...state.chartOverlays, ...patch.chartOverlays }),
    };
  }
  Object.assign(state, patch);
  saveState(state);
  if (patch.chartOverlays) syncChartOverlayEffects();
  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
  const chartPatchOpts = { ...chartOpts(), drawingsLocked: state.drawingsLocked };
  if (!softRefreshChart(candles, chartPatchOpts)) mountChartPanel();
  else {
    setChartMode(state.chartMode);
    setActiveDrawTool(state.activeDrawTool);
  }
  if (!opts?.silent) toast("Chart updated", "ok");
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
  if (useLiveBook()) {
    const lab = getLabBookCache(state.activePair);
    if (side === "buy" && lab?.asks[0]?.price) price = lab.asks[0].price;
    if (side === "sell" && lab?.bids[0]?.price) price = lab.bids[0].price;
  }
  if (uiType === "limit" || uiType === "stop_limit" || uiType === "oco" || (uiType === "stop_market" && side === "buy")) {
    const fromInp = Number((document.getElementById(`${side}-price`) as HTMLInputElement)?.value ?? price);
    if (fromInp > 0) price = fromInp;
  }
  // Market: size against slip ceiling/floor so 100% survives server VWAP + fee (not just best ask).
  if (uiType === "market") {
    const slip = labMarketSlipHint(side, state.activePair, mid || t.mid, 0.05);
    if (slip > 0) {
      price = side === "buy" ? Math.max(price, slip) : Math.min(price || slip, slip);
    } else if (side === "buy" && price > 0) {
      price *= 1.05;
    } else if (side === "sell" && price > 0) {
      price *= 0.95;
    }
  }
  if (!(price > 0)) {
    amtInp.value = "0";
    return;
  }
  const sized = maxOrderBaseAmount(state, market, state.activePair, side, price, uiType, pct, mid);
  amtInp.value = sized > 0 ? String(sized) : "0";
  if (pct > 0 && sized <= 0) {
    const pair = pairById(state.activePair);
    const need = side === "buy" ? pair.quote : pair.base;
    const needKey = need.toLowerCase() as keyof typeof state.wallet;
    const free = freeBalance(state, needKey, market);
    const hmcFree = freeBalance(state, "hmc", market);
    const probeAmt =
      side === "buy"
        ? Math.max((free / Math.max(price, 1e-12)) * 0.5, 1e-8)
        : Math.max(free * 0.5, 1e-8);
    const probe = assertOrderFunds(
      state,
      market,
      state.activePair,
      side,
      probeAmt,
      price,
      uiType,
      fundsImmediateFill(uiType, side, price, mid),
    );
    let hint: string;
    if (!probe.ok && /HMC for fee/i.test(probe.reason)) {
      hint =
        hmcFree > 0
          ? `Leave HMC for fees (Avbl ${formatNum(hmcFree, 4)} HMC) — or turn off Pay fees in HMC`
          : `Need HMC for fees (Avbl 0 HMC) — deposit HMC or turn off Pay fees in HMC`;
    } else if (usePublicDeskBook() && !useDeskMatching() && free <= 0) {
      hint = `Avbl 0 ${need} — Connect desk wallet + deposit first`;
    } else if (free > 0) {
      hint =
        state.feeConfig.payFeesInHmc && need === "HMC"
          ? `Leave a little HMC for fees (Avbl ${formatNum(free, 4)} ${need})`
          : `Balance too small after fees/reserves (Avbl ${formatNum(free, 4)} ${need})`;
    } else {
      hint = `Avbl 0 ${need} — deposit or free reserved balance first`;
    }
    toastAvailHint(hint);
  }
}

let lastAvailToastAt = 0;
let lastAvailToastMsg = "";
function toastAvailHint(msg: string): void {
  const now = Date.now();
  if (msg === lastAvailToastMsg && now - lastAvailToastAt < 2_500) return;
  lastAvailToastMsg = msg;
  lastAvailToastAt = now;
  toast(msg, "warn");
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

function showSettings(opts?: { tab?: SettingsTabId }): void {
  showUnifiedSettingsModal(
    state,
    layoutPrefs,
    theme,
    {
      onSaveOracle: (v) => {
        state.oracleAnchor = v;
        saveState(state);
        toast(`Anchor → ${v} USDT/HMC`, "ok");
        refresh();
      },
      onTheme: (next) => {
        theme = next;
        saveTheme(theme);
        toast(theme === "hub" ? "Theme → Hub" : "Theme → Wallet", "ok");
        render();
      },
      onLayout: (patch) => {
        layoutPrefs = { ...layoutPrefs, ...patch };
        saveLayoutPrefs(layoutPrefs);
        applyLayoutToDom();
        syncLayoutChips();
      },
      onResetLayout: () => {
        layoutPrefs = { ...LAYOUT_DEFAULTS };
        saveLayoutPrefs(layoutPrefs);
        state.chartFullscreen = false;
        saveState(state);
        applyLayoutToDom();
        syncLayoutChips();
        toast("Layout reset", "info");
        render();
      },
      onApplyLayoutPreset: (id: LayoutPresetId) => {
        layoutPrefs = applyLayoutPreset(id);
        saveLayoutPrefs(layoutPrefs);
        state.chartFullscreen = false;
        saveState(state);
        applyLayoutToDom();
        syncLayoutChips();
        toast(`Layout → ${id}`, "info");
        scheduleChartResize();
      },
      onExport: () => {
        const stamp = new Date().toISOString().slice(0, 10);
        downloadText(`hackme-exchange-demo-${stamp}.json`, exportDemoJson(state));
        toast("State exported", "ok");
      },
      onImportClick: () => {
        document.getElementById("import-demo-file")?.click();
      },
      onResetDemo: () => {
        document.getElementById("btn-reset")?.click();
      },
      onOpenChartStyle: () => {
        showChartStyleModal(state, (patch) => saveChartPatch(patch));
      },
      onOpenOverlays: (anchor) => {
        showOverlayMenu(state, anchor, (patch) => {
          saveChartPatch(patch, { silent: true });
          applyOverlays(state.chartOverlays, state.orders.filter((o) => o.pairId === state.activePair), activeTicker().mid);
        });
      },
      onChartOverlays: (patch) => {
        saveChartPatch({ chartOverlays: { ...state.chartOverlays, ...patch } }, { silent: true });
        applyOverlays(state.chartOverlays, state.orders.filter((o) => o.pairId === state.activePair), activeTicker().mid);
      },
      onToggleMultiLink: (linked) => {
        state.multiChartLinked = linked;
        saveState(state);
        wireMultiChartSync();
        toast(linked ? "Panes linked" : "Panes independent", "info");
      },
      onDeskConnect: () => {
        gotoMainView("account");
        void deskWalletConnectUi();
      },
      onNodeSync: () => {
        void syncFromNode();
      },
      onOpenAccountSecurity: () => {
        gotoMainView("account");
        requestAnimationFrame(() => {
          document.getElementById("acct-desk")?.setAttribute("open", "");
          document.getElementById("acct-lab")?.setAttribute("open", "");
          document.getElementById("acct-security-2fa")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      },
      onDeskLogout: () => void labApiLogoutUi(),
      onDeskRevokeAll: () => void labRevokeAllUi(),
      onCopyDeskAddress: () => void deskCopyAddressUi(),
      onNewDeskWallet: () => {
        gotoMainView("account");
        void deskNewWalletUi();
      },
      onExportDeskSeed: () => deskExportSeedUi(),
      onImportDeskSeed: () => deskImportSeedUi(),
      onOpenAccount: () => gotoMainView("account"),
      onRefreshDeskHealth: () => refreshDeskEdgeHealthUi(),
    },
    currentSettingsWalletChrome(),
    opts?.tab ? { tab: opts.tab } : undefined,
  );
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
  set("chip-orders", !layoutPrefs.bottomCollapsed);
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
      term.classList.remove("book-collapsed", "right-collapsed", "tools-collapsed", "bottom-collapsed");
      term.style.setProperty("grid-template-columns", "1fr", "important");
    } else {
      term.classList.toggle("book-collapsed", layoutPrefs.bookCollapsed);
      term.classList.toggle("right-collapsed", layoutPrefs.rightCollapsed);
      term.classList.toggle("tools-collapsed", layoutPrefs.toolsCollapsed);
      term.classList.toggle("bottom-collapsed", layoutPrefs.bottomCollapsed);
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
  const activity = document.getElementById("activity-panel");
  if (activity) {
    activity.classList.toggle("hidden", !mobile && layoutPrefs.bottomCollapsed);
  }
  // Expand rails: desktop only — mobile uses topbar tools toggle.
  syncExpandRail("btn-expand-book", !fs && !isMobileLayout() && layoutPrefs.bookCollapsed);
  syncExpandRail("btn-expand-right", !fs && !isMobileLayout() && layoutPrefs.rightCollapsed);
  syncExpandRail("btn-expand-tools", !fs && !isMobileLayout() && layoutPrefs.toolsCollapsed);
  syncExpandRail("btn-expand-orders", !fs && !isMobileLayout() && layoutPrefs.bottomCollapsed);
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
  const collapseOrders = () => {
    layoutPrefs = toggleBottomCollapsed(layoutPrefs);
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
    else if (panel === "orders" || t.id === "btn-expand-orders") collapseOrders();
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
    // Mobile CEX charts show volume by default — avoid empty/demo strip under candles.
    if (isMobileLayout() && !state.chartOverlays.showVolume) {
      try {
        if (sessionStorage.getItem("hackme-ex-mobile-vol-boot-v1") !== "1") {
          sessionStorage.setItem("hackme-ex-mobile-vol-boot-v1", "1");
          state.chartOverlays.showVolume = true;
          saveState(state);
        }
      } catch {
        state.chartOverlays.showVolume = true;
        saveState(state);
      }
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (chartMounted) {
          syncChartOverlayEffects();
          applyOverlays(
            state.chartOverlays,
            state.orders.filter((o) => o.pairId === state.activePair),
            activeTicker().mid,
          );
          resizeChart();
        } else mountChartPanel();
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
  document.querySelectorAll<HTMLElement>(".market-row-wrap").forEach((wrap) => {
    const row = wrap.querySelector(".market-row") as HTMLElement | null;
    const pid = row?.dataset.pair as PairId | undefined;
    if (!pid || !row) return;
    const on = pid === state.activePair;
    wrap.classList.toggle("active", on);
    row.classList.toggle("active", on);
    const q = pairQuote(pid);
    const px = row.querySelector(".mr-px");
    const ch = row.querySelector(".mr-chg");
    const volEl = row.querySelector(".mr-vol");
    if (px) px.textContent = q.mid > 0 ? formatPriceCompact(q.mid) : "—";
    if (ch) {
      ch.textContent = formatPct(q.changePct);
      ch.className = `mono mr-chg ${quoteToneClass(q.tone)}`;
    }
    if (volEl) {
      const vol = useLiveBook() ? deskVol24hBase(pid) : q.vol24h;
      const base = pairById(pid).base;
      volEl.textContent = vol > 0 ? formatVolBase(vol, base) : "—";
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
  if (state.mainView !== "spot") return;
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
    (document.activeElement as HTMLElement | null)?.blur?.();
    switchMobilePanel("markets");
  });

  wireLayoutPanels();
  applyLayoutToDom();
  wireMobilePanels();
  wireMobileTradeSide();
  wireOracleRetry();

  document.getElementById("btn-mobile-tools")?.addEventListener("click", () => setMobileToolsOpen());

  document.getElementById("btn-reset")?.addEventListener("click", () => {
    if (useServerMatching()) {
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
    if (useServerMatching()) {
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
  document.getElementById("btn-settings-quick")?.addEventListener("click", () => showSettings());
  document.getElementById("btn-settings-wallet")?.addEventListener("click", () => {
    showSystemDrop(false);
    showSettings({ tab: "wallet" });
  });
  document.getElementById("btn-oracle-anchor")?.addEventListener("click", () => showSettings({ tab: "oracle" }));
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
  if (state.mainView === "pool") {
    wirePoolPage();
    if (poolLive && market) patchPoolLiveDom(poolLive, market, oracleMeta);
  }

  if (!hotkeysWired) {
    document.addEventListener("keydown", onKeydown);
    hotkeysWired = true;
  }

  if (state.mainView !== "spot") return;

  const setTf = (tf: Timeframe) => {
    if (tf === state.activeTf) return;
    state.activeTf = tf;
    // Repair corrupt TF series (1D labeled but 1m steps → HH:MM axis).
    repairPairTfCandles(state.activePair, tf);
    saveState(state);
    syncRouteHash();
    document.querySelectorAll(".tfq").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tf === tf));
    const more = document.getElementById("tf-more") as HTMLSelectElement | null;
    if (more) more.value = tf;
    const candles = state.candles[state.activePair]?.[tf] ?? [];
    const opts = { ...chartOpts(), drawingsLocked: state.drawingsLocked };
    if (!switchChartTimeframe(candles, opts)) mountChartPanel();
    else refreshOhlcLegendIdle();
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
      if (action === "fullscreen") {
        toggleChartFullscreen();
      } else if (action === "volume") {
        state.chartOverlays.showVolume = !state.chartOverlays.showVolume;
        saveState(state);
        syncChartOverlayEffects();
        applyOverlays(
          state.chartOverlays,
          state.orders.filter((o) => o.pairId === state.activePair),
          activeTicker().mid,
        );
        toast(state.chartOverlays.showVolume ? "Volume shown" : "Volume hidden", "info");
      } else if (action === "indicators") showIndicatorModal(state, (patch) => saveChartPatch(patch));
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
              syncChartOverlayEffects();
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
          scrollFocusedChartToTimestamp(ts);
          toast("Jumped to date", "info");
        });
      } else if (action === "screenshot") {
        toastChartScreenshot();
      } else if (action === "hotkeys") {
        showHotkeysHelp();
      }
    });
  });

  document.getElementById("btn-indicators")?.addEventListener("click", () => {
    showIndicatorModal(state, (patch) => saveChartPatch(patch));
  });

  document.getElementById("btn-goto-date")?.addEventListener("click", () => {
    showGoToDateModal((ts) => {
      scrollFocusedChartToTimestamp(ts);
      toast("Jumped to date", "info");
    });
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
      syncChartOverlayEffects();
      applyOverlays(state.chartOverlays, state.orders.filter((o) => o.pairId === state.activePair), activeTicker().mid);
    }, () => el.classList.remove("active"));
    });
  document.getElementById("btn-screenshot")?.addEventListener("click", () => toastChartScreenshot());
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
      if (patch.multiChartLinked != null && patch.multiChartLayout == null) {
        wireMultiChartSync();
        return;
      }
      render();
    });
  });

  document.getElementById("book-group-select")?.addEventListener("change", (e) => {
    state.bookGrouping = Number((e.target as HTMLSelectElement).value);
    saveState(state);
    forcePaintBook();
  });

  wireBookTabs();

  wireOrderPanelEvents();

  document.getElementById("pay-fees-hmc")?.addEventListener("change", (e) => {
    state.feeConfig.payFeesInHmc = (e.target as HTMLInputElement).checked;
    saveState(state);
    softPatchFeePayChrome();
    resyncPctSizedAmounts();
    updatePreview();
  });

  document.getElementById("order-tif")?.addEventListener("change", (e) => {
    uiTif = (e.target as HTMLSelectElement).value as TimeInForce;
    saveOrderDesk(uiType, uiTif, uiPostOnly);
    updatePreview();
  });

  document.getElementById("post-only")?.addEventListener("change", (e) => {
    uiPostOnly = (e.target as HTMLInputElement).checked;
    saveOrderDesk(uiType, uiTif, uiPostOnly);
    updatePreview();
  });

  document.querySelectorAll("#activity-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activityTab = normalizeActivityTab((btn as HTMLElement).dataset.tab);
      saveActivityTab(activityTab);
      document.querySelectorAll("#activity-tabs button").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (activityTab === "alerts") void ensureAlertNotifications();
      refreshActivityPanel();
    });
  });

  document.getElementById("btn-open-alerts")?.addEventListener("click", () => {
    openAlertsPanel();
  });

  document.getElementById("btn-hotkeys")?.addEventListener("click", () => showHotkeysHelp());

  wireCancelButtons();
  wireOrderAmendButtons();
  wireAlertButtons();
  wireFundsFunding();
  syncPctMarks("buy");
  syncPctMarks("sell");

  updatePreview();
}

function openAlertsPanel(): void {
  activityTab = "alerts";
  saveActivityTab(activityTab);
  ensureActivityPanelVisible();
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

/** Unhide Orders/Fills panel (bottom) + markets column so Cancel/amend stay reachable. */
function ensureActivityPanelVisible(tab?: typeof activityTab): void {
  let dirty = false;
  if (layoutPrefs.bottomCollapsed) {
    layoutPrefs = { ...layoutPrefs, bottomCollapsed: false };
    dirty = true;
  }
  if (layoutPrefs.rightCollapsed) {
    layoutPrefs = { ...layoutPrefs, rightCollapsed: false };
    dirty = true;
  }
  if (dirty) saveLayoutPrefs(layoutPrefs);
  if (state.chartFullscreen) {
    setChartFullscreen(false);
  } else if (dirty) {
    applyLayoutToDom();
  }
  if (tab) {
    activityTab = tab;
    saveActivityTab(activityTab);
    document.querySelectorAll("#activity-tabs button").forEach((b) => {
      const on = (b as HTMLElement).dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }
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
      forcePaintBook();
      wireBookClicks();
    });
    book.addEventListener("change", (ev) => {
      const sel = ev.target as HTMLElement | null;
      if (!sel || sel.id !== "book-group-select") return;
      state.bookGrouping = Number((sel as HTMLSelectElement).value);
      saveState(state);
      forcePaintBook();
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
  const list = document.getElementById("markets-list");
  if (!list) return;
  // Event delegation — survives patchMarketRowsInPlace and avoids rebinding every tick.
  if (list.dataset.wired === "1") return;
  list.dataset.wired = "1";
  list.addEventListener("click", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const star = t.closest("[data-star]") as HTMLElement | null;
    if (star && list.contains(star)) {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(state, star.dataset.star as PairId);
      list.innerHTML = renderMarketsList();
      return;
    }
    const row = t.closest(".market-row") as HTMLElement | null;
    if (row && list.contains(row) && row.dataset.pair) {
      e.preventDefault();
      switchActivePair(row.dataset.pair as PairId, { mobileTrade: isMobileLayout() });
      return;
    }
    const jump = t.closest("[data-lane-jump]") as HTMLElement | null;
    if (jump && list.contains(jump)) {
      setMarketLane(jump.dataset.laneJump ?? "all");
    }
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
        <li>Chart click → quick limit (enable in Settings → Chart)</li>
        <li>Orders tab → click price/amount to amend inline</li>
        <li>Click book row → fill Limit price</li>
        <li>BBO → best bid/offer into price</li>
        <li>Convert → <kbd>F</kbd> flip · <kbd>M</kbd> max · <kbd>1</kbd>–<kbd>4</kbd> %</li>
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

  if (state.mainView === "convert" && !isTypingTarget(e.target)) {
    if (e.key === "f" || e.key === "F") {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      document.getElementById("cv-flip")?.click();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      document.getElementById("cv-max")?.click();
      return;
    }
    if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
      const pct = [25, 50, 75, 100][Number(e.key) - 1];
      const chip = document.querySelector(`[data-cv-pct="${pct}"]`) as HTMLElement | null;
      if (chip) {
        e.preventDefault();
        chip.click();
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("cv-go")?.click();
      return;
    }
  }

  if (state.mainView !== "spot") return;

  if ((e.key === "r" || e.key === "R") && e.altKey) {
    e.preventDefault();
    resetFocusedChartView();
    toast("Chart view reset", "info");
    return;
  }

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
    const moreDrop = document.getElementById("chart-more-drop");
    if (moreDrop && !moreDrop.classList.contains("hidden")) {
      showChartMoreDrop(false);
      return;
    }
    const typeDrop = document.getElementById("chart-type-drop");
    if (typeDrop && !typeDrop.classList.contains("hidden")) {
      showChartTypeDrop(false);
      return;
    }
    const sysDrop = document.getElementById("sys-drop");
    if (document.body.classList.contains("sys-menu-open") || (sysDrop && !sysDrop.classList.contains("hidden"))) {
      showSystemDrop(false);
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
    wireOrderAmendButtons();
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
    const tf = TIMEFRAMES[Number(e.key) - 1]!;
    state.activeTf = tf;
    repairPairTfCandles(state.activePair, tf);
    saveState(state);
    syncRouteHash();
    mountChartPanel();
    document.querySelectorAll(".tfq").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tf === tf));
    document.querySelectorAll("#tf-tabs .tf").forEach((b, i) => b.classList.toggle("active", TIMEFRAMES[i] === state.activeTf));
  }
  if (e.key === "0") {
    const tf = TIMEFRAMES[9]!;
    state.activeTf = tf;
    repairPairTfCandles(state.activePair, tf);
    saveState(state);
    syncRouteHash();
    mountChartPanel();
    document.querySelectorAll(".tfq").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tf === tf));
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
}

/** Paint a fill/print onto the active pair tip — immediate chart reaction. */
function upsertAllCandles(fillPx: number, amountBase = 0): void {
  const pairId = state.activePair;
  if (!state.candles[pairId]) return;
  const bookMid = labBookMid(pairId);
  const tapeMid = lastPublicMid(pairId);
  const prev = prevMids[pairId];

  if (useServerMatching() || useLiveBook()) {
    // Live desk: Last = print. Soft-MM bid/ask IS the traded price — do not crush to L2 mid.
    const tipPx = fillPx > 0 && Number.isFinite(fillPx) ? fillPx : tapeMid || bookMid || prev || 0;
    if (!(tipPx > 0)) return;
    // Lock Last to this print so microTick cannot snap tip back to stale Soft-MM mid.
    setLastPublicMid(pairId, tipPx);
    let next = applyMidToPairCandles(state.candles[pairId]!, pairId, tipPx, prev, {
      syntheticVolume: false,
    });
    if (fillPx > 0 && Number.isFinite(fillPx)) {
      const volAdd = amountBase > 0 ? amountBase : 0;
      for (const tf of Object.keys(next) as Timeframe[]) {
        const series = next[tf];
        if (!series?.length) continue;
        const tip = { ...series[series.length - 1]! };
        tip.close = fillPx;
        tip.high = Math.max(tip.high, tip.open, tip.close, fillPx);
        tip.low = Math.min(tip.low, tip.open, tip.close, fillPx);
        tip.volume = (tip.volume || 0) + volAdd;
        series[series.length - 1] = tip;
      }
    }
    state.candles[pairId] = next;
    prevMids[pairId] = tipPx;
    persistLiveCandleCache(pairId, true);
    return;
  }

  // Paper: advance shared clock, then wick/nudge tip toward fill.
  const paperAnchor = prev && prev > 0 ? prev : fillPx;
  let next = applyPaperClockToPairCandles(state.candles[pairId]!, pairId);
  if (fillPx > 0 && Number.isFinite(fillPx)) {
    const wickPx = clampFillWickPx(paperAnchor, fillPx, 45);
    const tipClose = nudgeCloseTowardFill(paperAnchor, fillPx, 18);
    for (const tf of Object.keys(next) as Timeframe[]) {
      const series = next[tf];
      if (!series?.length) continue;
      const tip = { ...series[series.length - 1]! };
      tip.close = tipClose;
      tip.high = Math.max(tip.high, tip.open, tip.close, wickPx);
      tip.low = Math.min(tip.low, tip.open, tip.close, wickPx);
      tip.volume = (tip.volume || 0) + 120;
      series[series.length - 1] = tip;
    }
  }
  state.candles[pairId] = next;
  if (fillPx > 0) prevMids[pairId] = fillPx;
}


/**
 * Advance candle tip for one pair. Live desk: tip ≈ L2 mid (with tape fallback),
 * so every device paints from the same book; always roll time even if mid is sticky.
 */
function tipCandlesForPair(pairId: PairId, displayMid: number, labLive: boolean): void {
  if (!state.candles[pairId]) state.candles[pairId] = {};
  const prev = prevMids[pairId];
  if (labLive) {
    const tipClose = state.candles[pairId]?.[CANDLE_BASE_TF]?.at(-1)?.close ?? 0;
    const mid =
      displayMid > 0
        ? displayMid
        : lastPublicMid(pairId) > 0
          ? lastPublicMid(pairId)
          : prev && prev > 0
            ? prev
            : tipClose > 0
              ? tipClose
              : 0;
    if (!(mid > 0)) return;
    state.candles[pairId] = applyMidToPairCandles(state.candles[pairId]!, pairId, mid, prev, {
      syntheticVolume: false,
    });
    prevMids[pairId] = mid;
    persistLiveCandleCache(pairId);
    return;
  }
  state.candles[pairId] = applyPaperClockToPairCandles(state.candles[pairId]!, pairId);
  if (displayMid > 0) prevMids[pairId] = displayMid;
}

function microTickPrices(): void {
  if (!market) return;
  const labLive = useLiveBook();
  // Hidden tab: still roll candle time with last known mid so new bars appear.
  if (document.hidden) {
    for (const p of PAIRS) {
      const mid = labLive
        ? labBookMid(p.id) || lastPublicMid(p.id) || prevMids[p.id] || 0
        : midForPair(market, p.id);
      if (mid > 0) tipCandlesForPair(p.id, mid, labLive);
    }
    return;
  }
  // Paper sine-walk around 0.05 — ONLY when desk L2 is off.
  if (!labLive) {
    market = applyLivePaperMids(market, DEFAULT_REFERENCE_MID, DEFAULT_SUP_REFERENCE_MID);
  }

  // Scrubbing: still roll candle UTC buckets (otherwise time freezes while the
  // pointer rests on the chart). Defer only heavy DOM below — tip paint already
  // buffers via pendingLiveTip / setCandleData on rollover.
  const scrubbingEarly = state.mainView === "spot" && isChartPointerBusy();

  if (state.mainView !== "spot") {
    for (const p of PAIRS) {
      if (!tickers[p.id]) continue;
      if (labLive) {
        const labMid = labBookMid(p.id);
        if (labMid > 0) {
          const book = getLabBookCache(p.id);
          tickers[p.id] = {
            ...tickers[p.id]!,
            mid: labMid,
            bid: book?.bids[0]?.price ?? labMid * 0.999,
            ask: book?.asks[0]?.price ?? labMid * 1.001,
          };
        }
      } else {
        const mid = midForPair(market, p.id);
        tickers[p.id] = { ...tickers[p.id]!, mid, bid: mid * 0.9995, ask: mid * 1.0005 };
      }
    }
    liveTickN += 1;
    if (liveTickN % 2 === 0) settleOpenOrdersFromTickers(true);
    evaluateAllPriceAlerts();
    return;
  }
  liveTickN += 1;

  // Active pair every tick; rotate other pairs — avoids ~200ms setInterval violations.
  for (let i = 0; i < PAIRS.length; i++) {
    const p = PAIRS[i]!;
    const oracleTarget = labLive ? 0 : midForPair(market, p.id);
    const labMid = labLive ? labBookMid(p.id) : 0;
    // Live: tip last = recent print or L2 mid (same as ticker header).
    const displayMid = labLive
      ? liveLastPrice(p.id) || labMid || prevMids[p.id] || 0
      : oracleTarget;
    const isActive = p.id === state.activePair;
    const rotate = liveTickN % PAIRS.length === i;
    if (isActive || rotate || chartNeedsFullReplace) {
      tipCandlesForPair(p.id, displayMid, labLive);
    } else if (displayMid > 0) {
      prevMids[p.id] = displayMid;
    }
    if (tickers[p.id]) {
      if (labLive) {
        const book = getLabBookCache(p.id);
        const bid = book?.bids[0]?.price ?? 0;
        const ask = book?.asks[0]?.price ?? 0;
        const mid = liveLastPrice(p.id) || displayMid;
        if (mid > 0) {
          tickers[p.id] = {
            ...tickers[p.id]!,
            mid,
            bid: bid > 0 ? bid : mid * 0.999,
            ask: ask > 0 ? ask : mid * 1.001,
          };
        }
      } else if (!labLive) {
        tickers[p.id] = { ...tickers[p.id]!, mid: displayMid, bid: displayMid * 0.9995, ask: displayMid * 1.0005 };
      }
    }
  }
  if (!labLive && liveTickN % 3 === 0) {
    publicTape = appendSyntheticTrade(publicTape, activeTicker());
  }
  if (liveTickN % 2 === 0) settleOpenOrdersFromTickers(true);
  if (!chartMounted) return;

  const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
  const last = candles[candles.length - 1];
  const opts = chartOpts();
  const scrubbing = scrubbingEarly || isChartPointerBusy();
  const tipRolled = !!(last && lastPaintedTipTime > 0 && last.time > lastPaintedTipTime);
  if (last) lastPaintedTipTime = last.time;
  if (chartNeedsFullReplace || !last) {
    setCandleData(candles, opts, { scrollToLive: chartNeedsFullReplace });
    chartNeedsFullReplace = false;
  } else if (!updateLastCandle(last, opts)) {
    // New UTC bucket / heal rewrite — always paint (even while scrubbing) so the
    // time axis never freezes at the last closed bar while the hair is over the pane.
    // Follow live tip on rollover unless the user is actively scrubbing.
    setCandleData(candles, opts, {
      preserveLogicalRange: scrubbing && !tipRolled,
      scrollToLive: !scrubbing && tipRolled,
    });
  }
  if (!scrubbing && state.multiChartLayout !== "1" && liveTickN % 2 === 0) {
    const n = state.multiChartLayout === "4" ? 4 : 2;
    for (let i = 2; i <= n; i++) {
      const hostId = `chart-host-${i}`;
      const tf = paneTf(i);
      const pid = panePair(i);
      const c2 = state.candles[pid]?.[tf] ?? [];
      if (c2.length) updateSecondaryChart(c2, hostId);
    }
  }
  const quote = activePairQuote();
  updateLivePriceHud(quote.mid, quote.tone !== "down", candleCountdown(state.activeTf));
  evaluateAllPriceAlerts();
  if (scrubbing) return;
  patchTickerBar(quote);
  if (liveTickN % 3 === 0) {
    const tape = document.getElementById("tape");
    if (tape) tape.innerHTML = renderTape();
    patchMobileTradeTape();
  }
  if (!useServerMatching() && liveTickN % 3 === 0) {
    marketStream?.notifyLocalBookTape();
  }
  if (liveTickN % 4 === 0) patchMarketRowsInPlace();
  // Never full-remount markets-list on the tick path — it kills in-flight clicks.
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

  const marketP = fetchMarket(DEFAULT_REFERENCE_MID);
  const liveP = fetchPoolLive();
  // Keep race tight — paper mids continue via microTick; stale pool GH is fine for a beat.
  const [mRes, liveRes] = warming
    ? await Promise.all([marketP, liveP])
    : await Promise.all([raceMs(marketP, 1_600), raceMs(liveP, 1_600)]);

  markPerf("oracle-refresh-net-end");
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
    m = applyLivePaperMids(localFallbackMarket(DEFAULT_REFERENCE_MID), DEFAULT_REFERENCE_MID);
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

  market = m!;
  poolLive = live!;
  oracleMeta = { source, fetchedAt: Date.now(), poolStatus: live!.status };
  if (useLiveBook()) {
    void hydrateDeskApiTickers(false);
    void refreshLabBooks(PAIRS.map((p) => p.id)).then(() => {
      if (state.mainView === "spot") throttledBookTapePatch();
    });
  }
  // Live desk: seed CEX-like walk around shared anchor (last print / L2), not per-tab noise.
  // Tip close still tracks live BBO via tipCandlesForPair every tick.
  if (!useLiveBook()) {
    if (needsCandleReseedForMarket(state, market)) {
      reseedCandlesFromMarket(state, market);
      chartNeedsFullReplace = true;
    } else {
      ensureCandles(state, market);
    }
  } else {
    for (const p of PAIRS) {
      if (!state.candles[p.id]) state.candles[p.id] = {};
      const labMid = labBookMid(p.id) || lastPublicMid(p.id);
      if (!(labMid > 0)) continue;
      const seedMid = chartAnchorMid(labMid) || labMid;
      const base = state.candles[p.id]![CANDLE_BASE_TF] ?? [];
      const tipClose = base[base.length - 1]?.close ?? 0;
      const empty = base.length < 8;
      const cliff =
        tipClose > 0 && (seedMid / tipClose > 1.08 || seedMid / tipClose < 0.92);
      if (empty || cliff) {
        // Prefer session cache + public prints over wiping with synthetic seed (F5 spike loss).
        // Never cliff-wipe an existing series — Soft-MM mid vs last print routinely drifts >8%.
        if (restoreLiveCandlesFromCache(p.id, seedMid)) {
          chartNeedsFullReplace = true;
        } else if (empty) {
          state.candles[p.id] = seedAllTimeframes(p.id, seedMid);
          prevMids[p.id] = labMid;
          chartNeedsFullReplace = true;
        }
        void hydrateLivePairCandlesFromApi(p.id, lastPublicMid(p.id) || seedMid).then((ok) => {
          if (!ok) return;
          chartNeedsFullReplace = true;
          if (state.mainView === "spot" && p.id === state.activePair && chartMounted) patchLive();
          else if (state.mainView === "spot" && p.id === state.activePair) render();
        });
      } else if (p.id === state.activePair && !liveHydratedPairs.has(p.id)) {
        // One-shot warm merge after boot so public prints land before the next F5.
        void hydrateLivePairCandlesFromApi(p.id, lastPublicMid(p.id) || seedMid).then((ok) => {
          if (!ok) return;
          if (state.mainView === "spot" && chartMounted) patchLive();
        });
      }
    }
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
    const labMid = useLiveBook() ? labBookMid(p.id) : 0;
    const live = useLiveBook();
    // Live: tip last = recent print or L2 (same source as ticker / chart tip).
    const displayMid = live ? liveLastPrice(p.id) || labMid : midForPair(market, p.id);
    if (live) {
      const prevTk = tickers[p.id];
      const mid = liveLastPrice(p.id);
      if (mid > 0) {
        const book = getLabBookCache(p.id);
        const bid = book?.bids[0]?.price ?? prevTk?.bid ?? mid * 0.999;
        const ask = book?.asks[0]?.price ?? prevTk?.ask ?? mid * 1.001;
        const q = buildPairQuote({
          pairId: p.id,
          mid,
          candlesByTf: state.candles[p.id],
          fallbackTf: "15m",
        });
        const spreadBps =
          bid > 0 && ask > 0 && mid > 0 ? ((ask - bid) / mid) * 10_000 : prevTk?.spreadBps ?? 0;
        tickers[p.id] = {
          ...(prevTk ?? tk),
          mid,
          bid,
          ask,
          spreadBps,
          change24hPct: q.changePct,
          high24h: q.high24h,
          low24h: q.low24h,
          volume24hBase: deskVol24hBase(p.id),
          source: "live",
        };
      } else if (prevTk && prevTk.mid > 0) {
        // Keep last L2 ticker — never overwrite with paper sine mid.
        tickers[p.id] = {
          ...prevTk,
          change24hPct: s.changePct,
          high24h: s.high,
          low24h: s.low,
          volume24hBase: deskVol24hBase(p.id),
        };
      }
    } else if (labMid > 0) {
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
    // Candle tip updates belong to microTickPrices — rebuilding every pair here
    // caused ~500ms longtasks every oracle poll. Only sync active (or lab) tip.
    if (p.id === state.activePair || displayMid > 0 || chartNeedsFullReplace) {
      tipCandlesForPair(p.id, displayMid, live);
    } else if (!live) {
      prevMids[p.id] = displayMid;
    }
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
  markPerf("oracle-refresh-end");
  const netMs = measurePerf("oracle-refresh-net", "oracle-refresh-start", "oracle-refresh-net-end");
  const cpuMs = measurePerf("oracle-refresh-cpu", "oracle-refresh-net-end", "oracle-refresh-end");
  if (cpuMs != null && cpuMs > 32) console.debug(`[perf] oracle cpu ${cpuMs.toFixed(0)}ms`);
  if (netMs != null && netMs > 400) console.debug(`[perf] oracle net ${netMs.toFixed(0)}ms (${source})`);
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
    market = applyLivePaperMids(localFallbackMarket(DEFAULT_REFERENCE_MID), DEFAULT_REFERENCE_MID);
    poolLive = pendingPoolLive();
    oracleMeta = { source: "fallback", fetchedAt: 0, poolStatus: "pending" };
    if (useLiveBook()) {
      // Don't paint paper-clock OHLC on live desk — restore session cache or wait for tape.
      for (const p of PAIRS) {
        if (!restoreLiveCandlesFromCache(p.id, 0)) {
          state.candles[p.id] = {};
        }
        restoreDeskVolCache(p.id);
      }
    } else {
      ensureCandles(state, market);
    }
    for (const p of PAIRS) {
      tickers[p.id] = tickerFromMarket(market, p.id);
      tickers[p.id]!.source = "fallback";
      prevMids[p.id] = tickers[p.id]!.mid;
    }
  } else if (useLiveBook()) {
    for (const p of PAIRS) restoreDeskVolCache(p.id);
  }
  // Live: durable /tickers (fills DB) + short /trades ring. Never seed/demo vol.
  if (useLiveBook()) {
    void hydrateDeskApiTickers(true);
    for (const p of PAIRS) void hydrateDeskVolFromApi(p.id);
  }
  render();
  // First-visit prefs must run before oracle await — otherwise settings/UI race with defaults.
  applyFirstVisitPrefs(state, {
    saveState: () => saveState(state),
    normalizeOverlays: normalizeChartOverlays,
    onQuickOrderEnabled: () => {
      const candles = state.candles[state.activePair]?.[state.activeTf] ?? [];
      softRefreshChart(candles, { ...chartOpts(), drawingsLocked: state.drawingsLocked });
    },
  });
  scheduleChartTapHint();
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
      market = applyLivePaperMids(localFallbackMarket(DEFAULT_REFERENCE_MID), DEFAULT_REFERENCE_MID);
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
  maybeShowTourV2();
  startMarketStreamLoop();
  startBookLoop();
  startLabSessionLoop();
  startSessionExpiryWatch();
  // Restore desk/lab CSRF as early as boot (not only when Account is open).
  if (isLabApiEnabled()) void maybeAutoReconnectLabSession();
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
  window.addEventListener("resize", () => {
    onMobileLayoutChange();
    positionSystemDrop();
    if (!chartMounted || state.mainView !== "spot") return;
    requestAnimationFrame(() => {
      resizeChart();
      requestAnimationFrame(() => resizeChart());
    });
  });
  // Hub iframe layout settles after first paint — kick chart resize so free-crosshair
  // gets a real host box (otherwise plot stays ~100px under a 300px order form).
  if (isHubEmbed()) {
    const kickEmbedChart = () => {
      if (!chartMounted || state.mainView !== "spot") return;
      resizeChart();
      resizeSecondaryCharts();
    };
    requestAnimationFrame(() => {
      kickEmbedChart();
      requestAnimationFrame(kickEmbedChart);
    });
    window.setTimeout(kickEmbedChart, 120);
    window.setTimeout(kickEmbedChart, 450);
  }
  try {
    window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_PX}px)`).addEventListener("change", onMobileLayoutChange);
  } catch {
    /* ignore */
  }
  window.addEventListener("hashchange", () => {
    const prevPair = state.activePair;
    const prevTf = state.activeTf;
    const prevView = state.mainView;
    applyHashToState();
    saveState(state);
    ensurePublicTape(true);
    if (state.mainView === "spot" && prevView === "spot") {
      if (state.activePair !== prevPair) {
        // applyHash already set activePair — restore prev so switchActivePair can run
        // (it early-returns when pairId === state.activePair).
        const nextPair = state.activePair;
        state.activePair = prevPair;
        switchActivePair(nextPair);
      } else if (state.activeTf !== prevTf) {
        // Same early-return trap as pair: setPaneTf no-ops when tf === state.activeTf,
        // so restore prevTf first or buttons/series never switch on hash/F5 deep-link.
        const nextTf = state.activeTf;
        state.activeTf = prevTf;
        setPaneTf(1, nextTf);
      }
    } else {
      chartMounted = false;
      render();
    }
  });
  if (typeof window !== "undefined") {
    const w = window as Window & { __hackmeExchangeDebug?: Record<string, unknown> };
    w.__hackmeExchangeDebug = {
      getCrosshairSyncDebug,
      getTimeSyncDebug,
      getMainViewport: getMainViewportDebug,
      getPaneViewport: getSecondaryViewportDebug,
      get multiChartLinked() {
        return state.multiChartLinked;
      },
      get multiChartIndependent() {
        return !state.multiChartLinked;
      },
      chartScreenshotProbe() {
        const split = document.querySelector(".chart-split") as HTMLElement | null;
        return {
          layout: detectMultiChartLayout(split),
          hosts: listChartPaneHosts(split).map((h) => h.id),
        };
      },
      /** Live matrix: every pair × TF — closed-close diversity + tip≈Last. */
      candleMatrixAudit() {
        const labLive = useLiveBook();
        // Warm every pair so inactive markets are not empty / stale.
        for (const p of PAIRS) {
          const mid = liveLastPrice(p.id) || labBookMid(p.id) || prevMids[p.id] || 0;
          if (mid > 0) tipCandlesForPair(p.id, mid, labLive);
        }
        const out: Record<
          string,
          Record<
            string,
            {
              n: number;
              uniqueClosed: number;
              gluedToTip: number;
              tipClose: number;
              tipOk: boolean;
              contiguous: boolean;
            }
          >
        > = {};
        for (const p of PAIRS) {
          const byTf = state.candles[p.id] ?? {};
          out[p.id] = {};
          for (const tf of TIMEFRAMES) {
            const series = byTf[tf] ?? [];
            if (series.length < 2) {
              out[p.id]![tf] = {
                n: series.length,
                uniqueClosed: 0,
                gluedToTip: 0,
                tipClose: 0,
                tipOk: false,
                contiguous: series.length <= 1,
              };
              continue;
            }
            const tip = series[series.length - 1]!;
            const closed = series.slice(0, -1);
            const unique = new Set(closed.map((c) => c.close.toFixed(10)));
            const glued = closed.filter((c) => tip.close > 0 && Math.abs(c.close - tip.close) / tip.close < 0.00005).length;
            const sec = TF_SEC[tf];
            let contiguous = true;
            for (let i = 1; i < series.length; i++) {
              if (series[i]!.time - series[i - 1]!.time !== sec) {
                contiguous = false;
                break;
              }
            }
            const lastPx = liveLastPrice(p.id);
            const tipOk = lastPx > 0 ? Math.abs(tip.close - lastPx) / lastPx < 0.02 : tip.close > 0;
            out[p.id]![tf] = {
              n: series.length,
              uniqueClosed: unique.size,
              gluedToTip: glued,
              tipClose: tip.close,
              tipOk,
              contiguous,
            };
          }
        }
        return out;
      },
      getFocusedPaneId: () => getFocusedChartPaneId(),
      seedOpenOrderForE2E(price: number, amountBase = 120) {
        const o = {
          id: `e2e-${uid()}`,
          pairId: state.activePair,
          side: "buy" as const,
          kind: "limit" as const,
          price,
          amountBase,
          filledBase: 0,
          status: "open" as const,
          source: "paper" as const,
          createdAt: Date.now(),
          timeInForce: "GTC" as const,
        };
        state.orders.unshift(o);
        saveState(state);
        activityTab = "orders";
        refreshActivityPanel();
        return o.id;
      },
    };
  }
}

function maybeShowTour(): void {
  if (isHubEmbed()) return;
  if (localStorage.getItem("hackme-ex-tour-v1") === "1" || sessionStorage.getItem("hackme-ex-tour-v1") === "1") {
    // Migrate session → local so the welcome tour does not reappear every tab.
    try {
      localStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      /* ignore */
    }
    maybeShowTourV2();
    return;
  }
  const labOn = isLabApiEnabled();
  const deskOn = isDeskConnectEnabled();
  const steps = [
    {
      t: "Welcome · 60s tour",
      d: deskOn
        ? "Soft-launch desk: Connect on Account, deposit to the deposit address (not Copy/login addr), then trade live L2. Caps apply."
        : labOn
          ? "HackMe Spot can run as paper or private DEMO/LAB matching. Connect a fixture on Account for live L2 — still not production custody."
          : "HackMe Spot is a paper preview. Spot mids are shared references (±drift) — not a live CEX matching engine.",
    },
    { t: "Chart · quick order", d: isMobileLayout()
        ? "Quick order is on — tap the chart to buy or sell at a price. Pinch to zoom; double-tap resets the view."
        : "Quick order is on — click the chart to place buy or sell at a price. Use the ruler for measurements." },
    { t: "Chart · tools", d: "Ruler: click-drag for Δprice / % / bars / time. Cursor: drag handles or whole object. Delete removes selected; lock freezes edits." },
    {
      t: "Trade",
      d: deskOn
        ? "After Connect, Market/Limit hit the live desk book. Use % of Avbl for size. Deposit first if Avbl is 0."
        : labOn
          ? "Market/Limit hit the lab book when connected; otherwise paper fills. Alerts: long-press/right-click chart or the Alerts tab. VIP fees show on the ticker."
          : "Use Market/Limit on the dual panel. Alerts: long-press/right-click chart or the Alerts tab. VIP fees show on the ticker.",
    },
    {
      t: "Convert & Pool",
      d: deskOn
        ? "Convert HMC/USDT + HMC/SUP at server mid after Connect. Pool shows live hashrate telemetry only (does not drive spot)."
        : labOn
          ? "Convert (HMC/USDT · HMC/SUP) uses server seed mid + inventory when LAB is connected (not BBO). Pool page shows live hashrate as telemetry only."
          : "Convert HMC/USDT and HMC/SUP at mid. Pool page shows live hashrate as telemetry — it does not feed spot mids.",
    },
  ];
  let i = 0;
  const bd = document.createElement("div");
  bd.className = "tour-backdrop";
  const dismiss = (doneToast = false) => {
    try {
      localStorage.setItem("hackme-ex-tour-v1", "1");
    } catch {
      sessionStorage.setItem("hackme-ex-tour-v1", "1");
    }
    // Skip = done with all tours (no second overlay). Completing "Next" through end may still offer v2.
    markTourV2Done();
    window.removeEventListener("keydown", onKey);
    bd.remove();
    document.querySelectorAll(".tour-backdrop, #tour-v2-backdrop").forEach((el) => el.remove());
    if (doneToast) toast("You're set — try a market buy", "ok");
    scheduleChartTapHint({ delayMs: 600 });
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

function maybeShowTourV2(): void {
  if (isHubEmbed()) return;
  if (tourV2Done()) return;
  if (localStorage.getItem("hackme-ex-tour-v1") !== "1" && sessionStorage.getItem("hackme-ex-tour-v1") !== "1") return;

  let i = 0;
  let paintTimer = 0;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
    }
  };
  const dismiss = () => {
    markTourV2Done();
    if (paintTimer) window.clearTimeout(paintTimer);
    document.querySelectorAll(".tour-backdrop, #tour-v2-backdrop, .tour-v2-backdrop").forEach((el) => el.remove());
    window.removeEventListener("keydown", onKey);
  };
  const paint = () => {
    // Skip PWA step when the install banner is not on screen.
    while (i < TOUR_V2_STEPS.length) {
      const step = TOUR_V2_STEPS[i]!;
      if (step.selector === "#pwa-install-banner" && !document.querySelector(step.selector)) {
        i += 1;
        continue;
      }
      break;
    }
    if (i >= TOUR_V2_STEPS.length) {
      dismiss();
      return;
    }
    const step = TOUR_V2_STEPS[i]!;
    document.getElementById("tour-v2-backdrop")?.remove();
    // Never mutate mainView — deep-links (#convert / #account) must stay put.
    if (step.selector && state.mainView === "spot") {
      document.querySelector(step.selector)?.scrollIntoView({ block: "nearest" });
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = renderTourV2Overlay(step, i, TOUR_V2_STEPS.length);
    const bd = wrap.firstElementChild as HTMLElement;
    document.body.appendChild(bd);
    bd.querySelector("#tour-v2-skip")?.addEventListener("click", () => dismiss());
    bd.querySelector("#tour-v2-next")?.addEventListener("click", () => {
      if (i + 1 >= TOUR_V2_STEPS.length) {
        dismiss();
        toast("Tour complete — explore Account, Convert & Pool", "ok");
        return;
      }
      i += 1;
      paint();
    });
    bd.addEventListener("click", (e) => {
      if (e.target === bd) dismiss();
    });
  };
  window.addEventListener("keydown", onKey);
  paintTimer = window.setTimeout(paint, 800);
}

window.addEventListener("beforeunload", () => {
  if (pollTimer) clearInterval(pollTimer);
  if (tickTimer) clearInterval(tickTimer);
  if (oracleAgeTimer) clearInterval(oracleAgeTimer);
  stopBookLoop();
  marketStream?.stop();
  stopLabGuard?.();
  stopLabSessionGuard();
  clearTimeSyncRegistry();
  destroyChart();
});
