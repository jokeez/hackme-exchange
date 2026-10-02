/** Order-book DOM helpers — dual-pane scroll + in-place patches (no scroll fight). */

export type BookPaneScroll = { asks: number; bids: number; outer: number; asksPinned: boolean };

export function readBookScroll(root: HTMLElement | null): BookPaneScroll {
  if (!root) return { asks: 0, bids: 0, outer: 0, asksPinned: true };
  const asks = root.querySelector<HTMLElement>(".ob-asks-pane");
  const bids = root.querySelector<HTMLElement>(".ob-bids-pane");
  const asksPinned = asks ? isAsksPinnedToBottom(asks) : true;
  return {
    asks: asks?.scrollTop ?? 0,
    bids: bids?.scrollTop ?? 0,
    outer: root.scrollTop,
    asksPinned,
  };
}

/** Best ask sits at the bottom of the asks pane (next to mid). */
export function isAsksPinnedToBottom(asks: HTMLElement, slackPx = 6): boolean {
  const max = Math.max(0, asks.scrollHeight - asks.clientHeight);
  if (max <= 0) return true;
  return asks.scrollTop >= max - slackPx;
}

export function pinAsksToBottom(asks: HTMLElement | null): void {
  if (!asks) return;
  asks.scrollTop = Math.max(0, asks.scrollHeight - asks.clientHeight);
}

export function restoreBookScroll(root: HTMLElement | null, snap: BookPaneScroll): void {
  if (!root) return;
  const asks = root.querySelector<HTMLElement>(".ob-asks-pane");
  const bids = root.querySelector<HTMLElement>(".ob-bids-pane");
  if (asks) {
    if (snap.asksPinned) pinAsksToBottom(asks);
    else asks.scrollTop = snap.asks;
  }
  if (bids) bids.scrollTop = snap.bids;
  if (!asks && !bids) root.scrollTop = snap.outer;
}

/** Compact fingerprint of ladder levels after grouping. */
export function bookLadderFingerprint(
  bids: { price: number; amountBase: number }[],
  asks: { price: number; amountBase: number }[],
  group: number,
  view: string,
): string {
  // Coarse amount buckets — paper size wobble must not invalidate fp every tick.
  const fmt = (levels: { price: number; amountBase: number }[], n: number) =>
    levels
      .slice(0, n)
      .map((l) => `${l.price.toFixed(6)}:${Math.round(l.amountBase / 8) * 8}`)
      .join(",");
  return `${view}|${group}|a:${fmt(asks, 48)}|b:${fmt(bids, 48)}`;
}

/** Prices-only fingerprint — same ladder structure, amounts may differ. */
export function bookPriceSkeletonFingerprint(
  bids: { price: number }[],
  asks: { price: number }[],
  group: number,
  view: string,
): string {
  const fmt = (levels: { price: number }[], n: number) =>
    levels
      .slice(0, n)
      .map((l) => l.price.toFixed(6))
      .join(",");
  return `${view}|${group}|sa:${fmt(asks, 48)}|sb:${fmt(bids, 48)}`;
}

export type BookRowPatch = {
  price: number;
  amountBase: number;
  totalQuote: number;
  priceLabel: string;
  amountLabel: string;
  totalLabel: string;
  barPct: number;
};

/**
 * Update existing .ob-row cells in place when row counts match.
 * Updates price/amount/bar without destroying scroll containers.
 * Asks model is best-first (near mid); DOM asks are highest→lowest.
 */
