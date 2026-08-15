import https from "node:https";
import { defineConfig, type Plugin } from "vite";

/**
 * FE-M-CSP: paper/prod builds drop loopback connect-src; lab/dev keep them.
 */
function cspPaperProdPlugin(): Plugin {
  const paperCsp =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://hackme.tech; connect-src 'self' https://hackme.tech; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
  return {
    name: "hackme-csp-paper-prod",
    transformIndexHtml(html, ctx) {
      const env = process.env as Record<string, string | undefined>;
      const mode = (env.VITE_INTEGRATION_MODE || "").toLowerCase();
      const labFlag = (env.VITE_LAB_API || "").toLowerCase();
      const apiOrigin = (env.VITE_EXCHANGE_API_ORIGIN || "").trim();
      const wantsLab =
        mode === "lab" || labFlag === "1" || labFlag === "true" || !!apiOrigin || !!ctx.server;
      if (wantsLab) return html;
      // Production paper: strip loopback lab connect-src from meta CSP.
      return html.replace(
        /content="default-src 'self';[\s\S]*?object-src 'none'"/,
        `content="${paperCsp}"`,
      );
    },
  };
}

/** Prefer IPv4 — some hosts resolve AAAA first and Node hits EHOSTUNREACH. */
const hubHttpsAgent = new https.Agent({ family: 4, keepAlive: true });

const hubProxy = {
  target: "https://hackme.tech",
  changeOrigin: true,
  agent: hubHttpsAgent,
} as const;

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
  plugins: [cspPaperProdPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    open: true,
    proxy: {
      "/pool-proxy": {
        ...hubProxy,
        rewrite: (p) => p.replace(/^\/pool-proxy/, "/pool/coordinator"),
      },
      "/hub-proxy": {
        ...hubProxy,
        rewrite: (p) => p.replace(/^\/hub-proxy/, ""),
      },
      // Root-absolute paths used by hub pages loaded via /hub-proxy (explorer-lite).
      "/pool": { ...hubProxy },
      "/api": { ...hubProxy },
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
