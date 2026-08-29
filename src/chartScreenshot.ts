/** Chart screenshot compositing — single pane or full multi-chart grid. */

export const CHART_SHOT_BG = "#05070d";

export type MultiChartLayout = "1" | "2v" | "2h" | "4";

export type PaneShotInput = {
  hostEl: HTMLElement;
  lwcCanvas: HTMLCanvasElement;
  label: string;
};

export type ChartScreenshotResult = { ok: boolean; panes: number };

export type ChartScreenshotHooks = {
  captureMain: () => HTMLCanvasElement | null;
  restoreMain: () => void;
  captureSecondary: (hostId: string) => HTMLCanvasElement | null;
  mainLabel: () => string;
  secondaryLabel: (hostId: string) => string;
  mainHost: () => HTMLElement | null;
};

const hooks: Partial<ChartScreenshotHooks> = {};

export function registerChartScreenshotHooks(patch: Partial<ChartScreenshotHooks>): void {
  Object.assign(hooks, patch);
}

export function detectMultiChartLayout(split: HTMLElement | null): MultiChartLayout {
  if (!split) return "1";
  if (split.classList.contains("layout-4")) return "4";
  if (split.classList.contains("layout-2h")) return "2h";
  if (split.classList.contains("layout-2v")) return "2v";
  return "1";
}

export function listChartPaneHosts(split: HTMLElement | null): HTMLElement[] {
  if (!split) return [];
  return [...split.querySelectorAll<HTMLElement>(".chart-host")].filter((el) => el.isConnected);
}

function deviceScale(): number {
  return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
}

function hostPixelSize(el: HTMLElement, scale: number): { w: number; h: number } {
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, Math.floor((rect.width > 0 ? rect.width : el.offsetWidth || 1) * scale));
  const h = Math.max(1, Math.floor((rect.height > 0 ? rect.height : el.offsetHeight || 1) * scale));
  return { w, h };
}

