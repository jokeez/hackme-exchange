/** Oracle anchor settings modal — extracted for tests and consistent a11y. */
export function renderOracleSettingsModal(anchor: number): string {
  const v = Number.isFinite(anchor) && anchor > 0 ? anchor : 0.05;
  return `<div class="modal glass" role="dialog" aria-modal="true" aria-labelledby="oracle-settings-title" aria-describedby="oracle-settings-desc">
    <h3 id="oracle-settings-title">Oracle settings</h3>
    <label for="anchor-inp">Reference mid (USDT per HMC)
      <input class="inp mono" id="anchor-inp" type="number" step="0.001" value="${v}" aria-describedby="oracle-settings-desc" />
    </label>
    <p class="muted small" id="oracle-settings-desc">Operator reference for paper charts — not scaled by pool GH/s. D0 default 0.05.</p>
    <div class="modal-actions">
      <button type="button" class="btn-sm" id="modal-close" aria-label="Cancel oracle settings">Cancel</button>
      <button type="button" class="btn-primary" id="modal-save" aria-label="Apply oracle anchor">Apply</button>
    </div>
  </div>`;
}

export function trapModalFocus(root: HTMLElement): () => void {
  const focusable = () =>
    Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener("keydown", onKey);
  return () => root.removeEventListener("keydown", onKey);
}
