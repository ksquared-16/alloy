# Provider Runtime V1 — QA

Verified against the live app at `http://127.0.0.1:3020` (loopback). Screenshots
captured by driving the live app (`scripts/local-dev/apps/vacilando/capture-qa-provider-runtime.mjs`).

## Root cause (Phase 0) — the exact cause, not a guess

Claude OAuth is stored in the **per-user macOS login Keychain** item
`Claude Code-credentials` — a **single shared credential**. It is **not**
per-HOME, per-worktree, or per-worker (all ruled out: no HOME override in the
toolkit, `HOME=/Users/Kelly` is consistent, and Vacilando's `spawn` passes no
custom env). So authentication is already global at the storage layer — there is
nothing per-worker to "log into".

The credential is currently **blanked**: `accessToken` and `refreshToken` are
empty strings and `expiresAt=0`, while the metadata is intact (`subscriptionType:
max`, scopes, `refreshTokenExpiresAt` in Aug 2026). With no access token *and* no
refresh token, every `claude -p` returns *"OAuth session expired and could not be
refreshed."* Re-login repopulates the tokens, but they get blanked again because
**Vacilando fired `claude -p` per worker with no shared auth owner and no
pre-check** — so the raw CLI auth error surfaced as if each worker needed its own
login, and concurrent headless invocations race on the one shared credential.
(Additional load-bearing fact: this server runs *inside a Claude Code host
session* — `CLAUDECODE=1`, host-managed OAuth refresh — so nested `claude -p`
here is entangled with the host session.)

**Fix:** a first-class Provider Runtime that owns authentication as
infrastructure. One owner, one status, one reconnect that fixes every worker.

## Phases verified

| Phase | Check | Result |
|---|---|---|
| 1 | Provider Runtime owns auth/status/capabilities/health/usage/version | ✅ `lib/vacilando/provider-runtime.mjs` |
| 2 | One Provider Manager surface (Settings → Providers) | ✅ 01-provider-manager |
| 3 | Single shared credential; workers never authenticate; expiry → Authentication Required | ✅ Claude shows **4 workers, one credential** |
| 4 | Health with exact reason (OAuth blanked / not configured / binary missing) | ✅ dashboard + manager |
| 5 | Adapters declare capabilities (start/resume/ask/stream/cost/usage/auth) | ✅ capability chips per card |
| 6 | Multiple worker requests reuse the shared auth, no re-login | ✅ cursor round-trip `PONG`; auth unchanged between requests |
| 7 | Dashboard "Providers" block (auth/health/workers/requests/cost/last error) | ✅ 04-dashboard-providers |
| 8 | Failure → clean "Authentication required" + Reconnect; worker intact, no crash, no raw CLI | ✅ `director.ask` claude → `auth_required`, slot 6 still running |
| 9 | Auth persists across server restart (keychain-backed, not Vacilando-owned) | ✅ same states after restart |

## Architecture

`Operator → Director → Worker Runtime → Provider Runtime → Provider adapter
(Claude / Cursor / OpenAI)`. The Worker Runtime calls
`sendViaProvider(...)`, which does the **single shared auth pre-check** and only
then dispatches through the transport (prompt on stdin, fixed argv, `shell:false`).
An unauthenticated provider yields a clean *"<provider> needs to reconnect"* with
the reconnect command — never raw CLI output, never a per-worker prompt.

## Screenshots

- `01-provider-manager.png` — Settings → Providers: Claude/Cursor/OpenAI cards
  (version, authentication, expiry, last request, capabilities, executable, auth
  location) + Verify / Reconnect / Diagnostics / Disconnect; runtime facts line.
- `02-diagnostics-claude.png` — full diagnostics, no secrets/tokens.
- `03-reconnect-claude.png` — "Run this once in a terminal; the whole Provider
  Runtime — and every worker — then uses it."
- `04-dashboard-providers.png` — dashboard Providers block.
- `05-worker-provider-metadata.png` — a worker's Director surface reads the shared
  provider status (Authentication required), provider stays metadata.

## Safety

No secrets read into any response (presence, expiry, identity email only — never
tokens). Loopback only. Vacilando never performs interactive OAuth and never runs
logout; reconnect/disconnect surface the exact operator command. Nothing pushed,
merged, promoted, deleted, or exposed beyond localhost.

## Remaining gaps → V1.1

- Claude reconnect is an **operator terminal action** (interactive OAuth can't be
  done from a governed headless command). Vacilando surfaces it; it cannot click it.
- OpenAI adapter is **declared, not wired** for round-trips (configured when
  `OPENAI_API_KEY` is set).
- The underlying keychain-blanking trigger is a Claude CLI/host concern; Provider
  Runtime makes it a single, visible reconnect rather than a per-worker surprise.
- Streaming is declared by adapters but not yet wired into the loopback UI.
