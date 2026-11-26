/** Vitest setup — polyfill Web Crypto for @noble/ed25519 on Node ≤18. */
import { afterEach, vi } from "vitest";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  // @ts-expect-error Node 18 global crypto shim
  globalThis.crypto = webcrypto;
}

/** Fake timers + Date.now spies leak across files under full-suite load and hang ensureCandles. */
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
