import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type {
  Candle,
  ChartMode,
  ChartMountOpts,
  ChartSettings,
  Drawing,
  IndicatorConfig,
  IndicatorId,
  Order,
  Trade,
  Timeframe,
} from "./types";
import { DEFAULT_INDICATOR_CONFIG, TF_SEC } from "./types";
import { chartPriceFormatter } from "./format";
import { getPair } from "./registry";
import { bollinger, ema, macd, rsi, sma, stochastic, toHeikin, vwap } from "./indicators";
import { computeMeasureStats, isMeaningfulMeasure, resolvePaintDrawings } from "./chartDraw";
import { MAX_CANDLES } from "./candles";
import { logicalRangeToIndices, maxBodyFracForTf, robustPriceRange, sanitizeCandleExtremes } from "./chartScale";

const SCHEMES = {
  classic: { up: "#00e676", down: "#ff5252" },
  blue: { up: "#42a5f5", down: "#ff9800" },
  neon: { up: "#39ff14", down: "#ff00ff" },
  mono: { up: "#e0e0e0", down: "#757575" },
};

let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let barSeries: ISeriesApi<"Bar"> | null = null;
let lineSeries: ISeriesApi<"Line"> | null = null;
let areaSeries: ISeriesApi<"Area"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let overlaySeries: ISeriesApi<"Line">[] = [];
let oscSeries: ISeriesApi<"Line">[] = [];
let priceLines: IPriceLine[] = [];
let priceLineOwner:
  | ISeriesApi<"Candlestick">
  | ISeriesApi<"Bar">
  | ISeriesApi<"Line">
  | ISeriesApi<"Area">
  | null = null;
let drawCanvas: HTMLCanvasElement | null = null;
let hostEl: HTMLElement | null = null;
let mounted = false;
let hostResizeObs: ResizeObserver | null = null;
let resizeRaf = 0;
let currentMode: ChartMode = "candles";
let currentSettings: ChartSettings | null = null;
let currentCandles: Candle[] = [];
/** Raw (non-Heikin) series used so live ticks can recompute HA correctly. */
let rawCandlesCache: Candle[] = [];
let dragOrderId: string | null = null;
let onOrderDrag: ((id: string, price: number) => void) | undefined;
let pendingDraw: Drawing | null = null;
let drawPoints: { time: number; price: number }[] = [];
let activeTool: Drawing["tool"] = "cursor";
let lastOpts: ChartMountOpts | null = null;
let contextPriceLine: IPriceLine | null = null;
let ydayPriceLine: IPriceLine | null = null;
let lastPriceLine: IPriceLine | null = null;
let tradeMarks: Trade[] = [];
let watermarkEl: HTMLElement | null = null;
let hudEl: HTMLElement | null = null;
let tradeTipEl: HTMLElement | null = null;
let selectedDrawingId: string | null = null;
let hoveredDrawingId: string | null = null;
let dragDraw:
  | null
  | {
      id: string;
      mode: "move" | "p0" | "p1";
      startMouse: { x: number; y: number };
      startPoints: { time: number; price: number }[];
    } = null;
let measurePreview: { a: { time: number; price: number }; b: { time: number; price: number } } | null = null;
let historyLoading = false;
let onAddDrawingCb: ((d: Drawing) => void) | undefined;
let liveDrawings: Drawing[] = [];
let firstDataApplied = false;
/** Preserve zoom/pan across soft remounts (indicator toggle, lock, layout). */
let savedLogicalRange: { from: number; to: number } | null = null;
let priceScaleManual = false;
let drawPointerMove: ((e: PointerEvent) => void) | null = null;
let drawPointerUp: ((e: PointerEvent) => void) | null = null;
let priceWheelCleanup: (() => void) | null = null;
/** Trackpad residual — apply zoom only when a full notch accumulates. */
let priceWheelResidual = 0;
/** Min ms between applied price-scale notches (mice that spam 100px events). */
let priceWheelLastApplyMs = 0;
const PRICE_WHEEL_MIN_INTERVAL_MS = 50;
/** ~3% span change per notch — was 6%, still too snappy on cheap mice. */
const PRICE_WHEEL_SPAN_FACTOR = 0.03;
/** Pixels that accumulate into one notch (mouse ≈100; bump so partial rolls need more). */
const PRICE_WHEEL_UNIT = 140;

/** Prefetch when the left of the visible logical range is within this many bars of index 0. */
export const HISTORY_LEFT_EDGE = 40;
const HISTORY_MIN_BATCH = 120;
const HISTORY_OVERSHOOT_BUFFER = 80;
const HISTORY_LOAD_GUARD = 8;

/** How many bars to request when the visible logical `from` is near/past the left edge. */
export function historyBarsToFetch(logicalFrom: number): number {
  if (!Number.isFinite(logicalFrom) || logicalFrom >= HISTORY_LEFT_EDGE) return 0;
  return Math.max(HISTORY_MIN_BATCH, Math.ceil(HISTORY_LEFT_EDGE - logicalFrom) + HISTORY_OVERSHOOT_BUFFER);
}

/**
 * Merge live chart mount opts without dropping mount-time callbacks.
 * Callers often pass `chartOpts()` (no handlers) on tick/history refresh.
 */
export function mergeMountOpts(prev: ChartMountOpts | null, next: ChartMountOpts): ChartMountOpts {
  if (!prev) return next;
  return {
    ...next,
    onCrosshair: next.onCrosshair ?? prev.onCrosshair,
    onOrderPriceDrag: next.onOrderPriceDrag ?? prev.onOrderPriceDrag,
    onContextMenu: next.onContextMenu ?? prev.onContextMenu,
    onUpdateDrawing: next.onUpdateDrawing ?? prev.onUpdateDrawing,
    onNeedHistory: next.onNeedHistory ?? prev.onNeedHistory,
  };
}

let historyLoadTimer = 0;

function maybeLoadHistory(range: { from: number; to: number }): void {
  if (!chart || historyLoading || !lastOpts?.onNeedHistory) return;
  if (range.from >= HISTORY_LEFT_EDGE) return;
  if (historyLoadTimer) return;
  historyLoadTimer = window.setTimeout(() => {
    historyLoadTimer = 0;
    if (!chart || historyLoading || !lastOpts?.onNeedHistory) return;
    const live = chart.timeScale().getVisibleLogicalRange();
    if (!live || live.from >= HISTORY_LEFT_EDGE) return;
    historyLoading = true;
    try {
      let guard = 0;
      let r: { from: number; to: number } | null = live;
      while (r && r.from < HISTORY_LEFT_EDGE && guard++ < HISTORY_LOAD_GUARD) {
        const need = historyBarsToFetch(r.from);
        if (need <= 0) break;
        const added = lastOpts.onNeedHistory(need);
        if (!added) break;
        r = chart.timeScale().getVisibleLogicalRange();
      }
    } finally {
      historyLoading = false;
    }
  }, 80);
}
let ghostPreview: { tool: Drawing["tool"]; a: { time: number; price: number }; b: { time: number; price: number } } | null =
  null;
let hudPulseTimer: ReturnType<typeof setTimeout> | null = null;

function priceFormatOptions() {
  return { type: "custom" as const, formatter: chartPriceFormatter, minMove: 1e-12 };
}

function schemeColors(s: ChartSettings) {
  const base = SCHEMES[s.candleScheme];
  const cs = s.candleStyle;
  if (!cs) return base;
  return { up: cs.bullBody || base.up, down: cs.bearBody || base.down };
}

function wickColors(s: ChartSettings) {
  const cs = s.candleStyle;
  const base = schemeColors(s);
  return { up: cs?.bullWick || base.up, down: cs?.bearWick || base.down };
}

function hidePriceSeries(): void {
  candleSeries?.applyOptions({ visible: false });
  barSeries?.applyOptions({ visible: false });
  lineSeries?.applyOptions({ visible: false });
  areaSeries?.applyOptions({ visible: false });
}

function showMode(mode: ChartMode): void {
  hidePriceSeries();
  if (mode === "candles" || mode === "heikin") candleSeries?.applyOptions({ visible: true });
  if (mode === "bars") barSeries?.applyOptions({ visible: true });
  if (mode === "line") lineSeries?.applyOptions({ visible: true });
  if (mode === "area") areaSeries?.applyOptions({ visible: true });
}

function clearOverlays(): void {
  if (!chart) return;
  for (const s of overlaySeries) chart.removeSeries(s);
  overlaySeries = [];
  for (const s of oscSeries) chart.removeSeries(s);
  oscSeries = [];
}

function clearPriceLines(): void {
  const series = priceLineOwner ?? candleSeries;
  if (!series) return;
  const seen = new Set<IPriceLine>();
  const drop = (pl: IPriceLine | null) => {
    if (!pl || seen.has(pl)) return;
    seen.add(pl);
    try {
      series.removePriceLine(pl);
    } catch {
      /* already detached */
    }
  };
  for (const pl of priceLines) drop(pl);
  drop(contextPriceLine);
  drop(lastPriceLine);
  drop(ydayPriceLine);
  priceLines = [];
  contextPriceLine = null;
  lastPriceLine = null;
  ydayPriceLine = null;
  priceLineOwner = null;
}

function primarySeries():
  | ISeriesApi<"Candlestick">
  | ISeriesApi<"Bar">
  | ISeriesApi<"Line">
  | ISeriesApi<"Area">
  | null {
  if (currentMode === "bars" && barSeries) return barSeries;
  if (currentMode === "line" && lineSeries) return lineSeries;
  if (currentMode === "area" && areaSeries) return areaSeries;
  return candleSeries;
}

/** Keep lastOpts.drawings in lockstep with the live canvas set (scroll must never revive deletes). */
function syncDrawingsStore(drawings: Drawing[]): void {
  liveDrawings = drawings;
  if (lastOpts) lastOpts = { ...lastOpts, drawings: [...drawings] };
}

function prepCandles(raw: Candle[], mode: ChartMode, tf?: Timeframe): Candle[] {
  const sorted = [...raw].sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];
  for (const c of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.time === c.time) deduped[deduped.length - 1] = c;
    else deduped.push(c);
  }
  const bodyCap = maxBodyFracForTf(tf ?? lastOpts?.tf ?? "15m");
  const cleaned = sanitizeCandleExtremes(deduped, bodyCap);
  return mode === "heikin" ? toHeikin(cleaned) : cleaned;
}

