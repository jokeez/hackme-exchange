import { formatPrice } from "./format";
import { escapeHtml } from "./sanitize";
import { escapeDrawingLabel } from "./chartDraw";

export type ChartContextAction =
  | "buy_limit"
  | "buy_stop"
  | "sell_limit"
  | "sell_stop"
  | "create_order"
  | "add_alert"
  | "reset_view"
  | "copy_price"
  | "paste"
  | "object_tree"
  | "remove_indicators"
  | "toggle_marks"
  | "settings";

export type ChartContextHandlers = {
  baseSymbol: string;
  indicatorCount: number;
  marksHidden: boolean;
  onAction: (action: ChartContextAction, price: number) => void;
  onOpen?: (price: number) => void;
  onClose?: () => void;
};

let openMenu: HTMLElement | null = null;
let dismissHandler: ((e: MouseEvent) => void) | null = null;

export function closeChartContextMenu(): void {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
  }
  if (dismissHandler) {
    document.removeEventListener("mousedown", dismissHandler, true);
    document.removeEventListener("keydown", onEsc, true);
    dismissHandler = null;
  }
  lastOnClose?.();
  lastOnClose = null;
}

let lastOnClose: (() => void) | null = null;

function onEsc(e: KeyboardEvent): void {
  if (e.key === "Escape") closeChartContextMenu();
}

export function showChartContextMenu(
  clientX: number,
  clientY: number,
  price: number,
  handlers: ChartContextHandlers,
): void {
  closeChartContextMenu();
  lastOnClose = handlers.onClose ?? null;
  handlers.onOpen?.(price);
  const priceStr = formatPrice(price);
  const base = escapeHtml(handlers.baseSymbol);
  const indN = handlers.indicatorCount;

  const menu = document.createElement("div");
  menu.className = "chart-ctx-menu glass";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button type="button" class="ctx-item buy" data-a="buy_limit">Buy ${base} @ ${priceStr} Limit</button>
    <button type="button" class="ctx-item buy" data-a="buy_stop">Buy ${base} @ ${priceStr} Stop</button>
    <button type="button" class="ctx-item sell" data-a="sell_limit">Sell ${base} @ ${priceStr} Limit</button>
    <button type="button" class="ctx-item sell" data-a="sell_stop">Sell ${base} @ ${priceStr} Stop</button>
    <button type="button" class="ctx-item" data-a="create_order">Create new order…</button>
    <button type="button" class="ctx-item alert" data-a="add_alert">Add Alert @ ${priceStr}</button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-a="reset_view"><span>Reset chart view</span><kbd>Alt+R</kbd></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-a="copy_price">Copy price ${priceStr}</button>
    <button type="button" class="ctx-item" data-a="paste"><span>Paste</span><kbd>Ctrl+V</kbd></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-a="object_tree">Object Tree…</button>
    <button type="button" class="ctx-item" data-a="remove_indicators" ${indN === 0 ? "disabled" : ""}>Remove ${indN} indicator${indN === 1 ? "" : "s"}</button>
    <button type="button" class="ctx-item" data-a="toggle_marks">${handlers.marksHidden ? "Show" : "Hide"} marks on bars</button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-a="settings"><span>⚙ Settings…</span></button>
  `;

  document.body.appendChild(menu);
  openMenu = menu;

  const pad = 8;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = clientX;
  let top = clientY;
  if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
  if (top + mh > window.innerHeight - pad) top = window.innerHeight - mh - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  menu.querySelectorAll(".ctx-item:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.a as ChartContextAction;
      closeChartContextMenu();
      handlers.onAction(action, price);
    });
  });

  dismissHandler = (e: MouseEvent) => {
    if (openMenu && !openMenu.contains(e.target as Node)) closeChartContextMenu();
  };
  setTimeout(() => {
    document.addEventListener("mousedown", dismissHandler!, true);
    document.addEventListener("keydown", onEsc, true);
  }, 0);
}

export function showObjectTreeModal(
  drawings: { id: string; tool: string; text?: string }[],
  onRemove: (id: string) => void,
  onClearAll: () => void,
): void {
  const bd = document.createElement("div");
  bd.className = "modal-backdrop";
  const rows = drawings.length
    ? drawings
        .map(
          (d) => `<tr>
            <td class="mono">${escapeHtml(d.tool)}</td>
            <td class="dim">${escapeDrawingLabel(d.text)}</td>
            <td><button type="button" class="link" data-rm="${escapeHtml(d.id)}">Remove</button></td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No drawings on this pair</td></tr>`;

  bd.innerHTML = `<div class="modal glass">
    <div class="modal-head"><h3>Object Tree</h3><button type="button" class="modal-x">×</button></div>
    <table class="fee-table"><thead><tr><th>Tool</th><th>Note</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="modal-actions">
      <button type="button" class="btn-sm" id="ot-clear" ${drawings.length ? "" : "disabled"}>Remove all</button>
      <button type="button" class="btn-sm" id="ot-close">Close</button>
    </div>
  </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelector(".modal-x")?.addEventListener("click", close);
  bd.querySelector("#ot-close")?.addEventListener("click", close);
  bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
  bd.querySelectorAll("[data-rm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      onRemove((btn as HTMLElement).dataset.rm!);
      close();
    });
  });
  bd.querySelector("#ot-clear")?.addEventListener("click", () => {
    onClearAll();
    close();
  });
}
