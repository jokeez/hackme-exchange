/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { parseWalletLoginHash, walletLoginUrl, DEFAULT_WALLET_LOGIN_URL } from "./walletLogin";

const id = "0b6f3f0e-6c3a-4c4e-9a54-6a5d1f1c2b3a";
const addr = "HMC-0123456789abcdef";
const pub = "ab".repeat(32);
const sig = "cd".repeat(64);

describe("wallet login fragment", () => {
  it("parses a well-formed v1 fragment", () => {
    expect(parseWalletLoginHash(`#hm-login=v1.${id}.${addr}.${pub}.${sig}`)).toEqual({
      challengeId: id, address: addr, pubkeyHex: pub, sigHex: sig,
    });
  });
  it("accepts a long address and other fragment params", () => {
    const long = "HMC-" + "ef".repeat(32);
    expect(parseWalletLoginHash(`#x=1&hm-login=v1.${id}.${long}.${pub}.${sig}`)?.address).toBe(long);
  });
  it("rejects anything malformed", () => {
    for (const bad of [
      "", "#", `#hm-login=v2.${id}.${addr}.${pub}.${sig}`, `#hm-login=v1.${id}.${addr}.${pub}`,
      `#hm-login=v1.not-a-uuid.${addr}.${pub}.${sig}`, `#hm-login=v1.${id}.HMC-xyz.${pub}.${sig}`,
      `#hm-login=v1.${id}.${addr}.${pub}.${sig}<script>`,
    ]) {
      expect(parseWalletLoginHash(bad)).toBeNull();
    }
  });
});

describe("wallet login URL", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to the local dashboard and only accepts loopback overrides", () => {
    expect(walletLoginUrl()).toBe(DEFAULT_WALLET_LOGIN_URL);
    localStorage.setItem("hackme.walletLogin.url.v1", "http://127.0.0.1:18090/exchange-login");
    expect(walletLoginUrl()).toBe("http://127.0.0.1:18090/exchange-login");
    localStorage.setItem("hackme.walletLogin.url.v1", "https://evil.example/exchange-login");
    expect(walletLoginUrl()).toBe(DEFAULT_WALLET_LOGIN_URL);
  });
});
