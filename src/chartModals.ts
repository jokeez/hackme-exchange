import type { ChartOverlaySettings, ChartSettings, DemoState, IndicatorConfig, MultiChartLayout, Timeframe } from "./types";
import { DEFAULT_CHART_OVERLAYS, DEFAULT_INDICATOR_CONFIG, TIMEFRAMES } from "./types";
import { sanitizeCandleStyle, sanitizeChartSettings, sanitizeCssColor, sanitizeIndicatorConfig } from "./sanitize";

type SaveCb = (patch: Partial<DemoState>) => void;

function backdrop(html: string, onClose: () => void): HTMLElement {
  const bd = document.createElement("div");
  bd.className = "modal-backdrop";
  bd.innerHTML = html;
  bd.addEventListener("click", (e) => { if (e.target === bd) onClose(); });
  bd.querySelector(".modal-x")?.addEventListener("click", onClose);
  document.body.appendChild(bd);
  return bd;
}

export function showChartStyleModal(state: DemoState, onSave: SaveCb): void {
  const s = state.chartSettings;
  const cs = s.candleStyle;
  const bd = backdrop(`<div class="modal glass modal-wide modal-tabs">
    <div class="modal-head"><h3>Chart Style</h3><button type="button" class="modal-x">×</button></div>
    <nav class="modal-nav">
      <button type="button" class="active" data-tab="symbol">Symbol</button>
      <button type="button" data-tab="background">Background</button>
    </nav>
    <div class="modal-pane" id="pane-symbol">
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
    <div class="modal-pane hidden" id="pane-background">
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
  </div>`, () => bd.remove());

  bd.querySelectorAll(".modal-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      bd.querySelectorAll(".modal-nav button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = (btn as HTMLElement).dataset.tab;
      bd.querySelector("#pane-symbol")?.classList.toggle("hidden", tab !== "symbol");
      bd.querySelector("#pane-background")?.classList.toggle("hidden", tab !== "background");
    });
  });

  bd.querySelector("#modal-close")?.addEventListener("click", () => bd.remove());
  bd.querySelector("#modal-reset")?.addEventListener("click", () => {
    onSave({ chartSettings: structuredClone({ ...s, candleScheme: "classic", logScale: false, gridVisible: true, gridOpacity: 0.07, bgGradient: true, candleStyle: { bullBody: "#00e676", bearBody: "#ff5252", bullWick: "#00e676", bearWick: "#ff5252", bullBorder: "#00e676", bearBorder: "#ff5252" } }) });
    bd.remove();
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
    bd.remove();
  });
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

  const bd = backdrop(`<div class="modal glass modal-wide">
    <div class="modal-head"><h3>Main Indicator · MA</h3><button type="button" class="modal-x">×</button></div>
    <div class="ind-config">${rows}</div>
    <div class="modal-actions">
      <button type="button" class="btn-sm" id="modal-close">Cancel</button>
      <button type="button" class="btn-primary" id="modal-save">Save</button>
    </div>
  </div>`, () => bd.remove());

  bd.querySelector("#modal-close")?.addEventListener("click", () => bd.remove());
  bd.querySelector("#modal-save")?.addEventListener("click", () => {
    const ma = cfg.ma.map((m, i) => ({
      enabled: (bd.querySelector(`#ma-en-${i}`) as HTMLInputElement).checked,
      period: Math.min(500, Math.max(1, Number((bd.querySelector(`#ma-p-${i}`) as HTMLInputElement).value) || m.period)),
      color: (bd.querySelector(`#ma-c-${i}`) as HTMLInputElement).value,
    }));
    onSave({ indicatorConfig: sanitizeIndicatorConfig({ ma }) });
    bd.remove();
  });
}

export function showGoToDateModal(onConfirm: (ts: number) => void): void {
  const now = new Date();
  const iso = now.toISOString().slice(0, 16);
  const bd = backdrop(`<div class="modal glass">
    <div class="modal-head"><h3>Go to Date</h3><button type="button" class="modal-x">×</button></div>
    <label>Date & time <input id="goto-dt" class="inp mono" type="datetime-local" value="${iso}" /></label>
    <div class="modal-actions">
      <button type="button" class="btn-sm" id="modal-close">Close</button>
      <button type="button" class="btn-primary" id="modal-save">Confirm</button>
    </div>
  </div>`, () => bd.remove());

  bd.querySelector("#modal-close")?.addEventListener("click", () => bd.remove());
  bd.querySelector("#modal-save")?.addEventListener("click", () => {
    const v = (bd.querySelector("#goto-dt") as HTMLInputElement).value;
    const ts = Math.floor(new Date(v).getTime() / 1000);
    if (Number.isFinite(ts)) onConfirm(ts);
    bd.remove();
  });
}

export function showOverlayMenu(state: DemoState, anchor: HTMLElement, onSave: SaveCb): void {
  const o = state.chartOverlays;
  const menu = document.createElement("div");
  menu.className = "pop-menu glass";
  menu.innerHTML = `
    <label><input type="checkbox" id="ov-vol" ${o.showVolume ? "checked" : ""} /> Volume</label>
    <label><input type="checkbox" id="ov-orders" ${o.showOrderLines ? "checked" : ""} /> Order lines</label>
    <label><input type="checkbox" id="ov-last" ${o.showLastPrice ? "checked" : ""} /> Last price line</label>
    <label><input type="checkbox" id="ov-preview" ${o.orderPreview ? "checked" : ""} /> Order preview</label>
    <label><input type="checkbox" id="ov-quick" ${o.quickOrder ? "checked" : ""} /> Quick order</label>`;
  const r = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${r.bottom + 4}px`;
  menu.style.left = `${r.left}px`;
  menu.style.zIndex = "999";
  document.body.appendChild(menu);

  const close = () => menu.remove();
  const apply = () => {
    const patch: ChartOverlaySettings = {
      showVolume: (menu.querySelector("#ov-vol") as HTMLInputElement).checked,
      showOrderLines: (menu.querySelector("#ov-orders") as HTMLInputElement).checked,
      showLastPrice: (menu.querySelector("#ov-last") as HTMLInputElement).checked,
      orderPreview: (menu.querySelector("#ov-preview") as HTMLInputElement).checked,
      quickOrder: (menu.querySelector("#ov-quick") as HTMLInputElement).checked,
    };
    onSave({ chartOverlays: patch });
    close();
  };
  menu.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", apply));
  setTimeout(() => document.addEventListener("click", function h(e) {
    if (!menu.contains(e.target as Node) && e.target !== anchor) { close(); document.removeEventListener("click", h); }
  }), 0);
}

export function showMultiChartPicker(state: DemoState, anchor: HTMLElement, onSave: SaveCb): void {
  const layouts: { id: MultiChartLayout; label: string; icon: string }[] = [
    { id: "1", label: "1 chart", icon: "▢" },
    { id: "2v", label: "2 vertical", icon: "▥" },
    { id: "2h", label: "2 horizontal", icon: "▤" },
    { id: "4", label: "2×2 grid", icon: "⊞" },
  ];
  const menu = document.createElement("div");
  menu.className = "pop-menu glass multi-picker";
  menu.innerHTML = `<p class="muted small">Multi Chart</p>${layouts
    .map((l) => `<button type="button" class="mc-opt ${state.multiChartLayout === l.id ? "active" : ""}" data-l="${l.id}"><span>${l.icon}</span>${l.label}</button>`)
    .join("")}`;
  const r = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${r.bottom + 4}px`;
  menu.style.left = `${Math.max(8, r.left - 80)}px`;
  menu.style.zIndex = "999";
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
