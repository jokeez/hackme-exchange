/** Detect hub iframe embed via explicit `?embed=hub` only (L5). */
export function isHubEmbed(): boolean {
  try {
    if (typeof location !== "undefined") {
      const q = new URLSearchParams(location.search);
      if (q.get("embed") === "hub") return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function applyHubEmbedChrome(): void {
  if (!isHubEmbed()) return;
  try {
    document.documentElement.dataset.embed = "hub";
  } catch {
    /* ignore */
  }
}

/** Ask parent hub to switch tab (wallet, etc.). No-op when not embedded. */
export function postHubGotoTab(tab: string): boolean {
  if (!isHubEmbed() || typeof window === "undefined" || !window.parent || window.parent === window) {
    return false;
  }
  // Allowlist only — never forward arbitrary strings to parent navigation.
  const allowed = new Set([
    "ecosystem",
    "overview",
    "analytics",
    "mining",
    "hardware",
    "chain",
    "wallet",
    "exchange",
    "reports",
    "orders",
    "fuzz",
  ]);
  if (!allowed.has(tab)) return false;
  let target = "http://127.0.0.1:8080";
  try {
    if (document.referrer) {
      const origin = new URL(document.referrer).origin;
      // Loopback hub only
      if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) target = origin;
      else return false;
    }
  } catch {
    /* keep default */
  }
  try {
    window.parent.postMessage({ type: "hackme-exchange", action: "goto-tab", tab }, target);
    return true;
  } catch {
    return false;
  }
}
