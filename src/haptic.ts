/** Light tap feedback — book row, tab switches, confirm taps. */
export function hapticLight(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch {
    /* ignore */
  }
}

/** Order placed / success path. */
export function hapticSuccess(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([12, 40, 12]);
    }
  } catch {
    /* ignore */
  }
}

/** Guard reject / validation error. */
export function hapticError(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([20, 60, 20, 60, 20]);
    }
  } catch {
    /* ignore */
  }
}
