import type { Wallet } from "./types";

const WALLET_KEYS = new Set<keyof Wallet>(["hmc", "sup", "usdt", "btc"]);

export type ActivityTabId = "tape" | "orders" | "history" | "alerts";
export type AcctWalletTab = "assets" | "account";

const KEYS = {
  convertFrom: "hackme.ui.convertFrom",
  convertTo: "hackme.ui.convertTo",
  convertAmt: "hackme.ui.convertAmt",
  convertSlippageBps: "hackme.ui.convertSlippageBps",
  activityTab: "hackme.ui.activityTab",
  acctTab: "hackme.ui.acctTab",
  acctHideSmall: "hackme.ui.acctHideSmall",
} as const;

export const DEFAULT_CONVERT_SLIPPAGE_BPS = 50;

function readStorage(getter: () => string | null): string | null {
  try {
    return getter();
  } catch {
    return null;
  }
}

function writeStorage(setter: () => void): void {
  try {
    setter();
  } catch {
    /* ignore quota / private mode */
  }
}

function parseWalletKey(raw: string | null, fallback: keyof Wallet): keyof Wallet {
  if (raw && WALLET_KEYS.has(raw as keyof Wallet)) return raw as keyof Wallet;
  return fallback;
}

export function loadConvertDesk(): { from: keyof Wallet; to: keyof Wallet; amt: string } {
  const from = parseWalletKey(readStorage(() => localStorage.getItem(KEYS.convertFrom)), "hmc");
  let to = parseWalletKey(readStorage(() => localStorage.getItem(KEYS.convertTo)), "usdt");
  if (to === from) {
    to = from === "hmc" ? "usdt" : "hmc";
  }
  const amt = readStorage(() => localStorage.getItem(KEYS.convertAmt)) ?? "100";
  return { from, to, amt: amt.trim() || "100" };
}

export function saveConvertDesk(from: keyof Wallet, to: keyof Wallet, amt: string): void {
  writeStorage(() => {
    localStorage.setItem(KEYS.convertFrom, from);
    localStorage.setItem(KEYS.convertTo, to);
    localStorage.setItem(KEYS.convertAmt, amt);
  });
}

export function loadActivityTab(): ActivityTabId {
  const raw = readStorage(() => localStorage.getItem(KEYS.activityTab));
  if (raw === "tape" || raw === "history" || raw === "alerts" || raw === "orders") return raw;
  return "orders";
}

export function saveActivityTab(tab: ActivityTabId): void {
  writeStorage(() => localStorage.setItem(KEYS.activityTab, tab));
}

export function loadAcctTab(): AcctWalletTab {
  const raw = readStorage(() => localStorage.getItem(KEYS.acctTab));
  return raw === "account" ? "account" : "assets";
}

export function saveAcctTab(tab: AcctWalletTab): void {
  writeStorage(() => localStorage.setItem(KEYS.acctTab, tab));
}

export function loadAcctHideSmall(): boolean {
  return readStorage(() => localStorage.getItem(KEYS.acctHideSmall)) === "1";
}

export function saveAcctHideSmall(on: boolean): void {
  writeStorage(() => {
    if (on) localStorage.setItem(KEYS.acctHideSmall, "1");
    else localStorage.removeItem(KEYS.acctHideSmall);
  });
}

export function loadConvertSlippageBps(): number {
  const raw = readStorage(() => localStorage.getItem(KEYS.convertSlippageBps));
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 500) return Math.round(n);
  return DEFAULT_CONVERT_SLIPPAGE_BPS;
}

export function saveConvertSlippageBps(bps: number): void {
  const clamped = Math.max(0, Math.min(500, Math.round(bps)));
  writeStorage(() => localStorage.setItem(KEYS.convertSlippageBps, String(clamped)));
}
