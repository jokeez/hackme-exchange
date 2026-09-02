import type { MainView, PairId, Timeframe, Wallet } from "./types";
import { PAIRS } from "./pairs";
import { TIMEFRAMES } from "./types";

const PAIR_IDS = new Set(PAIRS.map((p) => p.id));
const TF_SET = new Set<string>(TIMEFRAMES);
const VIEWS = new Set<MainView>(["spot", "convert", "pool", "account"]);
const WALLET_KEYS = new Set<keyof Wallet>(["hmc", "sup", "usdt", "btc"]);
const ACCOUNT_SECTIONS = new Set(["deposit", "withdraw", "fees", "activity", "dust"]);

export type RouteHash = {
  view?: MainView;
  pair?: PairId;
  tf?: Timeframe;
  /** Account sub-section for deep links (#account/deposit). */
  section?: string;
  /** Convert asset keys (#convert/hmc/usdt). */
  convertFrom?: keyof Wallet;
  convertTo?: keyof Wallet;
  /** Pool worker lookup payout address (#pool/lookup/HMC-…). */
  poolAddress?: string;
};

function parseWalletKey(raw: string | undefined): keyof Wallet | undefined {
  const k = raw?.toLowerCase();
  if (k && WALLET_KEYS.has(k as keyof Wallet)) return k as keyof Wallet;
  return undefined;
}

/** Parse `#spot/HMC_USDT/15m`, `#convert/hmc/usdt`, `#pool/lookup/HMC-…`, `#account/deposit`. */
export function parseRouteHash(hash: string): RouteHash {
  const raw = (hash || "").replace(/^#/, "").trim();
  if (!raw) return {};
  const parts = raw.split("/").filter(Boolean);
  const out: RouteHash = {};
  let i = 0;
  if (parts[0] && VIEWS.has(parts[0] as MainView)) {
    out.view = parts[0] as MainView;
    i = 1;
  }

  if (out.view === "convert") {
    const from = parseWalletKey(parts[i]);
    const to = parseWalletKey(parts[i + 1]);
    if (from) out.convertFrom = from;
    if (to) out.convertTo = to;
    return out;
  }

  if (out.view === "account" && parts[i] && ACCOUNT_SECTIONS.has(parts[i]!)) {
    out.section = parts[i];
    return out;
  }

  if (out.view === "pool" && parts[i] === "lookup") {
    if (parts[i + 1]) out.poolAddress = decodeURIComponent(parts[i + 1]!);
    return out;
  }

  if (parts[i] && PAIR_IDS.has(parts[i] as PairId)) {
    out.pair = parts[i] as PairId;
    i += 1;
  }
  if (parts[i] && TF_SET.has(parts[i])) {
    out.tf = parts[i] as Timeframe;
  }
  return out;
}

export function formatRouteHash(view: MainView, pair: PairId, tf: Timeframe): string {
  if (view === "spot") return `#${view}/${pair}/${tf}`;
  return `#${view}`;
}

export function formatAccountSectionHash(section: string): string {
  return `#account/${section}`;
}

export function formatConvertPairHash(from: keyof Wallet, to: keyof Wallet): string {
  return `#convert/${from}/${to}`;
}

export function formatPoolLookupHash(address: string): string {
  return `#pool/lookup/${encodeURIComponent(address.trim())}`;
}

export function writeRouteHash(view: MainView, pair: PairId, tf: Timeframe): void {
  if (typeof location === "undefined") return;
  const next = formatRouteHash(view, pair, tf);
  if (location.hash !== next) {
    history.replaceState(null, "", next);
  }
}
