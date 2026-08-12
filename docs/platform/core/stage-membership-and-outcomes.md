---
owner: platform
status: canonical
last_reviewed: 2026-08-11
supersedes: []
---

# Stage Membership & Outcomes — Platform Doctrine

**Status:** Canonical (July 2026, Enrollment Alignment sprint)
**Companions:** `business-process-system.md`, `status-and-state-system.md`,
`../modules/business-process-execution-platform.md`,
`../../platform/core/data/status-architecture.md`

This doc resolves the ownership questions the earlier docs left open: how records belong to
stages, what outcomes do, and where readiness sits. The Enrollment Process is the reference
implementation; every future process (Annual Registration, Summer Camp, Classroom Transfer,
Billing, Attendance, HR) reuses the same engine.

## The ownership chain (frozen)

```
Entity        owns durable truth            (children, families, leads — no duplication)
Process       owns operational meaning      (a child participates in an Enrollment Process)
Stage         owns operational work         (grain, expected work, outcomes, requirements)
Work          owns operational detail       (progress; changes constantly)
Outcome       produces durable state        (the only mutation mechanism)
Durable State is small                      (open/closed; waitlisted/enrolling/enrolled/…)
Work View     consumes processes            (lens: stages, filters, grouping, sort, surface refs)
Surface       owns presentation             (rows, cards, panels, action placement)
```

If a design decision violates this chain, stop and redesign it.

## Stage membership

A stage answers **"what belongs here?"** — operational membership, not queue membership and
not status ownership.

- Membership is the persisted stage position on the **correct subject grain**:
  - Context/family track: `opportunities.stage_key` (shared/context stage)
  - Participant track: `process_instances.stage_key` (Enrollment children; null = inherit context)
- Legacy `opportunity_customer_members.stage_key` is compatibility only — not the membership owner.
- `stage_key` is written by exactly two things: **intake** (initial stage) and **outcome
  execution** (`move_to_stage` targets). Nothing else writes it — not PATCH routes, not queue
  code, not surfaces.
- `membership_criteria_v1` on a stage declares subject grain (case / child / candidate),
  count unit, and location scope. It contains **no status lists** — the old
  `included_status_keys` / `included_disposition_keys` pattern re-derived membership from
  durable state and drifted (three divergent copies existed at audit time).
- Queue lanes and Work View scoping are *derived* from stage membership **and** Effective
  Process Position (below). A queue definition filters on stage; it is generated output, never
  independently-authored status filters.

## Effective Process Position (derived)

**Effective Process Position** is a **read/projection** concept. It is **not** another persisted
status, stage column, process instance, or Business Process runtime.

### Invariants

1. **Persisted subject stage remains authoritative.** Outcome execution writes the correct grain.
2. **Effective participant stage** = explicit participant stage when present; otherwise the shared
   context stage when the process participation contract declares `inheritsContextStage`.
3. **Context/family rollup** is the composition of effective stages of **authorized, scope-filtered**
   participants. Homogeneous → one stage label. Mixed → compact multi-stage label (e.g.
   `Lead · Waitlist`). It is **not** durable state and must not be written back to
   `opportunities.stage_key`.
4. **Access filtering precedes rollup.** Unauthorized participants must not contribute stages or
   locations to the rollup a principal sees.
5. **Work Views use effective participation at their configured grain:**
   - **Case/context grain:** the context belongs when at least one visible participant is
     effectively in that stage, **or** (no participants yet) the shared context stage matches.
     Raw `opportunities.stage_key` alone must not keep a family in Lead after every participant
     has branched to Waitlist.
   - **Child/candidate grain:** each effective participant in that stage is its own row/count.
6. **Queues remain projection/selection.** Focus Panel remains the universal operator surface and
   displays rollups for mixed stage/location without inventing a fake family location.
