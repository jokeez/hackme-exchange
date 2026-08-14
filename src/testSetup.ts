/** Vitest setup — polyfill Web Crypto for @noble/ed25519 on Node ≤18. */
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  // @ts-expect-error Node 18 global crypto shim
  globalThis.crypto = webcrypto;
}
