import type { OrderKind, PairId, PairMeta, TimeInForce } from "./types";
import { formatBps, type LiquidityRole } from "./fees";
import { formatNum } from "./market";
import { tickInputValue } from "./tick";

export type OrderPanelCtx = {
  pair: PairMeta;
  pairId: PairId;
  mid: number;
  uiType: OrderKind;
  uiTif: TimeInForce;
  uiPostOnly: boolean;
  availQuote: number;
  availBase: number;
  payFeesInHmc: boolean;
  hmcDiscountPct: number;
  feeRole: LiquidityRole;
  feeBps: number;
  showTif: boolean;
  /** Only when health/API reports lab MM seed — never invent. */
  labMmSeeded?: boolean;
  /** Fixture session connected to private lab matching. */
  labLive?: boolean;
};

const PRIMARY_TYPES: { id: OrderKind; label: string }[] = [
  { id: "limit", label: "Limit" },
  { id: "market", label: "Market" },
  { id: "stop_limit", label: "Stop Limit" },
];

const ADVANCED_TYPES: { id: OrderKind; label: string }[] = [
  { id: "stop_market", label: "Stop Market" },
  { id: "trailing_stop", label: "Trailing Stop" },
  { id: "oco", label: "OCO" },
];

export function isAdvancedOrderType(kind: OrderKind): boolean {
  return ADVANCED_TYPES.some((t) => t.id === kind);
}

/** Binance-style field: label + input + unit in one compact row. */
function fld(
  label: string,
  unit: string,
  inputHtml: string,
  extraClass = "",
): string {
  return `<label class="fld ${extraClass}">
    <span class="fld-label">${label}</span>
    ${inputHtml}
    ${unit ? `<span class="fld-unit">${unit}</span>` : ""}
  </label>`;
}

