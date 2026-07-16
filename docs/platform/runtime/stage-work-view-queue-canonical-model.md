---
title: Stage · Work View · Queue — the canonical operational model
status: proposed
supersedes: []
---

# 0 — The finding

The platform has **two independent predicate systems over the same rows**, joined by a heuristic.

| | Work View | Queue lane |
|---|---|---|
| Where | `departments.metadata.lifecycle_builder_v1…work_views_v1` | `work_units.queue_definition` |
| Authored or generated | authored (`persistWorkViewsV1.ts:54`) | **generated — from STAGES** (`lifecycleStageWorkUnitQueueSync.ts:72`) |
| Filter language | `equals · is_any_of · date_between …` (`workViewsConfigV1.ts:18`) | `status · field · date · assignment · exception` (`queueDefinitionSchema.ts:5`) |
| Fields it may filter on | Stage, Campus, Program, Room, Needs Attention | **`{status_key, created_at, updated_at}`** (`QueueService.ts:223`) |

Neither generates the other. Their only link is `compat_queue_key`, bound by
`byLabel ?? byKey ?? lanes[index] ?? lanes[0]` (`workViewsRuntimeConvergence.ts:53`) — a **positional
fallback that binds view #3 to lane #3 with no semantic relation**.

Consequences, all observed:

1. **A Work View can express predicates a lane structurally cannot.** A stage-scoped lens must execute
   through a status-only allowlist. When status collapsed to `{open, closed}`
   (`20260711000100`), stage lanes lost the vocabulary to express themselves →
   `LIFECYCLE_QUEUE_FILTERS_EMPTY` (`lifecycleStageQueueFilters.ts:76`). **This is the empty New Leads
   queue.** It is not a seed bug; it is the model.
2. **Membership is computed three ways**: lane filters in `QueueService`; Work View predicates via
   `computeOperationalProjection`; and a third hand-written predicate in `workUnitLeadMembership.ts:39`,
   whose own header records that they *"diverged because each invented its own predicate."*
3. **A pill and its Work View can disagree by construction** — the pill counts a *lane*
   (`lifecycleWorkUnitShellPills.ts:17` → `loadQueueDefinitionBundle`), the view counts a *predicate*,
   and `compat_queue_key` may have married them by array index.

This is why successive sprints keep rediscovering the same confusion. It is one defect, not many.

---

# 1 — Canonical Product Model

Derived from frozen doctrine and existing code, not invented.

```
Business Process
  └─ defines STAGES            durable process position; declares GRAIN
       ↓
STAGE MEMBERSHIP               process_instances.stage_key
                               written ONLY by outcome execution / intake
       ↓
WORK VIEW (= the LENS)         the operator's navigation tier; PRODUCT CONFIGURATION
                               predicates · sort · layout · default-subject strategy · ONE grain
       ↓
OPERATIONAL PROJECTION         THE ONE EVALUATOR — evaluates the lens exactly once
       ↓
  ├─ QUEUE ROWS                (Operational)
  ├─ DEFAULT SUBJECT           from the same evaluated page (Operational)
  ├─ FOCUS PANEL ELIGIBILITY   (Operational)
  └─ COUNTS / PILL COUNTS      (SETTLEMENT — must never gate commit)
       ↓
FOCUS PANEL                    the committed subject within the active lens
       ↓
OPERATIONAL COMMIT
```

**The Queue is not a tier. It is the execution of a lens.**

## 1.1 Stage — durable process position

Exactly one of the candidates is true: **durable process position**. Evidence:

- `20260711000100`: *"Stage is explicit process state, written by outcome execution — never derived
  from status lists."* Column comment: *"Membership owner for stage cohorts."*
- Engine owns it agnostically: *"Subject · context · stage · state"* (`process/engine/index.ts:2`).
- Runtime owner is `process_instances.stage_key` (`20260713000000`); `opportunities.stage_key` is the
  family/context stage and coalesce fallback.

Everything else is **consequence**:
- Stage is **not status**. Status is durable relationship truth (`open|closed`). Three axes
  "never collapse into one status model" (`enrollment-process-runtime.md:56`).
- Stage is **not queue membership**. Membership is *computed from* stage.
- Stage is **not presentation**.

## 1.2 Work View — product configuration, and the operator's navigation tier

- Doctrine already says so: *"Queue lanes are execution/runtime; stages are lifecycle/governance.
  Neither is the operator's primary navigation tier — **Work Views are**"*
  (`docs/platform/core/business-process-system.md:108`).
- Slug precedence `work_unit_key → work_view → queue_lane_key` (`resolveWorkUnitByRouteSlug.ts:164`)
  makes the view outrank the lane.
- The **Constitution** treats the lens as an attention scope: *"Across lenses — 'show me Waitlist
  instead' — a new set of work must be prepared."*
- The **Kernel** keys preparation by `(scope, target, **lens**, principal, tenant)`.

A Work View therefore owns:

| Belongs in a Work View | Today |
|---|---|
| stage scoping | via predicates ✓ |
| field predicates · match | ✓ (`workViewsConfigV1.ts:41`) |
| sort | ✓ |
| surface / layout assignment | ✓ (`queue_layout_id`, `focus_panel_layout_id`) |
| **default subject strategy** | ✗ missing — required by U-P4 |
| **grain (exactly one)** | ✗ lives on the *stage*, not the view |
| grouping | ✗ (lane-only today) |

## 1.3 Queue — runtime execution, generated

