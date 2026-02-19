# Canonical Event Vocabulary (Alloy)

This document defines the event naming convention, core v1 event types, entity types, and canonical event shape for the Alloy event layer. It is documentation and vocabulary only; runtime behavior is unchanged until emit points are refactored to use it consistently.

---

## Event type naming convention

- Use **dot notation**: `category.action` or `entity.action` (e.g. `action_link.consumed`, `entity.updated`).
- **Category/entity** is the first segment (e.g. `action_link`, `booking`, `schedule`, `job`).
- **Action** is the second segment (e.g. `consumed`, `confirmed`, `created`, `updated`).
- Legacy event types in the codebase may still use **snake_case** (e.g. `action_link_consumed`, `booking_confirmed`). New events should prefer dot notation where possible; migration to dot notation is TBD.

---

## Canonical event shape

Every event persisted to `workflow_events` (and used for workflow runs) should conform to this shape:

| Field          | Type     | Description |
|----------------|----------|-------------|
| `event_id`     | `uuid`   | Primary key of the row in `workflow_events` (set when persisted). |
| `org_id`       | `uuid`   | Organization the event belongs to (nullable for system/global events). |
| `event_type`   | `string` | Event type (see naming convention and core v1 list below). |
| `entity_type`  | `string` | Primary entity type (e.g. `job`, `schedule`, `customer`). |
| `entity_id`    | `uuid`   | Primary entity id (nullable when not applicable). |
| `action_type`  | `string` | Optional sub-action (e.g. for action links: `customer_cancel`, `vendor_accept_job`). |
| `occurred_at`  | `string` | ISO 8601 timestamp when the event occurred. |
| `payload`      | `object` | Event-specific data (see per-event payload keys below). |

---

## Core v1 event types

Events that are supported in v1 (workflow triggers and/or `workflow_events`). Payload keys are the minimal set expected in `payload` (or at top level of `event_payload` for backward compatibility).

| Event type                   | Description | Expected payload keys (typical) |
|-----------------------------|-------------|----------------------------------|
| `action_link_consumed`      | A tokenized action link was consumed (e.g. cancel, reschedule, accept job). | `event_type`, `occurred_at`, `org_id`, `action_type`, `entity_type`, `entity_id`; for cancel: `canceled_by`, `cancel_reason`; for accept: `vendor_id`. |
| `booking_confirmed`         | A booking was confirmed (opportunity/job/schedule created or updated). | `event_type`, `occurred_at`, `org_id`, `job`, `opportunity`, `schedule`, `contact`, `customer`; optional `booked_stage_id`. |
| `quote_started`             | A quote flow was started (opportunity created or reused). | `event_type`, `occurred_at`, `org_id`, `opportunity`, `contact`, `customer`. |
| `schedule_created`           | A new schedule was created (e.g. reschedule or subscription generate-next). | `event_type`, `occurred_at`, `org_id`, `schedule`, `job`. |
| `schedule_vendor_assigned`  | A vendor was assigned to a schedule. | `event_type`, `occurred_at`, `org_id`, `schedule`, `job`, vendor/assignment context. |
| `job_default_vendor_applied`| Job’s default vendor was applied to upcoming schedules. | `event_type`, `occurred_at`, `org_id`, `job`. |
| `job_action`                | A job-level action occurred (e.g. mark completed, assign vendor). | `event_type`, `occurred_at`, `org_id`, `job`, `action` (e.g. `mark_completed`, `assign_vendor`). |
| `job_rescheduled`            | Job/schedule was rescheduled (reserved for future use). | TBD. |
| `job_canceled`              | Job was canceled (reserved for future use). | TBD. |
| `job_completed`             | Job was marked completed (reserved for future use). | TBD. |
| `payment_succeeded`         | A payment succeeded (reserved for future use). | TBD. |
| `payment_failed`             | A payment failed (reserved for future use). | TBD. |

---

## Core v1 entity types

Entity types used in events and workflow conditions:

| Entity type   | Description |
|---------------|-------------|
| `job`         | A job (service appointment container). |
| `schedule`    | A single scheduled occurrence (time slot). |
| `customer`    | Customer (household or account). |
| `contact`     | Contact (person; may be linked to customer). |
| `vendor`      | Vendor (contractor/service provider). |
| `opportunity` | Sales/quote opportunity. |
| `payment`     | Payment (for future payment events). |

---

## Constants and types

Code-level vocabulary is exported from `web/lib/events.ts`:

- **`EVENT_TYPES`** – `as const` array of supported event type strings.
- **`ENTITY_TYPES`** – `as const` array of supported entity type strings.
- **`EventType`** – TypeScript type derived from `EVENT_TYPES`.
- **`EntityType`** – TypeScript type derived from `ENTITY_TYPES`.

Use these for type-safe event/entity references when adding or refactoring emit points.
