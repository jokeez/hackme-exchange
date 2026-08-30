/**
 * Lab session guard — stale CSRF detection, auto-reconnect, periodic order/fill sync.
 */

import { isLabApiEnabled } from "../config/integration";
import { labFixtureConnect } from "./labFixture";
import { isLabSessionStale, syncLabOrdersFillsLight, useLabMatching } from "./labMatching";
import type { DemoState, MarketSnapshot } from "../types";

export type LabSessionGuardOpts = {
  getState: () => DemoState;
  getMarket: () => MarketSnapshot | null;
  saveState: () => void;
  onStale: (note: string) => void;
  onReconnected: (note: string) => void;
  onSync: (note: string) => void;
  onBookRefresh?: () => void;
};

let guardTimer: number | undefined;
let reconnectInFlight = false;
let syncInFlight = false;
let tickN = 0;

export function startLabSessionGuard(opts: LabSessionGuardOpts): () => void {
  stopLabSessionGuard();

  const tick = async (forceSync = false) => {
    if (!isLabApiEnabled()) return;
    tickN += 1;

    if (isLabSessionStale()) {
      opts.onStale("Lab session stale — reconnecting fixture…");
      if (!reconnectInFlight) {
        reconnectInFlight = true;
        try {
          const res = await labFixtureConnect();
          if (res.ok) {
            const sync = await syncLabOrdersFillsLight(opts.getState(), opts.getMarket());
            if (sync.ok) {
              opts.saveState();
              opts.onReconnected(`Lab reconnected · ${res.fixture.address.slice(0, 14)}…`);
              opts.onSync(sync.note);
              opts.onBookRefresh?.();
            }
          }
        } finally {
          reconnectInFlight = false;
        }
      }
      return;
    }

    if (!useLabMatching()) return;
    if (syncInFlight) return;
    // Light sync every ~30s, or on forced visibility resume.
    if (!forceSync && tickN % 2 !== 0) return;

    syncInFlight = true;
    try {
      const sync = await syncLabOrdersFillsLight(opts.getState(), opts.getMarket());
      if (sync.ok && sync.changed) {
        opts.saveState();
        opts.onSync(sync.note);
        if (sync.bookChanged) opts.onBookRefresh?.();
      }
    } finally {
      syncInFlight = false;
    }
  };

  guardTimer = window.setInterval(() => void tick(false), 15_000);
  const onVis = () => {
    if (document.visibilityState === "visible") void tick(true);
  };
  document.addEventListener("visibilitychange", onVis);
  void tick(true);

  return () => {
    stopLabSessionGuard();
    document.removeEventListener("visibilitychange", onVis);
  };
}

export function stopLabSessionGuard(): void {
  if (guardTimer) {
    clearInterval(guardTimer);
    guardTimer = undefined;
  }
}

/** Test hook — reset module state between tests. */
export function resetLabSessionGuardForTest(): void {
  stopLabSessionGuard();
  reconnectInFlight = false;
  syncInFlight = false;
  tickN = 0;
}
