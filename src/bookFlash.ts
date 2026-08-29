/** Snapshot order-book row sizes for CEX-style flash highlights. */
export type BookLevelSnap = Map<string, number>;

function rowKey(side: string, price: string): string {
  return `${side}:${price}`;
}

export function snapshotBookLevels(root: HTMLElement | null): BookLevelSnap {
  const snap: BookLevelSnap = new Map();
  if (!root) return snap;
  root.querySelectorAll<HTMLElement>(".ob-row[data-book-price]").forEach((row) => {
    const price = row.dataset.bookPrice;
    const side = row.dataset.bookSide;
    if (!price || !side) return;
    const amtCell = row.querySelector(".ob-amt");
    const amt = Number(amtCell?.textContent?.replace(/,/g, "") ?? 0);
    if (Number.isFinite(amt)) snap.set(rowKey(side, price), amt);
  });
  return snap;
}

export function applyBookFlashes(prev: BookLevelSnap, root: HTMLElement | null): BookLevelSnap {
  const next = snapshotBookLevels(root);
  if (!root || !prev.size) return next;

  root.querySelectorAll<HTMLElement>(".ob-row[data-book-price]").forEach((row) => {
    const price = row.dataset.bookPrice!;
    const side = row.dataset.bookSide!;
    const key = rowKey(side, price);
    const oldAmt = prev.get(key);
    const newAmt = next.get(key);
    if (oldAmt == null || newAmt == null || oldAmt === newAmt) return;

    const up = newAmt > oldAmt;
    const flashClass = side === "bid" ? (up ? "ob-flash-up" : "ob-flash-down") : up ? "ob-flash-down" : "ob-flash-up";
    row.classList.remove("ob-flash-up", "ob-flash-down");
    void row.offsetWidth;
    row.classList.add(flashClass);
    window.setTimeout(() => row.classList.remove(flashClass), 520);
  });
  return next;
}
