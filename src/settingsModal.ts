import type { ChartOverlaySettings, DemoState, ThemeId } from "./types";
import { type LayoutPrefs, type LayoutPresetId } from "./layoutPrefs";
import { trapModalFocus } from "./oracleSettings";
import { escapeHtml } from "./sanitize";

export type SettingsModalActions = {
  onSaveOracle: (anchor: number) => void;
  onTheme: (theme: ThemeId) => void;
  onLayout: (patch: Partial<LayoutPrefs>) => void;
  onApplyLayoutPreset: (id: LayoutPresetId) => void;
  onResetLayout: () => void;
  onExport: () => void;
  onImportClick: () => void;
  onResetDemo: () => void;
  onOpenChartStyle: () => void;
  onOpenOverlays: (anchor: HTMLElement) => void;
  onChartOverlays: (patch: Partial<ChartOverlaySettings>) => void;
  onToggleMultiLink: (linked: boolean) => void;
  /** Optional wallet/security widgets (desk Connect, node sync, Account deep-link). */
  onDeskConnect?: () => void;
  onNodeSync?: () => void;
  onOpenAccountSecurity?: () => void;
  onDeskLogout?: () => void;
  onDeskRevokeAll?: () => void;
  onCopyDeskAddress?: () => void;
  onNewDeskWallet?: () => void;
  onOpenAccount?: () => void;
  onRefreshDeskHealth?: () => void | Promise<void | boolean>;
};

export type SettingsWalletChrome = {
  deskConnect: boolean;
  deskSessionLabel: string;
  deskAddress?: string;
  sessionLive?: boolean;
  labLoopback: boolean;
  hubWalletHref?: string;
  hubEmbed?: boolean;
  /** Edge HOLD snapshot (from last health probe). */
  matching?: string;
  depositEnabled?: boolean;
  withdrawEnabled?: boolean;
};

/** Server may say `disabled` — UI shows HOLD until matching is truly `ok`. */
export function formatDeskMatchingLabel(raw?: string): string {
  const v = (raw || "").trim();
  if (!v) return "HOLD";
  const lower = v.toLowerCase();
  if (lower === "disabled" || lower === "hold" || lower === "off") return "HOLD";
  return v;
}

export function isDeskMatchingLive(raw?: string): boolean {
  return (raw || "").trim().toLowerCase() === "ok";
}

/** Live-update Wallet pane controls while Settings stays open. */
export function patchSettingsWalletSessionChrome(wallet: SettingsWalletChrome): void {
  const root = document.querySelector(".modal-backdrop[data-settings-modal]");
  if (!root) return;
  const deskOn = !!wallet.deskConnect;
  const live = !!wallet.sessionLive;
  const sessionEl = root.querySelector("#set-desk-session");
  if (sessionEl) {
    sessionEl.textContent = deskOn ? wallet.deskSessionLabel || "not connected" : "desk Connect off in this build";
  }
  const setDisabled = (id: string, disabled: boolean) => {
    const el = root.querySelector(`#${id}`) as HTMLButtonElement | null;
    if (!el) return;
    el.disabled = disabled;
  };
  const connectBtn = root.querySelector("#set-desk-connect") as HTMLButtonElement | null;
  if (connectBtn) {
    connectBtn.disabled = !deskOn;
    connectBtn.textContent = deskOn ? (live ? "Reconnect" : "Connect") : "Unavailable";
  }
  setDisabled("set-desk-copy", !(deskOn && !!wallet.deskAddress));
  setDisabled("set-desk-logout", !(deskOn && live));
  setDisabled("set-desk-revoke", !(deskOn && live));
  setDisabled("set-desk-new-key", !deskOn);
  const twoFa = root.querySelector("#set-open-2fa") as HTMLButtonElement | null;
  if (twoFa) {
    const lab = !!wallet.labLoopback;
    twoFa.disabled = !lab;
    twoFa.textContent = lab ? "Open Account · 2FA" : "Coming with withdraw";
  }
  const matching = formatDeskMatchingLabel(wallet.matching);
  const vals = [
    { on: isDeskMatchingLive(wallet.matching), text: `matching · ${matching}` },
    { on: !!wallet.depositEnabled, text: `deposit · ${wallet.depositEnabled ? "on" : "HOLD"}` },
    { on: !!wallet.withdrawEnabled, text: `withdraw · ${wallet.withdrawEnabled ? "on" : "HOLD"}` },
  ];
  root.querySelectorAll("#set-desk-hold .settings-hold-pill").forEach((el, i) => {
    const v = vals[i];
    if (!v) return;
    el.setAttribute("data-on", v.on ? "1" : "0");
    el.textContent = v.text;
  });
}

