import { CONVERT_ASSETS, CONVERT_ROUTES, type ConvertRoute } from "./convert";
import { Ico, assetBadge, assetBadgeLg } from "./icons";
import { escapeHtml } from "./sanitize";
import type { Wallet } from "./types";

let convertMenuDismissWired = false;

const QUICK_ROUTE_IDS: ConvertRoute[] = [
  "HMC_USDT",
  "USDT_HMC",
  "SUP_USDT",
  "USDT_SUP",
  "HMC_SUP",
  "SUP_HMC",
  "HMC_BTC",
  "BTC_HMC",
  "SUP_BTC",
  "BTC_SUP",
];

export function convertAssetName(key: keyof Wallet): string {
  return CONVERT_ASSETS.find((a) => a.key === key)?.name ?? String(key).toUpperCase();
}

function convertAssetByKey(key: keyof Wallet) {
  return CONVERT_ASSETS.find((a) => a.key === key)!;
}

export function renderConvertAssetOptions(selected: keyof Wallet): string {
  return CONVERT_ASSETS.map(
    (a) => `<option value="${a.key}" ${a.key === selected ? "selected" : ""}>${a.symbol}</option>`,
  ).join("");
}

function renderConvertDropdownTrigger(selected: keyof Wallet): string {
  const a = convertAssetByKey(selected);
  return `<span class="cv-dd-selected">
    ${assetBadgeLg(a.symbol)}
    <span class="cv-dd-text">
      <strong>${escapeHtml(a.symbol)}</strong>
      <span class="muted small">${escapeHtml(a.name)}</span>
    </span>
  </span>
  <span class="cv-dd-caret" aria-hidden="true">${Ico.chevronDown()}</span>`;
}

export function renderConvertAssetPicker(
  leg: "from" | "to",
  selected: keyof Wallet,
  other?: keyof Wallet,
): string {
  const label = leg === "from" ? "Pay with" : "Receive";
  const triggerId = leg === "from" ? "cv-from-trigger" : "cv-to-trigger";
  const menuId = leg === "from" ? "cv-from-menu" : "cv-to-menu";
  return `<div class="cv-asset-dd" data-cv-leg="${leg}">
    <button type="button" class="cv-dd-trigger" id="${triggerId}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${menuId}" aria-label="${label}">
      ${renderConvertDropdownTrigger(selected)}
    </button>
    <div class="cv-dd-menu glass" id="${menuId}" role="listbox" aria-label="${label}" hidden>
      ${CONVERT_ASSETS.map((a) => {
        const disabled = leg === "to" && a.key === other;
        const active = a.key === selected;
        return `<button type="button" class="cv-dd-opt${active ? " active" : ""}${disabled ? " disabled" : ""}"
          data-cv-asset="${a.key}" data-cv-leg="${leg}" role="option" aria-selected="${active}"
          ${disabled ? "disabled" : ""}>
          <span class="cv-dd-opt-main">
            ${assetBadgeLg(a.symbol)}
            <span class="cv-dd-opt-text">
              <strong>${escapeHtml(a.symbol)}</strong>
              <span class="muted small">${escapeHtml(a.name)}</span>
            </span>
          </span>
          <span class="cv-dd-opt-bal mono muted small" data-cv-bal-key="${a.key}">—</span>
        </button>`;
      }).join("")}
    </div>
  </div>`;
}

export function renderConvertQuickRoutes(activeRoute: ConvertRoute | null): string {
  return QUICK_ROUTE_IDS.map((id) => {
    const r = CONVERT_ROUTES.find((x) => x.id === id);
    if (!r) return "";
    const [fromSym, toSym] = r.label.split(" → ").map((s) => s.trim());
    const active = activeRoute === id;
    return `<button type="button" class="cv-route-card cv-chip${active ? " active" : ""}" data-cv-route="${id}" title="${escapeHtml(r.desc)}">
      <span class="cv-route-icons" aria-hidden="true">${assetBadge(fromSym)}<span class="cv-route-arrow">→</span>${assetBadge(toSym)}</span>
      <strong>${escapeHtml(r.label)}</strong>
      <span class="muted small cv-route-desc">${escapeHtml(r.desc)}</span>
    </button>`;
  }).join("");
}

export function renderConvertBalanceList(
  rows: { symbol: string; name: string; value: string }[],
): string {
  return rows
    .map(
      (r) => `<li class="cv-bal-card">
        <span class="cv-bal-main">${assetBadgeLg(r.symbol)}
          <span><strong>${escapeHtml(r.symbol)}</strong><span class="muted small">${escapeHtml(r.name)}</span></span>
        </span>
        <strong class="mono">${escapeHtml(r.value)}</strong>
      </li>`,
    )
    .join("");
}

