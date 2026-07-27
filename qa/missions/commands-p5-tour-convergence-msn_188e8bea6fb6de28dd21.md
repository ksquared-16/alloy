# Commands P5 — Tour Convergence

Mission: `msn_188e8bea6fb6de28dd21`  
Worktree: Slot 1 Commands (`agent/cursor/1-commands-system-inventory`)

---

# P5.S1 — Tour Command Authority and Reschedule Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Cutover | `reschedule_tour` only |
| Final executor | `rescheduleTourBooking` → `runTourBookingLifecycleTransition` |
| Adapter | `web/lib/platform/commands/runtime/adapters/tourExecutionAdapter.ts` |
| Direct API | `POST /api/admin/tours/bookings/:bookingId/reschedule` unchanged (Option A) |
| Destructive cancel | still commit-disabled |

## Tour-family authority table

| Capability | Current owner | Final executor | Production status | Facade status | Planned phase |
| ---------- | ------------- | -------------- | ----------------- | ------------- | ------------- |
| `schedule.create` | registered_action | RegisteredAction handler | production | enabled (RA) | unchanged |
| `schedule_tour` | tour_domain | Tour booking create API / service | production | disabled | later P5 |
| `reschedule_tour` | tour_domain | `rescheduleTourBooking` | production | **enabled (P5.S1)** | — |
| `confirm_tour` | registered_action | RegisteredAction (+ domain confirm path) | production | enabled (RA) | unchanged |
| `cancel_tour` | tour_domain | `cancelTourBooking` | production | **enabled destructive (P5.S2)** | — |
| `complete_tour` | tour_domain | `completeTourBooking` (domain) | production | disabled | later P5 |
| `no_show_tour` / `mark_tour_no_show` | tour_domain | domain no-show transition | production | disabled | later P5 |
| `reopen_tour` | none | — | unavailable | unavailable | contract-only |

## Reschedule execution trace

```text
Operator UI (OpportunityTourSlotSchedulePanel)
  → POST /api/admin/tours/bookings/:id/reschedule   (compatibility; unchanged)

Facade path (new):
POST /api/admin/actions/execute (action_key=reschedule_tour)
  → Command Runtime
  → tourExecutionAdapter
  → rescheduleTourBooking(supabase, orgId, bookingId, { startAt, endAt, timezone?, locationId?, correlationId? })
  → runTourBookingLifecycleTransition
       validate status ∈ {confirmed, pending_approval, requested, rescheduled}
       assertSlotAvailableForWrite
       UPDATE tour_bookings in place (same booking id): start_at, end_at, timezone, location_id
       opportunity integration (reschedule_mirror when firm)
       emitTourBookingLifecycleEvent(tour_rescheduled)
       orchestrateTourBookingRescheduled (comms + reminderAction: replace)
```

## Grains

| Grain | Truth |
|-------|-------|
| Booking | `tour_bookings.id` — **stable** on reschedule (in-place update) |
| Opportunity | `tour_bookings.opportunity_id` |
| Location | booking `location_id` (optional override; opportunity pin enforced when provided) |
| Timezone | booking `timezone` (optional override; else retained) |
| Staff/host | `requested_by_user_id` retained; not rewritten by reschedule input |
| Status | Not patched by reschedule prepare; eligibility gates allowed statuses |

## Request / response

**Facade payload (compatible):** `booking_id`, `start_at`, `end_at`, optional `timezone`, `location_id`, `correlation_id`.  
Subject may be `opportunity` + booking in payload, or `tour_booking` entity id.

**Facade response:** `{ kind: "tour", tour_result: { booking_id, opportunity_id, status_key, start_at, end_at, timezone, location_id, message } }` plus compatible `booking` summary.

**Preview:** normalized summary only (no domain impact preview API; no P4 destructive token).

## Reminder / communication parity

Owned solely by `orchestrateTourBookingRescheduled` inside the domain transition (`reminderAction: "replace"`, immediate `tour_reschedule`). Adapter does not call orchestrator.

## Exactly-once

One facade execute → one adapter → one `rescheduleTourBooking` → zero RegisteredAction / Mutation / Relationship / Delete Lead fallback.

## Automation boundary (documented only)

```text
Commands emit domain events (e.g. tour_rescheduled) that Automations may consume.
Automations may invoke Commands through the same Command Runtime.
Automations do not own Tour mutation execution and cannot spoof org/actor.
```

P5.S1 does **not** implement Automation product, triggers, or UI.

## Staging reconciliation (pre-slice)

Merged 2 create-lead intake commits (`bd5164b60`). No Tour/Command Runtime overlap. P0–P4 focused regression: 100 passed before edits.

## Tests

P0–P4 + P5.S1 Commands focused: **15 files / 186 passed**.  
Tour domain (booking/comms/lifecycle/reminders): **5 files / 31 passed**.  
Production `npm run typecheck`: **pass**. `typecheck:tests`: deferred (machine pressure; concurrent tsc contention observed).

## Remaining P5

| Slice | Focus |
|-------|-------|
| P5.S2 | `cancel_tour` destructive cutover — **shipped** (see below) |
| Later | `complete_tour`, `no_show_tour`, `schedule_tour` convergence |
| Deferred | `reopen_tour` execution |

---

# P5.S2 — Cancel Tour Destructive Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Capability | `cancel_tour` |
| Impact | `cancel` |
| Subject grain | `tour_bookings.id` (booking retained) |
| Final executor | `cancelTourBooking` |
| Adapter | `web/lib/platform/commands/runtime/adapters/cancelTourAdapter.ts` |
| Confirmation | `strong_confirm` + preview token |
| Recovery | `schedule_new` (not reopen) |
| Direct API | `POST .../bookings/:id/cancel` unchanged (Option A) |

## Semantics (proven)

Soft cancel: status → `canceled`, row retained. Idempotent domain return for already `canceled`/`completed`/`no_show` — facade blocks terminal states before delegation. Optional `cancel_reason`. Reminders canceled via `orchestrateTourBookingCanceled` (`reminderAction: cancel`). Event `tour_canceled`. Opportunity integration kind `canceled`. Does not delete lead, withdraw participants, or create a new booking.

## Fingerprint

`sha256(bookingId|status|start|end|tz|location)[:32]` in preview token version_match.

## Exactly-once

Facade commit → adapter → `cancelTourBooking` once; no reschedule; no direct writes; no orchestrator import.

## Behavior-parity matrix

| Concern | Direct POST cancel | Facade path | Notes |
|---------|-------------------|-------------|-------|
| Authorization | requireAdminOrOps | same floor + permission class | preserved |
| Booking lookup | org-scoped | same | preserved |
| Status eligibility | domain terminal no-op | explicit blockers pre-delegate | strengthened clarity |
| Cancellation reason | optional body | optional payload | preserved |
| Booking mutation | cancelTourBooking | same | preserved |
| Reminder / comms | domain orchestrator | same | preserved |
| Event/audit | domain | same | preserved |
| Response | `{ booking }` | compatible + envelope | preserved |
| Confirmation | UI / none on API | preview + strong confirm + token | **intentionally strengthened** |

## Staging

0 behind at start; no reconcile required. Pre-edit P0–P5.S1: 112 passed.

## Tests

P0–P5.S2 Commands + Tour booking/comms/lifecycle: **19 files / 218 passed**.  
Production `npm run typecheck`: **pass**. `typecheck:tests`: deferred (machine pressure).
