/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { applyBookFlashes, snapshotBookLevels } from "./bookFlash";
import { closeQuickOrderPopup, showQuickOrderPopup } from "./chartQuickOrder";
import { applyLayoutPreset, LAYOUT_PRESETS } from "./layoutPrefs";

describe("applyBookFlashes", () => {
  it("adds flash class when amount changes", () => {
    document.body.innerHTML = `<div id="book">
      <div class="ob-row bid" data-book-price="0.05" data-book-side="bid">
        <div class="ob-bar"></div><span class="ob-price">0.05</span><span class="ob-amt">100</span><span></span>
      </div>
    </div>`;
    const prev = snapshotBookLevels(document.getElementById("book"));
    document.querySelector(".ob-amt")!.textContent = "150";
    vi.useFakeTimers();
    applyBookFlashes(prev, document.getElementById("book"));
    const row = document.querySelector(".ob-row")!;
    expect(row.classList.contains("ob-flash-up")).toBe(true);
    vi.runAllTimers();
    vi.useRealTimers();
  });
});

describe("chartQuickOrder", () => {
  it("calls onClose when dismissed via close button", () => {
    const onClose = vi.fn();
    showQuickOrderPopup(100, 100, 0.05, {
      baseSymbol: "HMC",
      quoteSymbol: "USDT",
      defaultAmount: 10,
      onPlace: () => {},
      onClose,
    });
    (document.querySelector(".cqo-close") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalled();
    expect(document.querySelector(".chart-quick-order")).toBeFalsy();
  });

  it("places order on buy click", () => {
    const onPlace = vi.fn();
    showQuickOrderPopup(100, 100, 0.05, {
      baseSymbol: "HMC",
      quoteSymbol: "USDT",
      defaultAmount: 0,
      onPlace,
    });
    const inp = document.querySelector(".cqo-amt") as HTMLInputElement;
    inp.value = "50";
    (document.querySelector(".cqo-buy") as HTMLButtonElement).click();
    expect(onPlace).toHaveBeenCalledWith("buy", 0.05, 50);
    closeQuickOrderPopup();
  });
});

describe("layout presets", () => {
  it("chart focus collapses side panels", () => {
    const p = applyLayoutPreset("chart");
    expect(p.bookCollapsed).toBe(true);
    expect(p.rightCollapsed).toBe(true);
    expect(p.bottomCollapsed).toBe(true);
  });

  it("scalper widens book and activity", () => {
    const p = applyLayoutPreset("scalper");
    expect(p.bookWidth).toBe(LAYOUT_PRESETS.scalper.bookWidth);
    expect(p.bottomHeight).toBe(LAYOUT_PRESETS.scalper.bottomHeight);
  });
});
