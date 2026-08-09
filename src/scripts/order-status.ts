// Shared client helpers for the cafe order pages (/order and /orders). Kitchen open/closed status is
// public (no auth), so both pages fetch it the same way and both poll on the same visibility-aware
// cadence — factored here so the endpoint and the poll lifecycle live in one place.

// Fetch whether the kitchen is open. Returns null if unreachable, so callers can leave the UI as-is
// for that tick rather than flipping state on a transient network blip.
export async function fetchKitchenOpen(apiBase: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${apiBase}/status`, { headers: { Accept: 'application/json' } });
    if (res.ok) return (await res.json()).open;
  } catch {
    /* unreachable — caller decides how to degrade */
  }
  return null;
}

// Run `fn` now and every `ms`, but only while the tab is visible: pause on hide, and refetch + resume
// on re-show so switching back to the page updates it immediately without hammering the Pi in the
// background.
export function pollWhileVisible(fn: () => void, ms: number): void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    stop();
    timer = setInterval(fn, ms);
  };
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else {
      fn();
      start();
    }
  });
  fn();
  start();
}
