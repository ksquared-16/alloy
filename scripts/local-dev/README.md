# Alloy local parallel-agent development toolkit (Phase 1)

Self-contained Bash toolkit for running up to six concurrent Cursor or Claude implementation agents in isolated Git worktrees, with deterministic ports and serialized heavyweight validation.

This is **developer experience tooling only**. It is not sprint orchestration, a workstation-management platform, or application feature work.

## 1. Target architecture

```text
~/Code/Alloy/                     Canonical repository (configurable)
~/Code/alloy-worktrees/
  wt1-<initiative>/
  wt2-<initiative>/
  ...
  wt6-<initiative>/

~/.config/alloy-dev/config
~/.local/state/alloy-dev/
  metadata/   pids/   logs/   locks/
~/bin/alloy-dev/                  installed command wrappers (symlinks)
```

Repository source of truth:

```text
scripts/local-dev/
```

## 2. Installation

From the Alloy repository (or a tooling worktree containing these scripts):

```bash
bash scripts/local-dev/install.sh
# or: npm run local-dev:install
```

Installer behavior:

- symlinks commands into `~/bin/alloy-dev/`
- creates runtime directories
- copies `alloy-config.example` to `~/.config/alloy-dev/config` **only if missing**
- never overwrites an existing config
- never uses `sudo`, never runs cleanup, never changes git state
- prints a proposed `PATH` line; does not edit shell rc files blindly

Edit the config and set `ALLOY_REPO` to your canonical checkout before creating worktrees.

## 3. Initial read-only audit

```bash
alloy-audit
alloy-health
alloy-clean report
```

## 4. Port map

| Role | Port |
|------|------|
| Canonical staging checkout | 3000 |
| Slot 1 | 3011 |
| Slot 2 | 3012 |
| Slot 3 | 3013 |
| Slot 4 | 3014 |
| Slot 5 | 3015 |
| Slot 6 | 3016 |

Rules: refuse invalid slots; refuse occupied ports; never silently choose another port.

## 5. Dependency strategy

- Package manager: **npm** (`package-lock.json` at repo root and `web/`).
- App scripts live under `web/`.
- Worktree creation does **not** auto-install dependencies.
- Do not symlink another worktree’s `node_modules`.
- Do not copy production secrets into agent worktrees.
- Per-worktree non-secret marker: `.env.local.agent` (ignored via existing `.env.*` gitignore rules).

Detected heavy commands (run from `web/`):

| Kind | Command |
|------|---------|
| typecheck | `node --max-old-space-size=4096 node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmit` |
| test | `npx vitest run --maxWorkers=2 --minWorkers=1` |
| build | `npm run build` |
| playwright | `npx playwright test --workers=1` |
| imports | `npm run verify:module-imports` |
| dev | `npm run dev` |

Toolkit default Node heap: **4096 MB** (not 8192).

## 6. Worktree creation

```bash
alloy-worktree-create 1 current-work-performance cursor
```

Creates:

- branch `agent/cursor/1-current-work-performance` from latest `origin/staging`
- path `~/Code/alloy-worktrees/wt1-current-work-performance`
- runtime metadata + `.env.local.agent`
- does **not** push; does **not** modify `staging`

## 7. Local implementation lifecycle

1. Create worktree and `npm install` inside that worktree’s `web/`.
2. Open **one** Cursor/Claude window on that worktree path only.
3. `alloy-dev-start <name>` when UI inspection is needed.
4. Implement and commit locally in coherent chunks.
5. Run focused checks directly; use `alloy-validate` for heavy checks.
6. Sync from staging with `alloy-worktree-sync` when clean.
7. Push/create PR only after explicit human approval.

## 8. Staging synchronization

```bash
alloy-worktree-sync wt1-current-work-performance
```

Before rebase:

- commit coherent work locally
- use a temporary local WIP commit when necessary
- never depend on agent-controlled automatic stash

During rebase:

- resolve conflicts
- `git add`
- `git rebase --continue`

To undo:

- `git rebase --abort`

`alloy-worktree-sync` refuses dirty trees and never stashes.

## 9. Focused checks

Outside the global lock (preferred for agent iteration):

```bash
cd web && npx vitest run tests/path/to/file.test.ts
cd web && npm run lint -- path/to/file.tsx
```

## 10. Heavy validation queue

Serialized across all Alloy worktrees via an atomic lock directory (no Linux `flock`):

```bash
alloy-validate <worktree-name> typecheck|test|build|playwright|imports
alloy-validate <worktree-name> command -- <cmd>
```

