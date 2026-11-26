# Assignment Platform Foundation Inventory — July 2026

**Status:** Architecture gate — read-only inventory.  
**Scope:** Scheduling, placement, participation, staffing, recurrence, operational calculations, configuration, commands, and billing boundaries.  
**Non-goals:** No schema migration, runtime, or surface redesign. The accepted Scheduling Focus Panel and Scheduling Workspace shell remain unchanged.

## Decision

Assignment Platform Phase 2 must extend the existing effective-dated operational foundation. It must not create a parallel child or staff scheduling engine.

The existing `schedule_assignments` record is the canonical recurring schedule commitment for an enrolled child, but it cannot yet represent either multiple concurrent operational commitments or a staff subject. A future generalization is justified only at that ownership boundary, after the required compatibility and migration plan is approved.

## Canonical primitives to reuse

| Concern | Existing primitive | Authority |
|---|---|---|
| Child operational relationship | `child_enrollment_agreements` | Child × site operational contract |
| Child room/program intent | `child_placements` | Effective-dated placement history |
| Recurrence commitment | `schedule_assignments` + `schedule_patterns` | Effective-dated schedule pattern binding |
| Effective dating | `effectiveDating.ts`, `supersedeChildPlacement`, `supersedeScheduleAssignment` | Supersede, never overwrite |
| Pre-enrollment child intent | Enrollment `process_instances.metadata` via `applyChildParticipationEdit` | Planning-only participation before materialization |
| Room and ratio calculations | Operational Calculations registry + childcare occupancy/ratio/capacity resolvers | Derived values; workspace consumes them |
| Business mutations | Registered Action / Operational Command Runtime | Context, eligibility, preview, execution, audit, refresh |
| Billing | Financial rate and charge-resolution services | Billing owns rate/charge/ledger truth; assignments only provide operational input |
| Configuration | Location scheduling configuration and Configuration Runtime | Config steers labels, recurrence, operating days, and availability; code owns invariants |
| Bulk mutation | Operational Command Runtime preview → confirmation → execution contract | No bulk scheduling command exists; future batch actions must extend this runtime |

## Existing scheduling and placement model

The child model is a proven L2 Operational Intent chain:

```text
child_enrollment_agreements
  → child_placements
  → schedule_assignments
  → schedule_patterns
```

- `child_enrollment_agreements` establishes an enrolled child’s site relationship.
- `child_placements` owns the effective-dated program and room placement.
- `schedule_assignments` owns the effective-dated recurring pattern on that agreement.
- `schedule_patterns` supplies site-scoped weekdays and schedule type data.

The write services are `childPlacementService.ts` and `scheduleAssignmentService.ts`. Both enforce create-or-supersede behavior and emit the existing operational enrollment events. They are the correct lifecycle mechanics to preserve.

The read model is already more capable than the current write path: the Scheduling projection can group multiple concurrent assignment rows, but the database indexes, trigger contract, and services cannot persist those rows. It resolves each assignment’s room from the agreement-level placement, so per-assignment rooms also require an explicit ownership change rather than a presentation-only update.

## Participation boundary

Before enrollment materializes an agreement, a child’s proposed program, room, schedule type, dates, weekdays, and draft hours are stored on the Enrollment process instance through `applyChildParticipationEdit`.

This is intentionally planning-only. It must not become the store for operational assignments, staff assignments, occupancy, attendance, or billing consequences. Enrollment remains the materialization boundary for child operational truth.

Post-materialization edits in that adapter currently patch the current placement and schedule rows directly. Phase 2 must use the existing supersede services for business changes rather than extending that direct-update path.

## Operational calculations and staffing

The platform already computes:

- expected and actual child occupancy;
- required staff from ratio rules;
- room capacity and availability;
- expected and actual staffing *demand*.

These calculations are canonical and must remain read-only consumers of operational commitments and facts. The current capacity contract deliberately reports staffed capacity as unknown because staff supply has no L2 commitment or L4 fact source.

There is no staff roster, shift, staff-assignment, or staff-presence fact model today. `persons.is_employee` / `employee_id` identify people; they do not establish a staff operational commitment. The `staffOnHandByRoomDate` input in actual compliance is explicitly a placeholder, not a persistence model.

## Why the current model cannot express Phase 2 requirements

### Multiple concurrent child assignments

