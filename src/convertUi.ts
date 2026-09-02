import { CONVERT_ASSETS, CONVERT_ROUTES, type ConvertRoute } from "./convert";
import { assetBadge, assetBadgeLg } from "./icons";
import { escapeHtml } from "./sanitize";
import type { Wallet } from "./types";

const QUICK_ROUTE_IDS: ConvertRoute[] = [
  "HMC_USDT",
  "USDT_HMC",
  "SUP_USDT",
  "HMC_SUP",
  "HMC_BTC",
  "BTC_HMC",
  "SUP_BTC",
  "BTC_SUP",
];

export function convertAssetName(key: keyof Wallet): string {
  return CONVERT_ASSETS.find((a) => a.key === key)?.name ?? String(key).toUpperCase();
}

export function renderConvertAssetOptions(selected: keyof Wallet): string {
  return CONVERT_ASSETS.map(
    (a) => `<option value="${a.key}" ${a.key === selected ? "selected" : ""}>${a.symbol}</option>`,
  ).join("");
}

export function renderConvertAssetPicker(
  leg: "from" | "to",
  selected: keyof Wallet,
  other?: keyof Wallet,
): string {
  const label = leg === "from" ? "Pay with" : "Receive";
  return `<div class="cv-asset-picker" data-cv-leg="${leg}" role="listbox" aria-label="${label}">
    ${CONVERT_ASSETS.map((a) => {
      const disabled = leg === "to" && a.key === other;
      const active = a.key === selected;
      return `<button type="button" class="cv-asset-opt${active ? " active" : ""}${disabled ? " disabled" : ""}"
        data-cv-asset="${a.key}" data-cv-leg="${leg}" role="option" aria-selected="${active}"
        ${disabled ? "disabled" : ""}>
        <span class="cv-asset-opt-main">
          ${assetBadgeLg(a.symbol)}
          <span class="cv-asset-opt-text">
            <strong>${escapeHtml(a.symbol)}</strong>
            <span class="muted small">${escapeHtml(a.name)}</span>
          </span>
        </span>
        <span class="cv-asset-opt-bal mono muted small" data-cv-bal-key="${a.key}">—</span>
      </button>`;
    }).join("")}
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

export function syncConvertPickerUi(from: keyof Wallet, to: keyof Wallet): void {
  document.querySelectorAll<HTMLElement>(".cv-asset-picker").forEach((picker) => {
    const leg = picker.dataset.cvLeg as "from" | "to" | undefined;
    const sel = leg === "from" ? from : to;
    const other = leg === "from" ? to : from;
    picker.querySelectorAll<HTMLButtonElement>("[data-cv-asset]").forEach((btn) => {
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
  document.querySelectorAll<HTMLButtonElement>("[data-cv-asset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const leg = btn.dataset.cvLeg;
      const key = btn.dataset.cvAsset;
      if (!leg || !key) return;
      if (leg === "from") fromSel.value = key;
      else toSel.value = key;
      onChange();
    });
  });
}
