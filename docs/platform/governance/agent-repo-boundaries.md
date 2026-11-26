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

**One canonical engineering root: `/Users/Kelly/Alloy`.** Every agent, both providers.

| Path | Role |
|------|------|
| **`/Users/Kelly/Alloy`** | **The canonical repository.** The only sanctioned engineering root, for Cursor and Claude alike. All sprints start here via `alloy-sprint-start`; all work happens in the managed worktree it returns. |
| **`/Users/Kelly/Code/alloy-worktrees/wt<N>-<name>`** | **Managed worktrees** — where implementation actually happens. Created from latest `origin/staging` by the toolkit. Never hand-created. |
| **`/Users/Kelly/Alloy-Claude`** | **RETIRED as an engineering root (July 2026).** No longer sanctioned for any repository work — no code, no docs, no sprint packages, no design or architecture reviews. Preserved read-only for its unmerged history. Do not start new work here. |
| **`/Users/Kelly/Claude/Projects/Alloy`** | **Deprecated** planning-doc folder — not a code repo; do not treat as source of truth |

**Rule:** One canonical root. Work only in the worktree the toolkit returns.

### Why the specialist workspace was retired

This table previously assigned `/Users/Kelly/Alloy-Claude` to Claude as a specialist
workspace for *"sprint packages, design reviews, architecture reviews."* That split
produced the failure it was meant to prevent:

- **It sanctioned the wrong root.** An agent doing exactly what this table told it to
  do — a design review, in Alloy-Claude — was working on a clone **1481 commits behind
  `origin/staging` that did not contain `scripts/local-dev` at all.** It was obeying
  doctrine, not violating it. The Toolkit Phase 2 design and realization plan were both
  written that way before being carried here.
- **It contradicted the Cursor rule.** `.cursor/rules/repo-boundry.mdc` says never touch
  Alloy-Claude. Both statements were canonical, and they were opposites.
- **A second clone cannot stay current.** Ownership by *topic* has no mechanism to keep a
  clone rebased. The specialist repo drifts, and drift is invisible until something is
  built on it.

The concern the split addressed — two agents colliding — is already solved, and solved
better, by **managed worktrees**: one canonical repo, N isolated worktrees, each cut from
fresh `origin/staging`, each with its own slot and port, allocated fail-closed. That is
isolation without divergence.

### Supporting existing Alloy-Claude work

Retirement is forward-looking. Work already in that clone is not abandoned:

- The clone stays on disk. Nothing is deleted, force-pushed, or rewritten.
- Unmerged commits reach `staging` the normal way: push the branch, open a PR, review, merge.
- Content that belongs in the canonical repo is carried over by copying the files into a
  managed worktree and committing them there — as `toolkit-phase-2.md` and
  `toolkit-phase-2-realization-plan.md` were.
- **New** work begins only from `/Users/Kelly/Alloy` via `alloy-sprint-start`.

---

## 2. Agent responsibilities

**Both providers work from the same canonical root, in separate managed worktrees.**
Neither provider owns a repository. Agents are separated by **slot**, not by clone, and
never by topic.

| Provider | Root | Isolation |
|----------|------|-----------|
| Cursor | `/Users/Kelly/Alloy` | its own managed worktree + slot + port |
| Claude / Cowork | `/Users/Kelly/Alloy` | its own managed worktree + slot + port |

There is no topic-based ownership split. Platform, runtime, POS, documents/forms,
communications, tooling, and reviews are all done from the canonical root — the work
decides the *lane*, never the *clone*.

**Overlap resolution:** shared truth lives on **`origin/staging`** after reviewed merge.
Because every worktree is cut from `origin/staging` and rebased with
`alloy-worktree-sync`, there is no second clone to drift out of sync and nothing to
"sync back."

---

## 3. Required preflight (every session)

Run before any read, edit, commit, or push:

```bash
alloy-root
```

`alloy-root` answers the question this section used to ask by hand: **is the directory I
am standing in a sanctioned root, and is it current?** It reports the canonical repo, the
managed worktree (if any), the sprint root, the base ref and its staleness, and it
**refuses with `--strict` when `$PWD` is not sanctioned** — naming the retired clone by
name when that is where you are.

Manual equivalent, if the toolkit is not installed:

```bash
pwd
git branch --show-current
git status --short
git remote -v
git rev-list --count HEAD..origin/staging   # how far behind you actually are
```

**Confirm:**

- `pwd` is the canonical repo or a managed worktree under `ALLOY_WORKTREE_ROOT` —
  **never `/Users/Kelly/Alloy-Claude`** (retired, §1)
- Branch matches the agent's allowed workflow (see §4)
- Working tree is understood (no surprise cross-repo files)
- `origin` points at `github.com:ksquared-16/alloy.git`
- **You are not on a stale base.** A clone can be current with `origin` and still sit on a
  branch a thousand commits behind it. The behind-count is the check that catches it.

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
