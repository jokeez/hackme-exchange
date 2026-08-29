import { formatPrice } from "./format";
import { escapeHtml } from "./sanitize";

export type QuickOrderHandlers = {
  baseSymbol: string;
  quoteSymbol: string;
  defaultAmount: number;
  onPlace: (side: "buy" | "sell", price: number, amount: number) => void;
  onSidePreview?: (side: "buy" | "sell" | null) => void;
  onClose?: () => void;
};

let openPopup: HTMLElement | null = null;
let dismissHandler: ((e: MouseEvent) => void) | null = null;

export function closeQuickOrderPopup(): void {
  if (openPopup) {
    openPopup.remove();
    openPopup = null;
  }
  if (dismissHandler) {
    document.removeEventListener("mousedown", dismissHandler, true);
    document.removeEventListener("keydown", onEsc, true);
    dismissHandler = null;
  }
}

function onEsc(e: KeyboardEvent): void {
  if (e.key === "Escape") closeQuickOrderPopup();
}

export function showQuickOrderPopup(
  clientX: number,
  clientY: number,
  price: number,
  handlers: QuickOrderHandlers,
): void {
  closeQuickOrderPopup();
  const priceStr = formatPrice(price);
  const defAmt = handlers.defaultAmount > 0 ? String(handlers.defaultAmount) : "";

  const pop = document.createElement("div");
  pop.className = "chart-quick-order glass";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", `Quick order at ${priceStr}`);
  pop.innerHTML = `
    <div class="cqo-head">
      <span class="mono cqo-price">${priceStr}</span>
      <span class="muted small">${escapeHtml(handlers.baseSymbol)}/${escapeHtml(handlers.quoteSymbol)}</span>
      <button type="button" class="modal-x cqo-close" aria-label="Close">×</button>
    </div>
    <label class="cqo-amt-label muted small">Amount (${escapeHtml(handlers.baseSymbol)})
      <input type="number" class="inp mono cqo-amt" min="0" step="any" value="${defAmt}" placeholder="0" />
    </label>
    <div class="cqo-actions">
      <button type="button" class="btn-primary buy cqo-buy">Buy</button>
      <button type="button" class="btn-primary sell cqo-sell">Sell</button>
    </div>
    <p class="muted small cqo-hint">Limit · uses order panel TIF</p>`;

  document.body.appendChild(pop);
  openPopup = pop;

  const pad = 8;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let left = clientX + 12;
  let top = clientY - h / 2;
  if (left + w > window.innerWidth - pad) left = clientX - w - 12;
  if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
  if (top < pad) top = pad;
  if (left < pad) left = pad;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  const amtInp = pop.querySelector(".cqo-amt") as HTMLInputElement;
  const close = () => {
    handlers.onSidePreview?.(null);
    handlers.onClose?.();
    closeQuickOrderPopup();
  };

  pop.querySelector(".cqo-close")?.addEventListener("click", close);
  pop.querySelector(".cqo-buy")?.addEventListener("mouseenter", () => handlers.onSidePreview?.("buy"));
  pop.querySelector(".cqo-sell")?.addEventListener("mouseenter", () => handlers.onSidePreview?.("sell"));
  pop.querySelector(".cqo-buy")?.addEventListener("click", () => {
    const amt = Number(amtInp.value);
    if (!(amt > 0)) {
      amtInp.focus();
      amtInp.classList.add("invalid");
      return;
    }
    handlers.onPlace("buy", price, amt);
    closeQuickOrderPopup();
  });
  pop.querySelector(".cqo-sell")?.addEventListener("click", () => {
    const amt = Number(amtInp.value);
    if (!(amt > 0)) {
      amtInp.focus();
      amtInp.classList.add("invalid");
      return;
    }
    handlers.onPlace("sell", price, amt);
    closeQuickOrderPopup();
  });
  amtInp.addEventListener("input", () => amtInp.classList.remove("invalid"));
  amtInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (pop.querySelector(".cqo-buy") as HTMLButtonElement)?.click();
    }
  });

  dismissHandler = (e: MouseEvent) => {
    if (openPopup && !openPopup.contains(e.target as Node)) close();
  };
  setTimeout(() => {
    document.addEventListener("mousedown", dismissHandler!, true);
    document.addEventListener("keydown", onEsc, true);
  }, 0);
  amtInp.focus();
  amtInp.select();
}
