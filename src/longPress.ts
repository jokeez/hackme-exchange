/** Touch/pen long-press → context action (price alert). Mouse uses contextmenu. */
export type LongPressHandler = (clientX: number, clientY: number) => void;

let suppressUntil = 0;

/** True if a long-press just fired (suppress click / native contextmenu echo). */
export function longPressRecentlyFired(withinMs = 700): boolean {
  return typeof performance !== "undefined" && performance.now() < suppressUntil;
}

export function markLongPressFired(holdMs = 700): void {
  suppressUntil = performance.now() + holdMs;
}

export function bindLongPress(
  targets: Array<HTMLElement | null | undefined>,
  onLongPress: LongPressHandler,
  opts?: { ms?: number; moveTolPx?: number },
): () => void {
  const ms = opts?.ms ?? 480;
  const moveTol = opts?.moveTolPx ?? 12;
  const moveTol2 = moveTol * moveTol;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number; pointerId: number } | null = null;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const reset = () => {
    clearTimer();
    start = null;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    if (e.button !== 0) return;
    reset();
    start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    const sx = e.clientX;
    const sy = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      if (!start) return;
      start = null;
      markLongPressFired();
      onLongPress(sx, sy);
    }, ms);
  };

  const onMove = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > moveTol2) reset();
  };

  const onUp = (e: PointerEvent) => {
    if (start && e.pointerId === start.pointerId) reset();
  };

  const els = targets.filter((el): el is HTMLElement => !!el);
  for (const el of els) {
    el.addEventListener("pointerdown", onDown, { capture: true });
    el.addEventListener("pointermove", onMove, { capture: true });
    el.addEventListener("pointerup", onUp, { capture: true });
    el.addEventListener("pointercancel", onUp, { capture: true });
  }

  return () => {
    reset();
    for (const el of els) {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("pointercancel", onUp, true);
    }
  };
}
