# BP V2 — Slice 2 implementation contract: domain-backed Work Views

Status: **ready for authorization** (prepared in Slice 1A, 2026-10-20, against staging `4d795dcf0`).
Primary lane: `business-process`. Secondary: Runtime (provisioning answer, totals), Configuration
(publication), Staff/Scheduling and Financials (read-only adapters).

## 1. Decision — the smallest extension

**Dispatch on the process, not on the view.** A `domain_projection` process already declares its
authority (`process_model_v1.domain`). A Work View on such a process names one **closed-vocabulary
`projection_key`** owned by that domain's registry. There is no `row_source_v1`.

| Option | Verdict | Why |
|---|---|---|
| `row_source_v1` on every Work View | Rejected | Restates the domain the process already declares; is a second membership authority available to staged lifecycles, which publication would then have to refuse anyway; widens Enrollment's surface for no Enrollment benefit. |
| New queue service / QueueService entity types | Rejected | QueueService is only on the legacy lane-count path; the Work View answer never calls it. Extending it would duplicate the Work View population path. |
| `assignment` / `charge` durable record types | Rejected | Child, person and household records already exist with a full panel; the authoritative source id rides in row context instead. |
| Domain condition fields in the Work View condition registry | Deferred | V1 domain views are predicate-free: the registered projection IS the predicate. Publication refuses `filters_v1` on projection views. |
| **Process-level dispatch + per-view `projection_key`** | **Chosen** | Valid only under `domain_projection`; refused elsewhere at publish; Enrollment code paths never see it. |

## 2. Shared substrate (Slice 2 proper)

| # | Change | Touchpoint |
|---|---|---|
| S1 | `projection_key` on `WorkViewConfigV1Stored` (owned key, parsed, round-tripped) | `web/lib/lifecycle/workViewsConfigV1.ts` (`parseWorkViewRow`) |
| S2 | Publish: allow `work_views_v1` on a projection **only** with a registered `projection_key`; refuse `filters_v1`, `compat_queue_key`, `row_grain_v1` mismatch; refuse `projection_key` on staged lifecycles | `web/lib/businessProcesses/configuration/businessProcessPublishValidation.ts` (replace the Slice 1 `work_views_v1` refusal) |
| S3 | Projection registry: `domain → projection_key → adapter` | new `web/lib/businessProcesses/projections/registry.ts` |
| S4 | ONE cohort reader both counts and rows call: `loadDomainProjectionCohort({ domain, projectionKey, orgId, scope, asOfYmd })` → `{ rows, total, truncated }` | new, beside S3 |
| S5 | Host work unit for a projection department: one `work_units` row, key `projection_host`, `queue_definition` `{version:2, entity_type:"domain_projection", queues:[{key:"all",label:"All"}]}`; created idempotently by the publish path when a projection first publishes views | `web/lib/config/queueDefinitionV2Runtime.ts` (accept `domain_projection`); publish route post-step; `web/lib/workspace/pickDeptPipelineWorkUnit.ts` (`pickDeptWorkViewHostWorkUnit` third branch) |
| S6 | Counts: domain branch **before** `classifyRequestedWorkViews` and before the stage-less lane path | `web/lib/queues/evaluateWorkViewTotalsForGroup.ts` (~:166–179; must never reach `getWorkUnitQueueItems` at ~:301) |
| S7 | Rows: domain branch before `resolveLensRowGrain` | `web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts` (~:1157–1350; before the `grain_unsupported` refusal at ~:1361) |
| S8 | Scope on the request: `gate.dim` + selected site carried into the answer for the domain branch | `ProvisioningRequest` (~:641); `web/lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts` |
| S9 | Row identity: `QueueRowSubjectRef.type` gains `child \| person \| household`; `QueueRowContext` carries `projection_source` | `web/lib/adminV2/runtime/queueRow/queueRowOperationalContext.ts`; `web/lib/workUnits/lifecycleSubjectContracts.ts`; `workUnitSurfaceModelFromSnapshot.ts` (hard-coded `"opportunity"` at ~:212, ~:414) |
| S10 | Focus Panel: in the existing panel boundary, a `person`/`household` subject (or a child with no family opportunity) renders `DurableRecordSurface` instead of `InlineOpportunityFocusPanel` — same card grid, no second runtime | `web/components/presentation/workUnit/FocusPanelSurface.tsx` (~:193) |
| S11 | Process-scoped Focus Panel variant: pass `businessProcessKey: process.key` server-side and thread it client-side | `workUnitProvisioningAnswer.ts` (~:2686); `InlineOpportunityFocusPanel.tsx` (~:886–897) |
| S12 | Landing: a projection with published views emits `workQueues`; the Slice 1 unavailable state remains for one without | `web/lib/admin/buildOperatorLifecycleLanding.ts` |

Unchanged and reused: `resolveWorkViewCanonicalLocation`, `resolveWorkUnitByRouteSlug`,
`/api/admin/queue-view-totals`, `useWorkViewTotals`, `ProvisionedWorkUnitSurface`,
`DurableRecordSurface` + `/api/admin/durable-record`, the card registry, the action registry.

## 3. Row identity contract

```
subject:  { type: "child" | "person" | "household", id }   // customer_member_id | persons.id | customers.id
label:    string
source:   { kind: "schedule_assignment" | "charge" | "collection_attempt" | "subsidy_variance", id }
context?: { enrollmentAgreementId?, opportunityId? (only from the agreement, never guessed), siteLocationId }
projection: { businessProcessKey, workViewId, projectionKey }
```

The subject is the canonical record; opening it never rewrites identity. `source.id` is carried for
context and card focus only.

