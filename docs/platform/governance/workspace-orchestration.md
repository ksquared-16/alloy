---
owner: platform
status: canonical
last_reviewed: 2026-07-16
supersedes: []
---

# Workspace orchestration

**Status:** Canonical development-machine doctrine (July 2026).

This document defines how Alloy **Cursor windows, git worktrees, agents, language servers, dev servers, and validation commands** should coexist on a developer machine. It is infrastructure only — no product runtime behavior.

Related: `docs/platform/governance/typescript-performance.md` (typecheck memory and scripts).  
**Managed sprint lifecycle (start/pause/resume/finish):** `docs/platform/governance/managed-sprint-operations.md` — that document owns slot/port/server bootstrap policy for implementation sprints.

---

## Problem statement

Alloy development commonly runs **many parallel git worktrees** and **many Cursor windows**. Each open window spawns:

- 1 extension host (~200 MB)
- 1 file watcher (~64 MB)
- 1 TypeScript language server when active (~500 MB–1.5 GB)

On a **24 GB** machine, **5+ active windows** plus a typecheck (~4 GB heap) pushes the system into **swap exhaustion**, causing:

- Progressive Cursor slowdown
- 16+ minute typechecks (thrashing, not compute-bound)
- Duplicate agent validation (multiple `tsc` / full-tree `rg`)

**Target operating state:** five or more concurrent agent sessions remain usable, predictable, and isolated.

---

## Audit findings (July 2026 baseline)

| Signal | Observed |
|--------|----------|
| Worktrees | 18 |
| Open Cursor extension hosts | 10 (~2.0 GB RSS) |
| File watchers | 10 (~640 MB RSS) |
| Swap used | ~89% (10.1 / 11.3 GB) |
| `node_modules` copies | ~14 × ~650 MB ≈ **9 GB disk** |
| Stale agent processes | Full-tree `rg` scans 25+ min in dormant worktrees |

**Concurrency cliff (24 GB RAM):**

| Active Cursor windows | Risk |
|----------------------|------|
| 1–3 | Low |
| 4–5 | Moderate — avoid concurrent typechecks |
| 6–7 | High — swap growth |
| 8+ | Critical — current failure mode |

---

## Canonical commands

Run from **repository root** or `web/` (aliases exist in both `package.json` files).

| Command | Purpose | Destructive? |
|---------|---------|--------------|
| `npm run workspace:status` | Machine + Cursor + worktree summary | No |
| `npm run workspace:doctor` | Health findings + recommendations | No |
| `npm run workspace:processes` | Dev/Cursor process inventory | No |
| `npm run workspace:ports` | Listening node/next ports | No |
| `npm run worktree:list` | Worktree inventory + classification | No |
| `npm run worktree:list -- --size` | Include `node_modules` disk sizes | No |
| `npm run worktree:prune-safe` | **Dry-run** merged+clean worktree removal | No (default) |
| `npm run workspace:cleanup` | **Dry-run** stale process + worktree suggestions | No (default) |

### Local parallel-agent toolkit (Phase 1 + Phase 2 + Managed Sprint Ops)

Installed via `npm run local-dev:install` (`scripts/local-dev/`). Operator-friction commands only — not a daemon or Company OS.

**Canonical sprint lifecycle:** [`managed-sprint-operations.md`](./managed-sprint-operations.md) (`alloy-sprint-start` / `alloy-worker-pause` / `resume` / `status` / `doctor` / `alloy-sprint-finish`).

| Command | Purpose |
|---------|---------|
| `alloy-sprint-start` | Preferred: allocate free slot + worktree + deps + open provider |
| `alloy-agent-create` | Auto slot/port + worktree + instructions |
| `alloy-agent-open` | Open Cursor/Claude; optional `--with-server` |
| `alloy-agent-status` | Managed agents, slots, ports, git, servers |
| `alloy-agent-close` | Stop server + git summary; never removes worktree |
| `alloy-agent-instructions` | Concrete prompt; `--copy` |
| `alloy-ai-health` | Read-only AI/memory/cache/CPU diagnostics |
| `alloy-worker-status` | Six-slot compact table (also Phase 4 initiative view) |
| `alloy-worker-pause` / `resume` | Overnight stop / morning restore of registry-owned processes |
| `alloy-worker-doctor` | Drift/stale PID diagnosis (`--recover` to fix safely) |
| `alloy-sprint-finish` | Free slot; preserve worktree; never push/merge/PR |

