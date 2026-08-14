export type OracleMeta = {
  source: "live" | "fallback";
  fetchedAt: number;
  poolStatus: string;
};

export type OracleStatusKind = "offline" | "fallback" | "stale" | "live";

const STALE_SEC = 12;

export function oracleStatusKind(meta: OracleMeta, now = Date.now()): OracleStatusKind {
  if (meta.poolStatus === "offline") return "offline";
  if (meta.source === "fallback") return "fallback";
  const ageSec = meta.fetchedAt ? Math.max(0, Math.floor((now - meta.fetchedAt) / 1000)) : null;
  if (ageSec !== null && ageSec > STALE_SEC) return "stale";
  return "live";
}

export function oracleStatusLabel(meta: OracleMeta, now = Date.now()): string {
  const kind = oracleStatusKind(meta, now);
  const ageSec = meta.fetchedAt ? Math.max(0, Math.floor((now - meta.fetchedAt) / 1000)) : null;
  switch (kind) {
    case "offline":
      return "Oracle offline";
    case "fallback":
      return "Oracle fallback (cached formula)";
    case "stale":
      return `Oracle stale · ${ageSec}s`;
    default:
      return `Oracle live · ${ageSec ?? 0}s`;
  }
}

export function renderOracleStatusHtml(meta: OracleMeta, now = Date.now()): string {
  const kind = oracleStatusKind(meta, now);
  const label = oracleStatusLabel(meta, now);
  const sourceHint = meta.source === "live" ? "pool API" : "local fallback";
  return `<div class="oracle-status ${kind}" role="status" aria-live="polite" title="Pool coordinator feed for mids">
    <span class="oracle-dot"></span>
    <span>${label}</span>
    <span class="dim">· ${sourceHint}</span>
    <button type="button" class="btn-sm oracle-retry" id="btn-oracle-retry" title="Refresh oracle now">↻</button>
  </div>`;
}
