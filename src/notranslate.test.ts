/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  isNoTranslateTarget,
  markNoTranslate,
  noTranslateAttrs,
  noTranslateText,
} from "./notranslate";

describe("notranslate", () => {
  it("emits translate=no attrs for tickers", () => {
    expect(noTranslateAttrs()).toContain('translate="no"');
    expect(noTranslateAttrs()).toContain("notranslate");
  });

  it("escapes HTML in noTranslateText", () => {
    expect(noTranslateText("HMC/USDT <x>")).toBe(
      '<span class="notranslate" translate="no">HMC/USDT &lt;x&gt;</span>',
    );
  });

  it("marks live DOM nodes", () => {
    const el = document.createElement("h1");
    markNoTranslate(el);
    expect(el.classList.contains("notranslate")).toBe(true);
    expect(el.getAttribute("translate")).toBe("no");
    markNoTranslate(null);
  });

  it("detects notranslate ancestors", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="notranslate" translate="no"><span id="p">HMC/USDT</span></div>`;
    document.body.appendChild(root);
    expect(isNoTranslateTarget(root.querySelector("#p"))).toBe(true);
    expect(isNoTranslateTarget(document.createElement("div"))).toBe(false);
    root.remove();
  });
});
