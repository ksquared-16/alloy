---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Vacilando Runtime — Phase 1 (Lead Engineer build)

**Role:** Lead Engineer · **Slot:** 6 · **Branch:** `agent/claude/6-vacilando-os-product-def`
**Base:** origin/staging @ `2b554b4b4` · **Status:** first working vertical slice — built, verified live, tests green (26/26). Not pushed.

> **What this is.** The runtime that powers the Command Center — not a dashboard. It observes, composes,
> and **projects** existing toolkit truth into a single snapshot the UI binds to. There is **no parallel
> data model and no database.** Runtime → Projection → Presentation.

Proven live against real state: `node scripts/local-dev/lib/vacilando-server.mjs --port 3020` → `http://127.0.0.1:3020`
projects the six live slots, workers, git positions, approval gates, and a git-derived activity feed. The
SPA at that URL renders entirely from `/api/state` and contains no business logic.

---

## 1. Current runtime architecture

```
                         ┌──────────────────────────────────────────────┐
  Presentation           │  apps/vacilando/public  (SPA — pure binding)  │
                         │  index.html · styles.css · app.js             │
                         └───────────────▲──────────────────────────────┘
                                         │ GET /api/state · SSE /api/events
                         ┌───────────────┴──────────────────────────────┐
  Control plane          │  lib/vacilando-server.mjs                     │
  (loopback 127.0.0.1)   │  read-only · single-flight snapshot cache     │
                         └───────────────▲──────────────────────────────┘
                                         │ composeSnapshot()
                         ┌───────────────┴──────────────────────────────┐
  Runtime                │  lib/vacilando/compose.mjs                    │
  (projection)           │   enrich each slot once → run 6 projectors    │
                         │   project · sprint · worker · repository ·    │
                         │   approval · activity   (+ model.mjs)         │
                         └───────────────▲──────────────────────────────┘
                                         │ (the ONLY I/O boundary)
                         ┌───────────────┴──────────────────────────────┐
  Sources               │  lib/vacilando/sources.mjs                     │
  (authoritative)        │   alloy-ro (fail-closed) · read-only git ·    │
                         │   recovery-tolerant state-file reads          │
                         └───────────────▲──────────────────────────────┘
                                         │
        alloy-ro worker/agent/dev-status ·  git log  ·  ~/.local/state/alloy-dev/{metadata,manifests,initiatives,evidence}
```

**Modules delivered** (all under `scripts/local-dev/`):

| File | Responsibility |
|---|---|
| `lib/vacilando/sources.mjs` | The **only** module that reads the world. Wraps `alloy-ro` (by absolute path), read-only `git log`, and recovery-tolerant parses of state files. Every read fails **soft** (typed gap, never a thrown projection). Parses metadata, never sources it; fails closed on shell-active values. |
| `lib/vacilando/model.mjs` | Pure vocabulary: schema ids, lifecycle order, status roles, deterministic `glyphFor`, `parseAheadBehind`, `gap()`. No I/O, no wall-clock. |
| `lib/vacilando/project.mjs` | **Project Runtime** — active project, sprint hierarchy; epics + multi-project declared as gaps. |
| `lib/vacilando/sprint.mjs` | **Sprint Runtime** — lifecycle, stage, status, progress, evidence, questions. Owns the shared `deriveStatus`. |
| `lib/vacilando/worker.mjs` | **Worker Runtime** — provider per slot, health, ownership, current work, last activity. |
| `lib/vacilando/repository.mjs` | **Repository Runtime** — worktrees, branches, ahead/behind, merge readiness; PR state declared as gap. |
| `lib/vacilando/approval.mjs` | **Approval Runtime** — project-wide queue of open questions, reviews, merges, promotions. |
| `lib/vacilando/activity.mjs` | **Activity Runtime** — event stream projected from git commits + lifecycle timestamps + evidence mtimes. |
| `lib/vacilando/compose.mjs` | Enriches each occupied slot once, runs the six projectors, assembles the snapshot + headline + gap register. Injects time (replayable). |
| `lib/vacilando-server.mjs` | Loopback-only HTTP + SSE. `/api/health`, `/api/state`, `/api/events`. **Single-flight snapshot cache** (one compose at a time, TTL-shared) so bursts can't spawn a process storm. Read-only — no command endpoint in Phase 1. |
| `alloy-vacilando` | CLI: `snapshot [--json]`, `sources`, `serve [--port N]`. |
| `apps/vacilando/public/*` | The live Command Center SPA (pure presentation). |
| `contracts/vacilando-v1/snapshot.json` | The snapshot + event contract (delivery-adapter independent). |
| `tests/test-vacilando.mjs` | 26 tests: determinism, status/health/merge derivations, approvals, activity ordering, gap honesty, loopback + endpoints. |