export function renderDualOrderPanel(ctx: OrderPanelCtx): string {
  const {
    pair, pairId, mid, uiType, uiTif, uiPostOnly,
    availQuote, availBase, payFeesInHmc, hmcDiscountPct, feeRole, feeBps, showTif,
    labMmSeeded = false,
    labLive = false,
  } = ctx;
  const midTick = tickInputValue(mid, pairId);
  /** Slightly off mid so default Limit rests on the book (shows under Open orders). Market still fills instantly. */
  const buyLimitTick = restingLimitPrice(mid, "buy", pairId);
  const sellLimitTick = restingLimitPrice(mid, "sell", pairId);
  const showTpsl = (uiType === "market" || uiType === "limit") && !labLive;
  const advanced = isAdvancedOrderType(uiType);
  const mmBadge = labMmSeeded
    ? `<span class="demo-badge sm muted-badge" data-lab-mm-badge="1" title="Live book levels seeded by lab market-maker">LAB MM</span>`
    : "";
  const modeBadge = labLive
    ? `<span class="demo-badge sm meta-compact" title="Private lab matching — not production">LAB</span>`
    : `<span class="demo-badge sm meta-compact" title="Simulated exchange — not real CEX">PAPER</span>`;
  const execHint = labLive ? "lab matching demo" : "paper synthetic demo";

  const sideCol = (side: "buy" | "sell") => {
    const isBuy = side === "buy";
    const stopVal = tickInputValue(mid * (isBuy ? 1.02 : 0.98), pairId);
    const tpVal = tickInputValue(mid * (isBuy ? 1.05 : 0.95), pairId);
    const slLim = tickInputValue(mid * (isBuy ? 0.97 : 1.03), pairId);
    const tpDefault = tickInputValue(mid * (isBuy ? 1.03 : 0.97), pairId);
    const slDefault = tickInputValue(mid * (isBuy ? 0.98 : 1.02), pairId);
    const avail = isBuy ? availQuote : availBase;
    const availAsset = isBuy ? pair.quote : pair.base;
    const hidePrice =
      uiType === "market" ||
      uiType === "trailing_stop" ||
      (uiType === "stop_market" && !isBuy);
    const hideStop = uiType !== "stop_limit" && uiType !== "oco" && uiType !== "stop_market";
    return `<div class="order-col ${side}">
      <div class="order-col-head">
        <h4 class="${side}">${isBuy ? "Buy" : "Sell"} ${pair.base}</h4>
        <button type="button" class="avail-chip mono" data-avail-side="${side}" title="Use 100%">Avbl <b>${formatNum(avail, isBuy ? 4 : 2)} ${availAsset}</b></button>
      </div>
      ${fld(
        `Price (${pair.quote})`,
        "",
        `<span class="price-row"><input id="${side}-price" class="inp mono" type="text" inputmode="decimal" value="${
          uiType === "limit" ? (isBuy ? buyLimitTick : sellLimitTick) : midTick
        }" /><button type="button" class="btn-bbo" data-bbo="${side}" title="Best bid/offer">BBO</button></span>`,
        `field-limit ${hidePrice ? "hidden" : ""}`,
      )}
      ${fld(
        "Stop",
        pair.quote,
        `<input id="${side}-stop" class="inp mono" type="text" inputmode="decimal" value="${stopVal}" />`,
        `field-stop ${hideStop ? "hidden" : ""}`,
      )}
      ${fld(
        "Trail %",
        "%",
        `<input id="${side}-trail" class="inp mono" type="number" step="0.1" value="1.5" />`,
        `field-trail ${uiType !== "trailing_stop" ? "hidden" : ""}`,
      )}
      <div class="field-oco ${uiType !== "oco" ? "hidden" : ""}">
        ${fld("TP limit", pair.quote, `<input id="${side}-oco-tp" class="inp mono" type="text" inputmode="decimal" value="${tpVal}" />`)}
        ${fld("SL limit", pair.quote, `<input id="${side}-oco-sl" class="inp mono" type="text" inputmode="decimal" value="${slLim}" />`)}
      </div>
      ${fld(
        `Amount (${pair.base})`,
        pair.base,
        `<input id="${side}-amt" class="inp mono" type="number" value="1000" min="0" />`,
      )}
      <div class="quick-size">
        <button type="button" data-qs="50" data-side="${side}">+50</button>
        <button type="button" data-qs="100" data-side="${side}">+100</button>
        <button type="button" data-qs="500" data-side="${side}">+500</button>
        <button type="button" data-qs="max" data-side="${side}">MAX</button>
      </div>
      <div class="pct-slider-row">
        <input type="range" class="pct-slider" id="${side}-pct" data-side="${side}" min="0" max="100" step="25" value="0" />
        <div class="pct-marks" data-side="${side}">
          <button type="button" data-pct="0" data-side="${side}">0%</button>
          <button type="button" data-pct="25" data-side="${side}">25%</button>
          <button type="button" data-pct="50" data-side="${side}">50%</button>
          <button type="button" data-pct="75" data-side="${side}">75%</button>
          <button type="button" data-pct="100" data-side="${side}">100%</button>
        </div>
      </div>
      <div class="tpsl-block field-tpsl ${showTpsl ? "" : "hidden"}">
        <label class="fee-toggle mono tpsl-toggle"><input type="checkbox" id="${side}-tpsl" data-tpsl-side="${side}" ${labLive ? "disabled" : ""} /> TP/SL</label>
        <div class="tpsl-fields hidden" id="${side}-tpsl-fields">
          ${fld("TP", pair.quote, `<input id="${side}-tp" class="inp mono" type="text" inputmode="decimal" value="${tpDefault}" />`)}
          ${fld("SL", pair.quote, `<input id="${side}-sl" class="inp mono" type="text" inputmode="decimal" value="${slDefault}" />`)}
        </div>
      </div>
      <p class="preview mono" id="${side}-preview" hidden></p>
      <button type="button" id="btn-${side}" class="exec ${side}" aria-label="${isBuy ? "Buy" : "Sell"} ${pair.base} — ${execHint}">${isBuy ? "Buy" : "Sell"} ${pair.base}</button>
      <p id="${side}-msg" class="msg" hidden></p>
    </div>`;
  };

  return `<div class="order-panel glass-inset binance-order">
    <div class="order-panel-head">
      <div class="order-mode-row">
        <div class="spot-mode-tabs" role="tablist" aria-label="Product mode">
          <span class="spot-mode active" role="tab" aria-selected="true">Spot</span>
        </div>
        <div class="order-head-meta" id="order-head-meta">
          ${modeBadge}
          ${mmBadge}
          <span class="fee-hint muted small meta-compact">Est. <span class="role-badge sm ${feeRole}">${feeRole}</span> · ${formatBps(feeBps)}</span>
          <label class="fee-toggle mono fee-meta" id="fee-row" title="Pay fees in HMC (−${hmcDiscountPct}%)"><input type="checkbox" id="pay-fees-hmc" ${payFeesInHmc ? "checked" : ""} /> HMC</label>
        </div>
      </div>
      <div class="order-type-row">
        <div class="type-tabs scroll-x binance-type-tabs" id="type-tabs" role="tablist" aria-label="Order type">
          ${PRIMARY_TYPES.map((ot) => `<button type="button" class="type ${!advanced && uiType === ot.id ? "active" : ""}" data-type="${ot.id}" role="tab" aria-selected="${!advanced && uiType === ot.id}">${ot.label}</button>`).join("")}
          <label class="type-adv ${advanced ? "active" : ""}" title="Advanced order types">
            <select id="order-type-adv" class="type-adv-select" aria-label="Advanced order type">
              <option value="" disabled ${!advanced ? "selected" : ""}>More</option>
              ${ADVANCED_TYPES.map((ot) => `<option value="${ot.id}" data-type="${ot.id}" ${uiType === ot.id ? "selected" : ""}>${ot.label}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
    </div>
    <div class="trade-side-toggle" id="trade-side-toggle" role="tablist" aria-label="Trade side">
      <button type="button" class="ts buy active" data-mobile-side="buy" role="tab" aria-selected="true">Buy</button>
      <button type="button" class="ts sell" data-mobile-side="sell" role="tab" aria-selected="false">Sell</button>
    </div>
    <div class="tif-row ${showTif ? "" : "hidden"}" id="tif-row">
      <label class="muted small">TIF
        <select id="order-tif" class="inp mono">
          <option value="GTC" ${uiTif === "GTC" ? "selected" : ""}>GTC</option>
          <option value="IOC" ${uiTif === "IOC" ? "selected" : ""}>IOC</option>
          <option value="FOK" ${uiTif === "FOK" ? "selected" : ""}>FOK</option>
        </select>
      </label>
      <label class="fee-toggle mono post-only"><input type="checkbox" id="post-only" ${uiPostOnly ? "checked" : ""} /> Post Only</label>
    </div>
    <div class="dual-order" id="dual-order">${sideCol("buy")}${sideCol("sell")}</div>
  </div>`;
}

export function readOrderForm(side: "buy" | "sell"): {
  amt: number;
  price: number;
  stop: number;
  trail: number;
  tp: number;
  slLimit: number;
  takeProfit: number;
  stopLoss: number;
  tpslEnabled: boolean;
} {
  const g = (id: string) => Number(String((document.getElementById(id) as HTMLInputElement | null)?.value ?? 0).replace(/,/g, ""));
  const tpsl = document.getElementById(`${side}-tpsl`) as HTMLInputElement | null;
  return {
    amt: g(`${side}-amt`),
    price: g(`${side}-price`),
    stop: g(`${side}-stop`),
    trail: g(`${side}-trail`),
    tp: g(`${side}-oco-tp`),
    slLimit: g(`${side}-oco-sl`),
    takeProfit: g(`${side}-tp`),
    stopLoss: g(`${side}-sl`),
    tpslEnabled: !!tpsl?.checked,
  };
}

export function setOrderPreview(side: "buy" | "sell", text: string): void {
  const el = document.getElementById(`${side}-preview`);
  if (!el) return;
  el.textContent = text;
  if (text) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

export function setOrderMsg(side: "buy" | "sell", text: string, kind: "ok" | "err" | ""): void {
  const el = document.getElementById(`${side}-msg`);
  if (!el) return;
  el.textContent = text;
  el.className = kind ? `msg ${kind}` : "msg";
  if (text) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

export function setFormPrice(side: "buy" | "sell", price: number, pairId: PairId): void {
  const inp = document.getElementById(`${side}-price`) as HTMLInputElement | null;
  if (inp) inp.value = tickInputValue(price, pairId);
}

/** Resting limit defaults — slightly off mid so GTC does not instantly take. */
export function restingLimitPrice(mid: number, side: "buy" | "sell", pairId: PairId): string {
  return tickInputValue(mid * (side === "buy" ? 0.9985 : 1.0015), pairId);
}

/** Apply resting limit prices into both side inputs (Market → Limit type switch). */
export function applyRestingLimitPrices(mid: number, pairId: PairId): void {
  if (!(mid > 0)) return;
  setFormPrice("buy", mid * 0.9985, pairId);
  setFormPrice("sell", mid * 1.0015, pairId);
}

export function syncPctMarks(side: "buy" | "sell"): void {
  const slider = document.getElementById(`${side}-pct`) as HTMLInputElement | null;
  if (!slider) return;
  const v = Number(slider.value);
  document.querySelectorAll(`.pct-marks[data-side="${side}"] button`).forEach((btn) => {
    const pct = Number((btn as HTMLElement).dataset.pct);
    btn.classList.toggle("on", pct <= v);
  });
}

export function syncOrderTypeTabs(uiType: OrderKind): void {
  const advanced = isAdvancedOrderType(uiType);
  document.querySelectorAll("#type-tabs .type").forEach((b) => {
    const id = (b as HTMLElement).dataset.type;
    const on = !advanced && id === uiType;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  const adv = document.getElementById("order-type-adv") as HTMLSelectElement | null;
  const wrap = adv?.closest(".type-adv");
  if (adv) {
    adv.value = advanced ? uiType : "";
    wrap?.classList.toggle("active", advanced);
  }
}
