---
owner: runtime
status: canonical
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

---

## Re-measurement (2026-09-06) — deployed staging `606e77d21552b0`

Deployed SHA **matches** `origin/staging` exactly. Vercel `dpl_HAvA1pkLFoR9J31mCA2h4eW5TZhq`, Supabase
`ikaxilmwmrmbagoidedu`, QA identity `qa-slot1-product@example.com`, 3 cold samples, one revision for
the whole matrix. Verdict: **PASS**, zero invariant failures, zero band warnings.

The certified baseline (`bcd20f004`) is **deliberately unchanged**. This run is recorded in
`baseline.json` → `measurement_history` as trajectory, not as a new floor — see below for why.

### What held

Every hard invariant: financials/attendance/health each **1 read per subject intent**; **0**
card-bearing remounts; **0** redundant duplicates; Operations **1** roster request on open and **0**
refetch on a satisfied site/day; all four in-app transitions **0 document loads** with the shell
preserved **by node identity**. `waitlist` reported **DELEGATED**, not silently passed — the fix in
§ Probe integrity working as intended on a real run.

### What improved

API requests 48 → **45**. Focus Panel waves 4 → **3**. Organization landing useful 951 → **735 ms**.
Shell 881 → **850 ms**.

### A regress signal that did not survive contact with a second measurement

This run recorded `rows` / `first useful card` p50 at **4690 ms** against a 2496 ms baseline (+88%)
and flagged it as a REGRESS signal worth investigating.

**It did not reproduce.** Re-measured hours later on `178b46995` — 3 cold samples, runtime-identical
code, the only intervening change from this lane being test- and doc-only — `rows` p50 came back at
**2874 ms**, +15% on baseline. Across three sample sets (2496 / 4690 / 2874) the 4690 is the
outlier, and the honest reading is host and network variance, exactly what § Hard invariants vs
performance bands warns bands are sensitive to.

Both the observation and its retraction are kept, because the lesson is the durable part: **a single
3-sample p50 is not enough to call a regression.** Raising it was right; concluding from it would
have been wrong, and would have sent someone hunting a defect that was not there. The band was not
widened and the baseline was not advanced — the correct handling either way.

`largest_delta_px` also moved 489 → 587 (band_max 700) and held there across both runs; grid growth is
unchanged at +777px, still the top geometry opportunity.

### Final certified measurement — deployed staging `178b46995` (post-merge)

`origin/staging` == deployed SHA == `178b46995aa14f29dd54924497f76ced5438e4fc`, Vercel
`dpl_39B8nx733jf8WBUt2KVdgDE3MmwJ`, 3 cold samples, one revision for the whole matrix.
**RUNTIME CERTIFICATION — PASS**, zero invariant failures, zero band warnings.

| | Baseline `bcd20f004` | Final `178b46995` |
|---|---|---|
| ttfb p50 | 129 ms | 150 ms |
| shell p50 | 881 ms | 862 ms |
| rows / first-useful p50 | 2496 ms | 2874 ms |
| API requests | 48 | **45** |
| financials / attendance / health per subject intent | 1 / 1 / 1 | **1 / 1 / 1** |
| card-bearing remounts | 0 | **0** |
| redundant duplicates | 0 | **0** |
| roster open / satisfied refetch | 1 / 0 | **1 / 0** |
| in-app transitions: document loads | 0 | **0 (4/4)** |
| shell preserved by node identity | yes | **yes (4/4)** |
| Focus Panel waves | 4 | **3** |
| scroll displacement | 0 px | **0 px** |

Tier 3 `waitlist-manual-position-truth.cert.spec.ts`: **PASS** (72 s) — write → canonical read →
rendered order → reload → clear → restore, tenant returned to its starting truth.

Worth recording: an earlier attempt on this same revision returned `api requests=0` and the harness
**FAILED with PROBE FAILURE** rather than passing on nothing. That is the post-fix gate behaving
correctly on a genuinely expired session — the defect this release fixes, caught in the wild.