Permanent slots (1–6) keep stable roles (Product, Architecture, Performance, UI/UX, Refactor, Experimental) and ports **3011–3016**. Optional shell helpers: `source ~/bin/alloy-dev/shell-aliases.sh` → `awt <slot>`, `devup`. See `scripts/local-dev/README.md`.

**Destructive flags (manual review required):**

- `npm run worktree:prune-safe -- --apply` — print `git worktree remove` commands
- `npm run workspace:cleanup -- --apply` — print kill/remove commands
- Add `--execute` with `--apply` to run (not recommended without review)

---

## Vacilando resource model — durable work vs active computation

**Status:** Canonical (August 2026). Owner of the concurrency vocabulary the
Vacilando Gateway enforces in `scripts/local-dev/lib/vacilando/provider-capacity.mjs`
and `provider-suspension.mjs`.

Vacilando governs two different scarce things, and conflating them is what
refused new work while the machine was nearly idle: five worktrees claimed
slots, four were counted as active agents against a ceiling of three, and
exactly one of them had a process in it.

| Concept | What it is | Consumes provider capacity? | Governed by |
|---|---|---|---|
| **Durable lane** | Conversation, run history, status, provider preference, work identity | **No** — not by existing | Lane store; unbounded in practice |
| **Worktree** | Branch checkout and durable files | **No** — regardless of lifecycle metadata | Disk; reported separately |
| **Provider session** | A real Claude/Cursor agent **process** attached to a lane | **Yes, while it must think** | `ALLOY_MAX_ACTIVE_PROVIDERS` (default 3) |
| **Runtime/validation resource** | Ports, browsers, test workers, databases, exclusive leases | No — counted separately | `execution-resource.mjs` broker |
| **Slot** | A *placement* identifier for governed fixed ports (3011–3016) and legacy `alloy-sprint-*` commands | No | Compatibility only |

### The rules this implies

- **A worktree may exist without a running provider.** Retain as many lanes and
  worktrees as disk allows. Six slots never meant six workspaces; a lane or
  worktree with no slot is entirely normal.
- **Capacity is measured from live processes**, correlated to the owning lane
  and de-duplicated by PID. Never from lane count, worktree count, slot count,
  metadata lifecycle, shell existence, or a background `node` process.
- **Unknown is not active.** When live process inspection is unavailable the
  assessment is marked `degraded` and falls back conservatively.
- **Parked work does not hold a seat.** A lane in `NEEDS_INPUT` is durable work
  awaiting a person. After a warm grace period its provider is suspended: the
  process stops, the lane, run, exact question, conversation, worktree, branch
  and resumable session identity are all kept, and the seat is released. The
  lane reads `Needs input · provider suspended`.
- **`WAITING_RESOURCE` suspends only when nothing in memory must stay alive** —
  never while an exclusive lease is `EXCLUSIVE_ACTIVE`, a continuation is
  mid-delivery, or the run is resuming.
- **Durability precedes termination.** A provider is never stopped until the
  question has been written and read back. A suspension that loses the question
  is worse than a held seat.
- **Exactly once.** A queued instruction is delivered once after admission; a
  reply to a suspended lane is stored first, then delivered once by the ordinary
  `NEEDS_INPUT` continuation after the provider resumes.

### What the ceiling is for

`ALLOY_MAX_ACTIVE_PROVIDERS` caps concurrent agent **processes** — CPU, memory,
and model seats. It is not a limit on how much work the machine remembers.
Disk protection for durable work is a separate maintenance concern
(`alloy-sprint-finish`, disk hygiene), never a concurrency gate.

---

## Operating model

