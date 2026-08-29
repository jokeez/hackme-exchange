import type { ChartOverlaySettings, ChartSettings, DemoState, IndicatorConfig, MultiChartLayout, Timeframe } from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_CHART_SETTINGS, DEFAULT_INDICATOR_CONFIG, TIMEFRAMES } from "./types";
import { sanitizeCandleStyle, sanitizeChartSettings, sanitizeCssColor, sanitizeIndicatorConfig } from "./sanitize";

type SaveCb = (patch: Partial<DemoState>) => void;

function positionPopMenu(anchor: HTMLElement, menu: HTMLElement, menuWidth = 176): void {
  const r = anchor.getBoundingClientRect();
  const w = menuWidth;
  menu.style.position = "fixed";
  menu.style.top = `${Math.min(r.bottom + 6, window.innerHeight - 48)}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
  menu.style.zIndex = "1200";
  menu.style.maxHeight = `${Math.max(120, window.innerHeight - r.bottom - 16)}px`;
  menu.style.overflowY = "auto";
}

function closeChartModals(): void {
  document.querySelectorAll(".modal-backdrop[data-chart-modal]").forEach((el) => el.remove());
}

function backdrop(html: string): HTMLElement {
  closeChartModals();
  const bd = document.createElement("div");
  bd.className = "modal-backdrop";
  bd.dataset.chartModal = "1";
  bd.innerHTML = html;
  const dismiss = () => {
    window.removeEventListener("keydown", onKey);
    bd.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    }
  };
  bd.addEventListener("click", (e) => {
    if (e.target === bd) dismiss();
  });
  bd.querySelector(".modal-x")?.addEventListener("click", dismiss);
  document.body.appendChild(bd);
  window.addEventListener("keydown", onKey);
  // Callers that only `bd.remove()` still need listener cleanup — MutationObserver-light:
  const obs = new MutationObserver(() => {
    if (!document.body.contains(bd)) {
      window.removeEventListener("keydown", onKey);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });
  (bd as HTMLElement & { dismissChartModal?: () => void }).dismissChartModal = dismiss;
  return bd;
}

export function showChartStyleModal(state: DemoState, onSave: SaveCb): void {
  const s = state.chartSettings;
  const cs = s.candleStyle;
  const bd = backdrop(
    `<div class="modal glass modal-wide modal-tabs" role="dialog" aria-modal="true" aria-labelledby="chart-style-title">
    <div class="modal-head"><h3 id="chart-style-title">Chart Style</h3><button type="button" class="modal-x" aria-label="Close">×</button></div>
    <nav class="modal-nav" role="tablist" aria-label="Chart style sections">
      <button type="button" class="active" data-tab="symbol" role="tab" aria-selected="true">Symbol</button>
      <button type="button" data-tab="background" role="tab" aria-selected="false">Background</button>
    </nav>
    <div class="modal-pane" id="pane-symbol" role="tabpanel">
      <label>Chart type
        <select id="cs-scheme" class="inp mono">
          ${(["classic", "blue", "neon", "mono"] as const).map((x) => `<option value="${x}" ${s.candleScheme === x ? "selected" : ""}>${x}</option>`).join("")}
        </select>
      </label>
      <div class="color-grid">
        <label>Bull body <input type="color" id="cs-bull" value="${sanitizeCssColor(cs.bullBody, "#00e676")}" /></label>
        <label>Bear body <input type="color" id="cs-bear" value="${sanitizeCssColor(cs.bearBody, "#ff5252")}" /></label>
        <label>Bull wick <input type="color" id="cs-bull-w" value="${sanitizeCssColor(cs.bullWick, "#00e676")}" /></label>
        <label>Bear wick <input type="color" id="cs-bear-w" value="${sanitizeCssColor(cs.bearWick, "#ff5252")}" /></label>
      </div>
      <label><input type="checkbox" id="cs-log" ${s.logScale ? "checked" : ""} /> Logarithmic scale</label>
    </div>
    <div class="modal-pane hidden" id="pane-background" role="tabpanel">
      <label><input type="checkbox" id="cs-grid" ${s.gridVisible ? "checked" : ""} /> Show grid</label>
      <label>Grid opacity <input id="cs-grid-op" class="inp mono" type="range" min="0.02" max="0.2" step="0.01" value="${
        Number.isFinite(s.gridOpacity) ? Math.min(0.2, Math.max(0.02, s.gridOpacity)) : 0.07
      }" /></label>
      <label><input type="checkbox" id="cs-grad" ${s.bgGradient ? "checked" : ""} /> Gradient background</label>
    </div>
    <p class="muted small modal-note">Custom colors override scheme presets until Reset.</p>
    <div class="modal-actions">
      <button type="button" class="btn-sm" id="modal-reset">Reset</button>
      <button type="button" class="btn-sm" id="modal-close">Cancel</button>
      <button type="button" class="btn-primary" id="modal-save">Save</button>
    </div>
  </div>`,
  );

  const dismiss = () => (bd as HTMLElement & { dismissChartModal?: () => void }).dismissChartModal?.() ?? bd.remove();

  bd.querySelectorAll(".modal-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      bd.querySelectorAll(".modal-nav button").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const tab = (btn as HTMLElement).dataset.tab;
      bd.querySelector("#pane-symbol")?.classList.toggle("hidden", tab !== "symbol");
      bd.querySelector("#pane-background")?.classList.toggle("hidden", tab !== "background");
    });
  });

  bd.querySelector("#modal-close")?.addEventListener("click", dismiss);
  bd.querySelector("#modal-reset")?.addEventListener("click", () => {
    onSave({
      chartSettings: sanitizeChartSettings({
        ...structuredClone(DEFAULT_CHART_SETTINGS),
        indicators: { ...s.indicators },
      }),
    });
    dismiss();
  });
  bd.querySelector("#modal-save")?.addEventListener("click", () => {
    onSave({
      chartSettings: sanitizeChartSettings({
        ...s,
        candleScheme: (bd.querySelector("#cs-scheme") as HTMLSelectElement).value as ChartSettings["candleScheme"],
        logScale: (bd.querySelector("#cs-log") as HTMLInputElement).checked,
        gridVisible: (bd.querySelector("#cs-grid") as HTMLInputElement).checked,
        gridOpacity: Number((bd.querySelector("#cs-grid-op") as HTMLInputElement).value),
        bgGradient: (bd.querySelector("#cs-grad") as HTMLInputElement).checked,
        candleStyle: sanitizeCandleStyle({
          bullBody: (bd.querySelector("#cs-bull") as HTMLInputElement).value,
          bearBody: (bd.querySelector("#cs-bear") as HTMLInputElement).value,
          bullWick: (bd.querySelector("#cs-bull-w") as HTMLInputElement).value,
          bearWick: (bd.querySelector("#cs-bear-w") as HTMLInputElement).value,
          bullBorder: (bd.querySelector("#cs-bull") as HTMLInputElement).value,
          bearBorder: (bd.querySelector("#cs-bear") as HTMLInputElement).value,
        }),
      }),
    });
    dismiss();
  });
  (bd.querySelector("#cs-scheme") as HTMLSelectElement | null)?.focus();
}

export function showIndicatorModal(state: DemoState, onSave: SaveCb): void {
  const cfg = state.indicatorConfig;
  const rows = cfg.ma
    .map(
      (m, i) => `<div class="ind-row">
        <input type="checkbox" id="ma-en-${i}" ${m.enabled ? "checked" : ""} />
        <span>MA${i + 1}</span>
        <input class="inp mono ind-period" id="ma-p-${i}" type="number" min="1" max="500" value="${m.period}" />
        <input type="color" id="ma-c-${i}" value="${sanitizeCssColor(m.color, "#fcd535")}" />
      </div>`,
    )
    .join("");

  const bd = backdrop(
    `<div class="modal glass modal-wide" role="dialog" aria-modal="true" aria-labelledby="ind-title">
    <div class="modal-head"><h3 id="ind-title">Main Indicator · MA</h3><button type="button" class="modal-x" aria-label="Close">×</button></div>
    <div class="ind-config">${rows}</div>
    <div class="modal-actions">
      <button type="button" class="btn-sm" id="modal-reset">Reset</button>
      <button type="button" class="btn-sm" id="modal-close">Cancel</button>
      <button type="button" class="btn-primary" id="modal-save">Save</button>
    </div>
  </div>`,
  );

  const dismiss = () => (bd as HTMLElement & { dismissChartModal?: () => void }).dismissChartModal?.() ?? bd.remove();

  bd.querySelector("#modal-close")?.addEventListener("click", dismiss);
  bd.querySelector("#modal-reset")?.addEventListener("click", () => {
    onSave({ indicatorConfig: structuredClone(DEFAULT_INDICATOR_CONFIG) });
    dismiss();
  });
  bd.querySelector("#modal-save")?.addEventListener("click", () => {
    const ma = cfg.ma.map((m, i) => ({
      enabled: (bd.querySelector(`#ma-en-${i}`) as HTMLInputElement).checked,
      period: Math.min(500, Math.max(1, Number((bd.querySelector(`#ma-p-${i}`) as HTMLInputElement).value) || m.period)),
      color: (bd.querySelector(`#ma-c-${i}`) as HTMLInputElement).value,
    }));
    onSave({ indicatorConfig: sanitizeIndicatorConfig({ ma }) });
    dismiss();
  });
}

