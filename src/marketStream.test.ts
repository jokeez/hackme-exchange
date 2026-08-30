import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMarketStream } from "./adapters/marketStream";

describe("marketStream", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts in local transport for paper mode", async () => {
    const events: string[] = [];
    const stream = createMarketStream(
      { onEvent: (ev) => events.push(ev.type) },
      {
        getActivePair: () => "HMC_USDT",
        isSpotView: () => true,
        useLab: () => false,
      },
    );
    stream.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(stream.getTransport()).toBe("local");
    stream.notifyLocalBookTape();
    expect(events).toContain("book");
    expect(events).toContain("tape");
    stream.stop();
    expect(stream.getTransport()).toBe("idle");
  });
});
