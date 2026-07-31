---
owner: platform
status: canonical
last_reviewed: 2026-07-31
---

# Engineering Health

**Purpose:** Make it practically impossible for Alloy engineers to be surprised by a full disk, broken Docker environment, exhausted caches, or an unhealthy local workstation.

**Toolkit command:** `alloy-engineering-doctor`

**Runtime:** `scripts/local-dev/lib/engineering-health/`

## Operating model

Every engineering incident should leave the toolkit smarter.

```
Observe → Evaluate → Explain → Recommend → Execute (only with explicit --yes)
```

- Never silently delete anything.
- Never require manual archaeology to learn *why* the machine is unhealthy.
- Every unhealthy finding carries severity, reason, recommendation, estimated reclaim, and risk.

## Architecture

| Layer | Role |
|-------|------|
| Collectors | Disk, Docker, Node caches, IDE caches, git/worktrees, large files, processes, services |
| Evaluators | Severity + why (70/80/90/95% disk escalations, orphan backups, reclaimable Docker, …) |
| Recommendations | Maps findings → safe actions with impact estimates |
| Executors | Confirmed actions only (`--yes`) |
| Presentation | Human doctor report + `--json` API |
| Cache | TTL cache under `~/.local/state/alloy-dev/engineering-health/` so doctor stays fast |

## Incident-driven checks (2026-07-31)

The first regression suite encodes the disk-full incident:

1. Disk at ~100% / few GB free → **critical**
2. `~/CursorBackupLocal/state.vscdb` orphan (~13 GB) → **critical** + safe remove action
3. Worktree `node_modules` aggregate pressure → warning/critical + `worktree_gc`
4. Docker reclaimable images → recommendation `docker_prune`
5. npm cache weight → `npm_cache_clean`

If that class of failure returns, `alloy-engineering-doctor` must surface it before ENOSPC.

## Commands

```bash
alloy-engineering-doctor                 # human report
alloy-engineering-doctor --json          # machine report
alloy-engineering-doctor --refresh       # bypass collector cache
alloy-engineering-doctor --quick         # skip expensive scans
alloy-engineering-doctor --list-actions
alloy-engineering-doctor --fix worktree_gc --yes
alloy-engineering-doctor --fix remove_cursor_backup_local --yes
alloy-engineering-doctor --fix docker_prune --yes
alloy-engineering-doctor --fix npm_cache_clean --yes
alloy-engineering-doctor --fix cursor_cached_data_clean --yes
```

Related (narrower) tools remain available: `alloy-health`, `alloy-clean`, `alloy-docker-doctor`, `alloy-worktree-gc`, `alloy-ai-health`.

## Extending

1. Add `collectors/<name>.mjs` exporting `collectX()`.
2. Wire it in `index.mjs` with a TTL.
3. Add evaluation rules in `evaluators.mjs`.
4. Add recommendation + optional executor.
5. Add a fixture assertion in `tests/engineering-health.test.mjs` for the incident class you just learned.

## Safety

Executors may only touch regenerable or confirmed-orphan paths:

- `alloy-worktree-gc --force` (merged/clean regenerable artifacts)
- Docker prune without volumes
- npm / pnpm caches
- Cursor `CachedData`
- `~/CursorBackupLocal` (never `~/Library/Application Support/Cursor/.../state.vscdb`)
