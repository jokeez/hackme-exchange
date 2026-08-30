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

/** Parent hub origins allowed for postMessage (loopback lab + production hackme.tech). */
export function hubParentPostMessageOrigin(referrer?: string): string | null {
  const fallback = "http://127.0.0.1:8080";
  const ref = (referrer ?? "").trim();
  if (!ref) return fallback;
  try {
    const origin = new URL(ref).origin;
    if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) return origin;
    if (/^https:\/\/([a-z0-9-]+\.)*hackme\.tech$/i.test(origin)) return origin;
    return null;
  } catch {
    return null;
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
    "hms-market",
  ]);
  if (!allowed.has(tab)) return false;
  const target = hubParentPostMessageOrigin(
    typeof document !== "undefined" ? document.referrer : undefined,
  );
  if (!target) return false;
  try {
    window.parent.postMessage({ type: "hackme-exchange", action: "goto-tab", tab }, target);
    return true;
  } catch {
    return false;
  }
}
