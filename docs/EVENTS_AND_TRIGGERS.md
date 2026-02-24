# Alloy Events & Triggers Specification

## 1. Purpose

This document defines how events are structured, emitted, and consumed in Alloy.

Alloy is event-driven by design.

Every workflow is triggered by a canonical event.
Events must be consistent, immutable, and version-safe.

---

## 2. Canonical Event Structure

Every event stored in `workflow_events` must include:

- `id` (uuid)
- `org_id` (uuid)
- `event_type` (text)
- `entity_type` (text)
- `entity_id` (uuid)
- `occurred_at` (timestamp)
- `payload` (jsonb)
- `source` (optional: api | workflow | system | action_link)

Events are immutable once written.

---

## 3. Event Naming Convention

Event names must follow:

`<entity>_<past_tense_action>`

Examples:

- booking_confirmed
- schedule_created
- schedule_canceled
- payment_posted
- action_link_consumed
- quote_started

Rules:

- lowercase
- snake_case
- no version numbers in name
- no UI language (“button_clicked” is invalid)

Events represent business facts — not UI actions.

---

## 4. Event Emission Rules

Events must be emitted when:

- A core entity changes state
- A workflow action mutates a record
- An action link is consumed
- A ledger-impacting operation completes
- A system-generated operation completes

Events should NOT be emitted for:

- Pure UI state changes
- Validation attempts that fail
- Temporary drafts
- Background polling

Only emit events for business-relevant facts.

---

## 5. Event Immutability

Events are:

- Append-only
- Never updated
- Never deleted

If something changes later, emit a new event.

Example:

Incorrect:
- Update previous `schedule_created` event

Correct:
- Emit `schedule_rescheduled`

---

## 6. Workflow Trigger Resolution

When an event is emitted:

1. Query enabled workflows
2. Match by:
   - `event_type`
   - `entity_type` (if defined on workflow)
3. Execute matching workflows
4. Record workflow_runs
5. Record workflow_action_runs

Workflows must never execute without a corresponding event.

---

## 7. Entity Type Matching Rules

If workflow.entity_type is:

- NULL → match all entity types
- Defined → must equal event.entity_type

No partial matching.
No wildcard matching.

Keep it deterministic.

---

## 8. Event Payload Guidelines

Payload must include:

- Enough data for workflow actions
- But not entire record dumps unnecessarily

Preferred structure:

{
  entity_id: "...",
  entity_type: "...",
  changes: {...},      // if applicable
  context: {...},      // optional
  metadata: {...}      // optional
}

Avoid:
- Massive full-record duplication
- Deep nesting unless required

---

## 9. Event Versioning (Future-Proofing)

Do not version event names.

If structure changes in breaking way:

Option A (preferred):
- Add new fields to payload
- Keep backward compatibility

Option B (if unavoidable):
- Create new event type name

Example:
- booking_confirmed_v2 (only if absolutely required)

Avoid versioning unless necessary.

---

## 10. Workflow Idempotency

If the same event is processed twice:

- Workflow execution should not create duplicate ledger entries
- Critical actions must be idempotent
- Use event_id where necessary for deduplication

All financial or irreversible actions must consider idempotency.

---

## 11. Action Link Events

Action link consumption must:

1. Mark token as consumed
2. Emit `action_link_consumed`
3. Include:
   - entity_type
   - entity_id
   - action_type
   - consumed_by
   - metadata

Workflows triggered by this event must rely only on event payload.

They must not re-query action_links table to derive intent.

---

## 12. Ledger-Impacting Events

Events that affect GL must:

- Occur after ledger insert completes
- Never emit before transaction success
- Include reference ids in payload

This ensures financial traceability.

---

## 13. Observability Requirements

For every event:

- There must be a visible workflow_run if it triggers something
- Failures must surface in workflow_action_runs
- No silent swallowing of errors

If an event emits and nothing happens:
- It must be debuggable

---

## 14. Guardrails

Before adding a new event:

Ask:

- Is this a true business fact?
- Will workflows ever trigger from it?
- Does it duplicate an existing event?
- Does it belong to an entity?

If not, do not create it.

---

## 15. Architectural Principle

Events are the backbone of Alloy.

UI triggers → API mutations → Events → Workflows → Ledger/Actions

Never bypass the event layer.