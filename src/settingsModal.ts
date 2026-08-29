import type { ChartOverlaySettings, DemoState, ThemeId } from "./types";
import { type LayoutPrefs, type LayoutPresetId } from "./layoutPrefs";
import { trapModalFocus } from "./oracleSettings";

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
};

export function renderUnifiedSettingsModal(
  state: DemoState,
  layout: LayoutPrefs,
  theme: ThemeId,
): string {
  const anchor = Number.isFinite(state.oracleAnchor) && state.oracleAnchor > 0 ? state.oracleAnchor : 0.05;
  return `<div class="modal glass modal-wide modal-tabs settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="modal-head"><h3 id="settings-title">Settings</h3><button type="button" class="modal-x" aria-label="Close">×</button></div>
    <nav class="modal-nav settings-nav" role="tablist" aria-label="Settings sections">
      <button type="button" class="active" data-tab="layout" role="tab" aria-selected="true">Layout</button>
      <button type="button" data-tab="chart" role="tab" aria-selected="false">Chart</button>
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
      </div>
      <div class="settings-btn-row">
        <button type="button" class="btn-sm" id="set-chart-style">Chart style…</button>
        <button type="button" class="btn-sm" id="set-chart-overlays">More overlays…</button>
      </div>
    </div>

    <div class="modal-pane" id="pane-oracle" role="tabpanel" hidden>
      <label for="set-anchor">Reference mid (USDT per HMC)
        <input class="inp mono" id="set-anchor" type="number" step="0.001" value="${anchor}" />
      </label>
      <p class="muted small">Paper charts anchor — not scaled by pool GH/s. D0 default 0.05.</p>
      <div class="modal-actions">
        <button type="button" class="btn-sm" id="set-oracle-save" aria-label="Apply oracle anchor">Apply anchor</button>
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
): void {
  document.querySelectorAll(".modal-backdrop[data-settings-modal]").forEach((el) => el.remove());
  const bd = document.createElement("div");
  bd.className = "modal-backdrop";
  bd.dataset.settingsModal = "1";
  bd.innerHTML = renderUnifiedSettingsModal(state, layout, theme);
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
  const syncPreviewGate = () => {
    if (!quickInp || !previewInp) return;
    const on = quickInp.checked;
    previewInp.disabled = !on;
    previewInp.closest("label")?.classList.toggle("ov-disabled", !on);
    if (!on) previewInp.checked = false;
  };
  syncPreviewGate();
  quickInp?.addEventListener("change", (e) => {
    syncPreviewGate();
    actions.onChartOverlays({
      quickOrder: (e.target as HTMLInputElement).checked,
      orderPreview: previewInp?.checked ?? false,
    });
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
}