### Tier 3 — first actual execution

`waitlist-manual-position-truth.cert.spec.ts` **PASSED** against deployed staging (72 s): write →
canonical read → rendered order → reload → clear → restore, with the tenant returned to its starting
truth. This spec had never been run before. Two environment facts make it operator-invoked rather
than routine, and both are gaps, not properties: `certification/playwright.config.ts` requires
`@playwright/test` but there is **no root `node_modules`** (it resolves only via `NODE_PATH` into
`web/node_modules`), and its `setup` project performs an interactive sign-in, so it must be run
`--no-deps` against a session supplied by the governed restore.

---

## Runtime performance is part of the platform contract

Not a past project. Whenever new product functionality is introduced anywhere that can reach the
Work Unit, Focus Panel, cards, placement, Operations, Workspace or Organization runtime, the change
must either **run the applicable certification subset and pass**, or **prove its dependency graph
cannot reach the certified runtime**. There are no silent exemptions: a change that can reach this
runtime and certifies nothing is not exempt, it is uncertified.

### Canonical command

```bash
npm run cert:runtime:deployed                      # final acceptance (deployed staging only)
npm run cert:runtime:local                         # deterministic pre-merge
npm run cert:runtime -- --changed <files>          # subset selection via the trigger matrix
npm run cert:runtime -- --subset focus-panel,operations --samples 3
```

Source: `scripts/runtime-certification/` — `runtimeCertification.mjs` (entry, evaluation, report),
`run.mjs` (driver), `measure.mjs` (primitives), `ownership.mjs` (owner map + duplicate classifier),
`baseline.json` (certified baseline, invariants, bands). It orchestrates the primitives; it does not
define a second way to measure anything.

### Trigger matrix

| Change touches | Certification subset |
|---|---|
| `lib/runtime/provisioning/**` | work-unit, focus-panel |
| `lib/queues/**` | work-unit |
| `lib/presentation/runtime/**` | work-unit, focus-panel |
| `focusPanel` / card components | focus-panel |
| `lib/orchestration/placement/**` | waitlist *(delegated — see below)*, work-unit |
| roster / scheduling | operations |
| AdminV2 shell / navigation | workspace, organization |
| shared auth / org / site context | workspace, work-unit |

Prefer graph reachability over filename lists where the repo supports it; this table is the floor,
not a substitute for judgement.

**The source of truth is `TRIGGER_MATRIX` in `runtimeCertification.mjs`; this table is its summary.**
Two hand-maintained copies of the same routing WILL drift, so read the code when they disagree.

**Not every subset is measured by this harness.** `waitlist` is routed here but certified by
`certification/playwright/waitlist-manual-position-truth.cert.spec.ts` (tier 3), because deployed
waitlist mutation truth already has an owner and a second producer of the same verdict is exactly
what § Forbidden duplicate ownership prohibits. `SUBSET_OWNERSHIP` records who measures what, and a
delegated subset can never carry a PASS on this harness's authority — requesting only delegated
subsets is a probe failure that names the runner you actually needed.

### Enforcement tiers

1. **Fast PR guards** — the deterministic tests in the guard matrix above. Cheap, always run.
2. **Heavier certification** — local-production browser run when runtime-sensitive code changes.
3. **Final acceptance** — deployed-staging certification for milestone/runtime releases. Only this
   tier can grant acceptance.

Do not make every small PR run a full browser suite when dependency selection can narrow it safely.
Do not let a runtime-sensitive change merge with no certification at all.

### Hard invariants vs performance bands

`baseline.json` separates them deliberately, and the distinction is load-bearing:

- **Hard invariants** are laws — one Focus Panel subtree per entry; exactly one authoritative
  financials/attendance/health read per subject intent; one roster request per new `(site,date)` and
  none when already satisfied; zero document loads on in-app transitions; shell preserved by node
  identity; canonical Waitlist ordering across reload. A violation fails at any latency.
