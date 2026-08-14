import type { ThemeId } from "./types";

const KEY = "hackme-exchange-demo-v5";
const LEGACY_THEME_KEY = "hackme-exchange-demo-v4-theme";

/** Lab loopback → Wallet chrome; hackme.tech (and default) → Hub. */
export function defaultThemeForHost(hostname?: string): ThemeId {
  try {
    const h = (hostname ?? (typeof location !== "undefined" ? location.hostname : "")).toLowerCase();
    if (h === "127.0.0.1" || h === "localhost" || h === "[::1]") return "wallet";
    if (h === "hackme.tech" || h.endsWith(".hackme.tech")) return "hub";
  } catch {
    /* ignore */
  }
  return "hub";
}

export function loadTheme(): ThemeId {
  const cur = localStorage.getItem(`${KEY}-theme`) as ThemeId | null;
  if (cur === "hub" || cur === "wallet") return cur;
  const legacy = localStorage.getItem(LEGACY_THEME_KEY) as ThemeId | null;
  if (legacy === "hub" || legacy === "wallet") {
    localStorage.setItem(`${KEY}-theme`, legacy);
    return legacy;
  }
  return defaultThemeForHost();
}

export function saveTheme(t: ThemeId): void {
  localStorage.setItem(`${KEY}-theme`, t);
  document.documentElement.dataset.theme = t;
}

export function applyTheme(t: ThemeId): void {
  document.documentElement.dataset.theme = t;
}

export { KEY as STORAGE_KEY };
