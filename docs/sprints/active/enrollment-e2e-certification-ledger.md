# Enrollment E2E Certification Ledger

**Worktree:** `wt5-epp-runtime-convergence` · **Slot:** 5 · **Port:** 3015  
**Updated:** 2026-08-13 (Tours family-grain WV + Studio Delivery & automation UI)

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

### Tours Work View (family-grain — configured, not hardcoded)

**Live Firefly published config (rev 12):**
- Grain: `row_grain_v1: family`
- Predicates: `has_active_tour = true` AND `tour_date = next:7:days`
- No `opportunity_stage = tour` (that kept Waitlist families out)
- No `compat_queue_key: tours` (that hosted on empty Tours stage WU)
- Settlement host: New Leads (`lifecycle_wu_lead`) — same process population as All

**Runtime:** `attachActiveTourFactsToOpportunityRows` before `computeOperationalProjection` (provisioning + queue-view-totals). QueueService booking `id IN` bypass **removed**.

**Browser cert (3015):** `Waitlist 2 · Tours 1 · All 1` · Kurzman family row on Tours · stage badge remains Waitlist.

### Studio Delivery & automation

**Path:** Workspace → Inbox → Studio → Templates → Tour Reminder / Confirmation / …

| Control | Persists to |
|---------|-------------|
| Reminder enabled / hours before / channels | `org_settings.metadata.tour_comms.reminder_offsets[0]` |
| Ask parent to confirm | `tour_comms.ask_parent_confirm_attendance` |
| Internal recipients (0/1/many staff picker) | `tour_comms.internal_recipients` |
| Template subject/body | `communication_templates` only |

**Landed / in branch**

- Family-grain Tours Work View via configured `has_active_tour` fact + published Firefly WV
- Regression: `tests/lifecycle/familyGrainToursWorkViewActiveTour.test.ts`
- Studio Delivery & automation card + `tourCommsStudioPolicy` helpers/tests
- What's Next: Scheduled Tour; no Host; no raw `confirmed`
- Activity labels + timezone via canonical helpers
- Tour commands rewrite Schedule→Reschedule/Cancel when booking active
- Internal ICS to configured recipients (0/1/many)
- Host model removed from config/writes/UI

**Handoff**

- Commit → rebase `origin/staging` → push/update PR → **STOP before merge**
- Manual UAT checklist in final report

## Prior ledger items (verify done)

Composer convergence, Tour invitation href/text, Template Studio UX, waitlist ranking typography, parent booking Confirm Tour, friendly links, activity semantics — see audit folders under `docs/audits/active/enrollment-e2e-*`.
