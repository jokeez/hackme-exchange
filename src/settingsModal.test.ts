/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import {
  formatDeskMatchingLabel,
  isDeskMatchingLive,
  patchSettingsWalletSessionChrome,
  renderUnifiedSettingsModal,
  showUnifiedSettingsModal,
} from "./settingsModal";
import { baseState } from "./testFixtures";
import { LAYOUT_DEFAULTS } from "./layoutPrefs";

describe("desk matching labels", () => {
  it("normalizes disabled/off to HOLD", () => {
    expect(formatDeskMatchingLabel("disabled")).toBe("HOLD");
    expect(formatDeskMatchingLabel("off")).toBe("HOLD");
    expect(formatDeskMatchingLabel("")).toBe("HOLD");
    expect(formatDeskMatchingLabel("ok")).toBe("ok");
    expect(isDeskMatchingLive("ok")).toBe(true);
    expect(isDeskMatchingLive("disabled")).toBe(false);
  });
});

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
    expect(html).toContain("settings-shell");
    expect(html).toContain("settings-rail");
    expect(html).toContain("settings-switch-row");
    expect(html).toContain("matching · HOLD");
    expect(html).toContain("deposit · HOLD");
    expect(html).toContain("withdraw · HOLD");
    expect(html).toContain("set-desk-connect");
    expect(html).toContain("Reconnect");
    expect(html).toContain("set-desk-export");
    expect(html).toContain("set-desk-import");
    expect(html).toContain("Open Account · 2FA");
    expect(html).not.toMatch(/id="set-open-2fa"[^>]*disabled/);
    expect(html).toContain("HMC-abcdef0123456789");
    expect(html).toContain("settings-action-row");
    expect(html).not.toContain("<script>");
  });

  it("shows withdraw · on when edge health enables withdraw", () => {
    const html = renderUnifiedSettingsModal(baseState(), LAYOUT_DEFAULTS, "hub", {
      deskConnect: true,
      deskSessionLabel: "HMC-abcdef0123456789",
      deskAddress: "HMC-abcdef0123456789",
      sessionLive: true,
      labLoopback: false,
      matching: "ok",
      depositEnabled: true,
      withdrawEnabled: true,
    });
    expect(html).toContain("withdraw · on");
    expect(html).toContain("deposit · on");
    expect(html).toContain("matching · ok");
    expect(html).toContain("TOTP required on every withdraw");
  });

  it("opens a specific initial tab", () => {
    const html = renderUnifiedSettingsModal(
      baseState(),
      LAYOUT_DEFAULTS,
      "hub",
      { deskConnect: false, deskSessionLabel: "not connected", labLoopback: false },
      "wallet",
    );
    expect(html).toContain('id="pane-wallet" role="tabpanel"');
    expect(html).not.toMatch(/id="pane-wallet"[^>]*hidden/);
    expect(html).toMatch(/id="pane-layout"[^>]*hidden/);
  });

  it("disables Connect controls when deskConnect is off", () => {
    const html = renderUnifiedSettingsModal(baseState(), LAYOUT_DEFAULTS, "hub", {
      deskConnect: false,
      deskSessionLabel: "not connected",
      labLoopback: false,
    });
    expect(html).toContain("desk Connect off in this build");
    expect(html).toMatch(/id="set-desk-connect"[^>]*disabled/);
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

  it("patchSettingsWalletSessionChrome updates live session controls", () => {
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
      },
      {
        deskConnect: true,
        deskSessionLabel: "HMC-aaaaaaaaaaaaaaaa",
        deskAddress: "HMC-aaaaaaaaaaaaaaaa",
        sessionLive: true,
        labLoopback: false,
        matching: "disabled",
      },
    );
    patchSettingsWalletSessionChrome({
      deskConnect: true,
      deskSessionLabel: "not connected",
      deskAddress: "HMC-bbbbbbbbbbbbbbbb",
      sessionLive: false,
      labLoopback: false,
      matching: "HOLD",
      depositEnabled: false,
      withdrawEnabled: false,
    });
    expect(document.getElementById("set-desk-session")?.textContent).toBe("not connected");
    expect((document.getElementById("set-desk-logout") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("set-desk-connect") as HTMLButtonElement).textContent).toBe("Connect");
    expect(document.getElementById("set-desk-hold")?.textContent).toContain("matching · HOLD");
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
  });
});
