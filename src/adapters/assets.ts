import type { Wallet } from "../types";

/** How balances are settled in production — demo uses localStorage for all. */
export type SettlementKind =
  | "on_chain" /** HackMe node: HMC, SUP */
  | "bridge" /** External price feed + custodial/CEX bridge: USDT, BTC */
  | "external_chain" /** Future: Monero, etc. */
  | "demo_only"; /** Paper balance until backend exists */

export type WalletAssetId = keyof Wallet;

export type AssetDefinition = {
  id: WalletAssetId;
  symbol: string;
  name: string;
  settlement: SettlementKind;
  decimals: number;
  /** HackMe node GET field(s) when on_chain */
  nodeBalanceField?: string;
  /** Shown in exchange demo + future dashboard wallet tab */
  exchangeEnabled: boolean;
  walletTabPlanned: boolean;
  /** Deep link hash on dashboard.html */
  walletHash?: string;
  notes?: string;
};

/** Single registry for assets — extend here for USDT/BTC/XMR wallet tabs. */
export const ASSET_REGISTRY: AssetDefinition[] = [
  {
    id: "hmc",
    symbol: "HMC",
    name: "HackMe Coin",
    settlement: "on_chain",
    decimals: 8,
    nodeBalanceField: "balance_display_hmc",
    exchangeEnabled: true,
    walletTabPlanned: true,
    walletHash: "wallet",
    notes: "transfer_v1 via POST /api/tx/send · min fee 1000 Kapa",
  },
  {
    id: "sup",
    symbol: "SUP",
    name: "Superior Companion",
    settlement: "on_chain",
    decimals: 8,
    nodeBalanceField: "balance_sup",
    exchangeEnabled: true,
    walletTabPlanned: true,
    walletHash: "wallet",
    notes: "POST /api/sup/tx/send · mint after pool accrual",
  },
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    settlement: "bridge",
    decimals: 6,
    exchangeEnabled: true,
    walletTabPlanned: true,
    walletHash: "wallet",
    notes: "Phase 2: custodial or stablecoin gateway · demo paper only",
  },
  {
    id: "btc",
    symbol: "BTC",
    name: "Bitcoin",
    settlement: "bridge",
    decimals: 8,
    exchangeEnabled: true,
    walletTabPlanned: true,
    walletHash: "wallet",
    notes: "Phase 2: watch-only or CEX deposit address · oracle ref price in demo",
  },
];

/** Planned assets — extend Wallet + ASSET_REGISTRY when backend ready */
export type PlannedAsset = Omit<AssetDefinition, "id"> & { id: string };

export const PLANNED_ASSETS: PlannedAsset[] = [
  {
    id: "xmr",
    symbol: "XMR",
    name: "Monero",
    settlement: "external_chain",
    decimals: 12,
    exchangeEnabled: false,
    walletTabPlanned: true,
    walletHash: "wallet",
    notes: "Phase 3: monero-wallet-rpc or custodial · privacy pair XMR_USDT optional",
  },
];

export function assetById(id: WalletAssetId): AssetDefinition {
  return ASSET_REGISTRY.find((a) => a.id === id) ?? ASSET_REGISTRY[0];
}

export function onChainAssets(): AssetDefinition[] {
  return ASSET_REGISTRY.filter((a) => a.settlement === "on_chain");
}

export function tradableQuoteAssets(): AssetDefinition[] {
  return ASSET_REGISTRY.filter((a) => a.id === "usdt" || a.id === "btc");
}
