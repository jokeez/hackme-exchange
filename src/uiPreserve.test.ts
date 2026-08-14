/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { captureEphemeralUi, restoreEphemeralUi } from "./uiPreserve";

describe("uiPreserve", () => {
  it("restores open details, form fields, ledger filter, and focus", () => {
    document.body.innerHTML = `
      <div id="root">
        <details data-ui="asset-roadmap" id="acct-roadmap-details"><summary>Asset roadmap</summary><p>body</p></details>
        <details data-ui="fee-verify-cli"><summary>Verify fee credits (CLI)</summary><pre>x</pre></details>
        <input id="lab-wd-amt" type="number" value="" />
        <input id="lab-wd-dest" type="text" value="" />
        <div id="acct-ledger-filters" role="group" aria-label="Filter ledger">
          <button type="button" class="acct-chip active" data-ledger-filter="all">All</button>
          <button type="button" class="acct-chip" data-ledger-filter="fee">Fees</button>
        </div>
        <ul id="acct-ledger-list">
          <li data-ledger-kind="trade">t</li>
          <li data-ledger-kind="fee">f</li>
        </ul>
      </div>`;
    const root = document.getElementById("root")!;
    (root.querySelector("#acct-roadmap-details") as HTMLDetailsElement).open = true;
    (root.querySelector("[data-ui=fee-verify-cli]") as HTMLDetailsElement).open = true;
    (root.querySelector("#lab-wd-amt") as HTMLInputElement).value = "0.05";
    (root.querySelector("#lab-wd-dest") as HTMLInputElement).value = "HMC-ffffffffffffffff";
    const feeBtn = root.querySelector('[data-ledger-filter="fee"]') as HTMLElement;
    root.querySelectorAll("[data-ledger-filter]").forEach((b) => b.classList.remove("active"));
    feeBtn.classList.add("active");
    (root.querySelector("#lab-wd-dest") as HTMLInputElement).focus();

    const snap = captureEphemeralUi(root);
    expect(snap?.details["id:acct-roadmap-details"]).toBe(true);
    expect(snap?.details["ui:fee-verify-cli"]).toBe(true);
    expect(snap?.fields["lab-wd-amt"]?.value).toBe("0.05");
    expect(snap?.chips["acct-ledger-filters"]).toBe("fee");

    // Simulate full remount wipe
    root.innerHTML = `
        <details data-ui="asset-roadmap" id="acct-roadmap-details"><summary>Asset roadmap</summary><p>body</p></details>
        <details data-ui="fee-verify-cli"><summary>Verify fee credits (CLI)</summary><pre>x</pre></details>
        <input id="lab-wd-amt" type="number" value="" />
        <input id="lab-wd-dest" type="text" value="" />
        <div id="acct-ledger-filters" role="group" aria-label="Filter ledger">
          <button type="button" class="acct-chip active" data-ledger-filter="all">All</button>
          <button type="button" class="acct-chip" data-ledger-filter="fee">Fees</button>
        </div>
        <ul id="acct-ledger-list">
          <li data-ledger-kind="trade">t</li>
          <li data-ledger-kind="fee">f</li>
        </ul>`;

    expect((root.querySelector("#acct-roadmap-details") as HTMLDetailsElement).open).toBe(false);
    restoreEphemeralUi(root, snap);

    expect((root.querySelector("#acct-roadmap-details") as HTMLDetailsElement).open).toBe(true);
    expect((root.querySelector("[data-ui=fee-verify-cli]") as HTMLDetailsElement).open).toBe(true);
    expect((root.querySelector("#lab-wd-amt") as HTMLInputElement).value).toBe("0.05");
    expect((root.querySelector("#lab-wd-dest") as HTMLInputElement).value).toBe("HMC-ffffffffffffffff");
    expect(root.querySelector('[data-ledger-filter="fee"]')!.classList.contains("active")).toBe(true);
    expect((root.querySelector('[data-ledger-kind="trade"]') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('[data-ledger-kind="fee"]') as HTMLElement).hidden).toBe(false);
  });

  it("capture on null root is null", () => {
    expect(captureEphemeralUi(null)).toBeNull();
    restoreEphemeralUi(null, null);
  });
});