/** LWC autoscale override — ignore extreme wicks (TV-style scale to body). */
function makeRobustAutoscaleProvider() {
  return (original: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: { above: number; below: number } } | null) => {
    if (priceScaleManual) return original();
    if (!chart || currentCandles.length < 2) return original();
    try {
      const lr = chart.timeScale().getVisibleLogicalRange();
      if (!lr || !Number.isFinite(lr.from) || !Number.isFinite(lr.to)) return original();
      const { fromIdx, toIdx } = logicalRangeToIndices(lr.from, lr.to, currentCandles.length);
      const robust = robustPriceRange(currentCandles, fromIdx, toIdx);
      if (!robust) return original();
      return {
        priceRange: robust,
        margins: { above: 10, below: 12 },
      };
    } catch {
      return original();
    }
  };
}

/** Periods covered by Main Indicator · MA modal — skip duplicate quick-tab lines. */
function maConfigPeriods(cfg?: IndicatorConfig): Set<number> {
  const out = new Set<number>();
  if (!cfg?.ma) return out;
  for (const m of cfg.ma) {
    if (m.enabled && m.period > 0) out.add(m.period);
  }
  return out;
}

function applyIndicators(candles: Candle[], settings: ChartSettings, maConfig?: IndicatorConfig): void {
  if (!chart || !candleSeries) return;
  clearOverlays();
  const addLine = (data: { time: number; value: number }[], color: string, width: 1 | 2 | 3 | 4 = 1, scaleId?: string) => {
    const s = chart!.addSeries(LineSeries, {
      color,
      lineWidth: width,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: priceFormatOptions(),
      priceScaleId: scaleId,
      // TV "scale price chart only" — overlays must not squash candles.
      autoscaleInfoProvider: scaleId ? undefined : () => null,
    });
    s.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    if (scaleId && scaleId !== "right") {
      chart!.priceScale(scaleId).applyOptions({ scaleMargins: { top: 0.78, bottom: 0.02 }, visible: false });
    }
    return s;
  };

  const covered = maConfigPeriods(maConfig);
  if (maConfig?.ma?.length) {
    for (const m of maConfig.ma) {
      if (!m.enabled || m.period < 1) continue;
      const period = Math.min(500, Math.max(1, Math.round(m.period)));
      overlaySeries.push(addLine(sma(candles, period), m.color || "#fcd535", period >= 50 ? 2 : 1));
    }
  }

  const ind = settings.indicators;
  // Quick tabs: draw only when not already covered by MA1–4 periods.
  if (ind.ema20 && !covered.has(20)) overlaySeries.push(addLine(ema(candles, 20), "#ffd54f"));
  if (ind.ema50 && !covered.has(50)) overlaySeries.push(addLine(ema(candles, 50), "#00e5ff", 2));
  if (ind.ema100 && !covered.has(100)) overlaySeries.push(addLine(ema(candles, 100), "#ab47bc"));
  if (ind.ema200 && !covered.has(200)) overlaySeries.push(addLine(ema(candles, 200), "#ff7043"));
  if (ind.sma20 && !covered.has(20)) overlaySeries.push(addLine(sma(candles, 20), "#81c784"));
  if (ind.vwap) overlaySeries.push(addLine(vwap(candles), "#ffeb3b", 2));
  if (ind.bb) {
    const bb = bollinger(candles);
    overlaySeries.push(addLine(bb.upper, "rgba(77,228,255,0.55)"));
    overlaySeries.push(addLine(bb.mid, "rgba(77,228,255,0.35)"));
    overlaySeries.push(addLine(bb.lower, "rgba(77,228,255,0.55)"));
  }

  if (ind.rsi) {
    oscSeries.push(addLine(rsi(candles), "#ce93d8", 2, "rsi"));
  }
  if (ind.macd) {
    const m = macd(candles);
    oscSeries.push(addLine(m.macd, "#4fc3f7", 1, "macd"));
    oscSeries.push(addLine(m.signal, "#ffb74d", 1, "macd"));
  }
  if (ind.stoch) {
    const st = stochastic(candles);
    oscSeries.push(addLine(st.k, "#81c784", 1, "stoch"));
    oscSeries.push(addLine(st.d, "#e57373", 1, "stoch"));
  }
}

