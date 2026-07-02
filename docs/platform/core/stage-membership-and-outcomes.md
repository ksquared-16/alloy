# Stage Membership & Outcomes — Platform Doctrine

**Status:** Canonical (July 2026, Enrollment Alignment sprint)
**Companions:** `business-process-system.md`, `status-and-state-system.md`,
`../modules/business-process-execution-platform.md`,
`../../canonical-status-architecture.md`

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

- Membership is the persisted stage position: `stage_key` on the process subject
  (`opportunities.stage_key` for family-track stages, `opportunity_customer_members.stage_key`
  for child-track stages).
- `stage_key` is written by exactly two things: **intake** (initial stage) and **outcome
  execution** (`move_to_stage` targets). Nothing else writes it — not PATCH routes, not queue
  code, not surfaces.
- `membership_criteria_v1` on a stage declares subject grain (case / child / candidate),
  count unit, and location scope. It contains **no status lists** — the old
  `included_status_keys` / `included_disposition_keys` pattern re-derived membership from
  durable state and drifted (three divergent copies existed at audit time).
- Queue lanes and Work View scoping are *derived* from stage membership. A queue definition
  filters on `stage_key`; it is generated output, never independently-authored status filters.

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

A field exists once, on its canonical entity. The process determines what it means:
`start_date` on an enrollment participation is the requested start during inquiry and the
committed start once `approve_enrollment` copies it to the agreement. Duplicating a field to
express process context (`desired_*`, `requested_*`, `*_interest`) is prohibited.

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
