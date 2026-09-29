---
owner: runtime
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Enrollment Process Runtime — canonical architecture

Status: **implemented + verified on staging (PR #72 + Enrollment Process V1).** This is the authoritative
reference for how Enrollment runs at runtime. Where any other doc disagrees about ownership, this doc wins.
For the V1 implementation record, subsystem status, and freeze gate, see the
**`Enrollment Process V1 Implementation Handoff` (see `docs/sprints/completed/enrollment-process-v1/implementation-handoff.md`)**.

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

Handoff record: [`docs/archive/2026-06-handoffs/process-runtime-stabilization.md`](../../archive/2026-06-handoffs/process-runtime-stabilization.md).

## Family Enrollment Experience — composition over child journeys (September 2026)

`web/lib/enrollment/family/`. A parent with two children enrolling got two disconnected experiences:
two links, two conversations, two signatures, and the household's own facts asked twice. Every RECORD
underneath was already correctly grained — one process instance, session, link, submission, artifact
and Processing case per child — so the deficiency was the EXPERIENCE, and the fix is a composition
layer with no system of record of its own.

### The grouping authority — existing, and no schema added

`resolveLiveEnrollmentContextForHousehold` already answers "which child journeys are one family
enrolment": an Opportunity containing at least one running `process_instances` row. It refuses "the
newest opportunity" by name, because attaching a later sibling to a finished enrolment "would reopen
finished history", and it breaks ties deterministically so grouping cannot depend on row order. Being
DERIVED from process state rather than stored, the grouping survives reload, resume, one child
finishing first, Processing transitions and payment with nothing to keep in sync.

Three candidates were rejected, each for a stated reason:

| Rejected | Why |
|---|---|
| the session's `crm_snapshot` opportunity | D-95's migration exists precisely to stop a CRM Opportunity being load-bearing for runtime correctness |
| `form_packet_sessions.packet_instance_id` | that mechanism groups by sharing ONE session between recipients — it MERGES sessions, which the grain rule forbids for process-governed Enrollment. It remains correct for a hand-composed packet |
| recency, first child, client arrays, name matching | the context resolver already refuses these |

### What it may not do

It composes and never merges child process instances, sessions, links, submissions, artifacts,
Processing cases or financial obligations, and stores no rollup. Every figure is quoted from the
child's own projection (`resolveEnrollmentParticipantProgress`, one call per child, so the family list
and the child's own screen cannot disagree). There is **no family submission**: the authoritative
completion actions are child-scoped, and a family-level submit would be a second finalization
authority over work that already has one. Family state is derived, one incomplete child stays visibly
incomplete, and the shell stays open while any sibling is still going.

### Shared versus per-child

Declared in code as `FAMILY_FACT_OWNERSHIP`, with a reason per concept, because the real risk of a
family shell is OVER-deduplication — asking once for something whose evidence belongs separately to
each child.

| Ownership | Concepts |
|---|---|
| Reused canonical | guardians, home/mailing address, emergency contacts |
| Shared once | other children in the household, handbook acknowledgment + signature (per recipient), per-family fee |
| Repeated per child | health/allergies/providers, immunization, routines/eating/personality, placement + schedule + location, consent, per-child fee |

Health, immunization and consent stay per child because each answer is its own evidence on its own
submission; deduplicating them would attach one child's medical record to another.

### Sibling visibility is a bounded boundary

A participant arrives on ONE child's token. The family view returns a sibling's NAME and PROGRESS and
never their answers, uploads or documents — a token minted for one child's session is not authority
over another child's evidence. The focused child is read from the session's own snapshot, never from
the query string, so a caller-supplied id cannot make one family's link ask about another child.

### Financial composition

The shell holds no balance. Its financial slot consumes the Enrollment Financial Bridge's projection;
it performs no gross, responsibility, expected-funding, collectible or balance calculation. The
stored-method side will consume canonical `payment_methods` in a follow-up — see
`docs/platform/modules/billing-financials-platform.md`.

## The enrollment fee as a requirement (September 2026)

A stage could require a field, a form, or its own work. It could not require money. The fee therefore
lived wherever somebody had put a currency question on a form, which made it a typed ANSWER rather
than an obligation: nothing was owed, nothing could be paid, and nothing could tell a family what was
left. `financial` is the requirement kind that closes that, and the chain behind it runs
configuration → applicability → charge-definition reference → canonical obligation → canonical
Financials projection → what the family is shown.

### The ownership line, stated once

Enrollment owns exactly three decisions:

1. whether a fee applies to this stage,
2. which charge DEFINITION applies, by key, and
3. whether it is owed once per family or once per enrolling child.

Financials owns everything else: amount, discounts, responsibility, expected funding, what is
collectible now, payments, applications, outstanding, corrections. Forms owns no fee at all, and
Admissions v12 is fee-free by Director decision.

The requirement therefore references `charge_template_key` and **structurally cannot carry a price**.
`parseRef` builds a closed `{ kind, charge_template_key }` rather than spreading the stored row, so a
configuration row carrying `amount_cents` parses to a ref with no amount to read and serializes back
without it. That is asserted, not assumed: a stored `7500` is absent from the parsed result.

### Grain is `scope`, not a second enum

`record` is the family record; `each_child` is once per enrolling child. Every other requirement kind
is already read through `RequirementScope`, and a parallel `per_family | per_child` would have been a
second vocabulary for one truth — where the first disagreement between the two is a billing bug. A
child with no enrollment agreement is SKIPPED rather than folded into the household, because charging
the family instead loses the attribution per-child grain exists for, and does it silently.

### Two things that must never read as good news

- **A configured, due fee with no charge is not satisfied.** `worst([])` answers SATISFIED, which is
  right for "every obligation is settled" and catastrophic for "there are none". It returns
  `ATTENTION_REQUIRED` and says a charge has not been created yet.
- **A missing or invalid charge definition is not a $0 fee.** It is `ATTENTION_REQUIRED` with the
  configuration error named. A family is never told a fee is settled because pricing failed.

A **cancelled** fee is also distinguished from a **free** one. A reversed obligation is excluded from
every figure, which leaves gross at zero and makes the two arithmetically identical; they are not the
same fact, and conflating them sends an operator to fix pricing that was never wrong.

### Dueness, idempotency, and the read-only twin

Dueness is resolved from canonical current state — every non-financial requirement outstanding — with
the financial requirement excluded from its own prerequisites so it cannot block itself. It is not a
browser event. Charge creation delegates to `writeTemplateDraftCharge`'s own idempotency and is not
keyed to `today`, so tomorrow does not mint a second fee; corrections delegate to
`createChildcareCorrection`, whose corrected-once rule the database enforces. Enrollment keeps no
ledger of its own.

`readEnrollmentFeeProjection` is the read-only twin the family surface uses: it creates, posts and
corrects nothing, and its tests inject a Supabase fake whose `insert`/`update` throw. A family-scoped
fee read once per child is deduped by `requirement_id`, or a two-child household would be shown
double what it owes.

**Reading an existing fee must narrow in the DATABASE.** The first implementation selected every
charge on the billable source and filtered in JavaScript; PostgREST caps a response at 1000 rows, so
a family with a longer history could return a page that did not contain the fee, and the projection
would then claim no charge existed for one that did. The charge-definition key is matched in the
query. Certification on the real database found this; unit tests could not.

### Authoring

A director configures this in the stage requirement surface beside forms and work
(`StageFinancialRequirementsEditor`) — definition, once per family or once per enrolling child,
required — with no raw ids and no JSON, and not in Forms Studio. The price beside each option is READ
from Financials and never copied, and only the current version of a definition lineage is offered. A
key with no active definition is called out rather than smoothed over.

There is no Pay button. Participant checkout does not exist yet, and a button that does nothing is
worse than its absence.
