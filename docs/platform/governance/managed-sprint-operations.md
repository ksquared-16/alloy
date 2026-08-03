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

**Canonical sprint completion lifecycle**

1. Local implementation commits (coherent chunks; multiple expected)
2. Product review (human)
3. Explicit promotion approval from Kelly
4. Push / PR / merge into `staging` (once; no duplicate pushes)
5. Reinstall toolkit from the canonical checkout on staging:  
   `bash /Users/Kelly/Alloy/scripts/local-dev/install.sh`
6. `alloy-sprint-finish <slot>` — free the slot after the branch is on staging
7. `alloy-agent-close <slot>` — optional; only after the branch is safely accounted for (merged or explicitly retained)

**`alloy-sprint-finish` guarantees**

- Stops registry-owned provider, server, and browser processes only
- Releases the slot (archives metadata under `~/.local/state/alloy-dev/finished/`)
- Preserves worktree, branch, commits, continuation record, auth, and logs
- Never deletes the worktree or branch
- Never pushes, merges, rebases, or creates a PR
- Never kills unrelated processes
- Blocks on dirty trees unless `--acknowledge-uncommitted`

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

## Day boundaries — END OF DAY and START OF DAY

A day's work is finished when it can survive the machine, not when the editor closes. On 2026-08-03 an
audit found **880 commits across 79 branches existing only on one laptop**, five of six active slots
never pushed, and slots sitting 230–265 commits behind. Both failures are day-boundary failures: work
that was never made durable, and bases that were never refreshed.

**This is not a one-commit-per-day rule.** Meaningful checkpoint commits and pushes throughout the day
are preferred — the gates below only assert that a day does not *end* with work stranded, and does not
*start* on a stale base.

### END OF DAY — `alloy-day-end [slot]`

Fail-closed. Every item must hold:

| Check | Why |
|---|---|
| Coherent work committed | a dirty tree is work only this machine knows about |
| All commits pushed | `DURABILITY_UNPUSHED_COMMITS=0` |
| Remote SHA equals local | the remote has *this* commit, not merely *a* commit |
| Handoff updated | tomorrow starts from whatever the handoff says |
| Clean tree | no stray artifacts left to be discovered later |
| No owned processes or leases | no dev server, no Docker stack lease held overnight |

`--no-handoff-check` is available for a slot with no handoff surface. There is no override for the
durability checks: **a branch that exists only on this machine is not a finished day.**

### START OF DAY — `alloy-day-start [slot]`

1. **fetch origin**
2. **report ahead/behind** against `origin/staging`
3. **rebase onto current `origin/staging`** — *before* any new implementation, not after
4. **run configured smoke tests** (`ALLOY_SMOKE_CMD`)
5. **push the rebased branch with `--force-with-lease`**
6. **then resume work**

The integration-debt gate still applies: ≥50 behind warns, ≥100 blocks until a reconciliation decision
is recorded. A dirty tree stops the sequence rather than being rebased over — that is what yesterday's
`alloy-day-end` exists to prevent. A conflicted rebase aborts rather than leaving a half-rebased tree.

`--force-with-lease`, never `--force`: if the remote moved under you, the push is refused so you look
before overwriting.

### Why rebase daily rather than at promotion time

Slot 4 reached 265 behind and needed **six controlled promotions**, a decomposition report, two
corrected slice boundaries and two rounds of type repair. Slot 6 reached 230 behind and needed a full
reconstruction with commits dropped as superseded. Neither was caused by bad work — both were caused by
integrating late. A daily rebase converts that into a few minutes each morning.
