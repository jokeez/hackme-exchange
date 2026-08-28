export type OracleMeta = {
  source: "live" | "fallback";
  fetchedAt: number;
  poolStatus: string;
};

export type OracleStatusKind = "offline" | "fallback" | "stale" | "live";

const STALE_SEC = 12;

export function oracleAgeSec(meta: OracleMeta, now = Date.now()): number | null {
  if (!meta.fetchedAt) return null;
  return Math.max(0, Math.floor((now - meta.fetchedAt) / 1000));
}

export function oracleStatusKind(meta: OracleMeta, now = Date.now()): OracleStatusKind {
  if (meta.poolStatus === "offline") return "offline";
  if (meta.poolStatus === "pending" || meta.fetchedAt === 0) return "fallback";
  if (meta.source === "fallback") return "fallback";
  const ageSec = oracleAgeSec(meta, now);
  if (ageSec !== null && ageSec > STALE_SEC) return "stale";
  return "live";
}

export function oracleStatusLabel(meta: OracleMeta, now = Date.now()): string {
  const kind = oracleStatusKind(meta, now);
  const ageSec = oracleAgeSec(meta, now);
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
    <span class="oracle-dot" aria-hidden="true"></span>
    <span class="oracle-label">${label}</span>
    <span class="oracle-hint dim">· ${sourceHint}</span>
    <button type="button" class="btn-sm oracle-retry" id="btn-oracle-retry" title="Refresh oracle now" aria-label="Refresh oracle now">↻</button>
  </div>`;
}

/** In-place age/kind refresh — avoids outerHTML flicker every second. */
export function patchOracleStatusDom(root: ParentNode, meta: OracleMeta, now = Date.now()): boolean {
  const el = root.querySelector<HTMLElement>(".oracle-status");
  if (!el) return false;
  const kind = oracleStatusKind(meta, now);
  const label = oracleStatusLabel(meta, now);
  const sourceHint = meta.source === "live" ? "pool API" : "local fallback";
  el.className = `oracle-status ${kind}`;
  el.title = `Pool coordinator feed · last sync ${oracleAgeSec(meta, now) ?? "—"}s ago`;
  const labelEl = el.querySelector(".oracle-label");
  const hintEl = el.querySelector(".oracle-hint");
  if (labelEl) labelEl.textContent = label;
  if (hintEl) hintEl.textContent = `· ${sourceHint}`;
  return true;
}
