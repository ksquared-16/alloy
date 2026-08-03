---
owner: platform
status: active-sprint
last_reviewed: 2026-08-03
supersedes: []
---

# Interactive Tour — Slice D: invitation delivery

The first customer-visible path: an operator sends a tour invitation, and a parent
receives an email/SMS carrying secure no-login actions.

Slice C built the authority (invitation model, scoped public actions, authorizer,
seven routes). Slice D makes it **reachable** — it adds no new runtime.

---

## 1. The authority chain

| # | Concern | Owner | Status |
|---|---|---|---|
| 1 | Operator entry point | `POST /api/admin/actions/execute` → `getRegisteredAction` | exists |
| 2 | Registered capability | `send_tour_invitation` registered action | **new (Slice D)** |
| 3 | Mutation runtime + audit | `executeAdminAction` | exists |
| 4 | Recipient identity | `resolveTourCommsParentRecipient` | exists |
| 5 | Offered times | `computeAvailableTourSlots` | exists |
| 6 | Authored content | `buildTourInvitationContent` (`TourInvitationContent`) | exists (Slice A) |
| 7 | Invitation authority + idempotency | `mintTourInvitation` | exists (Slice C) |
| 8 | Secure action URLs | minted `action_kind` tokens → `/tour-booking/<token>` | exists (Slice C) |
| 9 | Rendering | `renderTourCommsTemplate` + `tour_invitation` event key | **extended** |
| 10 | Enqueue | `enqueueCanonicalOutboundMessage` | exists |
| 11 | Dispatch | existing provider queue (`triggerQueue`) | exists |
| 12 | Conversation/activity | `communication_messages` + `recordTourEvent` → `workflow_events` | exists |
| 13 | Current Work refresh | existing opportunity queue/drawer refresh events | exists |

**One operator entry point.** Every surface — Focus Panel, Current Work, drawer,
BOS — executes the same registered action. There is no tour-specific endpoint.

**One sender.** `tourCommsOrchestrator` already owns tour rendering, idempotency,
enqueue and skip reasons. Slice D extends it; it does not add a second sender.

### Idempotency — two independent boundaries

1. **Invitation** — `invitationFingerprint(recipient, opportunity, location, optionIds)`
   under a caller-supplied `idempotencyKey`. A replay returns the same invitation with
   `idempotentReplay: true`; a *changed* payload under a used key fails closed with
   `idempotency_payload_changed`.
2. **Dispatch** — `tour_scheduling:immediate:<subjectId>:<eventKey>:<channel>:<generationToken>`,
   checked against `communication_messages.metadata` before enqueue.

Both are required. The first stops duplicate active invitations; the second stops
duplicate sends of the same invitation.

---

## 2. What Slice D changes

**Extended, not duplicated:**

- `TourCommsEventKey` gains `tour_invitation`. The existing vocabulary
  (`tour_confirmation`, `tour_reschedule`, `tour_cancel`, `tour_reminder`,
  `tour_no_show_followup`) is entirely **post-booking**; an invitation precedes a
  booking, which is why no existing key fits.
- The orchestrator's send path is generalized from `booking: TourBookingRow` to a
  `TourCommsSubject` (`{ id, opportunityId, locationId, kind }`). A booking and an
  invitation are both subjects. This is the convergence that avoids a second sender.

**New:**

- `sendTourInvitation` — composition only: resolve recipient → compute slots →
  build content → mint → render/enqueue → record event.
- `sendTourInvitationAction` — the registered action wrapper.

**Note on a dormant path.** `orchestrateTourCommsForBooking` (621 lines, tested) had
**zero production callers** before this slice — it was built and never wired. Slice D
does not fix that for booking lifecycle events; that is recorded as debt, not silently
adopted.

---

## 3. Acceptance criteria → evidence

| # | Criterion | Evidence |
|---|---|---|
| 1 | Operator sends from canonical context | registered action on `opportunity` |
| 2 | Executes through a registered capability | `REGISTERED_ACTION_LIST` + capability registry |
| 3 | Recipient resolved server-side | `resolveTourCommsParentRecipient`; no client-supplied recipient |
| 4 | Invitation created or safely reused | `mintTourInvitation` fingerprint |
| 5 | No duplicate invitations or dispatches | both boundaries above |
| 6 | Canonical rendering + enqueue | `renderTourCommsTemplate` → `enqueueCanonicalOutboundMessage` |
| 7 | Action URLs scoped | one `action_kind` per token; DB CHECK |
| 8 | Appears in conversation/activity | `communication_messages` + `workflow_events` |
| 9 | Accurate operator success state | action result + refresh |
| 10 | Failure states in operator language | typed skip reasons → operator copy |
| 11 | No direct client DB writes | all writes server-side |
| 12 | No second runtime | extension only |
| 13 | Focused tests + gates pass | see §4 |
| 14 | Inherited failures separated | see §4 |

---

## 4. Verification posture

**Inherited from staging — not branch-owned, must never be reported as passing:**
five `opportunityTourScheduleUx` source-shape assertions in `tests/tours`. This
branch touches none of those files.

CI is authoritative. Local `tsc` is reaped on this workstation, and a run against a
swept `node_modules` once reported a false "0 errors". Trust `Production graph` and
the Vercel build over any local typecheck.

---

## 5. Deliberately out of scope

Parent-facing invitation UI beyond the existing `/tour-booking/<token>` page,
reminders, and inbound SMS reply handling (`1` to confirm). Slice D ends when the
message is sent, recorded, and visible.

## 6. Slice C — closed

The isolated DB re-certification ran on 2026-08-03 under an exclusive lease:
307 migrations replayed clean, migration idempotent across two re-applies, 11/11
assertions passed against real FK-backed fixtures. Evidence and the now-committed
script live in `certification/interactive-tour/`.
