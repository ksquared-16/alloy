# Vacilando Core vs Alloy Development Adapter

This note classifies today’s Gateway / Governor code so Vacilando can later become its own product without destabilizing the live system. **No files were moved for conceptual purity.** Extraction is not in this slice.

## Target shape

```text
Vacilando Core
    ↓ adapter contracts
Development Adapter
    ↓
Alloy Local Development     (today’s only adapter)

Agent Provider (orthogonal)
    ├── Claude Code subscription   (today)
    ├── future Claude API
    ├── future OpenAI coding agent / API
    └── …
```

Vacilando Core should not need to know what an Alloy sprint slot is. The Alloy adapter tells Vacilando that a runtime binding has capacity, resource, and health metadata.

Provider is orthogonal to the development adapter. The same durable Development Lane can later bind a different provider without changing `lane_id`.

## CORE (Vacilando product objects)

| Concept | Today |
|---|---|
| Development Lane | Durable operator-owned record (`lane_<12 hex>`). Name is metadata, not identity. |
| Runtime binding | Correspondence to a development environment. Re-validated against substrate before send/output/continuation. Not Git/tmux truth. |
| Execution Run | Governor-tracked instruction lifecycle |
| Agent Session | Provider session belonging to a durable lane; records provider binding separately |
| Resource request / Governor / recovery | Queue, grant, exclusive window, bounded self-heal |
| Notifications / telemetry / cost seam | Lane is the product destination; usage rolls up by Agent Session → Lane |

Primary modules:

- `lib/vacilando/development-lane.mjs`
- `lib/vacilando/execution-run.mjs`
- `lib/vacilando/execution-admission.mjs` — admission queue between durable work and provision
- `lib/vacilando/source-control.mjs` — Git posture, checkpoint, conservative sync (no Level 4)
- `lib/vacilando/execution-resource.mjs`
- `lib/vacilando/execution-resume.mjs`
- `lib/vacilando/execution-recovery.mjs`
- `lib/vacilando/execution-exclusive.mjs`
- `lib/vacilando/agent-session.mjs`
- `lib/vacilando/agent-session-lifecycle.mjs`
- `lib/vacilando/lane-runtime.mjs`
- `lib/vacilando/lane-notify.mjs`
- `lib/vacilando/lane-push.mjs`

## ADAPTER (Alloy local development)

| Concept | Today |
|---|---|
| Worktree conventions | `wtN-*` under `~/Code/alloy-worktrees` |
| Sprint slots 1–6 | `~/.local/state/alloy-dev/metadata` |
| tmux allowlist | `alloy-*` sessions |
| Claude Code in a pane | Presence from command/title |
| alloy-compute / browser-cert / vac-run / sprint-ops | Resource authorities |
| Alloy ports, workspace doctor, initiative locks | Host constraints |

Primary modules:

- `lib/vacilando/alloy-dev-adapter.mjs` — candidate discovery for Connect Existing Work
- `lib/vacilando/workspace-facts.mjs` — slot metadata + git facts
- `lib/vacilando/lanes.mjs` — tmux observation overlay (still mixed; see debt)
- Resource authority readers inside `execution-resource.mjs` (`alloy-compute`, validate lease, dev servers)

## MIXED / EXTRACTION DEBT

Do not refactor these now. They are the extraction tax:

1. **`lanes.mjs`** — still discovers via tmux first, then overlays durable records when enabled. Core resolution (durable id → binding → validate → pane) lives here beside Alloy tmux allowlisting.
2. **`execution-resource.mjs`** — Governor request objects are core; holders and health snapshots still call Alloy-specific authorities (`browser-cert-lease`, `vac-run`, Next ports).
3. **`vacilando-server.mjs` / Gateway UI** — served from the Alloy repo, launchd WorkingDirectory is an Alloy worktree, runtime root is `~/.local/state/alloy-dev/gateway`.
4. **Slot numbers on bindings** — stored as optional adapter metadata (`binding.slot`). Core must treat them as opaque adapter facts.
5. **Runtime refuse list** — `isRuntimeAdoptionBlocked` uses Alloy worktree/tmux name heuristics. A future adapter should expose “not eligible” instead.
6. **Command registry copy / host PATH `vac`** — still Alloy toolkit-shaped.

## `lane_id` classification (after durable identity)

| Area | Class |
|---|---|
| Execution Run, Resource Request, continuation ownership, Agent Session, last-instruction, API routing, UI hash, notifications, exclusive `window.lane_id` | **DURABLE LANE ID REQUIRED** |
| tmux send/capture target, pane cwd, `resolvedTmuxTarget`, Claude pid | **RUNTIME BINDING REQUIRED** |
| Labels, list titles, tmux window title | **PRESENTATION ONLY** |

Continuations resolve:

```text
Execution Run → durable lane → current runtime binding → validate substrate → tmux pane
```

They must not assume `run.lane_id` is a tmux session name.

## Future rebinding contract (not implemented)

A permanent lane (e.g. Communications) will finish one worktree and bind another.

Allowed only when:

- no active Execution Run, or an explicit continuation policy
- no GRANTED scarce resource
- no DELIVERING continuation
- old runtime binding detached
- new binding uniquely owned (one worktree/runtime → at most one ACTIVE lane)

The lane retains: `lane_id`, operator name, historical Execution Runs and Agent Sessions, cost/usage history, notification identity.

## Future provider / economics seam (design only)

Per Agent Session, eventually record: provider, model, authentication/billing mode, input/output/cache tokens, context usage, reported vs estimated cost, duration, run outcomes, operator interventions.

Roll up to the durable lane — not the worktree — so provider experiments (Claude subscription vs Claude API vs OpenAI) compare the same specialist area.

Do not fabricate subscription-equivalent dollar costs. Do not call external provider APIs in this slice.

## Admission vs provision

Creating a durable lane and starting its execution substrate are different operations. Vacilando Core owns `ExecutionAdmissionRequest`. The Alloy adapter answers `Can this queued lane safely be provisioned now?` and, when admitted, calls `alloy-sprint-start` — never a hand-rolled worktree/branch/slot/port.

Admission identity is `execution_node: "local"` today. Do not bake a machine hostname into the admission record.

## Source-control policy (this slice)

| Level | Operation | Automatic? |
|---|---|---|
| 1 Local checkpoint | coherent `git commit` at an explicit `checkpoint_ready` | Yes, after independent Git/lifecycle verification |
| 2 Durability push | `git push` of the lane branch | **No.** Alloy doctrine: commit never implies push |
| 3 Sync from base | `alloy-worktree-sync` (rebase onto `origin/staging`) | Conservative: clean + scheduled + conflict-free only |
| 4 Promotion | PR / merge / deploy | **No** |

`PROMOTION_READY` is never inferred from a clean tree. Semantic merge conflicts escalate to `NEEDS_INPUT`. Vacilando does not auto-resolve them.

