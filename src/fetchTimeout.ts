/** fetch with hard timeout — prevents infinite boot when pool API is slow/unreachable. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = globalThis.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
