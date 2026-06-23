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

## Audit reference

Full API route coverage: `docs/audits/event-integrity-audit.md`.

Workflow editor subset: `web/lib/workflowVocab.ts` (incomplete vs production).

---

## Related

- `../modules/operational-intelligence-platform.md`
- `../modules/actions-and-workflows.md`
