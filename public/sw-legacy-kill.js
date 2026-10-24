/* Legacy /sw.js kill-switch — CF may still HIT pre-v5 bodies at this URL.
 * Any client still registered here clears caches and unregisters itself.
 * Real worker lives at /sw-v5-<hash>.js (content-addressed; cannot be stale under old URL).
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window" }).then((clients) => {
          for (const c of clients) {
            try {
              c.navigate(c.url);
            } catch {
              /* ignore */
            }
          }
        }),
      ),
  );
});