export function patchBookRowsInPlace(
  root: HTMLElement,
  asks: BookRowPatch[], // best ask first (near mid)
  bids: BookRowPatch[], // best bid first
): boolean {
  const asksPane = root.querySelector<HTMLElement>(".ob-asks-pane");
  const bidsPane = root.querySelector<HTMLElement>(".ob-bids-pane");
  if (!asksPane || !bidsPane) return false;

  const askRows = [...asksPane.querySelectorAll<HTMLElement>(".ob-row.ask")];
  const bidRows = [...bidsPane.querySelectorAll<HTMLElement>(".ob-row.bid")];
  const askModel = [...asks].reverse();
  if (askRows.length !== askModel.length || bidRows.length !== bids.length) return false;
  if (askRows.length === 0 && bidRows.length === 0) return false;

  const apply = (row: HTMLElement, m: BookRowPatch, side: "ask" | "bid") => {
    const priceKey = String(m.price);
    if (row.dataset.bookPrice !== priceKey) row.dataset.bookPrice = priceKey;
    if (row.dataset.bookSide !== side) row.dataset.bookSide = side;
    const bar = row.querySelector<HTMLElement>(".ob-bar");
    const px = row.querySelector(".ob-price");
    const amt = row.querySelector(".ob-amt");
    const total = row.querySelector(".ob-total");
    // Skip identical writes — textContent/style thrash was the residual scroll lag.
    const barPctR = Math.round(m.barPct);
    const prevBar = bar ? parseFloat(bar.style.width) : NaN;
    if (bar && (!Number.isFinite(prevBar) || Math.abs(prevBar - barPctR) >= 2)) {
      bar.style.width = `${barPctR}%`;
    }
    if (px && px.textContent !== m.priceLabel) px.textContent = m.priceLabel;
    if (amt && amt.textContent !== m.amountLabel) amt.textContent = m.amountLabel;
    if (total && total.textContent !== m.totalLabel) total.textContent = m.totalLabel;
  };
  for (let i = 0; i < askRows.length; i++) apply(askRows[i]!, askModel[i]!, "ask");
  for (let i = 0; i < bidRows.length; i++) apply(bidRows[i]!, bids[i]!, "bid");

  // Do NOT re-pin asks here — setting scrollTop every tick causes visible lag.
  // Pin only on full paint / initial mount.
  return true;
}

/**
 * Full HTML paint while keeping asks pin / bids scroll.
 * Returns false when fp matches (caller should skip).
 */
export function paintBookPreservingScroll(
  root: HTMLElement,
  html: string,
  fp: string,
): boolean {
  if (fp !== "force" && root.dataset.bookFp === fp && root.querySelector(".book-ladder, .depth-panel, .markets-empty")) {
    return false;
  }
  const scroll = readBookScroll(root);
  // Remember pin preference across full replaces.
  if (root.dataset.asksPinned == null) root.dataset.asksPinned = "1";
  if (!scroll.asksPinned && root.querySelector(".ob-asks-pane")) {
    root.dataset.asksPinned = "0";
  } else if (scroll.asksPinned) {
    root.dataset.asksPinned = "1";
  }

  root.innerHTML = html;
  root.dataset.bookFp = fp;

  const asks = root.querySelector<HTMLElement>(".ob-asks-pane");
  const bids = root.querySelector<HTMLElement>(".ob-bids-pane");
  // Layout must settle before scrollHeight is correct.
  const restore = () => {
    if (asks) {
      if (root.dataset.asksPinned !== "0") pinAsksToBottom(asks);
      else asks.scrollTop = scroll.asks;
    }
    if (bids) bids.scrollTop = scroll.bids;
    if (!asks && !bids) root.scrollTop = scroll.outer;
  };
  restore();
  requestAnimationFrame(restore);
  return true;
}

/** Mark active scroll so live patches can defer briefly; track asks pin. */
export function wireBookScrollIdle(root: HTMLElement, onIdle: () => void): void {
  if (root.dataset.bookScrollIdleWired === "1") return;
  root.dataset.bookScrollIdleWired = "1";
  let timer = 0;
  const mark = (ev: Event) => {
    root.dataset.bookScrolling = "1";
    const t = ev.target as HTMLElement | null;
    if (t?.classList?.contains("ob-asks-pane") || t?.closest?.(".ob-asks-pane")) {
      const asks = root.querySelector<HTMLElement>(".ob-asks-pane");
      if (asks) root.dataset.asksPinned = isAsksPinnedToBottom(asks) ? "1" : "0";
    }
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      root.dataset.bookScrolling = "0";
      onIdle();
    }, 220);
  };
  root.addEventListener("scroll", mark, { passive: true, capture: true });
  root.addEventListener("wheel", mark, { passive: true, capture: true });
  root.addEventListener("touchmove", mark, { passive: true, capture: true });
}
