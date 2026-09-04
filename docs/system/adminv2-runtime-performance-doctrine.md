---
owner: runtime
status: current
last_reviewed: 2026-09-04
supersedes: []
---

# AdminV2 runtime performance doctrine

**Path:** `docs/system/adminv2-runtime-performance-doctrine.md`  
**Status:** **Certified baseline** — deployed staging `bcd20f004`, 2026-09-04. Implementation detail for reveal/queue/drawer gates.
See **§ Final deployed certification** at the end of this file for the measured baseline, the canonical owner map, and the guard matrix.  
**Platform summary:** **`platform-performance-doctrine.md`** (Passes 1–3, sidecar deferral).  
**Supplements:** `docs/archive/2026-06-superseded-system/workspace-system.md`, `docs/archive/2026-06-superseded-system/record-system.md`, `docs/system/drawer-doctrine.md`, `docs/archive/2026-06-execution/operating-doctrine.md`  
**Historical context:** `docs/sprints/archive/05_2026/adminv2_reveal_doctrine.md`, `docs/sprints/archive/05_2026/completed/adminv2_performance_closeout.md`  
**Sprint closeout:** `docs/sprints/archive/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`  
**Next phase (backend only):** `docs/sprints/archive/06_2026/adminv2_backend_query_payload_optimization_phase.md`

---

## Purpose

AdminV2 should feel like **one continuous operating surface**. Loading, reveal, cache ownership, and known-empty semantics are **infrastructure** — not styling. UI and configuration work must not regress them.

**Before changing any AdminV2 UI component that affects drawer, queue, route, tabs, layout, or actions**, read this doctrine. Do not alter reveal behavior unless the task is explicitly a runtime/performance task.

---

## Runtime doctrine (platform)

| Principle | Meaning |
|-----------|---------|
| **Composed reveal over staged reveal** | Above-fold surfaces mount together after a coordinated gate — not section-by-section assembly. |
| **Payload-first drawer opening** | Drawers open from composed payload readiness (`drawer_primary` / composed person payload), not empty frame + late section fetch. |
| **Known-empty doctrine** | A completed lookup that found nothing is **ready**; missing data is **not ready**. Never treat `null` as empty. |
| **Cache-first warm navigation** | Session caches, prefetch inflight reuse, and bootstrap snapshots may accelerate warm paths; they must not change reveal contracts. |
| **Request ownership / stale response guards** | Every async apply path carries a request signature or generation token; stale responses are ignored. |
| **Queue lane hold doctrine** | While a lane is loading or rows are held, suppress false empty states. |
| **No false empty state doctrine** | “No records” appears only after the **current** lane request settles empty. |
| **Prefetch is allowed; partial reveal is not** | Background prefetch and idle hydrate are fine; above-fold partial paint is not. |
| **Loading/performance is infrastructure** | Reveal gates, cache keys, and readiness predicates are protected — not incidental UI details. |

Code anchors: `web/lib/adminV2/workspaceRevealGate.ts`, `web/lib/admin/drawer/composedDrawerPayload/`, `web/lib/adminV2/runtime/contract/`, `web/lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts`, `web/components/presentation/workUnit/QueueRegion.tsx`.

> **Anchor drift, corrected 2026-09-04.** This line named `useWorkUnitSurfaceRuntime.ts`, which no
> longer exists — Presentation Runtime V2 replaced it with `useCommittedWorkUnitSurfaceRuntime.ts`,
> whose own header describes what it superseded. The gate table below named three modules of which
> only `workspaceRevealGate.ts` exists. A doctrine whose pointers have rotted cannot protect anything;
> check the anchors when you touch this file.

---

## Route doctrine

**Canonical operator URLs (browser):** `/workspace`, `/workspace/work-unit/:workUnitSlug`, `/workspace/work-unit/:workUnitSlug/:recordId` — see **`routing-doctrine.md`**.

**Internal filesystem:** `app/adminV2/workspace/**` (rewrites serve canonical URLs).

