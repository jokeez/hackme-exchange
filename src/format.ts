import { TickMarkType, type Time } from "lightweight-charts";
import type { Timeframe } from "./types";
import { TF_SEC } from "./types";

/** Human-readable numbers — never scientific notation in UI. */

/**
 * Format with maxFrac precision but keep at least minFrac digits
 * so mids like 0.05 show as 0.050000 (not stripped to "0.05").
 */
function formatFixed(n: number, maxFrac: number, minFrac: number): string {
  const s = n.toFixed(maxFrac);
  const dot = s.indexOf(".");
  if (dot < 0) return s;
  const intPart = s.slice(0, dot);
  let frac = s.slice(dot + 1);
  while (frac.length > minFrac && frac.endsWith("0")) frac = frac.slice(0, -1);
  if (frac.length < minFrac) frac = frac.padEnd(minFrac, "0");
  return `${intPart}.${frac}`;
}

export function formatPrice(n: number, quote?: string): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const abs = Math.abs(n);

  if (abs >= 1000) return formatFixed(n, 2, 2);
  if (abs >= 1) return formatFixed(n, 4, 2);
  // Spot desk: always show tick depth so 0.05 → 0.050000, not "0.05"
  if (abs >= 0.01) return formatFixed(n, 6, 6);
  if (abs >= 0.0001) return formatFixed(n, 8, 6);
  if (abs >= 0.00000001) return formatFixed(n, 10, 8);
  if (abs >= 1e-12) {
    const s = n.toFixed(16);
    const m = s.match(/^0\.(0*)([1-9]\d{0,5})/);
    if (m) {
      const zeros = m[1].length;
      const sig = m[2].replace(/0+$/, "");
      return `0.${"0".repeat(zeros)}${sig}`;
    }
    return trimZeros(s);
  }
  return trimZeros(n.toFixed(18));
}

/** Shorter mid for narrow market rows — never scientific notation. */
export function formatPriceCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return formatFixed(n, 2, 2);
  if (abs >= 1) return formatFixed(n, 4, 2);
  if (abs >= 0.01) return formatFixed(n, 5, 5);
  if (abs >= 0.0001) return formatFixed(n, 6, 5);
  if (abs >= 1e-6) return formatFixed(n, 8, 6);
  // Binance-style 0.0₈905 — keeps width stable without "e-9"
  const fixed = n.toFixed(16);
  const m = fixed.match(/^0\.(0+)([1-9]\d{0,3})/);
  if (m) {
    const zeros = m[1].length;
    const sig = m[2].replace(/0+$/, "") || m[2].slice(0, 3);
    if (zeros >= 4) {
      const sub = String(zeros).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)] ?? d);
      return `0.0${sub}${sig}`;
    }
  }
  return formatPrice(n);
}

export function formatNum(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

/** Book / depth qty — never round sub-1 amounts to 0 (was formatNum(_, 0)). */
export function formatBookQty(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return formatNum(n, 1);
  if (abs >= 10) return formatNum(n, 2);
  if (abs >= 1) return formatNum(n, 2);
  if (abs >= 0.01) return formatNum(n, 4);
  return formatNum(n, 6);
}

export function formatPct(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  // Flat = no plus (avoids "+0.00%" looking like a green win).
  if (Math.abs(n) < 5 * 10 ** -(d + 1)) return (0).toFixed(d) + "%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(d)}%`;
}

/** CSS tone for 24h change: flat stays muted, not buy-green. */
export function pctTone(n: number): "up" | "down" | "flat" {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return "flat";
  return n > 0 ? "up" : "down";
}

export function formatRewardPerM(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 0.0001) return formatFixed(n, 6, 4);
  if (n >= 0.000001) return formatFixed(n, 8, 6);
  return formatFixed(n, 10, 8);
}

export function formatGh(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `${formatNum(n / 1000, 2)} TH/s`;
  return `${formatNum(n, 1)} GH/s`;
}

