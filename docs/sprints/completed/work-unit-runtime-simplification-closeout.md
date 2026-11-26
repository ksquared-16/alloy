# Runtime Simplification Sprint — Closeout (Canonical)

**Status: CLOSED — IMPLEMENTED, landed to `staging` (June 2026).** This is the single canonical record of the Runtime Simplification sprint: what landed, the runtime score, what remains, the lessons, and the runtime principles. The Runtime Architecture is now considered **stable** — treat the runtime as infrastructure, not an area requiring rediscovery. The next runtime sprint begins only when product experience identifies a concrete ownership domain that still needs simplification.

Companion canonical docs (do not duplicate these — extend them):
- [`../../platform/runtime/operational-runtime-doctrine.md`](../../platform/runtime/operational-runtime-doctrine.md) — the 10 laws (governing constraints).
- [`../../platform/foundation/os-runtime-map.md`](../../platform/foundation/os-runtime-map.md) — how the runtime works today (descriptive map).

Governing principle (unchanged): **remove runtime.** Every batch left the runtime objectively smaller — fewer owners, providers, gates, compatibility paths — or moved ownership from the compat page to a canonical runtime module. Runtime flags are migration tools only (prove → merge → delete), never permanent product modes.

---

## 1. Architecture Status

### ✓ Completed (landed to staging)
| Domain | Canonical owner now | PRs |
|---|---|---|
| **Workspace Runtime** (reveal) | server Route VM owns reveal; loading gate / reveal-readiness layer / Surface VM deleted | #13, #15 |
| **Workspace Route VM** | `workspaceRouteVm` (server-composed) | #13 |
| **Work Unit Switching Runtime** | navigation to canonical slug routes; `activeWorkUnitId` + in-page switcher removed | #17, #18 |
| **Work Unit Context Runtime** | Work-Unit Route VM (`workUnitName` + `departmentName`) | #19 |
| **Work Unit Perspective Runtime** | `useWorkUnitRuntimePerspective` (canonical hook) | #21 |
| **Queue Fetch Runtime** | `useWorkUnitQueueRuntime` (canonical hook) | #25 |
| **Queue State Runtime** | `useWorkUnitQueueRuntime` owns queue-items state + dedup refs | #28 |
| **Runtime Simplification** | compat page reduced from owner to consumer across all of the above | #13–#28 |
| **Runtime QA fixes** | instant tile click (commitFirst); no "Preparing operational surface…" over a loaded queue; KPI header skeleton (no placeholder→value morph); TTL-dedup of repeated lifecycle/sibling/dept queue-summary fetches | #32 |

### ⟳ Still remaining (clearly scoped — future sprints)
| Domain | What it is | Why it's deferred |
|---|---|---|
| **Queue summaries / bootstrap** | `queueSummaries` state + `fetchQueueSummaries` + the bootstrap lane-selection sequence (still compat-page-owned) | bootstrap-sequenced (lane selection reads summaries); needs careful staged extraction + runtime verification |
| **Queue lane ownership** | `selectedQueueKey` / `attentionBucketKey` / record filters + lane URL sync | lane selection drives the page; moving it needs a queue-identity owner |
| **Reveal coordination** | `workUnitRevealGate` + coordinated reveal orchestration | pure gate fns exist; the page still orchestrates; evidence-test guarded |
| **KPI ownership** | KPI fetch + resolver composition (`workUnitKpiContext`, placement KPIs) | deliberately deferred for TTFB; QA gated the *reveal*, not the ownership — folding placements into the bootstrap/Route VM is the next step |
| **Settings runtime** | the settings surface runtime | out of scope this sprint (separate surface) |
| **Save coordinator** | already canonical (`useResumeSessionWriter` / `resumeSession`) | not page-owned; listed for completeness, no work pending |

---

## 2. Runtime Score (sprint start → close)