`schedule_assignments` has a partial unique index permitting only one operational row per `enrollment_agreement_id`. Its service queries the same agreement for one current row, then either refuses creation or supersedes that row. This is correct for a child’s single base schedule, but it cannot express concurrent Before Care, Primary Classroom, After Care, and Enrichment commitments with independent recurrence, room, dates, billing participation, and primary designation.

`child_placements` has the same one-operational-placement-per-agreement rule. It correctly supplies the child’s operational home, but it cannot be reused as the per-assignment room relation without losing that home-room meaning.

### Staff assignments

`schedule_assignments` requires both `child_enrollment_agreements` and `customer_members`; its validation trigger derives the subject and site from a child agreement. Staff are represented by `persons`, not customer members or enrollment agreements. Therefore staff cannot be represented in this table without relaxing its child-specific ownership and integrity contract.

The existing `assignments` table is not an alternative: it is a legacy job/vendor assignment record with required `job_id` and `vendor_id` relationships, payout fields, and job scheduling semantics.

### Assignment types and primary designation

The location scheduling configuration offers recurrence schedule types (`continuous` / `rotating`) and patterns, but not configurable operational assignment types with subject applicability, visual treatment, billing participation, attendance participation, or a primary-policy invariant.

Primary placement is currently implicit in the single current child placement. With multiple concurrent commitments, the primary designation must remain a code-enforced invariant associated with the child’s operational-home relationship; it cannot be inferred from a pattern label or browser state.

### Configuration and bulk operations

The existing Configuration Assignment Runtime is a Programs publication/availability primitive, not a value model for operational assignment types. Assignment Types must therefore consume Configuration Runtime ownership conventions without repurposing Programs availability as the operational source of truth.

Likewise, the current command catalog has a single `schedule.create` capability and no bulk scheduling command. Bulk create, change, room move, effective-date change, and pattern assignment must be registered operations with preview, eligibility, confirmation, audit, and refresh—not client loops over direct Supabase writes.

## Generalization boundary — not yet implemented

If Phase 2 proceeds, the only warranted new ownership boundary is a single subject-typed, effective-dated operational-assignment commitment that:

1. preserves the existing child placement and schedule lifecycle as the compatibility path;
2. supports child and staff subject identities without a separate staff scheduling engine;
3. permits several concurrent assignments for a subject while retaining exactly one primary child operational-home assignment;
4. references recurrence, room, assignment type, and consequence participation without calculating billing, attendance, ratios, or capacity locally;
5. uses the existing command, event, configuration, calculation, and audit paths.

This is not authorization to add a table. Before implementation, the migration design must prove:

- how the single-child current placement remains authoritative for home-room, attendance default, ratio ownership, and reporting;
- how existing `schedule_assignments` rows backfill and remain compatible with enrollment materialization and charge resolution;
- how child and staff subject integrity is enforced without weakening organization, site, or room scoping;
- how supersede lineage and one-primary-at-a-time rules are protected in the database and server command layer;
- how the configuration owner provides assignment types without encoding operational truth only in JSON.

## Explicitly deferred until that proof

- Staff assignment persistence and staff-present facts
- Assignment type persistence and authoring surface
- Timeline, bulk assignment commands, and roster staff view
- Billing participation writes
- Workspace or Focus Panel shell changes
- Any global “Scheduling” rename

## Evidence map

| Area | Evidence |
|---|---|
| Child L2 model | `docs/platform/core/placement-system.md`; `supabase/migrations/20260625120000_childcare_operational_enrollment_slice1.sql` |
| Child lifecycle services | `web/lib/childcareOperational/{childPlacementService,scheduleAssignmentService}.ts` |
| Participation routing | `web/lib/childcareOperational/applyChildParticipationEdit.ts` |
| Staffing gap | `web/lib/childcareOperational/attendance/actualCompliance.ts`; `web/lib/operationalCalculations/families/{scheduling,resourceRequirementsAndCapacity}.ts` |
| Command boundary | `docs/platform/modules/actions-and-workflows.md` |
| Configuration boundary | `docs/platform/modules/configuration-platform.md`; `web/lib/locations/locationSchedulingConfig.ts` |
| Billing boundary | `docs/platform/modules/billing-financials-platform.md` |
| Legacy job assignments | `docs/supabase/reference/supabase_schema_columns.csv`; `web/lib/workflowRun.ts` |
