# S1 — Tour booking & communication safety — certification record

Sprint: Tours, Operating Calendar & Public Forms · slice S1 · **commit-only, not promoted.**

## Lineage

| Item | Value |
|---|---|
| Base (`refs/remotes/origin/staging`) | `8bb731eadbf306d269f8249da127ed09289b7076` (#1572) |
| Sprint branch | `sprint/tours-calendar-forms` — created at the base for S1 (did not exist) |
| D0 record | `70f22cd9b` (D0 discovery committed unmodified) |
| S1 implementation | `de437752b67fa45d4c436577d3103d0bea91c153` |
| Pushed (operator-authorized, governed, no PR) | `origin/sprint/tours-calendar-forms` gar_f30fc7c5b83ce0; `origin/agent/claude/tours-s1-cert` (same SHA, exists only because the certification apply resolves `agent/**`/`promotion/**`/`staging` refs, not `sprint/**`) gar_0eeb5837138556 |
| Migration 20261206090000 | applied to **local certification (`alloy-cert`) only** — gar_9bc53323a8010b / tha_cd7b663ac290ae. **Not applied to staging or any deployed database.** |

### Migration renumbered (2026-10-23)

`origin/staging` moved to `7741db690`, whose newest migration is `20261209090200`. A fresh database
replays the directory in name order, so the S1 guard was renumbered **`20261206090000` →
`20261210090000`** with byte-identical SQL. The certification apply above ran the identical SQL
under the old version; the body is re-runnable (`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`).
The local certification ledger may still carry `20261206090000` — reconcile it (repair the old
version out, record the new one) before any further governed certification apply. Recheck the
version against `refs/remotes/origin/staging` at sprint integration: staging may move again.

Note: `web/tests/financials/migrationVersionOrdering.test.ts` resolves the ambiguous name
`origin/staging`; in this worktree a stale LOCAL branch `refs/heads/origin/staging` (`66d6ee27f`)
wins that resolution, so the guard can pass falsely here. Owner: Financials test; not changed by S1.

## Defect disposition

| D0 id | Disposition | Proof |
|---|---|---|
| D-T1 pending booking sent "Your tour is confirmed" | CLOSED — `mayCommunicateForTour` gates every orchestrator side effect on re-read booking state | live: pending booking → 0 outbound rows, 0 reminders; unit: every non-approved status |
| D-T2 family self-approval via `confirm_tour` | CLOSED — not minted; legacy link records attendance only | route tests: staff confirm never called; status stays pending |
| D-T3 approval counted the booking against itself | CLOSED — `excludeBookingId` passed through | live: capacity-1 pending booking approved; another occupant still blocks |
| D-T4 due reminders not rechecked | CLOSED — dispatch revalidation | live: booking canceled behind the orchestrator → `suppress booking_canceled` |
| D-T5 no capacity lock | CLOSED — DB trigger + advisory lock | live BEFORE apply: 4 of 4 concurrent writers booked a capacity-1 slot; AFTER: exactly 1, losers refused `23P01 tour_slot_capacity_exceeded`, raw insert refused; 4 consecutive passing runs |
| Workflow bypass on `tour_booking_pending` | CLOSED — messaging actions refused, other actions run | live: real workflow; `create_message` skipped `outbound_refused:tour_comms_ineligible:awaiting_approval`, `log` completed, 0 `messages` rows |
| (found) every due scheduled send blocked `RECIPIENT_UNRESOLVED` | FIXED — adapter passes `recipientPersonId` | live: confirmed reminder dispatch call is not RECIPIENT_UNRESOLVED; negative control with the fix removed fails with RECIPIENT_UNRESOLVED |

## Validation

| Gate | Command | Result |
|---|---|---|
| Typecheck | `vac run typecheck` | rc=0 |
| Test typecheck (Full graph) | `vac run typecheck:tests` | rc=0 |
| Prebuild (6 guards) | `npm run prebuild` (web/, after commit) | rc=0 |
| Production build | `vac run build` | **NOT MEASURED** — S5 broker refused capacity twice (deficit 0.17 / 0.24 GB of an 11.8 GB predicted peak) |
| Targeted S1 suites | `vac run test tests/tours … (59 files)` | 756 passed, 2 failed — the 2 were the trigger cases before the apply |
| Live cert suite | `tests/tours/live/tourBookingSafety.live.test.ts` | 8/8 after apply (×4 runs); 6/8 before apply (defect reproduced) |
| Broad regression | communications, workflows, platform/commands, adminV2, taskAssist (282 files) | 2649 passed / 50 failed — **identical 50** on an untouched `origin/staging` tree |
| Migration/docs scanners | 111 files | 17 failed — all present on base except `contextPackageValidator` drift, fixed by regenerating the manifest (2 blob shas) |

## Authority after repair

- Booking approval: staff only — `confirmTourBooking` behind `tours.book` (admin route, registered `confirm_tour` action). No public credential can approve.
- Tour communications: `mayCommunicateForTour(intent, re-read state)`; approved = `confirmed`/`rescheduled` AND opportunity exists in org (lead accepted by Processing Approve). Cancellation notice only if previously confirmed.
- Recipient eligibility (opt-out, suppression, STOP, channel): unchanged, canonical enqueue, after the tour policy.

## Open for later slices / C-D0

- Tour sends pass no `category`; canonical enqueue records the `operational` fallback. Switching to `transactional` would bypass operational opt-outs — left to C-D0.
- A rejected pending request sends the family nothing; there is no "request declined" message (S7 / C-D0).
- Tours still has no certified lane or owner-map row; this record and `communications-platform.md` § Tour communications authority are the only canonical text.
- `publicTourBookingView` maps `rescheduled` to `held` (pre-existing, cosmetic).
- Production build must be measured before the sprint candidate is promoted.
