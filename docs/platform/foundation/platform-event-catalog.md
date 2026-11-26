---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Platform event catalog

**Status:** Canonical foundation doc (Phase 0 seed).

Single vocabulary for durable operational events. Production inserts use **`emitEvent`** → **`workflow_events`** (`web/lib/emitEvent.ts`).

This catalog is **incrementally governed** — not every historical `event_type` string is listed yet. Phase 0 documents events **consumed or related to the Metric Engine MVP** plus core lifecycle spine types.

---

## Canonical rules

1. New events should be added here and referenced from TypeScript constants when touched.
2. Payload schemas are code-validated over time — not arbitrary JSON in config.
3. Metrics prefer **entity table truth** where state is authoritative (e.g. `tour_bookings` for tour metrics).
4. `workflow_events` remains the audit + workflow trigger spine.

---

## Core lifecycle & status

| event_type | entity_type | When emitted | Metric relevance |
|------------|-------------|--------------|------------------|
| `opportunity_status_changed` | `opportunities` | Case `status_key` change | Funnel timing (future) |
| `entity_status_changed` | various | Non-opportunity status change | Domain metrics |
| `child_lifecycle_status_changed` | `opportunity_customer_members` | Child disposition change | Enrollment grain metrics |
| `action_executed` | varies | Admin action router | Action conversion (future) |

---

## Tours (booking entity)

Tour **metrics** use `tour_bookings` as authoritative state. These workflow events align with booking transitions:

| event_type | entity_type | Notes |
|------------|-------------|-------|
| `tour_requested` | `tour_bookings` | Initial request |
| `tour_booking_pending` | `tour_bookings` | Awaiting approval |
| `tour_confirmed` | `tour_bookings` | Confirmed slot |
| `tour_rescheduled` | `tour_bookings` | Prior row superseded |
| `tour_canceled` | `tour_bookings` | Canceled |
| `tour_no_show` | `tour_bookings` | No-show outcome |
| `tour_completed` | `tour_bookings` | Completed visit |

Constants: `web/lib/tours/constants.ts`, emitter: `web/lib/tours/events/tourLifecycleEvents.ts`.

---

## Forms & intake

| event_type | entity_type |
|------------|-------------|
| `form_submitted` | `form_submissions` |
| `form_signed` | `form_submissions` |
| `form_document_generated` | `form_submissions` |
| `form_packet_completed` | `form_submissions` |
| `intake_case_created` | `form_submissions` |
| `intake_case_operationalized` | `form_submissions` |
| `intake_case_review_required` | `form_submissions` |
| `intake_case_linked` | `form_submissions` |

---

## Communications

| event_type | Notes |
|------------|-------|
| `message_queued` | Outbound enqueue |
| `comms_v2.*` | Namespaced telemetry (`web/lib/communications/v2/telemetry.ts`) |

Delivery lifecycle (separate table `communication_delivery_events`): `queued`, `sent`, `delivered`, `opened`, `clicked`, `replied`, `bounced`, `failed`, etc.

---

## Operational work (planned emission)

| event_type | Status | Notes |
|------------|--------|-------|
| `operational_task_created` | Planned | MVP uses `operational_tasks` snapshot |
| `operational_task_completed` | Planned | |

---

## Operational enrollment (childcare)

Handoff from `approve_enrollment` when `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED=1` (see `web/lib/childcareOperational/featureFlag.ts`).

| event_type | entity_type | When emitted |
|------------|-------------|--------------|
| `enrollment_agreement_created` | `child_enrollment_agreements` | New agreement on handoff |
| `placement_created` | `child_placements` | Initial placement on handoff |
| `schedule_assignment_created` | `schedule_assignments` | Initial schedule assignment on handoff |
| `operational_enrollment_handoff_completed` | `opportunities` | Handoff finished with no partial warnings |
| `operational_enrollment_handoff_partial` | `opportunities` | Handoff finished with schedule/placement warnings |
| `placement_changed` | `child_placements` | Operator supersede or initial create (non-handoff source) |
| `schedule_assignment_changed` | `schedule_assignments` | Operator supersede or initial create (non-handoff source) |
| `agreement_ending_scheduled` | `child_enrollment_agreements` | Operator marks active agreement ending with future end date |
| `agreement_ended` | `child_enrollment_agreements` | Operator marks agreement ended (not automated transition job) |
| `agreement_canceled` | `child_enrollment_agreements` | Operator cancels `pending_start` agreement |

Operator edit events use `action_type: operator_enrollment_edit`. Handoff continues to emit `placement_created` / `schedule_assignment_created` with `action_type: approve_enrollment_handoff` (not `placement_changed`).

Constants: `web/lib/childcareOperational/operationalEnrollmentEvents.ts`. Payloads include `schema_version: 1`.

**Schedule doctrine:** OCM `desired_schedule_type` is enrollment schedule **intent/proposal** (may be captured before tour). `schedule_assignments` are **committed operational schedule** after approve handoff converts the latest valid proposal. BOS capacity forecasting may use proposal intent before approval.

---

## Audit reference

Full API route coverage: `docs/audits/event-integrity-audit.md`.

Workflow editor subset: `web/lib/workflowVocab.ts` (incomplete vs production).

---

## Related

- `../modules/operational-intelligence-platform.md`
- `../modules/actions-and-workflows.md`
