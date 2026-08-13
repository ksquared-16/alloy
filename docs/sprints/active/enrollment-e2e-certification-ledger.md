# Enrollment E2E Certification Ledger

**Worktree:** `wt5-epp-runtime-convergence` · **Slot:** 5 · **Port:** 3015  
**Updated:** 2026-08-13 (Tour finalization — internal recipients, Tours Work View overlap)

## Final Tour scope (user UAT next — do not merge yet)

**Doctrine:** Templates own content; `TourCommsConfig` / workflows own delivery. Booked Tour overlaps Waitlist. Internal recipients ≠ Tour Host.

Canonical ownership: `docs/sprints/active/tour-comms-internal-recipients-config-ownership.md`

| Concern | Owner |
|---------|--------|
| Reminder enabled/timing/channels | `TourCommsConfig` (`reminder_offsets[]`, `channels`, `enabled`) |
| Parent confirmation ON/OFF | `ask_parent_confirm_attendance` |
| Parent recipient policy | `parent_recipient_policy` (seed `primary_contact`) |
| Internal calendar recipients | `internal_recipients` (`enabled` + `user_ids[]`) |
| Templates | Communications Template Library |
| Reschedule/cancel safety | platform invariant |

**Landed / in branch**

- Tours Work View membership = active `tour_bookings` (Waitlist ∩ Tours)
- What's Next: Scheduled Tour; no Host; no raw `confirmed`
- Activity labels + timezone via canonical helpers
- Tour commands rewrite Schedule→Reschedule/Cancel when booking active
- Reminder config-driven; confirm attendance optional
- Internal ICS calendar invite to configured recipients (0/1/many)
- Host model removed from config/writes/UI (legacy DB column unused if present)
- Focused unit tests: tour lane membership, policy acceptance, internal recipients convergence

**Handoff**

- Commit → rebase `origin/staging` → push/update PR → **STOP before merge**
- Manual UAT checklist in final report

## Prior ledger items (verify done)

Composer convergence, Tour invitation href/text, Template Studio UX, waitlist ranking typography, parent booking Confirm Tour, friendly links, activity semantics — see audit folders under `docs/audits/active/enrollment-e2e-*`.
