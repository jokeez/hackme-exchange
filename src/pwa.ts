/** PWA install prompt + service worker registration. */

let deferredInstall: BeforeInstallPromptEvent | null = null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function initPwa(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    showInstallChip();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    document.getElementById("pwa-install-chip")?.remove();
  });

  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
    console.warn("[pwa] service worker registration failed", err);
  });
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

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  try {
    await deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === "accepted") {
      deferredInstall = null;
      document.getElementById("pwa-install-chip")?.remove();
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
