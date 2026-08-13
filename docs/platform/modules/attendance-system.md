---
owner: modules
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Attendance system

**Status:** Canonical module doctrine. Defines Attendance as the keystone **Operational Fact (L4)** stream in the truth-flow axis. **P2 (June 2026) implements the backend foundation** (immutable fact table + service + expected-vs-actual diff); **P2.1 adds org-local service dates, an absence-reason vocabulary, and pure actual occupancy/staffing/compliance + child-drawer read models**; **Attendance V1 (August 2026) adds the staff side and the operator surface** — see [Attendance V1](#attendance-v1-staff-presence-combined-roster-and-planned-vs-actual) below.

> ⚠ Two statements in the P2/P2.1 sections below are now **superseded** and left in place only as history: "UI is not yet built" and "staff scheduling is not modeled". Attendance V1 builds both. `staffOnHandByRoomDate` is no longer a placeholder.

> **Layer:** Attendance is **L4 Operational Facts** in [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md). It is compared against **L3 Projections** (expected attendance — the derived layer formerly called "Expectations"; not to be confused with the authored **Operational Expectations** ledger) and feeds **L5 Consequences** (billing). It is recorded from the Operations plane and reviewed from the Records plane (see [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md)).

---

## Why Attendance is the keystone

Attendance is the operational fact stream that the rest of the platform's financial and compliance truth derives from:

- **Billing** charges derive from attendance facts, not from enrollment (see [`./billing-financials-platform.md`](./billing-financials-platform.md)).
- **Ratio compliance** is evaluated against actual presence, not against intent.
- **Forecasting** projects forward from attendance history plus commitments.

Because so much derives from it, attendance must be modeled as immutable, effective-dated, event-emitting fact — and never as a mutable status field.

---

## Definition

**Attendance** is the record of a child's actual presence over time, captured against the **committed enrollment foundation** (an agreement and its placement/schedule), not against the enrollment proposal.

Fact kinds in scope:

- **Presence facts** — present / absent / excused for a service day or session.
- **Check-in / check-out events** — timestamped arrival/departure.
- **Room transfers** — intraday movement between rooms (distinct from a placement supersede, which is a committed change to the child's standing room).
- **Schedule overrides** — a one-off deviation from the committed schedule pattern for a specific date.
- **Corrections** — restatements of any of the above.

---

## Canonical model rules

1. **Reference the committed foundation.** Attendance facts reference `child_enrollment_agreements` (and, where relevant, the effective `child_placements` / `schedule_assignments` row), the durable child (`customer_member`), and the site/room `locations`. They do **not** reference the OCM enrollment proposal, `opportunities.location_id`, or any job-vertical table.
2. **Own participation entity + attendance-child context.** Per [`../../archive/2026-06-runtime-convergence/child_namespace_decision.md`](../../archive/2026-06-runtime-convergence/child_namespace_decision.md) §6, attendance gets its **own** participation/record entity, surfaced via an **attendance-child context** (relationship_section / repeater / widget) with `{attendance_entity_type}.*` refKeys. Operators always see "Child." Do **not** reuse `inquiry_child.*`, and do **not** flatten attendance onto the child.
3. **Immutable + effective-dated.** Attendance facts are never edited in place. A correction is a **new effective-dated fact** that supersedes the prior one (prior row closed the day before, successor links via a `supersedes_*` reference), following the supersede pattern in `web/lib/childcareOperational/effectiveDating.ts`. The original fact remains in history.
4. **Event-emitting.** Every recorded or corrected attendance fact emits an event on `workflow_events` (`emitEvent` → `workflow_events` → `workflowRun`), with a versioned payload. Downstream consequences (billing, compliance, forecasting) react to events; they do not poll mutable state.
5. **Authored by Actions, not queues or projections.** Attendance is created/corrected through the canonical action/workflow path (see [`./actions-and-workflows.md`](./actions-and-workflows.md)). Queue rows and Projection read models are previews/derivations only; they never write attendance.
6. **Room transfer ≠ placement supersede.** An intraday room transfer is an attendance fact about where the child *was*; a placement change is a committed-intent change about where the child *belongs*. Keep them distinct models.

---

## Projections vs Facts (the comparison contract)

Attendance Facts (L4) are compared against Expected Attendance (L3), which is **derived** from committed schedule assignments + placements + L1 attendance/schedule rules.

- **Expected attendance is computed**, never stored as a system of record. See [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) (L3).
- The comparison surface (expected vs actual, variance, absence patterns) is a **read model / projection** over Projections and Facts. It is observational; it does not author either side.
- BOS may surface absence-pattern detection and follow-up suggestions over this comparison, **proposing**; humans approve (see [`./ai-platform.md`](./ai-platform.md)).

---

## Surface placement (planes + drawer)

- **Operations plane:** an Attendance work unit / daily roster perspective surfaces children expected today and their presence state; recording is an action.
- **Records plane:** the child drawer gains an **Attendance** tab once attendance history exists. Following [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md): the tab is **Active** when facts exist; before any history, "Record attendance / Mark present" is offered as a **Startable action** — a hidden tab must never hide the path to begin valid work.
- One operational shell (`AdminV2WorkspaceBosModalShell` + `OperationalModalHeader`); attendance does not invent its own layout system.

---

## What not to do

- Do not model attendance as a mutable status field or edit facts in place.
- Do not reference the enrollment proposal (OCM), `opportunities.location_id`, or any job-vertical table from attendance.
- Do not reuse `inquiry_child.*` for attendance fields, or flatten attendance onto the child.
- Do not store "expected attendance" as authoritative rows — it is derived (L3).
- Do not let billing or compliance read mutable attendance state directly; they derive from attendance facts/events.
- Do not conflate intraday room transfers with committed placement changes.

---

## Implemented model (P2)

P2 builds the L4 backend foundation only (no UI, no billing, no subsidy). It honors every canonical rule above.

**Schema** — `supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql`

- **`child_attendance_events`** — a single **immutable, append-only** fact stream. There is no mutable daily attendance row. Each row references the committed foundation (`child_enrollment_agreements`, `customer_members`, site/room `locations`) — never the OCM proposal or any job-vertical table.
- **Append-only is enforced in the DB**: a `BEFORE UPDATE OR DELETE` trigger (`prevent_child_attendance_events_mutation`) raises for **all** roles. Rows are only ever inserted.
- **Corrections/reversals by reference, not mutation**: `entry_type ∈ {original, correction, reversal}` with `corrects_event_id` pointing at the target. The original always remains in history. A `reversal` voids its target; a `correction` restates it (carries the corrected values on the new row).
- **Fact kinds**: `event_kind ∈ {check_in, check_out, absence, present, room_transfer, schedule_override}`. Multiple in/out events per day are supported. `room_transfer` carries `from_room_location_id`/`to_room_location_id` and is a **fact** — it never supersedes `child_placements`.
- **Actor context**: `actor_type ∈ {staff, parent, guardian, emergency_contact, system}` (+ `actor_user_id` / `actor_person_id` / `actor_label`). **Source context**: `source_type ∈ {operator_action, staff_workspace, parent_portal, processing_import, system}` — future intake channels are representable today without schema change (preserves the subsidy/import reporting path).
- A `BEFORE INSERT` validation trigger enforces org/agreement/member/site consistency, that any referenced room is a `unit` under the agreement site, and that corrections target an event on the same org + agreement. RLS uses the operational posture (org-scoped SELECT, owner/admin/ops INSERT, `service_role` all); no UPDATE/DELETE grants.

**RefKey namespace** — entity type `child_attendance_events` (per [child namespace §6](../../archive/2026-06-runtime-convergence/child_namespace_decision.md); surfaced later via an attendance-child context). Does not reuse `inquiry_child.*`.

**Services** — `web/lib/childcareOperational/attendance/`

- `attendanceService.ts` — `recordAttendanceEvent` (append-only original), `correctAttendanceEvent` (correction/reversal as new rows), `listAttendanceEvents`. Every write emits a `workflow_events` event.
- `attendanceEvents.ts` — `attendance_event_recorded` / `attendance_event_corrected` / `attendance_event_reversed` (versioned payloads, entity type `child_attendance_events`).
- `attendanceFold.ts` — **pure** fold of the event stream into effective facts (applying corrections/reversals) and per-(agreement, service_date) summaries.
- `expectedVsActual.ts` — **pure** read model comparing L3 expected attendance against folded L4 facts. Variance codes: `expected_not_checked_in`, `checked_in_not_expected`, `absent`, `late_arrival_unknown_time`, `missing_checkout`, `room_mismatch`. Observational only; authors neither side.
- `fetchExpectedVsActual.ts` — composes `fetchScheduleExpectations` (L3) + `listAttendanceEvents` (L4) for the diff.

**APIs** (smoke surface; UI deferred)

- `GET/POST /api/admin/childcare-attendance` — list facts; record / correct / reverse (admin/ops).
- `GET /api/admin/childcare-attendance/expected-vs-actual` — read-only expected-vs-actual diff for a site over a date range.

## Hardening + actual compliance (P2.1)

P2.1 hardens P2 and adds **read models over actuals** — still no UI, no billing, no subsidy, no materialized rollups, no mutable rows, no staff-scheduling tables. No new migration (it reuses the P2 `reason_key` column).

- **Org-local service date** — `attendanceServiceDate.ts`: `serviceDateForInstant(eventAtIso, timeZone)` (pure) and `resolveAttendanceServiceDate(supabase, orgId, eventAt)`. Centers operate by the **site-local calendar day**, not raw UTC. `recordAttendanceEvent` / `correctAttendanceEvent` now accept either an explicit `serviceDate` *or* a `timeZone` to derive it from `eventAt` (one is required); the POST route defaults `service_date` from the org timezone.
- **Absence reasons** — `attendanceAbsenceReasons.ts`: a code-owned controlled vocabulary stored via the existing `reason_key` column. Each reason has an excused / unexcused / unspecified **classification that is operational metadata only and carries no billing or subsidy meaning yet** (downstream L5 / processing may map these keys to their own policies). The service validates `reason_key` for `absence` facts. Promotable to a tenant-configurable table later without changing the stored shape.
- **Actual compliance (pure)** — `actualCompliance.ts`: `aggregateActualOccupancyByRoomDate` (distinct children **observed** per room/date — day-level union; point-in-time precision deferred), `computeActualStaffingByRoomDate` (reuses P1 `requiredStaffForChildren` + ratio tiers — identical resolver to L3 expected staffing via the shared `config/roomConfigResolvers.ts`), and `computeActualCompliance` (staffing gap, over-capacity, understaffed). **Staff scheduling is not modeled**: `staffOnHandByRoomDate` is an optional placeholder; a missing datum yields a `null` gap + `staff_data_unavailable` warning, never a failure. `buildActualComplianceReadModel.ts` + `fetchActualComplianceReadModel.ts` assemble the site-level model (and surface `room_mismatch` from the existing diff).
- **Child-drawer read-model contract (pure)** — `childAttendanceReadModel.ts`: `buildChildAttendanceReadModel` deterministically projects, for one child, expected attendance, actual presence summary, current presence state, check-in/out timeline, room-movement timeline, absences (classified), corrections audit trail, expected-vs-actual variances, and room-scoped actual-compliance context. Defines the shape a future Attendance tab / Focus Panel will consume — **no UI is built**.
- **Shared resolution** — `config/roomConfigResolvers.ts` and `expectations/loadOperationalExpectationInputs.ts` are extracted so L3 projections and L4 actual compliance resolve tiers/capacity and load inputs identically (`buildScheduleExpectations` / `fetchScheduleExpectations` refactored onto them with no behavior change).
- **API** — `GET /api/admin/childcare-attendance/actual-compliance` — read-only site occupancy/staffing/compliance over a date range.

**Deferred** (unchanged by P2.1): all attendance UI; staff scheduling tables (only placeholder interfaces exist); billing/financial resolution (L5); subsidy intake/reporting; materialized projection or attendance rollups; point-in-time (time-block) occupancy.

---

## Attendance V1 — staff presence, combined roster, and planned vs actual

Closes the two things P2.1 explicitly deferred: **staff scheduling** and **the operator surface**.

### Staff Presence is a SECOND conforming fact stream, not a generalization

`staff_presence_events` is its own stream alongside `child_attendance_events`. It was deliberately
NOT built by widening the child stream: `child_attendance_events` keeps its NOT NULL enrollment
agreement and its customer-member subject, which are meaningless for an employee. A staff fact's
subject is `persons.id` plus the `employment_id` covering the service date.

- **Conformance is shared, not re-defined.** It passes the same `assertFactStreamConforms` and the
  same schema-scan primitives the child stream does. A staff-specific conformance framework would
  have created a second definition of "conforming".
- **Vocabulary is a deliberate SUBSET:** `check_in | check_out | present | absence`. No
  `room_transfer` (a child governed-movement fact) and no `schedule_override` (a child enrollment
  concept). Actor types drop parent/guardian/emergency contact.
- **Correction semantics are identical by design** — replay must not fork between the two streams.
- **Employment bounds it.** A presence fact is refused outside the employment window on either side.

⚠ **No payroll or timekeeping meaning is introduced.** These facts answer "was this person in this
room on this day", which is a **ratio-compliance** question. They are not hours worked, not wages,
and must not become either without an explicit decision.

### The Combined Daily Roster is an expectation model, not a schedule

One day, one site. It composes **certified child expectations** with **certified staff supply**,
persists nothing, and authors no facts.

- **Child expectation** resolves from `schedule_assignments` joined to `schedule_patterns.weekdays`.
  A `child_placement` supplies the ROOM; the WEEKDAY comes from the assignment's pattern. A placement
  alone therefore leaves a room empty on days the pattern does not cover — this is correct, and it is
  the single most common source of "the fixture looks broken" confusion.
- **Staff supply** resolves from `subject_type = 'staff'` assignments, filtered per day by
  **employment coverage** (`person_is_employed_on` / its pure twin `employmentCoverage.ts`).
- **Required staff** comes from the shared ratio resolver — there is no roster-local staffing math.

### Planned and actual are SEPARATE VERDICTS that never share a field

This is the distinction Attendance V1 exists to make legible, and it was proven live on the same
room, date and instant:

```
PLANNED  { scheduledStaff: 1, required: 1 }                      → sufficient
ACTUAL   { childrenPresent: 1, staffPresent: 0, required: 1 }    → short
```

Both run through the same ratio engine; they differ only in which population they count. A surface
that collapses them into one number cannot tell an operator whether they have a staffing problem
right now or a planning problem next week.

`unknown` and `idle` are real verdicts, not gaps:

- **`unknown`** — no ratio rule resolves for the room, so no verdict is possible. It must never
  render as compliant.
- **`idle`** — the register is empty. Nobody is present, so there is nobody to be short *for*.
  Rendering an empty register as `short` was a defect (fixed on staging in `d9d2ea332`).

### Operator surface

Attendance is an operator surface inside the **Roster workspace** (Roster → Attendance),
site-scoped, drilling site → room → subjects. Check-in / check-out / absence / correction are all
registered actions; the surface authors nothing directly and re-reads the roster projection after
every command.

⚠ **Attendance has no date control.** It adopts the org-local service date the roster route
resolves and renders no way to change it — it is a TODAY-ONLY surface by construction. Anything
handing off into Attendance must respect that. Roster offers `Open Attendance` only when the
roster is on today, and states the reason on any other date rather than silently opening today,
which would move the operator to a different day without saying so.

### Workspace ownership (settled 2026-08-13)

The provisional placement inside Assignments is **resolved**. Roster is now a first-class
operational workspace, peer to Inbox / Work Items / Processing / Assignments:

| Workspace | Owns | Question |
|---|---|---|
| **Assignments** | durable placement + schedule commitments, and every mutation of them | *What commitments exist?* |
| **Roster** | the expected operating composition — Day/Week × Rooms/Staff | *Who is expected where and when?* |
| **Roster → Attendance** | actuality over the same daily operating population | *Who is actually here?* |

- **Roster writes no scheduling truth.** `Manage →` routes to the registered assignment commands in
  Assignments; Roster composes certified projections and nothing else.
- Attendance is a **mode of Roster**, not a separate workspace: expectation and actuality are two
  readings of one operational day. There is exactly one canonical Attendance surface.
- Assignments no longer exposes Roster or Attendance work views. Links written against the old
  location are forwarded to Roster by `dispatchAdminV2OpenSchedulingModal` (and, for a stale
  session deep-link written by an older bundle, by the Assignments workspace on mount) — they must
  never dead-end.
- The workspace is named **`Roster`** for V1. Whether a broader **"Daily Operations"** noun
  eventually covers Roster + Attendance + adjacent daily surfaces is **undecided**, and deliberately
  not pre-empted.

Owners: `web/app/adminV2/roster/`, `web/components/adminV2/roster/RosterWorkspace.tsx`.
Product record: [`../planning/roster-product-v1-stage1.md`](../planning/roster-product-v1-stage1.md).

### Known V1 boundaries

- A **checked-out child** offers no re-entry and no correction control on this surface: actual demand
  can be lowered from Attendance but not restored.
- Staff **room-movement** semantics are not certified.
- **Edit / End employment** have no operator surface yet (Add Staff does, at `/organization/staff`),
  which is why the drawer-era `PersonEmploymentSection` is retained-but-unmounted rather than deleted.

### Where the truth lives

| Concern | Owner |
|---------|-------|
| Employment relationship + `person_is_employed_on` | [`../core/data/entity-specification.md`](../core/data/entity-specification.md), [`../core/data/relationship-model.md`](../core/data/relationship-model.md) |
| Staff presence fact stream | `supabase/migrations/20260812090000_staff_presence_facts_v1.sql`, `web/lib/staffPresence/*` |
| Staff assignment eligibility | `web/lib/operationalAssignments/staffAssignmentEligibility.ts` |
| Combined roster + sufficiency | `web/lib/roster/buildCombinedRoster.ts`, `web/lib/scheduling/supply/staffingSufficiency.ts` |
| Roster workspace (expectation + actuality) | `web/app/adminV2/roster/`, `web/components/adminV2/roster/RosterWorkspace.tsx` |
| Certification fixture (cert-only) | `certification/attendance/01-attendance-fixture.sql` |

---

## Cross-references

| Concern | Doctrine |
|---------|----------|
| Truth-flow layers (Attendance = L4) | [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) |
| Surface planes, progressive drawer, tabs vs actions | [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) |
| Committed enrollment foundation (what attendance references) | [`../core/placement-system.md`](../core/placement-system.md) |
| Child namespace per module | [`../../archive/2026-06-runtime-convergence/child_namespace_decision.md`](../../archive/2026-06-runtime-convergence/child_namespace_decision.md) |
| Billing derives from attendance (L5) | [`./billing-financials-platform.md`](./billing-financials-platform.md) |
| Action / event spine | [`./actions-and-workflows.md`](./actions-and-workflows.md) |
| Effective-dated supersede pattern (code) | `web/lib/childcareOperational/effectiveDating.ts` |

---

## When this doc must be updated

- Attendance fact kinds change, or the committed-foundation references change.
- The projections-vs-facts comparison contract changes.
- The attendance-child context / refKey namespace changes.
- Attendance moves from doctrine to implemented schema/runtime (record the model here).
- The staff presence vocabulary changes, or staff facts acquire any payroll/timekeeping meaning.
- The planned-vs-actual separation changes, or a new sufficiency verdict is introduced.
- Roster / Attendance change workspace again, or the "Daily Operations" naming question is settled.
