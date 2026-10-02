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
  const prodFallback = "https://hackme.tech";
  const ref = (referrer ?? "").trim();
  if (!ref) {
    // Empty referrer on production embed must not target loopback.
    try {
      if (typeof location !== "undefined" && /hackme\.tech$/i.test(location.hostname)) {
        return prodFallback;
      }
    } catch {
      /* ignore */
    }
    return "http://127.0.0.1:8080";
  }
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
  return postHubMessage({ type: "hackme-exchange", action: "goto-tab", tab });
}

/**
 * Sanitize SPA deep-link hash for hub sync / iframe restore.
 * Accepts #spot/PAIR/tf, #convert/…, #account/…, #pool/….
 */
export function sanitizeExchangeRouteHash(hash: string): string | null {
  const raw = String(hash || "")
    .replace(/^#/, "")
    .trim();
  if (!raw || raw.length > 160) return null;
  if (
    !/^(spot\/[A-Z0-9_]+\/[0-9A-Za-z]+|convert(\/[a-z]{2,8}){0,2}|account(\/[a-z]{2,16})?|pool(\/lookup\/[A-Za-z0-9_.:%-]+)?)$/.test(
      raw,
    )
  ) {
    return null;
  }
  return `#${raw}`;
}

/** Tell parent hub the current SPA route so Pop out / reload keep pair+TF. */
export function postHubRoute(hash: string): boolean {
  if (!isHubEmbed() || typeof window === "undefined" || !window.parent || window.parent === window) {
    return false;
  }
  const safe = sanitizeExchangeRouteHash(hash);
  if (!safe) return false;
  return postHubMessage({ type: "hackme-exchange", action: "route", hash: safe });
}

function postHubMessage(data: Record<string, unknown>): boolean {
  const target = hubParentPostMessageOrigin(
    typeof document !== "undefined" ? document.referrer : undefined,
  );
  if (!target) return false;
  try {
    window.parent.postMessage(data, target);
    return true;
  } catch {
    return false;
  }
}