**Compat (removed in PRV2):** former `/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]` page and `QueueBlock` — replaced by Presentation Runtime V2 (`WorkUnitSurface`, `QueueRegion`). See **`docs/platform/governance/runtime-ownership-migration-map.md`**.

### Allowed

- Coordinated loading gate (`*PageLoadingGate`) until above-fold contract is ready.
- Composed route reveal — shell + above-fold body together.
- Quiet below-fold refinement after reveal (KPI values, deferred counts, idle prefetch).
- Sticky valid data during refresh (stale-while-revalidate).

### Forbidden on warm navigation

- Shell-first, body-later assembly (header/actions/queue appearing in waves).
- Clearing valid current data before replacement data is ready.
- Section-owned above-fold skeletons replacing composed content.
- Independent oper-region spinner → panel swap on above-fold.

### Cache key scope

Preserve cache keys by **org / department / work-unit / queue / view scope**. Changing a cache key requires updating determinism tests (see § Required tests).

| Surface | Gate module | Console filter |
|---------|-------------|----------------|
| Workspace | `workspaceRevealGate.ts` | `[workspace-reveal-gate]` |
| Department | *(no module — console filter only)* | `[dept-reveal-gate]` |
| Work unit | `workUnitPageRevealPolicy.ts` + `drawerVmPrewarmScheduler.ts` | `[wu-reveal-gate]` |

`deptRevealGate.ts` / `workUnitRevealGate.ts` do not exist and have not for some time; the work-unit
reveal window lives in `drawerVmPrewarmScheduler.ts` (`beginWorkUnitPrimaryReveal` /
`endWorkUnitPrimaryReveal`).

---

## Queue doctrine

Work-unit queue lanes (**Presentation Runtime V2:** `QueueRegion` + `useWorkUnitSurfaceRuntime`).

| Rule | Contract |
|------|----------|
| Unloaded queue rows never mean empty | No rows + loading = cold load or hold; only settled zero rows mean empty. |
| “No records” timing | Shown only after `queueRegionRenderState` resolves to `"empty"` (settled zero-row lane). |
| Queue-lane hold | Prior rows stay visible during refetch (`queueRegionRenderState` → `"rows"` while `loading && hasRows`). |
| Cold first load | Row skeleton only when `loading && !hasRows` (`"cold-loading"`). |
| Stale lane responses | Ignored via `queueRequestSeq` apply guard in `useWorkUnitSurfaceRuntime`. |
| Active lane beats prefetch | User-selected Work View / queue key wins over background refresh. |
| Work View switch under loaded lane | Must not flash row skeleton when prior rows exist (queue-lane hold). |

Selection authority: Work View pill strip + `useWorkUnitSurfaceRuntime` queue key resolution — URL `?queue=` (+ bucket aliases) → API `focus_queue` → bootstrap ownership → active pill. Legacy: `web/lib/adminV2/workUnitQueueSelection.ts`.

---

## Drawer doctrine

Surfaces: opportunity (parent/lead), person (parent), child person, job, and registered drawer entities via **`AdminEntityDrawerLegacy`** (shell router: `AdminEntityDrawer.tsx` → dynamic legacy import). Focus Panel / Presentation Runtime V2 owns inline record surfaces on work-unit hosts.

### Composed reveal

- Drawer frame, header, and above-fold body reveal **together** — not section-owned stagger.
- Above-fold sections must declare a **runtime contract** (`web/lib/adminV2/runtime/contract/`).
- An above-fold section may:
  - **block reveal** until its contract is satisfied,
  - **be hidden** until below-fold / lazy,
  - **render from complete payload** on first paint.
- Above-fold sections may **not** independently skeleton, resize, or flip values after first paint.

### Header and navigation stability

- Header / action rail remains stable across tabs and back navigation.
- **Back to Lead / Edit on Lead** must restore enriched opportunity snapshot immediately (stack restore / snapshot cache — do not cold-fetch empty header).
- Person drawer readiness is **context-aware**: person id + surface + required sections (`evaluateComposedPersonDrawerPayload`).

### Entity expectations (current baseline)