export function showGoToDateModal(onConfirm: (ts: number) => void): void {
  const now = new Date();
  const iso = now.toISOString().slice(0, 16);
  const bd = backdrop(
    `<div class="modal glass" role="dialog" aria-modal="true" aria-labelledby="goto-title">
    <div class="modal-head"><h3 id="goto-title">Go to Date</h3><button type="button" class="modal-x" aria-label="Close">×</button></div>
    <label>Date & time <input id="goto-dt" class="inp mono" type="datetime-local" value="${iso}" /></label>
    <div class="modal-actions">
      <button type="button" class="btn-sm" id="modal-close">Close</button>
      <button type="button" class="btn-primary" id="modal-save">Confirm</button>
    </div>
  </div>`,
  );

  const dismiss = () => (bd as HTMLElement & { dismissChartModal?: () => void }).dismissChartModal?.() ?? bd.remove();

  bd.querySelector("#modal-close")?.addEventListener("click", dismiss);
  bd.querySelector("#modal-save")?.addEventListener("click", () => {
    const v = (bd.querySelector("#goto-dt") as HTMLInputElement).value;
    const ts = Math.floor(new Date(v).getTime() / 1000);
    if (Number.isFinite(ts)) onConfirm(ts);
    dismiss();
  });
  (bd.querySelector("#goto-dt") as HTMLInputElement | null)?.focus();
}

