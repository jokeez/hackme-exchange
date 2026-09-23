/** fetch with hard timeout — prevents infinite boot when pool API is slow/unreachable.
 * Promise.race fences hung fetches even when the runtime ignores AbortSignal (e.g. stuck CORS).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fetchP = fetch(url, { ...init, signal: ctrl.signal });
    const timeoutP = new Promise<never>((_, reject) => {
      timer = globalThis.setTimeout(() => {
        ctrl.abort();
        reject(new Error(`timeout after ${timeoutMs}ms: ${url}`));
      }, timeoutMs);
    });
    return await Promise.race([fetchP, timeoutP]);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}
