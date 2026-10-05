import type { DemoState, FeeConfig, MarketSnapshot, OrderKind, PairId } from "./types";
import { DEFAULT_FEE_CONFIG } from "./types";
import { walletKeyForPair } from "./registry";
import { pairById } from "./pairs";
import { finiteNonNeg } from "./sanitize";

export type LiquidityRole = "maker" | "taker";
export { DEFAULT_FEE_CONFIG };
export type { FeeConfig };

export type VipTier = {
  name: string;
  makerBps: number;
  takerBps: number;
  minVolUsdt: number;
};

/**
 * Spot fee schedule — must match API `internal/fees/fees.go` (lab matching source of truth).
 * `FeeConfig.makerBps` / `takerBps` mirror Regular VIP for import display only — calcFee uses VIP_TIERS.
 */
export const VIP_TIERS: VipTier[] = [
  { name: "VIP 3", makerBps: 2, takerBps: 4, minVolUsdt: 10_000_000 },
  { name: "VIP 2", makerBps: 4, takerBps: 6, minVolUsdt: 1_000_000 },
  { name: "VIP 1", makerBps: 6, takerBps: 8, minVolUsdt: 100_000 },
  { name: "Regular", makerBps: 8, takerBps: 10, minVolUsdt: 0 },
];

/**
 * Soft-launch / lab: 30d USDT volume from GET /vip (whole USDT).
 * When set, VIP UI + calcFee use this instead of local paper trade history.
 */
let serverVipVolumeUsdt: number | null = null;

/** Apply server 30d volume (whole USDT). Pass null to fall back to local trades. */
export function setServerVipVolumeUsdt(volWholeUsdt: number | null): void {
  if (volWholeUsdt == null || !Number.isFinite(volWholeUsdt) || volWholeUsdt < 0) {
    serverVipVolumeUsdt = null;
    return;
  }
  serverVipVolumeUsdt = volWholeUsdt;
}

export function clearServerVipVolume(): void {
  serverVipVolumeUsdt = null;
}

export function hasServerVipVolume(): boolean {
  return serverVipVolumeUsdt != null;
}

export function getServerVipVolumeUsdt(): number | null {
  return serverVipVolumeUsdt;
}

/** Tier for an explicit 30d USDT volume (shared by paper + server paths). */
export function vipTierForVolume(volUsdt: number): VipTier {
  const vol = Number.isFinite(volUsdt) && volUsdt > 0 ? volUsdt : 0;
  for (const tier of VIP_TIERS) {
    if (vol >= tier.minVolUsdt) return tier;
  }
  return VIP_TIERS[VIP_TIERS.length - 1]!;
}

/** Clamp imported fee settings — blocks negative/zero-fee abuse via state import. */
export function sanitizeFeeConfig(raw: Partial<FeeConfig> | undefined): FeeConfig {
  const d = DEFAULT_FEE_CONFIG;
  const regular = VIP_TIERS[VIP_TIERS.length - 1]!;
  // M7: ignore imported maker/taker bps as fee knobs — pin to Regular VIP schedule.
  return {
    makerBps: regular.makerBps,
    takerBps: regular.takerBps,
    payFeesInHmc: !!raw?.payFeesInHmc,
    hmcDiscountPct: Math.min(25, Math.max(0, finiteNonNeg(raw?.hmcDiscountPct, d.hmcDiscountPct))),
  };
}

export function volume30dUsdt(state: DemoState, market?: MarketSnapshot | null): number {
  if (serverVipVolumeUsdt != null) return serverVipVolumeUsdt;
  const cutoff = Date.now() - 30 * 86_400_000;
  return state.trades
    .filter((t) => t.ts >= cutoff)
    .reduce((s, t) => {
      const q = t.amountQuote;
      if (!market) return s + q;
      if (t.pairId.endsWith("_USDT")) return s + q;
      if (t.pairId.endsWith("_BTC")) return s + q * market.btcUsd;
      if (t.pairId.endsWith("_SUP")) return s + q * market.supUsdt;
      return s + q;
    }, 0);
}

export function activeVipTier(state: DemoState, market?: MarketSnapshot | null): VipTier {
  return vipTierForVolume(volume30dUsdt(state, market));
}

export function liquidityRole(kind: OrderKind, triggered = false, immediateFill = false): LiquidityRole {
  if (kind === "market" || kind === "trailing_stop" || kind === "stop_market") return "taker";
  if (kind === "stop_limit" && triggered) return "taker";
  // OCO SL after stop trigger behaves like a stop (takes liquidity).
  if (kind === "oco" && triggered) return "taker";
  if ((kind === "limit" || kind === "oco") && immediateFill) return "taker";
  if (kind === "limit" || kind === "oco") return "maker";
  if (kind === "stop_limit") return "maker";
  return "taker";
}

export function previewFeeRole(kind: OrderKind): LiquidityRole {
  if (kind === "market" || kind === "trailing_stop" || kind === "stop_market") return "taker";
  if (kind === "stop_limit") return "maker";
  if (kind === "limit" || kind === "oco") return "maker";
  return "taker";
}