export function showOverlayMenu(
  state: DemoState,
  anchor: HTMLElement,
  onSave: SaveCb,
  onClose?: () => void,
): void {
  document.querySelectorAll(".pop-menu").forEach((el) => el.remove());
  const o = state.chartOverlays;
  const menu = document.createElement("div");
  menu.className = "pop-menu glass overlay-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Chart overlays");
  menu.innerHTML = `
    <p class="pop-menu-title">Overlays</p>
    <label><input type="checkbox" id="ov-vol" ${o.showVolume ? "checked" : ""} /> Volume</label>
    <label><input type="checkbox" id="ov-orders" ${o.showOrderLines ? "checked" : ""} /> Order lines</label>
    <label><input type="checkbox" id="ov-last" ${o.showLastPrice ? "checked" : ""} /> Last price line</label>
    <label><input type="checkbox" id="ov-preview" ${o.orderPreview ? "checked" : ""} /> Order preview</label>
    <label><input type="checkbox" id="ov-quick" ${o.quickOrder ? "checked" : ""} /> Quick order</label>`;
  const prevTitle = anchor.getAttribute("title");
  if (prevTitle) anchor.removeAttribute("title");
  positionPopMenu(anchor, menu, 188);
  document.body.appendChild(menu);

  const close = () => {
    menu.remove();
    if (prevTitle) anchor.setAttribute("title", prevTitle);
    onClose?.();
  };
  const apply = () => {
    const patch: ChartOverlaySettings = {
      showVolume: (menu.querySelector("#ov-vol") as HTMLInputElement).checked,
      showOrderLines: (menu.querySelector("#ov-orders") as HTMLInputElement).checked,
      showLastPrice: (menu.querySelector("#ov-last") as HTMLInputElement).checked,
      orderPreview: (menu.querySelector("#ov-preview") as HTMLInputElement).checked,
      quickOrder: (menu.querySelector("#ov-quick") as HTMLInputElement).checked,
    };
    // Keep menu open so multiple overlays can be toggled in one pass.
    onSave({ chartOverlays: patch });
  };
  menu.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", apply));
  setTimeout(() => document.addEventListener("click", function h(e) {
    if (!menu.contains(e.target as Node) && e.target !== anchor && !anchor.contains(e.target as Node)) {
      close();
      document.removeEventListener("click", h);
    }
  }), 0);
}

export function showMultiChartPicker(state: DemoState, anchor: HTMLElement, onSave: SaveCb): void {
  document.querySelectorAll(".pop-menu").forEach((el) => el.remove());
  const layouts: { id: MultiChartLayout; label: string; icon: string }[] = [
    { id: "1", label: "1 chart", icon: "▢" },
    { id: "2v", label: "2 vertical", icon: "▥" },
    { id: "2h", label: "2 horizontal", icon: "▤" },
    { id: "4", label: "2×2 grid", icon: "⊞" },
  ];
  const menu = document.createElement("div");
  menu.className = "pop-menu glass multi-picker";
  menu.innerHTML = `<p class="pop-menu-title">Multi Chart</p>
    <p class="pop-menu-hint muted small">Independent panes — zoom &amp; scroll each chart separately.</p>${layouts
    .map((l) => `<button type="button" class="mc-opt ${state.multiChartLayout === l.id ? "active" : ""}" data-l="${l.id}"><span>${l.icon}</span>${l.label}</button>`)
    .join("")}`;
  positionPopMenu(anchor, menu, 176);
  document.body.appendChild(menu);
  menu.querySelectorAll(".mc-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.l as MultiChartLayout;
      onSave({ multiChartLayout: id, multiChart: id !== "1" });
      menu.remove();
    });
  });
  setTimeout(() => document.addEventListener("click", function h(e) {
    if (!menu.contains(e.target as Node) && e.target !== anchor) { menu.remove(); document.removeEventListener("click", h); }
  }), 0);
}

export function defaultOverlays(): ChartOverlaySettings {
  return structuredClone(DEFAULT_CHART_OVERLAYS);
}

export function defaultIndicatorConfig(): IndicatorConfig {
  return structuredClone(DEFAULT_INDICATOR_CONFIG);
}

export const EXTRA_CHART_TFS: Timeframe[] = TIMEFRAMES;
