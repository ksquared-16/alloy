---
owner: platform
status: canonical
last_reviewed: 2026-07-16
supersedes: []
---

# Agent repo boundaries

**Status:** Canonical governance (June 2026; managed-sprint cross-link July 2026). Permanent repo/workspace separation for AI development agents.

**Purpose:** Prevent Cursor, Claude/Cowork, and shared staging from interfering with each other. Every agent session must respect assigned repo ownership and merge flow.

**Cursor rule:** `.cursor/rules/repo-boundry.mdc` (enforced in this workspace)

**Managed sprints:** `docs/platform/governance/managed-sprint-operations.md` — default bootstrap via `alloy-sprint-start`. Claude Code entry: `CLAUDE.md`.

---

## 1. Canonical repo ownership

| Path | Role |
|------|------|
| **`/Users/Kelly/Alloy`** | **Cursor / main staging workspace** — platform, runtime, settings, workspace, lifecycle, scheduling, billing, attendance, general staging docs |
| **`/Users/Kelly/Alloy-Claude`** | **Claude / Cowork specialist workspace** — POS, documents/forms, communications, sprint packages, design reviews, architecture reviews |
| **`/Users/Kelly/Claude/Projects/Alloy`** | **Deprecated** planning-doc folder — not a code repo; do not treat as source of truth |

**Rule:** One agent, one repo per session. Never mix paths.

---

## 2. Agent responsibilities

### Cursor (`/Users/Kelly/Alloy`)

- Platform architecture and canonical docs (`docs/platform/`, `docs/schema/`)
- Runtime: AdminV2, workspace, drawers, queues, reveal/performance
- Settings / configuration control plane
- Lifecycle / business process builder integration
- Scheduling, billing, attendance (platform layers)
- General staging documentation, tooling, approved hotfixes on `staging`

### Claude / Cowork (`/Users/Kelly/Alloy-Claude`)

- POS
- Documents and forms (deep implementation)
- Communications (implementation and sprint packages)
- Sprint packages and handoff bundles
- Design reviews and architecture reviews in specialist lanes

**Overlap resolution:** Shared truth lives on **`origin/staging`** after reviewed merge. Do not duplicate canonical platform doctrine in the specialist repo without syncing back.

---

## 3. Required preflight (every session)

Run before any read, edit, commit, or push:

```bash
pwd
git branch --show-current
git status --short
git remote -v
```

**Confirm:**

- `pwd` matches the assigned repo for this agent
- Branch matches the agent's allowed workflow (see §4)
- Working tree is understood (no surprise cross-repo files)
- `origin` points at `github.com:ksquared-16/alloy.git` (or expected remote for that clone)

---

## 4. Branching rules

| Rule | Detail |
|------|--------|
| **`staging` is shared truth** | Both workspaces pull latest `origin/staging` before starting |
| **Cursor on `staging`** | Allowed only for **approved** docs, tooling, and hotfixes — not open-ended runtime refactors without review |
| **Claude branches** | Must use **`claude/*`** branches — e.g. `claude/pos-comms-clean-20260612` |
| **Claude → staging** | **No direct push to `staging`** unless explicitly approved for that task |
| **Larger Cursor runtime work** | Use feature branches; merge via review like Claude |

---

## 5. Merge flow

```
agent branch → push to origin → review → merge to staging → both workspaces git pull origin staging
```

1. Agent completes work on assigned branch in assigned repo
2. Push branch to `origin`
3. Review (human or explicit approval gate)
4. Merge to **`staging`**
5. **Both** `/Users/Kelly/Alloy` and `/Users/Kelly/Alloy-Claude` pull latest **`staging`** before next session

Do not merge specialist work into staging without confirming no conflict with platform docs or runtime gates in the main workspace.

---

## 6. Safety rules

- **Never operate outside the assigned repo** for the current session
- **Never mix** `/Users/Kelly/Alloy` and `/Users/Kelly/Alloy-Claude` in one agent action (read, diff, commit, push, or doc reference that implies cross-repo edits)
- **Preserve safety branches** — do not delete or force-push without explicit approval
- **Do not commit local artifacts:** `.DS_Store`, `tsconfig.tsbuildinfo`, `test-results/`, `.env.local`, credentials
- **Do not force-push `staging` or `main`**
- **Service role / secrets** — never commit; server-only per platform doctrine

---

## 7. Current known branches (June 2026)

| Branch | Purpose |
|--------|---------|
| **`origin/staging`** | Shared integration branch — canonical for both workspaces after pull |
| **`origin/claude/pos-comms-clean-20260612`** | Claude specialist lane (POS/comms) |
| **`origin/safety/alloy-claude-full-wip-20260612`** | Safety snapshot — preserve; do not overwrite |

Update this table when new long-lived agent or safety branches are created.

---

## Related

- `docs/README.md` — documentation navigation
- `docs/platform/governance/documentation-governance.md` — doc system rules
- `docs/platform/governance/design-and-operational-doctrine.md`
- `.cursor/rules/alloy-project-context.mdc` — agent load order — operational doctrine
- `.cursor/rules/alloy-project-context.mdc` — Cursor load order and platform context

---

## When this doc must be updated

New repo clone path, agent ownership split change, branching policy change, or new long-lived safety/integration branches.
