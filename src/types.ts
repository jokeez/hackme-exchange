export type PoolStats = {
  hashrate?: number;
  workers?: number;
  miners?: number;
  status?: string;
  block_height?: number;
  tip_height?: number;
  pool?: string;
};

export type WorkStats = {
  pool_hashrate_gh_s?: number;
  reward_per_m?: number;
  workers_online?: number;
  workers_count?: number;
  target_mod?: number;
  base_reward_hmc?: number;
  total_payout_hmc?: number;
  status?: string;
};

export type SupEconomics = {
  ok?: boolean;
  economics?: {
    max_supply_sup?: number;
    total_minted_sup?: number;
    remaining_sup?: number;
  };
};

export type PairId = "HMC_USDT" | "SUP_USDT" | "HMC_SUP" | "HMC_BTC" | "SUP_BTC";

export type PairMeta = {
  id: PairId;
  base: string;
  quote: string;
  label: string;
  tag: string;
  lane: "primary" | "companion" | "cross" | "btc";
  decimals: number;
  color: string;
};

export type Ticker = {
  pairId: PairId;
  mid: number;
  bid: number;
  ask: number;
  spreadBps: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  volume24hBase: number;
  volume24hQuote: number;
  source: "live" | "fallback";
  fetchedAt: number;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Timeframe = "30s" | "1m" | "3m" | "5m" | "15m" | "1H" | "2H" | "4H" | "1D" | "1W";

export const TF_SEC: Record<Timeframe, number> = {
  "30s": 30,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "1H": 3600,
  "2H": 7200,
  "4H": 14400,
  "1D": 86400,
  "1W": 604800,
};

export const TIMEFRAMES: Timeframe[] = ["30s", "1m", "3m", "5m", "15m", "1H", "2H", "4H", "1D", "1W"];
export const QUICK_TFS: Timeframe[] = ["1m", "5m", "1H", "1D"];

export type ChartMode = "candles" | "bars" | "line" | "area" | "heikin";

export type CandleScheme = "classic" | "blue" | "neon" | "mono";

export type CandleStyle = {
  bullBody: string;
  bearBody: string;
  bullWick: string;
  bearWick: string;
  bullBorder: string;
  bearBorder: string;
};

export const DEFAULT_CANDLE_STYLE: CandleStyle = {
  bullBody: "#00e676",
  bearBody: "#ff5252",
  bullWick: "#00e676",
  bearWick: "#ff5252",
  bullBorder: "#00e676",
  bearBorder: "#ff5252",
};

export type ChartOverlaySettings = {
  showVolume: boolean;
  showOrderLines: boolean;
  showLastPrice: boolean;
  orderPreview: boolean;
  quickOrder: boolean;
};

export const DEFAULT_CHART_OVERLAYS: ChartOverlaySettings = {
  showVolume: true,
  showOrderLines: true,
  showLastPrice: true,
  orderPreview: true,
  quickOrder: false,
};

export type MaLineConfig = { enabled: boolean; period: number; color: string };

export type IndicatorConfig = {
  ma: MaLineConfig[];
};

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  ma: [
    { enabled: false, period: 7, color: "#fcd535" },
    { enabled: true, period: 25, color: "#e040fb" },
    { enabled: true, period: 99, color: "#7c4dff" },
    { enabled: false, period: 200, color: "#ff5252" },
  ],
};

export type MultiChartLayout = "1" | "2v" | "2h" | "4";

/** Timeframes for secondary panes (hosts 2–4). Pane 1 uses activeTf. */
export type MultiPaneTfs = [Timeframe, Timeframe, Timeframe];

export const DEFAULT_MULTI_PANE_TFS: MultiPaneTfs = ["15m", "1H", "1D"];

export type IndicatorId = "ema20" | "ema50" | "ema100" | "ema200" | "sma20" | "bb" | "vwap" | "rsi" | "macd" | "stoch";

export type ChartSettings = {
  candleScheme: CandleScheme;
  candleStyle: CandleStyle;
  logScale: boolean;
  gridVisible: boolean;
  gridOpacity: number;
  bgGradient: boolean;
  indicators: Record<IndicatorId, boolean>;
};

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  candleScheme: "classic",
  candleStyle: structuredClone(DEFAULT_CANDLE_STYLE),
  logScale: false,
  gridVisible: true,
  gridOpacity: 0.07,
  bgGradient: true,
  indicators: {
    ema20: false,
    ema50: true,
    ema100: false,
    ema200: false,
    sma20: false,
    bb: false,
    vwap: false,
    rsi: false,
    macd: false,
    stoch: false,
  },
};

export type DrawTool = "cursor" | "hline" | "trend" | "fib" | "rect" | "text" | "measure";

export type Drawing = {
  id: string;
  pairId: PairId;
  tool: DrawTool;
  points: { time: number; price: number }[];
  text?: string;
  color: string;
};

export type OrderSide = "buy" | "sell";

export type OrderKind = "market" | "limit" | "stop_limit" | "stop_market" | "trailing_stop" | "oco";

