# Phase 6 — Agent Session lifecycle + context rotation

**Status:** implemented. Stop after this phase.  
**Date:** 2026-08-18  
**Sprint:** `vacilando-gateway-v2` slot 5  
**Stores:** `{ALLOY_RUNTIME_ROOT}/vacilando/execution-runs/agent-sessions.json`, `agent-handoffs.json`, `agent-session-events.jsonl`

A Development Lane can now outlive its current Claude session. Only the **Agent Session** changes. Lane, Execution Run, worktree, branch, Git contents, and resource-queue position stay the same.

This is **not** provider switching, multi-agent lanes, Git cleanup, or transcript-as-database.

---

## 1. Claude session / runtime audit

Live installed binary: `/Users/Kelly/.local/bin/claude` **2.1.233**.

| Source | Class | Notes |
|---|---|---|
| Interactive `claude` (not `-p`) | **SUPPORTED** | Required replacement launch |
| `--session-id <uuid>` | **SUPPORTED** | Assign a new provider session id before start |
| `-c` / `--continue`, `-r` / `--resume`, `--fork-session` | **UNUSABLE for rotation** | Continues the old conversation |
| `--tmux` | **UNUSABLE** | Creates a new tmux session; lanes already own `alloy-*` |
| `claude -p` | **UNUSABLE** | Mission executor only |
| `sendLaneInstruction` (load-buffer → paste-buffer → Enter) | **SUPPORTED** | Server-owned rotation / orientation text |
| Gateway `POST …/agent-session/handoff` and `/oriented` | **SUPPORTED** | Structured reports; not TUI scrape |
| Worktree helper `scripts/local-dev/vac-session-report.mjs` | **SUPPORTED** | Absolute path; not PATH `vac` |
| `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl` | **SEMI_STABLE** | Session id + usage; existing telemetry adapter |
| `pane_current_command` as semver / `claude` | **SEMI_STABLE** | Presence only |
| send-keys Ctrl-C, `/exit`, capture-pane scrape | **BRITTLE / UNUSABLE** | Forbidden |
| Mission `execution-session.mjs` / `claude -p` connectors | **UNUSABLE for lanes** | Headless mission turns |
| `tmux respawn-pane -k` | **SUPPORTED after exit** | Replaces leftover shell in the same pane; never `kill-session` |

Preferred replacement:

```text
Claude exits cleanly → tmux session remains → respawn-pane -k
  claude --session-id <uuid>
```

If Claude does not exit: **do not kill**. Escalate `NEEDS_INPUT`.

---

## 2. Telemetry sources + stability

Reuse `providers/claude/telemetry.mjs` (SEMI_STABLE). No TUI token parsing.

- Context: `used_tokens`; `max_tokens` / `percent_used` only when used > 200k (inferred 1m window)
- Usage: cumulative input / output / cache read / cache write
- Cost: `null` on Claude Max; never `$0`
- Collection: selected-lane 15s TTL; no all-lane fan-out

---

## 3. Agent Session model

Identities:

```text
Development Lane  ≠  Execution Run  ≠  Agent Session
agsess_*          ≠  lane_id        ≠  erun_*
```

States: `STARTING` · `ACTIVE` · `ROTATION_PENDING` · `HANDOFF` · `RESTARTING` · `VERIFYING` · `ENDED` · `FAILED`

Predecessor / successor links sequential sessions. A lane may have many sessions; a run does not change across rotation.

---

## 4. Context / token / cost semantics

| Field | Meaning |
|---|---|
| Context % | Current window fill when known; otherwise null |
| Input / output / cache | Cumulative for the **current** Claude transcript |
| Session cost | Provider-reported USD, or “Not reported · Claude Max subscription” |
| Lane lifetime | Sum of **ended** session totals only |

Unknown stays `null`. Subscription Max billing is not converted into a fake dollar amount.

---

## 5. Rotation-trigger policy

Automatic context rotation is the **default product behavior**. Operators do not configure an env var for normal use.

| Kind | When |
|---|---|
| **THRESHOLD** | Known `percent_used >= 85` marks the **current** Agent Session `ROTATION_PENDING` |
| **SAFE AUTOMATIC** | Pending rotation executes at the next Phase-6-safe checkpoint: structured handoff → clean exit → replacement Claude → orientation → same Execution Run |
| **DEFER** | Stay pending during VALIDATING + granted browser cert, exclusive timing work, continuation DELIVERING/AMBIGUOUS, unsafe/destructive in-flight, handoff not ready, or outgoing Claude still present |
| **UNKNOWN** | If context percent cannot be determined, do not auto-rotate and do not invent a percent from cumulative tokens. Show `Context unavailable`. Manual refresh remains |
| **DIAGNOSTIC OFF** | `VACILANDO_AUTO_SESSION_ROTATION=0` (or `false`/`off`) restores recommend-only behavior. `=1` is no longer required |
| **MANUAL** | Refresh Claude Context remains an explicit early-refresh control |

