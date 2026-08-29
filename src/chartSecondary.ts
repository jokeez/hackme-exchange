import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Order, PairId, Timeframe } from "./types";
import { TF_SEC, TIMEFRAMES } from "./types";
import { chartLocalization, chartPriceFormatter } from "./format";
import { bumpTimeSyncPane } from "./chartTimeSync";
import { logicalRangeToIndices, robustPriceRange, sanitizeCandleExtremes } from "./chartScale";
import { barSpacingForWidth, clampVisiblePriceRange, normalizeWheelDeltaY, panLogicalRangeByWheel, priceRangeNeedsHeal, registerSecondaryPaneDraw, setFocusedChartPane, setupPortableChartPan, getActiveDrawTool, updateSecondaryPaneMeta, visibleBarBudget, wheelZoomStep, zoomBarSpacing, zoomPriceRange } from "./chart";
import type { Drawing } from "./types";
import { escapeHtml } from "./sanitize";
import { chartInteractionOptions, isMobileLayout } from "./mobile";

export type SecondaryMountOpts = {
  pairId: PairId;
  pairLabel: string;
  tf: Timeframe;
  pairs?: readonly { id: PairId; label: string }[];
  timeframes?: readonly Timeframe[];
  onTfChange?: (tf: Timeframe) => void;
  onPairChange?: (pairId: PairId) => void;
  onContextMenu?: (price: number, clientX: number, clientY: number) => void;
  onChartPricePick?: (price: number, clientX: number, clientY: number, dragging: boolean) => void;
  onPaneFocus?: () => void;
  getDrawings?: () => Drawing[];
  drawingsLocked?: () => boolean;
  onAddDrawing?: (d: Drawing) => void;
  onUpdateDrawing?: (d: Drawing) => void;
};

type Slot = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  host: HTMLElement;
  shell: HTMLElement;
  drawCanvas: HTMLCanvasElement;
  tf: Timeframe;
  pairId: PairId;
  pairLabel: string;
  ro: ResizeObserver | null;
  savedRange: LogicalRange | null;
  candles: Candle[];
  cleanup: (() => void) | null;
  drawCleanup: (() => void) | null;
  mountOpts: SecondaryMountOpts;
  orderPriceLines: IPriceLine[];
  previewPriceLine: IPriceLine | null;
  pricePickCleanup: (() => void) | null;
};

const slots = new Map<string, Slot>();
const CHART_BG = "#05070d";

export type SecondaryPaneOverlayOpts = {
  showOrderLines: boolean;
  orderPreview: boolean;
};

export type SecondaryPaneLineOpts = {
  orders: Order[];
  alerts?: { price: number; fired: boolean }[];
  overlays: SecondaryPaneOverlayOpts;
  previewPrice?: number | null;
  previewSide?: "buy" | "sell" | null;
  previewPaneId?: string;
};

function priceAtClientY(slot: Slot, clientY: number): number | null {
  const rect = slot.shell.getBoundingClientRect();
  const y = clientY - rect.top;
  const price = slot.series.coordinateToPrice(y);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return price as number;
}

function clearSlotPriceLines(slot: Slot): void {
  for (const pl of slot.orderPriceLines) {
    try {
      slot.series.removePriceLine(pl);
    } catch {
      /* already detached */
    }
  }
  slot.orderPriceLines = [];
  if (slot.previewPriceLine) {
    try {
      slot.series.removePriceLine(slot.previewPriceLine);
    } catch {
      /* already detached */
    }
    slot.previewPriceLine = null;
  }
}

