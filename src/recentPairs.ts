import type { PairId } from "./types";

const KEY = "hmx-recent-pairs";
const MAX = 6;
let memory: PairId[] = [];

function store(): Storage | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    /* private mode */
  }
  return null;
}

export function loadRecentPairs(): PairId[] {
  const s = store();
  if (!s) return [...memory];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is PairId => typeof x === "string" && x.includes("_")).slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentPair(pair: PairId): PairId[] {
  const next = [pair, ...loadRecentPairs().filter((p) => p !== pair)].slice(0, MAX);
  memory = next;
  const s = store();
  if (s) {
    try {
      s.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }
  return next;
}

/** Test helper — clear memory + storage. */
export function clearRecentPairs(): void {
  memory = [];
  const s = store();
  try {
    s?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