| Drawer | Opens |
|--------|--------|
| Opportunity (lead) | Composed — bootstrap + `drawer_primary` + coordinated above-fold model |
| Person (parent) | Composed — composed person payload + section requirements |
| Child person | Composed — same pipeline with child surface requirements |

Prefetch (`prefetchOpportunityDrawerOnRowIntent`, `prefetchPersonDrawerSnapshot`) may warm caches; it must not weaken composed readiness gates.

---

## Known-empty doctrine

Distinguish **lookup completed** from **has content**.

| Signal | Meaning |
|--------|---------|
| Key **missing** / `undefined` | Not loaded — not ready for known-empty completion |
| Key **present**, value `[]` | Loaded and empty — **ready** |
| Key **present**, value `false` | Loaded and false — **ready** |
| Domain confirmed absent on full payload | **Ready** (e.g. no medical surface exists) |

### Examples (valid completion)

- Empty household links — ready once household lookup completed.
- Empty addresses — ready once address lookup completed.
- No medical data — ready once full payload confirms no medical domain.

### Anti-patterns

- Treating `null` queue rows as “no records”.
- Showing empty UI while fetch in flight.
- Confusing “has content” with “lookup completed”.
- Section-local “No records” before composed payload evaluation finishes.

Modules: `evaluateComposedDrawerPayload`, `evaluateComposedPersonDrawerPayload`, `composedDrawerPayload/sectionRequirements.ts`, opportunity drawer section registries.

---

## Cursor / AI guardrail

### UI changes **may** alter

- spacing, typography, labels
- section order (below-fold or non-contract sections)
- visible fields (config-driven)
- component styling

### UI changes **may not** alter

- payload readiness predicates
- request ownership / apply guards
- cache keys
- stale response guards
- route reveal gates
- drawer composed reveal gates
- queue empty-state semantics
- known-empty predicates

### When touching runtime-sensitive files

1. Read this doctrine and `docs/sprints/archive/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`.
2. Run the **required test suite** (§ below).
3. Do not merge UI-only PRs that change reveal timing without explicit runtime task approval.

Enforced in repo: `.cursor/rules/adminv2-runtime-performance.mdc`.

---

## Runtime-sensitive files (protected)

Changes to these files require doctrine review and the runtime test suite:

| Area | Paths |
|------|--------|
| Drawer shell router | `web/components/admin/AdminEntityDrawer.tsx` |
| Drawer runtime owner | `web/components/admin/AdminEntityDrawerLegacy.tsx` |
| Entity drawers | `web/components/admin/entity/*Drawer*` |
| Opportunity drawer UI | `web/components/admin/opportunity/*` |
| Work-unit surface (PRV2) | `web/components/presentation/workUnit/WorkUnitSurface.tsx` |
| Queue region (PRV2) | `web/components/presentation/workUnit/QueueRegion.tsx` |
| Work-unit runtime hook | `web/lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts` |
| Composed payload | `web/lib/admin/drawer/composedDrawerPayload/*` |
| Drawer reveal | `web/lib/admin/drawer/*Reveal*` |
| Runtime contract | `web/lib/adminV2/runtime/contract/*` |
| Queue workspace | `web/lib/workspace/*Queue*` |
| Opportunity drawer open | `web/lib/admin/opportunityDrawer*` |
| Person prefetch | `web/lib/admin/prefetchPersonDrawerSnapshot.ts` |

Related (often co-changed): `web/lib/adminV2/*RevealGate.ts`, `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts`, `web/lib/workspace/adminV2WorkspaceSessionCache.ts`, `web/lib/admin/opportunityDrawerOpenCoordinator.ts`, `web/lib/admin/opportunityDrawerIntentPrefetch.ts`.

---

## Required tests

Run when touching runtime-sensitive files:

```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
```

Also recommended for broader drawer/queue edits:

- `tests/admin/opportunityDrawerOpenCoordinator.test.ts`
- `tests/admin/opportunityDrawerIntentPrefetch.test.ts`
- `tests/admin/prefetchPersonDrawerSnapshot.test.ts`
- `tests/adminV2/workUnitRevealGate.test.ts`
- `tests/adminV2/runtime/adminV2RuntimeContract.test.ts`

