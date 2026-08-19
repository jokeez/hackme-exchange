import type { MarketSnapshot, PairId, PairMeta, Wallet } from "./types";

/**
 * Single source of truth for tradable pairs and asset USD pricing model.
 * Goal: adding a new pair/coin should not require hunting hardcoded mid logic.
 */
export type RegistryAsset = {
  id: string;
  usdPrice: (m: Omit<MarketSnapshot, "assetUsd">) => number;
};

export type RegistryPair = PairMeta & {
  // Wallet keys are optional because this registry is also used for chart-only pairs.
  // If wallet support is added later, these fields can be filled for the new asset(s).
  baseWallet?: keyof Wallet;
  quoteWallet?: keyof Wallet;
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
    baseWallet: "sup",
    quoteWallet: "btc",
    bookStepPreset: "btc",
  },
];

const ASSETS: RegistryAsset[] = [
  { id: "HMC", usdPrice: (m) => m.hmcUsdt },
  { id: "SUP", usdPrice: (m) => m.supUsdt },
  // Demo assumes USDT is pegged to USD.
  { id: "USDT", usdPrice: () => 1 },
  { id: "BTC", usdPrice: (m) => m.btcUsd },
];

const byId = new Map<PairId, RegistryPair>(REGISTRY.map((p) => [p.id, p]));

export function allPairs(): readonly RegistryPair[] {
  return REGISTRY;
}

export function getPair(id: PairId): RegistryPair {
  return byId.get(id) ?? REGISTRY[0];
}

export function pairMeta(id: PairId): PairMeta {
  const { baseWallet: _b, quoteWallet: _q, bookStepPreset: _s, ...meta } = getPair(id);
  return meta;
}

export function midForPairId(m: MarketSnapshot, id: PairId): number {
  const p = getPair(id);
  // Some unit tests use a partial/oracle snapshot without `assetUsd`.
  // Keep a safe fallback for the classic demo assets.
  const assetUsd =
    m.assetUsd ??
    ({
      HMC: m.hmcUsdt,
      SUP: m.supUsdt,
      USDT: 1,
      BTC: m.btcUsd,
    } as Record<string, number>);
  const base = assetUsd[p.base] ?? 0;
  const quote = assetUsd[p.quote] ?? 1;
  if (!Number.isFinite(base) || !Number.isFinite(quote) || quote === 0) return 0;
  return base / quote;
}

export function walletKeyForPair(id: PairId, leg: "base" | "quote"): keyof Wallet {
  const p = getPair(id);
  const fallback: Record<"base" | "quote", keyof Wallet> = { base: "hmc", quote: "usdt" };
  return (leg === "base" ? p.baseWallet : p.quoteWallet) ?? fallback[leg];
}

export function isValidPairId(id: string): id is PairId {
  return byId.has(id as PairId);
}

export function computeAssetUsd(m: Omit<MarketSnapshot, "assetUsd">): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of ASSETS) {
    const v = a.usdPrice(m);
    out[a.id] = Number.isFinite(v) ? v : 0;
  }
  return out;
}
