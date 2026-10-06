import {
  CONVERT_ROUTES,
  CONVERT_UI_ASSETS,
  CONVERT_PRIMARY_PAIRS,
  convertAllowedToAssets,
  convertPrimaryPair,
  type ConvertPrimaryPair,
  type ConvertRoute,
} from "./convert";
import { Ico, assetBadgeLg } from "./icons";
import { escapeHtml } from "./sanitize";
import type { Wallet } from "./types";

let convertMenuDismissWired = false;

export function convertAssetName(key: keyof Wallet): string {
  return CONVERT_UI_ASSETS.find((a) => a.key === key)?.name ?? String(key).toUpperCase();
}

function convertAssetByKey(key: keyof Wallet) {
  return CONVERT_UI_ASSETS.find((a) => a.key === key) ?? CONVERT_UI_ASSETS[0]!;
}

export function renderConvertAssetOptions(selected: keyof Wallet): string {
  return CONVERT_UI_ASSETS.map(
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

export function renderConvertPairTabs(activePair: ConvertPrimaryPair | null): string {
  return `<div class="cv-pair-tabs" id="cv-pair-tabs" role="tablist" aria-label="Convert pair">
    ${CONVERT_PRIMARY_PAIRS.map((id) => {
      const label = id.replace("_", "/");
      const on = activePair === id;
      return `<button type="button" class="cv-pair-tab${on ? " active" : ""}" role="tab" aria-selected="${on}" data-cv-pair="${id}">${escapeHtml(label)}</button>`;
    }).join("")}
  </div>`;
}

export function renderConvertAssetPicker(
  leg: "from" | "to",
  selected: keyof Wallet,
  other?: keyof Wallet,
): string {
  const label = leg === "from" ? "You pay" : "You receive";
  const triggerId = leg === "from" ? "cv-from-trigger" : "cv-to-trigger";
  const menuId = leg === "from" ? "cv-from-menu" : "cv-to-menu";
  const allowedTo = other ? new Set(convertAllowedToAssets(other)) : null;
  return `<div class="cv-asset-dd" data-cv-leg="${leg}">
    <button type="button" class="cv-dd-trigger" id="${triggerId}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${menuId}" aria-label="${label}">
      ${renderConvertDropdownTrigger(selected)}
    </button>
    <div class="cv-dd-menu glass" id="${menuId}" role="listbox" aria-label="${label}" hidden>
      ${CONVERT_UI_ASSETS.map((a) => {
        const disabled =
          a.key === other || (leg === "to" && allowedTo != null && !allowedTo.has(a.key));
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
  mode: "paper" | "desk" | "lab" = "paper",
): string {
  if (!rows.length) {
    const body =
      mode === "desk"
        ? "Convert stays on paper balances until health advertises convert — Spot matching can still be live."
        : mode === "lab"
          ? "Lab convert uses last-trade mid after you connect the fixture on Account."
          : "Pick HMC/USDT or HMC/SUP and Convert at mid — fees follow your VIP schedule.";
    return `<div class="cv-recent-empty product-empty" data-empty="convert">
      <p class="empty-title">No converts yet</p>
      <p class="muted small">${escapeHtml(body)}</p>
    </div>`;
  }
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
    const allowedTo = leg === "to" ? new Set(convertAllowedToAssets(other)) : null;
    dd.querySelectorAll<HTMLButtonElement>(".cv-dd-opt").forEach((btn) => {
      const key = btn.dataset.cvAsset as keyof Wallet;
      const on = key === sel;
      const disabled =
        leg === "to" ? key === other || (allowedTo != null && !allowedTo.has(key as "hmc" | "sup" | "usdt")) : key === other;
      btn.classList.toggle("active", on);
      btn.classList.toggle("disabled", disabled);
      btn.disabled = disabled;
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  });
  const pair = convertPrimaryPair(from, to);
  document.querySelectorAll<HTMLElement>("#cv-pair-tabs [data-cv-pair]").forEach((btn) => {
    const on = btn.dataset.cvPair === pair;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
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

/** Route label helper kept for tests / recent empty copy. */
export function convertRouteLabel(id: ConvertRoute): string {
  return CONVERT_ROUTES.find((x) => x.id === id)?.label ?? id;
}