Before merge on TypeScript changes: `cd web && npm run typecheck`. When tests or scripts change, also run `npm run typecheck:tests`. See `docs/platform/governance/typescript-performance.md`.

---

## Instrumentation (do not remove)

Dev perf marks and console filters are part of the contract:

- `[wu-reveal-gate]`, `[dept-reveal-gate]`, `[workspace-reveal-gate]`
- `[wu-bootstrap-perf]`, `[drawer-primary-perf]`, `[prefetch.adminv2]`
- `web/lib/perf/adminV2PerfLog.ts`

Use these to diagnose regressions — not to mask partial reveal.

---

## Sprint closeout summary

- **Runtime consistency is demo-ready.** Workspace → dept → work-unit and drawer open paths behave as one composed surface.
- **Drawer and queue behavior are stable** enough to move forward on product/configuration work.
- **Remaining work is backend query and payload optimization**, not core runtime architecture (see next-phase backlog).
- **Future UI changes must preserve this doctrine.**

---

## Final deployed certification (2026-09-04)

Certified against **deployed staging `bcd20f004`** (Vercel `dpl_G29K4atk2dj3nDEBEyCfHfBHypmP`,
Supabase `ikaxilmwmrmbagoidedu`), driven with real pointer input on the managed QA session.

**Certification is a DEPLOYED verdict.** Local dev and local production are instrumentation and
controlled A/B only. A number measured on localhost has never been evidence about this product —
see § Measurement pitfalls.

### 1. Operation classes — never mix them

A single "how fast is it" number is meaningless because these four have different owners and
different budgets. Measure and report them separately.

| Class | What it is | What dominates it |
|---|---|---|
| **Cold document entry** | New document, cold client cache | TTFB + server compose + full card fan-out |
| **Warm document entry** | Document load with warm caches | Server compose, little client work |
| **Warm in-app transition** | Router move, shell preserved | Client compose; must be **0 document loads** |
| **Row selection** | Subject change inside one Work Unit | Per-subject VM + self-fetching cards |
| **Work View change** | Lens change on one Work Unit | K2 answer for the new lens; must not remount the host |

### 2. Canonical owner map

One truth, one owner. A second producer of the same truth is a defect even when it agrees.

| Concern | Canonical owner |
|---|---|
| Work Unit committed world | `useCommittedWorkUnitSurfaceRuntime` (from K3 Focus) |
| Provisioning answer | `workUnitProvisioningAnswer` / `composeProvisioningAnswerForRoute` |
| Subject of attention | Committed Focus — **never** the drawer store |
| Queue ordering (candidate grain) | `sortPlacementCandidateQueueRows` |
| Manual position application | `applyCohortLocalManualPositions` |
| Override → snapshot merge | `applyPlacementCandidateOverrides` |
| Section rank + group range | `assignWaitlistCandidateRuntimePositions` |
| Manual-position write | `upsertPlacementPinOverride` / `releaseManualPositionOverrides` |
| Candidate uniqueness | `placementCandidateSubjectUniqueness` (+ lifecycle hook) |
| Focus Panel body identity | `bodyRenderKey` = the committed subject |
| Speculative prewarm | `drawerVmPrewarmScheduler` |
| Roster (site/day) | `RosterWorkspace` — one authoritative request per genuine site/day |

### 3. Intentional duplication (allowed, and why)

- **Speculative prefetch** keyed identically to the real demand read, so the click consumes it
  instead of starting new work. It must defer to the primary reveal.
- **Self-fetching cards** for data the provisioning answer does not carry.
- **Explicit refresh after a mutation.**

Anything else — same endpoint, same parameters, no operator intent — is **redundant**.

### 4. Forbidden duplicate ownership

- Two producers of the same card model.
- Client-side re-derivation of placement order or of the legal manual-position range.
- A second subject owner (this cost 4418 duplicate requests of 4421 once already).
- A render `key` derived from resolving data — see § Focus Panel lifecycle.