**Runtime.** Not product. It must be **generated from the Work View**. Today it is generated from
**stages** — that is the fork. Both cannot be true; the lane must stop being an authored predicate
system and become the projection's output.

## 1.4 Operational Projection — one evaluator

`operationalProjection.ts` **already declares this doctrine**; `aggregateWorkViewTotals.ts:1`
honours it (*"same base rows + same evaluator ⇒ identical counts"*). Pills do not
(`business-process-system.md:197` admits the conversion is the outstanding follow-up).

Yes — the same projection must produce rows, counts, subject membership, and Focus Panel eligibility.
**But phase differs from source**: the Constitution assigns *"every count, every metric"* to
**Settlement**. One evaluator, one page; counts are emitted from it but **must never gate Operational
Commit**.

## 1.5 Subject grain — one per Work View

The rule **already exists**: *"A flat Work View cannot mix grains — each row type produces a different
queue entry shape"* (`stageGrainV1.ts:128`); Rule G-1 *"A surface cannot be grain-ambiguous"*
(`operational-grain-doctrine.md:52`). Grain is **not presentation**: it is *"a property of the
underlying database row"* (`:42`).

It is unenforced: authoring-time advisory with three bypasses (catch-all, unscoped views, no runtime
guard), while `computeOperationalProjection:267` *actively builds* dual-grain counts
(`primaryGrainKind: family` + `supportingGrainKind: child` — "3 Families · 5 Children" over rows of a
single shape).

**Constitutional rule to bind:**

> A Work View declares exactly one grain. Its rows, its default subject, its counts, and its Focus
> Panel subject are that grain. A view whose stages disagree on grain is invalid configuration, and is
> rejected at author time **and** refused at runtime.

Blocking sub-problem: **three vocabularies for one idea** — `case|child|candidate`
(`queueMembershipV1.ts:8`), `family|child|person|account|work_item` (`stageGrainV1.ts:8`), and
`family|child` count buckets. `case` and `family` are the same grain under two names, bridged ad hoc
(`operationalProjection.ts:223`). These must unify before grain can be enforced.

---

# 2 — Current Product Model (as built)

```
Stages ──generates──► Queue lanes ──(status-only allowlist)──► rows ──► pills
   │                       ▲
   │                       │ compat_queue_key: byLabel ?? byKey ?? lanes[index] ?? lanes[0]
   │                       │
   └──────► Work Views ────┘ ──► computeOperationalProjection ──► counts (unused by pills)
                                       │
            workUnitLeadMembership ────┴──► a THIRD predicate
```

---

# 3 — Gap analysis

| # | Mismatch | Why it exists | Runtime depends? | Product depends? | Resolution |
|---|---|---|---|---|---|
| G1 | Lanes generated from **stages**, not Work Views | lanes predate Work Views | yes (rows) | no | **Product changes**: projection evaluates the lens |
| G2 | `OPPORTUNITY_FIELD_ALLOWLIST` = 3 columns | injection guard written pre-stage | yes | no | widen to a typed predicate surface incl. stage, or retire with G1 |
| G3 | `compat_queue_key` positional binding | migration bridge | yes | no | delete with G1 |
| G4 | Membership computed 3× | each invented its own | yes | no | one evaluator; delete the other two |
| G5 | Pills read lanes | acknowledged debt (`:197`) | no | no | **Runtime absorbs** — pills are Settlement |
| G6 | 3 grain vocabularies | organic | yes | yes | unify; then enforce |
| G7 | Dual-grain counts by design | built to paper over G6 | no | yes | invalid once G6 lands |
| G8 | Two stage columns + coalesce | PI migration incomplete | yes | no | **Runtime waits** — separate migration |
| G9 | Focus Panel always case-grain (G-5) | deliberate | yes | yes | **product decision** — legitimate hop, or grain violation? |

---

# 4 — Runtime implications

**Where K2 begins is already frozen.** Preparation is keyed by
`(scope, target, **lens**, principal, tenant)`.

- K2 consumes the **Work View (lens)** — not Stage, not Queue.
- Stage is an *input to the lens definition*, resolved inside the projection.
- Queue is the projection's *output*, never K2's input.
- U-P3 already states it: *"Queue truth: the **active lens's rows** … from Records via the queue
  evaluator."* U-P4: default subject from *"the same evaluated page."*

So D1's provisioning answer calls **one evaluator, once, for the active lens**, and returns
U-P1…U-P7. Counts are excluded from the answer (Settlement, §1.4).

---

# 5 — Required BEFORE D1

1. **Decide G1** (below). Everything else follows.
2. **Unify the grain vocabulary** (G6) — one enum, one meaning.
3. **Answer G9** — is the case-grain Focus Panel hop legitimate?

# 6 — Required INSIDE D1

- Provisioning answer = lens → projection → rows + default subject + operational composition.
- No lane bundle on the critical path; no counts in the answer.
- Grain invariant asserted server-side: rows, subject, and panel agree or the answer is an honest error.

# 7 — Required AFTER D1

- Convert pills to the projection (Settlement).
- Delete lane predicates, `compat_queue_key`, and `workUnitLeadMembership`'s third predicate.
- Retire `opportunities.stage_key` coalesce (G8).

---

# 8 — Is implementation obvious after this?

**Yes.** The canonical model is already latent in the codebase — `operationalProjection.ts` declares
the one-evaluator doctrine, `business-process-system.md:108` already names Work Views the navigation
tier, and the Kernel already keys preparation by lens. Nothing needs inventing. What is required is a
**deletion**: the lane must stop being a second predicate system.

The single decision that unblocks everything is **G1**.
