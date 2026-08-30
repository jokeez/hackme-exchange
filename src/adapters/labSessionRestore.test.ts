/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authSessionRestore,
  clearLabSessionMeta,
  getLabSessionMeta,
} from "./exchangeApi";
import { labSessionRestoreOrConnect } from "./labSessionRestore";

describe("authSessionRestore", () => {
  const prevFetch = globalThis.fetch;

  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = prevFetch;
    clearLabSessionMeta();
  });

  it("restores CSRF from active session cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          address: "HMC-65b60673d6ed884b",
          csrf_token: "csrf-restored",
        }),
      ),
    );
    sessionStorage.setItem("hackme-ex-lab-address", "HMC-65b60673d6ed884b");
    const res = await authSessionRestore(2_000, "http://127.0.0.1:18443");
    expect(res).toMatchObject({ ok: true, csrf_token: "csrf-restored" });
    expect(getLabSessionMeta()).toEqual({
      address: "HMC-65b60673d6ed884b",
      hasCsrf: true,
    });
  });

  it("leaves session stale when probe returns ok=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, note: "no cookie" })),
    );
    sessionStorage.setItem("hackme-ex-lab-address", "HMC-deadbeef");
    const res = await authSessionRestore(2_000, "http://127.0.0.1:18443");
    expect(res).toMatchObject({ ok: false });
    expect(getLabSessionMeta().hasCsrf).toBe(false);
  });
});

describe("labSessionRestoreOrConnect", () => {
  const prevFetch = globalThis.fetch;

  beforeEach(() => {
    clearLabSessionMeta();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = prevFetch;
    clearLabSessionMeta();
  });

  it("prefers session restore over fixture connect", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/session")) {
        return Response.json({
          ok: true,
          address: "HMC-65b60673d6ed884b",
          csrf_token: "csrf-fast",
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await labSessionRestoreOrConnect();
    expect(res).toEqual({
      ok: true,
      address: "HMC-65b60673d6ed884b",
      via: "session",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
