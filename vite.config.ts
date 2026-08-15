import https from "node:https";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { URL } from "node:url";
import { defineConfig, type Connect, type Plugin } from "vite";

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

/** Map SPA same-origin paths → public hub/coordinator URLs. */
function rewriteHubTarget(reqUrl: string): string | null {
  const q = reqUrl.indexOf("?");
  const path = q >= 0 ? reqUrl.slice(0, q) : reqUrl;
  const qs = q >= 0 ? reqUrl.slice(q) : "";
  if (path.startsWith("/pool-proxy")) {
    return `https://hackme.tech/pool/coordinator${path.slice("/pool-proxy".length)}${qs}`;
  }
  if (path.startsWith("/hub-proxy")) {
    return `https://hackme.tech${path.slice("/hub-proxy".length)}${qs}`;
  }
  // Root-absolute paths used by hub pages loaded via /hub-proxy (explorer-lite).
  if (path.startsWith("/pool/") || path === "/pool") {
    return `https://hackme.tech${path}${qs}`;
  }
  if (path.startsWith("/api/")) {
    return `https://hackme.tech${path}${qs}`;
  }
  return null;
}

/**
 * Dev hub/oracle proxy via buffered https (IPv4 + retries).
 * Vite's http-proxy + CF anycast intermittently EHOSTUNREACH / stalls mid-body
 * on /api/work/stats, which made the desk look "offline" / not loading.
 */
function hubFetchProxyPlugin(): Plugin {
  // keepAlive false: CF anycast + reused sockets still stall under parallel oracle polls.
  const agent = new https.Agent({ family: 4, keepAlive: false, maxSockets: 16 });

  function getUpstream(
    target: string,
    attempt: number,
  ): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
    const u = new URL(target);
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          protocol: "https:",
          hostname: u.hostname,
          port: 443,
          path: u.pathname + u.search,
          method: "GET",
          agent,
          headers: {
            accept: "application/json, text/html, */*",
            "accept-encoding": "identity",
            "user-agent": "hackme-exchange-dev-proxy/1",
            host: u.hostname,
          },
          timeout: 12_000,
        },
        (up) => {
          const chunks: Buffer[] = [];
          up.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          up.on("end", () => {
            resolve({
              status: up.statusCode || 502,
              headers: up.headers,
              body: Buffer.concat(chunks),
            });
          });
          up.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error(`upstream timeout attempt ${attempt}`)));
      req.on("error", reject);
      req.end();
    });
  }

  async function handle(_req: Connect.IncomingMessage, res: ServerResponse, target: string) {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const up = await getUpstream(target, attempt);
        res.statusCode = up.status;
        const pass = ["content-type", "cache-control", "pragma", "expires", "x-content-type-options"];
        for (const k of pass) {
          const v = up.headers[k];
          if (v) res.setHeader(k, v);
        }
        res.setHeader("content-length", String(up.body.length));
        res.end(up.body);
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 40 * attempt));
      }
    }
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "hub_proxy_upstream", message: String(lastErr) }));
  }

  return {
    name: "hackme-hub-fetch-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const target = rewriteHubTarget(req.url || "");
        if (!target) return next();
        void handle(req, res, target);
      });
    },
  };
}

/**
 * Dev proxies for hub/oracle same-origin reads.
 *
 * Hub/oracle paths use `hubFetchProxyPlugin` (buffered + retry) — not Vite http-proxy.
 * `/exchange-api` still uses http-proxy to the loopback lab API.
 */
export default defineConfig({
  plugins: [cspPaperProdPlugin(), hubFetchProxyPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    open: true,
    proxy: {
      "/exchange-api": {
        target: "http://127.0.0.1:18443",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/exchange-api/, ""),
      },
    },
  },
  preview: { host: "127.0.0.1", port: 5199, strictPort: true },
});
