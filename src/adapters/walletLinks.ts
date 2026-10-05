import { INTEGRATION } from "../config/integration";
import type { WalletAssetId } from "./assets";
import { assetById } from "./assets";
import { isLoopbackOrigin, sanitizeHttpUrl } from "../sanitize";

/** Public hub site for human CTAs — never same-origin /hub-proxy (API mirror, not the wallet UI). */
const PUBLIC_HUB = "https://hackme.tech";

/**
 * Origin for wallet / listing deep links.
 * `/hub-proxy` is only for status/API fetches from the desk; opening it as #wallet confuses users.
 */
export function publicHubOrigin(): string {
  const hub = INTEGRATION.hubOrigin.replace(/\/$/, "");
  if (!hub || /hub-proxy/i.test(hub)) return PUBLIC_HUB;
  if (
    typeof window !== "undefined" &&
    !isLoopbackOrigin(window.location.origin) &&
    isLoopbackOrigin(hub)
  ) {
    return PUBLIC_HUB;
  }
  return hub;
}

/**
 * Deep links into hackme-node / hub wallet.
 * On public desk builds never emit 127.0.0.1 or /hub-proxy — use https://hackme.tech.
 */
export function nodeWalletUrl(coin?: WalletAssetId): string {
  const raw = INTEGRATION.nodeOrigin.replace(/\/$/, "");
  const base =
    typeof window !== "undefined" &&
    !isLoopbackOrigin(window.location.origin) &&
    isLoopbackOrigin(raw)
      ? publicHubOrigin()
      : /hub-proxy/i.test(raw)
        ? publicHubOrigin()
        : raw || publicHubOrigin();
  const hash = coin ? assetById(coin).walletHash ?? "wallet" : "wallet";
  return `${base}/#${hash}`;
}

export function nodeTransferUrl(asset: WalletAssetId): string {
  const base = nodeWalletUrl().replace(/#.*$/, "");
  return `${base}/#wallet?focus=transfer&asset=${assetById(asset).symbol.toLowerCase()}`;
}

export function exchangeListingUrl(): string {
  return `${publicHubOrigin()}/listing.html`;
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
