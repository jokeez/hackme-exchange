/** PWA install prompt + service worker registration (force-activate on deploy). */

let deferredInstall: BeforeInstallPromptEvent | null = null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const PWA_BANNER_DISMISS_KEY = "hackme.pwa.banner.dismiss";

/**
 * Production build (cf_chunk_assets) replaces this exact path with `/sw-v5-<hash>.js`.
 * Dev uses plain `/sw.js` from public/.
 */
const BUILT_SW_URL = "/sw-v5-PLACEHOLDER.js";
const EXPECTED_SW_URL = import.meta.env.DEV ? "/sw.js" : BUILT_SW_URL;
const EXPECTED_CACHE = "hackme-ex-v5";

function askWaitingToActivate(worker: ServiceWorker | null | undefined): void {
  if (!worker) return;
  try {
    worker.postMessage({ type: "SKIP_WAITING" });
  } catch {
    /* ignore */
  }
}

function scriptUrlMatchesExpected(scriptURL: string): boolean {
  try {
    const path = new URL(scriptURL, location.origin).pathname;
    return path === EXPECTED_SW_URL;
  } catch {
    return false;
  }
}

/** Drop every SW registration that is not the content-hashed worker, every boot. */
async function unregisterStaleServiceWorkers(): Promise<boolean> {
  const regs = await navigator.serviceWorker.getRegistrations();
  let removed = false;
  await Promise.all(
    regs.map(async (reg) => {
      const urls = [reg.active, reg.waiting, reg.installing]
        .filter(Boolean)
        .map((w) => (w as ServiceWorker).scriptURL);
      const ok = urls.length > 0 && urls.every((u) => scriptUrlMatchesExpected(u));
      if (!ok) {
        removed = true;
        try {
          await reg.unregister();
        } catch {
          /* ignore */
        }
      }
    }),
  );
  return removed;
}

async function purgeNonExpectedCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    const controller = navigator.serviceWorker.controller;
    const controllerOk = !!(controller && scriptUrlMatchesExpected(controller.scriptURL));
    await Promise.all(
      keys
        .filter((k) => {
          if (!k.startsWith("hackme-ex-")) return false;
          // Until the expected controller owns the page, wipe everything — including a
          // half-installed cache left by a racing old /sw.js registration.
          if (!controllerOk) return true;
          return k !== EXPECTED_CACHE;
        })
        .map((k) => caches.delete(k)),
    );
  } catch {
    /* ignore */
  }
}

export function initPwa(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    showInstallChip();
    showInstallBanner();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    document.getElementById("pwa-install-chip")?.remove();
    document.getElementById("pwa-install-banner")?.remove();
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  void (async () => {
    try {
      const removed = await unregisterStaleServiceWorkers();
      await purgeNonExpectedCaches();

      const reg = await navigator.serviceWorker.register(EXPECTED_SW_URL, {
        scope: "/",
        updateViaCache: "none",
      });
      askWaitingToActivate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") askWaitingToActivate(installing);
        });
      });
      void reg.update();

      if (removed && !navigator.serviceWorker.controller) {
        askWaitingToActivate(reg.installing || reg.waiting || reg.active);
      }
    } catch (err) {
      console.warn("[pwa] service worker registration failed", err);
    }
  })();
}

function bannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(PWA_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function showInstallChip(): void {
  if (document.getElementById("pwa-install-chip")) return;
  if (window.matchMedia("(display-mode: standalone)").matches) return;
  const chip = document.createElement("button");
  chip.id = "pwa-install-chip";
  chip.type = "button";
  chip.className = "pwa-install-chip";
  chip.textContent = "Install app";
  chip.title = "Add HackMe Exchange to your home screen";
  chip.addEventListener("click", () => void promptInstall());
  document.body.appendChild(chip);
}

function showInstallBanner(): void {
  if (document.getElementById("pwa-install-banner")) return;
  if (window.matchMedia("(display-mode: standalone)").matches) return;
  if (bannerDismissed()) return;

  const banner = document.createElement("aside");
  banner.id = "pwa-install-banner";
  banner.className = "pwa-install-banner glass";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Install HackMe Exchange");
  banner.innerHTML = `<div class="pwa-banner-body">
    <strong>Install HackMe Exchange</strong>
    <p class="muted small">Add to home screen for faster access and price alert notifications — no app store.</p>
  </div>
  <div class="pwa-banner-actions">
    <button type="button" class="btn-sm" id="pwa-banner-dismiss">Not now</button>
    <button type="button" class="btn-primary btn-sm" id="pwa-banner-install">Install</button>
  </div>`;
  banner.querySelector("#pwa-banner-dismiss")?.addEventListener("click", () => {
    try {
      sessionStorage.setItem(PWA_BANNER_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    banner.remove();
  });
  banner.querySelector("#pwa-banner-install")?.addEventListener("click", () => {
    void promptInstall().then((ok) => {
      if (ok) banner.remove();
    });
  });
  document.body.appendChild(banner);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  try {
    await deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === "accepted") {
      deferredInstall = null;
      document.getElementById("pwa-install-chip")?.remove();
      document.getElementById("pwa-install-banner")?.remove();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function hasInstallPrompt(): boolean {
  return !!deferredInstall;
}
