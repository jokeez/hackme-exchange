import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Timeframe } from "./types";
import { TF_SEC, TIMEFRAMES } from "./types";
import { chartPriceFormatter } from "./format";
import { logicalRangeToIndices, robustPriceRange, sanitizeCandleExtremes } from "./chartScale";
import { barSpacingForWidth, clampVisiblePriceRange, priceRangeNeedsHeal, visibleBarBudget, wheelZoomStep, zoomPriceRange } from "./chart";
import { escapeHtml } from "./sanitize";

export type SecondaryMountOpts = {
  pairLabel: string;
  tf: Timeframe;
  timeframes?: readonly Timeframe[];
  onTfChange?: (tf: Timeframe) => void;
};

type Slot = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  host: HTMLElement;
  shell: HTMLElement;
  tf: Timeframe;
  pairLabel: string;
  ro: ResizeObserver | null;
  savedRange: LogicalRange | null;
  candles: Candle[];
  cleanup: (() => void) | null;
};

const slots = new Map<string, Slot>();
const CHART_BG = "#05070d";

function slotKey(el: HTMLElement): string {
  return el.id || `anon-${slots.size}`;
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
  if (!chrome) {
    chrome = document.createElement("div");
    chrome.className = "sub-chart-chrome";
    host.prepend(chrome);
  }
  const label = escapeHtml(opts.pairLabel ?? "");
  chrome.innerHTML = `
    <span class="sub-chart-meta mono" title="${label}">${label}</span>
    <select class="sub-tf-select mono" aria-label="Pane timeframe"></select>`;
  const sel = chrome.querySelector(".sub-tf-select") as HTMLSelectElement;
  sel.innerHTML = tfs.map((tf) => `<option value="${tf}" ${tf === opts.tf ? "selected" : ""}>${tf}</option>`).join("");
  sel.addEventListener("change", () => {
    const next = sel.value as Timeframe;
    if (next && next !== opts.tf) opts.onTfChange?.(next);
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

function setSecondaryData(slot: Slot, candles: Candle[], fit = false): void {
  if (candles.length < 2) return;
  if (!fit) rememberRange(slot);
  const cleaned = sanitizeCandleExtremes(candles);
  slot.candles = cleaned;
  slot.series.setData(candlePoints(cleaned));
  if (fit) {
    const n = cleaned.length;
    const w = slot.shell.clientWidth || 320;
    const spacing = (() => {
      try {
        return slot.chart.timeScale().options().barSpacing || 8;
      } catch {
        return 8;
      }
    })();
    const visible = Math.min(visibleBarBudget(w, spacing), n);
    const to = n - 1 + 2;
    const from = to - visible;
    try {
      slot.chart.timeScale().setVisibleLogicalRange({ from: Math.max(-1, from), to });
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
    typeof opts === "string" ? { pairLabel: "", tf: opts } : opts;
  const key = slotKey(el);
  destroySecondarySlot(key);

  el.innerHTML = "";
  el.classList.add("chart-host-sub");
  paintChrome(el, resolved);

  const shell = document.createElement("div");
  shell.className = "chart-inner sub-inner";
  el.appendChild(shell);

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
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    crosshair: { mode: 1 },
    localization: { priceFormatter: chartPriceFormatter },
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
    tf: resolved.tf,
    pairLabel: resolved.pairLabel,
    ro: null,
    savedRange: null,
    candles: [],
    cleanup: null,
  };
  slots.set(key, slot);
  setSecondaryData(slot, candles, true);
  bindResize(slot);

  // Soft price-axis wheel — notch-capped + ref-clamped so trackpads can't fling the scale.
  // Also heal after native LWC axis drag (same collapse path as the main chart).
  let residual = 0;
  let lastApply = 0;
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
      const overScale = overPriceScale(e.clientX, e.clientY);
      if (!overScale) {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= shell.clientHeight || 200;
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
      if (refPrice > 0) range = clampVisiblePriceRange(range, refPrice);
      const next = zoomPriceRange(range, z.step, { step: z.step, refPrice });
      try {
        ps.setAutoScale(false);
        ps.setVisibleRange(next);
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
  if (existing && existing.tf === opts.tf && existing.host === el) {
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
  slot.cleanup?.();
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
    const prev = slot.candles[slot.candles.length - 1];
    const tfSec = TF_SEC[slot.tf] ?? 900;
    if (!prev || last.time > prev.time + tfSec || last.time < prev.time || candles.length !== slot.candles.length) {
      setSecondaryData(slot, candles, false);
      return;
    }
    const point = {
      time: last.time as UTCTimestamp,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    };
    try {
      slot.series.update(point);
      slot.candles = candles;
    } catch {
      setSecondaryData(slot, candles, false);
    }
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