A threshold trigger belongs to one Agent Session. The successor starts with a fresh baseline. Exactly one automatic attempt is made per trigger episode. Existing restart/recovery budget still applies.

Successful routine rotation requires **no operator confirmation** and produces **no notification**. Failure, ambiguity, or orientation failure → `NEEDS_INPUT`.

---

## 6. Safe-checkpoint contract

Refuse to *execute* rotation / auto-recovery while:

- no lane identity
- run is terminal
- a continuation is `DELIVERING` or `AMBIGUOUS`
- run is `VALIDATING` **and** `browser_certification` / `validate` is `GRANTED`
- exclusive timing work is active (`runtime_timing_certification` GRANTED or machine exclusive window)
- an unsafe/destructive operation is in flight
- structured handoff is not ready
- the outgoing Claude process has not exited

Crossing 85% does **not** kill Claude. The session stays `ROTATION_PENDING` (`Refresh pending · waiting for a safe checkpoint`) until the first safe checkpoint, then rotation proceeds automatically.

A dirty worktree is **not** a blocker. Dirty work is preserved, not cleaned.

`WAITING_RESOURCE` is usually an easier checkpoint (no active scarce grant in VALIDATING).

---

## 7. Handoff schema

`AgentSessionHandoff` in `agent-handoffs.json`:

`handoff_id`, `lane_id`, `run_id`, `from_session_id`, `created_at`, `state`, `payload` (completed/remaining/phase/validation/resource/blockers/decisions/recent_files/next_action), `git_truth`, `substrate_overrides`

No transcript. Stale if age > 30 minutes or session/run/lane mismatch.

---

## 8. Handoff generation / reporting

Vacilando sends a server-owned checkpoint instruction via `sendLaneInstruction` (governor actor, unique `handoff:<id>` dedupe).

Claude reports with the worktree helper:

```text
node "<worktree>/scripts/local-dev/vac-session-report.mjs" handoff --run <erun> --lane <lane> --json '{...}'
```

HTTP equivalent: `POST /api/lanes/:id/agent-session/handoff` (v2 twin exists).

Git “clean” in prose cannot override a dirty porcelain status (`substrate_overrides: git_dirty`).

---

## 9. Current-session finalization

Before replacement, session A is `ENDED` with `end_reason`, timestamp, and **final** telemetry/usage/cost only (no polling samples persisted).

---

## 10. Replacement-session launch contract

1. Observe outgoing Claude gone (do not Ctrl-C).
2. End A.
3. Create B with `predecessor_session_id`, new `--session-id` UUID.
4. `tmux respawn-pane -k -c <same worktree>` → `claude --session-id <uuid>`
5. Forbid `-p`, `--resume`, `-c`, `--tmux`.
6. Count Claude on the lane; `>1` → `NEEDS_INPUT` (do not kill the extra process).
7. Deliver orientation instruction. Session B is `VERIFYING` until ORIENTED.

---

## 11. Orientation verification

Replacement must report `ORIENTED` with lane, run, worktree, branch, phase, next_action via `vac-session-report oriented` / `POST …/oriented`.

Vacilando independently checks lane / run / branch / worktree. Mismatch → session `FAILED`, run `NEEDS_INPUT`. Success → session `ACTIVE`, **same run state**.

---

## 12. Execution Run continuity

Rotation never creates a new `erun_*`. Resource ownership, audits, completion, and notifications stay on the original run.

---

## 13. Resource continuity rules

| Run state | Rotation |
|---|---|
| `WAITING_RESOURCE` | Allowed (checkpoint-safe). Queue position unchanged. |
| `EXECUTING` | Allowed if not DELIVERING. |
| `VALIDATING` + GRANTED scarce resource | **Refused / deferred** |
| Exclusive timing active | **Refused** |

Leases stay bound to the run, not the Claude pid.

---

## 14. Lane economics

UI distinction:

```text
CURRENT SESSION    context / input / output / cache / session cost
LANE               session count / lifetime usage / lifetime cost
```

Only ended-session totals are summed. Max subscription → “Not reported”, never `$0`.

---

## 15. Unexpected-death recovery policy

| Evidence | Action |
|---|---|
| Claude gone + unsafe checkpoint (DELIVERING / VALIDATING+GRANTED) | `NEEDS_INPUT`. No spawn. |
| Claude gone + safe checkpoint | Recovery orientation packet (prior handoff if ready, else run + Git + last instruction). Replacement must inspect before mutating. |
| Insufficient certainty for automatic spawn | Operator **Refresh Claude Context** (`confirm: true`) uses the same path. Cheap `/api/lanes` poll **never** spawns. |

Never: “just continue where the other Claude left off.”

---

## 16. Restart budget

**1 automatic recovery restart per Execution Run.** Exhaustion → `NEEDS_INPUT`. Orientation failure does not loop.

---

## 17. Files changed (this phase)

