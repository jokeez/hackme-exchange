import type { ChartOverlaySettings, DemoState, ThemeId } from "./types";
import { type LayoutPrefs, type LayoutPresetId } from "./layoutPrefs";
import { trapModalFocus } from "./oracleSettings";
import { escapeHtml } from "./sanitize";
import { Ico } from "./icons";
import { loadSettingsTab, saveSettingsTab, type SettingsTabId } from "./uiPrefs";

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
  onExportDeskSeed?: () => void;
  onImportDeskSeed?: () => void;
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
  maxOpenOrders?: number;
  minNotional?: number;
  priceBandBps?: number;
};

/** Server may say `disabled` — UI shows HOLD until matching is truly `ok`. */
export function formatDeskMatchingLabel(raw?: string): string {
  const v = (raw || "").trim();
  if (!v || v === "…" || v.toLowerCase() === "pending") return "…";
  const lower = v.toLowerCase();
  if (lower === "disabled" || lower === "hold" || lower === "off") return "HOLD";
  return v;
}

export function isDeskMatchingLive(raw?: string): boolean {
  return (raw || "").trim().toLowerCase() === "ok";
}

/** True until first /health paints real edge badges (avoid false HOLD flash). */
export function isDeskEdgePending(raw?: string): boolean {
  const v = (raw || "").trim();
  return !v || v === "…" || v.toLowerCase() === "pending";
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
  setDisabled("set-desk-export", !deskOn);
  setDisabled("set-desk-import", !deskOn);
  const twoFa = root.querySelector("#set-open-2fa") as HTMLButtonElement | null;
  if (twoFa) {
    const canOpen = !!wallet.labLoopback || !!wallet.deskConnect;
    twoFa.disabled = !canOpen;
    twoFa.textContent = canOpen ? "Open Account · 2FA" : "Unavailable";
  }
  const pending = isDeskEdgePending(wallet.matching);
  const matching = formatDeskMatchingLabel(wallet.matching);
  const vals = [
    { on: isDeskMatchingLive(wallet.matching), text: `matching · ${matching}` },
    {
      on: !!wallet.depositEnabled,
      text: `deposit · ${pending ? "…" : wallet.depositEnabled ? "on" : "HOLD"}`,
    },
    {
      on: !!wallet.withdrawEnabled,
      text: `withdraw · ${pending ? "…" : wallet.withdrawEnabled ? "on" : "HOLD"}`,
    },
  ];
  root.querySelectorAll("#set-desk-hold .settings-hold-pill").forEach((el, i) => {
    const v = vals[i];
    if (!v) return;
    el.setAttribute("data-on", v.on ? "1" : "0");
    el.textContent = v.text;
  });
  const capsEl = root.querySelector("#set-desk-caps");
  if (capsEl) {
    const caps: string[] = [];
    if (wallet.maxOpenOrders && wallet.maxOpenOrders > 0) caps.push(`max open ${wallet.maxOpenOrders}`);
    if (wallet.priceBandBps && wallet.priceBandBps > 0) caps.push(`±${wallet.priceBandBps} bps`);
    if (wallet.minNotional && wallet.minNotional > 0) caps.push(`min notional ${wallet.minNotional}`);
    capsEl.textContent = caps.length ? caps.join(" · ") : "";
    (capsEl as HTMLElement).hidden = caps.length === 0;
  }
}

function switchRow(id: string, title: string, hint: string, checked: boolean, disabled = false): string {
  return `<label class="settings-switch-row${disabled ? " is-disabled" : ""}">
    <span class="settings-switch-meta">
      <strong>${title}</strong>
      <span class="muted small">${hint}</span>
    </span>
    <span class="settings-switch">
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
      <i aria-hidden="true"></i>
    </span>
  </label>`;
}