| Metric | Before | After |
|---|---|---|
| Workspace loading gate | 1 | **0** |
| Workspace reveal-readiness layer | 1 | **0** |
| Workspace Surface VM | 1 | **0** |
| Work-unit client switching runtime | present | **0** (navigation-only) |
| Compat-page *owned* runtime domains | 5 | **0** (all delegated) |
| Compat-page LOC | 7,786 | ~6,962 |
| Canonical runtime hooks added | — | 3 (`useWorkUnitQueueRuntime`, `useWorkUnitRuntimePerspective`, `lifecycleSiblingNavTarget`) |
| New runtime flags | — | **0** (flags remain migration-only) |
| Repeated dept `work-unit-queue-summaries` calls | 6+/dept/30s | **1/dept/30s window** (URL-keyed TTL dedup) |

The headline is **ownership**, not raw LOC: the compat page no longer *owns* switching, context, perspective, or queue fetch/state — those live in canonical runtime modules with the page as a consumer.

---

## 3. What We Learned

Guidance for future runtime work:

- **Ownership domains beat micro-slices.** Slicing by file/component produced relocation churn and "presentation traps" (moving code without reducing ownership). Slicing by *runtime ownership domain* (switching, context, perspective, queue fetch, queue state) gave each batch a clear before/after, a provable parity boundary, and a real reduction. Every domain answered: who owns this today, who should own it, can the old owner disappear?

- **The Route VM became the canonical owner** because it is the one thing that survives the "React-disappearance test" — it is server-composed, frozen per route entry, and the single source of first-paint truth. Once switching became navigation, the per-entry Route VM was always correct, which unlocked moving context (and the rest) onto it without staleness.

- **Runtime flags are temporary** by construction: prove the canonical path → merge → prove parity → delete the old path and the flag. A flag that becomes a permanent product mode is a second runtime to maintain. This sprint introduced **zero** new flags.

- **Compatibility paths must be deleted, not left alive.** Dual ownership (a fallback + the canonical path) is the expensive failure mode — it doubles the surface and hides regressions. "Extract → prove identical → delete the old owner" is the loop; the deletion is the point.

- **Runtime ownership is now explainable.** Each surface region maps to one owner (Route VM, a runtime hook, or the renderer). A new engineer can answer "where does this data come from and who owns it" without spelunking a 7,800-line component.

- **Future runtime work should begin with ownership, not components.** Start from "which ownership domain is wrong," map current vs canonical owner, then move + delete. Do not start from "this component is big" — size is a symptom, ownership is the cause.

---

## 4. Runtime Principles (canonical)

These are the standing rules for all future runtime work:

1. **Runtime ownership over component ownership** — reason about who *owns* state/fetch/identity, not which file renders.
2. **Route VM first** — first-paint truth is server-composed into the Route VM.
3. **Runtime Services second** — cross-cutting behavior (fetch, save, perspective) lives in canonical runtime hooks/services, consumed by surfaces.
4. **Surface Renderer third** — the page/component is a consumer that renders owned state; it does not own runtime.
5. **Delete after parity** — extract, prove identical, then delete the old owner. No dual ownership.
6. **Runtime gets smaller over time** — the score (owners, providers, gates, fetches, flags) trends down.
7. **Every implementation batch removes runtime** — if a batch deletes nothing after parity, ask why.
8. **Do not introduce duplicate runtime ownership** — one owner per domain; a fallback is a migration step, never an end state.

---

## 5. Next sprint sequence (recommended)

Only when product experience flags a concrete need:
1. **Queue summaries / bootstrap** → into `useWorkUnitQueueRuntime` (with runtime verification; bootstrap-sequenced).
2. **Queue lane ownership** (selection/filters/URL sync) → a queue-identity owner.
3. **KPI ownership** → fold placements into the bootstrap/Route VM (eliminates the residual snapshot refinement).
4. **Reveal coordination** → page delegates the coordinated reveal to the canonical gate.
5. **Settings runtime** → separate surface, its own ownership map.

Until then: runtime changes should be **incremental, intentional, and ownership-driven** — not a rediscovery exercise.