function renderOrderLines(
  orders: Order[],
  overlays: ChartMountOpts["overlays"],
  lastPrice?: number,
  lastUp = true,
  yday?: number,
  alerts?: { price: number; fired: boolean }[],
): void {
  const series = primarySeries();
  if (!series) return;
  clearPriceLines();
  priceLineOwner = series;
  if (overlays.showOrderLines) {
    for (const o of orders.filter((x) => x.status === "open" || x.status === "triggered")) {
      const color = o.side === "buy" ? "#00e676" : "#ff5252";
      priceLines.push(
        series.createPriceLine({
          price: o.price,
          color,
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${o.side} ${o.kind}`,
        }),
      );
      if (o.stopPrice) {
        priceLines.push(
          series.createPriceLine({
            price: o.stopPrice,
            color: "#ffb347",
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: true,
            title: "Stop",
          }),
        );
      }
    }
  }
  if (alerts?.length) {
    for (const a of alerts) {
      if (!(a.price > 0)) continue;
      priceLines.push(
        series.createPriceLine({
          price: a.price,
          color: a.fired ? "rgba(255, 183, 77, 0.45)" : "rgba(77, 228, 255, 0.85)",
          lineWidth: 1,
          lineStyle: a.fired ? 3 : 2,
          axisLabelVisible: true,
          title: a.fired ? "Alert✓" : "Alert",
        }),
      );
    }
  }
  if (yday && yday > 0) {
    ydayPriceLine = series.createPriceLine({
      price: yday,
      color: "rgba(158, 176, 207, 0.55)",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "Yday",
    });
    priceLines.push(ydayPriceLine);
  }
  if (overlays.showLastPrice && lastPrice && lastPrice > 0) {
    lastPriceLine = series.createPriceLine({
      price: lastPrice,
      color: lastUp ? "#00e676" : "#ff5252",
      lineWidth: 1,
      lineStyle: 0,
      axisLabelVisible: true,
      title: "",
    });
    priceLines.push(lastPriceLine);
  }
}

/**
 * Optional ephemeral RMB highlight. Prefer null (menu-only) — sticky orange lines
 * previously survived clearPriceLines and could not be removed.
 */
export function setContextPriceMarker(price: number | null): void {
  if (!candleSeries) return;
  if (contextPriceLine) {
    try {
      candleSeries.removePriceLine(contextPriceLine);
    } catch {
      /* already detached */
    }
    contextPriceLine = null;
  }
  // Intentionally no sticky line: RMB opens the context menu only.
  void price;
}

function drawTradeMarks(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!chart || !candleSeries || !tradeMarks.length) return;
  const ts = chart.timeScale();
  for (const t of tradeMarks.slice(0, 80)) {
    const time = Math.floor(t.ts / 1000) as UTCTimestamp;
    const x = ts.timeToCoordinate(time);
    const y = candleSeries.priceToCoordinate(t.price);
    if (x == null || y == null) continue;
    const buy = t.side === "buy";
    ctx.fillStyle = buy ? "#00e676" : "#ff5252";
    ctx.beginPath();
    if (buy) {
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x - 6, y + 20);
      ctx.lineTo(x + 6, y + 20);
    } else {
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x - 6, y - 20);
      ctx.lineTo(x + 6, y - 20);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "9px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(buy ? "B" : "S", x, buy ? y + 18 : y - 12);
  }
}

function ensureTradeTip(): void {
  if (!hostEl || tradeTipEl) return;
  tradeTipEl = document.createElement("div");
  tradeTipEl.className = "trade-mark-tip hidden";
  hostEl.appendChild(tradeTipEl);
  hostEl.addEventListener("mousemove", (e) => {
    if (!chart || !candleSeries || !tradeTipEl || !tradeMarks.length) return;
    const rect = hostEl!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ts = chart.timeScale();
    let hit: Trade | null = null;
    for (const t of tradeMarks.slice(0, 80)) {
      const time = Math.floor(t.ts / 1000) as UTCTimestamp;
      const x = ts.timeToCoordinate(time);
      const y = candleSeries.priceToCoordinate(t.price);
      if (x == null || y == null) continue;
      const cy = t.side === "buy" ? y + 15 : y - 15;
      if (Math.abs(mx - x) < 10 && Math.abs(my - cy) < 12) {
        hit = t;
        break;
      }
    }
    if (!hit) {
      tradeTipEl.classList.add("hidden");
      return;
    }
    const verb = hit.side === "buy" ? "Bought" : "Sold";
    const base = getPair(hit.pairId).base;
    tradeTipEl.textContent = `${verb} ${hit.amountBase} ${base} @ ${chartPriceFormatter(hit.price)}`;
    tradeTipEl.style.left = `${mx + 12}px`;
    tradeTipEl.style.top = `${my - 8}px`;
    tradeTipEl.classList.remove("hidden");
  });
  hostEl.addEventListener("mouseleave", () => tradeTipEl?.classList.add("hidden"));
}

function xyOf(pt: { time: number; price: number }): { x: number; y: number } | null {
  if (!chart || !candleSeries) return null;
  const x = chart.timeScale().timeToCoordinate(pt.time as UTCTimestamp);
  const y = candleSeries.priceToCoordinate(pt.price);
  if (x == null || y == null) return null;
  return { x, y };
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, selected ? 5 : 4, 0, Math.PI * 2);
  ctx.fillStyle = "#05070d";
  ctx.fill();
  ctx.strokeStyle = selected ? "#4de4ff" : "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function measureHud(
  ctx: CanvasRenderingContext2D,
  a: { time: number; price: number },
  b: { time: number; price: number },
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tf: Timeframe,
): void {
  const st = computeMeasureStats(a, b, tf);
  const boxW = 148;
  const boxH = 72;
  const mx = (x1 + x2) / 2 - boxW / 2;
  const my = Math.min(y1, y2) - boxH - 12;
  const left = Math.max(4, Math.min(mx, (hostEl?.clientWidth ?? 400) - boxW - 4));
  let top = my;
  if (top < 4) top = Math.max(y1, y2) + 12;
  // Rounded pill (TradingView-like measure chip)
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.arcTo(left + boxW, top, left + boxW, top + boxH, r);
  ctx.arcTo(left + boxW, top + boxH, left, top + boxH, r);
  ctx.arcTo(left, top + boxH, left, top, r);
  ctx.arcTo(left, top, left + boxW, top, r);
  ctx.closePath();
  ctx.fillStyle = st.up ? "rgba(0,192,115,0.94)" : "rgba(219,68,85,0.94)";
  ctx.fill();
  ctx.strokeStyle = st.up ? "rgba(110,255,173,0.55)" : "rgba(255,140,150,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "700 13px JetBrains Mono, monospace";
  ctx.fillText(`${st.up ? "+" : ""}${chartPriceFormatter(st.dPrice)}`, left + 10, top + 20);
  ctx.font = "600 12px JetBrains Mono, monospace";
  ctx.fillText(`${st.up ? "+" : ""}${st.dPct.toFixed(2)}%`, left + 10, top + 38);
  ctx.font = "500 10px Space Grotesk, Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(`${st.bars} bars · ${st.timeLabel}`, left + 10, top + 56);
  // Connecting guide ticks on the measure segment
  ctx.setLineDash([]);
  ctx.strokeStyle = st.up ? "rgba(110,255,173,0.85)" : "rgba(255,140,150,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1, y1 + (st.up ? -6 : 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2, y2 + (st.up ? -6 : 6));
  ctx.stroke();
}

function redrawDrawings(drawings: Drawing[]): void {
  if (!drawCanvas || !hostEl || !chart || !candleSeries) return;
  syncDrawingsStore(drawings);
  const ctx = drawCanvas.getContext("2d");
  if (!ctx) return;
  const w = hostEl.clientWidth;
  const h = hostEl.clientHeight;
  drawCanvas.width = w;
  drawCanvas.height = h;
  ctx.clearRect(0, 0, w, h);
  // Reset canvas state so long sessions never stack shadows/filters
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  const ts = chart.timeScale();
  drawTradeMarks(ctx, w, h);
  const tf = (lastOpts?.tf ?? "15m") as Timeframe;

  const paint = (d: Drawing) => {
    const selected = d.id === selectedDrawingId;
    const hovered = d.id === hoveredDrawingId && !selected;
    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    ctx.lineWidth = selected ? 2.4 : hovered ? 2 : 1.5;
    ctx.globalAlpha = hovered ? 0.95 : 1;
    ctx.setLineDash(d.tool === "measure" ? [5, 4] : []);
    if (selected) {
      ctx.shadowColor = "rgba(77,228,255,0.45)";
      ctx.shadowBlur = 6;
    } else {
      ctx.shadowBlur = 0;
    }

    if (d.tool === "hline" && d.points[0]) {
      const y = candleSeries!.priceToCoordinate(d.points[0].price);
      if (y != null) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        if (selected || hovered) drawHandle(ctx, w * 0.5, y, selected);
      }
    }
    if ((d.tool === "trend" || d.tool === "measure") && d.points.length >= 2) {
      const p0 = xyOf(d.points[0]);
      const p1 = xyOf(d.points[1]);
      if (p0 && p1) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        if (d.tool === "measure") {
          ctx.shadowBlur = 0;
          measureHud(ctx, d.points[0], d.points[1], p0.x, p0.y, p1.x, p1.y, tf);
        }
        if (selected || hovered || d.tool === "measure") {
          drawHandle(ctx, p0.x, p0.y, selected);
          drawHandle(ctx, p1.x, p1.y, selected);
        }
      }
    }
    if (d.tool === "rect" && d.points.length >= 2) {
      const p0 = xyOf(d.points[0]);
      const p1 = xyOf(d.points[1]);
      if (p0 && p1) {
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const rw = Math.abs(p1.x - p0.x);
        const rh = Math.abs(p1.y - p0.y);
        ctx.globalAlpha = selected || hovered ? 0.22 : 0.15;
        ctx.fillRect(x, y, rw, rh);
        ctx.globalAlpha = 1;
        ctx.strokeRect(x, y, rw, rh);
        if (selected || hovered) {
          drawHandle(ctx, p0.x, p0.y, selected);
          drawHandle(ctx, p1.x, p1.y, selected);
        }
      }
    }
    if (d.tool === "fib" && d.points.length >= 2) {
      const hi = Math.max(d.points[0].price, d.points[1].price);
      const lo = Math.min(d.points[0].price, d.points[1].price);
      const x0 = ts.timeToCoordinate(d.points[0].time as UTCTimestamp);
      const x1 = ts.timeToCoordinate(d.points[1].time as UTCTimestamp);
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 1];
      for (const lv of levels) {
        const p = hi - (hi - lo) * lv;
        const y = candleSeries!.priceToCoordinate(p);
        if (y == null) continue;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        if (x0 != null && x1 != null) {
          ctx.moveTo(Math.min(x0, x1), y);
          ctx.lineTo(Math.max(x0, x1), y);
        } else {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = "10px JetBrains Mono, monospace";
        ctx.fillText(`${(lv * 100).toFixed(1)}%`, 6, y - 3);
      }
      if (selected || hovered) {
        const p0 = xyOf(d.points[0]);
        const p1 = xyOf(d.points[1]);
        if (p0) drawHandle(ctx, p0.x, p0.y, selected);
        if (p1) drawHandle(ctx, p1.x, p1.y, selected);
      }
    }
    if (d.tool === "text" && d.points[0] && d.text) {
      const pt = xyOf(d.points[0]);
      if (pt) {
        ctx.font = "11px IBM Plex Mono, monospace";
        ctx.fillText(d.text, pt.x + 4, pt.y - 4);
        if (selected || hovered) drawHandle(ctx, pt.x, pt.y, selected);
      }
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  for (const d of drawings) paint(d);

  if (ghostPreview) {
    const p0 = xyOf(ghostPreview.a);
    const p1 = xyOf(ghostPreview.b);
    if (p0 && p1) {
      ctx.strokeStyle = ghostPreview.tool === "fib" ? "#ab47bc" : "#00e5ff";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ghostPreview.tool === "rect") {
        ctx.strokeRect(
          Math.min(p0.x, p1.x),
          Math.min(p0.y, p1.y),
          Math.abs(p1.x - p0.x),
          Math.abs(p1.y - p0.y),
        );
      } else {
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  if (measurePreview) {
    const p0 = xyOf(measurePreview.a);
    const p1 = xyOf(measurePreview.b);
    if (p0 && p1) {
      const st = computeMeasureStats(measurePreview.a, measurePreview.b, tf);
      ctx.strokeStyle = st.up ? "#00c073" : "#db4455";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.setLineDash([]);
      measureHud(ctx, measurePreview.a, measurePreview.b, p0.x, p0.y, p1.x, p1.y, tf);
      drawHandle(ctx, p0.x, p0.y, false);
      drawHandle(ctx, p1.x, p1.y, false);
    }
  }
}

type HitKind = { id: string; mode: "move" | "p0" | "p1" };

function distToSegment(
  mx: number,
  my: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
): number {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((mx - p0.x) * dx + (my - p0.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(mx - (p0.x + t * dx), my - (p0.y + t * dy));
}

function hitTestDrawing(mx: number, my: number, drawings: Drawing[]): HitKind | null {
  const thresh = 8;
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.tool === "hline" && d.points[0]) {
      const y = candleSeries?.priceToCoordinate(d.points[0].price);
      if (y != null && Math.abs(my - y) <= thresh) return { id: d.id, mode: "move" };
    }
    if ((d.tool === "trend" || d.tool === "measure") && d.points.length >= 2) {
      const p0 = xyOf(d.points[0]);
      const p1 = xyOf(d.points[1]);
      if (p0 && Math.hypot(mx - p0.x, my - p0.y) <= thresh + 2) return { id: d.id, mode: "p0" };
      if (p1 && Math.hypot(mx - p1.x, my - p1.y) <= thresh + 2) return { id: d.id, mode: "p1" };
      if (p0 && p1 && distToSegment(mx, my, p0, p1) <= thresh) return { id: d.id, mode: "move" };
    }
    if (d.tool === "rect" && d.points.length >= 2) {
      const p0 = xyOf(d.points[0]);
      const p1 = xyOf(d.points[1]);
      if (p0 && Math.hypot(mx - p0.x, my - p0.y) <= thresh + 2) return { id: d.id, mode: "p0" };
      if (p1 && Math.hypot(mx - p1.x, my - p1.y) <= thresh + 2) return { id: d.id, mode: "p1" };
      if (p0 && p1) {
        const left = Math.min(p0.x, p1.x);
        const right = Math.max(p0.x, p1.x);
        const top = Math.min(p0.y, p1.y);
        const bot = Math.max(p0.y, p1.y);
        const nearEdge =
          (mx >= left - thresh && mx <= right + thresh && Math.abs(my - top) <= thresh) ||
          (mx >= left - thresh && mx <= right + thresh && Math.abs(my - bot) <= thresh) ||
          (my >= top - thresh && my <= bot + thresh && Math.abs(mx - left) <= thresh) ||
          (my >= top - thresh && my <= bot + thresh && Math.abs(mx - right) <= thresh);
        const inside = mx >= left && mx <= right && my >= top && my <= bot;
        if (nearEdge || inside) return { id: d.id, mode: "move" };
      }
    }
    if (d.tool === "fib" && d.points.length >= 2) {
      const p0 = xyOf(d.points[0]);
      const p1 = xyOf(d.points[1]);
      if (p0 && Math.hypot(mx - p0.x, my - p0.y) <= thresh + 2) return { id: d.id, mode: "p0" };
      if (p1 && Math.hypot(mx - p1.x, my - p1.y) <= thresh + 2) return { id: d.id, mode: "p1" };
      const hi = Math.max(d.points[0].price, d.points[1].price);
      const lo = Math.min(d.points[0].price, d.points[1].price);
      const x0 = chart?.timeScale().timeToCoordinate(d.points[0].time as UTCTimestamp);
      const x1 = chart?.timeScale().timeToCoordinate(d.points[1].time as UTCTimestamp);
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 1];
      for (const lv of levels) {
        const price = hi - (hi - lo) * lv;
        const y = candleSeries?.priceToCoordinate(price);
        if (y == null || Math.abs(my - y) > thresh) continue;
        if (x0 != null && x1 != null) {
          const left = Math.min(x0, x1) - thresh;
          const right = Math.max(x0, x1) + thresh;
          if (mx >= left && mx <= right) return { id: d.id, mode: "move" };
        } else {
          return { id: d.id, mode: "move" };
        }
      }
    }
    if (d.tool === "text" && d.points[0]) {
      const p = xyOf(d.points[0]);
      if (p && Math.hypot(mx - p.x, my - p.y) <= 14) return { id: d.id, mode: "move" };
    }
  }
  return null;
}

function ptFromEvent(e: MouseEvent | PointerEvent): { time: number; price: number } | null {
  if (!drawCanvas || !chart || !candleSeries || !hostEl) return null;
  const rect = drawCanvas.getBoundingClientRect();
  const scaleW = Math.max(48, chart.priceScale("right").width() || 56);
  // Keep interactions in the pane — not on the price axis strip.
  const maxX = Math.max(4, rect.width - scaleW - 2);
  const x = Math.min(Math.max(0, e.clientX - rect.left), maxX);
  const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height - 1);
  const time = chart.timeScale().coordinateToTime(x);
  const price = candleSeries.coordinateToPrice(y);
  if (time == null || price == null) return null;
  if (!Number.isFinite(price as number) || (price as number) <= 0) return null;
  return { time: time as number, price: price as number };
}

function clearDrawPointerListeners(): void {
  if (drawPointerMove) window.removeEventListener("pointermove", drawPointerMove);
  if (drawPointerUp) window.removeEventListener("pointerup", drawPointerUp);
  if (drawPointerUp) window.removeEventListener("pointercancel", drawPointerUp);
  drawPointerMove = null;
  drawPointerUp = null;
}

/** Zoom price scale under the mouse wheel (TradingView-like). Exported for tests. */
export function normalizeWheelDeltaY(e: Pick<WheelEvent, "deltaY" | "deltaMode">, pageHeight = 400): number {
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16; // lines → px
  else if (e.deltaMode === 2) dy *= pageHeight; // pages → px
  return dy;
}

/**
 * Map raw wheel pixels to a discrete zoom step in [-1, 1].
 * Mouse notches (~100–140px) → ±1; trackpad noise is accumulated by the caller.
 */
export function wheelZoomStep(deltaY: number, accumulated = 0): { step: number; residual: number } {
  const total = accumulated + deltaY;
  const notches = Math.trunc(total / PRICE_WHEEL_UNIT);
  // Drop unused notches from residual so a mega-delta cannot queue fly-aways.
  const residual = total - notches * PRICE_WHEEL_UNIT;
  if (notches === 0) return { step: 0, residual };
  const step = Math.max(-1, Math.min(1, notches));
  return { step, residual };
}

/**
 * Keep a visible price window sane relative to the live instrument price.
 * Prevents wheel / LWC drag from drifting into 1e-14 empty scales (or a
 * zero-width window where every axis label prints the same price).
 */
export function clampVisiblePriceRange(
  range: { from: number; to: number },
  refPrice: number,
): { from: number; to: number } {
  const ref = Number.isFinite(refPrice) && refPrice > 0 ? refPrice : 0;
  let from = range.from;
  let to = range.to;
  if (!(to > from) || !Number.isFinite(from) || !Number.isFinite(to)) {
    if (!(ref > 0)) return range;
    const pad = ref * 0.04;
    return { from: ref - pad, to: ref + pad };
  }

  if (!(ref > 0)) {
    // No reference — still reject absurd absolute windows.
    const mid = (from + to) / 2;
    const span = to - from;
    if (!(Math.abs(mid) > 1e-18) || span / Math.max(Math.abs(mid), 1e-18) > 1e6) {
      return range;
    }
    return { from, to };
  }

  let span = to - from;
  // Floor must stay above formatter precision so axis ticks stay distinct
  // (8dp around 1e-4 ⇒ ~1e-8; 0.2% of price is comfortably above that).
  const minSpan = Math.max(ref * 0.002, ref * 1e-5, 1e-12);
  const maxSpan = ref * 3; // ~±150% around mid at worst
  span = Math.min(Math.max(span, minSpan), maxSpan);

  let mid = (from + to) / 2;
  // If the window mid has flown away from the instrument, snap back.
  if (!Number.isFinite(mid) || mid <= 0 || mid < ref * 1e-3 || mid > ref * 1e3) {
    mid = ref;
  } else {
    // Soft pull: mid stays within ±100% of ref.
    mid = Math.min(ref * 2, Math.max(ref * 0.25, mid));
  }

  from = mid - span / 2;
  to = mid + span / 2;

  // Never let the floor collapse toward absolute zero while trading a real asset.
  const floor = ref * 1e-4;
  if (from < floor) {
    from = floor;
    to = from + span;
  }
  const ceil = ref * 1e4;
  if (to > ceil) {
    to = ceil;
    from = Math.max(floor, to - span);
  }

  // Keep the reference price on-screen.
  if (ref < from || ref > to) {
    from = ref - span / 2;
    to = ref + span / 2;
    if (from < floor) {
      from = floor;
      to = from + span;
    }
  }

  if (!(to > from) || to - from < minSpan * 0.999) {
    const pad = Math.max(minSpan, ref * 0.02) / 2;
    return { from: ref - pad, to: ref + pad };
  }
  return { from, to };
}

/** True when the visible window needs healing vs the live instrument. */
export function priceRangeNeedsHeal(
  range: { from: number; to: number } | null | undefined,
  refPrice: number,
): boolean {
  if (!(refPrice > 0) || !Number.isFinite(refPrice)) return false;
  if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || !(range.to > range.from)) {
    return true;
  }
  const healed = clampVisiblePriceRange(range, refPrice);
  const tol = Math.max(refPrice * 1e-9, 1e-18);
  return Math.abs(healed.from - range.from) > tol || Math.abs(healed.to - range.to) > tol;
}

/** Zoom price scale under the mouse wheel (TradingView-like). Exported for tests. */
export function zoomPriceRange(
  range: { from: number; to: number },
  deltaY: number,
  factorOrOpts:
    | number
    | { sensitivity?: number; maxStep?: number; anchor?: number; step?: number; refPrice?: number } = {},
): { from: number; to: number } {
  const opts =
    typeof factorOrOpts === "number"
      ? { step: deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0 }
      : factorOrOpts;

  let span = range.to - range.from;
  const mid = (range.from + range.to) / 2;
  const refHint =
    opts.refPrice != null && Number.isFinite(opts.refPrice) && opts.refPrice > 0
      ? opts.refPrice
      : Math.abs(mid) > 1e-18
        ? Math.abs(mid)
        : 0;
  if (!(span > 0) || !Number.isFinite(span)) {
    span = Math.max((refHint || Math.abs(mid) || 1e-8) * 0.05, 1e-12);
  }

  // Prefer discrete notch steps. Fallback: tiny proportional for legacy tests.
  let step = opts.step;
  if (step == null || !Number.isFinite(step)) {
    const sensitivity = opts.sensitivity ?? 0.00035;
    const maxStep = opts.maxStep ?? 0.04;
    const raw = deltaY * sensitivity;
    step = Math.sign(raw) * Math.min(Math.abs(raw), maxStep);
  } else {
    step = step * PRICE_WHEEL_SPAN_FACTOR;
  }

  const factor = Math.exp(step);
  let nextSpan = span * factor;
  const absMid = refHint || Math.abs(mid) || 1e-8;
  nextSpan = Math.min(Math.max(nextSpan, absMid * 0.002), absMid * 3);

  let anchor =
    opts.anchor != null && Number.isFinite(opts.anchor) ? opts.anchor : mid;
  // Reject anchors that are nowhere near the instrument (stops zoom-into-1e-14).
  if (refHint > 0 && (anchor <= 0 || anchor < refHint * 1e-3 || anchor > refHint * 1e3)) {
    anchor = mid;
  }
  anchor = Math.min(range.to, Math.max(range.from, anchor));
  const ratio = Math.min(1, Math.max(0, (anchor - range.from) / span));
  const next = { from: anchor - nextSpan * ratio, to: anchor + nextSpan * (1 - ratio) };
  return clampVisiblePriceRange(next, refHint || mid);
}

/** Hit-test the LWC right price-scale column (stable across layouts / DPR). */
export function isOverPriceScaleEl(clientX: number, clientY: number, shell: HTMLElement | null): boolean {
  if (!shell) return false;
  const cell =
    shell.querySelector<HTMLElement>(".tv-lightweight-charts table tr td:last-child") ??
    shell.querySelector<HTMLElement>("table tr td:last-child");
  if (cell) {
    const r = cell.getBoundingClientRect();
    if (r.width >= 8 && r.height >= 8) {
      return clientX >= r.left - 1 && clientX <= r.right + 1 && clientY >= r.top && clientY <= r.bottom;
    }
  }
  const rect = shell.getBoundingClientRect();
  return isOverPriceScale(clientX, rect, 56);
}

export function isOverPriceScale(clientX: number, hostRect: DOMRect, scaleWidth: number): boolean {
  const w = Math.max(40, scaleWidth);
  return clientX >= hostRect.right - w - 4;
}

/** How many bars fit in the pane (Binance/TV-like default window). */
export function visibleBarBudget(hostWidth: number, barSpacing: number): number {
  const usable = Math.max(160, hostWidth - 80);
  const spacing = Math.max(3, barSpacing || 8);
  // ~40–120 candles — exchange desks never open zoomed into 3–5 mega-bars.
  return Math.max(40, Math.min(120, Math.floor(usable / spacing)));
}

export function barSpacingForWidth(hostWidth: number, tf: Timeframe): number {
  const base = tf === "30s" || tf === "1m" ? 6 : tf === "1D" || tf === "1W" ? 10 : 8;
  if (hostWidth < 480) return Math.max(4, base - 2);
  if (hostWidth < 720) return Math.max(5, base - 1);
  if (hostWidth > 1600) return base + 1;
  return base;
}

function setupDrawInteraction(
  drawings: Drawing[],
  pairId: string,
  onAdd: (d: Drawing) => void,
): void {
  if (!drawCanvas || !chart || !candleSeries || !hostEl) return;
  syncDrawingsStore(drawings);
  onAddDrawingCb = onAdd;

  const locked = () => !!lastOpts?.drawingsLocked;

  const syncPointer = (mx: number, my: number) => {
    if (!drawCanvas) return;
    if (activeTool !== "cursor") {
      drawCanvas.classList.add("active");
      drawCanvas.style.cursor = "crosshair";
      hoveredDrawingId = null;
      return;
    }
    const hit = hitTestDrawing(mx, my, liveDrawings);
    const nextHover = hit?.id ?? null;
    if (nextHover !== hoveredDrawingId) {
      hoveredDrawingId = nextHover;
      redrawDrawings(liveDrawings);
    }
    const want = !!(hit || selectedDrawingId || dragDraw);
    drawCanvas.classList.toggle("active", want);
    if (dragDraw) drawCanvas.style.cursor = "grabbing";
    else if (hit) drawCanvas.style.cursor = hit.mode === "move" ? "grab" : "nwse-resize";
    else drawCanvas.style.cursor = "default";
  };

  hostEl.onmousemove = (e) => {
    if (!hostEl) return;
    const rect = hostEl.getBoundingClientRect();
    syncPointer(e.clientX - rect.left, e.clientY - rect.top);
  };

  drawCanvas.onmousedown = (e) => {
    if (e.button !== 0) return;
    const rect = drawCanvas!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pt = ptFromEvent(e);
    if (!pt) return;

    if (activeTool === "cursor") {
      if (locked()) {
        // Still allow selection highlight when locked, but no drag
        const hit = hitTestDrawing(mx, my, liveDrawings);
        selectedDrawingId = hit?.id ?? null;
        redrawDrawings(liveDrawings);
        return;
      }
      const hit = hitTestDrawing(mx, my, liveDrawings);
      if (!hit) {
        selectedDrawingId = null;
        redrawDrawings(liveDrawings);
        drawCanvas!.classList.remove("active");
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      selectedDrawingId = hit.id;
      const d = liveDrawings.find((x) => x.id === hit.id);
      if (!d) return;
      dragDraw = {
        id: d.id,
        mode: hit.mode,
        startMouse: { x: mx, y: my },
        startPoints: d.points.map((p) => ({ ...p })),
      };
      drawCanvas!.style.cursor = "grabbing";
      redrawDrawings(liveDrawings);
      clearDrawPointerListeners();
      drawPointerMove = (ev: PointerEvent) => {
        if (!dragDraw || !candleSeries || !chart || !drawCanvas) return;
        const target = liveDrawings.find((x) => x.id === dragDraw!.id);
        if (!target || locked()) return;
        const r = drawCanvas.getBoundingClientRect();
        const cmx = ev.clientX - r.left;
        const cmy = ev.clientY - r.top;
        const npt = ptFromEvent(ev);
        if (dragDraw.mode === "p0") {
          if (npt) target.points[0] = npt;
        } else if (dragDraw.mode === "p1" && target.points[1]) {
          if (npt) target.points[1] = npt;
        } else if (target.tool === "hline" && target.points[0]) {
          if (npt) target.points[0] = { ...target.points[0], price: npt.price };
        } else {
          const dx = cmx - dragDraw.startMouse.x;
          const dy = cmy - dragDraw.startMouse.y;
          const nextPts = dragDraw.startPoints.map((sp) => {
            const xy = xyOf(sp);
            if (!xy) return sp;
            const nx = xy.x + dx;
            const ny = xy.y + dy;
            const time = chart!.timeScale().coordinateToTime(nx);
            const price = candleSeries!.coordinateToPrice(ny);
            // Keep previous vertex if coordinate maps off-pane (prevents "broken" tools).
            if (time == null || price == null || !Number.isFinite(price as number)) return sp;
            return { time: time as number, price: price as number };
          });
          if (nextPts.every((p, i) => p.time === target.points[i]?.time && p.price === target.points[i]?.price)) {
            return;
          }
          target.points = nextPts;
        }
        redrawDrawings(liveDrawings);
      };
      drawPointerUp = () => {
        if (dragDraw) {
          const done = liveDrawings.find((x) => x.id === dragDraw!.id);
          if (done && lastOpts?.onUpdateDrawing) {
            lastOpts.onUpdateDrawing({ ...done, points: done.points.map((p) => ({ ...p })) });
          }
          dragDraw = null;
        }
        clearDrawPointerListeners();
        if (drawCanvas) drawCanvas.style.cursor = "grab";
      };
      window.addEventListener("pointermove", drawPointerMove);
      window.addEventListener("pointerup", drawPointerUp);
      window.addEventListener("pointercancel", drawPointerUp);
      return;
    }

    if (locked()) return;
    e.preventDefault();
    e.stopPropagation();

    if (activeTool === "hline") {
      const id = `d-${Date.now()}`;
      onAdd({ id, pairId: pairId as Drawing["pairId"], tool: "hline", points: [pt], color: "#00e5ff" });
      selectedDrawingId = id;
      return;
    }
    if (activeTool === "text") {
      const raw = prompt("Label", "Note") ?? "Note";
      const text =
        raw
          .slice(0, 120)
          .replace(/[\u0000-\u001f]/g, "")
          .replace(/<[^>]*>/g, "")
          .replace(/[<>]/g, "") || "Note";
      const id = `d-${Date.now()}`;
      onAdd({ id, pairId: pairId as Drawing["pairId"], tool: "text", points: [pt], text, color: "#ffd54f" });
      selectedDrawingId = id;
      return;
    }

    if (activeTool === "measure" || activeTool === "trend" || activeTool === "fib" || activeTool === "rect") {
      drawPoints = [pt];
      measurePreview = activeTool === "measure" ? { a: pt, b: pt } : null;
      ghostPreview = activeTool !== "measure" ? { tool: activeTool, a: pt, b: pt } : null;
      clearDrawPointerListeners();
      drawPointerMove = (ev: PointerEvent) => {
        const p = ptFromEvent(ev);
        if (!p || !drawPoints[0]) return;
        if (activeTool === "measure") {
          measurePreview = { a: drawPoints[0], b: p };
        } else {
          ghostPreview = { tool: activeTool, a: drawPoints[0], b: p };
        }
        redrawDrawings(liveDrawings);
      };
      drawPointerUp = (ev: PointerEvent) => {
        clearDrawPointerListeners();
        const p = ptFromEvent(ev) ?? drawPoints[0];
        ghostPreview = null;
        if (!drawPoints[0] || !p) {
          drawPoints = [];
          measurePreview = null;
          redrawDrawings(liveDrawings);
          return;
        }
        const points = [drawPoints[0], p];
        const id = `d-${Date.now()}`;
        if (activeTool === "measure") {
          if (!isMeaningfulMeasure(points[0], points[1])) {
            measurePreview = null;
            drawPoints = [];
            redrawDrawings(liveDrawings);
            return;
          }
          onAdd({
            id,
            pairId: pairId as Drawing["pairId"],
            tool: "measure",
            points,
            color: "#ffb347",
          });
          selectedDrawingId = id;
        } else if (activeTool === "trend") {
          onAdd({ id, pairId: pairId as Drawing["pairId"], tool: "trend", points, color: "#00e5ff" });
          selectedDrawingId = id;
        } else if (activeTool === "fib") {
          onAdd({ id, pairId: pairId as Drawing["pairId"], tool: "fib", points, color: "#ab47bc" });
          selectedDrawingId = id;
        } else if (activeTool === "rect") {
          onAdd({ id, pairId: pairId as Drawing["pairId"], tool: "rect", points, color: "#4de4ff" });
          selectedDrawingId = id;
        }
        drawPoints = [];
        measurePreview = null;
        redrawDrawings(liveDrawings);
      };
      window.addEventListener("pointermove", drawPointerMove);
      window.addEventListener("pointerup", drawPointerUp);
      window.addEventListener("pointercancel", drawPointerUp);
    }
  };

  // Legacy window.onmousemove/up removed — pointer listeners above handle drag/draw.
  window.onmousemove = null;
  window.onmouseup = null;
}

export function mountChart(el: HTMLElement, candles: Candle[], opts: ChartMountOpts, onAddDrawing?: (d: Drawing) => void): void {
  destroyChart();
  hostEl = el;
  el.innerHTML = "";
  el.classList.add("chart-shell");
  const shell = document.createElement("div");
  shell.className = "chart-inner";
  el.appendChild(shell);
  drawCanvas = document.createElement("canvas");
  drawCanvas.className = "draw-layer";
  el.appendChild(drawCanvas);

  currentMode = opts.mode;
  currentSettings = opts.settings;
  onOrderDrag = opts.onOrderPriceDrag;
  activeTool = "cursor";

  const colors = schemeColors(opts.settings);
  const wicks = wickColors(opts.settings);
  const hostW = Math.max(320, shell.clientWidth || el.clientWidth || 800);
  const spacing = barSpacingForWidth(hostW, opts.tf);
  chart = createChart(shell, {
    autoSize: true,
    layout: {
      background: { color: opts.settings.bgGradient ? "transparent" : "#05070d" },
      textColor: "#9bb0cc",
      fontFamily: "JetBrains Mono, monospace",
      fontSize: hostW < 640 ? 11 : 12,
      attributionLogo: false,
    },
    grid: {
      vertLines: { visible: opts.settings.gridVisible, color: `rgba(255,255,255,${opts.settings.gridOpacity})` },
      horzLines: { visible: opts.settings.gridVisible, color: `rgba(255,255,255,${opts.settings.gridOpacity})` },
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,0.08)",
      scaleMargins: { top: 0.06, bottom: 0.18 },
      mode: opts.settings.logScale ? 1 : 0,
      entireTextOnly: true,
      autoScale: true,
    },
    handleScale: {
      axisPressedMouseMove: { time: true, price: true },
      // Keep time-scale wheel zoom; price-axis wheel is owned by setupPriceScaleWheel
      // (capture + stopImmediate) so LWC cannot double-apply / fly away.
      mouseWheel: true,
      pinch: true,
      axisDoubleClickReset: { time: true, price: true },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    timeScale: {
      borderColor: "rgba(255,255,255,0.08)",
      timeVisible: true,
      secondsVisible: opts.tf === "30s" || opts.tf === "1m",
      rightOffset: hostW < 640 ? 4 : 8,
      barSpacing: spacing,
    },
    crosshair: { mode: 0 },
    localization: { priceFormatter: chartPriceFormatter },
  });

  candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: colors.up,
    downColor: colors.down,
    borderUpColor: colors.up,
    borderDownColor: colors.down,
    wickUpColor: wicks.up,
    wickDownColor: wicks.down,
    priceFormat: priceFormatOptions(),
    lastValueVisible: false,
    priceLineVisible: false,
    visible: opts.mode === "candles" || opts.mode === "heikin",
    autoscaleInfoProvider: makeRobustAutoscaleProvider(),
  });

  barSeries = chart.addSeries(BarSeries, {
    upColor: colors.up,
    downColor: colors.down,
    priceFormat: priceFormatOptions(),
    lastValueVisible: false,
    priceLineVisible: false,
    visible: opts.mode === "bars",
    autoscaleInfoProvider: makeRobustAutoscaleProvider(),
  });

  lineSeries = chart.addSeries(LineSeries, {
    color: "#00e5ff",
    lineWidth: 2,
    priceFormat: priceFormatOptions(),
    lastValueVisible: false,
    priceLineVisible: false,
    visible: opts.mode === "line",
    autoscaleInfoProvider: makeRobustAutoscaleProvider(),
  });

  areaSeries = chart.addSeries(AreaSeries, {
    lineColor: "#00e5ff",
    topColor: "rgba(0,229,255,0.28)",
    bottomColor: "rgba(0,229,255,0.02)",
    lineWidth: 2,
    priceFormat: priceFormatOptions(),
    lastValueVisible: false,
    priceLineVisible: false,
    visible: opts.mode === "area",
    autoscaleInfoProvider: makeRobustAutoscaleProvider(),
  });

  volumeSeries = chart.addSeries(HistogramSeries, {
    priceFormat: { type: "volume" },
    priceScaleId: "vol",
    lastValueVisible: false,
    priceLineVisible: false,
  });
  chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

  // Always re-anchor to the live candle after remount (TF/pair/mode).
  // Never restore a previous TF's logical indices — that jumps into mid-history.
  savedLogicalRange = null;
  setCandleData(candles, opts, { scrollToLive: false });
  firstDataApplied = true;
  lastOpts = opts;
  syncDrawingsStore(opts.drawings);
  tradeMarks = opts.trades ?? [];
  renderOrderLines(
    opts.orders,
    opts.overlays,
    opts.lastPrice,
    opts.lastPriceUp ?? true,
    opts.yesterdayClose,
    opts.alerts,
  );
  ensureWatermark(opts.watermark ?? "");
  ensureHud();
  ensureTradeTip();
  updateHud(opts.lastPrice ?? 0, opts.lastPriceUp ?? true, null);
  if (onAddDrawing) setupDrawInteraction(opts.drawings, opts.pairId, onAddDrawing);
  redrawDrawings(opts.drawings);
  setupPriceScaleWheel(shell);
  bindChartDebugProbe();
  anchorToLatestCandle(visibleBarBudget(hostW, spacing));

  if (opts.onCrosshair) {
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        opts.onCrosshair?.(null);
        return;
      }
      const t = param.time as number;
      // Prefer raw (pre-HA) bar by time — works for candles/bars/line/area/heikin.
      const fromRaw = rawCandlesCache.find((c) => c.time === t);
      const fromSeries = currentCandles.find((c) => c.time === t);
      const hit =
        param.seriesData.get(candleSeries!) ??
        (barSeries ? param.seriesData.get(barSeries) : undefined) ??
        (lineSeries ? param.seriesData.get(lineSeries) : undefined) ??
        (areaSeries ? param.seriesData.get(areaSeries) : undefined);
      const seriesHit = hit as { open?: number; high?: number; low?: number; close?: number; value?: number } | undefined;
      const bar = fromRaw ?? fromSeries;
      if (bar) {
        opts.onCrosshair?.({
          time: t,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume ?? 0,
        });
        return;
      }
      const close = seriesHit?.close ?? seriesHit?.value;
      if (close == null || !Number.isFinite(close)) {
        opts.onCrosshair?.(null);
        return;
      }
      opts.onCrosshair?.({
        time: t,
        open: seriesHit?.open ?? close,
        high: seriesHit?.high ?? close,
        low: seriesHit?.low ?? close,
        close,
        volume: 0,
      });
    });
  }

  chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    // Always paint from liveDrawings — never rehydrate from a stale lastOpts snapshot.
    redrawDrawings(resolvePaintDrawings(liveDrawings, lastOpts?.drawings));
    if (!range) return;
    maybeLoadHistory(range);
  });

  if (opts.onContextMenu) {
    const ctxHandler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!candleSeries || !hostEl) return;
      const rect = hostEl.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = candleSeries.coordinateToPrice(y);
      if (price == null || !Number.isFinite(price) || price <= 0) return;
      opts.onContextMenu?.(price, e.clientX, e.clientY);
    };
    el.addEventListener("contextmenu", ctxHandler);
    if (drawCanvas) drawCanvas.addEventListener("contextmenu", ctxHandler);
  }

  mounted = true;
  if (typeof ResizeObserver !== "undefined") {
    hostResizeObs?.disconnect();
    hostResizeObs = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        resizeChart();
      });
    });
    hostResizeObs.observe(el);
    // Layout may settle after paint (flex / iframe / panel drag).
    requestAnimationFrame(() => {
      resizeChart();
      requestAnimationFrame(() => resizeChart());
    });
  }
}

export function setChartMode(mode: ChartMode): void {
  if (!mounted || mode === currentMode || !lastOpts || !chart) return;
  currentMode = mode;
  showMode(mode);
  priceScaleManual = false;
  try {
    chart.priceScale("right").setAutoScale(true);
  } catch {
    /* ignore */
  }
  setCandleData(rawCandlesCache, { ...lastOpts, mode }, { preserveLogicalRange: true });
}

export function setActiveDrawTool(tool: Drawing["tool"]): void {
  activeTool = tool;
  drawPoints = [];
  measurePreview = null;
  ghostPreview = null;
  if (tool !== "cursor") {
    selectedDrawingId = null;
    hoveredDrawingId = null;
  }
  if (drawCanvas) {
    drawCanvas.classList.toggle("active", tool !== "cursor");
    drawCanvas.style.cursor = tool === "cursor" ? "default" : "crosshair";
  }
  redrawDrawings(liveDrawings);
}

export function getSelectedDrawingId(): string | null {
  return selectedDrawingId;
}

export function clearDrawingSelection(): void {
  selectedDrawingId = null;
  hoveredDrawingId = null;
  redrawDrawings(liveDrawings);
}

/** Remove selected drawing from live layer; caller must also update state. */
export function deleteSelectedDrawing(): string | null {
  const id = selectedDrawingId;
  if (!id) return null;
  const next = liveDrawings.filter((d) => d.id !== id);
  selectedDrawingId = null;
  hoveredDrawingId = null;
  redrawDrawings(next);
  return id;
}

/** Replace the live drawing set permanently (delete / clear / import). */
export function replaceLiveDrawings(drawings: Drawing[]): void {
  selectedDrawingId = selectedDrawingId && drawings.some((d) => d.id === selectedDrawingId) ? selectedDrawingId : null;
  if (hoveredDrawingId && !drawings.some((d) => d.id === hoveredDrawingId)) hoveredDrawingId = null;
  redrawDrawings(drawings);
}

/** Exposed for tests: drawings used on next scroll/zoom redraw. */
export function getLiveDrawings(): Drawing[] {
  return liveDrawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) }));
}

export function applyChartSettings(settings: ChartSettings, candles: Candle[], opts: ChartMountOpts): void {
  if (!chart || !candleSeries) return;
  currentSettings = settings;
  const colors = schemeColors(settings);
  candleSeries.applyOptions({
    upColor: colors.up,
    downColor: colors.down,
    borderUpColor: colors.up,
    borderDownColor: colors.down,
    wickUpColor: colors.up,
    wickDownColor: colors.down,
  });
  barSeries?.applyOptions({ upColor: colors.up, downColor: colors.down });
  chart.applyOptions({
    grid: {
      vertLines: { visible: settings.gridVisible, color: `rgba(255,255,255,${settings.gridOpacity})` },
      horzLines: { visible: settings.gridVisible, color: `rgba(255,255,255,${settings.gridOpacity})` },
    },
    rightPriceScale: { mode: settings.logScale ? 1 : 0 },
  });
  setCandleData(candles, { ...opts, settings }, { preserveLogicalRange: true });
}

export function toggleIndicator(id: IndicatorId, on: boolean, settings: ChartSettings): ChartSettings {
  settings.indicators[id] = on;
  return settings;
}

export function setCandleData(
  candles: Candle[],
  opts: ChartMountOpts,
  flags?: { scrollToLive?: boolean; preserveLogicalRange?: boolean; prepended?: number },
): void {
  if (!candleSeries || !barSeries || !lineSeries || !areaSeries || !volumeSeries || !chart) return;
  lastOpts = mergeMountOpts(lastOpts, opts);
  syncDrawingsStore(lastOpts.drawings);
  const prevRange = flags?.preserveLogicalRange ? chart.timeScale().getVisibleLogicalRange() : null;
  const prevN = currentCandles.length;
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  rawCandlesCache = [];
  for (const c of sorted) {
    const last = rawCandlesCache[rawCandlesCache.length - 1];
    if (last && last.time === c.time) rawCandlesCache[rawCandlesCache.length - 1] = c;
    else rawCandlesCache.push(c);
  }
  if (rawCandlesCache.length > MAX_CANDLES) rawCandlesCache = rawCandlesCache.slice(-MAX_CANDLES);
  currentCandles = prepCandles(rawCandlesCache, opts.mode, opts.tf);
  if (currentCandles.length < 2) {
    candleSeries.setData([]);
    barSeries.setData([]);
    lineSeries.setData([]);
    areaSeries.setData([]);
    volumeSeries.setData([]);
    clearOverlays();
    renderOrderLines(opts.orders, opts.overlays, opts.lastPrice, opts.lastPriceUp ?? true, opts.yesterdayClose, opts.alerts);
    return;
  }

  const candleData = currentCandles.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const barData = currentCandles.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const lineData = currentCandles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }));
  const volData = currentCandles.map((c) => ({
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? "rgba(0,230,118,0.35)" : "rgba(255,82,82,0.35)",
  }));

  candleSeries.setData(candleData);
  barSeries.setData(barData);
  lineSeries.setData(lineData);
  areaSeries.setData(lineData);
  volumeSeries.setData(opts.overlays.showVolume ? volData : []);
  applyIndicators(currentCandles, opts.settings, opts.indicatorConfig);
  tradeMarks = opts.trades ?? [];
  renderOrderLines(
    opts.orders,
    opts.overlays,
    opts.lastPrice,
    opts.lastPriceUp ?? true,
    opts.yesterdayClose,
    opts.alerts,
  );
  ensureWatermark(opts.watermark ?? "");
  redrawDrawings(opts.drawings);

  if (flags?.preserveLogicalRange && prevRange) {
    const shift = flags.prepended ?? 0;
    const n = currentCandles.length;
    let from = prevRange.from + shift;
    let to = prevRange.to + shift;
    const span = Math.max(1, prevRange.to - prevRange.from);
    const wasLive = prevN > 0 && prevRange.to >= prevN - 1 - 1.5;
    const rightGrowth = n > prevN && shift === 0;
    if (rightGrowth && wasLive) {
      anchorToLatestCandle();
    } else {
      const maxTo = n - 1 + 3;
      if (to > maxTo || from > n - 1) {
        to = Math.min(to, maxTo);
        from = to - span;
      }
      if (from < -1) {
        to += -1 - from;
        from = -1;
      }
      try {
        chart.timeScale().setVisibleLogicalRange({ from, to });
      } catch {
        anchorToLatestCandle();
      }
    }
  } else if (flags?.scrollToLive) {
    anchorToLatestCandle();
  }
}

export function updateLastCandle(c: Candle, opts: ChartMountOpts): boolean {
  if (!candleSeries || !lineSeries || !areaSeries || !volumeSeries) return false;
  const lastRaw = rawCandlesCache[rawCandlesCache.length - 1];
  const tf = (opts.tf ?? lastOpts?.tf ?? "15m") as Timeframe;
  const tfSec = TF_SEC[tf] ?? 900;
  // Gap / multi-bar advance — caller must full-replace series (bridge bars would be dropped).
  if (lastRaw && c.time > lastRaw.time + tfSec) return false;

  if (lastRaw && lastRaw.time === c.time) rawCandlesCache[rawCandlesCache.length - 1] = c;
  else if (!lastRaw || c.time > lastRaw.time) {
    rawCandlesCache.push(c);
    if (rawCandlesCache.length > MAX_CANDLES) {
      // Trimmed left bar — series.update cannot drop it; force full setData.
      rawCandlesCache = rawCandlesCache.slice(-MAX_CANDLES);
      return false;
    }
  } else return false;

  const mode = opts.mode ?? lastOpts?.mode ?? "candles";
  currentCandles = prepCandles(rawCandlesCache, mode, tf);
  const d = currentCandles[currentCandles.length - 1];
  if (!d) return false;
  const t = d.time as UTCTimestamp;
  candleSeries.update({ time: t, open: d.open, high: d.high, low: d.low, close: d.close });
  barSeries?.update({ time: t, open: d.open, high: d.high, low: d.low, close: d.close });
  lineSeries.update({ time: t, value: d.close });
  areaSeries.update({ time: t, value: d.close });
  volumeSeries.update({
    time: t,
    value: lastOpts?.overlays.showVolume === false ? 0 : d.volume,
    color: d.close >= d.open ? "rgba(0,230,118,0.35)" : "rgba(255,82,82,0.35)",
  });
  return true;
}

export function refreshDrawings(drawings: Drawing[]): void {
  replaceLiveDrawings(drawings);
}

export function refreshOrderLines(
  orders: Order[],
  alerts?: ChartMountOpts["alerts"],
): void {
  if (!lastOpts) return;
  if (alerts) lastOpts = { ...lastOpts, alerts };
  lastOpts = { ...lastOpts, orders };
  renderOrderLines(
    orders,
    lastOpts.overlays,
    lastOpts.lastPrice,
    lastOpts.lastPriceUp ?? true,
    lastOpts.yesterdayClose,
    lastOpts.alerts,
  );
}

let lastHudUp: boolean | null = null;

export function updateLivePriceHud(price: number, up: boolean, countdown: string | null): void {
  if (lastOpts) lastOpts = { ...lastOpts, lastPrice: price, lastPriceUp: up };
  const series = primarySeries();
  if (series && lastOpts?.overlays.showLastPrice !== false && price > 0) {
    if (lastPriceLine && lastHudUp === up) {
      try {
        lastPriceLine.applyOptions({ price });
      } catch {
        lastPriceLine = null;
      }
    } else if (lastPriceLine && lastHudUp !== up) {
      try {
        series.removePriceLine(lastPriceLine);
      } catch {
        /* already detached */
      }
      priceLines = priceLines.filter((pl) => pl !== lastPriceLine);
      lastPriceLine = null;
    }
    if (!lastPriceLine) {
      priceLineOwner = series;
      lastPriceLine = series.createPriceLine({
        price,
        color: up ? "#00e676" : "#ff5252",
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "",
      });
      priceLines.push(lastPriceLine);
      lastHudUp = up;
    }
  }
  updateHud(price, up, countdown);
}

function ensureWatermark(text: string): void {
  if (!hostEl) return;
  if (!watermarkEl) {
    watermarkEl = document.createElement("div");
    watermarkEl.className = "chart-watermark";
    hostEl.appendChild(watermarkEl);
  }
  watermarkEl.textContent = text;
}

function ensureHud(): void {
  if (!hostEl) return;
  if (!hudEl) {
    hudEl = document.createElement("div");
    hudEl.className = "chart-price-hud";
    // Countdown only — last price lives on the axis label (no overlap stack).
    hudEl.innerHTML = `<div class="candle-cd" id="hud-cd" title="Time to next candle">—</div>`;
    hostEl.appendChild(hudEl);
  }
}

function updateHud(price: number, up: boolean, countdown: string | null): void {
  ensureHud();
  void price;
  void up;
  const cd = document.getElementById("hud-cd");
  if (cd) cd.textContent = countdown ?? "";
}

function refClosePrice(): number {
  const last = currentCandles[currentCandles.length - 1]?.close;
  return last && Number.isFinite(last) && last > 0 ? last : 0;
}

/**
 * Re-clamp the right price scale to the live instrument.
 * Needed after LWC native axis drag (axisPressedMouseMove) which bypasses
 * our wheel handler and can collapse every tick label to the same print.
 */
export function healVisiblePriceScale(): boolean {
  if (!chart) return false;
  const refPrice = refClosePrice();
  if (!(refPrice > 0)) return false;
  const ps = chart.priceScale("right");
  let range = ps.getVisibleRange();
  if (!range || !(range.to > range.from)) {
    const lr = chart.timeScale().getVisibleLogicalRange();
    const { fromIdx, toIdx } = logicalRangeToIndices(
      lr?.from ?? 0,
      lr?.to ?? currentCandles.length - 1,
      currentCandles.length,
    );
    const robust = robustPriceRange(currentCandles, fromIdx, toIdx);
    if (!robust) return false;
    range = { from: robust.minValue, to: robust.maxValue };
  }
  if (!priceRangeNeedsHeal(range, refPrice)) return false;
  const next = clampVisiblePriceRange(range, refPrice);
  if (!(next.to > next.from) || !Number.isFinite(next.from) || !Number.isFinite(next.to)) return false;
  priceScaleManual = true;
  try {
    ps.setAutoScale(false);
    ps.setVisibleRange(next);
    return true;
  } catch {
    return false;
  }
}

/** Playwright / QA probe — live price-scale window vs instrument. */
export function getPriceScaleDebug(): {
  range: { from: number; to: number } | null;
  ref: number;
  manual: boolean;
  needsHeal: boolean;
  span: number | null;
} | null {
  if (!chart) return null;
  const ref = refClosePrice();
  let range: { from: number; to: number } | null = null;
  try {
    range = chart.priceScale("right").getVisibleRange();
  } catch {
    range = null;
  }
  const span = range && range.to > range.from ? range.to - range.from : null;
  return {
    range,
    ref,
    manual: priceScaleManual,
    needsHeal: priceRangeNeedsHeal(range, ref),
    span,
  };
}

function bindChartDebugProbe(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __hackmeChart?: Record<string, unknown> };
  w.__hackmeChart = {
    getPriceScaleDebug,
    healVisiblePriceScale,
    clampVisiblePriceRange,
    zoomPriceRange,
    wheelZoomStep,
  };
}

function setupPriceScaleWheel(shell: HTMLElement): void {
  priceWheelCleanup?.();
  priceWheelResidual = 0;
  priceWheelLastApplyMs = 0;
  let axisPointerDown = false;

  const onWheel = (e: WheelEvent) => {
    if (!chart || !candleSeries || !hostEl) return;
    if (!isOverPriceScaleEl(e.clientX, e.clientY, shell)) return;
    // Capture + stopImmediate: LWC also zooms the price axis on wheel —
    // without this both fire and one notch "flies away".
    e.preventDefault();
    e.stopImmediatePropagation();

    const dy = normalizeWheelDeltaY(e, hostEl.clientHeight || 400);
    const { step, residual } = wheelZoomStep(dy, priceWheelResidual);
    priceWheelResidual = residual;
    if (step === 0) return;

    const now = performance.now();
    if (now - priceWheelLastApplyMs < PRICE_WHEEL_MIN_INTERVAL_MS) {
      // Eat the notch but don't apply — high-Hz mice otherwise stack 20×/s.
      return;
    }
    priceWheelLastApplyMs = now;

    const refPrice = refClosePrice();

    const ps = chart.priceScale("right");
    let range = ps.getVisibleRange();
    // Seed from robust visible candles — never full-series min/max (outliers → fling).
    if (!range || !(range.to > range.from)) {
      const lr = chart.timeScale().getVisibleLogicalRange();
      const { fromIdx, toIdx } = logicalRangeToIndices(
        lr?.from ?? 0,
        lr?.to ?? currentCandles.length - 1,
        currentCandles.length,
      );
      const robust = robustPriceRange(currentCandles, fromIdx, toIdx);
      if (!robust) return;
      range = { from: robust.minValue, to: robust.maxValue };
    }
    // Heal an already-corrupted scale (e.g. leftover 1e-14 window) before zooming.
    if (refPrice > 0) {
      range = clampVisiblePriceRange(range, refPrice);
    }

    const rect = hostEl.getBoundingClientRect();
    let anchor: number | undefined;
    try {
      const y = e.clientY - rect.top;
      const p = candleSeries.coordinateToPrice(y);
      if (p != null && Number.isFinite(p as number)) anchor = p as number;
    } catch {
      /* mid */
    }

    const next = zoomPriceRange(range, step, { step, anchor, refPrice });
    if (!(next.to > next.from) || !Number.isFinite(next.from) || !Number.isFinite(next.to)) return;

    priceScaleManual = true;
    ps.setAutoScale(false);
    try {
      ps.setVisibleRange(next);
    } catch {
      /* ignore invalid range */
    }
  };
  const onDblClick = (e: MouseEvent) => {
    if (!chart || !hostEl) return;
    if (!isOverPriceScaleEl(e.clientX, e.clientY, shell)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    priceScaleManual = false;
    priceWheelResidual = 0;
    priceWheelLastApplyMs = 0;
    chart.priceScale("right").setAutoScale(true);
  };
  // LWC axisPressedMouseMove.price can collapse the window without our wheel
  // path — heal only after drag ends so pan/zoom is not fighting the user mid-gesture.
  const onPointerDown = (e: PointerEvent) => {
    if (!isOverPriceScaleEl(e.clientX, e.clientY, shell)) return;
    axisPointerDown = true;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!axisPointerDown) return;
    if ((e.buttons & 1) === 0) {
      axisPointerDown = false;
      healVisiblePriceScale();
    }
    // Intentionally no heal-while-dragging — that made vertical scale feel sticky/broken.
  };
  const onPointerUp = () => {
    if (!axisPointerDown) return;
    axisPointerDown = false;
    healVisiblePriceScale();
  };
  shell.addEventListener("wheel", onWheel, { passive: false, capture: true });
  shell.addEventListener("dblclick", onDblClick, { capture: true });
  shell.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true });
  window.addEventListener("pointercancel", onPointerUp, { capture: true });
  priceWheelCleanup = () => {
    shell.removeEventListener("wheel", onWheel, true);
    shell.removeEventListener("dblclick", onDblClick, true);
    shell.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    axisPointerDown = false;
    priceWheelCleanup = null;
    priceWheelResidual = 0;
    priceWheelLastApplyMs = 0;
  };
}

/** Pin the time scale so the latest candle sits at the right (TF/pair remount).
 * CEX-like: keep fixed barSpacing — never stretch 2–4 bars across the whole pane.
 */
export function anchorToLatestCandle(barCount?: number): void {
  if (!chart || currentCandles.length < 2) return;
  const n = currentCandles.length;
  const hostW = hostEl?.clientWidth || 800;
  const tf = (lastOpts?.tf ?? "15m") as Timeframe;
  const spacing = barSpacingForWidth(hostW, tf);
  const rightPad = hostW < 640 ? 4 : 8;
  try {
    chart.timeScale().applyOptions({
      barSpacing: spacing,
      rightOffset: rightPad,
      minBarSpacing: 2,
    });
  } catch {
    /* ignore */
  }
  const budget = barCount ?? visibleBarBudget(hostW, spacing);
  // Logical window is always ~budget bars wide. When history is short, `from`
  // goes negative → empty left space (Binance/TV), not inflated candle bodies.
  // rightOffset already reserved whitespace — do not also push `to` far past tip.
  const to = n - 1 + 2;
  const from = to - budget;
  try {
    chart.timeScale().setVisibleLogicalRange({ from, to });
  } catch {
    try {
      chart.timeScale().scrollToRealTime();
    } catch {
      /* ignore */
    }
  }
}

export function scrollToTimestamp(ts: number): void {
  if (!chart) return;
  chart.timeScale().scrollToPosition(-20, false);
  chart.timeScale().setVisibleRange({ from: (ts - 3600) as UTCTimestamp, to: (ts + 3600) as UTCTimestamp });
}

export function applyOverlays(overlays: ChartMountOpts["overlays"], orders: Order[], lastPrice?: number): void {
  if (!lastOpts) return;
  lastOpts = { ...lastOpts, overlays, lastPrice };
  renderOrderLines(
    orders,
    overlays,
    lastPrice,
    lastOpts.lastPriceUp ?? true,
    lastOpts.yesterdayClose,
    lastOpts.alerts,
  );
  if (volumeSeries && currentCandles.length > 1) {
    const volData = currentCandles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: overlays.showVolume ? c.volume : 0,
      color: c.close >= c.open ? "rgba(0,230,118,0.35)" : "rgba(255,82,82,0.35)",
    }));
    volumeSeries.setData(overlays.showVolume ? volData : []);
  }
}

export function chartScreenshot(): void {
  if (!chart || !hostEl) return;
  // Solid dark plate under LWC capture — transparent layout otherwise becomes white in PNG viewers.
  const bg = "#05070d";
  try {
    chart.applyOptions({ layout: { background: { color: bg } } });
  } catch {
    /* ignore */
  }
  let shot: HTMLCanvasElement;
  try {
    shot = chart.takeScreenshot(true, false);
  } catch {
    const fallback = hostEl.querySelector(".chart-inner canvas") as HTMLCanvasElement | null;
    if (!fallback) return;
    shot = fallback;
  }
  const out = document.createElement("canvas");
  out.width = shot.width;
  out.height = shot.height;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(shot, 0, 0);
  // Context strip: pair · timeframe
  if (lastOpts) {
    const label = `${lastOpts.watermark ?? `${lastOpts.pairId} · ${lastOpts.tf}`}`;
    ctx.font = "600 13px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(155, 176, 204, 0.92)";
    ctx.fillText(label, 12, 20);
  }
  const link = document.createElement("a");
  link.href = out.toDataURL("image/png");
  link.download = `hackme-chart-${Date.now()}.png`;
  link.click();
  // Restore gradient/transparent preference if set
  if (lastOpts?.settings) {
    try {
      chart.applyOptions({
        layout: {
          background: { color: lastOpts.settings.bgGradient ? "transparent" : bg },
        },
      });
    } catch {
      /* ignore */
    }
  }
}

/** Re-measure after panel drag, iframe chrome, or orientation change. */
export function resizeChart(): void {
  if (!chart || !hostEl) return;
  const inner = hostEl.querySelector(".chart-inner") as HTMLElement | null;
  const w = Math.floor(inner?.clientWidth ?? hostEl.clientWidth);
  const h = Math.floor(inner?.clientHeight ?? hostEl.clientHeight);
  if (w > 2 && h > 2) chart.resize(w, h);
}

export function destroyChart(): void {
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = 0;
  }
  hostResizeObs?.disconnect();
  hostResizeObs = null;
  priceWheelCleanup?.();
  clearDrawPointerListeners();
  // Drop any previous viewport — remounts (TF/pair) must re-anchor to the live candle.
  savedLogicalRange = null;
  if (chart) {
    try {
      chart.remove();
    } catch {
      /* ignore */
    }
    chart = null;
    candleSeries = null;
    barSeries = null;
    lineSeries = null;
    areaSeries = null;
    volumeSeries = null;
    overlaySeries = [];
    oscSeries = [];
    priceLines = [];
    drawCanvas = null;
    hostEl = null;
    watermarkEl = null;
    hudEl = null;
    tradeTipEl = null;
    mounted = false;
    lastOpts = null;
    contextPriceLine = null;
    lastPriceLine = null;
    lastHudUp = null;
    ydayPriceLine = null;
    tradeMarks = [];
    selectedDrawingId = null;
    hoveredDrawingId = null;
    dragDraw = null;
    measurePreview = null;
    ghostPreview = null;
    liveDrawings = [];
    firstDataApplied = false;
    historyLoading = false;
    if (historyLoadTimer) {
      clearTimeout(historyLoadTimer);
      historyLoadTimer = 0;
    }
    priceScaleManual = false;
    if (hudPulseTimer) {
      clearTimeout(hudPulseTimer);
      hudPulseTimer = null;
    }
  }
}

export function isChartMounted(): boolean {
  return mounted;
}

/** Soft update — keep zoom/pan/drawings without destroy/remount. */
export function softRefreshChart(candles: Candle[], opts: ChartMountOpts): boolean {
  if (!mounted || !chart) return false;
  // Re-apply style (colors / grid / log) then data + indicators.
  applyChartSettings(opts.settings, candles, { ...opts });
  return true;
}

export function setDrawingsLockedFlag(locked: boolean): void {
  if (lastOpts) lastOpts = { ...lastOpts, drawingsLocked: locked };
}

export function fitChartContent(): void {
  anchorToLatestCandle();
}

export function resetChartView(): void {
  if (!chart) return;
  priceScaleManual = false;
  priceWheelResidual = 0;
  chart.priceScale("right").setAutoScale(true);
  anchorToLatestCandle();
  savedLogicalRange = null;
}

export function countActiveIndicators(settings: ChartSettings, indicatorConfig?: IndicatorConfig): number {
  const tabs = Object.values(settings.indicators).filter(Boolean).length;
  const mas = indicatorConfig?.ma?.filter((m) => m.enabled).length ?? 0;
  return tabs + mas;
}

export function clearAllIndicators(settings: ChartSettings): ChartSettings {
  const next = { ...settings, indicators: { ...settings.indicators } };
  for (const k of Object.keys(next.indicators) as IndicatorId[]) {
    next.indicators[k] = false;
  }
  return next;
}

export function clearIndicatorConfig(): IndicatorConfig {
  return {
    ma: DEFAULT_INDICATOR_CONFIG.ma.map((m) => ({ ...m, enabled: false })),
  };
}

export function getChartMountOpts(
  state: import("./types").DemoState,
  pairId: import("./types").PairId,
  tf: import("./types").Timeframe,
  lastPrice?: number,
  extras?: Partial<ChartMountOpts>,
): ChartMountOpts {
  return {
    pairId,
    tf,
    mode: state.chartMode,
    settings: state.chartSettings,
    overlays: state.chartOverlays,
    indicatorConfig: state.indicatorConfig,
    alerts: state.priceAlerts
      .filter((a) => a.pairId === pairId)
      .map((a) => ({ price: a.price, fired: a.fired })),
    drawings: state.drawings.filter((d) => d.pairId === pairId),
    orders: state.orders.filter(
      (o) => o.pairId === pairId && (o.status === "open" || o.status === "triggered"),
    ),
    trades: state.trades.filter((t) => t.pairId === pairId).slice(0, 60),
    lastPrice,
    ...extras,
  };
}