export function renderUnifiedSettingsModal(
  state: DemoState,
  layout: LayoutPrefs,
  theme: ThemeId,
  wallet?: SettingsWalletChrome,
): string {
  const anchor = Number.isFinite(state.oracleAnchor) && state.oracleAnchor > 0 ? state.oracleAnchor : 0.05;
  const deskOn = !!wallet?.deskConnect;
  const session = wallet?.deskSessionLabel || "not connected";
  return `<div class="modal glass modal-wide modal-tabs settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="modal-head"><h3 id="settings-title">Settings</h3><button type="button" class="modal-x" aria-label="Close">×</button></div>
    <nav class="modal-nav settings-nav" role="tablist" aria-label="Settings sections">
      <button type="button" class="active" data-tab="layout" role="tab" aria-selected="true">Layout</button>
      <button type="button" data-tab="chart" role="tab" aria-selected="false">Chart</button>
      <button type="button" data-tab="wallet" role="tab" aria-selected="false">Wallet</button>
      <button type="button" data-tab="oracle" role="tab" aria-selected="false">Oracle</button>
      <button type="button" data-tab="theme" role="tab" aria-selected="false">Theme</button>
      <button type="button" data-tab="data" role="tab" aria-selected="false">Data</button>
    </nav>

    <div class="modal-pane active" id="pane-layout" role="tabpanel">
      <p class="muted small">Named presets — like Binance Pro layout modes.</p>
      <div class="settings-preset-row">
        <button type="button" class="btn-sm" id="set-preset-standard">Standard</button>
        <button type="button" class="btn-sm" id="set-preset-chart">Chart focus</button>
        <button type="button" class="btn-sm" id="set-preset-scalper">Scalper</button>
      </div>
      <p class="muted small">Or toggle panels individually:</p>
      <div class="settings-grid">
        <label><input type="checkbox" id="set-book" ${!layout.bookCollapsed ? "checked" : ""} /> Order book</label>
        <label><input type="checkbox" id="set-right" ${!layout.rightCollapsed ? "checked" : ""} /> Markets</label>
        <label><input type="checkbox" id="set-tools" ${!layout.toolsCollapsed ? "checked" : ""} /> Drawing tools</label>
        <label><input type="checkbox" id="set-bottom" ${!layout.bottomCollapsed ? "checked" : ""} /> Activity panel</label>
        <label><input type="checkbox" id="set-mc-link" ${state.multiChartLinked ? "checked" : ""} /> Link multi-chart panes</label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-sm" id="set-layout-reset">Reset layout</button>
      </div>
    </div>

    <div class="modal-pane" id="pane-chart" role="tabpanel" hidden>
      <p class="muted small">Chart appearance and trading overlays.</p>
      <div class="settings-grid">
        <label><input type="checkbox" id="set-ov-preview" ${state.chartOverlays.orderPreview && state.chartOverlays.quickOrder ? "checked" : ""} ${state.chartOverlays.quickOrder ? "" : "disabled"} /> Order preview (ghost line)</label>
        <label><input type="checkbox" id="set-ov-quick" ${state.chartOverlays.quickOrder ? "checked" : ""} /> Quick order (chart click)</label>
        <label><input type="checkbox" id="set-ov-skip-confirm" ${state.chartOverlays.quickOrderSkipConfirm ? "checked" : ""} ${state.chartOverlays.quickOrder ? "" : "disabled"} /> Skip confirm (instant place)</label>
      </div>
      <div class="settings-btn-row">
        <button type="button" class="btn-sm" id="set-chart-style">Chart style…</button>
        <button type="button" class="btn-sm" id="set-chart-overlays">More overlays…</button>
      </div>
    </div>

    <div class="modal-pane" id="pane-wallet" role="tabpanel" hidden>
      <p class="muted small">Security &amp; wallet — paper Spot stays local; desk matching/deposit/withdraw stay HOLD until GO.</p>
      <div class="settings-hold-row" id="set-desk-hold" aria-live="polite">
        <span class="settings-hold-pill" data-on="${isDeskMatchingLive(wallet?.matching) ? "1" : "0"}">matching · ${escapeHtml(formatDeskMatchingLabel(wallet?.matching))}</span>
        <span class="settings-hold-pill" data-on="${wallet?.depositEnabled ? "1" : "0"}">deposit · ${wallet?.depositEnabled ? "on" : "HOLD"}</span>
        <span class="settings-hold-pill" data-on="${wallet?.withdrawEnabled ? "1" : "0"}">withdraw · ${wallet?.withdrawEnabled ? "on" : "HOLD"}</span>
        <button type="button" class="btn-sm settings-hold-refresh" id="set-desk-health" title="Refresh /desk-api health">↻</button>
      </div>
      <div class="settings-wallet-grid">
        <article class="settings-widget glass-inset">
          <h4>Desk Connect</h4>
          <p class="muted small">Browser-local <code>HMC-…</code> against same-origin <code>/desk-api</code>.</p>
          <p class="mono small" id="set-desk-session">${deskOn ? escapeHtml(session) : "desk Connect off in this build"}</p>
          <div class="settings-btn-row">
            <button type="button" class="btn-sm" id="set-desk-connect" ${deskOn ? "" : "disabled"}>${deskOn ? (wallet?.sessionLive ? "Reconnect" : "Connect") : "Unavailable"}</button>
            <button type="button" class="btn-sm" id="set-desk-copy" ${deskOn && wallet?.deskAddress ? "" : "disabled"} title="Copy HMC address">Copy addr</button>
          </div>
        </article>
        <article class="settings-widget glass-inset">
          <h4>Session</h4>
          <p class="muted small">Cookie session on the desk API. Revoke invalidates all devices for this address.</p>
          <div class="settings-btn-row">
            <button type="button" class="btn-sm" id="set-desk-logout" ${deskOn && wallet?.sessionLive ? "" : "disabled"}>Logout</button>
            <button type="button" class="btn-sm danger" id="set-desk-revoke" ${deskOn && wallet?.sessionLive ? "" : "disabled"}>Revoke all</button>
          </div>
        </article>
        <article class="settings-widget glass-inset">
          <h4>Node Sync</h4>
          <p class="muted small">Read-only HMC/SUP from local <code>hackme-node</code> (this device) or Hub embed — not exchange custody.</p>
          <div class="settings-btn-row">
            <button type="button" class="btn-sm" id="set-node-sync">↻ Sync HMC/SUP</button>
            ${
              wallet?.hubWalletHref
                ? `<a class="btn-sm btn-secondary" id="set-hub-wallet" href="${escapeHtml(wallet.hubWalletHref)}" target="_blank" rel="noopener noreferrer">${wallet.hubEmbed ? "Hub wallet" : "Node wallet"}</a>`
                : ""
            }
          </div>
        </article>
        <article class="settings-widget glass-inset">
          <h4>2FA</h4>
          <p class="muted small">TOTP for withdraw GO. Public withdraw stays HOLD; lab loopback can enroll now.</p>
          <button type="button" class="btn-sm" id="set-open-2fa" ${wallet?.labLoopback ? "" : "disabled"}>${wallet?.labLoopback ? "Open Account · 2FA" : "Coming with withdraw"}</button>
        </article>
        <article class="settings-widget glass-inset">
          <h4>Desk key</h4>
          <p class="muted small">Ephemeral seed in <code>sessionStorage</code> only. New wallet clears it and logs out — irreversible for this tab.</p>
          <button type="button" class="btn-sm danger" id="set-desk-new-key" ${deskOn ? "" : "disabled"}>New desk wallet…</button>
        </article>
        <article class="settings-widget glass-inset">
          <h4>Account</h4>
          <p class="muted small">Paper funds, deposits HOLD copy, and desk session panel live on Account.</p>
          <button type="button" class="btn-sm" id="set-open-account">Open Account</button>
        </article>
      </div>
      <p class="muted small settings-wallet-foot" id="set-wallet-msg" role="status"></p>
    </div>

    <div class="modal-pane" id="pane-oracle" role="tabpanel" hidden>
      <label for="set-anchor">Reference mid (USDT per HMC)
        <input class="inp mono" id="set-anchor" type="number" step="0.001" value="${anchor}" readonly disabled />
      </label>
      <p class="muted small">Shared D0 paper mid is locked at 0.05 USDT/HMC on every device. This field is display-only.</p>
      <div class="modal-actions">
        <button type="button" class="btn-sm" id="set-oracle-save" aria-label="Oracle reference mid locked at 0.05" disabled title="Locked for cross-device sync">Locked at 0.05</button>
      </div>
    </div>

    <div class="modal-pane" id="pane-theme" role="tabpanel" hidden>
      <div class="settings-theme-row">
        <button type="button" class="btn-sm ${theme === "hub" ? "active" : ""}" id="set-theme-hub" data-theme="hub">Hub (hackme.tech)</button>
        <button type="button" class="btn-sm ${theme === "wallet" ? "active" : ""}" id="set-theme-wallet" data-theme="wallet">Wallet (lab)</button>
      </div>
    </div>

    <div class="modal-pane" id="pane-data" role="tabpanel" hidden>
      <p class="muted small">Export or import demo wallet, orders, and chart state.</p>
      <div class="settings-btn-row">
        <button type="button" class="btn-sm" id="set-export">↓ Export state</button>
        <button type="button" class="btn-sm" id="set-import">↑ Import state</button>
        <button type="button" class="btn-sm danger" id="set-reset-demo">Reset demo</button>
      </div>
    </div>

    <div class="modal-actions settings-foot">
      <button type="button" class="btn-sm" id="set-close" aria-label="Close settings">Close</button>
    </div>
  </div>`;
}

