import { describe, expect, it } from "vitest";
import { bookStepsForPair } from "./bookSteps";

describe("bookStepsForPair", () => {
  it("micro preset for USDT pairs", () => {
    const steps = bookStepsForPair("HMC_USDT");
    expect(steps[0]).toEqual({ label: "Auto", value: 0 });
    expect(steps.some((s) => s.value === 0.0001)).toBe(true);
    expect(steps.every((s) => s.value <= 0.001 || s.value === 0)).toBe(true);
  });

  it("cross preset for HMC_SUP", () => {
    const steps = bookStepsForPair("HMC_SUP");
    expect(steps.some((s) => s.value === 1)).toBe(true);
    expect(steps.some((s) => s.value === 0.01)).toBe(true);
  });

  it("btc preset uses tiny steps", () => {
    const steps = bookStepsForPair("HMC_BTC");
    expect(steps.some((s) => s.value === 1e-12)).toBe(true);
    expect(Math.max(...steps.map((s) => s.value))).toBeLessThanOrEqual(1e-9);
  });

  it("SUP_BTC also uses btc preset", () => {
    expect(bookStepsForPair("SUP_BTC").some((s) => s.label === "0.0000000001")).toBe(true);
  });
});
