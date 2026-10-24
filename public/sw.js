/* HackMe Exchange — offline shell only. Never pin index/boot forever. */
const CACHE = "hackme-ex-v5";
const SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/logo-hex.png",
  "/icons/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigation(request) {
  return request.mode === "navigate" || request.destination === "document";
}

/** HTML / boot / SW entry — always prefer network; never treat as immutable. */
function isVolatilePath(pathname) {
  if (pathname === "/" || pathname === "/index.html") return true;
  if (pathname === "/sw.js" || pathname === "/theme-boot.js") return true;
  if (/^\/sw-v\d+-[a-f0-9]+\.js$/.test(pathname)) return true;
  if (pathname.startsWith("/assets/boot-")) return true;
  return false;
}

/** Hashed bundles (except boot loader) — safe cache-first. */
function isImmutableAsset(pathname) {
  if (!pathname.startsWith("/assets/")) return false;
  if (pathname.startsWith("/assets/boot-")) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations + HTML: network-first, offline.html only as last resort.
  // Do NOT write successful HTML into Cache — that pinned stale boot refs.
  if (isNavigation(request) || url.pathname === "/index.html" || url.pathname === "/") {
    event.respondWith(
      fetch(request)
        .then((res) => res)
        .catch(() =>
          caches.match("/offline.html").then((r) => r || new Response("Offline", { status: 503 })),
        ),
    );
    return;
  }

  if (isVolatilePath(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => res)
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (isImmutableAsset(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  // Other same-origin static (css/js outside /assets, manifest, theme): network-first.
  if (
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request)),
    );
  }
});
