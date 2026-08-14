import type { MarketSnapshot, PairId, PairMeta, Wallet } from "./types";

/** Single source of truth for tradable pairs — add new coins here only. */
export type RegistryPair = PairMeta & {
  midPrice: (m: MarketSnapshot) => number;
  baseWallet: keyof Wallet;
  quoteWallet: keyof Wallet;
  bookStepPreset: "micro" | "cross" | "btc";
};

const REGISTRY: RegistryPair[] = [
  {
    id: "HMC_USDT",
    base: "HMC",
    quote: "USDT",
    label: "HMC / USDT",
    tag: "Primary · Pool oracle",
    lane: "primary",
    decimals: 8,
    color: "#4de4ff",
    midPrice: (m) => m.hmcUsdt,
    baseWallet: "hmc",
    quoteWallet: "usdt",
    bookStepPreset: "micro",
  },
  {
    id: "SUP_USDT",
    base: "SUP",
    quote: "USDT",
    label: "SUP / USDT",
    tag: "Companion",
    lane: "companion",
    decimals: 8,
    color: "#6effad",
    midPrice: (m) => m.supUsdt,
    baseWallet: "sup",
    quoteWallet: "usdt",
    bookStepPreset: "micro",
  },
  {
    id: "HMC_SUP",
    base: "HMC",
    quote: "SUP",
    label: "HMC / SUP",
    tag: "Ecosystem cross",
    lane: "cross",
    decimals: 4,
    color: "#9bb8d4",
    midPrice: (m) => m.hmcSup,
    baseWallet: "hmc",
    quoteWallet: "sup",
    bookStepPreset: "cross",
  },
  {
    id: "HMC_BTC",
    base: "HMC",
    quote: "BTC",
    label: "HMC / BTC",
    tag: "PoW bridge",
    lane: "btc",
    decimals: 10,
    color: "#f7931a",
    midPrice: (m) => m.hmcBtc,
    baseWallet: "hmc",
    quoteWallet: "btc",
    bookStepPreset: "btc",
  },
  {
    id: "SUP_BTC",
    base: "SUP",
    quote: "BTC",
    label: "SUP / BTC",
    tag: "Companion BTC",
    lane: "btc",
    decimals: 10,
    color: "#6effad",
    midPrice: (m) => m.supBtc,
    baseWallet: "sup",
    quoteWallet: "btc",
    bookStepPreset: "btc",
  },
];

const byId = new Map<PairId, RegistryPair>(REGISTRY.map((p) => [p.id, p]));

export function allPairs(): readonly RegistryPair[] {
  return REGISTRY;
}

export function getPair(id: PairId): RegistryPair {
  return byId.get(id) ?? REGISTRY[0];
}

export function pairMeta(id: PairId): PairMeta {
  const { midPrice: _m, baseWallet: _b, quoteWallet: _q, bookStepPreset: _s, ...meta } = getPair(id);
  return meta;
}

export function midForPairId(m: MarketSnapshot, id: PairId): number {
  return getPair(id).midPrice(m);
}

export function walletKeyForPair(id: PairId, leg: "base" | "quote"): keyof Wallet {
  const p = getPair(id);
  return leg === "base" ? p.baseWallet : p.quoteWallet;
}

export function isValidPairId(id: string): id is PairId {
  return byId.has(id as PairId);
}
