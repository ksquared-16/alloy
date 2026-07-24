# Director Intelligence V1 — Engineering Closeout

**Status:** BUILT (steps 1–8) · design approved by Kelly · nothing pushed/merged/promoted.
**Branch:** `agent/claude/6-vacilando-os-product-def` · worktree `wt6-vacilando-os-product-def` · server :3020.
**Foundation (untouched):** Operational Trustworthiness V1 — Closeout, Trust Dashboard, Identity Runtime, governed execution.

## What shipped

The upstream intelligence layer that turns `Kelly → large prompt → Claude` into
`Kelly → intent → Director → Mission Package → Worker`. The operator now **approves**
a prepared package; they do not **author** one.

Baseline before this arc: **zero reasoning upstream of the worker turn** — the
compiler literally recorded `reasoning_invocations: []`. That gap is now closed.

| Step | Runtime / change | Commit |
|---|---|---|
| 1 | **Product Definition Runtime** — durable long-term memory; product truth migrated off the capability seed; read-time hydration; learning-loop write-back | `8a9d5e9df` |
| 2 | **Capability model v2 + registry** — N capabilities; projected metrics / acceptance-history / readiness; register/list APIs | `a26e0fc64` |
| 3 | **Knowledge Snapshot v2** — files → sectioned context; reproducible, content-hashed | `c4c593e07` |
| 4 | **Gap Analysis Runtime** — first reasoning stage; deterministic 8-rule engine behind a `ReasoningProvider` seam; durable, reproducible gap report | `3a50a9558` |
| 5–7 | **Mission Package v2 + Director Review verdict + full pipeline** — versioned lineage + diff; embedded gap report + PD snapshot + risks/questions; six-state verdict with send-back; `compileMissionForIntent` runs the whole line | `1edb87787` |
| 8 | **Mission Preparation & Review UI** — verdict panel in the operator SPA | `06cf35444` |
| — | 10-part design proposal (approved) | `82de25399` |

## The pipeline, live

`POST /api/missions/compile {slot, intent:"Build Access & Roles V2"}` →
capability resolved → knowledge snapshot (v2) → **gap analysis** (confidence 1.0) →
compiled package v1 → **verdict: Ready** — no manually assembled prompt. The
compiler's `reasoning_invocations` is now honestly populated; the package embeds
the gap report and a frozen product-definition snapshot.

A bare capability with no Product Definition correctly returns **Needs Decisions**
(send-back → `product-definition`).

## Verification

- `node --test scripts/local-dev/tests/mission-runtime.test.mjs` → **19/19** (was 9/9; +10).
- Live API certified on :3020: full compile pipeline, capability registry endpoints,
  product-definition endpoint, migration on both fresh + live stores.
- UI: served `app.js` carries the render code, SPA loads with **zero console errors**,
  and `/api/mission` returns every field the Review panel reads.
- **Deferred:** full browser click-through screenshot of the rendered verdict panel —
  host load ~82 wedges the in-app renderer (watch-out threshold ~30–48). Do this on a
  calmer host alongside the peripheral-surface browser certification.

## Governance (held)

Loopback only · fixed executables · `shell:false` · **nothing pushed/merged/promoted**.
No provider execution this sprint — Gap Analysis reasons deterministically; the
`ReasoningProvider` seam stays dormant for a future provider-backed reasoner.

## New runtime state (durable, under `ALLOY_RUNTIME_ROOT`)

- `vacilando/product-definitions/product-definitions.jsonl`
- `vacilando/gap-reports/*.json`
- `vacilando/knowledge/snapshots/*.json` (now v2 sectioned)
- capability + mission + package logs (extended, back-compatible)

## Follow-ups

1. Browser click-through cert of the Review panel + peripheral surfaces (calmer host).
2. Send-back **actions** are advisory today (the verdict names the stage); wiring
   one-click "resolve at stage X → recompile new version" is the natural next slice.
3. `ProviderReasoner` behind the Gap Analysis seam — the deeper intelligence, when
   provider execution during preparation is explicitly authorized.
4. Capability-registration API is ungoverned (additive/idempotent); consider the
   preview→confirm lifecycle if registration ever carries side effects.
