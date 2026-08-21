import type {
  CandleScheme,
  CandleStyle,
  ChartMode,
  ChartSettings,
  IndicatorConfig,
  IndicatorId,
  LedgerEntry,
  LedgerKind,
  MaLineConfig,
  MainView,
  MultiChartLayout,
} from "./types";
import { DEFAULT_CANDLE_STYLE, DEFAULT_CHART_SETTINGS, DEFAULT_INDICATOR_CONFIG } from "./types";

/** Escape text before interpolating into HTML templates (innerHTML). */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Copy text with Clipboard API + textarea fallback (headless / denied permission).
 * Resolves true when any path succeeded.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? "");
  if (!value) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Safe token for data-* attributes / cancel buttons — blocks attribute breakout. */
const SAFE_DOM_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

export function sanitizeDomId(raw: unknown, fallback = ""): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!SAFE_DOM_ID.test(s)) return fallback;
  return s;
}

/** Hex colors only — blocks attribute breakout via chart style / MA color fields. */
const SAFE_CSS_COLOR = /^#[0-9a-fA-F]{3,8}$/;

export function sanitizeCssColor(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && SAFE_CSS_COLOR.test(raw.trim())) return raw.trim();
  return fallback;
}

/** Clamp candle colors used in `value="${…}"` color inputs. */
export function sanitizeCandleStyle(raw: Partial<CandleStyle> | undefined): CandleStyle {
  const base = DEFAULT_CANDLE_STYLE;
  return {
    bullBody: sanitizeCssColor(raw?.bullBody, base.bullBody),
    bearBody: sanitizeCssColor(raw?.bearBody, base.bearBody),
    bullWick: sanitizeCssColor(raw?.bullWick, base.bullWick),
    bearWick: sanitizeCssColor(raw?.bearWick, base.bearWick),
    bullBorder: sanitizeCssColor(raw?.bullBorder, base.bullBorder),
    bearBorder: sanitizeCssColor(raw?.bearBorder, base.bearBorder),
  };
}

/** Clamp MA line colors / periods from import or localStorage. */
export function sanitizeIndicatorConfig(raw: Partial<IndicatorConfig> | undefined): IndicatorConfig {
  const defaults = DEFAULT_INDICATOR_CONFIG.ma;
  const src = Array.isArray(raw?.ma) ? raw!.ma : defaults;
  const ma: MaLineConfig[] = defaults.map((d, i) => {
    const m = src[i];
    const period =
      typeof m?.period === "number" && Number.isFinite(m.period)
        ? Math.min(500, Math.max(1, Math.round(m.period)))
        : d.period;
    return {
      enabled: !!(m?.enabled ?? d.enabled),
      period,
      color: sanitizeCssColor(m?.color, d.color),
    };
  });
  return { ma };
}

/** Allow only http(s) URLs; strip trailing slash. Reject javascript: etc. */
export function sanitizeHttpUrl(raw: string, fallback: string): string {
  const candidate = (raw && raw.trim()) || fallback;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback.replace(/\/$/, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return fallback.replace(/\/$/, "");
  }
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

export function finiteNonNeg(n: unknown, fallback = 0): number {
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  if (typeof n === "string" && n.trim()) {
    const v = Number(n);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return fallback;
}

/** Demo wallet cap — rejects import/localStorage abuse (per asset). */
export const MAX_WALLET_ASSET = 1e12;

export function finiteNonNegCapped(n: unknown, fallback = 0, max = MAX_WALLET_ASSET): number {
  return Math.min(finiteNonNeg(n, fallback), max);
}

/** Sanitize one ledger row for import / localStorage (enum + XSS-safe asset/note). */
export function sanitizeLedgerEntry(
  e: Partial<LedgerEntry> | undefined,
  idFallback: string,
): LedgerEntry {
  return {
    id: sanitizeDomId(e?.id, idFallback),
    kind: sanitizeLedgerKind(e?.kind),
    asset: sanitizeLedgerAsset(e?.asset),
    amount: typeof e?.amount === "number" && Number.isFinite(e.amount) ? e.amount : 0,
    usdtValue: typeof e?.usdtValue === "number" && Number.isFinite(e.usdtValue) ? e.usdtValue : 0,
    note: typeof e?.note === "string" ? e.note.slice(0, 240) : "",
    ts: typeof e?.ts === "number" && Number.isFinite(e.ts) ? e.ts : Date.now(),
    ...(e?.pairId ? { pairId: e.pairId } : {}),
  };
}

const CANDLE_SCHEMES = new Set<CandleScheme>(["classic", "blue", "neon", "mono"]);
const CHART_MODES = new Set<ChartMode>(["candles", "bars", "line", "area", "heikin"]);
const MULTI_LAYOUTS = new Set<MultiChartLayout>(["1", "2v", "2h", "4"]);
const MAIN_VIEWS = new Set<MainView>(["spot", "convert", "pool", "account"]);
const LEDGER_KINDS = new Set<LedgerKind>(["trade", "deposit", "withdrawal", "transfer", "fee", "convert"]);
const LEDGER_ASSETS = new Set(["USDT", "HMC", "SUP", "BTC"]);
const INDICATOR_IDS = Object.keys(DEFAULT_CHART_SETTINGS.indicators) as IndicatorId[];

/** Oracle / reference mid used in `value="${…}"` — must be a finite positive number. */
export function sanitizeOracleAnchor(raw: unknown, fallback = 0.05): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) return fallback;
  return n;
}

