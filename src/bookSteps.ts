import type { PairId } from "./types";
import { getPair } from "./registry";

export type BookStep = { label: string; value: number };

const PRESETS: Record<"micro" | "cross" | "btc", BookStep[]> = {
  micro: [
    { label: "Auto", value: 0 },
    { label: "0.00000001", value: 0.00000001 },
    { label: "0.0000001", value: 0.0000001 },
    { label: "0.000001", value: 0.000001 },
    { label: "0.00001", value: 0.00001 },
    { label: "0.0001", value: 0.0001 },
    { label: "0.001", value: 0.001 },
  ],
  cross: [
    { label: "Auto", value: 0 },
    { label: "0.0001", value: 0.0001 },
    { label: "0.001", value: 0.001 },
    { label: "0.01", value: 0.01 },
    { label: "0.1", value: 0.1 },
    { label: "1", value: 1 },
  ],
  btc: [
    { label: "Auto", value: 0 },
    { label: "0.000000000001", value: 1e-12 },
    { label: "0.00000000001", value: 1e-11 },
    { label: "0.0000000001", value: 1e-10 },
    { label: "0.000000001", value: 1e-9 },
  ],
};

export function bookStepsForPair(pairId: PairId): BookStep[] {
  return PRESETS[getPair(pairId).bookStepPreset];
}
