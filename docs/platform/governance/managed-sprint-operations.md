---
owner: platform
status: canonical
last_reviewed: 2026-07-16
supersedes: []
---

# Managed Sprint Operations

**Status:** Canonical (July 2026). Default operating model for Alloy implementation sprints on Cursor and Claude.

**Purpose:** Make the installed six-slot Alloy local-dev toolkit the normal way every new sprint starts, pauses overnight, resumes, and finishes — without Director/Company OS machinery.

**Toolkit source:** `scripts/local-dev/` (install: `npm run local-dev:install` or `bash scripts/local-dev/install.sh`)

**Related:** `workspace-orchestration.md` (machine concurrency), `agent-repo-boundaries.md` (repo ownership), `deployment-and-environments.md` (staging/production). Operator detail: `scripts/local-dev/README.md`, `scripts/local-dev/CHEAT-SHEET.md`.

---

## 1. Non-negotiable rules

1. **Every new sprint starts through the installed Alloy toolkit** — not by hand-creating branches in the canonical checkout.
2. The worker **selects only an available managed slot** (1–6). Fail closed if occupied, conflicting, or unhealthy.
3. **Permanent ports remain 3011–3016** (slot N → `3010 + N`). Never invent another port.
4. **Work occurs only in the assigned worktree** under `~/Code/alloy-worktrees/wtN-<name>/`.
5. **Server starts only when required** (`--with-server` or explicit `alloy-dev-start`). Six worktrees ≠ six servers.
6. **Worktree-local dependencies only** — `npm install` inside that worktree’s `web/`. No `node_modules` symlinks between worktrees.
7. Respect resource limits: active providers, running servers, concurrent installs, concurrent heavy jobs (see config defaults in `scripts/local-dev/alloy-config.example`).
8. Use **pause / resume / status / doctor / finish** for overnight and closeout — do not kill unrelated processes.
9. **Preserve continuation state** (`.alloy-continuation.md` + pause-state registry) across pause, provider exit, and finish.
10. **Create coherent local commits throughout the sprint.** Multiple local commits are expected and preferred.
11. **Never push, merge, rebase, create/update a PR, trigger Vercel, or modify `staging`** until Kelly explicitly authorizes promotion.
12. **“Commit” never implies “push.”** Local commit ≠ remote publication.
13. **Do not modify sibling worktrees or the canonical checkout** during implementation.
14. Final sprint output must report: **commits, tests, localhost URL (or “server not required”), git state, and processes left running.**

---

## 2. Bootstrap

```bash
alloy-sprint-start <name> --provider <cursor|claude> [--slot auto|N] [--with-server|--without-server]
```

This fetches `origin/staging`, creates the managed branch/worktree, installs worktree-local deps, prepares env, generates instructions, and opens the provider on the **exact** worktree. Prefer `--without-server` unless UI inspection is required immediately.

Lower-level primitives (`alloy-agent-create`, `alloy-worktree-create`, `alloy-dev-start`) remain available; prefer `alloy-sprint-start` for new sprints.

---

## 3. Operator controls

| Command | When |
|---------|------|
| `alloy-worker-status` | Compact table for all six slots |
| `alloy-worker-pause <slot\|--all>` | Overnight / stop owned provider+server+browser |
| `alloy-worker-resume <slot\|--all>` | Morning — restore only resources that were active |
| `alloy-worker-doctor <slot\|--all> [--recover]` | Diagnose drift; mutate only with `--recover` |
| `alloy-sprint-finish <slot>` | Free the slot; preserve worktree; never delete/push/merge/PR |

Continuation brief: `<worktree>/.alloy-continuation.md`  
Pause state: `~/.local/state/alloy-dev/pause-state/`  
Finished archive: `~/.local/state/alloy-dev/finished/`

---

## 4. First-response contract (every managed sprint)

The worker’s **first reply to Kelly** must be compact and include only:

| Field | Example |
|-------|---------|
| Sprint name | `locations-settings-t005` |
| Slot | `3` |
| Provider | `cursor` |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt3-…` |
| Branch | `agent/cursor/3-…` |
| Port | `3013` |
| Localhost | `http://localhost:3013` **or** `server not required` |
| Auth readiness | `present` / `missing` / `n/a` |
| Server status | `running` / `stopped` |
| Operator commands | Exact lines below |

```text
alloy-worker-status
alloy-worker-pause <slot>
alloy-worker-resume <slot>
alloy-worker-doctor <slot>
alloy-sprint-finish <slot>
```

Do **not** dump implementation theory in this first response. Then proceed with the sprint objective.

---

## 5. Short reusable sprint invocation

Copy as-is (no placeholders to delete):

```text
Use the Alloy managed sprint workflow defined in the repository. Bootstrap and execute this sprint: [objective]. On your first response, give me the assigned slot, worktree, localhost URL, and operator commands.
```

Replace only `[objective]` with the sprint goal. Do not paste operational novels.

---

## 6. Git and promotion policy

**During the sprint**

- Local commits only, in coherent chunks.
- Multiple commits are expected.
- Do not push, merge, rebase, open/update a PR, or touch `staging` / Vercel.

**When Kelly authorizes promotion** (human-operated; worker may prepare but not execute until told):

```bash
# From the assigned worktree
pwd   # must be the managed worktree path
git fetch origin
git status --short
# Sync only when clean and Kelly asked for it:
#   alloy-worktree-sync <worktree-name>   # rebases onto origin/staging when clean
# Or, if Kelly prefers merge instead of rebase, follow her explicit instruction.

# Validate (respect heavy-job limits; serialize typecheck)
cd web && npm run typecheck   # when web/ TS changed
# focused tests as appropriate

# Push the feature branch once (avoid duplicate pushes)
git push -u origin HEAD

# Open PR into staging (once)
gh pr create --base staging --title "…" --body "…"

# After review + merge to staging: do not re-push the same commits;
# let the PR merge be the single staging update. Do not trigger
# redundant Vercel redeploys by force-pushing or double-merging.
```

Staging remains shared truth. Promotion is explicit, reviewed, and singular — not part of ordinary sprint execution.

---

## 7. Cursor and Claude wiring

| Surface | Path |
|---------|------|
| Canonical doctrine (this file) | `docs/platform/governance/managed-sprint-operations.md` |
| Cursor rule | `.cursor/rules/managed-sprint-operations.mdc` |
| Claude Code entry | `CLAUDE.md` (repo root) |
| Generated per-slot prompts | `scripts/local-dev/AGENT-INSTRUCTIONS.md` + `.alloy-agent-instructions.md` |

Both providers must read **this** document before beginning an Alloy sprint and follow the same first-response contract.

---

## 8. What this is not

- Not Director / Company OS / mission orchestration
- Not a replacement for `workspace-orchestration.md` machine limits
- Not permission to edit `/Users/Kelly/Alloy-Claude` from the Cursor workspace (see `agent-repo-boundaries.md`)