- `scripts/local-dev/lib/vacilando/agent-session.mjs`
- `scripts/local-dev/lib/vacilando/agent-session-lifecycle.mjs`
- `scripts/local-dev/vac-session-report.mjs`
- `scripts/local-dev/lib/vacilando-server.mjs`
- `scripts/local-dev/lib/vacilando/v2-api.mjs`
- `scripts/local-dev/lib/vacilando/commands/registry.mjs`
- `scripts/local-dev/apps/vacilando/public/gateway-view.mjs`
- `scripts/local-dev/apps/vacilando/public/gateway.js`
- `scripts/local-dev/apps/vacilando/public/styles.css`
- `scripts/local-dev/tests/development-agent-session.test.mjs`
- `scripts/local-dev/tests/development-gateway-ui.test.mjs`
- `scripts/local-dev/apps/vacilando/capture-gateway-phase6.mjs`
- `scripts/local-dev/apps/vacilando/qa/governor-phase6-session.md`

No `web/package.json`, `alloy-compute`, `sprint-ops.sh`, `browser-cert-lease.mjs`, `lock.sh`, or `vac-run` changes. No global toolkit promotion.

---

## 18. Tests

`node scripts/local-dev/tests/development-agent-session.test.mjs` — 18 passed  
`node scripts/local-dev/tests/development-gateway-ui.test.mjs` — 40 passed  

Regression: Execution Runs, resources, resume, exclusive, recovery, telemetry, send, remote — passed. One FIFO resource test flaked once under sequential load and passed on rerun; no resource-module edits in this phase.

---

## 19. Planned-rotation certification (disposable)

Injected tmux/Claude: run EXECUTING → rotation requested → checkpoint → structured handoff → A ended → B spawned with `--session-id` in the same worktree → orientation → same `erun_*` EXECUTING. No operator instruction after confirm.

---

## 20. Dirty-worktree certification

Modified tracked `keep.txt` + untracked `untracked-phase6.txt`. After rotation: same bytes, same HEAD, same branch. No reset/stash.

---

## 21. Unexpected-death certification

Safe EXECUTING death → recovery packet requiring inspect-before-mutate.  
`VALIDATING` + GRANTED `browser_certification` → `NEEDS_INPUT`, no spawn.

---

## 22. Telemetry certification

Existing adapter tests remain green. Rotation persist uses the same collector at **session end only**. Unknown cost stays unlabeled. No TUI parse. List poll does not collect all-lane telemetry.

---

## 23. Live-lane proof

**Not performed.** `alloy-identity` was not rotated. Disposable injected proof is the certification for this phase. Physical rotation awaits a natural idle checkpoint.

---

## 24. Performance

| Path | Impact |
|---|---|
| Selected-lane telemetry | Unchanged 15s TTL |
| `/api/lanes` attach | Cheap JSON + optional observe-create of a session record; **no spawn** |
| Handoff accept | Immediate; complete scheduled (400ms) and waits up to 90s for Claude to exit |
| Injected rotation | Tests complete in ~3.4s for the full file; outgoing-still-present wait is 40ms injected / 90s live |
| Process count | Same tmux session; one Claude after successful replacement |

Lane UI remains available throughout (`SESSION_ROTATING` overlay, run state not bounced).

---

## 25. Desktop / mobile evidence

Fixture captures (not live Claude):

- `qa/gateway-v2/phase6-desktop-rotating-list.png`
- `qa/gateway-v2/phase6-desktop-rotating.png`
- `qa/gateway-v2/phase6-desktop-refreshed.png`
- `qa/gateway-v2/phase6-mobile-rotating-list.png`
- `qa/gateway-v2/phase6-mobile-rotating.png`
- `qa/gateway-v2/phase6-mobile-refreshed.png`

---

## 26. Remaining operator involvement

- Context percent unknown (typical below 200k tokens)
- Refresh confirmation (`confirm: true`)
- Claude refuses to exit
- Duplicate Claude on a lane
- Orientation failure
- Recovery budget exhausted
- Mid-`VALIDATING` scarce grant
- `DELIVERING` continuation
- Fully automatic 85% threshold is now the default. `VACILANDO_AUTO_SESSION_ROTATION=0` is a diagnostic kill switch only.

Successful routine rotation does **not** notify. Failures and `NEEDS_INPUT` / `FAILED` / `COMPLETE` still do.

---

## 27. Mac mini / multi-node

Agent Sessions are **host-local**: tmux pane + interactive Claude + `~/.claude` jsonl. Rotation keeps the same machine, worktree, and branch. A Mac mini / multi-node scheduler would need an explicit host-scoped session owner and must not assume `respawn-pane` on another node. Not implemented.

---

## Acceptance

> Can a Development Lane safely outlive its current Claude session, preserving the same worktree, branch, Execution Run, resource state, and operational context while Vacilando refreshes or recovers the agent session without requiring the operator?

**Yes.** Default policy is automatic rotation at ≥85% context, deferred until the next safe checkpoint. No operator confirmation or success notification. `VACILANDO_AUTO_SESSION_ROTATION=0` is a diagnostic disable only. Live Access & Identity was not rotated solely to prove this.
