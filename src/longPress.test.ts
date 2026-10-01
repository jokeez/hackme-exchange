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
    vi.restoreAllMocks();
  });

  it("fires on touch hold without move", () => {
    let fire: (() => void) | null = null;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: TimerHandler) => {
      fire = typeof fn === "function" ? () => (fn as () => void)() : null;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);

    const el = document.createElement("div");
    document.body.appendChild(el);
    const hits: Array<[number, number]> = [];
    const stop = bindLongPress([el], (x, y) => hits.push([x, y]), { ms: 400 });

    el.dispatchEvent(ptr("pointerdown", { clientX: 40, clientY: 80, pointerId: 1, pointerType: "touch" }));
    expect(hits).toHaveLength(0);
    expect(fire).toBeTypeOf("function");
    fire!();
    expect(hits).toEqual([[40, 80]]);
    expect(longPressRecentlyFired()).toBe(true);

    stop();
    el.remove();
  });

  it("cancels when finger moves past tolerance", () => {
    let fire: (() => void) | null = null;
    let cleared = false;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: TimerHandler) => {
      fire = typeof fn === "function" ? () => (fn as () => void)() : null;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => {
      cleared = true;
      fire = null;
    });

    const el = document.createElement("div");
    document.body.appendChild(el);
    const hits: number[] = [];
    const stop = bindLongPress([el], () => hits.push(1), { ms: 400, moveTolPx: 10 });

    el.dispatchEvent(ptr("pointerdown", { clientX: 10, clientY: 10, pointerId: 2, pointerType: "touch" }));
    el.dispatchEvent(ptr("pointermove", { clientX: 40, clientY: 10, pointerId: 2, pointerType: "touch" }));
    expect(cleared).toBe(true);
    fire?.();
    expect(hits).toHaveLength(0);

    stop();
    el.remove();
  });

  it("ignores mouse (contextmenu path)", () => {
    let scheduled = false;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((() => {
      scheduled = true;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const el = document.createElement("div");
    document.body.appendChild(el);
    const hits: number[] = [];
    const stop = bindLongPress([el], () => hits.push(1), { ms: 200 });

    el.dispatchEvent(ptr("pointerdown", { clientX: 1, clientY: 1, pointerId: 3, pointerType: "mouse" }));
    expect(scheduled).toBe(false);
    expect(hits).toHaveLength(0);

    stop();
    el.remove();
  });

  it("markLongPressFired arms the suppress window", () => {
    markLongPressFired(50);
    expect(longPressRecentlyFired()).toBe(true);
  });
});
