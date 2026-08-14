import { describe, expect, it } from "vitest";
import { roundToTick, tickInputValue } from "./tick";

describe("tick", () => {
  it("rounds HMC_USDT to 8 decimals", () => {
    expect(roundToTick(0.00041177652319212107, "HMC_USDT")).toBeCloseTo(0.00041178, 8);
    expect(tickInputValue(0.00041177652319212107, "HMC_USDT")).toBe("0.00041178");
  });

  it("keeps BTC pair precision", () => {
    const v = tickInputValue(6.4123456789e-9, "HMC_BTC");
    expect(v.split(".")[1]?.length ?? 0).toBe(10);
  });
});
