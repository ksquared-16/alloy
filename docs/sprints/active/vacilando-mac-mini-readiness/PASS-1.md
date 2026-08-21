---
owner: platform
status: sprint
last_reviewed: 2026-08-21
---

# Vacilando — Mac Mini Readiness & Runtime Trust Pass 1

**Sprint:** `vacilando-mac-mini-readiness`  
**Slot:** 1  
**Branch:** `agent/cursor/1-vacilando-mac-mini-readiness`

Pass 1 makes the current MacBook-hosted Vacilando runtime trustworthy enough that moving execution to a Mac mini is a controlled rebinding, not a rebuild.

This is not a multi-node scheduler, not a Cursor provider, not a UI redesign, and not an extraction of Vacilando from Alloy.

## Object boundaries (preserved)

| Object | Lifetime | What it is |
|---|---|---|
| Development Lane | Permanent | Specialist identity. Survives machine, worktree, branch, tmux, Claude session, provider, and Execution Runs. |
| Execution Binding | Temporary | Node + worktree + branch + tmux + provider. |
| Execution Run | One approved unit of work | Attached to `lane_id`, not to a host. |
| Agent Session | Replaceable | Provider context. History is durable; the live session is not. |
| Admission Request | Capacity wait | Durable work waiting for an execution environment. |
| Resource Request | Scarce-resource wait | Queue/grant for a named resource. |
| Node | This host | Minimum identity required to rebind. Not a cluster member. |

## 1. Host-dependency inventory

Classification: **1** intentional host configuration · **2** configurable but currently MacBook-bound · **3** architectural coupling removed or reduced this pass · **4** ephemeral/reconstructable · **5** unknown until the mini exists.

| Dependency | Evidence | Class | Pass 1 disposition |
|---|---|---|---|
| Gateway runtime root `~/.local/state/alloy-dev/gateway` | `install-vacilando-gateway.sh`, `vacilando-gateway-host.mjs` | 1 | Keep. Overridable via `VACILANDO_GATEWAY_ROOT` / `ALLOY_RUNTIME_ROOT`. |
| Alloy toolkit runtime `~/.local/state/alloy-dev` | `workspace-facts.mjs` `resolveRuntimeConfig()` | 1 | Keep. Config-driven. |
| Worktree root `$HOME/Code/alloy-worktrees` | `alloy-config.example`, `identity.mjs` | 1 | Keep. Config-driven. `identity.mjs` now reads `resolveRuntimeConfig()` instead of hardcoding `$HOME/Code/...`. |
| Canonical repo path | Installed `~/.config/alloy-dev/config` has `ALLOY_REPO="/Users/Kelly/Alloy"` | 2 | Example default is now `$HOME/Alloy`. Installed config stays explicit. Bootstrap writes the local path. |
| Hardcoded `/Users/Kelly/Alloy` fallbacks | `workspace-facts.mjs`, `project.mjs`, `trusted-host-action-registry.mjs` | 3 | Removed as the silent default. Trusted-host still *accepts* `/Users/Kelly/Alloy` as a candidate after `ALLOY_REPO` so this operator's trusted host does not broaden. |
| Gateway launchd WorkingDirectory = toolkit copy | `install-vacilando-gateway.sh` `HERE` | 2 | Documented: install from canonical `ALLOY_REPO`, not a sprint worktree. Current live Gateway still runs from `wt5-vacilando-gateway-v2` until reinstall. |
| launchd label `com.alloy.vacilando-gateway` | plist | 1 | Keep. |
| Gateway port 3020 | `VACILANDO_PORT`, host.mjs | 1 | Keep. Not a slot port. |
| Loopback + Tailscale IPv4 dual-bind | `vacilando-tailscale-bind.mjs` | 1 | Keep. Discovers current CGNAT; never caches an address; never binds `0.0.0.0`. |
| Tailscale CLI paths | `/opt/homebrew/bin`, `/Applications/Tailscale.app/...` | 2 | Homebrew/app paths are macOS-normal. Must exist on the mini. |
| Node binary in launchd | `command -v node` at install time (often nvm) | 2 | Arrival-day: confirm launchd PATH can spawn Node. |
| `control-plane-owner.json` hostname | live file `host: MacBook-Air-5.local` | 4 | Ephemeral. Regenerated on start. |
| Durable lanes with absolute worktree paths | live `lanes.json` `worktree_path: /Users/Kelly/Code/alloy-worktrees/...` | 2 | Binding now carries `node_id`. Restore marks bindings stale. |
| `execution_node: "local"` | `execution-admission.mjs`, `alloy-dev-adapter.mjs` | 3 | New admissions/capacity reports stamp `node_id`. `"local"` remains an alias. |
| Slot identity META_DIR / WT_ROOT hardcoded under `$HOME` | `identity.mjs` | 3 | Now uses `resolveRuntimeConfig()`. |
| Trusted-host canonical checkout | `resolveCanonicalRepoRoot()`, `trusted-host-*.sh` | 1 | Preserved. Consequential GitHub/DB actions stay on the configured canonical repo, not development lanes. |
| Docker / `alloy-stack` | local-docker doctrine | 1 | Shared stack; never `supabase start`. Mini must join, not invent a stack. |
| tmux session names `alloy-*` | `lanes.mjs`, live bindings | 1 | Host-local. Invalidated on restore. |
| Claude Code CLI + login | PATH / `~/.claude` | 2 | Re-login on the mini. Not in durable backup. |
| Web Push VAPID private key | `vacilando/web-push.json` | 1 / secret | Excluded from backup. Re-provision. |
| Gateway API token | `vacilando/api-token` | 1 / secret | Excluded. Created on first Gateway start. |
| Notification subscriptions | `vacilando/notifications/` | 1 | Backed up (endpoints). Keys are not. |
| Electron :3021 | desktop app | 4 | Out of Pass 1 Gateway path. |
| GitHub remote `ksquared-16/alloy.git` | config / `alloy-root` | 1 | Same repository; clone path is host-local. |