## 4. V1 grains and the reference projection per domain

Slice 2 ships the substrate plus **one** reference projection per domain — enough to prove the chain,
not the catalog.

| Domain | Reference projection | Grain | Source | Opens |
|---|---|---|---|---|
| Assignments | `current_assignments` | child (via agreement → `customer_member_id`) and staff `person` | `schedule_assignments`, predicate on **dates** (§5) | durable child / person panel with the existing `scheduling` ("Assignments") card |
| Billing | `charges_needing_review` | household (`customers`) | `resolveFinancialWorkQueue` drafts with `awaitingPostingReason ∈ {review_required, post_failed}` | durable household panel + `financials` card |

Read-model prerequisites (each adapter, not the domain service, may not restate domain rules):
- **Roster** (`buildAssignmentRosterReadModel`) needs one site and has no `.range()` (PostgREST 1000-row
  silent cap). The adapter pages with `.range()` up to the cohort cap and filters by status-agnostic
  date predicates; it validates the site against the caller's allowed sites (the scheduling GET does not).
- **Financial work queue** applies `.limit()` **before** the site-visibility filter, so its counts are
  page-bounded. The adapter must read the full eligible set (or the reader gains scope-before-limit).
- **Household Billing panel**: `financials` card grains gain `household`; household composition gains a
  `financials` entry.
- **Access**: the Billing branch enforces `fin.read` itself (the answer route is capability-`pending`);
  `readUnrecognizedCollections` is org-wide and is NOT a V1 source.

## 5. Temporal model for Assignments (verified 2026-10-20)

| Subject | Mechanism | Effect |
|---|---|---|
| Child primary, per agreement | unique index `ux_schedule_assignments_one_operational_primary_child` (`20261022120000`) | at most **one** operational (planned/active/ending) row, whatever the dates; a future change supersedes the present row **now** |
| Staff primary, per person | overlap trigger `validate_schedule_assignments_primary_overlap` only (`20261023120000`) | many operational rows, **non-overlapping**; present + future coexist |
| Secondary (both) | none | concurrent by design |

Consequences for predicates: "in effect on day D" is `start_date ≤ D AND (end_date IS NULL OR end_date ≥ D)`
over **all** rows including `superseded` (a superseded child row with a future `end_date` is still where the
child is today). Never "latest row", never status-only. Staff "current" = the operational row whose
interval contains D; a future staff row is not current. Guard: `web/tests/access/temporalCardinalityAsymmetry.test.ts`.

## 6. Invariants and acceptance gates

1. **Enrollment unchanged** — existing suites green against base (same reds); Enrollment rows, counts,
   navigation and Focus Panel byte-identical in the Slice 1 render harness; no Enrollment process carries
   `projection_key`.
2. **One read model per projection** — counts and rows both call `loadDomainProjectionCohort`; a test
   asserts `total === rows.length` for every reference projection when not truncated.
3. **Count/list parity under the same filters and scope** — fixture with two sites and a site-restricted user.
4. **No silent cap** — cohort cap explicit; `truncated: true` renders as "≥N", never N; adapter pages with `.range()`.
5. **Scope before exposure** — the domain branch filters by `gate.dim` and selected site before any row
   or count is produced; Billing refuses without `fin.read`.
6. **Explicit unsupported** — unknown `projection_key`, staged process with `projection_key`, or a
   projection view on a host without the domain branch → refusal frame, never Enrollment rows, never 0.
   QueueService refuses `entity_type: domain_projection` with its existing 501.
7. **Read-only projections** — adapters issue SELECTs only (asserted by a stub that fails on any write).
8. **One Focus Panel runtime** — durable subjects render through `DurableRecordSurface` inside the
   existing panel boundary.
9. **No Financials/Scheduling mutation semantics change** — no changes under `web/lib/financials/**`
   writers or `schedule_assignments` writers (temporal-truth writer census unchanged).
10. **Hosted** — certified on a verified isolated QA org (see Director decision), not on Firefly.

Performance: one cohort read per request per view group; cohort cap 2000 (matching Financials'
existing cap) with `truncated`; the answer's existing page cap (100) applies to rows; no additional
round-trips on the Enrollment path (span parity in `evaluateWorkViewTotalsForGroup` timings).

## 7. Migrations, rollout, rollback

- **Migrations: none expected.** `work_units.queue_definition` has no DB constraint on `entity_type`;
  the host row is data written by the publish path. Re-verify before implementation.
- **Rollout:** inert for every tenant without a projection process (deployed staging has none). Nothing
  changes for Firefly.
- **Rollback:** revert the PR. Host work units left behind are inert (no views route to them without
  the branch); archive with `is_active = false`.

## 8. Known pre-existing defect to schedule first (Runtime lane)

The provisioning answer loads Work View **rows** with no record/site scope
(`workUnitProvisioningAnswer.ts` ~:1384, admin client) while **counts** apply
`resolveQueueRecordScopeConstraints`. A site-restricted user may see rows outside their sites in an
Enrollment Work View. Verified in code; not measured on deployed (the only deployed QA identity has
`site_scope = all`). Recommended as a bounded Runtime fix before or alongside S8 — it changes
Enrollment rows only for restricted users, which is the point.

## 9. Deferred

All other Assignments/Billing views (Ending Soon, Upcoming, Unplaced, Proposed/Incomplete, Payment
Exceptions, Funding Variances, Payments Due/Overdue); domain condition fields; tile Active/Overdue counts;
Work Items for non-lead subjects; Schedule Conflicts and Coverage Risks; period-over-period variance.
