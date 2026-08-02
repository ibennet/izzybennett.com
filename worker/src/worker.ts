/**
 * Recipe API — Cloudflare Worker that turns the pasted-PAT flow on /upload into a proper
 * "Sign in with GitHub" OAuth flow, WITHOUT ever handing a GitHub token to the browser.
 *
 * Flow:
 *   GET  /login        → 302 to GitHub's OAuth consent screen (state stored in a cookie)
 *   GET  /callback     → exchange code→token (uses the client secret), verify the user is
 *                        ALLOWED_LOGIN, mint an opaque session id, stash {token,login} in KV,
 *                        then 302 back to the site with the session id in the URL fragment.
 *   POST   /api/recipe → create/update a recipe file (auth: `Authorization: Bearer <session>`)
 *   DELETE /api/recipe → delete a recipe file
 *   POST   /logout     → destroy the session
 *
 * The browser only ever holds the opaque session id. The GitHub token lives in KV and is
 * injected server-side here, and every proxied call is hard-restricted to RECIPE_DIR/<slug>.md
 * on OWNER/REPO@BRANCH — so a leaked session can only ever touch recipe files.
 */

export interface Env {
  SESSIONS: KVNamespace;
  // Secret (wrangler secret put):
  GITHUB_CLIENT_SECRET: string;
  // Vars (wrangler.toml [vars]):
  GITHUB_CLIENT_ID: string;
  ALLOWED_LOGIN: string;
  OWNER: string;
  REPO: string;
  BRANCH: string;
  RECIPE_DIR: string;
  SITE_ORIGIN: string;
  SESSION_TTL: string;
}

interface Session {
  token: string;
}

const GH_API = 'https://api.github.com';
const GH_OAUTH = 'https://github.com/login/oauth';
const UA = 'izzy-recipe-worker';
const SLUG_RE = /^[a-z0-9-]+$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for the browser-facing API endpoints.
    if (request.method === 'OPTIONS') return preflight(env);

    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /login':
          return handleLogin(url, env);
        case 'GET /callback':
          return handleCallback(request, url, env);
        case 'POST /api/recipe':
          return withSession(request, env, (_id, s) => putRecipe(request, env, s));
        case 'DELETE /api/recipe':
          return withSession(request, env, (_id, s) => deleteRecipe(request, env, s));
        case 'POST /logout':
          return withSession(request, env, (id) => logout(env, id));
        case 'GET /':
          return json(env, 200, { ok: true, service: 'izzy-recipe-api' });
        default:
          return json(env, 404, { error: 'Not found' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      return json(env, 500, { error: message });
    }
  },
};

// ---- OAuth: login ---------------------------------------------------------

function handleLogin(url: URL, env: Env): Response {
  const state = crypto.randomUUID();
  const authorize = new URL(`${GH_OAUTH}/authorize`);
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authorize.searchParams.set('scope', 'public_repo'); // least privilege that allows Contents writes
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('allow_signup', 'false');

  // Stash the state in a short-lived, first-party (worker-origin) cookie to check on callback.
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
}

// ---- OAuth: callback ------------------------------------------------------

async function handleCallback(request: Request, url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(request, 'oauth_state');

  if (!code || !state || !cookieState || state !== cookieState) {
    return htmlError('Sign-in failed: invalid or expired state. Please try again.');
  }

  // Exchange the code for a token — the only place the client secret is used.
  const tokenRes = await fetch(`${GH_OAUTH}/access_token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  const token = tokenData.access_token;
  if (!token) {
    return htmlError(`Sign-in failed: ${tokenData.error ?? 'no token returned'}.`);
  }

  // Identify the user and gate on the allowlist — the OAuth App is public, so anyone could
  // authorize it; only ALLOWED_LOGIN may ever get a session that can write to the repo.
  const userRes = await fetch(`${GH_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA },
  });
  const user = (await userRes.json()) as { login?: string };
  if (!user.login || user.login.toLowerCase() !== env.ALLOWED_LOGIN.toLowerCase()) {
    return htmlError(`Sorry, @${user.login ?? 'unknown'} is not allowed to edit recipes.`);
  }

  // Mint an opaque session id; the GitHub token stays server-side in KV.
  const sessionId = crypto.randomUUID();
  const ttl = Number(env.SESSION_TTL) || 28800;
  const session: Session = { token };
  await env.SESSIONS.put(sessionId, JSON.stringify(session), { expirationTtl: ttl });

  // Hand the session id back via the URL fragment — fragments aren't sent to servers or logged.
  // Also clear the state cookie.
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.SITE_ORIGIN}/upload#session=${sessionId}`,
      'Set-Cookie': 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    },
  });
}

