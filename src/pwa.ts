/** PWA install prompt + service worker registration. */

let deferredInstall: BeforeInstallPromptEvent | null = null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const PWA_BANNER_DISMISS_KEY = "hackme.pwa.banner.dismiss";

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

  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
    console.warn("[pwa] service worker registration failed", err);
  });
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
