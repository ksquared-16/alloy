# Process Instance → Operational Agreement Materialization

Status: implemented (PR #72). Migrations: none (all tables already exist).

## Decision

Process Instances own the **journey**. On enrollment completion the process **materializes** the durable
operational truth and then records provenance back on itself. It does **not** own the operational facts.

```
Lead(opportunity)=context → Child(customer_member)=subject → Process Instance=journey
   → (Enroll Child outcome) → MATERIALIZE:
        child_enrollment_agreements   (durable relationship)
          ├── child_placements        (program / room / site)
          └── schedule_assignments    (schedule pattern)
   → Attendance / Billing / Scheduling consume the Agreement (never the Process Instance)
```

## Materialization contract

`materializeEnrollmentFromProcessInstance(supabase, { processInstanceId, orgId, userId, completedStageKey?, todayYmd?, emitEvents? })`

1. Loads the process instance; confirms `process_key='enrollment'`, `subject_type='child'`, `context_type='opportunity'`.
2. Resolves enrollment facts (see source order).
3. Delegates to the shared core `applyChildEnrollmentMaterialization` → creates/reuses the durable trio.
4. Stamps provenance back on the instance: `metadata.enrollment_agreement_id`, `metadata.materialized_at`,
   `state='enrolled'`, and `stage_key=completedStageKey` if provided. **No operational facts are copied onto
   the instance** — only provenance pointers + journey markers.
5. Idempotent: reuses an existing agreement/placement/schedule instead of duplicating; re-stamps provenance.

Scope convenience: `materializeEnrollmentForChildScope(supabase, { orgId, opportunityId, customerMemberId, userId })`
resolves the instance id from (opportunity + child) then calls the canonical function.

## Source-of-facts order (Task 3)

Per field, first non-empty wins; provenance is returned in `fact_sources`:

1. `process_instance.metadata` (canonical / draft-collected) — `site_location_id|location_id`,
   `program_category_id`, `room_location_id|program_room_cohort_key`, `schedule_pattern_id`, `schedule_type`,
   `start_date`, `end_date`, `billing`, `funding`.
2. `placement_candidates` (waitlist demand) — room cohort key, `start_date`, `site_id`.
3. `opportunity_customer_members` (OCM) — **temporary migration fallback only.**
4. `opportunities.location_id` — site fallback. `start_date` default = today.

The core never reads OCM; fact resolution is the only place OCM is consulted, and only as fallback.

## Outcome integration (Task 4)

The `update_child_enrollment_status` outcome, on disposition `enrolled` and when
`isChildcareOperationalEnrollmentV1EnabledForOrg`, calls `materializeEnrollmentForChildScope`
(non-blocking, idempotent — a failure never rolls back the state transition; it is retryable).

The legacy admin **Approve Enrollment** path (`executeOperationalEnrollmentHandoffFromApprovedOpportunity`)
remains temporarily but now delegates to the **same** shared core `applyChildEnrollmentMaterialization`
(sourcing facts from OCM). One materialization implementation, two fact sources.

## Billing / funding (Task 5 — not overbuilt)

Billing plan + funding source have no dedicated child-assignment table. They are stored on
`child_enrollment_agreements.metadata.{billing,funding}` for now. **Promotion path:** when billing wiring
lands, promote to explicit columns or a `child_billing_assignment` facet (only if queried); the consumption
pipeline (`consumption_events → resolved_obligations → charges`) already references the agreement/placement
as `billable_source`.

## UI availability & field sources (Task 6)

Durable facts are already exposed by the read model:
- `buildOperationalEnrollmentReadModelForMemberSite(supabase, orgId, customerMemberId, siteLocationId)`
- `buildOperationalEnrollmentReadModelForAgreement(...)`

These return the agreement + current placement (program/room/site/start) + schedule assignment for a child —
the source the Focus Panel child section should read **once materialized**. Pre-completion (no agreement yet),
surfaces continue to show collected/process facts (the process-instance overlay from the prior slice). The
**Process Instance is never an operator-facing object** — operators see Lead (context), Child (subject), and
the durable Enrollment/Placement/Schedule facts.

### Surface Builder field sources (to register when the display rewire lands — next slice)

| Field source | Table | Operator-facing fields |
|---|---|---|
| Enrollment Agreement | `child_enrollment_agreements` | Enrollment status (active/pending/ended), start date, end date, site |
| Placement | `child_placements` (current, non-superseded) | Program, Room, Site, placement start |
| Schedule Assignment | `schedule_assignments` (current) | Schedule pattern / schedule label, schedule start |

These are **documented, not yet coded** as registry entries — the field registry entries are added in the
Focus Panel display-migration slice (architecture implementation order step 3), to avoid double-sourcing
program/schedule from both OCM and the durable model in the same release.

## OCM disposition (Task 7)

Not dropped in this slice. Still used by: Create Lead bridge write; the participation-detail read/edit path
(`inquiryChildFieldEdit` → OCM PATCH); the Focus Panel participation overlay fallback; and as the **fallback
fact source** in materialization. After the Focus Panel display migration reads the durable model, OCM's
remaining runtime roles collapse to the fallback read — then: backfill agreements from OCM → drop Create Lead
bridge write → remove the OCM fallback → drop the table.

## Removal plan (recap)

1. (this slice) Materialize from the process instance; unify legacy approve path on the shared core.
2. Migrate Focus Panel / participation-detail reads to the durable read model.
3. Migrate participation-detail edits to the durable model / process draft.
4. Backfill agreements/placements/schedule assignments from OCM (one-time).
5. Drop Create Lead OCM bridge write; remove the OCM fallback source.
6. Drop `opportunity_customer_members`.