export type FeeQuote = {
  role: LiquidityRole;
  bps: number;
  feeQuote: number;
  feeHmc: number;
  paidInHmc: boolean;
  vipName: string;
  /** Echo of feeConfig when paidInHmc — for ledger/UI (not a second calc input). */
  hmcDiscountPct: number;
};

export function quoteAssetForPair(pairId: PairId): keyof DemoState["wallet"] {
  return walletKeyForPair(pairId, "quote");
}

export type CalcFeeOpts = {
  /**
   * Soft-launch: when false, preview/settle estimate skips HMC pay even if the
   * toggle is on (server will not honor until /health advertises hmc_fee_pay).
   * Omit on paper — paper always honors the local toggle.
   */
  honorPayFeesInHmc?: boolean;
};

export function calcFee(
  state: DemoState,
  m: MarketSnapshot,
  pairId: PairId,
  quoteAmount: number,
  role: LiquidityRole,
  opts?: CalcFeeOpts,
): FeeQuote {
  // Pass market so BTC/SUP quote volume converts to USDT for VIP (matches UI progress).
  // Soft-launch: volume30dUsdt prefers GET /vip when synced.
  const tier = activeVipTier(state, m);
  const bps = role === "maker" ? tier.makerBps : tier.takerBps;
  // Match server QuoteFee: ceil to 1e8-scale minor, then back to display.
  const feeQuoteMinor = Math.ceil(quoteAmount * bps * 1e8 / 10_000);
  const feeQuote = feeQuoteMinor / 1e8;

  const wantHmc =
    opts?.honorPayFeesInHmc !== undefined ? opts.honorPayFeesInHmc : state.feeConfig.payFeesInHmc;
  const payHmc = !!wantHmc && m.hmcUsdt > 0;

  if (payHmc) {
    const discount = Math.min(25, Math.max(0, Math.floor(state.feeConfig.hmcDiscountPct)));
    // Match API ApplyHMCDiscountPct: integer floor on quote minors.
    const discMinor = Math.trunc((feeQuoteMinor * (100 - discount)) / 100);
    const discounted = discMinor / 1e8;
    // Match API QuoteToHMC: ceil(discMinor * PriceScale / hmcMid).
    const hmcMidMinor = Math.round(m.hmcUsdt * 1e8);
    const feeHmcMinor =
      hmcMidMinor > 0 ? Math.floor((discMinor * 1e8 + hmcMidMinor - 1) / hmcMidMinor) : 0;
    return {
      role,
      bps,
      feeQuote: discounted,
      feeHmc: feeHmcMinor / 1e8,
      paidInHmc: true,
      vipName: tier.name,
      hmcDiscountPct: discount,
    };
  }

  return {
    role,
    bps,
    feeQuote,
    feeHmc: 0,
    paidInHmc: false,
    vipName: tier.name,
    hmcDiscountPct: 0,
  };
}

export function applyFeeToWallet(
  state: DemoState,
  pairId: PairId,
  fee: FeeQuote,
): { ok: true } | { ok: false; reason: string } {
  const due = fee.paidInHmc ? fee.feeHmc : fee.feeQuote;
  if (!(due > 0)) return { ok: true };
  if (fee.paidInHmc) {
    if (state.wallet.hmc < fee.feeHmc) {
      return { ok: false, reason: "Insufficient HMC for fee" };
    }
    state.wallet.hmc -= fee.feeHmc;
    return { ok: true };
  }
  const qk = quoteAssetForPair(pairId);
  if (state.wallet[qk] < fee.feeQuote) {
    return { ok: false, reason: `Insufficient ${pairById(pairId).quote} for fee` };
  }
  state.wallet[qk] -= fee.feeQuote;
  return { ok: true };
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(3)}%`;
}

export function feeScheduleLabel(state: DemoState, market?: MarketSnapshot | null): string {
  const tier = activeVipTier(state, market);
  const src = hasServerVipVolume() ? "desk VIP · server volume" : "demo VIP · local history";
  return `Maker ${formatBps(tier.makerBps)} · Taker ${formatBps(tier.takerBps)} · ${tier.name} (${src})`;
}

export function nextVipProgress(
  state: DemoState,
  market?: MarketSnapshot | null,
): {
  tier: VipTier;
  next: VipTier | null;
  vol: number;
  pct: number;
  remaining: number;
} {
  const vol = volume30dUsdt(state, market);
  const tier = activeVipTier(state, market);
  const ordered = [...VIP_TIERS].sort((a, b) => a.minVolUsdt - b.minVolUsdt);
  const idx = ordered.findIndex((t) => t.name === tier.name);
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  if (!next) return { tier, next: null, vol, pct: 100, remaining: 0 };
  const span = next.minVolUsdt - tier.minVolUsdt;
  const into = vol - tier.minVolUsdt;
  const pct = span > 0 ? Math.max(0, Math.min(100, (into / span) * 100)) : 100;
  return { tier, next, vol, pct, remaining: Math.max(0, next.minVolUsdt - vol) };
}
