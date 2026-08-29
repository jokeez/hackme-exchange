import { formatPrice } from "./format";
import { hapticError, hapticLight, hapticSuccess } from "./haptic";
import { escapeHtml } from "./sanitize";

export type QuickOrderValidation = {
  validate: (side: "buy" | "sell", amount: number) => { ok: true } | { ok: false; reason: string };
  hintForSide?: (side: "buy" | "sell", amount: number) => string;
};

export type QuickOrderHandlers = {
  baseSymbol: string;
  quoteSymbol: string;
  defaultAmount: number;
  mobileSheet?: boolean;
  skipConfirm?: boolean;
  validate?: QuickOrderValidation;
  onPlace: (side: "buy" | "sell", price: number, amount: number) => void;
  onSidePreview?: (side: "buy" | "sell" | null) => void;
  onClose?: () => void;
};

let openPopup: HTMLElement | null = null;
let openBackdrop: HTMLElement | null = null;
let dismissHandler: ((e: MouseEvent) => void) | null = null;
let dismissCallback: (() => void) | null = null;

export function closeQuickOrderPopup(): void {
  const cb = dismissCallback;
  dismissCallback = null;
  if (openBackdrop) {
    openBackdrop.remove();
    openBackdrop = null;
  }
  if (openPopup) {
    openPopup.remove();
    openPopup = null;
  }
  document.body.classList.remove("cqo-sheet-open");
  if (dismissHandler) {
    document.removeEventListener("mousedown", dismissHandler, true);
    document.removeEventListener("keydown", onEsc, true);
    dismissHandler = null;
  }
  cb?.();
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
  const sheet = !!handlers.mobileSheet;

  if (sheet) {
    const backdrop = document.createElement("div");
    backdrop.className = "cqo-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);
    openBackdrop = backdrop;
    backdrop.addEventListener("click", () => closeQuickOrderPopup());
  }

  const pop = document.createElement("div");
  pop.className = `chart-quick-order glass${sheet ? " sheet" : ""}`;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", `Quick order at ${priceStr}`);
  pop.innerHTML = `
    <div class="cqo-head">
      <span class="mono cqo-price">${priceStr}</span>
      <span class="muted small">${escapeHtml(handlers.baseSymbol)}/${escapeHtml(handlers.quoteSymbol)}</span>
      <button type="button" class="modal-x cqo-close" aria-label="Close">×</button>
    </div>
    <div class="cqo-form">
      <label class="cqo-amt-label muted small">Amount (${escapeHtml(handlers.baseSymbol)})
        <input type="number" class="inp mono cqo-amt" min="0" step="any" value="${defAmt}" placeholder="0" inputmode="decimal" />
      </label>
      <p class="muted small cqo-balance-hint" hidden></p>
      <p class="small cqo-err" role="alert" hidden></p>
      <div class="cqo-actions">
        <button type="button" class="btn-primary buy cqo-buy">Buy</button>
        <button type="button" class="btn-primary sell cqo-sell">Sell</button>
      </div>
      <p class="muted small cqo-hint">Limit · confirm before place</p>
    </div>
    <div class="cqo-confirm hidden">
      <p class="cqo-confirm-text"></p>
      <div class="cqo-confirm-actions">
        <button type="button" class="btn-primary cqo-confirm-btn">Confirm</button>
        <button type="button" class="btn-ghost cqo-back">Back</button>
      </div>
    </div>`;

  document.body.appendChild(pop);
  openPopup = pop;

  if (!sheet) {
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
  }

  const formEl = pop.querySelector(".cqo-form") as HTMLElement;
  const confirmEl = pop.querySelector(".cqo-confirm") as HTMLElement;
  const confirmText = pop.querySelector(".cqo-confirm-text") as HTMLElement;
  const confirmBtn = pop.querySelector(".cqo-confirm-btn") as HTMLButtonElement;
  const backBtn = pop.querySelector(".cqo-back") as HTMLButtonElement;
  const errEl = pop.querySelector(".cqo-err") as HTMLElement;
  const hintEl = pop.querySelector(".cqo-balance-hint") as HTMLElement;
  const amtInp = pop.querySelector(".cqo-amt") as HTMLInputElement;
  let hoverSide: "buy" | "sell" | null = null;
  let pendingSide: "buy" | "sell" | null = null;
  let pendingAmt = 0;

  const showErr = (msg: string) => {
    errEl.textContent = msg;
    errEl.hidden = !msg;
    if (msg) {
      amtInp.classList.add("invalid");
      hapticError();
    }
  };

  const clearErr = () => {
    errEl.hidden = true;
    errEl.textContent = "";
    amtInp.classList.remove("invalid");
  };

  const refreshHint = (side: "buy" | "sell" | null) => {
    if (!handlers.validate?.hintForSide || !side) {
      hintEl.hidden = true;
      return;
    }
    const amt = Number(amtInp.value);
    const hint = handlers.validate.hintForSide(side, Number.isFinite(amt) && amt > 0 ? amt : 0);
    if (!hint) {
      hintEl.hidden = true;
      return;
    }
    hintEl.textContent = hint;
    hintEl.hidden = false;
  };

  const finish = () => {
    handlers.onSidePreview?.(null);
    handlers.onClose?.();
    dismissCallback = null;
    if (openBackdrop) {
      openBackdrop.remove();
      openBackdrop = null;
    }
    if (openPopup) {
      openPopup.remove();
      openPopup = null;
    }
    document.body.classList.remove("cqo-sheet-open");
    if (dismissHandler) {
      document.removeEventListener("mousedown", dismissHandler, true);
      document.removeEventListener("keydown", onEsc, true);
      dismissHandler = null;
    }
  };
  dismissCallback = finish;

  const showForm = () => {
    pendingSide = null;
    confirmEl.classList.add("hidden");
    formEl.classList.remove("hidden");
    clearErr();
  };

  const showConfirm = (side: "buy" | "sell", amt: number) => {
    pendingSide = side;
    pendingAmt = amt;
    const verb = side === "buy" ? "Buy" : "Sell";
    confirmText.textContent = `${verb} ${amt} ${handlers.baseSymbol} @ ${priceStr} ${handlers.quoteSymbol}`;
    confirmBtn.textContent = `Confirm ${verb}`;
    confirmBtn.classList.toggle("buy", side === "buy");
    confirmBtn.classList.toggle("sell", side === "sell");
    formEl.classList.add("hidden");
    confirmEl.classList.remove("hidden");
    hapticLight();
    confirmBtn.focus();
  };

  const place = (side: "buy" | "sell") => {
    const amt = Number(amtInp.value);
    if (!(amt > 0)) {
      showErr("Enter amount > 0");
      amtInp.focus();
      return;
    }
    clearErr();
    if (handlers.validate) {
      const check = handlers.validate.validate(side, amt);
      if (!check.ok) {
        showErr(check.reason);
        return;
      }
    }
    if (handlers.skipConfirm) {
      handlers.onPlace(side, price, amt);
      hapticSuccess();
      finish();
      return;
    }
    showConfirm(side, amt);
  };

  const confirmPlace = () => {
    if (!pendingSide || !(pendingAmt > 0)) return;
    handlers.onPlace(pendingSide, price, pendingAmt);
    hapticSuccess();
    finish();
  };

  pop.querySelector(".cqo-close")?.addEventListener("click", finish);
  const actions = pop.querySelector(".cqo-actions");
  pop.querySelector(".cqo-buy")?.addEventListener("mouseenter", () => {
    hoverSide = "buy";
    handlers.onSidePreview?.("buy");
    refreshHint("buy");
  });
  pop.querySelector(".cqo-sell")?.addEventListener("mouseenter", () => {
    hoverSide = "sell";
    handlers.onSidePreview?.("sell");
    refreshHint("sell");
  });
  pop.querySelector(".cqo-buy")?.addEventListener("click", () => place("buy"));
  pop.querySelector(".cqo-sell")?.addEventListener("click", () => place("sell"));
  actions?.addEventListener("mouseleave", () => {
    hoverSide = null;
    handlers.onSidePreview?.(null);
    refreshHint(null);
  });
  confirmBtn.addEventListener("click", confirmPlace);
  backBtn.addEventListener("click", showForm);
  amtInp.addEventListener("input", () => {
    clearErr();
    refreshHint(hoverSide);
  });
  amtInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (pendingSide) confirmPlace();
      else place(hoverSide ?? "buy");
    }
  });

  dismissHandler = (e: MouseEvent) => {
    if (openPopup && !openPopup.contains(e.target as Node)) finish();
  };
  setTimeout(() => {
    document.addEventListener("mousedown", dismissHandler!, true);
    document.addEventListener("keydown", onEsc, true);
  }, 0);
  if (sheet) {
    document.body.classList.add("cqo-sheet-open");
    refreshHint(activeSideFromDom());
  } else {
    amtInp.focus();
    amtInp.select();
  }
}

function activeSideFromDom(): "buy" | "sell" {
  const sell = document.querySelector("#trade-side-toggle .ts.sell.active");
  return sell ? "sell" : "buy";
}
