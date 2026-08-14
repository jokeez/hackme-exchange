import { defineConfig } from "vite";

/**
 * Dev proxies for hub/oracle same-origin reads.
 *
 * `/hub-proxy` serves pages like explorer-lite.html from hackme.tech, but that
 * HTML uses root-absolute fetches (`/pool/coordinator/api/...`, `/api/status`).
 * Without matching `/pool` + `/api` proxies those resolve to this Vite origin and
 * SPA-fallback to exchange index.html (raw HTML in the stats panes).
 *
 * Keep `/pool-proxy` registered before `/pool` so `/pool-proxy/*` is not
 * swallowed by a `/pool` prefix match.
 */
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    open: true,
    proxy: {
      "/pool-proxy": {
        target: "https://hackme.tech",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/pool-proxy/, "/pool/coordinator"),
      },
      "/hub-proxy": {
        target: "https://hackme.tech",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/hub-proxy/, ""),
      },
      // Root-absolute paths used by hub pages loaded via /hub-proxy (explorer-lite).
      "/pool": {
        target: "https://hackme.tech",
        changeOrigin: true,
      },
      "/api": {
        target: "https://hackme.tech",
        changeOrigin: true,
      },
      // Optional same-origin proxy for lab cookies / CORS debugging (loopback API).
      "/exchange-api": {
        target: "http://127.0.0.1:18443",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/exchange-api/, ""),
      },
    },
  },
  preview: { host: "127.0.0.1", port: 5199, strictPort: true },
});
