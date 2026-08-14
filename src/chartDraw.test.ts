import { describe, expect, it } from "vitest";
import {
  computeMeasureStats,
  formatDuration,
  isMeaningfulMeasure,
  sanitizeDrawing,
  sanitizeDrawings,
  stripPollutionKeys,
  escapeDrawingLabel,
  removeDrawingById,
  drawingsForPair,
  resolvePaintDrawings,
} from "./chartDraw";
import type { Drawing } from "./types";

const hline = (id: string, pairId: Drawing["pairId"] = "HMC_USDT"): Drawing => ({
  id,
  pairId,
  tool: "hline",
  points: [{ time: 1, price: 2 }],
  color: "#00e5ff",
});

const measure = (id: string): Drawing => ({
  id,
  pairId: "HMC_USDT",
  tool: "measure",
  points: [
    { time: 1, price: 1 },
    { time: 10, price: 2 },
  ],
  color: "#ffb347",
});


describe("computeMeasureStats", () => {
  it("reports price %, bars and time for a 15m range", () => {
    const a = { time: 1_700_000_000, price: 100 };
    const b = { time: 1_700_000_000 + 900 * 4, price: 110 };
    const st = computeMeasureStats(a, b, "15m");
    expect(st.dPrice).toBe(10);
    expect(st.dPct).toBeCloseTo(10, 5);
    expect(st.bars).toBe(4);
    expect(st.up).toBe(true);
    expect(st.timeLabel).toMatch(/h|m/);
  });

  it("marks down moves red (up=false)", () => {
    const st = computeMeasureStats({ time: 0, price: 50 }, { time: 60, price: 40 }, "1m");
    expect(st.up).toBe(false);
    expect(st.dPct).toBeCloseTo(-20, 5);
  });

  it("handles zero base price without NaN", () => {
    const st = computeMeasureStats({ time: 0, price: 0 }, { time: 60, price: 1 }, "1m");
    expect(Number.isFinite(st.dPct)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats seconds to human labels", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(90000)).toBe("1d 1h");
  });
});

describe("isMeaningfulMeasure", () => {
  it("rejects zero-length click", () => {
    const p = { time: 100, price: 1 };
    expect(isMeaningfulMeasure(p, p)).toBe(false);
  });
  it("accepts price or time delta", () => {
    expect(isMeaningfulMeasure({ time: 0, price: 1 }, { time: 10, price: 1 })).toBe(true);
    expect(isMeaningfulMeasure({ time: 0, price: 1 }, { time: 0, price: 1.01 })).toBe(true);
  });
});

describe("sanitizeDrawings", () => {
  it("drops invalid tools and bad points", () => {
    const out = sanitizeDrawings([
      { id: "1", tool: "cursor", pairId: "HMC_USDT", points: [], color: "#fff" },
      { id: "2", tool: "hline", pairId: "HMC_USDT", points: [{ time: 1, price: 2 }], color: "#00e5ff" },
      { id: "3", tool: "trend", pairId: "NOPE", points: [{ time: NaN, price: 1 }], color: "red" },
      {
        id: "4",
        tool: "text",
        pairId: "HMC_USDT",
        points: [{ time: 1, price: 2 }],
        text: `<img onerror=alert(1)>${"x".repeat(200)}`,
        color: "#ffd54f",
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].tool).toBe("hline");
    expect(out[1].text!.length).toBeLessThanOrEqual(120);
    expect(out[1].text).not.toMatch(/onerror/);
  });

  it("caps array size", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      tool: "hline",
      pairId: "HMC_USDT",
      points: [{ time: i, price: 1 }],
      color: "#00e5ff",
    }));
    expect(sanitizeDrawings(many, 50)).toHaveLength(50);
  });

  it("sanitizeDrawing rejects measure with one point", () => {
    expect(
      sanitizeDrawing({
        tool: "measure",
        pairId: "HMC_USDT",
        points: [{ time: 1, price: 1 }],
        color: "#ffb347",
      }),
    ).toBeNull();
  });
});

describe("stripPollutionKeys", () => {
  it("removes __proto__ and constructor", () => {
    const dirty = JSON.parse('{"wallet":{"usdt":1},"__proto__":{"polluted":true},"nested":{"constructor":{"x":1}}}');
    const clean = stripPollutionKeys(dirty) as Record<string, unknown>;
    expect(clean).not.toHaveProperty("__proto__");
    expect((clean.nested as object)).not.toHaveProperty("constructor");
    expect(clean.wallet).toEqual({ usdt: 1 });
  });
});

describe("escapeDrawingLabel", () => {
  it("escapes HTML for object tree", () => {
    expect(escapeDrawingLabel(`<script>alert(1)</script>`)).toContain("&lt;script&gt;");
  });
});

describe("drawing delete persistence model", () => {
  it("removeDrawingById drops the id permanently from the store set", () => {
    const store = [hline("a"), measure("b"), hline("c")];
    const after = removeDrawingById(store, "b");
    expect(after.map((d) => d.id)).toEqual(["a", "c"]);
    expect(store.map((d) => d.id)).toEqual(["a", "b", "c"]); // original untouched
  });

  it("scroll/zoom paint must prefer live set over stale backup (no resurrection)", () => {
    const live = [hline("keep")];
    const staleBackup = [hline("keep"), measure("deleted-ruler")];
    const paint = resolvePaintDrawings(live, staleBackup);
    expect(paint.map((d) => d.id)).toEqual(["keep"]);
    expect(paint.some((d) => d.id === "deleted-ruler")).toBe(false);
  });

  it("pair filter + delete matches object-tree clear path", () => {
    const all = [hline("1", "HMC_USDT"), hline("2", "SUP_USDT"), measure("3")];
    const pair = drawingsForPair(all, "HMC_USDT");
    expect(pair).toHaveLength(2);
    const cleared = all.filter((d) => d.pairId !== "HMC_USDT");
    expect(resolvePaintDrawings(cleared, pair).every((d) => d.pairId !== "HMC_USDT")).toBe(true);
  });
});
