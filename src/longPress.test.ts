/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindLongPress, longPressRecentlyFired, markLongPressFired } from "./longPress";

function ptr(
  type: string,
  init: { clientX: number; clientY: number; pointerId: number; pointerType: string; button?: number },
): Event {
  const Ctor = typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
  const ev = new Ctor(type, {
    bubbles: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: init.button ?? 0,
  } as PointerEventInit);
  Object.defineProperty(ev, "pointerId", { value: init.pointerId });
  Object.defineProperty(ev, "pointerType", { value: init.pointerType });
  return ev;
}

describe("longPress", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires on touch hold without move", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const hits: Array<[number, number]> = [];
    const stop = bindLongPress([el], (x, y) => hits.push([x, y]), { ms: 400 });

    el.dispatchEvent(ptr("pointerdown", { clientX: 40, clientY: 80, pointerId: 1, pointerType: "touch" }));
    expect(hits).toHaveLength(0);
    vi.advanceTimersByTime(399);
    expect(hits).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(hits).toEqual([[40, 80]]);
    expect(longPressRecentlyFired()).toBe(true);

    stop();
    el.remove();
  });

  it("cancels when finger moves past tolerance", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const hits: number[] = [];
    const stop = bindLongPress([el], () => hits.push(1), { ms: 400, moveTolPx: 10 });

    el.dispatchEvent(ptr("pointerdown", { clientX: 10, clientY: 10, pointerId: 2, pointerType: "touch" }));
    el.dispatchEvent(ptr("pointermove", { clientX: 40, clientY: 10, pointerId: 2, pointerType: "touch" }));
    vi.advanceTimersByTime(500);
    expect(hits).toHaveLength(0);

    stop();
    el.remove();
  });

  it("ignores mouse (contextmenu path)", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const hits: number[] = [];
    const stop = bindLongPress([el], () => hits.push(1), { ms: 200 });

    el.dispatchEvent(ptr("pointerdown", { clientX: 1, clientY: 1, pointerId: 3, pointerType: "mouse" }));
    vi.advanceTimersByTime(500);
    expect(hits).toHaveLength(0);

    stop();
    el.remove();
  });

  it("markLongPressFired arms the suppress window", () => {
    markLongPressFired(50);
    expect(longPressRecentlyFired()).toBe(true);
  });
});