- **Performance bands** come from a measured distribution on real hardware over a real network. A
  breach is a signal to investigate. Do not tighten a band until it fails on a slow morning — that
  is how a team learns to ignore its own harness.

### Probe integrity

The harness fails on an unmeasured run before it consults any threshold. This is not hypothetical:
on its first deployed run it reported PASS having measured nothing, because the QA session had
expired and it saw zero API traffic. A harness that passes when it measured nothing is worse than no
harness, because it will be believed. `null` means NOT MEASURED — never "fast".

It then happened a second time, in a worse form, and the gate could not see it. Every check was
written as `if (results.<key>)`, which cannot notice a subset that produced **no results object at
all**. `waitlist` was a declared subset with no driver in `runCertification`, so
`npm run cert:runtime -- --subset waitlist` opened no page, measured nothing, found zero failures
and printed **PASS with exit 0** — for the one subset the trigger matrix routes placement changes
to. A blind spot in a gate is not a gap in coverage; it is a false green, and it is worse than the
thing it replaced.

The gate now asks the other question first: *for every subset that was requested, did anything come
back?* Three failures are unconditional — a requested subset that measured nothing, an unknown
subset, and a run where nothing was measured here at all. A hard invariant declared in
`baseline.json` that neither `evaluate` asserts nor `INVARIANTS_DELEGATED` assigns to a named runner
is also a failure: three had been declared and consulted by nothing, which is how a baseline entry
comes to be quoted as evidence for a property no one checks.

The harness is itself certified by `web/tests/runtime/certification/runtimeCertificationProbeIntegrity.test.ts`,
which had no predecessor — the thing that gated everything was the only untested component in the
system. Its positive control removes the gate and asserts the verdict flips back to `pass: true` on
an unmeasured run, so the test provably catches the defect it was written for.

### Improvement roadmap (evidence-supported only, not authorized work)

Ranked by operator-perceived impact against risk. **Nothing here is approved**; it exists so future
work starts from measurement rather than from a fresh optimisation hunt.

| # | Opportunity | Evidence | Est. impact | Risk |
|---|---|---|---|---|
| 1 | Reserved cells under-reserve: Financials +241px, Children +414px, Household +173px, so the right column expands after commit | measured, 3 runs | removes the remaining 3–4 waves and ~777px of growth | medium — geometry contract |
| 2 | `rows` / first-useful-card at p50 ~2.5s on cold entry is the largest single operator-visible wait | measured p50 | high | medium — server compose |
| 3 | Duplicate placement candidates (`infant` vs `infant_0_18_months`) split a cohort and strand pins | certified in `placementCandidateSubjectUniqueness` | correctness before latency | high — contested survivor rule; governed repair |
| 4 | Focus Panel stable at 6.4–9.3s, driven by the slowest card rather than by composition | measured range | medium | low — per-card |
| 5 | 32 pre-existing test failures across 17 files on staging | measured at `bcd20f004` | no runtime impact; erodes the signal guards depend on | low |

Do not start these inside a certification mission.

---

## Continuous improvement: certification is a floor, not a finish line

> **Certified runtime behaviour may stay consistent or improve. It must not silently regress.**

Runtime certification exists to stop decay, not to freeze the product at the first number we managed
to measure. Every runtime-affecting change is compared against the certified baseline and lands in
one of three states:

| State | Meaning | Consequence |
|---|---|---|
| **IMPROVE** | Measurably better than baseline, no hard-invariant regression | Baseline may be advanced — see § Baseline evolution |
| **HOLD** | Within the certified band | Proceeds normally; baseline unchanged |
| **REGRESS** | Outside the band, or any hard-invariant failure | **Promotion blocked** unless an explicit governed exception is recorded |

**A baseline is never rewritten downward to accommodate a slower change.** Moving the goalposts to
match a regression converts the harness into a record of what we settled for. If a slower path is
genuinely the right trade, that is a governed exception with a stated reason — not a quiet edit to
`baseline.json`.