function railBtn(tab: SettingsTabId, label: string, icon: string, active: boolean): string {
  return `<button type="button" class="settings-rail-btn${active ? " active" : ""}" data-tab="${tab}" role="tab" aria-selected="${active ? "true" : "false"}">${icon}<span>${label}</span></button>`;
}

export function renderUnifiedSettingsModal(
  state: DemoState,
  layout: LayoutPrefs,
  theme: ThemeId,
  wallet?: SettingsWalletChrome,
  initialTab: SettingsTabId = "layout",
): string {
  const anchor = Number.isFinite(state.oracleAnchor) && state.oracleAnchor > 0 ? state.oracleAnchor : 0.05;
  const deskOn = !!wallet?.deskConnect;
  const session = wallet?.deskSessionLabel || "not connected";
  const tab = initialTab;
  const pane = (id: SettingsTabId) => ({
    active: id === tab ? " active" : "",
    hidden: id === tab ? "" : " hidden",
  });
  const layoutP = pane("layout");
  const chartP = pane("chart");
  const walletP = pane("wallet");
  const oracleP = pane("oracle");
  const themeP = pane("theme");
  const dataP = pane("data");

  return `<div class="modal glass settings-modal settings-shell" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="modal-head settings-head">
      <div>
        <p class="settings-kicker muted small">Preferences</p>
        <h3 id="settings-title">Settings</h3>
      </div>
      <button type="button" class="modal-x" aria-label="Close">×</button>
    </div>
    <div class="settings-body">
      <nav class="modal-nav settings-nav settings-rail" role="tablist" aria-label="Settings sections">
        ${railBtn("layout", "Layout", Ico.layout(), tab === "layout")}
        ${railBtn("chart", "Chart", Ico.candlestick(), tab === "chart")}
        ${railBtn("wallet", "Wallet", Ico.wallet(), tab === "wallet")}
        ${railBtn("oracle", "Oracle", Ico.activity(), tab === "oracle")}
        ${railBtn("theme", "Theme", Ico.palette(), tab === "theme")}
        ${railBtn("data", "Data", Ico.database(), tab === "data")}
      </nav>
      <div class="settings-content">
        <div class="modal-pane${layoutP.active}" id="pane-layout" role="tabpanel"${layoutP.hidden}>
          <header class="settings-pane-head">
            <h4>Workspace layout</h4>
            <p class="muted small">Presets first — or toggle panels one by one.</p>
          </header>
          <div class="settings-preset-grid" role="group" aria-label="Layout presets">
            <button type="button" class="settings-preset-card" id="set-preset-standard">
              <strong>Standard</strong>
              <span class="muted small">Book · chart · markets</span>
            </button>
            <button type="button" class="settings-preset-card" id="set-preset-chart">
              <strong>Chart focus</strong>
              <span class="muted small">Hide side panels</span>
            </button>
            <button type="button" class="settings-preset-card" id="set-preset-scalper">
              <strong>Scalper</strong>
              <span class="muted small">Dense book + tools</span>
            </button>
          </div>
          <div class="settings-switch-list" role="group" aria-label="Panel visibility">
            ${switchRow("set-book", "Order book", "Left depth column", !layout.bookCollapsed)}
            ${switchRow("set-right", "Markets", "Right markets rail", !layout.rightCollapsed)}
            ${switchRow("set-tools", "Drawing tools", "Chart tool strip", !layout.toolsCollapsed)}
            ${switchRow("set-bottom", "Activity panel", "Orders · fills · tape", !layout.bottomCollapsed)}
            ${switchRow("set-mc-link", "Link multi-chart panes", "Shared crosshair &amp; time", !!state.multiChartLinked)}
          </div>
          <div class="settings-pane-actions">
            <button type="button" class="btn-sm" id="set-layout-reset">Reset layout</button>
          </div>
        </div>

        <div class="modal-pane${chartP.active}" id="pane-chart" role="tabpanel"${chartP.hidden}>
          <header class="settings-pane-head">
            <h4>Chart &amp; trading</h4>
            <p class="muted small">Overlays stay on this pair until you change them.</p>
          </header>
          <div class="settings-switch-list">
            ${switchRow("set-ov-quick", "Quick order", "Place from chart click", !!state.chartOverlays.quickOrder)}
            ${switchRow("set-ov-preview", "Order preview", "Ghost line before submit", !!(state.chartOverlays.orderPreview && state.chartOverlays.quickOrder), !state.chartOverlays.quickOrder)}
            ${switchRow("set-ov-skip-confirm", "Skip confirm", "Instant place on click", !!state.chartOverlays.quickOrderSkipConfirm, !state.chartOverlays.quickOrder)}
          </div>
          <div class="settings-btn-row settings-pane-actions">
            <button type="button" class="btn-sm btn-primary" id="set-chart-style">Chart style…</button>
            <button type="button" class="btn-sm" id="set-chart-overlays">More overlays…</button>
          </div>
        </div>

        <div class="modal-pane${walletP.active}" id="pane-wallet" role="tabpanel"${walletP.hidden}>
          <header class="settings-pane-head">
            <h4>Security &amp; wallet</h4>
            <p class="muted small">${
              isDeskMatchingLive(wallet?.matching)
                ? "Desk matching live · deposit/withdraw follow edge badges below."
                : "Paper Spot stays local. Edge badges show matching / deposit / withdraw status."
            }</p>
          </header>
          <div class="settings-edge-card" id="set-desk-hold" aria-live="polite">
            <div class="settings-edge-top">
              <strong>Edge status</strong>
              <button type="button" class="btn-sm settings-hold-refresh" id="set-desk-health" title="Refresh /desk-api health">↻ Refresh</button>
            </div>
            <div class="settings-hold-row">
              <span class="settings-hold-pill" data-on="${isDeskMatchingLive(wallet?.matching) ? "1" : "0"}">matching · ${escapeHtml(formatDeskMatchingLabel(wallet?.matching))}</span>
              <span class="settings-hold-pill" data-on="${wallet?.depositEnabled ? "1" : "0"}">deposit · ${isDeskEdgePending(wallet?.matching) ? "…" : wallet?.depositEnabled ? "on" : "HOLD"}</span>
              <span class="settings-hold-pill" data-on="${wallet?.withdrawEnabled ? "1" : "0"}">withdraw · ${isDeskEdgePending(wallet?.matching) ? "…" : wallet?.withdrawEnabled ? "on" : "HOLD"}</span>
            </div>
            <p class="muted small mono" id="set-desk-caps"${
              wallet?.maxOpenOrders || wallet?.priceBandBps || wallet?.minNotional ? "" : " hidden"
            }>${(() => {
              const caps: string[] = [];
              if (wallet?.maxOpenOrders && wallet.maxOpenOrders > 0) caps.push(`max open ${wallet.maxOpenOrders}`);
              if (wallet?.priceBandBps && wallet.priceBandBps > 0) caps.push(`±${wallet.priceBandBps} bps`);
              if (wallet?.minNotional && wallet.minNotional > 0) caps.push(`min notional ${wallet.minNotional}`);
              return escapeHtml(caps.join(" · "));
            })()}</p>
          </div>
          <div class="settings-action-list">
            <div class="settings-action-row is-primary">
              <div class="settings-action-meta">
                <strong>Desk Connect</strong>
                <p class="muted small">Browser-local <code>HMC-…</code> via same-origin <code>/desk-api</code>.</p>
                <p class="mono small settings-session" id="set-desk-session">${deskOn ? escapeHtml(session) : "desk Connect off in this build"}</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm btn-primary" id="set-desk-connect" ${deskOn ? "" : "disabled"}>${deskOn ? (wallet?.sessionLive ? "Reconnect" : "Connect") : "Unavailable"}</button>
                <button type="button" class="btn-sm" id="set-desk-copy" ${deskOn && wallet?.deskAddress ? "" : "disabled"} title="Copy login address — NOT for deposits">Copy login</button>
              </div>
            </div>
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>Session</strong>
                <p class="muted small">Logout this device · revoke clears every device for this address.</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm" id="set-desk-logout" ${deskOn && wallet?.sessionLive ? "" : "disabled"}>Logout</button>
                <button type="button" class="btn-sm danger" id="set-desk-revoke" ${deskOn && wallet?.sessionLive ? "" : "disabled"}>Revoke all</button>
              </div>
            </div>
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>Node Sync</strong>
                <p class="muted small">Read-only HMC/SUP from local node or Hub — not exchange custody.</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm" id="set-node-sync">↻ Sync</button>
                ${
                  wallet?.hubWalletHref
                    ? `<a class="btn-sm btn-secondary" id="set-hub-wallet" href="${escapeHtml(wallet.hubWalletHref)}" target="_blank" rel="noopener noreferrer">${wallet.hubEmbed ? "Hub wallet" : "Node wallet"}</a>`
                    : ""
                }
              </div>
            </div>
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>2FA</strong>
                <p class="muted small">${
                  wallet?.withdrawEnabled
                    ? "TOTP required on every withdraw request."
                    : "TOTP for withdraw — enroll now before edge opens."
                }</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm" id="set-open-2fa" ${wallet?.labLoopback || wallet?.deskConnect ? "" : "disabled"}>${
                  wallet?.labLoopback || wallet?.deskConnect ? "Open Account · 2FA" : "Unavailable"
                }</button>
              </div>
            </div>
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>Backup / restore</strong>
                <p class="muted small">Move the same <code>HMC-…</code> to phone or another browser. Seed is secret — never share.</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm" id="set-desk-export" ${deskOn ? "" : "disabled"}>Export seed…</button>
                <button type="button" class="btn-sm" id="set-desk-import" ${deskOn ? "" : "disabled"}>Import seed…</button>
              </div>
            </div>
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>Desk key</strong>
                <p class="muted small">Ephemeral <code>sessionStorage</code> seed — new wallet is irreversible for this tab.</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm danger" id="set-desk-new-key" ${deskOn ? "" : "disabled"}>New wallet…</button>
              </div>
            </div>
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>Account</strong>
                <p class="muted small">Funds, HOLD copy, and desk session panel.</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm" id="set-open-account">Open Account</button>
              </div>
            </div>
          </div>
          <p class="muted small settings-wallet-foot" id="set-wallet-msg" role="status"></p>
        </div>

        <div class="modal-pane${oracleP.active}" id="pane-oracle" role="tabpanel"${oracleP.hidden}>
          <header class="settings-pane-head">
            <h4>${deskOn ? "Reference mid" : "Paper oracle"}</h4>
            <p class="muted small">${
              deskOn
                ? "Soft-launch mids come from Soft-MM / last trade — this pane is a legacy paper fallback only."
                : "Shared reference mid — locked for cross-device sync."
            }</p>
          </header>
          <div class="settings-oracle-card">
            <label for="set-anchor">USDT per HMC
              <input class="inp mono" id="set-anchor" type="number" step="0.001" value="${anchor}" readonly disabled />
            </label>
            <p class="muted small">${
              deskOn
                ? "Not used while desk matching / public book is live. Spot chart follows the live book mid."
                : "Display-only. Every device uses <strong>0.05</strong> USDT/HMC on paper Spot."
            }</p>
            <button type="button" class="btn-sm" id="set-oracle-save" aria-label="Oracle reference mid locked at 0.05" disabled title="Locked for cross-device sync">Locked at 0.05</button>
          </div>
        </div>

        <div class="modal-pane${themeP.active}" id="pane-theme" role="tabpanel"${themeP.hidden}>
          <header class="settings-pane-head">
            <h4>Appearance</h4>
            <p class="muted small">Pick a chrome that matches where you work.</p>
          </header>
          <div class="settings-theme-grid" role="group" aria-label="Theme">
            <button type="button" class="settings-theme-card${theme === "hub" ? " active" : ""}" id="set-theme-hub" data-theme="hub">
              <span class="settings-theme-swatch settings-theme-hub" aria-hidden="true"></span>
              <strong>Hub</strong>
              <span class="muted small">hackme.tech cyan</span>
            </button>
            <button type="button" class="settings-theme-card${theme === "wallet" ? " active" : ""}" id="set-theme-wallet" data-theme="wallet">
              <span class="settings-theme-swatch settings-theme-wallet" aria-hidden="true"></span>
              <strong>Wallet</strong>
              <span class="muted small">Lab amber desk</span>
            </button>
          </div>
        </div>

        <div class="modal-pane${dataP.active}" id="pane-data" role="tabpanel"${dataP.hidden}>
          <header class="settings-pane-head">
            <h4>Demo data</h4>
            <p class="muted small">Export / import paper wallet, orders, and chart state.</p>
          </header>
          <div class="settings-action-list">
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>Backup</strong>
                <p class="muted small">Download a JSON snapshot of this browser’s demo state.</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm" id="set-export">↓ Export</button>
                <button type="button" class="btn-sm" id="set-import">↑ Import</button>
              </div>
            </div>
            <div class="settings-action-row">
              <div class="settings-action-meta">
                <strong>Reset</strong>
                <p class="muted small">Wipe local demo balances and reopen with defaults.</p>
              </div>
              <div class="settings-action-btns">
                <button type="button" class="btn-sm danger" id="set-reset-demo">Reset demo</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-actions settings-foot">
      <button type="button" class="btn-sm" id="set-close" aria-label="Close settings">Done</button>
    </div>
  </div>`;
}

