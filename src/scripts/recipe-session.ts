// Shared client-side recipe auth/session helpers, used by any page that surfaces sign-in or gates
// editing affordances (the recipes index and each recipe detail page). The browser only ever holds
// the opaque session id under SESSION_KEY — never a GitHub token.
//
// Gating is CSS-driven: `applyAuthState()` reflects signed-in state onto <html data-auth>, and
// global.css reveals `.auth-only` (signed in) / `.auth-when-out` (signed out) from that one flag.
// (Note: /upload keeps its own inline copy — its `define:vars` script can't import a module.)
export const SESSION_KEY = 'izzy-recipe-session';

export const currentSession = (): string | null => localStorage.getItem(SESSION_KEY);
export const clearSession = (): void => localStorage.removeItem(SESSION_KEY);

// Reflect signed-in state onto the document root so the CSS gating rules take over — no per-element
// class toggling, so it can't clash with an element's own `display` utility.
export function applyAuthState(): void {
  document.documentElement.dataset.auth = currentSession() ? 'in' : 'out';
}

// On return from OAuth the Worker redirects to <page>#session=<id>. Pull it out of the fragment
// (fragments never hit a server or log), stash it, then scrub the URL.
export function ingestSessionFromHash(): void {
  const prefix = '#session=';
  if (location.hash.startsWith(prefix)) {
    const id = location.hash.slice(prefix.length);
    if (id) localStorage.setItem(SESSION_KEY, id);
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// Best-effort server-side revoke; the local session is cleared and the UI re-gated regardless.
export async function signOut(apiBase: string): Promise<void> {
  const session = currentSession();
  if (session) {
    try {
      await fetch(`${apiBase}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${session}` } });
    } catch {
      /* offline is fine — we still drop the local id */
    }
  }
  clearSession();
  applyAuthState();
}
