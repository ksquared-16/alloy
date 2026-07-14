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

- Source: canonical `web/.env.local` (override: `ALLOY_ENV_SOURCE`)
- Target: `<worktree>/web/.env.local.agent` (chmod 600, git-ignored)
- **Allowlist:** `NEXT_PUBLIC_*`, `PORT`, `NODE_ENV`, `ALLOY_*`, names in `ALLOY_ENV_ALLOWLIST`
- **Denylist:** service-role keys, secrets, passwords, Stripe/Twilio/Resend, `DATABASE_URL`, tokens
- **Ambiguous:** fail closed — add to allowlist explicitly if truly safe
- Values are **never printed**; only variable names in reports
- Existing file: requires `--force` after reviewing planned name list

`alloy-dev-start` loads allowed vars from `web/.env.local.agent` without overwriting developer `web/.env.local`.

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
alloy-dev-start <name>
alloy-agent-login <slot>          # manual sign-in; captures storage state
alloy-agent-ready <slot>          # READY / NOT READY + remediation
alloy-agent-verify <slot> route /workspace
alloy-agent-evidence <slot>
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
