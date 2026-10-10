/**
 * Convert asset dropdown interactions.
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  closeConvertAssetMenus,
  renderConvertAssetPicker,
  renderConvertPairTabs,
  renderConvertRecentList,
  syncConvertPickerUi,
  wireConvertAssetPickers,
} from "./convertUi";

function mountConvertDropdowns(from: "hmc" | "usdt" | "sup" = "hmc", to: "hmc" | "usdt" | "sup" = "usdt"): {
  fromSel: HTMLSelectElement;
  toSel: HTMLSelectElement;
} {
  document.body.innerHTML = `
    ${renderConvertPairTabs(from === "sup" || to === "sup" ? "HMC_SUP" : "HMC_USDT")}
    ${renderConvertAssetPicker("from", from, to)}
    <select id="cv-from"><option value="hmc">HMC</option><option value="usdt">USDT</option><option value="sup">SUP</option></select>
    ${renderConvertAssetPicker("to", to, from)}
    <select id="cv-to"><option value="hmc">HMC</option><option value="usdt" selected>USDT</option><option value="sup">SUP</option></select>
  `;
  const fromSel = document.getElementById("cv-from") as HTMLSelectElement;
  const toSel = document.getElementById("cv-to") as HTMLSelectElement;
  fromSel.value = from;
  toSel.value = to;
  wireConvertAssetPickers(fromSel, toSel, () => {
    syncConvertPickerUi(fromSel.value as "hmc", toSel.value as "usdt");
  });
  return { fromSel, toSel };
}

function fromDd(): HTMLElement {
  return document.querySelector('.cv-asset-dd[data-cv-leg="from"]')!;
}

function fromTrigger(): HTMLButtonElement {
  return document.getElementById("cv-from-trigger") as HTMLButtonElement;
}

function fromMenu(): HTMLElement {
  return document.getElementById("cv-from-menu")!;
}

describe("convertUi dropdowns", () => {
  it("toggles open and closed when trigger is clicked twice", () => {
    mountConvertDropdowns();
    fromTrigger().click();
    expect(fromDd().classList.contains("open")).toBe(true);
    expect(fromMenu().hasAttribute("hidden")).toBe(false);
    expect(fromTrigger().getAttribute("aria-expanded")).toBe("true");

    fromTrigger().click();
    expect(fromDd().classList.contains("open")).toBe(false);
    expect(fromMenu().hasAttribute("hidden")).toBe(true);
    expect(fromTrigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on outside click and Escape", () => {
    mountConvertDropdowns();
    fromTrigger().click();
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(fromDd().classList.contains("open")).toBe(false);

    fromTrigger().click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(fromDd().classList.contains("open")).toBe(false);
  });

  it("selects asset, closes menu, and syncs trigger label", () => {
    const { fromSel } = mountConvertDropdowns("hmc", "usdt");
    fromTrigger().click();
    const sup = fromMenu().querySelector<HTMLButtonElement>('[data-cv-asset="sup"]')!;
    expect(fromMenu().querySelector('[data-cv-asset="btc"]')).toBeNull();
    sup.click();
    expect(fromSel.value).toBe("sup");
    expect(fromDd().classList.contains("open")).toBe(false);
    expect(fromTrigger().textContent).toContain("SUP");
  });

  it("disables non-primary To assets (SUP↔USDT)", () => {
    mountConvertDropdowns("sup", "hmc");
    const toMenu = document.getElementById("cv-to-menu")!;
    const usdt = toMenu.querySelector<HTMLButtonElement>('[data-cv-asset="usdt"]')!;
    expect(usdt.disabled).toBe(true);
    const hmc = toMenu.querySelector<HTMLButtonElement>('[data-cv-asset="hmc"]')!;
    expect(hmc.disabled).toBe(false);
  });

  it("closes the other leg when opening a new menu", () => {
    mountConvertDropdowns();
    fromTrigger().click();
    const toTrigger = document.getElementById("cv-to-trigger") as HTMLButtonElement;
    toTrigger.click();
    expect(fromDd().classList.contains("open")).toBe(false);
    expect(document.querySelector('.cv-asset-dd[data-cv-leg="to"]')!.classList.contains("open")).toBe(true);
  });

  it("closeConvertAssetMenus resets all triggers", () => {
    mountConvertDropdowns();
    fromTrigger().click();
    closeConvertAssetMenus();
    expect(fromTrigger().getAttribute("aria-expanded")).toBe("false");
    expect(fromMenu().hasAttribute("hidden")).toBe(true);
  });

  it("renders primary pair tabs only", () => {
    const html = renderConvertPairTabs("HMC_USDT");
    expect(html).toContain("HMC/USDT");
    expect(html).toContain("HMC/SUP");
    expect(html).not.toContain("Popular");
    expect(html).not.toContain("BTC");
  });
});

describe("convertUi recent empty", () => {
  it("renders desk empty copy for live convert path", () => {
    const html = renderConvertRecentList([], "desk");
    expect(html).toContain('data-empty="convert"');
    expect(html).toContain("server mid + VIP taker");
    expect(html).not.toContain("paper balances until health advertises convert");
  });

  it("mentions primary pairs in paper empty copy", () => {
    const html = renderConvertRecentList([], "paper");
    expect(html).toContain("HMC/USDT");
    expect(html).toContain("HMC/SUP");
  });
});
