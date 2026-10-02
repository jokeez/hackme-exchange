import { isHubEmbed, postHubRoute } from "./embed";
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

export type RouteHashWriteContext = {
  view: MainView;
  pair: PairId;
  tf: Timeframe;
  convertFrom?: keyof Wallet;
  convertTo?: keyof Wallet;
  accountSection?: string;
  poolAddress?: string;
};

function parseWalletKey(raw: string | undefined): keyof Wallet | undefined {
  const k = raw?.toLowerCase();
  if (k && WALLET_KEYS.has(k as keyof Wallet)) return k as keyof Wallet;
  return undefined;
}

/** Aliases used by hub / marketing links → SPA main views. */
const VIEW_ALIASES: Record<string, MainView> = {
  wallet: "account",
  login: "account",
  hub: "account",
  settings: "account",
  funds: "account",
  deposit: "account",
  withdraw: "account",
  trade: "spot",
  market: "spot",
  swap: "convert",
};

/** Parse `#spot/HMC_USDT/15m`, `#convert/hmc/usdt`, `#pool/lookup/HMC-…`, `#account/deposit`, `#wallet`. */
export function parseRouteHash(hash: string): RouteHash {
  const raw = (hash || "").replace(/^#/, "").trim();
  if (!raw) return {};
  // Strip query (?focus=…) — hub wallet links sometimes append params.
  const pathOnly = raw.split("?")[0] ?? raw;
  const parts = pathOnly.split("/").filter(Boolean);
  const out: RouteHash = {};
  let i = 0;
  const head = parts[0]?.toLowerCase() ?? "";
  if (parts[0] && VIEWS.has(parts[0] as MainView)) {
    out.view = parts[0] as MainView;
    i = 1;
  } else if (head && VIEW_ALIASES[head]) {
    out.view = VIEW_ALIASES[head]!;
    i = 1;
    // #deposit / #withdraw / #wallet/deposit → account section
    if (head === "deposit" || head === "withdraw" || head === "funds") {
      out.section = head === "funds" ? "deposit" : head;
    } else if (parts[1] && ACCOUNT_SECTIONS.has(parts[1]!)) {
      out.section = parts[1];
    } else if (head === "login" || head === "hub" || head === "wallet" || head === "settings") {
      out.section = "deposit";
    }
  }

  if (out.view === "convert") {
    const from = parseWalletKey(parts[i]);
    const to = parseWalletKey(parts[i + 1]);
    if (from) out.convertFrom = from;
    if (to) out.convertTo = to;
    return out;
  }

  if (out.view === "account") {
    if (parts[i] && ACCOUNT_SECTIONS.has(parts[i]!)) out.section = parts[i];
    return out;
  }

  if (out.view === "pool") {
    if (parts[i] === "lookup" && parts[i + 1]) {
      out.poolAddress = decodeURIComponent(parts[i + 1]!);
    }
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
  return buildRouteHash({ view, pair, tf });
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

/** Build location hash for the current view, preserving view-specific deep-link segments. */
export function buildRouteHash(ctx: RouteHashWriteContext): string {
  if (ctx.view === "spot") return `#spot/${ctx.pair}/${ctx.tf}`;
  if (ctx.view === "convert") {
    if (ctx.convertFrom && ctx.convertTo && ctx.convertFrom !== ctx.convertTo) {
      return formatConvertPairHash(ctx.convertFrom, ctx.convertTo);
    }
    return "#convert";
  }
  if (ctx.view === "account") {
    if (ctx.accountSection && ACCOUNT_SECTIONS.has(ctx.accountSection)) {
      return formatAccountSectionHash(ctx.accountSection);
    }
    return "#account";
  }
  if (ctx.view === "pool") {
    if (ctx.poolAddress?.trim()) return formatPoolLookupHash(ctx.poolAddress);
    return "#pool";
  }
  return `#${ctx.view}`;
}

export function writeRouteHash(ctx: RouteHashWriteContext): void {
  if (typeof location === "undefined") return;
  const next = buildRouteHash(ctx);
  if (location.hash !== next) {
    history.replaceState(null, "", next);
  }
  // Hub iframe: keep parent Pop out / restore in sync with pair+TF.
  if (isHubEmbed()) postHubRoute(next);
}