### 5. Focus Panel lifecycle: `reserved` → `self_loading` → `ready`

A reserved cell **holds space**; it does not draw a card. `self_loading` is **not** ready. `ready`
telemetry must match meaningful DOM.

**The body is keyed on the committed subject, never on resolving data.** Keying it on
`displayVm.entity.id` remounted the whole panel on every child subject, because the child Attention
id and the family opportunity id are different by construction — measured as WU-08/WU-09 mounting
twice per cold entry and financials/attendance/health each fetching twice with identical parameters
3773 ms apart. The pending → enriched transition is a **prop change, never a remount**.

### 6. Summary-density doctrine

A summary card shows a summary. Bounded rows, a truthful total, a truthful remainder, and a way to
reach the full collection. No unbounded collection in a summary, no nested scroll trap. The
17-child case renders 3 rows + "14 more children" + "View children →".

### 7. Placement: section rank vs cohort ordinal

Two different numbers, and conflating them has now caused two separate defects.

- **Section rank** (`runtime_position` / `runtime_position_total`) — where the row sits in the list
  being read. A section may contain several cohorts.
- **Cohort ordinal** (`pin_ordinal`, bounded by `runtime_group_total`) — where a candidate sits
  inside its own cohort. This is what the manual-position command takes.

A pin is a **position**, not a precedence score: it must not be a `sort_tuple` component, because a
per-row value cannot know how many unpinned rows precede it. Splicing it into the tuple compared an
ordinal against `bucket.priority_order` and collapsed every ordinal below that constant to one
answer. The control's selectable range must come from `runtime_group_total`, never from the section
label.

### 8. Operations: one authoritative roster request

Initial open = 1. A genuine site or day change = 1. A satisfied site/day is **not** refetched.
Week must not issue the Day roster request. Sub-lenses (Rooms / Staff / Assignments) reuse.

### 9. Workspace / App Router continuity

In-workspace transitions perform **zero** document loads and preserve the shell **by node identity**
— assert the node, not a selector re-match. Crossing into Organization may legitimately use a
different shell.

### 10. Measurement pitfalls proven during this programme

Every one of these produced a wrong conclusion at least once here.

1. **Dev-mode timings are not product findings.** The `/organization` "1343 ms" was Turbopack
   on-demand compilation. Deployed: ~438 ms.
2. **Sequential `await`s do not share a clock.** Measuring milestones one after another makes each
   clock start when the previous resolved. Record milestones against **one** `t0` in-page.
3. **Arm the observer before the gesture.** A MutationObserver installed after the click misses the
   feedback it is supposed to measure and over-reports by ~1 s.
4. **A selector miss is a PROBE FAILURE, never a latency number.**
5. **Source-string tests prove a string exists, not that a path runs.** They cannot detect a
   function that is exported, imported by tests, and called by nobody.
6. **Compare failing test NAMES against the baseline commit**, never counts.
7. **Read the deployed payload, not just the DOM.** The canonical answer carries the truth the DOM
   only renders.

### 11. Regression guard matrix

| Guard | Test |
|---|---|
| Body key never derived from the VM | `tests/presentation/focusPanelBodyKeyStability.test.ts` |
| Manual position is a cohort position | `tests/orchestration/placement/cohortLocalManualPositions.test.ts` |
| Control bounded by group, not section | `tests/orchestration/placement/waitlistAdjustGroupRange.test.ts` |
| Prewarm never competes with reveal | `tests/adminV2/drawerVmPrewarmScheduler.test.ts` |
| Reveal gate cannot stay armed | `tests/runtime/revealLifecycleAndReadinessInvariants.test.ts` |
| Canonical placement order is handed over | `tests/runtime/provisioning/law36CanonicalPlacementOrder.test.ts` |

Prefer behavioural guards over source-string tests. Every guard above that asserts an ordering
carries a **positive control** — a case that fails on the pre-fix implementation. A guard that
cannot fail on the old code is not evidence.
