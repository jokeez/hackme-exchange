import { INTEGRATION } from "../config/integration";
import type { WalletAssetId } from "./assets";
import { assetById } from "./assets";
import { sanitizeHttpUrl } from "../sanitize";

/** Build deep links into hackme-node dashboard (dashboard.html hash routes). */
export function nodeWalletUrl(coin?: WalletAssetId): string {
  const base = INTEGRATION.nodeOrigin.replace(/\/$/, "");
  const hash = coin ? assetById(coin).walletHash ?? "wallet" : "wallet";
  return `${base}/#${hash}`;
}

export function nodeTransferUrl(asset: WalletAssetId): string {
  const base = INTEGRATION.nodeOrigin.replace(/\/$/, "");
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
