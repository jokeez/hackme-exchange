/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  LAYOUT_DEFAULTS,
  LAYOUT_MAX_W,
  LAYOUT_MIN_W,
  LAYOUT_STORAGE_KEY,
  loadLayoutPrefs,
  sanitizeLayoutPrefs,
  saveLayoutPrefs,
  setPanelWidth,
  setBottomHeight,
  terminalGridColumns,
  terminalGridColumnsForView,
  toggleBottomCollapsed,
  togglePanelCollapsed,
} from "./layoutPrefs";

describe("layoutPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sanitizes and clamps widths", () => {
    expect(sanitizeLayoutPrefs(null)).toEqual(LAYOUT_DEFAULTS);
    expect(sanitizeLayoutPrefs({ bookWidth: 50, rightWidth: 9999, bookCollapsed: 1 }).bookWidth).toBe(
      LAYOUT_MIN_W,
    );
    expect(sanitizeLayoutPrefs({ bookWidth: 50, rightWidth: 9999 }).rightWidth).toBe(LAYOUT_MAX_W);
    expect(sanitizeLayoutPrefs({ bookCollapsed: true }).bookCollapsed).toBe(true);
  });

  it("persists collapse + width in localStorage", () => {
    const next = setPanelWidth(
      togglePanelCollapsed({ ...LAYOUT_DEFAULTS }, "book"),
      "right",
      320,
    );
    saveLayoutPrefs(next);
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const loaded = loadLayoutPrefs();
    expect(loaded.bookCollapsed).toBe(true);
    expect(loaded.rightWidth).toBe(320);
    expect(loaded.rightCollapsed).toBe(false);
  });

  it("builds grid columns without 0px ghost tracks", () => {
    expect(terminalGridColumns(LAYOUT_DEFAULTS)).toBe("248px minmax(0, 1fr) 300px");
    expect(
      terminalGridColumns({ ...LAYOUT_DEFAULTS, bookCollapsed: true }),
    ).toBe("minmax(0, 1fr) 300px");
    expect(
      terminalGridColumns({ ...LAYOUT_DEFAULTS, rightCollapsed: true }),
    ).toBe("248px minmax(0, 1fr)");
    expect(
      terminalGridColumns({ ...LAYOUT_DEFAULTS, bookCollapsed: true, rightCollapsed: true }),
    ).toBe("minmax(0, 1fr)");
  });

  it("fullscreen grid is a single flexible track", () => {
    expect(terminalGridColumnsForView(LAYOUT_DEFAULTS, true)).toBe("minmax(0, 1fr)");
    expect(terminalGridColumnsForView(LAYOUT_DEFAULTS, false)).toBe(terminalGridColumns(LAYOUT_DEFAULTS));
  });

  it("toggles tools panel collapse", () => {
    const toggled = togglePanelCollapsed(LAYOUT_DEFAULTS, "tools");
    expect(toggled.toolsCollapsed).toBe(true);
    expect(togglePanelCollapsed(toggled, "tools").toolsCollapsed).toBe(false);
  });

  it("keeps legacy bottom prefs sanitized without affecting grid", () => {
    const tall = setBottomHeight(LAYOUT_DEFAULTS, 900);
    expect(tall.bottomHeight).toBe(360);
    expect(tall.bottomCollapsed).toBe(false);
    const collapsed = toggleBottomCollapsed(tall);
    expect(collapsed.bottomCollapsed).toBe(true);
    expect(terminalGridColumns(collapsed)).toBe(terminalGridColumns(LAYOUT_DEFAULTS));
  });

  it("setPanelWidth uncollapses that side", () => {
    const collapsed = { ...LAYOUT_DEFAULTS, bookCollapsed: true };
    const opened = setPanelWidth(collapsed, "book", 200);
    expect(opened.bookCollapsed).toBe(false);
    expect(opened.bookWidth).toBe(200);
  });
});