function activateSettingsTab(root: HTMLElement, tab: string): void {
  const nav = root.querySelector(".settings-nav");
  if (!nav) return;
  nav.querySelectorAll("[data-tab]").forEach((b) => {
    const on = (b as HTMLElement).dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  root.querySelectorAll<HTMLElement>(".modal-pane").forEach((pane) => {
    const id = pane.id.replace("pane-", "");
    const on = id === tab;
    pane.classList.toggle("active", on);
    pane.hidden = !on;
  });
}

function wireSettingsTabs(root: HTMLElement): void {
  const nav = root.querySelector(".settings-nav");
  if (!nav) return;
  nav.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as SettingsTabId | undefined;
      if (!tab) return;
      activateSettingsTab(root, tab);
      saveSettingsTab(tab);
    });
  });
}

export function showUnifiedSettingsModal(
  state: DemoState,
  layout: LayoutPrefs,
  theme: ThemeId,
  actions: SettingsModalActions,
  wallet?: SettingsWalletChrome,
  opts?: { tab?: SettingsTabId },
): void {
  document.querySelectorAll(".modal-backdrop[data-settings-modal]").forEach((el) => el.remove());
  const initialTab = opts?.tab ?? loadSettingsTab();
  const bd = document.createElement("div");
  bd.className = "modal-backdrop settings-backdrop";
  bd.dataset.settingsModal = "1";
  bd.innerHTML = renderUnifiedSettingsModal(state, layout, theme, wallet, initialTab);
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
    previewInp.closest(".settings-switch-row")?.classList.toggle("is-disabled", !on);
    skipInp?.closest(".settings-switch-row")?.classList.toggle("is-disabled", !on);
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
    if (!window.confirm("Reset demo balances, orders, and local chart state? This cannot be undone.")) return;
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
  bd.querySelector("#set-desk-export")?.addEventListener("click", () => {
    actions.onExportDeskSeed?.();
  });
  bd.querySelector("#set-desk-import")?.addEventListener("click", () => {
    if (!actions.onImportDeskSeed) return;
    close();
    actions.onImportDeskSeed();
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
