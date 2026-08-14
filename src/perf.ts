/** Tiny debounce / throttle / marks for low-latency UX. */

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...args: Parameters<T>) => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (t !== undefined) clearTimeout(t);
    t = undefined;
  };
  return wrapped;
}

export function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remain = ms - (now - last);
    lastArgs = args;
    if (remain <= 0) {
      if (pending !== undefined) {
        clearTimeout(pending);
        pending = undefined;
      }
      last = now;
      fn(...args);
      return;
    }
    if (pending === undefined) {
      pending = setTimeout(() => {
        pending = undefined;
        last = Date.now();
        if (lastArgs) fn(...lastArgs);
      }, remain);
    }
  }) as T;
}

/** Optional performance mark — no-op if Performance API missing. */
export function markPerf(name: string): void {
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

export function measurePerf(name: string, startMark: string, endMark: string): number | null {
  try {
    performance.mark(endMark);
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name);
    const last = entries[entries.length - 1];
    return last ? last.duration : null;
  } catch {
    return null;
  }
}