### Worktrees

| Rule | Guidance |
|------|----------|
| **Max active worktrees** | **≤5** with Cursor windows; **≤3** during heavy typecheck |
| **Active** | Cursor window open OR agent session in last 24h OR dev server running |
| **Parked** | Branch pushed, PR open, window closed — keep worktree, close Cursor window |
| **Merged** | `worktree:list` shows `merged-removable` + `pruneSafe=true` — candidate for removal |
| **`node_modules`** | Required per **active** worktree; remove from **merged/dormant** before prune |
| **Sharing** | Keep independent `node_modules` per active worktree (see Dependency sharing) |

**Classification labels** (`worktree:list`):

- `main-staging-checkout` — primary repo checkout
- `active-implementation` — feature branch ahead of staging
- `active-infra` — infrastructure branches
- `waiting-for-pr` — pushed branch, dirty or clean
- `merged-removable` — ancestor of staging, clean, safe to prune
- `merged-dirty-review` — merged but uncommitted changes — **manual review**
- `abandoned-stale` — 100+ commits behind staging
- `unknown-review` — requires human decision

### Cursor windows

| Rule | Guidance |
|------|----------|
| **Max open windows** | **5** (target **3** for typecheck-heavy days) |
| **One window per active agent** | Yes — do not share a window across unrelated features |
| **Dormant windows** | Close when worktree is merged or agent session ended |
| **tsserver** | Expect one per actively editing window; close window to release |

Repository-local exclusions: `.vscode/settings.json` excludes `node_modules`, `.next`, `tmp`, `*.tsbuildinfo`, test artifacts from watchers/search.

### Dev servers

| Rule | Guidance |
|------|----------|
| **Max concurrent (managed slots)** | Prefer toolkit defaults (`ALLOY_MAX_RUNNING_SERVERS`, typically 3) — see `managed-sprint-operations.md` |
| **Port convention** | Canonical checkout: `3000`. Managed agent slots: **3011–3016** only |
| **Ownership** | Start with `alloy-dev-start` / `alloy-sprint-start --with-server`; never invent ports |
| **Shutdown** | `alloy-dev-stop` or `alloy-worker-pause`; confirm with `alloy-worker-status` / `workspace:ports` |
| **Stale detection** | `alloy-worker-doctor` + `workspace:ports`; never kill unregistered processes |

Do **not** start ad-hoc Next servers on invented ports for managed agents — that bypasses two-tier env and permanent slot ports (3011–3016). Use `alloy-dev-start` / `alloy-sprint-start --with-server` only.
### Validation concurrency

| Command | Concurrent? | Notes |
|---------|-------------|-------|
| `npm run typecheck` | **No — serialize machine-wide** | ~4 GB heap |
| `npm run typecheck:tests` | **No — serialize** | ~4.5 GB heap |
| `npm run dev` | ≤2 | Port + memory |
| `npm install` | **No — serialize** | Disk + CPU spike |
| Focused Vitest | ≤2 cautiously | Lower than tsc |
| Full `npm run test` | **1** | Competes with tsserver |
| Playwright | **1** | Browser-heavy |
| Full-tree `rg` / `find` on `web/` | **Avoid** | Use path-scoped search |

**Agent rule:** Run `npm run workspace:doctor` before starting heavy validation. Heavy checks are **host-brokered** — `npm run typecheck|typecheck:tests|build|test` and `vac run <kind>` acquire a single machine-wide validation lease (see `scripts/local-dev/alloy-validate`). Do not run raw `tsc` / `next build` / full `vitest run`.

**Expensive validation doctrine:**

> One intentional heavy validation at a time (typecheck, build, or full test suite), enforced by the host lease. Focused Vitest files may run concurrently. Full graph only when needed.

### Process cleanup

| Category | Safe to terminate (after confirmation) | Requires explicit approval |
|----------|----------------------------------------|------------------------------|
| Stale `rg`/`find` agent scans (5+ min) | Yes | — |
| Orphaned `cursorsandbox` proxies (30+ min) | Usually | Confirm no active terminal |
| Completed `tsc` zombies | Yes | — |
| Active `next dev` | **No** | Owner must stop |
| Active tsserver / extension host | **No** | Close Cursor window instead |

