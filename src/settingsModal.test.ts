/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { renderUnifiedSettingsModal, showUnifiedSettingsModal } from "./settingsModal";
import { baseState } from "./testFixtures";
import { LAYOUT_DEFAULTS } from "./layoutPrefs";

describe("Settings → Wallet pane", () => {
  it("renders HOLD badges, session controls, and desk widgets when Connect is on", () => {
    const html = renderUnifiedSettingsModal(baseState(), LAYOUT_DEFAULTS, "hub", {
      deskConnect: true,
      deskSessionLabel: "HMC-abcdef0123456789",
      deskAddress: "HMC-abcdef0123456789",
      sessionLive: true,
      labLoopback: false,
      hubWalletHref: "https://hackme.tech/#wallet",
      hubEmbed: false,
      matching: "disabled",
      depositEnabled: false,
      withdrawEnabled: false,
    });
    expect(html).toContain('data-tab="wallet"');
    expect(html).toContain("matching · disabled");
    expect(html).toContain("deposit · HOLD");
    expect(html).toContain("withdraw · HOLD");
    expect(html).toContain("set-desk-connect");
    expect(html).toContain("Reconnect");
    expect(html).toContain("set-desk-copy");
    expect(html).toContain("set-desk-logout");
    expect(html).toContain("set-desk-revoke");
    expect(html).toContain("set-desk-new-key");
    expect(html).toContain("set-open-2fa");
    expect(html).toContain("set-open-account");
    expect(html).toContain("set-hub-wallet");
    expect(html).toContain("HMC-abcdef0123456789");
    expect(html).not.toContain("<script>");
  });

  it("disables Connect controls when deskConnect is off", () => {
    const html = renderUnifiedSettingsModal(baseState(), LAYOUT_DEFAULTS, "hub", {
      deskConnect: false,
      deskSessionLabel: "not connected",
      labLoopback: false,
    });
    expect(html).toContain("desk Connect off in this build");
    expect(html).toMatch(/id="set-desk-connect"[^>]*disabled/);
    expect(html).toMatch(/id="set-desk-new-key"[^>]*disabled/);
    expect(html).toMatch(/id="set-open-2fa"[^>]*disabled/);
  });

  it("escapes hostile session labels", () => {
    const html = renderUnifiedSettingsModal(baseState(), LAYOUT_DEFAULTS, "hub", {
      deskConnect: true,
      deskSessionLabel: `<img src=x onerror=alert(1)>`,
      deskAddress: "HMC-safe",
      sessionLive: false,
      labLoopback: false,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("wires Wallet actions without throwing", () => {
    const onDeskConnect = vi.fn();
    const onCopyDeskAddress = vi.fn();
    const onOpenAccount = vi.fn();
    showUnifiedSettingsModal(
      baseState(),
      LAYOUT_DEFAULTS,
      "hub",
      {
        onSaveOracle: () => {},
        onTheme: () => {},
        onLayout: () => {},
        onApplyLayoutPreset: () => {},
        onResetLayout: () => {},
        onExport: () => {},
        onImportClick: () => {},
        onResetDemo: () => {},
        onOpenChartStyle: () => {},
        onOpenOverlays: () => {},
        onChartOverlays: () => {},
        onToggleMultiLink: () => {},
        onDeskConnect,
        onCopyDeskAddress,
        onOpenAccount,
      },
      {
        deskConnect: true,
        deskSessionLabel: "HMC-aaaaaaaaaaaaaaaa",
        deskAddress: "HMC-aaaaaaaaaaaaaaaa",
        sessionLive: false,
        labLoopback: false,
      },
    );
    const tab = document.querySelector('.settings-nav [data-tab="wallet"]') as HTMLButtonElement;
    tab.click();
    (document.getElementById("set-desk-copy") as HTMLButtonElement).click();
    expect(onCopyDeskAddress).toHaveBeenCalledTimes(1);
    (document.getElementById("set-open-account") as HTMLButtonElement).click();
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
  });
});
