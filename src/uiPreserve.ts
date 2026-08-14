/**
 * Preserve ephemeral DOM across full `innerHTML` remounts (live oracle / account sync).
 * Keeps <details> open, form fields, filter chips, scroll, and focus.
 */

export type UiFieldSnap = {
  kind: "value" | "checked";
  value?: string;
  checked?: boolean;
};

export type UiSnap = {
  details: Record<string, boolean>;
  fields: Record<string, UiFieldSnap>;
  /** groupKey → active filter value (e.g. data-ledger-filter) */
  chips: Record<string, string>;
  scrollY: number;
  scrollables: Record<string, number>;
  focus?: { id: string; start?: number; end?: number };
};

function detailsKey(el: HTMLDetailsElement, index: number): string {
  if (el.id) return `id:${el.id}`;
  const keep = el.getAttribute("data-ui");
  if (keep) return `ui:${keep}`;
  const sum = (el.querySelector("summary")?.textContent || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 64);
  return sum ? `sum:${sum}` : `idx:${index}`;
}

function chipGroupKey(el: Element): string {
  if (el.id) return el.id;
  const label = el.getAttribute("aria-label");
  if (label) return `aria:${label}`;
  return `chip:${el.className}`;
}

/** Capture interactive UI that `innerHTML = …` would otherwise wipe. */
export function captureEphemeralUi(root: ParentNode | null | undefined): UiSnap | null {
  if (!root || typeof document === "undefined") return null;
  const details: Record<string, boolean> = {};
  root.querySelectorAll("details").forEach((raw, i) => {
    const el = raw as HTMLDetailsElement;
    details[detailsKey(el, i)] = !!el.open;
  });

  const fields: Record<string, UiFieldSnap> = {};
  root.querySelectorAll("input[id], select[id], textarea[id]").forEach((raw) => {
    const el = raw as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const id = el.id;
    if (!id) return;
    if (el instanceof HTMLInputElement) {
      const t = (el.type || "text").toLowerCase();
      if (t === "button" || t === "submit" || t === "reset" || t === "file" || t === "image") return;
      if (t === "checkbox" || t === "radio") {
        fields[id] = { kind: "checked", checked: el.checked };
        return;
      }
    }
    fields[id] = { kind: "value", value: el.value };
  });

  const chips: Record<string, string> = {};
  root.querySelectorAll("[data-ledger-filter].active, [data-filter].active").forEach((btn) => {
    const group = btn.closest("[role='group'], .acct-ledger-filters, .filter-row") || btn.parentElement;
    if (!group) return;
    const v =
      (btn as HTMLElement).dataset.ledgerFilter ||
      (btn as HTMLElement).dataset.filter ||
      "";
    if (v) chips[chipGroupKey(group)] = v;
  });

  const scrollables: Record<string, number> = {};
  root.querySelectorAll<HTMLElement>("[id]").forEach((el) => {
    if (el.scrollTop > 0) scrollables[el.id] = el.scrollTop;
  });

  let focus: UiSnap["focus"];
  const ae = document.activeElement as HTMLElement | null;
  if (ae && ae.id && root.contains(ae)) {
    focus = { id: ae.id };
    if (
      (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) &&
      typeof ae.selectionStart === "number"
    ) {
      focus.start = ae.selectionStart ?? undefined;
      focus.end = ae.selectionEnd ?? undefined;
    }
  }

  return {
    details,
    fields,
    chips,
    scrollY: typeof window !== "undefined" ? window.scrollY || 0 : 0,
    scrollables,
    focus,
  };
}

/** Re-apply a snap after remount + event wiring. */
export function restoreEphemeralUi(root: ParentNode | null | undefined, snap: UiSnap | null | undefined): void {
  if (!root || !snap) return;

  root.querySelectorAll("details").forEach((raw, i) => {
    const el = raw as HTMLDetailsElement;
    const key = detailsKey(el, i);
    if (Object.prototype.hasOwnProperty.call(snap.details, key)) {
      el.open = snap.details[key]!;
    }
  });

  for (const [id, field] of Object.entries(snap.fields)) {
    const el = root.querySelector(`#${cssEscape(id)}`) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    if (!el) continue;
    if (field.kind === "checked" && el instanceof HTMLInputElement) {
      el.checked = !!field.checked;
    } else if (field.kind === "value" && field.value != null) {
      el.value = field.value;
    }
  }

  for (const [groupKey, active] of Object.entries(snap.chips)) {
    let group: Element | null = null;
    if (groupKey.startsWith("aria:")) {
      const label = groupKey.slice(5);
      group = root.querySelector(`[role='group'][aria-label="${cssAttr(label)}"]`);
    } else {
      group = root.querySelector(`#${cssEscape(groupKey)}`);
    }
    if (!group) continue;
    group.querySelectorAll("[data-ledger-filter], [data-filter]").forEach((btn) => {
      const v =
        (btn as HTMLElement).dataset.ledgerFilter ||
        (btn as HTMLElement).dataset.filter ||
        "";
      btn.classList.toggle("active", v === active);
    });
    const list = root.querySelector("#acct-ledger-list");
    if (list && group.id === "acct-ledger-filters") {
      list.querySelectorAll("li").forEach((li) => {
        const kind = (li as HTMLElement).dataset.ledgerKind || "other";
        (li as HTMLElement).hidden = !(active === "all" || kind === active);
      });
    }
  }

  for (const [id, top] of Object.entries(snap.scrollables)) {
    const el = root.querySelector(`#${cssEscape(id)}`) as HTMLElement | null;
    if (el) el.scrollTop = top;
  }

  if (typeof window !== "undefined" && snap.scrollY > 0) {
    window.scrollTo(0, snap.scrollY);
  }

  if (snap.focus?.id) {
    const el = root.querySelector(`#${cssEscape(snap.focus.id)}`) as HTMLElement | null;
    if (el && typeof el.focus === "function") {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      if (
        snap.focus.start != null &&
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      ) {
        try {
          el.setSelectionRange(snap.focus.start, snap.focus.end ?? snap.focus.start);
        } catch {
          /* type=number etc. */
        }
      }
    }
  }
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function cssAttr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