/** Migrate pre-D0 micro anchors (~0.00042) up to operator reference mid. */
export function migrateOracleAnchor(raw: unknown, fallback = 0.05): number {
  const n = sanitizeOracleAnchor(raw, fallback);
  // Old demo scale was ~4e-4; anything below 0.001 is treated as legacy and lifted.
  if (n > 0 && n < 0.001) return fallback;
  return n;
}

export function sanitizeMainView(raw: unknown, fallback: MainView = "spot"): MainView {
  return typeof raw === "string" && MAIN_VIEWS.has(raw as MainView) ? (raw as MainView) : fallback;
}

export function sanitizeChartMode(raw: unknown, fallback: ChartMode = "candles"): ChartMode {
  return typeof raw === "string" && CHART_MODES.has(raw as ChartMode) ? (raw as ChartMode) : fallback;
}

export function sanitizeMultiChartLayout(raw: unknown, fallback: MultiChartLayout = "1"): MultiChartLayout {
  return typeof raw === "string" && MULTI_LAYOUTS.has(raw as MultiChartLayout)
    ? (raw as MultiChartLayout)
    : fallback;
}

export function sanitizeLedgerKind(raw: unknown): LedgerKind {
  return typeof raw === "string" && LEDGER_KINDS.has(raw as LedgerKind) ? (raw as LedgerKind) : "transfer";
}

export function sanitizeLedgerAsset(raw: unknown): string {
  if (typeof raw !== "string") return "USDT";
  const up = raw.trim().toUpperCase();
  return LEDGER_ASSETS.has(up) ? up : "USDT";
}

/** Strip markup from free-text notes before persistence (render still escapes). */
export function sanitizePlainNote(raw: unknown, max = 240): string {
  if (typeof raw !== "string") return "";
  return raw
    .slice(0, max)
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "");
}

/** Full chart settings clamp — blocks gridOpacity / scheme attribute XSS on import. */
export function sanitizeChartSettings(raw: Partial<ChartSettings> | Record<string, unknown> | undefined): ChartSettings {
  const d = DEFAULT_CHART_SETTINGS;
  const src = (raw ?? {}) as Record<string, unknown>;
  const schemeRaw = src.candleScheme;
  const scheme =
    typeof schemeRaw === "string" && CANDLE_SCHEMES.has(schemeRaw as CandleScheme)
      ? (schemeRaw as CandleScheme)
      : d.candleScheme;
  let gridOpacityRaw: number = d.gridOpacity;
  if (typeof src.gridOpacity === "number") {
    gridOpacityRaw = src.gridOpacity;
  } else if (typeof src.gridOpacity === "string" && src.gridOpacity.trim()) {
    gridOpacityRaw = Number(src.gridOpacity);
  }
  const gridOpacity = Number.isFinite(gridOpacityRaw)
    ? Math.min(0.2, Math.max(0.02, gridOpacityRaw))
    : d.gridOpacity;
  const indicators = { ...d.indicators };
  if (src.indicators && typeof src.indicators === "object") {
    for (const id of INDICATOR_IDS) {
      indicators[id] = !!(src.indicators as Record<string, unknown>)[id];
    }
  }
  return {
    candleScheme: scheme,
    candleStyle: sanitizeCandleStyle({
      ...d.candleStyle,
      ...(src.candleStyle as Partial<CandleStyle> | undefined),
    }),
    logScale: !!src.logScale,
    gridVisible: src.gridVisible !== undefined ? !!src.gridVisible : d.gridVisible,
    gridOpacity,
    bgGradient: src.bgGradient !== undefined ? !!src.bgGradient : d.bgGradient,
    indicators,
  };
}