function wireSettingsTabs(root: HTMLElement): void {
  const nav = root.querySelector(".settings-nav");
  if (!nav) return;
  nav.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      nav.querySelectorAll("[data-tab]").forEach((b) => {
        b.classList.toggle("active", (b as HTMLElement).dataset.tab === tab);
        b.setAttribute("aria-selected", (b as HTMLElement).dataset.tab === tab ? "true" : "false");
      });
      root.querySelectorAll<HTMLElement>(".modal-pane").forEach((pane) => {
        const id = pane.id.replace("pane-", "");
        const on = id === tab;
        pane.classList.toggle("active", on);
        pane.hidden = !on;
      });
    });
  });
}

export function showUnifiedSettingsModal(
  state: DemoState,
  layout: LayoutPrefs,
  theme: ThemeId,
  actions: SettingsModalActions,
  wallet?: SettingsWalletChrome,
): void {
  document.querySelectorAll(".modal-backdrop[data-settings-modal]").forEach((el) => el.remove());
  const bd = document.createElement("div");
  bd.className = "modal-backdrop";
  bd.dataset.settingsModal = "1";
  bd.innerHTML = renderUnifiedSettingsModal(state, layout, theme, wallet);
  const modal = bd.querySelector(".modal") as HTMLElement;

  const close = () => {
    window.removeEventListener("keydown", onKey);
    untrap?.();
    bd.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  document.body.appendChild(bd);
  window.addEventListener("keydown", onKey);
  const untrap = modal ? trapModalFocus(modal) : undefined;
  wireSettingsTabs(modal);

  bd.querySelector(".modal-x")?.addEventListener("click", close);
  bd.querySelector("#set-close")?.addEventListener("click", close);
  bd.addEventListener("click", (e) => {
    if (e.target === bd) close();
  });

  bd.querySelector("#set-book")?.addEventListener("change", (e) => {
    actions.onLayout({ bookCollapsed: !(e.target as HTMLInputElement).checked });
  });
  bd.querySelector("#set-right")?.addEventListener("change", (e) => {
    actions.onLayout({ rightCollapsed: !(e.target as HTMLInputElement).checked });
  });
  bd.querySelector("#set-tools")?.addEventListener("change", (e) => {
    actions.onLayout({ toolsCollapsed: !(e.target as HTMLInputElement).checked });
  });
  bd.querySelector("#set-bottom")?.addEventListener("change", (e) => {
    actions.onLayout({ bottomCollapsed: !(e.target as HTMLInputElement).checked });
  });
  bd.querySelector("#set-mc-link")?.addEventListener("change", (e) => {
    actions.onToggleMultiLink((e.target as HTMLInputElement).checked);
  });
  bd.querySelector("#set-layout-reset")?.addEventListener("click", () => {
    actions.onResetLayout();
    close();
  });
  bd.querySelector("#set-preset-standard")?.addEventListener("click", () => {
    actions.onApplyLayoutPreset("standard");
    close();
  });
  bd.querySelector("#set-preset-chart")?.addEventListener("click", () => {
    actions.onApplyLayoutPreset("chart");
    close();
  });
  bd.querySelector("#set-preset-scalper")?.addEventListener("click", () => {
    actions.onApplyLayoutPreset("scalper");
    close();
  });

  bd.querySelector("#set-chart-style")?.addEventListener("click", () => {
    close();
    actions.onOpenChartStyle();
  });
  bd.querySelector("#set-ov-preview")?.addEventListener("change", (e) => {
    const quick = bd.querySelector("#set-ov-quick") as HTMLInputElement;
    if (!quick?.checked) return;
    actions.onChartOverlays({ orderPreview: (e.target as HTMLInputElement).checked });
  });
  const quickInp = bd.querySelector("#set-ov-quick") as HTMLInputElement | null;
  const previewInp = bd.querySelector("#set-ov-preview") as HTMLInputElement | null;
  const skipInp = bd.querySelector("#set-ov-skip-confirm") as HTMLInputElement | null;
  const syncPreviewGate = () => {
    if (!quickInp || !previewInp) return;
    const on = quickInp.checked;
    previewInp.disabled = !on;
    skipInp && (skipInp.disabled = !on);
    previewInp.closest("label")?.classList.toggle("ov-disabled", !on);
    skipInp?.closest("label")?.classList.toggle("ov-disabled", !on);
    if (!on) {
      previewInp.checked = false;
      if (skipInp) skipInp.checked = false;
    }
  };
  syncPreviewGate();
  quickInp?.addEventListener("change", (e) => {
    syncPreviewGate();
    actions.onChartOverlays({
      quickOrder: (e.target as HTMLInputElement).checked,
      orderPreview: previewInp?.checked ?? false,
      quickOrderSkipConfirm: skipInp?.checked ?? false,
    });
  });
  skipInp?.addEventListener("change", (e) => {
    if (!quickInp?.checked) return;
    actions.onChartOverlays({ quickOrderSkipConfirm: (e.target as HTMLInputElement).checked });
  });
  bd.querySelector("#set-chart-overlays")?.addEventListener("click", () => {
    const btn = bd.querySelector("#set-chart-overlays") as HTMLElement;
    close();
    actions.onOpenOverlays(btn);
  });

  bd.querySelector("#set-oracle-save")?.addEventListener("click", () => {
    const v = Number((bd.querySelector("#set-anchor") as HTMLInputElement).value);
    if (v > 0) {
      actions.onSaveOracle(v);
      close();
    }
  });

  bd.querySelector("#set-theme-hub")?.addEventListener("click", () => {
    actions.onTheme("hub");
    close();
  });
  bd.querySelector("#set-theme-wallet")?.addEventListener("click", () => {
    actions.onTheme("wallet");
    close();
  });

  bd.querySelector("#set-export")?.addEventListener("click", () => {
    actions.onExport();
  });
  bd.querySelector("#set-import")?.addEventListener("click", () => {
    actions.onImportClick();
  });
  bd.querySelector("#set-reset-demo")?.addEventListener("click", () => {
    actions.onResetDemo();
    close();
  });

  bd.querySelector("#set-desk-connect")?.addEventListener("click", () => {
    if (!actions.onDeskConnect) return;
    close();
    actions.onDeskConnect();
  });
  bd.querySelector("#set-node-sync")?.addEventListener("click", () => {
    actions.onNodeSync?.();
  });
  bd.querySelector("#set-open-2fa")?.addEventListener("click", () => {
    if (!actions.onOpenAccountSecurity) return;
    close();
    actions.onOpenAccountSecurity();
  });
  bd.querySelector("#set-desk-logout")?.addEventListener("click", () => {
    void actions.onDeskLogout?.();
  });
  bd.querySelector("#set-desk-revoke")?.addEventListener("click", () => {
    if (!actions.onDeskRevokeAll) return;
    if (!window.confirm("Revoke all desk sessions for this address?")) return;
    void actions.onDeskRevokeAll();
  });
  bd.querySelector("#set-desk-copy")?.addEventListener("click", () => {
    actions.onCopyDeskAddress?.();
  });
  bd.querySelector("#set-desk-new-key")?.addEventListener("click", () => {
    if (!actions.onNewDeskWallet) return;
    if (
      !window.confirm(
        "Create a new browser desk wallet? This clears the sessionStorage seed and logs out. You cannot recover the old address from this tab.",
      )
    ) {
      return;
    }
    close();
    actions.onNewDeskWallet();
  });
  bd.querySelector("#set-open-account")?.addEventListener("click", () => {
    if (!actions.onOpenAccount) return;
    close();
    actions.onOpenAccount();
  });
  bd.querySelector("#set-desk-health")?.addEventListener("click", () => {
    const msg = bd.querySelector("#set-wallet-msg");
    if (msg) msg.textContent = "Refreshing desk health…";
    void Promise.resolve(actions.onRefreshDeskHealth?.())
      .then((ok) => {
        if (msg) msg.textContent = ok === false ? "Health refresh failed — badges may be stale." : "Edge HOLD badges updated.";
      })
      .catch(() => {
        if (msg) msg.textContent = "Health refresh failed — badges may be stale.";
      });
  });
}
