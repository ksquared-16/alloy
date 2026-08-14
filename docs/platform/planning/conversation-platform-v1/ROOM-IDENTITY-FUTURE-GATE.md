# Room-level Communications identity — the gate that must be crossed first

**Status: BLOCKED, deliberately. Not scheduled.**

Rooms are shown in `/organization/communications` and show what they inherit.
They carry **no identity controls**, and must not until the gate below is crossed.

**School override → organization fallback is the deepest configurable level.**

## The gate, stated exactly

> Room-specific Communications identities require a canonical outbound
> conversation/recipient context capable of selecting **one** room truthfully,
> including the multi-child / multi-room household case.

Until that authority exists, a room-level control would be ignored by the runtime
on every outbound message. Shipping it would be a configuration surface promising
something the runtime cannot honour — the exact failure the readiness model exists
to prevent.

## Why the runtime cannot answer today

Evidence gathered 2026-08-14 against the live staging tenant.

**1. Outbound never carries a room.** The sender resolver's location comes from
`context_location_id`, written by two producers:

| Producer | Source | Grain |
| --- | --- | --- |
| `enrollmentProjection.ts` | `opportunities.location_id` | **site** |
| `tourCommsOrchestrator.ts` | tour subject location | site |

On staging, every `opportunities.location_id` resolves to a `site`. No producer
supplies a `unit`.

**2. The operator reply path carries no location at all.**
`/api/admin/communications/send` contains no reference to location, and
`resolveContextLocationId` returns the caller-supplied payload value rather than
reading the thread's `location_id`. So even replying inside a room-scoped thread
would not select the room.

**3. The canonical room link is not reachable from a conversation.** The room
relationship is `child_placements.room_location_id`. It is reached through a
**child**, while `communication_threads.primary_entity_type` is `persons` or
`opportunities`. `child_placements` also currently holds **0 rows** on staging.

**4. The ambiguity is real, not incidental.** A parent with children in two rooms
has no single correct room. This is the same class of ambiguity the platform
already refuses to guess for cross-location conversations, where guessing would
send as the wrong campus.

## What is NOT the blocker

- **A schema change.** A room *is* a `locations` row (`location_type = 'unit'`,
  `parent_location_id` → its site). `communication_threads.location_id` already
  holds a room. **No `room_id` column is needed.**
- **A second resolver.** The sender resolver's location tier does an exact match
  on `locationId` and never walks `parent_location_id`. Extending it to
  room → school → organization is one insertion in one resolver — see
  `resolveSenderIdentity.ts`, section "6–7. Location default / priority". The
  ladder is not the problem; knowing *which* room is.

## Inbound is different, and is deliberately not shipped either

Inbound **could** be truthful: a message arriving at a room's own receiving
address *is* that room, unambiguously, because the receiving identity establishes
location. That was considered and rejected for now — a control that works for
inbound and is silently ignored for outbound is harder to understand than no
control at all.

## What would close this

Any one of these, made canonical and populated:

1. An outbound conversation context that carries a room, with a defined rule for
   the multi-child household (most likely: refuse to auto-select, and require the
   operator to choose — the same posture used for ambiguous inbound).
2. A thread-level room established at conversation start and inherited by replies,
   with `resolveContextLocationId` reading the thread rather than the payload.

Either way the requirement is the same: **one room, truthfully, or no room.**

## Related

- `web/lib/communications/locationHierarchy.ts` — `ROOM_IDENTITY_FUTURE_GATE`
- `web/lib/communications/organizationCommunicationsModel.ts` — `RoomIdentityRow`
- `web/tests/communications/organizationHierarchyIdentity.test.ts` — asserts rooms
  carry no binding handle, so the absence cannot regress silently
