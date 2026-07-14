# Agent verification and security (Phase 3)

Operator guide for safe local UI verification across up to six managed agent slots.

## Auth model (discovered from Alloy)

Alloy admin portal auth today:

| Mechanism | Detail |
|-----------|--------|
| Login route | `/login` |
| Method | Supabase **email/password** (`signInWithPassword`) |
| Session | Supabase auth cookies (e.g. `sb-<project>-auth-token`) |
| Portal gate | Middleware requires session; RBAC resolves `admin`/`ops` via `user_roles` |
| Reference | `web/README_ADMIN_AUTH.md`, `web/app/login/page.tsx` |

The toolkit does **not** auto-provision users, store passwords, or mutate permissions.

## Six QA accounts (manual setup)

Create six dedicated **local/staging** portal users (one per slot). Suggested mapping:

| Slot | Role | Suggested least-privilege |
|------|------|---------------------------|
| 1 | Product implementation | `admin` or scoped ops for product areas |
| 2 | Architecture / doctrine | `admin` read-heavy / docs-only ops |
| 3 | Performance | `ops` + performance-related permissions |
| 4 | UI / UX | `ops` or `admin` for layout/settings under test |
| 5 | Refactor / infrastructure | `admin` for platform refactors |
| 6 | Experimental | `ops` sandbox |

Configure aliases in `~/.config/alloy-dev/config`:

```bash
ALLOY_SLOT_1_QA_IDENTITY="qa-slot1-product@your-staging.org"
# ... through slot 6
```

**Never** put passwords in config. Sign in manually during `alloy-agent-login`.

## Safe environment (`alloy-agent-prepare`)

- Source: `ALLOY_ENV_SOURCE` (default: canonical `web/.env.local`)
- Target: `<worktree>/web/.env.local.agent` (chmod 600, git-ignored)
- **Built-in allowlist:** `PORT`, `NODE_ENV`, `NEXT_PUBLIC_APP_URL`, `ALLOY_AGENT_ENV`
- **Configured additions:** `ALLOY_ENV_ALLOWLIST` (space-separated explicit names)
- **Public prefix:** `NEXT_PUBLIC_*` (only after denylist pass)
- **Denylist always wins** over allowlist, configured additions, and prefixes
- **Secret-like substrings (deny):** `SECRET`, `PASSWORD`, `TOKEN`, `PRIVATE`, `SERVICE_ROLE`, `DATABASE_URL`, `API_KEY`, `SIGNING`, `CREDENTIAL`
- **Unknown `ALLOY_*`:** ambiguous → fail closed at prepare (not implicitly allowed)
- **Ambiguous:** fail closed — add to `ALLOY_ENV_ALLOWLIST` explicitly if truly safe
- Values are **never printed**; only variable names in reports
- Existing file: requires `--force` after reviewing planned name list

Agents may inspect `.env.local.agent`. It must never contain privileged values.

## Trusted server environment (`alloy-dev-start`)

Alloy’s Next server still needs trusted local developer variables (proven: `SUPABASE_SERVICE_ROLE_KEY` for `createAdminClient`). Those are **not** agent-visible.

| Config | Purpose |
|--------|---------|
| `ALLOY_ENV_SOURCE` | Sanitized agent-visible preparation (`alloy-agent-prepare`) |
| `ALLOY_SERVER_ENV_SOURCE` | Trusted values injected **only** into the toolkit-owned Next process |

Defaults: both resolve to `$ALLOY_REPO/web/.env.local` when present. Keep them distinct in docs and when testing.

`alloy-dev-start` two-tier load:

1. Load sanitized `web/.env.local.agent` (public/safe)
2. Inject assignments from `ALLOY_SERVER_ENV_SOURCE` into the owned process only
3. Preflight: refuse to start if the trusted source or required names are missing
4. Never copy privileged values into the worktree, metadata, instructions, or context
5. Report names / aggregate counts only — never values

Built-in required server name (minimal): `SUPABASE_SERVICE_ROLE_KEY`. Extend with `ALLOY_SERVER_ENV_REQUIRED`.

**Do not** run `npm run dev` directly — that bypasses trusted injection and is prohibited.

## Dev server ownership

Verification (`alloy-agent-ready`, `alloy-agent-verify`) requires a **toolkit-owned** dev server on the assigned port:

