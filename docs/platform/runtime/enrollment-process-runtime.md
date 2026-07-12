# Enrollment Process Runtime — canonical architecture

Status: **implemented + verified on staging (PR #72 + Enrollment Process V1).** This is the authoritative
reference for how Enrollment runs at runtime. Where any other doc disagrees about ownership, this doc wins.
For the V1 implementation record, subsystem status, and freeze gate, see the
**[Enrollment Process V1 Implementation Handoff](./enrollment-process-v1-handoff.md)**.

Enrollment is the **reference implementation** of the generic platform pattern
**Business Process → Process Instance → Stage → Work → Outcome → Materialization → Durable Operational
Facts → Attendance / Billing / Scheduling.** Nothing here is enrollment-specific except the durable-fact
tables.

As of Enrollment Process V1, Enrollment is the **first *configured* Business Process** on a generic
Process Engine (`lib/process/engine/*`) that knows only `subject / context / stage / state`. All
Enrollment specifics live in a **Definition** (`lib/process/definitions/enrollment/*`) and in
operator-authored config (`participation_v1`) the Process Builder writes. Adding another process
(Billing / Staffing / Compliance) is a new Definition + config with **zero engine edits** — proven by
`tests/process/engine/processParticipant.test.ts`.

---

## Canonical ownership chain

```
Process Builder         (/settings/processes → Enrollment → Stages)
      ↓                 operator authors the participation definition (participation_v1)
Participation Definition (config layer on lifecycle_builder_v1; resolveEnrollmentParticipationContract)
      ↓                 → engine reads a 4-field ProcessParticipationContract, nothing more
Business Process        (config: stages, work templates, outcome rules)
      ↓
Process Instance        (the running journey — process_instances)
      ↓
Stage                   (process_instances.stage_key — position in the workflow)
      ↓
Work                    (tasks attached to the instance)
      ↓
Outcome                 (outcome execution moves the instance: stage_key / state)
      ↓
Materialization         (on the "enrolled" outcome — produces durable facts)
      ↓
Durable Operational Facts
   child_enrollment_agreements   (durable relationship)
   child_placements              (program / room / site — operational fact)
   schedule_assignments          (schedule pattern — operational fact)
      ↓
Attendance / Billing / Scheduling   (consume the durable facts — NEVER the process instance)
```

Three axes never collapse into one status model:
- **Process stage** (`process_instances.stage_key`) — where in the workflow.
- **Process state** (`process_instances.state`) — the journey's disposition (waitlisted / enrolling / …).
- **Operational status** (`child_enrollment_agreements.status`) — the durable relationship (pending_start /
  active / ending / ended). Downstream reads this, never the process instance.

---

## Role definitions

| Concept | Role | Table |
|---|---|---|
| **Lead / Opportunity** | **Context** — the acquisition case the journey runs in | `opportunities` |
| **Child** | **Subject** — the durable person the journey is about | `customer_members` |
| **Process Instance** | **Journey** — one child moving through Enrollment on one lead | `process_instances` |
| **Enrollment Agreement** | **Durable relationship** — is this child enrolled, active period, site | `child_enrollment_agreements` |
| **Placement** | **Operational fact** — program / room / site (effective-dated, supersedable) | `child_placements` |
| **Schedule Assignment** | **Operational fact** — schedule pattern (effective-dated, supersedable) | `schedule_assignments` |
| **OCM** (`opportunity_customer_members`) | **Legacy compatibility only** — not a runtime owner | `opportunity_customer_members` |

`process_instances`: `process_key='enrollment'`, `subject_type='child'` → `customer_members.id`,
`context_type='opportunity'` → `opportunities.id`, `stage_key`, `state`, `close_reason_key`, `metadata`
(participation draft facts pre-materialization). Unique `(org_id, process_key, subject_id, context_id)`.

---

## Runtime responsibility — who owns what

| Responsibility | Owning runtime | Notes |
|---|---|---|
| **Create Lead** (admin + BOS/Action-UI) | `runRegisteredAction("create_lead")` → `executeCreateLeadAction` → `applyCreateLeadChildParticipation[FromIdentity]` | One shared runtime, no forked path. Creates `opportunities` (status_key=open, stage_key=lead) + one `process_instance` per child with participation in `metadata`. **Writes no OCM.** |
| **Waitlist** | outcome executor → `ensurePlacementCandidateForWaitlistedChildBySubject` | Builds `placement_candidates` from process-instance / child-subject scope (`customer_member_id`, `opportunity_customer_member_id = null`). **No OCM.** |
| **Enroll** | outcome executor `update_child_enrollment_status` (disposition `enrolled`) | Sets `process_instances.state='enrolled'`, then triggers materialization (flag `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED`). |
| **Materialization** | `materializeEnrollmentFromProcessInstance` → `applyChildEnrollmentMaterialization` | Idempotent. Facts from `process_instance.metadata` → `placement_candidates` → opportunity defaults. Produces agreement + placement + schedule assignment. Stamps `enrollment_agreement_id` provenance back on the instance. |
| **Focus Panel display** | `opportunityEntityRecord` overlays | Priority **durable (materialized) > process-instance draft (pre-mat) > OCM (legacy)**. Never shows "Enrollment Status" wording. |
| **Operational Read Model** | `operationalEnrollmentReadModel` (`buildOperationalEnrollmentReadModelFor{Agreement,MemberSite}`) | The durable-fact reader for surfaces once materialized. |
| **Participation edit** | `applyChildParticipationEdit` (`POST /api/admin/child-participation`) | Pre-materialization → `process_instances.metadata`; post → durable model. **Never creates/writes OCM.** |
| **Work Views (child-grain)** | `childGrainProcessInstanceQueue` / `ocmEnrollmentTrackQueueBuilder` | Read `process_instances` first; OCM fallback for legacy rows only. |
| **Participation contract** | `resolveEnrollmentParticipationContract` (Definition) ← `participation_v1` config | Process Builder is the source of truth; engine reads the derived 4-field contract. `inherits_context_stage` is **locked ON** (disabling it null-stages new children out of the Lead lane). |
| **Effective-stage membership** | `enrollmentEffectiveStageMembership` / engine `effectiveStage()` | `stage_key ?? context stage`; the ONE rule shared by queues + metrics. OCM canonical only if `ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK=1` (default OFF). |
| **Participant metrics** | `enrollmentParticipantMetrics` | `active_leads` / `new_leads` / `waitlisted`; `lead_count` = **deprecated alias** → `active_leads`. Same membership rule as queues. |
| **Work-View count semantics** | `workViewParticipantProjection` | `participantCount` (metric truth) vs `rowCount` (operator-visible) + `countUnit` / `countUnitLabel` per grain. |

The **Process Instance never becomes the source of operational truth.** It owns the journey and, on the
enrolled outcome, *creates or updates* the durable facts; the **Agreement** is the source of truth
thereafter.

---

## Deferred / Intentional Legacy

OCM (`opportunity_customer_members`) is **retained for compatibility** and is **not dropped**. The
following are intentional and not merge blockers:

- **Form-intake still creates OCM.** `lib/forms/intake/applyIntakeChildToOpportunity.ts` writes an OCM row
  and does **not** create a process instance. Separate capability; next migration is to make intake create
  a process instance (as admin Create Lead does).
- **OCM fallback reads.** The Focus Panel durable/draft overlays and Work-View readers fall back to
  OCM-derived values for pre-existing records with no process instance / agreement.
- **Flag-gated materialization fallback.** `ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK=1` lets
  materialization read OCM for old data. Off by default; new leads never read OCM.
- **OCM table retained.** Dropped only in a later slice **after** form-intake is migrated and legacy
  fallbacks are no longer needed.

**Planned removal path:** migrate form-intake → process instance → backfill agreements from remaining OCM →
remove fallback reads → drop `opportunity_customer_members`.

---

## Migrations (applied to staging, ledgered)

- `20260713000000_process_instances` — primitive table + indexes + RLS
- `20260713000100_process_instances_backfill_from_ocm` — backfill (no-op on empty OCM)
- `20260714000000_placement_candidate_identity_allow_customer_member` — a real placement candidate is valid
  with `customer_member_id` OR OCM id (unblocks OCM-free waitlist; synthetic rule + existing OCM rows
  unchanged)

Verified end-to-end on staging via `web/scripts/verifyBosCreateLeadEnrollment.ts` (self-cleaning): BOS/direct
share one runtime; opportunity/PI/no-OCM; Focus Panel pre-mat + durable reads; waitlist candidate without
OCM; enroll → agreement + placement + schedule assignment; sibling independence.

---

## Process Runtime V1 — operator surface convergence (complete)

Status: **closed on staging @ `3c7dd4a91` (`origin/staging`).** This section records the stabilization
sprint only — not new architecture. Enrollment remains the first **configured** process proving the
generic runtime; the guarantees below are process-agnostic where noted.

### Operator truth chain (implemented)

Every visible operator surface after record create follows one chain:

```
Create Record (create_lead)
      ↓
Process Instance (process_instances — one per configured subject)
      ↓
Queue Membership (effective stage / lane loaders — same membership rule as projection)
      ↓
Work Views (predicate filters on the operational projection)
      ↓
Queue Rows (QueueItemsResult — preview grain for the lane)
      ↓
Metrics (participant / process metrics — may use a different configured grain)
      ↓
Workspace (process tile + Work View pills consume the same totals path)
      ↓
Focus Panel (Work mode — subject focus for the selected queue row)
      ↓
Open Record (config-resolved Work Unit route — not legacy drawer)
```

**Load-bearing rules (do not re-derive elsewhere):**

| Guarantee | Implementation |
|---|---|
| **Work View totals = filtered queue truth** | Queue API applies Work View predicates via `applyWorkViewFilterToQueueItemsResult` (`operationalProjection.ts`). Requests with `limit=1` return the **true filtered total** (not a capped page length). Base fetch cap: `WORK_VIEW_QUEUE_FILTER_FETCH_CAP` (500) before in-memory predicate pass. |
| **Metrics vs queue counts may differ by grain** | Queue rows and Work View totals use the **case/opportunity row grain** returned by the queue API. Process participant metrics (`enrollmentParticipantMetrics`, OIP warm cache) use **participant/child grain** via `process_instances`. This is intentional — do not force numeric equality across grains. |
| **Operator read caches bust on queue-membership mutations** | `create_lead` invalidates server queue cache (`invalidateWorkUnitQueueItemsServerCacheForWorkUnit`), client dedupe (`bustLifecycleSiblingFetchDedupe`), and metric warm cache (`invalidateOipWarmCache` / `bustOperatorRuntimeReadCaches`). Workspace / Work Unit hooks refetch after mutations. |
| **Open Record routes into Work Unit Focus Panel** | `resolveCreatedRecordProcessContextHref` resolves `/workspace/work-unit/<workViewOrWorkUnitKey>/<recordId>` from create payload context — config-driven, not hardcoded drawer. |
| **Operational reset clears runtime instances** | `npm run dev:reset:operational-state` delegates to `enrollment_runtime_reset` and verifies empty: `opportunities`, `opportunity_customer_members`, `operational_tasks`, **`process_instances`**. Preserves all configuration (`departments`, `work_units`, status/fields/layouts/actions, locations, …). |

### V1 freeze — in scope (complete)

| Subsystem | Status |
|---|---|
| Projection / schema convergence (`operationalProjection`, `enrichRowsWithDerivedStage`) | ✅ |
| Queue membership (effective stage, child-grain PI reads) | ✅ |
| Work Views (predicate evaluator shared with projection) | ✅ |
| Queue runtime (Work View filter on queue route, exact totals) | ✅ |
| Metrics convergence (same membership rule; distinct grain documented) | ✅ |
| Workspace convergence (tile / pill totals from queue path) | ✅ |
| Open Record routing (Focus Panel Work mode entry) | ✅ |
| Runtime reset (`process_instances` included) | ✅ |

### Known limitations (future work — not blockers)

- **Form-intake** still writes OCM and does not create `process_instances` (admin Create Lead path does).
- **OCM fallback reads** remain for legacy rows without process instances (flag-gated where noted above).
- **Work View filter fetch cap** (500 base rows) — extremely large lanes may need server-side predicate pushdown later.
- **Legacy pipeline queue definitions** that filter on collapsed `status_key` rather than `stage_key` are documented in `docs/sprints/archive/07_2026/platform_reset_runbook.md` Part 5/6; stage-based doctrine path is correct.
- **Stage movement, Work Unit Header, Actions/Comms/Waitlist operator flows** — next sprint; not part of this stabilization closeout.

Handoff record: [`docs/archive/2026-06-handoffs/handoffs/process-runtime-stabilization.md`](../../archive/2026-06-handoffs/handoffs/process-runtime-stabilization.md).
