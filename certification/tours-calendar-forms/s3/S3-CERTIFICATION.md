# S3 — Tour schedule authoring — certification record

Sprint: Tours, Operating Calendar & Public Forms · slice S3 · **commit-only, not promoted.**
Lane: Enrollment (`lane_2cea84351d90`) · objective `OPWORK_2CEA84351D90_SPRINT_80ADA49DE68E` · run `erun2_4e9df96d92aab429`.
Base: sprint `86cab0bd9` (S2) on `origin/staging` `9d5655603`. Staging has not moved since the S2 reconciliation.

## Representation (no migration)

A **weekly schedule** is a group of ordinary `tour_availability_rules` rows: one per weekday × window, tagged
`metadata.tour_schedule = { id, name }`. The slot engine (`computeSlotsFromRulesAndBookings`) is still the only
slot authority and reads the same rows. Bookings never reference a schedule; they keep `metadata.rule_id`.

| Operation | Behaviour |
|---|---|
| Create (`POST /api/admin/tours/schedules`) | One insert of N rows (days × windows) at an exact scope (location, or `NULL` = organization-wide) |
| Edit (`PUT …/schedules/[id]`) | Reconcile, not replace. An unchanged day × window keeps its row **and id**, so a family holding slots from it can still book. New pairs are inserted, dropped pairs deleted, and shared settings are one UPDATE. Every statement is bounded by org + exact scope + schedule id. If an update fails after the insert, the new rows are removed |
| Delete (`DELETE …/schedules/[id]?location_id=`) | That schedule's rows at that scope only; bookings untouched |
| Duplicate | Client builds a draft from the group's **configuration** (name → "Copy of …") and POSTs it. There is no id, booking, reminder, token or history to copy |
| Legacy single rules | Shown as one-window groups; edited in place through the existing per-rule route |

Validation (server): weekdays 0–6, any subset and not necessarily consecutive, no duplicates. Windows must end after they
start, must not overlap within a schedule, and must be at least one tour long. The zone must be valid IANA (`PST` is
refused). Unknown keys are refused.

## Defects / requirements

| ID | Disposition | Proof |
|---|---|---|
| T05 reusable weekday schedules | DONE | unit + live: Mon–Fri × (8:30–10:30, 2:30–3:30) = 10 rules; the canonical loader offers 8:30, 9:00, 9:30, 10:00 AM, 2:30, 3:00 PM on exactly Mon–Fri; nonconsecutive Mon/Wed/Fri |
| T02 duplicate | DONE | unit: copy carries configuration keys only; live: duplicate to location B → 8 new rules at B, 0 bookings at B, B's Monday 8:30 fully open while A's is booked |
| T04 weekday organization | DONE | "Week at a glance", Monday first, time-ordered, inherited entries labelled |
| D-T6 org-wide rules hidden at a location | FIXED | The Locations cache and client kept only `location_id = X`. They now keep the org-wide rules that generate slots there, and "tours configured" counts them (unit test) |
| Inherited vs local edit authority | ENFORCED | Per-rule PATCH/DELETE take `?scope=`; an org-wide rule edited from a location → 409 `TOUR_RULE_SCOPE_MISMATCH`, and the write is measured as never attempted. Schedule routes match the exact scope, so a location request **cannot find** an org schedule (live: 404, org rows byte-identical) |
| Overlapping rules double-offered a time | FIXED in the slot engine. An identical time at one site is offered once; capacity is the most generous rule's (same as `offeredSlotCapacity` and the DB guard); attribution goes to the **approval-required** rule, so merging can never auto-confirm a time that needs approval. Partial overlaps already shared one booking count | unit + live; **negative control**: with the merge removed, 3 tests fail (2 unit, 1 live) |
| T03 12-hour / site zone | DONE. Rule times are wall-clock in the rule's zone and formatted without conversion ("8:30 AM"). New schedules default to `resolveLocationTimezone` (location → org), then the zone existing tour rules use, else ask — never the browser's zone. Opportunity drawer and schedule modal: booking instants in the booking's zone snapshot, `en-US` 12-hour (previously the browser locale, so 24-hour on many machines) | unit: DST — the same 8:30 AM is `16:30Z` on Fri 2027-03-12 (PST) and `15:30Z` on Mon 03-15 (PDT); operator format "Wed, Jun 30, 2027 · 1:00 PM EDT" |
| Existing bookings intact after authoring | PROVEN live: a confirmed booking row is byte-identical after a schedule edit and after the schedule's deletion |
| Unrelated rules unchanged by an edit | PROVEN live: a second schedule and a legacy rule are byte-identical after editing the first |

## Validation

| Gate | Result |
|---|---|
| `vac run typecheck` | rc=0 |
| `vac run typecheck:tests` | rc=0 |
| `npm run prebuild` (6 guards; the new routes are declared in `routeCapabilities.declared.json`: POST/PUT/DELETE `tours.configure`, GET `none` with reason) | rc=0 |
| New tests | `tourWeeklySchedules.test.ts` 20, `tourRuleScopeAuthority.test.ts` 9, `locationConcernCache` D-T6 case, `toursAuthorityLock` now covers 6 configure routes |
| Live cert DB (`tests/tours/live/tourWeeklySchedules.live.test.ts`) | 7/7, run in a throwaway org (org-wide rules on the shared tenant would leak slots into other lanes' suites); zero residue (no `zz-s3-*` org remains) |
| Affected batch (73 files: tours, locations, opportunity tour UI, pins) | 902 passed / 4 failed. **All 4 also fail on base `86cab0bd9`** (`configurationRuntimeLocations` "offerings checklist", `rawSelectAdoptionLedger` ×3 from 24 other files), so they are inherited |
| Production build | **Deferred** to the sprint's integrated checkpoint (mandatory; recorded in the sprint record) |
| Browser QA | Not run in this slice |

## Not changed / open

- Focus-panel tour card (`formatTourStartLabel`) still formats in the **viewer's** zone. Its operational signal carries no
  booking zone, and `_active_tour_booking` is never populated. This is a projection change, recorded for S6.
- Free-text `timezone` on legacy rules is not migrated. Legacy rules keep working; new schedules require IANA.
- Schedules have no exceptions or blackout dates. Closures arrive with S5/S6 through the operating calendar.
