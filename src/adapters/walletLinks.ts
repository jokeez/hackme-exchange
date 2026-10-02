import { INTEGRATION } from "../config/integration";
import type { WalletAssetId } from "./assets";
import { assetById } from "./assets";
import { isLoopbackOrigin, sanitizeHttpUrl } from "../sanitize";

/**
 * Deep links into hackme-node / hub wallet.
 * On public desk builds never emit 127.0.0.1 — use hub origin instead.
 */
export function nodeWalletUrl(coin?: WalletAssetId): string {
  const raw = INTEGRATION.nodeOrigin.replace(/\/$/, "");
  const base =
    typeof window !== "undefined" &&
    !isLoopbackOrigin(window.location.origin) &&
    isLoopbackOrigin(raw)
      ? INTEGRATION.hubOrigin.replace(/\/$/, "")
      : raw;
  const hash = coin ? assetById(coin).walletHash ?? "wallet" : "wallet";
  return `${base}/#${hash}`;
}

export function nodeTransferUrl(asset: WalletAssetId): string {
  const base = nodeWalletUrl().replace(/#.*$/, "");
  return `${base}/#wallet?focus=transfer&asset=${assetById(asset).symbol.toLowerCase()}`;
}

export function exchangeListingUrl(): string {
  return `${INTEGRATION.hubOrigin}/listing.html`;
}

export function poolCoordinatorUrl(): string {
  return `${INTEGRATION.poolCoordinatorOrigin}`;
}

/** Open only http(s) URLs — blocks javascript: / data: open-redirect style abuse. */
export function openInNewTab(url: string): void {
  const safe = sanitizeHttpUrl(url, "");
  if (!safe) return;
  window.open(safe, "_blank", "noopener,noreferrer");
}