Use `npm run workspace:cleanup` (dry-run) — never blind `killall node`.

---

## Dependency sharing recommendation

| Strategy | Disk savings | Risk | Verdict |
|----------|-------------|------|---------|
| Independent `node_modules` per active worktree | — | Lowest | **Keep** |
| Symlink to main checkout | ~8 GB | Wrong-branch deps, breaks isolation | **Do not** |
| npm cache (implicit) | Install time | Low | Already in use |
| pnpm shared store | ~60–70% | Migration + lockfile + native modules | **Defer** |

**Action:** Prune `web/node_modules` from merged/dormant worktrees before `worktree remove`. Do not migrate package managers in this sprint.

---

## Cursor configuration (repository-local)

`.vscode/settings.json` sets:

- `files.watcherExclude` — `node_modules`, `.next`, `.git`, `tmp`, artifacts
- `search.exclude` — same heavy directories
- `typescript.tsserver.maxTsServerMemory` — 4096 MB
- `typescript.tsdk` — `web/node_modules/typescript/lib`
- `git.autofetch` — false (reduce background git load)

Tasks (`.vscode/tasks.json`): read-only status/doctor/processes/worktree list.

**Does not** change user-global Cursor settings.

---

## Agent guardrails summary

1. Confirm worktree path and branch before editing (`worktree:list`).
2. Run `workspace:doctor` before expensive validation.
3. Serialize `npm run typecheck` — never launch if another `tsc` is running (`workspace:processes --kind=tsc`).
4. Prefer focused Vitest over full suites during iteration.
5. Do not run full-tree `rg`/`find` across `web/` without path scope.
6. Stop `next dev` when session ends unless user parks it.
7. Do not modify files outside the agent's assigned worktree.

---

## Implementation plan (ranked)

| # | Change | Impact | Safety | Effort | Reversibility |
|---|--------|--------|--------|--------|---------------|
| 1 | Diagnostic scripts (this sprint) | High | High | Done | N/A |
| 2 | `.vscode` exclusions | High | High | Done | Full |
| 3 | Agent guardrails update | High | High | Low | Full |
| 4 | Close dormant Cursor windows (manual) | Very high | High | 5 min | Reopen |
| 5 | Prune merged worktrees (`prune-safe`) | High | Medium | 30 min | Git recoverable |
| 6 | Rebase onto PR #142 when merged | Medium | High | 5 min | Full |
| 7 | Port registry file (optional) | Medium | High | Low | Full |
| 8 | pnpm migration | Medium | Low | High | **Defer** |

---

## Validation protocol

**Before changes (baseline captured July 2026):**

- 10 extension hosts, 89% swap, 18 worktrees

**After tooling (measure when machine hygiene applied):**

1. `npm run workspace:status`
2. `npm run workspace:doctor`
3. Close 5–7 merged-worktree Cursor windows (manual)
4. Re-run status — expect swap drop, extension hosts ≤5
5. Optional: 3-agent read-only smoke, then 5-agent if swap <50%

---

## Risks

| Risk | Mitigation |
|------|------------|
| Accidental worktree removal | `prune-safe` requires merged+clean; dry-run default |
| Killing active dev server | Cleanup never auto-kills `next-dev` |
| Wrong-worktree edits | Agent checks `pwd` + `worktree:list` |
| Over-excluding from TS index | Only exclude generated/deps — not `app/`, `lib/`, `tests/` source |
| PR #142 not merged | Rebase `infra/workspace-orchestration` when #142 lands |

---

## Files

| Path | Role |
|------|------|
| `scripts/workspace/*.mjs` | Diagnostic tooling |
| `.vscode/settings.json` | Watcher/search/tsserver |
| `.vscode/tasks.json` | Read-only tasks |
| `package.json` | Root script aliases |
| `web/package.json` | Convenience aliases from `web/` |