export function formatVolBase(n: number, base: string): string {
  if (!Number.isFinite(n) || n <= 0) return `0 ${base}`;
  if (n >= 1_000_000) return `${formatNum(n / 1_000_000, 2)}M ${base}`;
  if (n >= 1000) return `${formatNum(n / 1000, 1)}K ${base}`;
  return `${formatBookQty(n)} ${base}`;
}

export function formatVol(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${formatNum(n / 1_000_000, 2)}M`;
  if (n >= 1000) return `${formatNum(n / 1000, 1)}K`;
  return formatNum(n, 0);
}

function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/**
 * Axis / candle tip labels — compact so high/low last ticks stay readable
 * (full formatPrice pads 0.05 → 0.050000 and clips with entireTextOnly).
 */
export function chartPriceFormatter(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  return formatPriceCompact(price);
}

const CHART_LOCALE_CANDIDATES = ["en-US", "en"] as const;

/** Safe locale for LWC — headless Chromium can throw on bare "en-US" in some builds. */
export function chartLocaleTag(): string {
  for (const tag of CHART_LOCALE_CANDIDATES) {
    try {
      new Intl.NumberFormat(tag).format(1);
      return tag;
    } catch {
      /* try next */
    }
  }
  return "en";
}

/**
 * Axis tick labels must match the active TF.
 * Bug class: 1D watermark + HH:MM every 10m (minute series / default LWC density).
 */
export function chartTickMarkFormatter(tf: Timeframe): (time: Time, tickMarkType: TickMarkType, locale: string) => string {
  const sec = TF_SEC[tf] ?? 60;
  return (time: Time, tickMarkType: TickMarkType, locale: string) => {
    const ts = typeof time === "number" ? time : typeof time === "string" ? Date.parse(time) / 1000 : 0;
    if (!(ts > 0)) return "";
    const d = new Date(ts * 1000);
    const loc = locale || chartLocaleTag();
    // Candle buckets are UTC — label high TFs in UTC so axis matches OHLC day keys.
    const utc = { timeZone: "UTC" as const };
    // Daily / weekly — never show intraday HH:MM (that screamed «this is 1m»).
    // Month ticks must NOT use year:"2-digit" → "Oct 26" looked like day 26.
    if (sec >= 86_400) {
      if (tickMarkType === TickMarkType.Year) {
        return d.toLocaleDateString(loc, { year: "numeric", ...utc });
      }
      if (tickMarkType === TickMarkType.Month) {
        return d.toLocaleDateString(loc, { month: "short", year: "numeric", ...utc }); // "Oct 2026"
      }
      return d.toLocaleDateString(loc, { month: "short", day: "numeric", ...utc }); // "Oct 2"
    }
    // 1H–4H: UTC date on day/month marks, UTC HH:MM for intraday hours.
    if (sec >= 3600) {
      if (tickMarkType === TickMarkType.Year) {
        return d.toLocaleDateString(loc, { year: "numeric", ...utc });
      }
      if (tickMarkType === TickMarkType.Month) {
        return d.toLocaleDateString(loc, { month: "short", year: "numeric", ...utc });
      }
      if (tickMarkType === TickMarkType.DayOfMonth) {
        return d.toLocaleDateString(loc, { month: "short", day: "numeric", ...utc });
      }
      return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false, ...utc });
    }
    // Intraday ≤15m — UTC clock matches bucket times on every desk.
    if (tickMarkType === TickMarkType.TimeWithSeconds || sec <= 30) {
      return d.toLocaleTimeString(loc, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        ...utc,
      });
    }
    if (
      tickMarkType === TickMarkType.Year ||
      tickMarkType === TickMarkType.Month ||
      tickMarkType === TickMarkType.DayOfMonth
    ) {
      return d.toLocaleDateString(loc, { month: "short", day: "numeric", ...utc });
    }
    return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false, ...utc });
  };
}

export function chartLocalization(_tf?: Timeframe): {
  locale: string;
  priceFormatter: typeof chartPriceFormatter;
} {
  // tickMarkFormatter lives on timeScale options (see chart.ts applyTimeScaleForTf).
  void _tf;
  return { locale: chartLocaleTag(), priceFormatter: chartPriceFormatter };
}
