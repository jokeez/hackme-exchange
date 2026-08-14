/**
 * Live lab custody path against loopback exchange-api.
 * Skips cleanly when API is down (CI / offline).
 *
 * Never sends admin token / never completes withdraw (ops CLI only).
 * Uses Node fetch + cookie jar (happy-dom CORS blocks loopback OPTIONS).
 *
 * @vitest-environment node
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.VITE_EXCHANGE_API_ORIGIN || "http://127.0.0.1:18443").replace(/\/$/, "");

/** Minimal cookie jar so session httpOnly cookies survive across Node fetches. */
function installCookieJarFetch(): () => void {
  const jar = new Map<string, string>();
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (jar.size) {
      headers.set(
        "Cookie",
        [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    }
    const next: RequestInit = { ...init, headers, mode: undefined, credentials: "omit" };
    const res = await orig(input, next);
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const single = res.headers.get("set-cookie");
    const lines = raw.length ? raw : single ? [single] : [];
    for (const line of lines) {
      const pair = line.split(";")[0] || "";
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return res;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
    jar.clear();
  };
}

async function apiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { headers: { Accept: "application/json" } });
    return res.ok;
  } catch {
    return false;
  }
}

describe("live lab custody e2e", () => {
  let restoreFetch: (() => void) | undefined;
  let mod: typeof import("./adapters/exchangeApi");
  let fixtureMod: typeof import("./adapters/labFixture");
  let integration: typeof import("./config/integration");
  let custody: typeof import("./labCustody");

  beforeAll(async () => {
    restoreFetch = installCookieJarFetch();
    mod = await import("./adapters/exchangeApi");
    fixtureMod = await import("./adapters/labFixture");
    integration = await import("./config/integration");
    custody = await import("./labCustody");
  });

  afterAll(() => {
    restoreFetch?.();
  });

  afterEach(() => {
    mod.clearLabSessionMeta();
  });

  async function ensureSession(): Promise<boolean> {
    if (!integration.isLabApiEnabled()) {
      console.warn("[skip] lab API not enabled in this build");
      return false;
    }
    if (!(await apiUp())) {
      console.warn("[skip] exchange-api not reachable at", BASE);
      return false;
    }
    const connected = await fixtureMod.labFixtureConnect();
    expect(connected.ok).toBe(true);
    return connected.ok;
  }

  it(
    "connect → mint → quote → withdraw request (pending only)",
    async () => {
      if (!(await ensureSession())) return;
      expect(integration.INTEGRATION.adminToken ?? "").toBe("");

      const before = await mod.fetchExchangeBalances(5_000, BASE);
      expect(before.ok).toBe(true);
      if (!before.ok) return;
      const hmcBefore = before.balances.find((b) => b.asset === "HMC")?.available ?? 0;

      const mintAmt = mod.displayToMinor(1);
      const mint = await mod.postLabDeposit(
        { asset: "HMC", amount: mintAmt, reason: "e2e_custody_mint" },
        8_000,
        BASE,
      );
      expect(mint.ok).toBe(true);
      if (!mint.ok) return;

      const wdAmt = mod.displayToMinor(0.05);
      const quote = await mod.fetchCustodyFees(
        { side: "withdraw", asset: "HMC", amount: wdAmt },
        5_000,
        BASE,
      );
      expect(quote.ok).toBe(true);
      if (!quote.ok) return;
      expect(quote.withdraw_enabled).toBe(true);
      expect(quote.quote).toBeTruthy();
      if (quote.quote) {
        expect(quote.quote.debit_total).toBe(quote.quote.receive + quote.quote.fee);
      }

      const me = fixtureMod.labFixtureIdentity().address;
      const dest = "HMC-ffffffffffffffff";
      expect(dest.toLowerCase()).not.toBe(me.toLowerCase());
      expect(custody.validateLabWithdrawDestination("HMC", dest).ok).toBe(true);

      const wd = await mod.requestWithdraw(
        { asset: "HMC", amount: wdAmt, destination: dest },
        8_000,
        BASE,
      );
      expect(wd.ok).toBe(true);
      if (!wd.ok) return;
      expect(wd.withdraw.status).toBe("pending");
      expect(wd.withdraw.status).not.toBe("completed");

      const listed = await mod.listWithdrawals(5_000, BASE);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.withdrawals.some((w) => w.id === wd.withdraw.id)).toBe(true);

      const after = await mod.fetchExchangeBalances(5_000, BASE);
      expect(after.ok).toBe(true);
      if (after.ok) {
        const hmc = after.balances.find((b) => b.asset === "HMC");
        if (hmc) {
          expect(hmc.available).toBeLessThanOrEqual(hmcBefore + mintAmt);
          expect(mod.minorToDisplay(hmc.available)).toBeGreaterThanOrEqual(0);
        }
      }
    },
    30_000,
  );

  it(
    "bridge USDT + reject bad SUP/HMC destinations",
    async () => {
      if (!(await ensureSession())) return;

      const credit = await mod.postLabBridgeCredit(
        { asset: "USDT", amount: mod.displayToMinor(10) },
        8_000,
        BASE,
      );
      expect(credit.ok).toBe(true);
      if (!credit.ok) return;
      expect(credit.balance_after).toBeGreaterThan(0);

      expect(custody.validateLabWithdrawDestination("SUP", "HMC-ffffffffffffffff").ok).toBe(false);
      expect(custody.validateLabWithdrawDestination("USDT", "<script>x</script>").ok).toBe(false);
      expect(custody.validateLabWithdrawDestination("HMC", "paper-usdt-ops-wallet-01").ok).toBe(false);

      const bad = await mod.requestWithdraw(
        {
          asset: "USDT",
          amount: mod.displayToMinor(1),
          destination: "HMC-ffffffffffffffff",
        },
        8_000,
        BASE,
      );
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.code === "invalid_destination" || bad.status === 400).toBe(true);
      }

      expect(custody.validateLabWithdrawDestination("USDT", "paper-usdt-ops-wallet-01").ok).toBe(true);
    },
    30_000,
  );
});
