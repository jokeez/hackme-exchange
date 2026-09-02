import { escapeHtml } from "./sanitize";

/** Lucide-style inline icons — one stroke weight for the whole terminal. */
const SW = 1.5;

function svg(body: string, size = 14): string {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const Ico = {
  clock: () => svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  activity: () => svg(`<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>`),
  list: () => svg(`<path d="M4 6h16M4 12h16M4 18h16"/>`),
  layers: () => svg(`<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>`),
  settings: () =>
    svg(
      `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
    ),
  camera: () =>
    svg(
      `<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>`,
    ),
  layout: () => svg(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`),
  square: () => svg(`<rect x="5" y="5" width="14" height="14" rx="1"/>`),
  maximize: () => svg(`<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>`),
  /** Corners inward — exit chart fullscreen. */
  minimize: () => svg(`<path d="M8 3v3H5M16 3v3h3M8 21v-3H5M16 21v-3h3"/>`),
  candlestick: () =>
    svg(
      `<path d="M8 4v3M8 17v3M16 2v4M16 16v6"/><rect x="6" y="7" width="4" height="10" rx="0.5"/><rect x="14" y="6" width="4" height="10" rx="0.5"/>`,
    ),
  chartLine: () => svg(`<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/>`),
  mousePointer: () => svg(`<path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/>`),
  minus: () => svg(`<path d="M5 12h14"/>`),
  trendUp: () => svg(`<path d="M3 17 9 11l4 4 8-8"/><path d="M14 7h7v7"/>`),
  fib: () => svg(`<path d="M4 5h16M4 9h16M4 14h16M4 19h16"/>`),
  vline: () => svg(`<path d="M12 3v18"/>`),
  cross: () => svg(`<path d="M4 12h16M12 4v16"/>`),
  ray: () => svg(`<path d="M4 18 14 8"/><path d="M14 8h6M14 8v6"/>`),
  typeA: () => svg(`<path d="M4 20 12 4l8 16"/><path d="M7.5 14h9"/>`),
  ruler: () => svg(`<path d="M21.3 8.7 8.7 21.3a2.4 2.4 0 0 1-3.4 0L2.7 18.7a2.4 2.4 0 0 1 0-3.4L15.3 2.7a2.4 2.4 0 0 1 3.4 0l2.6 2.6a2.4 2.4 0 0 1 0 3.4Z"/><path d="m14.5 7.5 2 2M11 11l2 2M7.5 14.5l2 2"/>`),
  trash: () => svg(`<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>`),
  lock: () => svg(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
  chevronDown: () => svg(`<path d="m6 9 6 6 6-6"/>`, 12),
  chevronRight: () => svg(`<path d="m9 6 6 6-6 6"/>`, 12),
  eye: () => svg(`<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`),
  eyeOff: () =>
    svg(
      `<path d="m2 2 20 20"/><path d="M6.7 6.7C4.1 8.5 2 12 2 12s3 7 10 7c1.8 0 3.4-.5 4.8-1.2"/><path d="M17.3 17.3C19.9 15.5 22 12 22 12s-3-7-10-7c-1.8 0-3.4.5-4.8 1.2"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/>`,
    ),
  search: () => svg(`<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`),
  swap: () => svg(`<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>`),
  more: () => svg(`<circle cx="12" cy="5" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.25" fill="currentColor" stroke="none"/>`),
} as const;

/** Bump when coin art changes — busts CDN cache on exchange.hackme.tech. */
const COIN_ICON_REV = 4;

const COIN_ICON_SRC: Record<string, string> = {
  HMC: `/logo-hex.png?v=${COIN_ICON_REV}`,
  USDT: `/assets/coins/usdt.png?v=${COIN_ICON_REV}`,
  BTC: `/assets/coins/btc.png?v=${COIN_ICON_REV}`,
  SUP: `/assets/coins/sup.svg?v=${COIN_ICON_REV}`,
};

const COIN_ICON_CLASS: Record<string, string> = {
  HMC: "asset-hmc asset-hmc-logo",
  USDT: "asset-usdt asset-coin-logo",
  BTC: "asset-btc asset-coin-logo",
  SUP: "asset-sup asset-coin-logo",
};

function coinLogoBadge(symbol: string, src: string, extraClass = "", size = 16): string {
  const key = symbol.toUpperCase();
  const cls = COIN_ICON_CLASS[key] ?? "asset-unk asset-coin-logo";
  const lg = extraClass.includes("asset-ico-lg");
  const px = lg ? 32 : size;
  return `<span class="asset-ico ${cls} ${extraClass}" title="${escapeHtml(key)}" aria-hidden="true"><img src="${src}" alt="" width="${px}" height="${px}" decoding="async" loading="lazy" /></span>`;
}

/** Markets list: one badge for the base asset only (no USDT/BTC stack). */
export function assetBadge(symbol: string): string {
  const key = symbol.toUpperCase();
  const src = COIN_ICON_SRC[key];
  if (src) return coinLogoBadge(key, src);
  const mark = escapeHtml(key.slice(0, 1) || "?");
  return `<span class="asset-ico asset-unk" title="${escapeHtml(key)}" aria-hidden="true">${mark}</span>`;
}

/** Account / wallet tables — crisp 32px coin art (no squeeze). */
export function assetBadgeLg(symbol: string): string {
  const key = symbol.toUpperCase();
  const src = COIN_ICON_SRC[key];
  if (src) return coinLogoBadge(key, src, "asset-ico-lg");
  const mark = escapeHtml(key.slice(0, 1) || "?");
  return `<span class="asset-ico asset-ico-lg asset-unk" title="${escapeHtml(key)}" aria-hidden="true">${mark}</span>`;
}

/** Pair row icon — base coin only (HMC or SUP), never quote $.₿ */
export function pairAssetIcons(base: string, _quote?: string): string {
  return `<span class="pair-icons" aria-hidden="true">${assetBadge(base)}</span>`;
}

export type DrawIconId =
  | "cursor"
  | "hline"
  | "vline"
  | "cross"
  | "trend"
  | "ray"
  | "fib"
  | "rect"
  | "text"
  | "measure"
  | "clear"
  | "lock";

export function drawToolIcon(id: DrawIconId): string {
  switch (id) {
    case "cursor":
      return Ico.mousePointer();
    case "hline":
      return Ico.minus();
    case "vline":
      return Ico.vline();
    case "cross":
      return Ico.cross();
    case "trend":
      return Ico.trendUp();
    case "ray":
      return Ico.ray();
    case "fib":
      return Ico.fib();
    case "rect":
      return Ico.square();
    case "text":
      return Ico.typeA();
    case "measure":
      return Ico.ruler();
    case "clear":
      return Ico.trash();
    case "lock":
      return Ico.lock();
  }
}