**Security posture (inherited):** read-only everywhere; `alloy-ro` invoked by absolute path (no PATH substitution);
loopback bind only; no secret ever enters a projection (test asserts it); unknown endpoints fail closed (404).

---

## 2. Projection architecture

The discipline the mission requires, made concrete:

1. **One I/O boundary.** Only `sources.mjs` touches the outside. Everything above it is a **pure function**
   of what `sources` returns. Swap a source (e.g. a future real event log) and nothing above changes.
2. **Enrich once, project many.** `compose` reads each authoritative source a single time, builds one
   enriched record per occupied slot, then hands it to six pure projectors. No projector does its own I/O;
   none can disagree with another about the same fact.
3. **Time is injected.** Projections never read the wall clock (`compose` passes `nowMs`); the same state +
   one clock reading yields a byte-identical snapshot. Verified by a determinism test.
4. **The snapshot is the whole contract.** If a field is in the snapshot, a UI component may bind to it and
   hold no logic. If it isn't, it's in `snapshot.gaps` — never faked.
5. **Fail soft, never fabricate.** A missing/corrupt source degrades to a typed gap and a `sources[].ok:false`
   flag; the server serves last-good rather than an empty frame.

**Snapshot shape** (`vacilando.snapshot.v1`): `{ generated_at, sources, project, headline, sprints[], workers[],
repository, approvals, activity[], gaps[] }`. Full contract in [`contracts/vacilando-v1/snapshot.json`](../../../../scripts/local-dev/contracts/vacilando-v1/snapshot.json).

---

## 3. Source-of-truth map — every widget → where its data comes from

**Legend:** ✅ authoritative & live · ⛏ derived (labelled, from a real source) · ⚠ gap (surfaced, not invented).

| Command Center widget | Snapshot field | Authoritative source | |
|---|---|---|---|
| Header · project name / base | `project.name / base_sha` | `alloy-ro root`, `alloy-ro worker-status` | ✅ |
| Tile · Active Sprints | `headline.active_sprints` | derived from `sprints[].status` | ⛏ |
| Tile · Workers Running | `headline.workers_running` | `alloy-ro agent-status` (active providers) | ✅ |
| Tile · Questions Pending | `headline.questions_pending` | initiative `human_decisions[]` (open) | ✅ |
| Tile · Merge-Ready | `headline.prs_ready` | initiatives in `merge_ready` | ✅ |
| Tile · Tests Passing | `headline.tests_passing` | — | ⚠ not tracked by toolkit |
| Tile · Staging Sync | `headline.staging_sync` | `alloy-ro worker-status` behind counts | ✅ |
| Sprint · title / provider / slot | `sprints[].title/provider/slot` | initiative title or metadata + `worker-status` | ✅ |
| Sprint · status chip | `sprints[].status` | `deriveStatus` over initiative state + lifecycle + git | ⛏ |
| Sprint · phase label | `sprints[].phase.label` | manifest `stage` / initiative `state` | ✅ |
| Sprint · phase "N of M" | `sprints[].phase.index/total` | — | ⚠ numbered phases unmodelled |
| Sprint · progress % | `sprints[].progress` | ordinal on canonical lifecycle (initiative-backed only) | ⛏/⚠ |
| Sprint · git ahead/behind/dirty | `sprints[].git` | `alloy-ro worker-status` | ✅ |
| Sprint · evidence count | `sprints[].evidence_count` | `evidence/<worktree>/` | ✅ |
| Sprint · questions | `sprints[].questions[]` | initiative `human_decisions[]` | ✅ |
| Worker · provider / role | `workers[].provider/role` | `worker-status` + metadata `ALLOY_AGENT_ROLE` | ✅ |
| Worker · health | `workers[].health` | derived from `agent_status` + branch drift | ⛏ |
| Worker · ownership / session | `workers[].ownership` | metadata `ALLOY_PROVIDER_SESSION_ID`, path | ✅ |
| Worker · last activity | `workers[].last_activity_ms` | last `git log` commit time | ✅ |
| Repository · worktrees/branches | `repository.worktrees[]` | `alloy-ro agent-status` | ✅ |
| Repository · merge readiness | `…merge_readiness` | initiative gate + git position | ⛏ |
| Repository · PR state | `…worktrees[].pr` | — | ⚠ PRs printed, never tracked |
| Approvals · questions/reviews/merges/promotions | `approvals.*` | all initiatives' state + `human_decisions` | ✅ |
| Activity · feed | `activity[]` | `git log` + metadata timestamps + evidence mtimes | ✅ |
| Gaps drawer | `gaps[]` | the runtime's own gap register | ✅ |

