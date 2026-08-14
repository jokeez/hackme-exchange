import { allPairs, getPair, pairMeta } from "./registry";
import type { PairId, PairMeta } from "./types";

export const PAIRS: PairMeta[] = allPairs().map((p) => pairMeta(p.id));

export function pairById(id: PairId): PairMeta {
  return pairMeta(id);
}

export function pairRegistry(id: PairId) {
  return getPair(id);
}

export const LANES = [
  { id: "primary", label: "HMC" },
  { id: "companion", label: "SUP" },
  { id: "cross", label: "Cross" },
  { id: "btc", label: "BTC" },
] as const;
