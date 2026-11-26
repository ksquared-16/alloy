# Alloy local parallel-agent development toolkit (Phase 1 + Phase 2 + Phase 3 + Phase 4)

Self-contained Bash toolkit for running up to six concurrent Cursor or Claude implementation agents in isolated Git worktrees, with deterministic ports and serialized heavyweight validation.

**Phase 1** = worktrees, ports, owned dev servers, validation lock, health/audit/clean.  
**Phase 2** = managed agent lifecycle on top of Phase 1 (create/open/status/close/instructions + AI health). No dashboards, daemons, or sprint automation.  
**Phase 3** = per-slot auth, browser verification, evidence, two-tier env.  
**Phase 4** = local Engineering Runtime (initiative intake, audit, plan, worker packages, reports, review/remediation, merge-readiness packages). No auto-push/merge.  
**Product Runtime V1** = local Product Contract workflow (brief → audit → contract → approval → handoff). See `PRODUCT-RUNTIME.md`.

This is **developer experience tooling only**. It is not sprint orchestration, a workstation-management platform, or application feature work.

## 1. Target architecture

```text
/Users/Kelly/Alloy/                Canonical repository (configurable)
/Users/Kelly/Code/alloy-worktrees/
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

- installs **one directory symlink**: `~/bin/alloy-dev` → `<checkout>/scripts/local-dev`
  (so `lib/`, `alloy-config.example`, and commands resolve together)
- creates runtime directories
- copies `alloy-config.example` to `~/.config/alloy-dev/config` **only if missing**
- never overwrites an existing config
- never uses `sudo`, never changes git state, never mutates PATH automatically
- may replace only `~/bin/alloy-dev` when it is a symlink or a prior Alloy toolkit install directory
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
| test | built per worktree from `vitest run --help` (worker flags added only if supported) |
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
- path `/Users/Kelly/Code/alloy-worktrees/wt1-current-work-performance`
- runtime metadata + `.env.local.agent`
- does **not** push; does **not** modify `staging`

## 7. Local implementation lifecycle

1. Create worktree and `npm install` inside that worktree’s `web/` (required — browser tooling uses that worktree-local Playwright only; never share `node_modules`).
2. Open **one** Cursor/Claude window on that worktree path only.
3. `alloy-dev-start <name>` when UI inspection is needed (**required** — two-tier env: agent-safe `.env.local.agent` + trusted server injection from `ALLOY_SERVER_ENV_SOURCE`; do not run `npm run dev`).
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

Keep canonical repo at `/Users/Kelly/Alloy` and worktrees under `/Users/Kelly/Code/alloy-worktrees/`, outside iCloud-backed Desktop/Documents.

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

### Phase 1

| Command | Purpose |
|---------|---------|
| `alloy-worktree-create` | create slotted worktree from `origin/staging` |
| `alloy-worktree-sync` | rebase onto `origin/staging` when clean |
| `alloy-worktree-remove` | confirmed safe removal |
| `alloy-dev-start` / `stop` / `status` | owned dev servers |
| `alloy-validate` | serialized heavy checks |
| `alloy-health` / `alloy-audit` | daily vs deep read-only reports |
| `alloy-clean` | report-first cleanup helpers |

### Autonomous Inspection Surface (`alloy-ro`)

A single, genuinely read-only entrypoint for autonomous agents, safe to grant via
`Bash(alloy-ro *)` without authorizing mutation. It does **not** wrap the existing
inspection commands — it re-implements the reads against a non-executing config
parser and a read-only subprocess allowlist, creates no directories, and fails
closed on unknown verbs and mutation flags. Verbs: `root`, `runtime-paths`,
`worker-status`, `agent-status`, `dev-status`, `agent-evidence`, `capabilities`
(each with `--json`). See [`AUTONOMOUS-INSPECTION-SURFACE.md`](AUTONOMOUS-INSPECTION-SURFACE.md)
and the machine-readable declaration in `lib/ro-capabilities.json`.

### Phase 2 — managed agents

| Command | Purpose |
|---------|---------|
| `alloy-agent-create` | first free slot + port; calls `alloy-worktree-create`; agent metadata + instructions |
| `alloy-agent-open` | open Cursor/Claude; optional `--with-server`; never duplicates servers |
| `alloy-agent-status` | managed agents, slots, ports, git state, server state |
| `alloy-agent-close` | stop server + git summary; **never** removes worktree |
| `alloy-agent-instructions` | concrete Cursor/Claude prompt; `--copy` via pbcopy |
| `alloy-ai-health` | read-only ChatGPT/Cursor/Claude/memory/swap/cache/CPU diagnostics |

Phase 2 does **not** duplicate worktree, port, or validation logic — it calls Phase 1 commands.

### Managed Sprint Operations V1

**Canonical doctrine:** [`docs/platform/governance/managed-sprint-operations.md`](../../docs/platform/governance/managed-sprint-operations.md)

Normal daily lifecycle for the six permanent slots (extends Phase 1–3 registries; not Director/Company OS):

| Command | Purpose |
|---------|---------|
| `alloy-sprint-start <name> --provider cursor\|claude [--slot auto\|N] [--with-server]` | allocate free slot, create worktree, install deps, prepare env, open provider |
| `alloy-worker-pause <slot\|--all>` | stop registry-owned provider/server/browser; preserve work + pause state |
| `alloy-worker-resume <slot\|--all>` | restore prior resources only; resume session or continuation brief |
| `alloy-worker-status` | compact six-slot table (initiative args keep Phase 4 behavior) |
| `alloy-worker-doctor <slot\|--all> [--recover]` | diagnose drift/stale PIDs; mutate only with `--recover` |
| `alloy-sprint-finish <slot>` | stop processes, archive metadata, free slot; never delete/push/merge/PR |

Resource defaults (override in `~/.config/alloy-dev/config`): `ALLOY_MAX_ACTIVE_PROVIDERS=3`, `ALLOY_MAX_RUNNING_SERVERS=3`, `ALLOY_MAX_CONCURRENT_INSTALLS=1`, `ALLOY_MAX_CONCURRENT_HEAVY_JOBS=1`. High macOS memory pressure refuses/defer heavy work without killing healthy workers.

**Short Kelly prompt:** see §5 of the canonical doctrine (bootstrap + first-response card only).

### Local parallelism & performance contract

Six permanent slots are supported. **Coding is parallel by default.** Orchestration must not multiply expensive work across N slots.

| Class | Examples | Rule |
|-------|----------|------|
| **A — cheap / parallel-safe** | file/code inspection, git, targeted unit tests, static checks, lightweight Node, Vacilando Director status | Free to run in every slot |
| **B — moderate** | Next dev server, targeted compile, larger test suites | Slot-owned; capacity-guarded (`ALLOY_MAX_RUNNING_SERVERS`, validate broker) |
| **C — expensive / machine-bounded** | Playwright / Chromium browser certification, video/trace E2E, full-graph typecheck | **Capacity 1** via `alloy-compute` (`browser-certification`, `full-typecheck`). Second caller waits or sees the owner. Override is explicit and loud. |

**Vacilando status** uses one Node workspace snapshot with singleflight + TTL. It must never rediscover every worktree through parallel `alloy-ro` shell fan-out. Recursive worktree-size (`du -sk`) never runs on `/api/state`, `/api/resources`, SSE, or client polls — only the slow ≥15-minute disk path (or explicit `/api/resources/worktree-disk`).

**Dev servers** are slot-owned (`metadata` → `pids/<worktree>.pid` → port). `alloy-dev-start` refuses duplicates; `alloy-dev-stop` / sprint finish stop only the owned PID/tree — never `pkill node` / `pkill next`.

**Entry points for class C:** `alloy-validate … playwright` (and `command -- … playwright …`) acquire `browser-certification` before launch. Capture scripts should use `lib/browser-cert-lease.mjs` (`withBrowserCertLease`). Override: `ALLOY_BROWSER_CERT_OVERRIDE=i-accept-parallel-browser-certification`.

New local-dev tooling must be evaluated for **multiplicative cost across N slots** before it ships on the hot path.

### Interpreting `alloy-ai-health` (read-only)

`alloy-ai-health` reports sizes and process counts for orientation. It does **not** claim causation and does **not** delete anything.

Smoke-test observations (Phase 2 Mac):

| Location | Approx. size |
|----------|----------------|
| Cursor Application Support | ~18 GB |
| Claude Application Support | ~7.7 GB |
| ChatGPT Application Support | ~4.4 MB |

Notes:

- Large Cursor/Claude support stores and many app helper processes may contribute to local pressure.
- Long ChatGPT conversations can still lag independently of ChatGPT cache/support size.
- Do **not** delete Application Support directories or conversation databases automatically.
- Future cleanup must first classify safe caches/logs separately from history, workspace databases, sessions, and project state — then require explicit human confirmation.

Playwright process counts use the same argument-aware runner classification as Phase 1 validators (`playwright test` / runner executable with `test` args). Hostnames, sandbox policy JSON, browser helpers, and inspection tools are excluded.

### Permanent slot identities

Slots are stable roles, not one-off sprint numbers:

| Slot | Role | Default AI | Port |
|------|------|------------|------|
| 1 | Product implementation | Cursor | 3011 |
| 2 | Architecture / doctrine | Claude | 3012 |
| 3 | Performance | Cursor | 3013 |
| 4 | UI / UX | Cursor | 3014 |
| 5 | Refactor / infrastructure | Claude | 3015 |
| 6 | Experimental | Cursor | 3016 |

Override labels/defaults in `~/.config/alloy-dev/config` (`ALLOY_SLOT_N_ROLE`, `ALLOY_SLOT_N_DEFAULT_AGENT`).

### Shell shortcuts

```bash
source ~/bin/alloy-dev/shell-aliases.sh
awt 1          # cd into slot 1 worktree
devup          # start owned server for current worktree
astatus        # alloy-agent-status
ahealth        # alloy-ai-health
```

### Typical Phase 2 flow

```bash
alloy-agent-create architecture-pass          # auto slot (e.g. 2→Claude→3012)
alloy-agent-open 2 --with-server              # open tool + server; prompt copied
# work…
alloy-agent-status
alloy-agent-close 2                           # stop server; keep worktree
```

### Phase 3 — verification bootstrap

| Command | Purpose |
|---------|---------|
| `alloy-agent-prepare` | Safe allowlisted `web/.env.local.agent` (chmod 600; never prints values) |
| `alloy-agent-login` | Isolated browser → manual `/login` → storage state per slot |
| `alloy-agent-ready` | READY / NOT READY checklist with remediation |
| `alloy-agent-verify` | Focused route/home verify (one worker; evidence on failure) |
| `alloy-agent-browser-stop` | Stop slot-owned browser only |
| `alloy-agent-context` | Generated verification context; `--copy` |
| `alloy-agent-evidence` | List screenshots/summaries under local evidence dir |

Auth discovered: Supabase email/password at `/login` (see `web/README_ADMIN_AUTH.md`).

```bash
alloy-agent-prepare 1
alloy-dev-start wt1-my-initiative    # toolkit-owned; agent-safe + trusted server injection (not npm run dev)
alloy-agent-login 1
alloy-agent-ready 1                  # requires toolkit-owned server; reports two-tier env readiness
alloy-agent-verify 1 route /workspace
alloy-agent-context 1 --copy
alloy-agent-browser-stop 1
```

Environment contract: agents see `web/.env.local.agent` (public/safe). Privileged server vars (e.g. `SUPABASE_SERVICE_ROLE_KEY`) are injected only into the toolkit-owned Next process from `ALLOY_SERVER_ENV_SOURCE` and never enter the worktree. See `VERIFICATION-SECURITY.md`.

**Real-Mac certified (July 2026):** prepare → toolkit-owned server (two-tier env) → isolated manual login → READY → `/workspace` verify PASS → evidence generated. See `VERIFICATION-SECURITY.md` for certification notes and `web/next-env.d.ts` remediation.

Guides: `VERIFICATION-SECURITY.md`, `AI-APP-HEALTH.md`

## 16. Phase 4 — Engineering Manager V1

Local initiative lifecycle over Phase 1–3 primitives. **Not** a daemon, database, or hosted control plane.

Storage: `~/.local/state/alloy-dev/initiatives/<key>/`

| Command | Purpose |
|---------|---------|
| `alloy-engineering-help` | Top-level help |
| `alloy-initiative-create` | Import brief (`--clipboard` / `--from`) |
| `alloy-initiative-import` | Import from stdin |
| `alloy-initiative-audit` | Repository + doctrine audit |
| `alloy-initiative-plan` | Proposed spec, tasks, worker plan |
| `alloy-initiative-approve` | Freeze approved contract (`--approver`) |
| `alloy-initiative-start` | Create workers + packages |
| `alloy-worker-open` | Open app + clipboard package |
| `alloy-worker-report` | Ingest structured worker report |
| `alloy-initiative-review` | Generate reviewer package |
| `alloy-initiative-remediate` | Bounded remediation packages |
| `alloy-initiative-package` | Final merge-readiness package |
| `alloy-initiative-status` | Operator view (`--all`) |
| `alloy-initiative-close` | Safe close (`--promotion-recorded`) |
| `alloy-engineering-certify` | Real-Mac certification harness (run before first real initiative) |

### Certification (required before first real initiative)

```bash
alloy-engineering-certify
alloy-engineering-certify --keep
npm run local-dev:certify
```

See `ENGINEERING-MANAGER.md` § Certification.

Deterministic planning is intentionally bounded: explicit intake references are confirmed inputs; discovered repository matches are labeled candidates with search terms, provenance, and confidence. V1 coordinates and preserves a high-quality ChatGPT-authored Initiative Brief—it is not an autonomous product strategist or semantic architecture reasoner.

Review modes are explicit:

```bash
alloy-initiative-review <key> --mode advisory --type architecture
alloy-initiative-review <key> --mode gate --type test
alloy-initiative-review <key> --mode final --type integration
```

### Initiative workflow

```bash
alloy-initiative-create settings-fields-v2 --from ./brief.yaml
alloy-initiative-audit settings-fields-v2
alloy-initiative-plan settings-fields-v2
alloy-initiative-approve settings-fields-v2 --approver Kelly
alloy-initiative-start settings-fields-v2
alloy-worker-open settings-fields-v2 task-001 --with-server   # paste once
alloy-worker-report settings-fields-v2 task-001
alloy-initiative-package settings-fields-v2
```

Guides: `ENGINEERING-MANAGER.md`, `INITIATIVE-CONTRACT.md`, `WORKER-PACKAGE.md`, `REVIEW-PIPELINE.md`

Tests: `npm run local-dev:test:phase4` (includes Phase 1–3 regression)

## Certification database ownership

`exclusive-certification-db` is **enforced**, not advisory: destructive commands refuse
to run while another worker owns the certification database. See
[CERTIFICATION-OWNERSHIP.md](CERTIFICATION-OWNERSHIP.md) for the contract, the
compatibility policy, and the evidence-based recovery procedure.
