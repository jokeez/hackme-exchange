import { INTEGRATION } from "../config/integration";
import { escapeHtml } from "../sanitize";

function poolHost(): string {
  try {
    const u = new URL(INTEGRATION.poolCoordinatorOrigin);
    return u.hostname;
  } catch {
    return "pool.hackme.tech";
  }
}

export function renderStratumWizard(): string {
  const host = poolHost();
  const port = "3333";
  return `<section class="pool-section stratum-wizard" id="stratum-wizard">
    <header class="pool-section-head">
      <h3>Stratum setup wizard</h3>
      <p class="muted small">Copy-paste into your miner · HMC payout on worker name</p>
    </header>
    <ol class="stratum-steps">
      <li>
        <span class="muted small">1 · Pool URL</span>
        <code class="stratum-code mono" id="stratum-url">stratum+tcp://${escapeHtml(host)}:${port}</code>
        <button type="button" class="btn-sm" data-copy-target="stratum-url">Copy</button>
      </li>
      <li>
        <span class="muted small">2 · Worker name</span>
        <code class="stratum-code mono" id="stratum-worker">rig01.HMC-YOURADDRESS</code>
        <button type="button" class="btn-sm" data-copy-target="stratum-worker">Copy</button>
      </li>
      <li>
        <span class="muted small">3 · Password</span>
        <code class="stratum-code mono" id="stratum-pass">x</code>
        <button type="button" class="btn-sm" data-copy-target="stratum-pass">Copy</button>
      </li>
    </ol>
    <p class="muted small stratum-hint">Replace <span class="mono">HMC-YOURADDRESS</span> with your Account deposit address. Multiple rigs: use <span class="mono">rig02.…</span>, <span class="mono">rig03.…</span></p>
  </section>`;
}

export function wireStratumWizard(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((btn) => {
    if (btn.dataset.stratumWired === "1") return;
    btn.dataset.stratumWired = "1";
    btn.addEventListener("click", () => {
      const id = btn.dataset.copyTarget;
      const el = id ? root.querySelector<HTMLElement>(`#${id}`) : null;
      const text = el?.textContent?.trim() ?? "";
      if (!text) return;
      void navigator.clipboard?.writeText(text);
      btn.textContent = "Copied";
      window.setTimeout(() => {
        btn.textContent = "Copy";
      }, 1200);
    });
  });
}
