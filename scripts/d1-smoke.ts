#!/usr/bin/env npx tsx
/**
 * D1 local smoke — loopback exchange-api (Postgres or SQLite). No VPS / no public edge.
 *
 *   cd hackme-exchange-demo && npm run smoke:d1
 * Prereq: bash ../hackme-exchange-api/scripts/d1_local_up.sh
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const demoRoot = resolve(here, "..");
const apiRoots = [
  process.env.HACKME_EXCHANGE_API,
  resolve(demoRoot, "../hackme-exchange-api"),
].filter(Boolean) as string[];

function loadAdminFromApiEnv(): void {
  if (process.env.EXCHANGE_ADMIN_TOKEN) return;
  for (const root of apiRoots) {
    const f = resolve(root, ".env.d1.local");
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^EXCHANGE_ADMIN_TOKEN=(.+)$/m);
    if (m) {
      process.env.EXCHANGE_ADMIN_TOKEN = m[1].trim();
      return;
    }
  }
  const legacyRoot = apiRoots[0];
  if (legacyRoot) {
    const legacy = resolve(legacyRoot, ".env");
    if (existsSync(legacy)) {
      const m = readFileSync(legacy, "utf8").match(/^EXCHANGE_ADMIN_TOKEN=(.+)$/m);
      if (m) process.env.EXCHANGE_ADMIN_TOKEN = m[1].trim();
    }
  }
}

async function main(): Promise<number> {
  const api = process.env.EXCHANGE_API_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:18443";
  console.log(`D1 smoke → ${api}\n`);

  try {
    const h = await fetch(`${api}/health`);
    const j = (await h.json()) as { ok?: boolean; db_driver?: string };
    if (!h.ok || !j.ok) {
      console.error("[FAIL] /health — start API: bash hackme-exchange-api/scripts/d1_local_up.sh");
      return 1;
    }
    console.log(`[OK] health db_driver=${j.db_driver ?? "?"}`);
  } catch (e) {
    console.error("[FAIL] API unreachable — run d1_local_up.sh first");
    console.error(e);
    return 1;
  }

  loadAdminFromApiEnv();
  const labSmoke = resolve(demoRoot, "scripts/lab-smoke.ts");
  const r = spawnSync("npx", ["tsx", labSmoke], {
    stdio: "inherit",
    env: { ...process.env, EXCHANGE_API_ORIGIN: api },
    cwd: demoRoot,
  });
  return r.status ?? 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
