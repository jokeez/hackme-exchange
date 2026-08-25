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
  const vol = volume30dUsdt(state, market);
  for (const tier of VIP_TIERS) {
    if (vol >= tier.minVolUsdt) return tier;
  }
  return VIP_TIERS[VIP_TIERS.length - 1];
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

export function calcFee(
  state: DemoState,
  m: MarketSnapshot,
  pairId: PairId,
  quoteAmount: number,
  role: LiquidityRole,
): FeeQuote {
  // Pass market so BTC/SUP quote volume converts to USDT for VIP (matches UI progress).
  const tier = activeVipTier(state, m);
  const bps = role === "maker" ? tier.makerBps : tier.takerBps;
  // Match server QuoteFee: ceil to 1e8-scale minor, then back to display.
  let feeQuote = Math.ceil(quoteAmount * (bps / 10_000) * 1e8) / 1e8;

  if (state.feeConfig.payFeesInHmc && m.hmcUsdt > 0) {
    const discount = state.feeConfig.hmcDiscountPct;
    // M5: ceil discounted quote + HMC conversion to 1e8 (same as quote fee path).
    const discounted = Math.ceil(feeQuote * (1 - discount / 100) * 1e8) / 1e8;
    const feeHmc = Math.ceil((discounted / m.hmcUsdt) * 1e8) / 1e8;
    return {
      role,
      bps,
      feeQuote: discounted,
      feeHmc,
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
  return `Maker ${formatBps(tier.makerBps)} · Taker ${formatBps(tier.takerBps)} · ${tier.name} (demo VIP · local history)`;
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