7. **Context-level Mission (What's Next)** is derived from currently applicable **authorized
   effective participant/shared tracks**. Persisted shared stage does **not** override explicit
   participant divergence. Inventory / catch-all Work Views (empty `opportunity_stage` lens) do
   **not** impose a stage Mission unless their configured predicates explicitly provide one.
   Homogeneous effective stages → one Mission. Mixed → compact multi-track Mission summary.
   Canonical resolver: `web/lib/process/engine/resolveContextMissionStages.ts`.

Canonical implementation: `web/lib/process/engine/effectiveProcessPosition.ts` (generic) consumed
by Work View evaluation, queue enrichment, and Focus Panel header chips. Do not add
Enrollment-only branches inside the engine resolver.

## Outcomes

Outcomes are the mechanism that changes durable truth:

```
Work completed → Outcome selected (human confirms)
  → outcome rule targets execute atomically:
      • durable state write   (status/outcome_status + close_reason)
      • stage move            (stage_key)
      • follow-on work        (create_next_work / reopen_work)
      • attention             (create_needs_attention)
  → stage membership updates → Work Views refresh
```

- Statuses change *only* through outcome execution (including the typed status domains the
  execution runtime invokes for domain actions). There is no operator-facing generic
  "Update Status".
- Terminal stages (`closed`, `enrolled`, `closed_withdrawn`) have no work templates — they
  are membership buckets for durable state, deliberately workless.

## Work

Work carries operational progress. Anything phrased as an activity — Confirm Tour, Conduct
Tour, Follow Up, Send Reminder, Collect Paperwork, Extend Offer — is a work template on a
stage, spawned on stage entry, completed with an outcome. It is never a status.

### What's Next presentation (stage vs work)

Focus Panel **What's Next** is a presentation surface over stage membership + Current Work. It
must answer: where is the subject now, what matters about that state, what should the operator
do next — without inventing a second lifecycle inside the stage.

- **Headline** prefers the configured **stage label** (process position) over the open work
  template label. Open work remains Current Work / work progress when it differs.
- **Status chip** prefers durable membership/disposition labels already on subject truth when
  present (for example Waitlisted), not work-progress wording that implies a stage ladder.
- **Sequential progress** is only for operational flows the operator has entered (at least one
  completed step) or for repeated-attempt work. Optional concurrent stage-work templates with
  nothing completed yet must not render as `1 Review… → 2 Offer…` mini-lifecycle.

Canonical presentation: `buildWhatsNextCardPresentation` /
`buildWhatsNextProgressPresentation` under `web/lib/adminV2/runtime/focusPanel/currentWork/`.

### Command-result sufficiency (completion)

When an integrated capability publishes an objective result (for example a successful
communication send), Current Work may auto-complete **only** under this precedence:

1. **Explicit** work-template `completion_policy.sufficient_command_results` wins — including
   overrides such as reply-required.
2. If that list is absent, a **platform-owned default** may apply for recognized canonical
   work templates only (enrollment `contact_family`: a successful registered communication
   send satisfies the contact attempt with outcome `left_message`).
3. If neither exists, **infer nothing** — unknown or custom work never auto-completes from a
   send. Failed sends never satisfy a success-mapped requirement.

Operators never configure or see raw runtime result keys in the UI; those keys are engine
vocabulary. Attempt cadence (`min_attempts` / window / repeat) remains independently
operator-editable and does not imply sufficiency.

### Close-record classification

An outcome rule is `close_record` **only** when supported by an explicit close semantic or a
target status resolved as terminal/closed for the **correct status domain** (lead/case vs
child enrollment), via the canonical closed-status resolver
(`isConfiguredClosedStatus` / `isClosedStatusKeyForEntity`). Setting a non-closed status
without a stage move (for example status=`open`) is **not** a close. True closes still
require a configured closed status; when none exist, validation is operator-language guidance
(warning) that names the outcome, stage, and status domain — never a blocking picker error
that cannot be cleared from the current surface.

## Readiness vs membership (disambiguated)

- **Readiness** gates *actions and outcomes*: "is required information complete for this
  next action?" Computed, never persisted. Field requiredness is process/stage
  configuration (`requirement_policy` scoped by stage), applied to canonical fields.
- **Stage membership** is *position*: where the record is. It is not gated by readiness;
  an unready record is still in its stage — it surfaces as a readiness gap and, if
  configured, an attention reason.

## Work Views and Surfaces

- Work Views own: included stages, grouping, filters, sorting, surface assignment.
- Work Views do not own: columns, row layouts, presentation — those belong to Surfaces
  (Surface Builder authored, referenced by key).
- Work View filters refine *within* process stages (e.g. "Program = Infant"); they never
  re-implement stage membership from raw durable state.

## Fields

A field exists once, on its canonical entity. Process context does **not** justify
duplicating the same fact under `desired_*` / `requested_*` aliases when one owner
already holds it.

**Enrollment assignment date authority** (Enrollment Assignment & Effective Dates):

| Concept | Authority | Notes |
|---|---|---|
| **Requested Start** | `process_instances.metadata.start_date` (participation) | Family preferred timing. Never rewritten by commitment. |
| **Enrollment Date** | Process-instance `metadata.enrollment_date` stamped by configured paperwork-completion outcome (`stamp_enrollment_date` target) | Not an arbitrary typed date. `approve_enrollment` may invoke the same stamp as **compat only** — it does not own the meaning. Opportunity metadata is a compat projection only. |
| **Start Date** | Earliest qualifying committed `schedule_assignments.start_date` for the child | Fallback: enrollment agreement `start_date` when no OA row exists. Later supersedes do not rewrite the original Start Date. |

Requested care (`requested_days_per_week`, preferred `weekdays`) remains proposal intent.
Proposed vs committed schedule assignments use `commitment_kind` on `schedule_assignments`
(see `docs/platform/planning/assignment-proposed-commitment-authority.md`).
Quote/estimate snapshots on the assignment proposal are commercial proposals — never ledger charges.

Configuration controls labels, visibility, requiredness, and timing. Code owns calculation,
org scope, permissions, audit, and the requested / proposed / committed distinctions.

## Anti-patterns (audit findings this doctrine forbids)

| Anti-pattern | Replaced by |
|---|---|
| Status explosion encoding work (`tour_scheduled`, `registration_pending`) | Stage + work templates |
| Stage membership derived from status lists | Persisted `stage_key` |
| Queue membership as separate authored config | Derived from stage membership |
| Status filters as membership criteria | `membership_criteria_v1` (grain + scope only) |
| Generic `update_status` operator action | Domain verbs → outcome execution |
| Stages that own surfaces/layout | Surface refs assigned by Work Views |
| Stages with no work ("Qualification") | Fold the work into the stage that owns it |
