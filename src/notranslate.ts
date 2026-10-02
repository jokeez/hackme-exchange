/**
 * Protect ticker / pair / price strings from browser & extension translators
 * (Google Translate, Safari, etc. must not rewrite HMC/USDT → garbage).
 */

/** HTML attrs for a machine-readable label (pair, price, asset code). */
export function noTranslateAttrs(): string {
  return 'class="notranslate" translate="no"';
}

/** Mark an existing DOM node so translators leave its text alone. */
export function markNoTranslate(el: Element | null | undefined): void {
  if (!el) return;
  el.classList.add("notranslate");
  el.setAttribute("translate", "no");
}

/** Wrap plain text that must stay literal (pair codes, OHLC, qty). */
export function noTranslateText(text: string): string {
  const safe = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<span class="notranslate" translate="no">${safe}</span>`;
}

/** True when an element (or ancestor) opts out of translation. */
export function isNoTranslateTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest?.("[translate='no'], .notranslate")) return true;
  return false;
}
