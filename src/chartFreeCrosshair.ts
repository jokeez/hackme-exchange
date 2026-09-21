/**
 * GPU free crosshair — CSS transforms at pointer rate.
 * Stock LWC always snaps X to bar centers; this overlay is fully free X+Y.
 */

export type FreeCrosshairHandle = {
  move: (clientX: number, clientY: number) => void;
  hide: () => void;
  refreshRect: () => void;
  destroy: () => void;
  el: HTMLDivElement;
};

export function mountFreeCrosshair(host: HTMLElement): FreeCrosshairHandle {
  const el = document.createElement("div");
  el.className = "free-crosshair";
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  const v = document.createElement("div");
  v.className = "free-xh-v";
  const h = document.createElement("div");
  h.className = "free-xh-h";
  el.append(v, h);
  host.appendChild(el);

  let left = 0;
  let top = 0;
  const refreshRect = () => {
    const r = host.getBoundingClientRect();
    left = r.left;
    top = r.top;
  };
  refreshRect();

  const move = (clientX: number, clientY: number) => {
    const x = clientX - left;
    const y = clientY - top;
    if (el.hidden) el.hidden = false;
    // Sync transform — no rAF; compositor-only so the hair never trails the cursor.
    v.style.transform = `translate3d(${x}px,0,0)`;
    h.style.transform = `translate3d(0,${y}px,0)`;
  };

  const hide = () => {
    el.hidden = true;
  };

  const destroy = () => {
    el.remove();
  };

  return { move, hide, refreshRect, destroy, el };
}