- Start with `alloy-dev-start <worktree>` — records PID, loads agent-safe + trusted injection
- **Do not** run `npm run dev` directly — foreign listeners are refused
- `alloy-agent-ready` reports agent-safe vs trusted source readiness (names only) and `ownership: toolkit-owned`

## Dependency model (Playwright)

Every managed worktree must have its **own** `web/node_modules`:

```bash
cd /Users/Kelly/Code/alloy-worktrees/<wtN-initiative>/web
npm install
```

Phase 3 browser helpers (`alloy-agent-login`, auth check, `alloy-agent-verify`) load `@playwright/test` from that worktree’s `web` package context via `createRequire` anchored at `web/package.json`.

- Dependencies are **never** shared or silently borrowed from the canonical checkout, a sibling worktree, the toolkit `scripts/local-dev` tree, or a global install.
- Missing Playwright fails **before** opening a browser with remediation: `cd <worktree>/web && npm install`
- The toolkit does **not** auto-install dependencies.

## Forbidden secrets / data

Never copy, print, commit, or expose:

- `SUPABASE_SERVICE_ROLE_KEY`
- Database passwords / privileged `DATABASE_URL`
- Provider secrets (Stripe, Twilio, Resend, …)
- Production tokens, PATs, signing keys
- Cookie values, storage-state JSON contents, session tokens

## Browser ownership

| Path | Purpose |
|------|---------|
| `~/.local/state/alloy-dev/browser-profiles/slot<N>/` | Isolated Chromium user data |
| `~/.local/state/alloy-dev/browser-pids/slot<N>.pid` | Owned process |
| `~/.local/state/alloy-dev/auth/slot<N>/storage-state.json` | Playwright storage (chmod 600) |

Rules:

- One toolkit-owned interactive browser per slot maximum
- `alloy-agent-browser-stop <slot>` stops **only** that slot's owned PID
- No `pkill Chrome`, no global browser kills
- Stale PIDs reported in `alloy-ai-health` / `alloy-agent-status` — not auto-killed

## UI verification workflow

```bash
alloy-agent-prepare <slot>
alloy-dev-start <name>            # toolkit-owned; agent-safe + trusted server injection (not npm run dev)
alloy-agent-login <slot>          # manual sign-in; captures storage state
alloy-agent-ready <slot>          # READY / NOT READY + remediation (requires toolkit-owned server)
alloy-agent-verify <slot> route /workspace
alloy-agent-evidence <slot>
```

Real-Mac retry sequence (slot 1 / this worktree):

```bash
alloy-agent-prepare 1
alloy-dev-start wt1-parallel-agent-phase-2
alloy-agent-login 1
alloy-agent-ready 1
alloy-agent-verify 1 route /workspace
```

Agents must report for user-visible changes:

- route, QA identity alias, steps, expected vs observed
- console errors, failed network requests
- evidence paths
- manual vs automated
- unverified behavior

**Never** claim UI verification from code inspection alone.

## CPU / process model

| Mode | Concurrency |
|------|-------------|
| Interactive login browser | One per slot, headed, human-driven |
| Focused `alloy-agent-verify` | One worker, headless, screenshots on failure |
| Full Playwright suite | `alloy-validate <name> playwright` only — **global serialized lock** |

No video/trace by default. `alloy-ai-health` reports toolkit browser counts.

## Cursor and Claude

- **Cursor:** `cursor` or `code` CLI, else prints exact folder path
- **Claude:** `claude` CLI or Claude.app, else prints exact folder path
- Never open parent `alloy-worktrees` root
- Use `alloy-agent-context <slot> --copy` for concrete prompt

## Recovery

| Problem | Fix |
|---------|-----|
| Auth expired | `alloy-agent-login <slot>` |
| Browser stuck | `alloy-agent-browser-stop <slot>` |
| Server stuck | `alloy-dev-stop <name>` |
| Env drift | `alloy-agent-prepare <slot> --force` (review names first) |
| Evidence clutter | `alloy-clean report` (report-only; never auto-deletes) |

## Protected infrastructure

`alloy-ai-health` and `alloy-clean report` are read-only. They never delete Application Support, conversation DBs, auth state, or evidence automatically.

Future cleanup must classify safe caches/logs separately from history, workspace DBs, sessions, and project state — with explicit human confirmation.