## 2. Durable / reconstructable / ephemeral matrix

Authoritative stores live under `$ALLOY_RUNTIME_ROOT/vacilando/` (Gateway: `~/.local/state/alloy-dev/gateway/vacilando/`).

| Family | Class | Storage | Backup | Restore | Machine-binding | Corruption / dead-node behavior |
|---|---|---|---|---|---|---|
| Development Lane identity | AUTHORITATIVE | `lanes/lanes.json` | yes | yes, same `lane_id` | Binding is host-specific; identity is not | Dead node must not require recreating lanes. Restore + rebind. |
| Execution Runs | AUTHORITATIVE | `execution-runs/runs.json` + `events.jsonl` | yes | yes | `worktree_path` / `node_id` observational | Runs stay attached to `lane_id`. |
| Agent Sessions | AUTHORITATIVE | `agent-sessions.json` + events | yes | history only | Live Claude session dies with the host | Replaceable; history remains. |
| Admissions | AUTHORITATIVE | `admissions.json` + events | yes | history | Open queue is not live capacity | Review in-flight items after restore. |
| Resource requests | AUTHORITATIVE | `resource-requests.json` | yes | records only | GRANTED claims are invalid on a new node | Do not re-grant automatically. |
| Audit / usage / sends | AUTHORITATIVE | `audit.jsonl`, `usage-ledger/`, `director/`, `lane-runtime/sends.json` | yes | yes | none | Append-only; checksum on backup files. |
| Notification subscriptions | AUTHORITATIVE | `notifications/` | yes | yes | Push endpoints may be device-specific | Re-test push on the mini. |
| Governed actions / missions / timelines | AUTHORITATIVE | `governed-actions/`, `missions/`, `timeline/` | yes | yes | artifacts may contain host paths | Identity preserved; paths are historical. |
| Execution Node | EPHEMERAL | `node.json` | no | regenerate | **is** the machine | `ensureLocalNode` mints a new `node_id` on a fresh root. |
| Control-plane pid/health | EPHEMERAL | `control-plane-*.json` | no | no | pid/hostname | Regenerated. |
| API token / VAPID / trusted-secrets | EPHEMERAL (secrets) | `api-token`, `web-push.json`, `trusted-secrets/` | **never** | place separately | trusted host | New token on Gateway start. Do not copy into git or lanes. |
| Trusted-host actions / evidence / knowledge cache | RECONSTRUCTABLE | `trusted-host-actions/`, `evidence/`, `knowledge/` | no (minimum unit) | no | large, regenerable | Reconstruct on the trusted host. |

A dead execution node does **not** require manually recreating Development Lanes if a durable backup exists.

## 3. Minimal Node model (what changed)

```
Development Lane  →  Execution Binding  →  Node  →  worktree / tmux / Agent Session
```

Implemented in `scripts/local-dev/lib/vacilando/execution-node.mjs`:

- Stable `node_id` (`node_` + 12 hex), created once per runtime root
- Operator-readable `name` (`VACILANDO_NODE_NAME` or hostname)
- Node-specific `runtime_root`, `worktree_root`, `canonical_repo`
- Capability probes only for tools already used: tmux, git, node, claude, docker, tailscale
- Bindings carry `node_id`, `stale`, `status`
- Restore invalidates tmux/slot/node claim without deleting the lane
- `rebindDurableLane` keeps `lane_id`
- Admissions and resource requests inherit `work_class` priority
- `GET /api/node` for Gateway readability

Not implemented (out of scope): distributed scheduling, remote migration, balancing, cluster membership.

## 4. Bootstrap contract (clean Mac mini)