/** Paint one pane host: LWC bitmap + draw layer + label/chrome. */
export function renderPaneScreenshot(input: PaneShotInput, scale = deviceScale()): HTMLCanvasElement {
  const { hostEl, lwcCanvas, label } = input;
  const { w, h } = hostPixelSize(hostEl, scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return out;

  ctx.fillStyle = CHART_SHOT_BG;
  ctx.fillRect(0, 0, w, h);

  const inner = hostEl.querySelector(".chart-inner") as HTMLElement | null;
  const drawLayer = hostEl.querySelector(".draw-layer") as HTMLCanvasElement | null;
  const chrome = hostEl.querySelector(".sub-chart-chrome") as HTMLElement | null;

  if (chrome) {
    const pairSel = chrome.querySelector(".sub-pair-select") as HTMLSelectElement | null;
    const tfSel = chrome.querySelector(".sub-tf-select") as HTMLSelectElement | null;
    const chromeLabel =
      pairSel && tfSel
        ? `${pairSel.options[pairSel.selectedIndex]?.text ?? label} · ${tfSel.value}`
        : label;
    ctx.font = `600 ${Math.round(11 * scale)}px JetBrains Mono, monospace`;
    ctx.fillStyle = "rgba(155, 176, 204, 0.92)";
    ctx.fillText(chromeLabel, 8 * scale, 14 * scale);
  }

  const rect = hostEl.getBoundingClientRect();
  const hostW = rect.width > 0 ? rect.width : hostEl.offsetWidth || 1;
  const hostH = rect.height > 0 ? rect.height : hostEl.offsetHeight || 1;

  if (inner) {
    const innerRect = inner.getBoundingClientRect();
    const innerW = innerRect.width > 0 ? innerRect.width : inner.offsetWidth || hostW;
    const innerH = innerRect.height > 0 ? innerRect.height : inner.offsetHeight || hostH;
    const ix = ((innerRect.width > 0 ? innerRect.left : rect.left) - rect.left) * scale;
    const iy = ((innerRect.height > 0 ? innerRect.top : rect.top) - rect.top) * scale;
    const iw = innerW * scale;
    const ih = innerH * scale;
    if (iw > 0 && ih > 0) {
      ctx.drawImage(lwcCanvas, 0, 0, lwcCanvas.width, lwcCanvas.height, ix, iy, iw, ih);
      if (drawLayer && drawLayer.width > 0 && drawLayer.height > 0) {
        ctx.drawImage(drawLayer, ix, iy, iw, ih);
      }
    }
  }

  if (!chrome && label) {
    ctx.font = `600 ${Math.round(13 * scale)}px JetBrains Mono, monospace`;
    ctx.fillStyle = "rgba(155, 176, 204, 0.92)";
    ctx.fillText(label, 12 * scale, 20 * scale);
  }

  return out;
}

/** Composite all pane hosts into one PNG-sized canvas matching on-screen grid. */
export function compositePaneScreenshots(
  split: HTMLElement,
  panes: PaneShotInput[],
  scale = deviceScale(),
): HTMLCanvasElement | null {
  if (!panes.length) return null;
  const splitRect = split.getBoundingClientRect();
  const splitW = splitRect.width > 0 ? splitRect.width : split.offsetWidth || 1;
  const splitH = splitRect.height > 0 ? splitRect.height : split.offsetHeight || 1;
  const W = Math.max(1, Math.floor(splitW * scale));
  const H = Math.max(1, Math.floor(splitH * scale));
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = CHART_SHOT_BG;
  ctx.fillRect(0, 0, W, H);

  for (const pane of panes) {
    const hostRect = pane.hostEl.getBoundingClientRect();
    const hostW = hostRect.width > 0 ? hostRect.width : pane.hostEl.offsetWidth || 1;
    const hostH = hostRect.height > 0 ? hostRect.height : pane.hostEl.offsetHeight || 1;
    const x =
      (hostRect.width > 0 ? hostRect.left - splitRect.left : pane.hostEl.offsetLeft) * scale;
    const y =
      (hostRect.height > 0 ? hostRect.top - splitRect.top : pane.hostEl.offsetTop) * scale;
    const pw = hostW * scale;
    const ph = hostH * scale;
    if (pw < 1 || ph < 1) continue;
    const shot = renderPaneScreenshot(pane, scale);
    ctx.drawImage(shot, x, y, pw, ph);
  }

  return out;
}

export function downloadChartCanvas(canvas: HTMLCanvasElement, paneCount: number): void {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  const suffix = paneCount > 1 ? `-${paneCount}panes` : "";
  link.download = `hackme-chart${suffix}-${Date.now()}.png`;
  link.click();
}

export function runChartScreenshot(): ChartScreenshotResult {
  const mainHost = hooks.mainHost?.() ?? null;
  if (!mainHost || !hooks.captureMain || !hooks.restoreMain || !hooks.mainLabel) {
    return { ok: false, panes: 0 };
  }
  const split = mainHost.closest(".chart-split") as HTMLElement | null;
  const layout = detectMultiChartLayout(split);
  const hosts = listChartPaneHosts(split);

  if (layout === "1" || hosts.length <= 1) {
    const lwc = hooks.captureMain();
    hooks.restoreMain();
    if (!lwc) return { ok: false, panes: 0 };
    const pane = renderPaneScreenshot({ hostEl: mainHost, lwcCanvas: lwc, label: hooks.mainLabel() });
    downloadChartCanvas(pane, 1);
    return { ok: true, panes: 1 };
  }

  if (!split || !hooks.captureSecondary || !hooks.secondaryLabel) {
    hooks.restoreMain();
    return { ok: false, panes: 0 };
  }

  const panes: PaneShotInput[] = [];
  for (const host of hosts) {
    const id = host.id || "chart-host";
    const lwc = id === "chart-host" ? hooks.captureMain() : hooks.captureSecondary(id);
    if (!lwc) continue;
    const label = id === "chart-host" ? hooks.mainLabel() : hooks.secondaryLabel(id);
    panes.push({ hostEl: host, lwcCanvas: lwc, label });
  }
  hooks.restoreMain();

  if (!panes.length) return { ok: false, panes: 0 };
  const composite = compositePaneScreenshots(split, panes);
  if (!composite) return { ok: false, panes: 0 };
  downloadChartCanvas(composite, panes.length);
  return { ok: true, panes: panes.length };
}
