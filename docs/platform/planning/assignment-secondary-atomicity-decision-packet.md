---
owner: platform
status: historical
last_reviewed: 2026-10-21
supersedes: []
---

# Secondary Assignment Atomicity and Room Invariants: Decision Packet

Status: **DECIDED. The Director chose option B; it shipped in #1538 (staging `46b696149`), along with the room-under-site trigger (gap 3).** The interim application-level repair shipped in #1532 (staging `69e11f62a`).

## What #1532 already fixed (no migration)

`createOperationalAssignment` is the writer behind `assignment.create` and `assignment.change_room`.
It used to close the prior secondary and then insert the successor, as two calls with nothing
between them. It also found the prior row by id alone. It now:

- refuses a prior row that belongs to another subject;
- inserts the successor first;
- closes the prior row only if it is still live (otherwise: conflict, successor removed);
- refuses a room that does not resolve under the assignment's site;
- refuses a staff room that is not an operational group.

Measured on staging: a replacement rewritten to name another site's room was refused (422 "room
does not resolve to site"), and the existing secondary is unchanged (census `gar_61a812dea28213`).

## What remains, and why it needs a decision

| # | Gap | Today | Needs |
|---|---|---|---|
| 1 | Replacement is not one transaction | A crash between the insert and the close leaves both rows live (visible, recoverable). There is no idempotency key, so a retried request can write a second successor. | A SQL function with `FOR UPDATE` on the prior row, subject scoping and an idempotency key. |
| 2 | The primary primitive cannot serve secondaries | `apply_participation_operational_change` hard-codes `is_primary = true` and child subjects, requires an agreement, and takes no room or category (`20261110120000_named_field_versus_absent_field.sql`). | Either generalise it (a new signature, so every caller is re-certified) or add a sibling function for secondaries. |
| 3 | Room-under-site is enforced only in TypeScript | Writers other than `createOperationalAssignment` (staff `set_primary`, direct inserts) still pass. The trigger `validate_schedule_assignments_consistency` checks only the org. | Extend the trigger, firing only on INSERT or a room/site change, so legacy rows can still be closed. Needs a census of live rows that would violate it first. |
| 4 | `set_primary` uses best-effort compensation | Two statements with TypeScript restore/delete on failure. | Could share the function in option 1. |

## Options

- **A. Accept #1532 as the floor** (no migration). The remaining risk is a process crash
  mid-request (both rows live) and a duplicate successor on retry.
- **B. A sibling SQL function `apply_secondary_assignment_change`** that scopes to the subject,
  takes `FOR UPDATE` on the prior row, inserts the successor, closes the prior row, and records an
  idempotency key, all in one transaction. One migration; `createOperationalAssignment` calls it
  when superseding. The primary primitive is untouched. **Recommended.**
- **C. Generalise `apply_participation_operational_change`** to secondaries and staff. One
  primitive, but a wider blast radius: every primary caller would be re-certified.
- **For gap 3, independently:** an INSERT-or-room-change trigger clause, after a census of live
  violators.

## Director decisions

1. Is option A's residual risk acceptable, or should B be built?
2. Should the room-under-site rule move to the database (gap 3)? If so, how should existing violators be handled?
3. Child secondaries in shared spaces (for example Soccer Shots on a playground): allowed? This is
   the one room rule not ratified anywhere.