Executable: `scripts/local-dev/vacilando-node-bootstrap.sh`

Prerequisites:

1. macOS on the mini, logged-in GUI user (launchd agent)
2. Homebrew
3. Node.js 20+ (same major as current: this host is v22)
4. git, gh, tmux
5. Claude Code CLI + login
6. Tailscale + logged-in tailnet (Serve / dual-bind)
7. Docker Desktop only if this node will hold the shared Alloy stack
8. Clone Alloy to `$HOME/Alloy` (or set `ALLOY_REPO`)
9. `~/.config/alloy-dev/config` with local paths
10. `npm install` in `web/` of that checkout; `bash scripts/local-dev/install.sh`
11. Runtime roots: `~/.local/state/alloy-dev` and `.../gateway`
12. Worktree root: `$HOME/Code/alloy-worktrees`
13. `vacilando-node-bootstrap.sh` then restore durable backup
14. Rebind each specialist lane to a worktree on this node
15. Place secrets: `web/.env.local`, Gateway `api-token`, trusted-secrets **on disk, not in git**
16. Health: `curl http://127.0.0.1:3020/api/node` and `/api/lanes`

Trusted-host GitHub/database actions stay bound to `ALLOY_REPO`. Do not broaden them to development lanes.

## 5. Backup / restore design

- Unit: selected AUTHORITATIVE files under `vacilando/` (see `STATE_FAMILIES`)
- Location: `{gatewayRoot}/backups/vbak_<stamp>_<id>/`
- Atomic write: temp directory then `rename`
- Manifest with per-file SHA-256
- Retention: last 7 backups
- Secrets excluded
- `node.json` excluded (regenerated)
- Restore invalidates host bindings
- Does not run git, create worktrees, or touch tmux

CLI:

```text
alloy-vacilando backup [--out DIR]
alloy-vacilando restore --from BACKUP --to DEST_ROOT
alloy-vacilando node [--name NAME]
alloy-vacilando ensure-lane vacilando
```

## 6–8. Rehearsal and Vacilando lane

Isolated unit proof: `scripts/local-dev/tests/vacilando-durable-state.test.mjs` (9/9).

Live Gateway rehearsal (2026-08-21, this MacBook, isolated restore dest):

- Evidence: `docs/sprints/active/vacilando-mac-mini-readiness/rehearsal-evidence.json`
- Vacilando lane created on live Gateway: **`lane_db3431e755a8`** (`work_class: runtime_self`, priority `-10`)
- Live specialist bindings were **not** invalidated (Communications still has `tmux_session: alloy-communications`)
- Restore dest minted a **different** node (`node_e772f5e18fe9`); 3 host bindings marked stale; lane IDs unchanged
- Historical runs remained attached (e.g. Access & Identity `erun_70a72b7e240c5619` still `lane_955fe041d417`)
- Communications worktree git status unchanged (`porcelain` empty before and after)
- Operator backup unit: `~/.local/state/alloy-dev/gateway/backups/vbak_2026-08-21T16-36-52-031Z_7f5880d1`

The Vacilando lane is a normal durable Development Lane (`name: Vacilando`, alias `vacilando`). Product admissions sort ahead of it. Operator prioritize can still raise a Vacilando job explicitly.

## 9. Arrival-day checks (cannot prove until the mini exists)

- Hardware, disk, thermal, and sleep/lid behavior
- launchd Node PATH (nvm vs Homebrew node)
- Tailscale Serve HTTPS hostname
- Claude login + provider capacity vs this MacBook
- Docker/alloy-stack as the shared stack on the mini
- Empirical concurrency (providers, validation broker, Gateway)
- Rebind of live specialist worktrees after copy or fresh `alloy-sprint-start`
- Push notification re-subscribe on the operator's phone against the mini Gateway
- Whether the MacBook remains a laptop operator surface while the mini is the execution node

## 10. Remaining migration-safety risks

1. **Live Gateway still executes from `wt5-vacilando-gateway-v2`.** Reinstall from canonical `ALLOY_REPO` on the mini (and eventually on this MacBook) or a Gateway restart can pin the wrong toolkit copy. Unsafe if forgotten.
2. **Secrets are not in the backup unit.** Losing `web/.env.local` / trusted-secrets / api-token is a separate restore. Unsafe if treated as "Vacilando backup is enough."
3. **Open GRANTED resources and live Claude sessions do not move.** In-flight Execution Runs must be finished or explicitly abandoned before cutover.
4. **Absolute worktree paths in historical runs** remain as history. They must not be treated as live bindings after restore (stale flag exists for lane bindings; run.worktree_path is observational).
5. **launchd Node binary** captured at install time. nvm upgrades can leave a dead path.

Lower: Tailscale IP change (already retried), example-config `$HOME/Alloy` vs installed `/Users/Kelly/Alloy` (installed config wins).
