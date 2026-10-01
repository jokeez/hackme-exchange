const MAX_TOASTS = 3;

/** Cap stacked toasts; each toast is a polite status (root also has aria-live). */
export function toast(msg: string, kind: "info" | "ok" | "warn" = "info"): void {
  const root = document.getElementById("toast-root");
  if (!root) return;
  while (root.childElementCount >= MAX_TOASTS) {
    root.firstElementChild?.remove();
  }
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", kind === "warn" ? "assertive" : "polite");

  const text = document.createElement("span");
  text.className = "toast-msg";
  text.textContent = msg;
  el.appendChild(text);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "toast-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 280);
  });
  el.appendChild(dismiss);

  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    if (!el.isConnected) return;
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}