Every element maps back to one authoritative source. Six gaps are **surfaced** in the running product, never faked.

---

## 4. Implementation plan (this slice) & what shipped

The smallest working vertical slice was scoped as: **sources → six projectors → compose → loopback server →
one live-bound screen → tests.** All of it shipped and is verified:

- ✅ Authoritative source layer over `alloy-ro` + git + safe file reads.
- ✅ Six runtime projection modules (Project, Sprint, Worker, Repository, Approval, Activity).
- ✅ Compose → single `vacilando.snapshot.v1` with headline + gap register.
- ✅ `alloy-vacilando` CLI (`snapshot`/`sources`/`serve`).
- ✅ Loopback server with single-flight cache + SSE.
- ✅ Live Command Center SPA binding to `/api/state` (no business logic).
- ✅ 26/26 tests green; verified live against the six real slots in-browser.

---

## 5. Status — completed / remaining / blockers / gaps / recommendations

### Completed
The full runtime foundation above, projecting real state, with the approved Command Center rendering live
purely from projections. The success criterion is met: **the dashboard became live by binding UI to runtime
projections; it holds no business logic.**

### Remaining (Phase 1 tail, not started)
- **Command allowlist** — Phase 1's next increment: a fail-closed `POST /api/commands` (+ preview) mapping
  UI actions to existing `alloy-*` CLIs (start/pause/resume sprint, resolve decision, approve). *Deliberately
  absent today — the port is read-only.*
- **`vacilando-certify`** harness in the mould of `alloy-*-certify` (disposable `ALLOY_RUNTIME_ROOT`, fixture
  ports 391x, assert production state byte-unchanged).
- Register `test-vacilando.mjs` in a phase test runner + `package.json` script.
- SPA breadth: Sprint Board / Mission Workspace / full Approvals screens (Command Center is done).

### Blockers
None. The runtime runs against live state today.

### Gaps (surfaced by the runtime, would need new authoritative state — never invented)
1. **Numeric phase / progress %** — the toolkit models lifecycle *stages*, not "4 of 7" or a percent.
   *Would need:* a declared phase plan in the initiative/manifest.
2. **Tests-passing %** — no validation result is persisted. *Would need:* `alloy-validate` to write a result record.
3. **PR state** — promotion commands are printed, never executed or tracked. *Would need:* a PR/promotion ledger.
4. **Multi-project & epics** — one canonical repo; no epic record type. *Would need:* a project registry / epic grouping.
5. **`alloy-ro` coverage** — health/status/decisions aren't in the read-only surface; the runtime reads those
   state files directly. *Would need:* promoting them into `alloy-ro` so 100% of reads flow through one fail-closed surface.
6. **Stored event log** — Activity is projected from git+fs; there is no durable runtime event stream on staging.
   *Would need:* the `vacilando.event.v1` emitter (the stranded Director had one) landed on canonical.

### Recommendations
- **Close gap #5 next** (promote health/status/decisions into `alloy-ro`) so every read is fail-closed — small,
  high-leverage, unblocks a stricter read boundary.
- **Then the command allowlist** — it turns the read-only pane into an operable control plane while preserving
  the projection discipline (every action → one existing CLI, preview → confirm, release never auto).
- **Feed the gaps upstream, don't paper over them.** Numbered phases, test results, and a PR ledger are best
  fixed by having the toolkit *write* that authoritative state, after which the projections light up for free.
- **Keep the one-I/O-boundary rule absolute.** It is why the UI could go live with zero logic and why swapping
  Activity's source later costs nothing above `sources.mjs`.

---

### Run it
```bash
node scripts/local-dev/alloy-vacilando snapshot        # human view of the live projection
node scripts/local-dev/alloy-vacilando snapshot --json # the raw vacilando.snapshot.v1
node scripts/local-dev/alloy-vacilando serve           # loopback control plane → http://127.0.0.1:3020
node scripts/local-dev/tests/test-vacilando.mjs        # 26 tests
```