export function refreshSecondaryPaneOrderLines(hostId: string, opts: SecondaryPaneLineOpts): void {
  const slot = slots.get(hostId);
  if (!slot) return;
  clearSlotPriceLines(slot);
  const { overlays } = opts;
  if (overlays.showOrderLines) {
    for (const o of opts.orders.filter((x) => x.status === "open" || x.status === "triggered")) {
      const color = o.side === "buy" ? "#00e676" : "#ff5252";
      slot.orderPriceLines.push(
        slot.series.createPriceLine({
          price: o.price,
          color,
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${o.side} ${o.kind}`,
        }),
      );
      if (o.stopPrice) {
        slot.orderPriceLines.push(
          slot.series.createPriceLine({
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
  if (opts.alerts?.length) {
    for (const a of opts.alerts) {
      if (!(a.price > 0)) continue;
      slot.orderPriceLines.push(
        slot.series.createPriceLine({
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
  const preview = opts.previewPrice;
  if (overlays.orderPreview && preview && preview > 0 && opts.previewPaneId === hostId) {
    const side = opts.previewSide;
    const sideColor = side === "sell" ? "#ff5252" : side === "buy" ? "#00e676" : "rgba(77, 228, 255, 0.85)";
    slot.previewPriceLine = slot.series.createPriceLine({
      price: preview,
      color: sideColor,
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: side ? `${side} preview` : "Preview",
    });
  }
}

export function setSecondaryCrosshairMode(mode: 0 | 1): void {
  for (const slot of slots.values()) {
    try {
      slot.chart.applyOptions({ crosshair: { mode } });
    } catch {
      /* ignore */
    }
  }
}

function slotKey(el: HTMLElement): string {
  if (el.id) return el.id;
  let id = el.dataset.chartSlotId;
  if (!id) {
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    el.dataset.chartSlotId = id;
  }
  return id;
}

function candlePoints(candles: Candle[]) {
  return [...candles]
    .sort((a, b) => a.time - b.time)
    .map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
}

function rememberRange(slot: Slot): void {
  try {
    const r = slot.chart.timeScale().getVisibleLogicalRange();
    if (r && Number.isFinite(r.from) && Number.isFinite(r.to)) {
      slot.savedRange = { from: r.from, to: r.to };
    }
  } catch {
    /* ignore */
  }
}

function restoreRange(slot: Slot): void {
  if (!slot.savedRange) return;
  const n = slot.candles.length;
  if (n < 2) return;
  try {
    let from = slot.savedRange.from as number;
    let to = slot.savedRange.to as number;
    const span = Math.max(1, to - from);
    const maxTo = n - 1 + 2;
    if (to > maxTo || from > n - 1) {
      to = Math.min(to, maxTo);
      from = to - span;
    }
    if (from < -1) {
      to += -1 - from;
      from = -1;
    }
    const next: LogicalRange = { from: from as LogicalRange["from"], to: to as LogicalRange["to"] };
    slot.chart.timeScale().setVisibleLogicalRange(next);
    slot.savedRange = next;
  } catch {
    /* ignore */
  }
}

function paintChrome(host: HTMLElement, opts: SecondaryMountOpts): void {
  let chrome = host.querySelector(".sub-chart-chrome") as HTMLElement | null;
  const tfs = opts.timeframes ?? TIMEFRAMES;
  const pairs = opts.pairs ?? [];
  if (!chrome) {
    chrome = document.createElement("div");
    chrome.className = "sub-chart-chrome";
    host.prepend(chrome);
  }
  const pairOpts = pairs.length
    ? pairs.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === opts.pairId ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("")
    : `<option value="${escapeHtml(opts.pairId)}" selected>${escapeHtml(opts.pairLabel)}</option>`;
  chrome.innerHTML = `
    <select class="sub-pair-select mono" aria-label="Pane symbol">${pairOpts}</select>
    <select class="sub-tf-select mono" aria-label="Pane timeframe"></select>
    <button type="button" class="sub-reset-view btn-ico-sm" title="Reset pane view" aria-label="Reset pane view">↺</button>`;
  const pairSel = chrome.querySelector(".sub-pair-select") as HTMLSelectElement;
  pairSel.addEventListener("change", () => {
    const next = pairSel.value as PairId;
    if (next && next !== opts.pairId) opts.onPairChange?.(next);
  });
  const sel = chrome.querySelector(".sub-tf-select") as HTMLSelectElement;
  sel.innerHTML = tfs.map((tf) => `<option value="${tf}" ${tf === opts.tf ? "selected" : ""}>${tf}</option>`).join("");
  sel.addEventListener("change", () => {
    const next = sel.value as Timeframe;
    if (next && next !== opts.tf) opts.onTfChange?.(next);
  });
  chrome.querySelector(".sub-reset-view")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = host.id || slotKey(host);
    resetSecondaryPaneView(id);
  });
}

function bindResize(slot: Slot): void {
  slot.ro?.disconnect();
  const apply = () => {
    const w = Math.floor(slot.shell.clientWidth || slot.host.clientWidth);
    const h = Math.floor(slot.shell.clientHeight || slot.host.clientHeight);
    if (w > 2 && h > 2) {
      try {
        slot.chart.resize(w, h, true);
      } catch {
        /* ignore */
      }
    }
  };
  slot.ro = new ResizeObserver(() => {
    requestAnimationFrame(apply);
  });
  slot.ro.observe(slot.shell);
  requestAnimationFrame(apply);
}

function setSecondaryData(slot: Slot, candles: Candle[], fit = false, prepended = 0): void {
  if (candles.length < 2) return;
  if (!fit) rememberRange(slot);
  if (prepended > 0 && slot.savedRange) {
    slot.savedRange = {
      from: ((slot.savedRange.from as number) + prepended) as LogicalRange["from"],
      to: ((slot.savedRange.to as number) + prepended) as LogicalRange["to"],
    };
  }
  const cleaned = sanitizeCandleExtremes(candles);
  slot.candles = cleaned;
  slot.series.setData(candlePoints(cleaned));
  if (fit) {
    const n = cleaned.length;
    const w = slot.shell.clientWidth || 320;
    const spacing = barSpacingForWidth(w, slot.tf);
    try {
      slot.chart.timeScale().applyOptions({ barSpacing: spacing, rightOffset: 4, minBarSpacing: 2 });
    } catch {
      /* ignore */
    }
    const budget = visibleBarBudget(w, spacing);
    const to = n - 1 + 2;
    const from = to - budget;
    try {
      slot.chart.timeScale().setVisibleLogicalRange({ from, to });
    } catch {
      slot.chart.timeScale().fitContent();
    }
    slot.savedRange = null;
  } else {
    restoreRange(slot);
  }
}

export function mountSecondaryChart(el: HTMLElement, candles: Candle[], opts: SecondaryMountOpts | Timeframe): void {
  const resolved: SecondaryMountOpts =
    typeof opts === "string"
      ? { pairId: "HMC_USDT", pairLabel: "", tf: opts }
      : opts;
  const key = slotKey(el);
  destroySecondarySlot(key);

  el.innerHTML = "";
  el.classList.add("chart-host-sub");
  paintChrome(el, resolved);

  const shell = document.createElement("div");
  shell.className = "chart-inner sub-inner";
  el.appendChild(shell);

  const drawCanvas = document.createElement("canvas");
  drawCanvas.className = "draw-layer";
  el.appendChild(drawCanvas);

  const hostW = Math.max(200, shell.clientWidth || el.clientWidth || 320);
  const spacing = barSpacingForWidth(hostW, resolved.tf);
  const chart = createChart(shell, {
    autoSize: false,
    width: Math.max(2, shell.clientWidth || el.clientWidth || 320),
    height: Math.max(2, shell.clientHeight || el.clientHeight || 180),
    layout: {
      background: { color: CHART_BG },
      textColor: "#9bb0cc",
      fontFamily: "JetBrains Mono, monospace",
      fontSize: hostW < 420 ? 10 : 12,
      attributionLogo: false,
    },
    grid: {
      vertLines: { visible: true, color: "rgba(255,255,255,0.06)" },
      horzLines: { visible: true, color: "rgba(255,255,255,0.06)" },
    },
    rightPriceScale: {
      borderVisible: true,
      borderColor: "rgba(255,255,255,0.1)",
      scaleMargins: { top: 0.06, bottom: 0.1 },
      entireTextOnly: true,
      autoScale: true,
    },
    timeScale: {
      borderVisible: true,
      borderColor: "rgba(255,255,255,0.1)",
      timeVisible: true,
      secondsVisible: resolved.tf === "30s" || resolved.tf === "1m",
      rightOffset: 4,
      barSpacing: spacing,
    },
    handleScale: {
      mouseWheel: false,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true },
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: chartInteractionOptions().handleScroll.horzTouchDrag,
      vertTouchDrag: chartInteractionOptions().handleScroll.vertTouchDrag,
    },
    crosshair: { mode: 0 },
    localization: chartLocalization(),
  });

  const series = chart.addSeries(CandlestickSeries, {
    upColor: "#00e676",
    downColor: "#ff5252",
    borderVisible: false,
    wickUpColor: "#00e676",
    wickDownColor: "#ff5252",
    priceFormat: { type: "custom", formatter: chartPriceFormatter, minMove: 1e-12 },
    autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: { above: number; below: number } } | null) => {
      try {
        const s = slots.get(key);
        const bars = s?.candles ?? [];
        const lr = chart.timeScale().getVisibleLogicalRange();
        if (!lr || bars.length < 2) return original();
        const { fromIdx, toIdx } = logicalRangeToIndices(lr.from, lr.to, bars.length);
        const robust = robustPriceRange(bars, fromIdx, toIdx);
        if (!robust) return original();
        return { priceRange: robust, margins: { above: 8, below: 10 } };
      } catch {
        return original();
      }
    },
  });

  const slot: Slot = {
    chart,
    series,
    host: el,
    shell,
    drawCanvas,
    tf: resolved.tf,
    pairId: resolved.pairId,
    pairLabel: resolved.pairLabel,
    ro: null,
    savedRange: null,
    candles: [],
    cleanup: null,
    drawCleanup: null,
    mountOpts: resolved,
    orderPriceLines: [],
    previewPriceLine: null,
    pricePickCleanup: null,
  };
  slots.set(key, slot);
  setSecondaryData(slot, candles, true);
  bindResize(slot);

  const healAxis = () => {
    const last = slot.candles[slot.candles.length - 1]?.close;
    const refPrice = last && Number.isFinite(last) && last > 0 ? last : 0;
    if (!(refPrice > 0)) return;
    const ps = slot.chart.priceScale("right");
    const range = ps.getVisibleRange();
    if (!priceRangeNeedsHeal(range, refPrice) || !range) return;
    const next = clampVisiblePriceRange(range, refPrice);
    try {
      ps.setAutoScale(false);
      ps.setVisibleRange(next);
    } catch {
      /* ignore */
    }
  };

  slot.drawCleanup = registerSecondaryPaneDraw({
    id: key,
    hostEl: el,
    drawCanvas,
    chart,
    candleSeries: series,
    tf: resolved.tf,
    pairId: resolved.pairId,
    getDrawings: () => slots.get(key)?.mountOpts.getDrawings?.() ?? [],
    isLocked: () => slots.get(key)?.mountOpts.drawingsLocked?.() ?? false,
    onAdd: (d) => slots.get(key)?.mountOpts.onAddDrawing?.(d),
    onUpdate: (d) => slots.get(key)?.mountOpts.onUpdateDrawing?.(d),
  });

  const focusPane = () => {
    setFocusedChartPane(key);
    resolved.onPaneFocus?.();
  };
  el.addEventListener("pointerdown", focusPane);
  shell.addEventListener("pointerdown", focusPane);

  if (resolved.onContextMenu) {
    const ctxHandler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      focusPane();
      const price = priceAtClientY(slot, e.clientY);
      if (price == null) return;
      slots.get(key)?.mountOpts.onContextMenu?.(price, e.clientX, e.clientY);
    };
    el.addEventListener("contextmenu", ctxHandler);
    drawCanvas.addEventListener("contextmenu", ctxHandler);
    shell.addEventListener("contextmenu", ctxHandler);
  }

  slot.pricePickCleanup?.();
  const CLICK_DRAG_PX = 8;
  let pickDown: { x: number; y: number; price: number } | null = null;
  let pickDragged = false;
  const onPickDown = (e: PointerEvent) => {
    if (e.button !== 0 || getActiveDrawTool() !== "cursor") return;
    const opts = slots.get(key)?.mountOpts;
    if (!opts?.onChartPricePick) return;
    const price = priceAtClientY(slot, e.clientY);
    if (price == null) return;
    pickDown = { x: e.clientX, y: e.clientY, price };
    pickDragged = false;
  };
  const onPickMove = (e: PointerEvent) => {
    if (!pickDown || (e.buttons & 1) === 0) return;
    const dx = e.clientX - pickDown.x;
    const dy = e.clientY - pickDown.y;
    if (dx * dx + dy * dy > CLICK_DRAG_PX * CLICK_DRAG_PX) pickDragged = true;
    const opts = slots.get(key)?.mountOpts;
    if (!opts?.onChartPricePick) return;
    const price = priceAtClientY(slot, e.clientY);
    if (price == null) return;
    pickDown.price = price;
    opts.onChartPricePick(price, e.clientX, e.clientY, true);
  };
  const onPickUp = (e: PointerEvent) => {
    if (!pickDown || e.button !== 0) return;
    const down = pickDown;
    pickDown = null;
    const opts = slots.get(key)?.mountOpts;
    if (!opts?.onChartPricePick || getActiveDrawTool() !== "cursor") return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!pickDragged && dx * dx + dy * dy <= CLICK_DRAG_PX * CLICK_DRAG_PX) {
      const price = priceAtClientY(slot, e.clientY) ?? down.price;
      opts.onChartPricePick(price, e.clientX, e.clientY, false);
    }
    pickDragged = false;
  };
  el.addEventListener("pointerdown", onPickDown, { capture: true });
  shell.addEventListener("pointerdown", onPickDown, { capture: true });
  drawCanvas.addEventListener("pointerdown", onPickDown, { capture: true });
  window.addEventListener("pointermove", onPickMove, { capture: true });
  window.addEventListener("pointerup", onPickUp, { capture: true });
  slot.pricePickCleanup = () => {
    el.removeEventListener("pointerdown", onPickDown, true);
    shell.removeEventListener("pointerdown", onPickDown, true);
    drawCanvas.removeEventListener("pointerdown", onPickDown, true);
    window.removeEventListener("pointermove", onPickMove, true);
    window.removeEventListener("pointerup", onPickUp, true);
    pickDown = null;
    pickDragged = false;
  };

  if (isMobileLayout()) {
    const panCleanup = setupPortableChartPan(shell, chart, {
      getActiveTool: () => getActiveDrawTool(),
      healPriceScale: healAxis,
    });
    const prevCleanup = slot.cleanup;
    slot.cleanup = () => {
      panCleanup();
      prevCleanup?.();
    };
  }

  // Soft price-axis wheel — notch-capped + ref-clamped so trackpads can't fling the scale.
  // Also heal after native LWC axis drag (same collapse path as the main chart).
  let residual = 0;
  let plotResidual = 0;
  let lastApply = 0;
  let plotLastApply = 0;
  let axisPointerDown = false;
  let axisHealRaf = 0;
  const overPriceScale = (clientX: number, clientY: number): boolean => {
    const cell =
      shell.querySelector<HTMLElement>(".tv-lightweight-charts table tr td:last-child") ??
      shell.querySelector<HTMLElement>("table tr td:last-child");
    if (cell) {
      const r = cell.getBoundingClientRect();
      if (r.width >= 8) {
        return clientX >= r.left - 1 && clientX <= r.right + 1 && clientY >= r.top && clientY <= r.bottom;
      }
    }
    const rect = shell.getBoundingClientRect();
    const scaleW = Math.max(48, slot.chart.priceScale("right").width() || 56);
    return clientX >= rect.right - scaleW - 4;
  };
  const scheduleHeal = () => {
    if (axisHealRaf) return;
    axisHealRaf = requestAnimationFrame(() => {
      axisHealRaf = 0;
      healAxis();
    });
  };
  shell.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      const target = e.target as Node | null;
      if (!target || !shell.contains(target)) return;
      const overScale = overPriceScale(e.clientX, e.clientY);
      e.preventDefault();
      e.stopImmediatePropagation();
      const dy = normalizeWheelDeltaY(e, shell.clientHeight || 200);

      if (overScale) {
        const z = wheelZoomStep(dy, residual);
        residual = z.residual;
        if (z.step === 0) return;
        const now = performance.now();
        if (now - lastApply < 50) return;
        lastApply = now;
        const ps = slot.chart.priceScale("right");
        let range = ps.getVisibleRange();
        if (!range || !(range.to > range.from)) return;
        const last = slot.candles[slot.candles.length - 1]?.close;
        const refPrice = last && Number.isFinite(last) && last > 0 ? last : 0;
        if (refPrice > 0 && priceRangeNeedsHeal(range, refPrice)) {
          range = clampVisiblePriceRange(range, refPrice);
        }
        const next = zoomPriceRange(range, z.step, { step: z.step, refPrice });
        try {
          ps.setAutoScale(false);
          ps.setVisibleRange(next);
        } catch {
          /* ignore */
        }
        return;
      }

      const ts = slot.chart.timeScale();
      const spacing = ts.options().barSpacing ?? 8;
      const lr = ts.getVisibleLogicalRange();
      if (!lr) return;
      if (e.shiftKey) {
        const deltaPx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        try {
          ts.setVisibleLogicalRange(panLogicalRangeByWheel(lr, deltaPx, spacing));
          bumpTimeSyncPane(key);
        } catch {
          /* ignore */
        }
        return;
      }
      const z = wheelZoomStep(dy, plotResidual);
      plotResidual = z.residual;
      if (z.step === 0) return;
      const now = performance.now();
      if (now - plotLastApply < 50) return;
      plotLastApply = now;
      try {
        ts.applyOptions({ barSpacing: zoomBarSpacing(spacing, z.step), minBarSpacing: 2 });
        bumpTimeSyncPane(key);
      } catch {
        /* ignore */
      }
    },
    { passive: false, capture: true },
  );
  shell.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      if (!overPriceScale(e.clientX, e.clientY)) return;
      axisPointerDown = true;
    },
    { capture: true },
  );
  const onPtrMove = (e: PointerEvent) => {
    if (!axisPointerDown) return;
    if ((e.buttons & 1) === 0) {
      axisPointerDown = false;
      healAxis();
      return;
    }
    scheduleHeal();
  };
  const onPtrUp = () => {
    if (!axisPointerDown) return;
    axisPointerDown = false;
    healAxis();
  };
  window.addEventListener("pointermove", onPtrMove, { capture: true });
  window.addEventListener("pointerup", onPtrUp, { capture: true });
  window.addEventListener("pointercancel", onPtrUp, { capture: true });
  slot.cleanup = () => {
    window.removeEventListener("pointermove", onPtrMove, true);
    window.removeEventListener("pointerup", onPtrUp, true);
    window.removeEventListener("pointercancel", onPtrUp, true);
    if (axisHealRaf) cancelAnimationFrame(axisHealRaf);
    axisHealRaf = 0;
    axisPointerDown = false;
    slot.cleanup = null;
  };
}

/** Remount only when TF/pair chrome changes; otherwise refresh data and keep zoom. */
export function syncSecondaryChart(el: HTMLElement, candles: Candle[], opts: SecondaryMountOpts): void {
  const key = slotKey(el);
  const existing = slots.get(key);
  if (existing && existing.host === el) {
    existing.mountOpts = opts;
    const metaChanged = existing.tf !== opts.tf || existing.pairId !== opts.pairId;
    if (metaChanged) {
      existing.tf = opts.tf;
      existing.pairId = opts.pairId;
      existing.pairLabel = opts.pairLabel;
      updateSecondaryPaneMeta(key, { pairId: opts.pairId, tf: opts.tf });
      paintChrome(el, opts);
      setSecondaryData(existing, candles, true);
      return;
    }
    if (existing.pairLabel !== opts.pairLabel) {
      existing.pairLabel = opts.pairLabel;
      paintChrome(el, opts);
    }
    setSecondaryData(existing, candles, false);
    return;
  }
  mountSecondaryChart(el, candles, opts);
}

function destroySecondarySlot(key: string): void {
  const slot = slots.get(key);
  if (!slot) return;
  slot.pricePickCleanup?.();
  slot.cleanup?.();
  clearSlotPriceLines(slot);
  slot.drawCleanup?.();
  slot.ro?.disconnect();
  try {
    slot.chart.remove();
  } catch {
    /* ignore */
  }
  slots.delete(key);
}

export function destroySecondaryChart(): void {
  for (const key of [...slots.keys()]) destroySecondarySlot(key);
}

export function updateSecondaryChart(candles: Candle[], hostId?: string): void {
  if (candles.length < 2) return;
  const last = candles[candles.length - 1]!;
  const apply = (slot: Slot) => {
    const prevN = slot.candles.length;
    const prev = slot.candles[prevN - 1];
    const tfSec = TF_SEC[slot.tf] ?? 900;
    const lenDelta = candles.length - prevN;
    const wasLive =
      slot.savedRange != null && prevN > 0 && (slot.savedRange.to as number) >= prevN - 1 - 1.5;

    // Same tip bucket — series.update only
    if (prev && last.time === prev.time && lenDelta === 0) {
      try {
        slot.series.update({
          time: last.time as UTCTimestamp,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
        });
        slot.candles = candles;
      } catch {
        setSecondaryData(slot, candles, false);
      }
      return;
    }

    // Adjacent new bar (+1)
    if (prev && last.time === prev.time + tfSec && lenDelta === 1) {
      try {
        slot.series.update({
          time: last.time as UTCTimestamp,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
        });
        slot.candles = candles;
        if (wasLive && slot.savedRange) {
          const span = Math.max(1, (slot.savedRange.to as number) - (slot.savedRange.from as number));
          const to = candles.length - 1 + 2;
          const from = Math.max(-1, to - span);
          const next: LogicalRange = {
            from: from as LogicalRange["from"],
            to: to as LogicalRange["to"],
          };
          slot.chart.timeScale().setVisibleLogicalRange(next);
          slot.savedRange = next;
        }
      } catch {
        setSecondaryData(slot, candles, wasLive);
      }
      return;
    }

    // Left history prepend (tip unchanged, length grew)
    if (prev && last.time === prev.time && lenDelta > 0) {
      setSecondaryData(slot, candles, false, lenDelta);
      return;
    }

    // Gap / rewind / multi-bar — full replace; follow tip if user was live
    setSecondaryData(slot, candles, wasLive);
  };
  if (hostId) {
    const slot = slots.get(hostId);
    if (slot) apply(slot);
    return;
  }
  for (const slot of slots.values()) apply(slot);
}

export function resizeSecondaryCharts(): void {
  for (const slot of slots.values()) {
    const w = Math.floor(slot.shell.clientWidth || slot.host.clientWidth);
    const h = Math.floor(slot.shell.clientHeight || slot.host.clientHeight);
    if (w > 2 && h > 2) {
      try {
        slot.chart.resize(w, h, true);
      } catch {
        /* ignore */
      }
    }
  }
}

export function secondaryChartCount(): number {
  return slots.size;
}

export function secondaryPaneTf(hostId: string): Timeframe | null {
  return slots.get(hostId)?.tf ?? null;
}

export function listSecondaryCrosshairPanes(): Array<{
  id: string;
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  candles: () => Candle[];
}> {
  return [...slots.entries()].map(([id, s]) => ({
    id,
    chart: s.chart,
    series: s.series,
    candles: () => s.candles,
  }));
}

export function resetSecondaryPaneView(hostId: string): void {
  const slot = slots.get(hostId);
  if (!slot) return;
  try {
    slot.chart.priceScale("right").setAutoScale(true);
    const n = slot.candles.length;
    if (n < 2) return;
    const w = slot.shell.clientWidth || 320;
    const spacing = barSpacingForWidth(w, slot.tf);
    const budget = visibleBarBudget(w, spacing);
    const to = n - 1 + 2;
    const from = to - budget;
    slot.chart.timeScale().setVisibleLogicalRange({ from, to });
    slot.savedRange = null;
  } catch {
    /* ignore */
  }
}

export function getSecondaryViewportDebug(hostId: string): { barSpacing: number; from: number; to: number } | null {
  const slot = slots.get(hostId);
  if (!slot) return null;
  try {
    const ts = slot.chart.timeScale();
    const lr = ts.getVisibleLogicalRange();
    if (!lr) return null;
    return { barSpacing: ts.options().barSpacing ?? 8, from: lr.from as number, to: lr.to as number };
  } catch {
    return null;
  }
}
