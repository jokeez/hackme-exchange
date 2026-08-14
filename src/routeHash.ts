import type { MainView, PairId, Timeframe } from "./types";
import { PAIRS } from "./pairs";
import { TIMEFRAMES } from "./types";

const PAIR_IDS = new Set(PAIRS.map((p) => p.id));
const TF_SET = new Set<string>(TIMEFRAMES);
const VIEWS = new Set<MainView>(["spot", "convert", "pool", "account"]);

export type RouteHash = {
  view?: MainView;
  pair?: PairId;
  tf?: Timeframe;
};

/** Parse `#spot/HMC_USDT/15m` or `#HMC_USDT/15m` or `#convert`. */
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

export function writeRouteHash(view: MainView, pair: PairId, tf: Timeframe): void {
  if (typeof location === "undefined") return;
  const next = formatRouteHash(view, pair, tf);
  if (location.hash !== next) {
    history.replaceState(null, "", next);
  }
}
