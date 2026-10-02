/**
 * GPU free crosshair — CSS transforms at pointer rate.
 * Stock LWC always snaps X to bar centers AND runs hitTestPane on every
 * mousemove (even with CrosshairMode.Hidden). Capturing mode puts this
 * overlay above the plot so LWC never sees hover moves → no main-thread jank.
 */

export type FreeCrosshairHandle = {
  move: (clientX: number, clientY: number) => { x: number; y: number };
  hide: () => void;
  refreshRect: () => void;
  setCapturing: (on: boolean) => void;
  setPanning: (on: boolean) => void;
  setPlotInsets: (rightPx: number, bottomPx: number) => void;
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
    // Prefer the overlay box so inset (price/time scales) stays pixel-true.
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) {
      left = r.left;
      top = r.top;
      return;
    }
    const hr = host.getBoundingClientRect();
    left = hr.left;
    top = hr.top;
  };
  refreshRect();

  const move = (clientX: number, clientY: number) => {
    // Re-measure each move — layout/scroll must not drift the hair off the cursor.
    refreshRect();
    const x = clientX - left;
    const y = clientY - top;
    if (el.hidden) el.hidden = false;
    v.style.visibility = "";
    h.style.visibility = "";
    // Sync transform — no rAF; compositor-only so the hair never trails the cursor.
    v.style.transform = `translate3d(${x}px,0,0)`;
    h.style.transform = `translate3d(0,${y}px,0)`;
    return { x, y };
  };

  const hide = () => {
    // Keep the capturing hit-layer mounted (display:none would steal pan from us
    // while shell also skips — dead zone). Only tuck the hair lines away.
    v.style.visibility = "hidden";
    h.style.visibility = "hidden";
    if (!el.classList.contains("capturing")) el.hidden = true;
  };

  const setCapturing = (on: boolean) => {
    el.classList.toggle("capturing", on);
    if (on) el.hidden = false;
    else el.classList.remove("panning");
  };

  const setPanning = (on: boolean) => {
    el.classList.toggle("panning", on);
  };

  const setPlotInsets = (rightPx: number, bottomPx: number) => {
    el.style.right = `${Math.max(0, Math.ceil(rightPx))}px`;
    el.style.bottom = `${Math.max(0, Math.ceil(bottomPx))}px`;
    el.style.left = "0";
    el.style.top = "0";
  };

  const destroy = () => {
    el.remove();
  };

  return { move, hide, refreshRect, setCapturing, setPanning, setPlotInsets, destroy, el };
}