export function renderConvertRecentList(
  rows: { note: string; amount: string }[],
): string {
  if (!rows.length) return `<p class="muted small cv-recent-empty">No converts yet</p>`;
  return `<ul class="cv-recent">${rows
    .map(
      (r) => `<li class="mono cv-recent-row">
        <span class="cv-recent-note">${escapeHtml(r.note)}</span>
        <span class="cv-recent-amt">${escapeHtml(r.amount)}</span>
      </li>`,
    )
    .join("")}</ul>`;
}

export function patchConvertPickerBalances(
  balances: Partial<Record<keyof Wallet, string>>,
): void {
  document.querySelectorAll<HTMLElement>("[data-cv-bal-key]").forEach((el) => {
    const key = el.dataset.cvBalKey as keyof Wallet | undefined;
    if (!key) return;
    const v = balances[key];
    el.textContent = v != null ? v : "—";
  });
}

export function closeConvertAssetMenus(except?: HTMLElement): void {
  document.querySelectorAll<HTMLElement>(".cv-asset-dd").forEach((dd) => {
    if (except && dd === except) return;
    const menu = dd.querySelector<HTMLElement>(".cv-dd-menu");
    const trigger = dd.querySelector<HTMLElement>(".cv-dd-trigger");
    menu?.setAttribute("hidden", "");
    trigger?.setAttribute("aria-expanded", "false");
    dd.classList.remove("open");
  });
}

function openConvertAssetMenu(dd: HTMLElement): void {
  const menu = dd.querySelector<HTMLElement>(".cv-dd-menu");
  const trigger = dd.querySelector<HTMLElement>(".cv-dd-trigger");
  if (!menu || !trigger) return;
  dd.classList.add("open");
  menu.removeAttribute("hidden");
  trigger.setAttribute("aria-expanded", "true");
}

function toggleConvertAssetMenu(dd: HTMLElement): void {
  if (dd.classList.contains("open")) {
    closeConvertAssetMenus();
    return;
  }
  closeConvertAssetMenus();
  openConvertAssetMenu(dd);
}

export function syncConvertPickerUi(from: keyof Wallet, to: keyof Wallet): void {
  closeConvertAssetMenus();
  (["from", "to"] as const).forEach((leg) => {
    const sel = leg === "from" ? from : to;
    const other = leg === "from" ? to : from;
    const dd = document.querySelector<HTMLElement>(`.cv-asset-dd[data-cv-leg="${leg}"]`);
    if (!dd) return;
    const trigger = dd.querySelector<HTMLElement>(".cv-dd-trigger");
    if (trigger) trigger.innerHTML = renderConvertDropdownTrigger(sel);
    dd.querySelectorAll<HTMLButtonElement>(".cv-dd-opt").forEach((btn) => {
      const key = btn.dataset.cvAsset as keyof Wallet;
      const on = key === sel;
      const disabled = leg === "to" && key === other;
      btn.classList.toggle("active", on);
      btn.classList.toggle("disabled", disabled);
      btn.disabled = disabled;
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  });
  const route = document.querySelector<HTMLElement>("#cv-quick")?.dataset.activeRoute ?? null;
  document.querySelectorAll<HTMLElement>("#cv-quick [data-cv-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.cvRoute === route);
  });
}

export function wireConvertAssetPickers(
  fromSel: HTMLSelectElement,
  toSel: HTMLSelectElement,
  onChange: () => void,
): void {
  document.querySelectorAll<HTMLElement>(".cv-asset-dd").forEach((dd) => {
    const leg = dd.dataset.cvLeg as "from" | "to" | undefined;
    const trigger = dd.querySelector<HTMLButtonElement>(".cv-dd-trigger");
    const menu = dd.querySelector<HTMLElement>(".cv-dd-menu");
    if (!leg || !trigger || !menu) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleConvertAssetMenu(dd);
    });

    menu.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    menu.querySelectorAll<HTMLButtonElement>(".cv-dd-opt").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const key = btn.dataset.cvAsset;
        if (!key) return;
        if (leg === "from") fromSel.value = key;
        else toSel.value = key;
        closeConvertAssetMenus();
        onChange();
      });
    });
  });

  if (!convertMenuDismissWired) {
    convertMenuDismissWired = true;
    document.addEventListener("click", () => {
      closeConvertAssetMenus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeConvertAssetMenus();
    });
  }
}