If the lock is held, the current owner is printed and the waiter polls. Ctrl-C exits safely without stealing the lock. Locks are cleaned on normal exit and common signals. Validation never backgrounds.

## 11. Local review

Use `alloy-dev-status`, the worktree URL, focused tests, then one heavy `alloy-validate` kind when ready. Keep inactive Cursor windows closed.

## 12. Explicit-approval push model

Agents must not push. Humans approve remote publication explicitly after local review.

## 13. End-of-sprint merge model

Land through normal PR review into `staging`. Do not treat worktree removal as a merge strategy. Unmerged branches refuse removal.

## 14. Safe worktree removal

```bash
alloy-worktree-remove wt1-current-work-performance
```

Refuses dirty trees, running owned servers, unmerged commits vs `origin/staging`, and metadata/git disagreements. Uses `git worktree remove` (never `--force`) and `git branch -d` (never `-D`) after confirmation.

## 15. Daily startup

```bash
alloy-health
alloy-dev-status
# start only the servers you need for inspection
alloy-dev-start <name>
```

## 16. Daily shutdown

```bash
alloy-dev-stop <name>   # for each running worktree
alloy-dev-status
alloy-clean report
```

Close inactive Cursor windows.

## 17. Runaway recovery

1. `alloy-health` / `alloy-audit` — identify tsc/vitest/next/playwright and foreign port owners.
2. `alloy-dev-status` — stop owned servers with `alloy-dev-stop`.
3. Do not `kill -9` unless ownership is verified; `alloy-dev-stop` never sends SIGKILL.
4. If a validation lock is stale (owner PID dead), the next `alloy-validate` removes it.
5. Prefer stopping duplicate watchers/windows over reducing agent count first.

## 18. Cleanup policy

```bash
alloy-clean report                 # default, read-only
alloy-clean artifacts              # generated only + confirmation
alloy-clean git-prune              # dry-run first + confirmation
alloy-clean package-cache-verify   # npm cache verify only
```

Never auto-delete: worktrees, branches, `node_modules`, Docker data, Cursor/Claude data, AI history.

## 19. Spotlight / iCloud guidance

Keep canonical repo and worktrees under `~/Code/...`, outside iCloud-backed Desktop/Documents.

Optional Spotlight exclusion (run manually after reviewing paths; Phase 1 never runs `sudo mdutil`):

```bash
sudo mdutil -i off "$HOME/Code/alloy-worktrees"
sudo mdutil -E "$HOME/Code/alloy-worktrees"
```

Reversal:

```bash
sudo mdutil -i on "$HOME/Code/alloy-worktrees"
sudo mdutil -E "$HOME/Code/alloy-worktrees"
```

Optional alternative: place `.metadata_never_index` in a directory (behavior may vary). Do not exclude the entire home directory.

## 20. Hardware realities

- Six agents may edit concurrently.
- Up to six Next dev servers are supported by the model.
- Full validation is serialized.
- When memory pressure rises, start only the servers needed for inspection.
- Do not reduce implementation-agent count as the primary control.
- Orchestration reduces duplicated builds, worker contention, runaway watchers, Spotlight churn, and oversized heaps.
- Orchestration cannot eliminate genuine RAM/CPU ceilings — use `alloy-audit` to evaluate them.
- Buying hardware is not the Phase 1 answer.

## Cursor workspace recommendations

Recommended snippet: `cursor-settings.recommended.json`.

This repository already has substantial `.vscode/settings.json` watcher/search excludes and `typescript.tsserver.maxTsServerMemory: 4096`. Do **not** overwrite that file wholesale. Merge missing keys carefully, or apply the recommended snippet manually. For many concurrent windows, consider lowering TS server memory toward 3072 after observing pressure.

Operating rules:

- one Cursor window per worktree
- never open the parent `alloy-worktrees` directory as one giant workspace
- do not attach six worktrees to one multi-root workspace
- close inactive windows
- avoid duplicate TypeScript extension hosts

## Commands

| Command | Purpose |
|---------|---------|
| `alloy-worktree-create` | create slotted worktree from `origin/staging` |
| `alloy-worktree-sync` | rebase onto `origin/staging` when clean |
| `alloy-worktree-remove` | confirmed safe removal |
| `alloy-dev-start` / `stop` / `status` | owned dev servers |
| `alloy-validate` | serialized heavy checks |
| `alloy-health` / `alloy-audit` | daily vs deep read-only reports |
| `alloy-clean` | report-first cleanup helpers |