Hard invariants and performance bands regress differently. An invariant failure is a defect at any
latency. A band breach is a signal: investigate before tightening or loosening, because a band that
fails on a slow morning teaches the team to ignore its own harness.

## Baseline evolution: proving Alloy gets faster

We should be able to answer *"is Alloy getting faster over time?"* with evidence rather than
recollection. When a change produces an operationally meaningful improvement:

1. Certify the candidate (applicable subsets, pre-merge tier).
2. Merge and deploy to staging.
3. Repeat the canonical matrix **on one deployed revision** — never pooled across environments.
4. Prove no hard invariant regressed.
5. Advance the baseline upward.
6. Record old and new measurements **with both SHAs** in `baseline.json` provenance.

Keep enough history to show trajectory, not just the current value. A baseline that only ever holds
the latest number can prove the product is healthy today but can never show whether it is improving,
which is the question worth answering.

---

## Placement / Waitlist certified contract

Placement is a certified operator surface. A change that can reach placement inherits these
obligations; they are not advisory, and "the tests exist" is not the same as being governed — the
suites below are wired into the runners named beside them, which is what makes them inescapable.

### Hard invariants

| Invariant | Certified by | Tier |
|---|---|---|
| OCM grouping changes propagate through the one canonical writer | `syncPlacementCandidateFromOcm.test.ts` | 1 |
| A cohort-local manual position persists and changes canonical order | `cohortLocalManualPositions.test.ts`, `waitlist-manual-position-truth.cert.spec.ts` | 1, 3 |
| Section rank stays separate from cohort ordinal | `waitlistAdjustGroupRange.test.ts` | 1 |
| One active candidate per canonical uniqueness contract | `certification/placement-invariants` (A, A2) | 1 (DB) |
| One active manual position per candidate/cohort/kind | `certification/placement-invariants` (B, B2) | 1 (DB) |
| DB identity back-fill and org consistency hold | `certification/placement-invariants` (C, D, D2, D3) | 1 (DB) |
| Repair executors keep idempotency and error semantics | `placementCandidateOcmRepairExecutor.test.ts` | 1 |
| Candidate ensure collision behaviour is stated, not inferred | `placementCandidateLifecycleHookEffects.test.ts` | 1 |
| Shadow mode is proven behaviourally, never by substring | `waitlistShadowModeBehaviour.test.ts` | 1 |
| Destructive cleanup stays org- and marker-scoped | `waitlistDemoCleanupScoping.test.ts` | 1 |

### Tiers

- **Tier 1 — always.** Vitest placement suites plus `certification/placement-invariants/run.sh`,
  which runs inside `scripts/certify-trust-db.sh` and therefore inside the Trust DB certification
  job. The database is the only enforcement of candidate uniqueness and the `person_id` back-fill;
  before this suite, nothing in the repository referenced those objects by name.
- **Tier 2 — local production.** `npm run cert:runtime:local` when placement-adjacent runtime
  changes.
- **Tier 3 — deployed acceptance.** `waitlist-manual-position-truth.cert.spec.ts` against deployed
  staging for milestone releases. It exists because the manual-position defect escaped every unit
  test and was only caught by write → canonical read → rendered order → reload.

### Two rules worth stating plainly

**Deciders and doers are both covered.** The gap this contract closes was not missing tests; it was
tests that exercised pure decision functions while the functions that *wrote* went untouched. A new
placement writer needs an effect test asserting the write itself — its payload, its scoping, and
whether it happens at all — not only its returned summary.

**Source-level assertions are for module-graph and forbidden-content properties only.** "There is
one writer for these columns" and "this seed file must not contain a production label" cannot be
observed at runtime. Anything with a runtime answer — a default, an ordering, a mode — is tested as
behaviour with a positive control. The pre-existing `shadow_mode` guard asserted an exact ternary
source expression; it would have survived any behavioural inversion that preserved the characters.
