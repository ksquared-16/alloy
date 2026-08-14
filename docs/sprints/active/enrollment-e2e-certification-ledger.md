# Enrollment E2E Certification Ledger

**Worktree:** `wt5-epp-runtime-convergence` · **Slot:** 5 · **Port:** 3015  
**Updated:** 2026-08-14 (PR #416 integrated to staging — Waitlist/Tour runtime-convergence slice closed)

## Slice status (this PR)

This merge closes the **Waitlist / Tour runtime-convergence** slice. It does **not** claim the entire Enrollment E2E journey is complete.

| Concern | Status |
|---------|--------|
| Waitlist | **Certified** (current scope) |
| Tour Invitation | **Certified** |
| Public Tour booking | **Certified** |
| All / Tours overlapping Work Views | **Certified** |
| Work View switching (in-page lenses) | **Certified** |
| Queue Surface authority | **Certified** |
| Child truth parity | **Certified** |
| Tour automation Rule multi-AND conditions | **Certified** |
| Enrollment compose performance (7–20s+) | **FOLLOW-UP** (not a merge blocker; 60s deadline is non-termination floor) |
| Offer Spot / Registration / Enrollment Packet / final Enrolled | **Subsequent** Enrollment work |

**Doctrine:** Templates own content; Rule / `TourCommsConfig` owns automation policy. Booked Tour overlaps Waitlist. Internal recipients ≠ Tour Host.

Canonical ownership: `docs/sprints/active/tour-comms-internal-recipients-config-ownership.md`

| Concern | Owner |
|---------|--------|
| Reminder enabled/timing/channels | `TourCommsConfig` (`reminder_offsets[]`, `channels`, `enabled`) |
| Automation AND conditions | `TourCommsConfig.automation_conditions_v1` (Work View `filters_v1` shape + `evaluateWorkViewFiltersForRow`) |
| Parent confirmation ON/OFF | `ask_parent_confirm_attendance` |
| Parent recipient policy | `parent_recipient_policy` (seed `primary_contact`) |
| Internal calendar recipients | `internal_recipients` (`enabled` + `user_ids[]`) |
| Templates | Communications Template Library |
| Reschedule/cancel safety | platform invariant |
| K2 provisioning deadline | `PROVISIONING_DEADLINE_MS = 60_000` — **non-termination floor**, not latency budget |

### Tours Work View (family-grain — configured, not hardcoded)

**Live Firefly published config:**
- Grain: `row_grain_v1: family`
- Predicates: `has_active_tour = true` AND `tour_date = next:7:days`
- No `opportunity_stage = tour` (that kept Waitlist families out)
- Settlement host: New Leads / All host — same process population

**Browser evidence:** `docs/audits/active/enrollment-e2e-tour-work-view-membership/` (`family-row-fix-uat.json`, `post-rebase-smoke.json`, `rules-ui-automation-uat.*`, `rules-api-persist-uat.json`)

### Studio Delivery & automation

**Path:** Workspace → Inbox → Studio → Templates → Tour Reminder / …

| Control | Persists to |
|---------|-------------|
| Reminder enabled / hours before / channels | `org_settings.metadata.tour_comms.reminder_offsets[0]` |
| AND conditions (Stage / Campus / …) | `tour_comms.automation_conditions_v1` |
| Ask parent to confirm | `tour_comms.ask_parent_confirm_attendance` |
| Internal recipients (0/1/many staff picker) | `tour_comms.internal_recipients` |
| Template subject/body | `communication_templates` only |

## Prior ledger items (verify done)

Composer convergence, Tour invitation href/text, Template Studio UX, waitlist ranking typography, parent booking Confirm Tour, friendly links, activity semantics — see audit folders under `docs/audits/active/enrollment-e2e-*`.
