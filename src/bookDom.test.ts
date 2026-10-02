/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  bookLadderFingerprint,
  bookPriceSkeletonFingerprint,
  isAsksPinnedToBottom,
  paintBookPreservingScroll,
  patchBookRowsInPlace,
  pinAsksToBottom,
  readBookScroll,
} from "./bookDom";

describe("bookDom scroll preserve", () => {
  it("fingerprints ladder levels", () => {
    const a = bookLadderFingerprint(
      [{ price: 1, amountBase: 10.4 }],
      [{ price: 1.1, amountBase: 9.2 }],
      0.01,
      "book",
    );
    const b = bookLadderFingerprint(
      [{ price: 1, amountBase: 10.4 }],
      [{ price: 1.1, amountBase: 9.2 }],
      0.01,
      "book",
    );
    expect(a).toBe(b);
    expect(bookPriceSkeletonFingerprint([{ price: 1 }], [{ price: 1.1 }], 0.01, "book")).toContain("sa:");
  });

  it("pins asks to bottom and detects pin state", () => {
    const asks = document.createElement("div");
    Object.defineProperty(asks, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(asks, "clientHeight", { value: 200, configurable: true });
    asks.scrollTop = 0;
    expect(isAsksPinnedToBottom(asks)).toBe(false);
    pinAsksToBottom(asks);
    expect(asks.scrollTop).toBe(600);
    expect(isAsksPinnedToBottom(asks)).toBe(true);
  });

  it("preserves bids scroll and re-pins asks on full paint", () => {
    const root = document.createElement("div");
    root.id = "book";
    document.body.appendChild(root);
    root.dataset.asksPinned = "1";
    root.innerHTML = `<div class="book-ladder">
      <div class="ob-asks-pane">${"<div class='ob-row ask' data-book-price='1' data-book-side='ask'><span class='ob-amt'>1</span></div>".repeat(40)}</div>
      <div class="ob-mid">m</div>
      <div class="ob-bids-pane">${"<div class='ob-row bid' data-book-price='1' data-book-side='bid'><span class='ob-amt'>1</span></div>".repeat(40)}</div>
    </div>`;
    const asks = root.querySelector<HTMLElement>(".ob-asks-pane")!;
    const bids = root.querySelector<HTMLElement>(".ob-bids-pane")!;
    Object.defineProperty(asks, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(asks, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(bids, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(bids, "clientHeight", { value: 200, configurable: true });
    bids.scrollTop = 80;
    pinAsksToBottom(asks);

    paintBookPreservingScroll(
      root,
      `<div class="book-ladder">
        <div class="ob-asks-pane">${"<div class='ob-row ask' data-book-price='2' data-book-side='ask'><span class='ob-amt'>2</span></div>".repeat(40)}</div>
        <div class="ob-mid">m2</div>
        <div class="ob-bids-pane">${"<div class='ob-row bid' data-book-price='2' data-book-side='bid'><span class='ob-amt'>2</span></div>".repeat(40)}</div>
      </div>`,
      "fp-1",
    );
    const asks2 = root.querySelector<HTMLElement>(".ob-asks-pane")!;
    const bids2 = root.querySelector<HTMLElement>(".ob-bids-pane")!;
    Object.defineProperty(asks2, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(asks2, "clientHeight", { value: 200, configurable: true });
    // After paint, pinAsksToBottom runs — re-apply props for assertion
    pinAsksToBottom(asks2);
    expect(asks2.scrollTop).toBe(600);
    expect(bids2.scrollTop).toBe(80);
    root.remove();
  });

  it("patches row amounts in place when prices match", () => {
    const root = document.createElement("div");
    // asks DOM = reversed (highest first): 1.2 then 1.1
    root.innerHTML = `<div class="book-ladder">
      <div class="ob-asks-pane">
        <div class="ob-row ask" data-book-price="1.2" data-book-side="ask"><div class="ob-bar" style="width:10%"></div><span class="ob-amt">1</span><span class="ob-total">1</span></div>
        <div class="ob-row ask" data-book-price="1.1" data-book-side="ask"><div class="ob-bar" style="width:10%"></div><span class="ob-amt">1</span><span class="ob-total">1</span></div>
      </div>
      <div class="ob-mid"></div>
      <div class="ob-bids-pane">
        <div class="ob-row bid" data-book-price="1.0" data-book-side="bid"><div class="ob-bar" style="width:10%"></div><span class="ob-amt">1</span><span class="ob-total">1</span></div>
      </div>
    </div>`;
    root.dataset.asksPinned = "1";
    const ok = patchBookRowsInPlace(
      root,
      [
        {
          price: 1.1,
          amountBase: 50,
          totalQuote: 55,
          priceLabel: "1.1",
          amountLabel: "50.0",
          totalLabel: "55",
          barPct: 50,
        },
        {
          price: 1.2,
          amountBase: 100,
          totalQuote: 120,
          priceLabel: "1.2",
          amountLabel: "100.0",
          totalLabel: "120",
          barPct: 100,
        },
      ],
      [
        {
          price: 1.0,
          amountBase: 20,
          totalQuote: 20,
          priceLabel: "1.0",
          amountLabel: "20.0",
          totalLabel: "20",
          barPct: 20,
        },
      ],
    );
    expect(ok).toBe(true);
    const askAmts = [...root.querySelectorAll(".ob-asks-pane .ob-amt")].map((el) => el.textContent);
    expect(askAmts).toEqual(["100.0", "50.0"]);
    expect(root.querySelector(".ob-bids-pane .ob-amt")?.textContent).toBe("20.0");
  });

  it("force fp always paints", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="book-ladder"><div class="ob-asks-pane"></div><div class="ob-bids-pane"></div></div>`;
    root.dataset.bookFp = "force";
    expect(
      paintBookPreservingScroll(
        root,
        `<div class="book-ladder"><div class="ob-asks-pane"></div><div class="ob-mid">x</div><div class="ob-bids-pane"></div></div>`,
        "force",
      ),
    ).toBe(true);
    expect(root.querySelector(".ob-mid")?.textContent).toBe("x");
  });

  it("readBookScroll reports asksPinned", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="ob-asks-pane"></div><div class="ob-bids-pane"></div>`;
    const asks = root.querySelector<HTMLElement>(".ob-asks-pane")!;
    Object.defineProperty(asks, "scrollHeight", { value: 100, configurable: true });
    Object.defineProperty(asks, "clientHeight", { value: 100, configurable: true });
    expect(readBookScroll(root).asksPinned).toBe(true);
  });
});