// ---- Session auth wrapper -------------------------------------------------

async function withSession(
  request: Request,
  env: Env,
  handler: (sessionId: string, session: Session) => Promise<Response>
): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const sessionId = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!sessionId) return json(env, 401, { error: 'Not signed in.' });

  const raw = await env.SESSIONS.get(sessionId);
  if (!raw) return json(env, 401, { error: 'Session expired. Please sign in again.' });

  return handler(sessionId, JSON.parse(raw) as Session);
}

async function logout(env: Env, sessionId: string): Promise<Response> {
  await env.SESSIONS.delete(sessionId);
  return json(env, 200, { ok: true });
}

// ---- Recipe proxy (create / update / delete) ------------------------------

// Resolve + validate the target path for a slug. Rejects anything that isn't a plain recipe
// slug, so a crafted request can never reach a file outside RECIPE_DIR.
function recipePath(env: Env, slug: unknown): string | null {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  return `${env.RECIPE_DIR}/${slug}.md`;
}

function contentsUrl(env: Env, path: string): string {
  return `${GH_API}/repos/${env.OWNER}/${env.REPO}/contents/${path}`;
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
  };
}

async function getSha(env: Env, token: string, path: string): Promise<string | null> {
  const res = await fetch(`${contentsUrl(env, path)}?ref=${env.BRANCH}`, { headers: ghHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub error ${res.status} while reading existing file.`);
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

// Send a create/update/delete to the GitHub Contents API. Returns null on success, or a ready-to-
// send 502 Response if GitHub rejected it — both mutation routes share this uniform translation.
async function commit(
  env: Env,
  token: string,
  method: 'PUT' | 'DELETE',
  path: string,
  payload: Record<string, unknown>,
  action: string
): Promise<Response | null> {
  const res = await fetch(contentsUrl(env, path), {
    method,
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    return json(env, 502, { error: `GitHub rejected the ${action} (${res.status}).`, detail });
  }
  return null;
}

// UTF-8 safe base64 for the file content GitHub's Contents API expects.
function b64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

async function putRecipe(request: Request, env: Env, session: Session): Promise<Response> {
  const body = (await request.json()) as {
    slug?: string;
    markdown?: string;
    message?: string;
    overwrite?: boolean;
  };
  const path = recipePath(env, body.slug);
  if (!path) return json(env, 400, { error: 'Invalid recipe slug.' });
  if (typeof body.markdown !== 'string' || !body.markdown) {
    return json(env, 400, { error: 'Missing recipe content.' });
  }

  const sha = await getSha(env, session.token, path);
  // Guard against silently clobbering an existing recipe in add mode; edit mode passes overwrite.
  if (sha && !body.overwrite) {
    return json(env, 409, { error: 'A recipe already exists at that slug.', exists: true });
  }

  const payload: Record<string, unknown> = {
    message: body.message || `${sha ? 'Update' : 'Add'} recipe: ${body.slug}`,
    content: b64(body.markdown),
    branch: env.BRANCH,
  };
  if (sha) payload.sha = sha;

  const err = await commit(env, session.token, 'PUT', path, payload, 'commit');
  if (err) return err;
  return json(env, 200, { ok: true, created: !sha });
}

async function deleteRecipe(request: Request, env: Env, session: Session): Promise<Response> {
  const body = (await request.json()) as { slug?: string; message?: string };
  const path = recipePath(env, body.slug);
  if (!path) return json(env, 400, { error: 'Invalid recipe slug.' });

  const sha = await getSha(env, session.token, path);
  if (!sha) return json(env, 404, { error: 'That recipe no longer exists.' });

  const err = await commit(env, session.token, 'DELETE', path, {
    message: body.message || `Delete recipe: ${body.slug}`,
    sha,
    branch: env.BRANCH,
  }, 'delete');
  if (err) return err;
  return json(env, 200, { ok: true });
}

// ---- Small helpers --------------------------------------------------------

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function preflight(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function json(env: Env, status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

// Minimal HTML page for OAuth redirect errors (the browser lands here directly, not via fetch).
function htmlError(message: string): Response {
  const safe = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Sign-in error</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
      `<h1>Sign-in error</h1><p>${safe}</p><p><a href="/login">Try again</a></p></body>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
