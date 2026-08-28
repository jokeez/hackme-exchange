/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { oracleStatusKind, oracleStatusLabel, oracleAgeSec, patchOracleStatusDom, renderOracleStatusHtml } from "./oracleStatus";

describe("oracleStatus", () => {
  const now = 1_700_000_000_000;

  it("classifies live / fallback / stale / offline", () => {
    expect(
      oracleStatusKind({ source: "live", fetchedAt: now - 5000, poolStatus: "ok" }, now),
    ).toBe("live");
    expect(
      oracleStatusKind({ source: "fallback", fetchedAt: now, poolStatus: "ok" }, now),
    ).toBe("fallback");
    expect(
      oracleStatusKind({ source: "live", fetchedAt: now - 20_000, poolStatus: "ok" }, now),
    ).toBe("stale");
    expect(
      oracleStatusKind({ source: "live", fetchedAt: now, poolStatus: "offline" }, now),
    ).toBe("offline");
  });

  it("renders status HTML with retry control", () => {
    const html = renderOracleStatusHtml(
      { source: "live", fetchedAt: now - 3000, poolStatus: "ok" },
      now,
    );
    expect(html).toContain('class="oracle-status live"');
    expect(html).toContain("Oracle live");
    expect(html).toContain('id="btn-oracle-retry"');
    expect(html).toContain('role="status"');
  });

  it("label includes age for stale feed", () => {
    expect(
      oracleStatusLabel({ source: "live", fetchedAt: now - 15_000, poolStatus: "ok" }, now),
    ).toMatch(/stale · 15s/);
  });

  it("oracleAgeSec ticks from fetchedAt", () => {
    expect(oracleAgeSec({ source: "live", fetchedAt: now - 3500, poolStatus: "ok" }, now)).toBe(3);
    expect(oracleAgeSec({ source: "live", fetchedAt: 0, poolStatus: "ok" }, now)).toBeNull();
  });

  it("patchOracleStatusDom updates label in place", () => {
    const root = document.createElement("div");
    root.innerHTML = renderOracleStatusHtml(
      { source: "live", fetchedAt: now - 2000, poolStatus: "ok" },
      now,
    );
    expect(patchOracleStatusDom(root, { source: "live", fetchedAt: now - 5000, poolStatus: "ok" }, now)).toBe(true);
    expect(root.querySelector(".oracle-label")?.textContent).toMatch(/live · 5s/);
    expect(root.querySelector(".oracle-status")?.classList.contains("live")).toBe(true);
    expect(root.querySelector("#btn-oracle-retry")).toBeTruthy();
  });
});
