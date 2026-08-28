import { describe, expect, it } from "vitest";
import { renderOracleSettingsModal } from "./oracleSettings";

describe("oracleSettings modal", () => {
  it("renders accessible dialog with anchor value and action labels", () => {
    const html = renderOracleSettingsModal(0.042);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="oracle-settings-title"');
    expect(html).toContain('id="oracle-settings-desc"');
    expect(html).toContain('value="0.042"');
    expect(html).toContain('aria-label="Cancel oracle settings"');
    expect(html).toContain('aria-label="Apply oracle anchor"');
    expect(html).toContain('for="anchor-inp"');
  });

  it("falls back to D0 default for invalid anchor", () => {
    const html = renderOracleSettingsModal(0);
    expect(html).toContain('value="0.05"');
  });
});
