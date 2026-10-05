import type { MarketSnapshot, Wallet } from "../types";
import { formatNum } from "../market";
import { escapeHtml } from "../sanitize";

export type WalletSliceId = "paper" | "node" | "lab" | "desk" | "hub";

export type WalletSlice = {
  id: WalletSliceId;
  label: string;
  subtitle: string;
  wallet: Wallet;
  /** When set, row shows a CTA link (Open / Connect). */
  href?: string;
  /** CTA label when href is set (default Open). */
  cta?: string;
};

export type MultiWalletMode = "desk" | "lab" | "paper";

export type MultiWalletContext = {
  mode: MultiWalletMode;
  /** Spot / convert / desk-synced balances in this browser. */
  ledgerWallet: Wallet;
  nodeWallet: Wallet;
  deskConnected: boolean;
  deskMatchingLive: boolean;
  publicDeskBook: boolean;
  labConnected: boolean;
  /** Hub or node deep-link (already origin-safe). */
  chainWalletHref: string;
  chainWalletLabel: string;
};

const EMPTY: Wallet = { usdt: 0, hmc: 0, sup: 0, btc: 0 };

export function multiWalletTagline(mode: MultiWalletMode): string {
  switch (mode) {
    case "desk":
      return "Desk ledger · soft-launch Spot";
    case "lab":
      return "Lab ledger · local node wallet";
    default:
      return "Paper trading · local node wallet";
  }
}

/**
 * Mode-aware multi-wallet rows.
 * Soft-launch desk: desk ledger primary, hub secondary — no paper/lab sandbox chrome.
 * Lab loopback: lab + node. Paper/offline: paper + node.
 */
export function resolveMultiWalletSlices(ctx: MultiWalletContext): WalletSlice[] {
  const chainHref = ctx.chainWalletHref.trim();

  if (ctx.mode === "desk") {
    const live = ctx.deskConnected;
    const matching = ctx.deskMatchingLive;
    const book = ctx.publicDeskBook;
    const desk: WalletSlice = {
      id: "desk",
      label: "Desk ledger",
      subtitle: matching
        ? "Soft-launch Spot · live matching"
        : live
          ? "Connected · server balances"
          : book
            ? "Live book · Connect to trade"
            : "Connect wallet to sync balances",
      wallet: live || matching ? ctx.ledgerWallet : EMPTY,
    };
    if (!live) {
      desk.href = "#acct-desk";
      desk.cta = "Connect";
    }
    const slices: WalletSlice[] = [desk];
    if (chainHref) {
      slices.push({
        id: "hub",
        label: ctx.chainWalletLabel,
        subtitle: "On-chain HMC/SUP · HackMe hub",
        wallet: ctx.nodeWallet,
        href: chainHref,
        cta: "Open",
      });
    }
    return slices;
  }

  if (ctx.mode === "lab") {
    const lab: WalletSlice = {
      id: "lab",
      label: "Lab ledger",
      subtitle: ctx.labConnected
        ? "Private DEMO/LAB matching session"
        : "Connect fixture for lab balances",
      wallet: ctx.labConnected ? ctx.ledgerWallet : EMPTY,
    };
    if (!ctx.labConnected) {
      lab.href = "#acct-lab";
      lab.cta = "Connect";
    }
    const slices: WalletSlice[] = [lab];
    if (chainHref) {
      slices.push({
        id: "node",
        label: ctx.chainWalletLabel,
        subtitle: ctx.nodeWallet.hmc > 0 || ctx.nodeWallet.sup > 0
          ? "Synced HMC/SUP from hackme-node"
          : "Local node · Sync HMC/SUP when running",
        wallet: ctx.nodeWallet,
        href: chainHref,
        cta: "Open",
      });
    }
    return slices;
  }

  // Offline / paper builds only
  const slices: WalletSlice[] = [
    {
      id: "paper",
      label: "Paper wallet",
      subtitle: "Spot · Convert · localStorage demo",
      wallet: ctx.ledgerWallet,
    },
  ];
  if (chainHref) {
    slices.push({
      id: "node",
      label: ctx.chainWalletLabel,
      subtitle: ctx.nodeWallet.hmc > 0 || ctx.nodeWallet.sup > 0
        ? "Synced HMC/SUP from hackme-node"
        : "Connect local node to sync on-chain balances",
      wallet: ctx.nodeWallet,
      href: chainHref,
      cta: "Open",
    });
  }
  return slices;
}

export function renderMultiWalletCard(
  slices: WalletSlice[],
  market: MarketSnapshot,
  tagline = "Paper trading · local node wallet",
): string {
  if (!slices.length) return "";
  const rows = slices
    .map((s) => {
      const usdt =
        s.wallet.usdt +
        s.wallet.hmc * market.hmcUsdt +
        s.wallet.sup * market.supUsdt +
        s.wallet.btc * market.btcUsd;
      let link: string;
      if (s.href) {
        const label = escapeHtml(s.cta || "Open");
        const external = s.href.startsWith("http");
        link = `<a class="link small" href="${escapeHtml(s.href)}"${
          external ? ' target="_blank" rel="noopener noreferrer"' : ""
        }>${label}</a>`;
      } else {
        link = `<span class="muted small">Active</span>`;
      }
      return `<article class="multi-wallet-row" data-wallet-slice="${s.id}">
        <div>
          <strong>${escapeHtml(s.label)}</strong>
          <p class="muted small">${escapeHtml(s.subtitle)}</p>
        </div>
        <div class="multi-wallet-bal">
          <span class="mono">${formatNum(usdt, 2)} USDT</span>
          ${link}
        </div>
      </article>`;
    })
    .join("");

  return `<section class="acct-section multi-wallet glass-inset" id="multi-wallet">
    <header class="acct-section-head">
      <h3>Multi-wallet</h3>
      <p class="muted small">${escapeHtml(tagline)}</p>
    </header>
    <div class="multi-wallet-list">${rows}</div>
  </section>`;
}