export type TimeInForce = "GTC" | "IOC" | "FOK";

export type Order = {
  id: string;
  pairId: PairId;
  side: OrderSide;
  kind: OrderKind;
  price: number;
  stopPrice?: number;
  trailPct?: number;
  trailAnchor?: number;
  amountBase: number;
  filledBase: number;
  status: "open" | "triggered" | "filled" | "cancelled";
  timeInForce?: TimeInForce;
  postOnly?: boolean;
  ocoGroupId?: string;
  ocoRole?: "tp" | "sl";
  /** Lab server order — wallet already reflects server available (skip local reserve). */
  source?: "paper" | "lab";
  createdAt: number;
};

export type Trade = {
  id: string;
  pairId: PairId;
  side: OrderSide;
  price: number;
  amountBase: number;
  amountQuote: number;
  feeQuote: number;
  /** HMC amount when feePaidInHmc; 0 otherwise */
  feeHmc: number;
  feeRole: "maker" | "taker";
  feePaidInHmc: boolean;
  ts: number;
};

export type LedgerKind = "trade" | "deposit" | "withdrawal" | "transfer" | "fee" | "convert";

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  asset: string;
  amount: number;
  usdtValue: number;
  note: string;
  ts: number;
  pairId?: PairId;
};

export type EquitySnapshot = {
  ts: number;
  equityUsdt: number;
};

export type BookLevel = {
  price: number;
  amountBase: number;
  totalQuote: number;
};

export type Wallet = {
  usdt: number;
  hmc: number;
  sup: number;
  btc: number;
};

export type MainView = "spot" | "convert" | "pool" | "account";

export type ThemeId = "hub" | "wallet";

export type FeeConfig = {
  makerBps: number;
  takerBps: number;
  payFeesInHmc: boolean;
  hmcDiscountPct: number;
};

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  makerBps: 8,
  takerBps: 10,
  payFeesInHmc: false,
  hmcDiscountPct: 25,
};

export const STATE_VERSION = 13;

export type DemoState = {
  wallet: Wallet;
  orders: Order[];
  trades: Trade[];
  ledger: LedgerEntry[];
  equitySnapshots: EquitySnapshot[];
  drawings: Drawing[];
  candles: Partial<Record<PairId, Partial<Record<Timeframe, Candle[]>>>>;
  activePair: PairId;
  activeTf: Timeframe;
  chartMode: ChartMode;
  chartSettings: ChartSettings;
  favoritePairs: PairId[];
  mainView: MainView;
  bookGrouping: number;
  bookView: "book" | "depth";
  oracleAnchor: number;
  initialEquityUsdt: number;
  priceAlerts: { id: string; pairId: PairId; price: number; fired: boolean; createdAt: number }[];
  equityBaselineV: number;
  stateVersion: number;
  feeConfig: FeeConfig;
  secondaryTf: Timeframe;
  /** Per-pane TF for multi-chart hosts 2/3/4 (index 0 → host-2). */
  multiPaneTfs: MultiPaneTfs;
  chartFullscreen: boolean;
  multiChart: boolean;
  multiChartLayout: MultiChartLayout;
  chartOverlays: ChartOverlaySettings;
  indicatorConfig: IndicatorConfig;
  drawingsLocked: boolean;
  activeDrawTool: DrawTool;
};

export type MarketSnapshot = {
  hmcUsdt: number;
  supUsdt: number;
  hmcSup: number;
  hmcBtc: number;
  supBtc: number;
  poolGh: number;
  rewardPerM: number;
  workers: number;
  supMinted: number;
  supMax: number;
  blockHeight: number;
  btcUsd: number;
  targetMod: number;
  totalPayoutHmc: number;
};

export type PoolLive = {
  poolGh: number;
  workers: number;
  miners: number;
  blockHeight: number;
  rewardPerM: number;
  totalPayoutHmc: number;
  targetMod: number;
  status: string;
};

export type ChartMountOpts = {
  pairId: PairId;
  tf: Timeframe;
  mode: ChartMode;
  settings: ChartSettings;
  overlays: ChartOverlaySettings;
  drawings: Drawing[];
  orders: Order[];
  trades?: Trade[];
  /** Main Indicator · MA1–4 periods/colors from the indicator modal. */
  indicatorConfig?: IndicatorConfig;
  /** Armed / fired price alerts drawn as dashed cyan lines. */
  alerts?: { price: number; fired: boolean }[];
  lastPrice?: number;
  lastPriceUp?: boolean;
  yesterdayClose?: number;
  watermark?: string;
  drawingsLocked?: boolean;
  onCrosshair?: (c: Candle | null) => void;
  onOrderPriceDrag?: (orderId: string, newPrice: number) => void;
  onContextMenu?: (price: number, clientX: number, clientY: number) => void;
  onUpdateDrawing?: (d: Drawing) => void;
  /** Called when user pans near the left edge — prepend more bars. Return how many were added. */
  onNeedHistory?: (bars: number) => number;
};
