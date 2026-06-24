# Childcare operational enrollment — implementation batches (June 2026)

Status: Batches 1–5 complete; Batch 5.5 stabilization (June 2026).

## Doctrine

| Concept | Meaning |
|---------|---------|
| OCM `desired_schedule_type` | Enrollment **schedule proposal** — may be captured before tour |
| OCM placement fields | Enrollment **placement proposal** (site, program, room) |
| `child_enrollment_agreements` | Operational **contract** per child × site after handoff |
| `child_placements` | **Committed**, effective-dated placement on an agreement |
| `schedule_assignments` | **Committed**, effective-dated schedule on an agreement |
| Handoff | Converts latest valid proposal → operational rows at `approve_enrollment` |

BOS may use enrollment proposals for capacity forecasting before approval.

## Feature flags

| Variable | Scope |
|----------|-------|
| `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` | Server (handoff, APIs) |
| `NEXT_PUBLIC_CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` | Client (drawer read surfaces) |

Org opt-out: `org_settings.metadata.feature_flags.childcare_operational_enrollment_v1 === false`

## UI surfaces (flag on)

- **Opportunity drawer:** enrollment schedule/placement intent readout; committed operational readout when enrolled
- **Child drawer:** enrollment intent when no agreement; committed operational schedule when agreement exists
- **Settings → Locations:** site schedule patterns (handoff matching)

## Batch 4.5 (stabilization)

- Handoff tests: missing schedule pattern, placement without schedule proposal, multi-child partial, idempotent rerun
- Layout: legacy `schedule_attendance` widgets render operational panel when flag on; flag off leaves no empty section shells
- Proof fixtures: `buildProofChildRecord` relations/computed for enrollment status and location handles
- Schema export: run `npm run export:supabase-schema` with `DATABASE_URL` after migration apply (not run in CI sandbox)

## Batch 5 (complete — operator edit flows)

- Child drawer: placement change, schedule change, schedule withdrawal, cancel before start, mark ended
- Modal flows call existing admin APIs with supersede semantics for placement/schedule
- Agreement lifecycle: `/ending`, `/ended`, `/cancel` with status-gated actions
- Feature flag off hides panel and all edit actions

## Batch 5.5 (stabilization)

- Operator workflow events: `placement_changed`, `schedule_assignment_changed`, `agreement_ending_scheduled`, `agreement_ended`, `agreement_canceled` (`schema_version: 1`, `action_type: operator_enrollment_edit`)
- Route tests for placement/schedule supersede and agreement lifecycle POST routes (auth + service error mapping)
- Child drawer: history timeline placeholder copy (no timeline UI)
- **UX gap (next):** full placement/schedule history timeline in child drawer
- **Future job (not built):** `transitionEndingAgreementsToEnded` — daily org-local cron using `resolveOperationalEnrollmentTodayYmd`; transitions `ending` agreements when `end_date < todayYmd`; automated path should emit `agreement_ended` without `operator_enrollment_edit` action type when implemented

### Batch 5 manual QA checklist

- [ ] Flag on: child drawer shows committed operational panel when agreement exists
- [ ] Change room effective next week — prior placement superseded, new row `pending`/`active` per start date
- [ ] Change schedule effective next month — prior assignment closed day before new start
- [ ] Schedule withdrawal while agreement active — ending flow with future end date
- [ ] Cancel pending-start agreement — status `canceled`, edit actions hidden
- [ ] Mark ended on active/ending agreement — status `ended`, end date set
- [ ] After each mutation: drawer refreshes summary; DB shows supersede chain (not in-place patch)
- [ ] Flag off: panel and edit actions hidden; no empty layout shells
- [ ] `approve_enrollment` handoff still creates agreement/placement/schedule without duplicate `*_changed` events
