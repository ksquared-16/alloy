# Interactive Tour — Slice C handoff

**Status:** code-complete, CI green, PR open as **draft**. Awaiting Kelly's review.
**Date:** 2026-08-03
**PR:** https://github.com/ksquared-16/alloy/pull/300
**Branch:** `feat/interactive-tour-invitation` (pushed) · base `b7a63e289` · 7 commits ahead of `origin/staging`
**Worktree:** managed slot worktree (superseded — the work now lives in the slot-4 worktree `wt4-interactive-tour-delivery` on branch `agent/claude/4-interactive-tour-delivery`)

Do **not** start Slice D, delivery, parent UI, reminders, or timeline UI. Slice C is
pending review, and one certification item is deliberately unfinished (see §5).

---

## 1. What Slice C is

Hardening of the **existing** public tour-booking flow so it can safely carry
recipient-scoped invitation, scheduling, decline, reschedule, confirmation and
cancellation.

The pre-existing flow is canonical and was **reused unchanged** — token hashing,
rate limiting, `computeAvailableTourSlots`, `createTourBooking`,
`confirmTourBooking`, `rescheduleTourBooking`, `cancelTourBooking`. Nothing was
replaced. Slice C added authorization, not lifecycle.

### The four gaps it closes

The old flow scoped links to org + opportunity + location but **not to a
recipient**, so possession of a token was the entire authority. One link could
also do everything, nothing was single-use, and nothing tied a sent message to
the options it presented.

| Gap | Closure |
|---|---|
| No recipient binding | `tour_invitations.recipient_person_id` is `NOT NULL`; the authorizer compares link ↔ invitation |
| One omnipotent link | `action_kind` per link, closed 7-kind vocabulary, one capability each |
| Unbounded reuse | `consumed_at` for single-use, `max_uses`/`use_count` for reusable |
| Message ↔ offer unlinked | `option_snapshot` on the invitation; one invitation per offer across transports |

**One invitation per offer.** Email and SMS deliveries share it — that is what
stops two transports becoming two competing bookings.

---

## 2. Exit inventory

```
Public tour routes using canonical authorizer: 7/7
Canonical invitation creators:                 1
Canonical scoped action minting services:      1
New unscoped links possible:                   no   (DB CHECK, not convention)
Omnipotent tokens:                             0
Recipient-unbound actions:                     0
Raw tokens stored:                             0
Legacy active links:                           0
Compatibility execution paths:                 0
```

---

## 3. Files

**Migration (1)** — `supabase/migrations/20260801120000_tour_invitation_and_scoped_public_actions.sql`
Creates `tour_invitations`; extends `tour_public_booking_links` with
`invitation_id`, `recipient_person_id`, `action_kind`, `booking_id`,
`consumed_at`, `revoked_at`, `use_count`, `max_uses`, `authorization_model`.
CHECK `tour_public_booking_links_scoped_complete_chk` makes the **database**
enforce that a `scoped` link carries full authority — not merely the code path
that happens to insert. Additive only; 0 destructive operations.

**Library (7)** — `web/lib/tours/`
- `public/authorizeTourAction.ts` — THE authorizer. `TOUR_ACTION_KINDS` (7),
  `TOUR_ACTION_CAPABILITY`, `TOUR_ACTION_REUSE`, `consumeTourAction`
  (conditional `UPDATE ... WHERE consumed_at IS NULL` as concurrency control),
  `invalidateIncompatibleTourActions`
- `public/tourActionRouteGuard.ts` — single entry point; `requiredActions` is a
  route constant, never request-supplied; forgery-shaped failures all → 404
- `public/loadBoundBooking.ts` — booking id comes from the credential, never the request
- `public/tourPublicRateLimit.ts` — budgets for all 7 routes; exports `TourPublicRateLimitKind`
- `invitation/mintTourInvitation.ts` — the ONLY creator of tour links
- `invitation/tourInvitationContent.ts` — authored content contract (Slice A)
- `events/recordTourEvent.ts` — writes `workflow_events`; **refuses**
  credential-shaped detail keys rather than stripping them

**Routes (8)** — 7 under `web/app/api/public/tour-booking/[token]/`
(resolve, slots, book, decline, confirm, reschedule, cancel), plus the deletion
of `web/app/api/admin/tours/public-booking-links/route.ts` (legacy unscoped
creator, zero callers — deleted outright, no tombstone warranted).

**Tests (4)** — `web/tests/tours/` — 162 cases total across
`tourInvitationContent`, `authorizeTourAction`, `tourActionRoutes` (drives the
REAL route handlers through the REAL guard), `mintTourInvitation`.

---

## 4. Verification (as of the last push, `a2e8f21d6`)

| Check | Result |
|---|---|
| `Vercel – workwithalloy` (production build) | **pass** |
| `Production graph` (app/lib typecheck) | **pass** |
| `P1 certification gates` | **pass** |
| Slice C behavioural suites | **162 passed** |
| `tests/tours` overall | 255 passed / 5 failed |
| `verify:module-imports` | ok, 8722 files |

**The 5 `tests/tours` failures are pre-existing** `opportunityTourScheduleUx`
source-shape assertions. This branch touches none of those files.

**`Full graph` fails and that is pre-existing** — `typecheck:tests` reports 65
errors across 22 files, **zero in `tests/tours`** (harness, layout, lifecycle,
platform/commands, presentation, adminV2). The same failure merged red on
#292 and #294. Verified by comparing the failing file set, not by assumption.

---

## 5. The one unfinished item — isolated DB re-certification

Kelly asked for the isolated database certification to be **re-run**. It was
not. Both paths are closed:

- The shared `alloy-cert` stack has an active lease from
  `wt5-docker-stack-containment`. Kelly's standing rule forbids resetting it
  while another worker may be using it.
- Standing the isolated `alloy-tour-wt2` stack back up is blocked by the
  workstation hook `guard-supabase-start.sh`, which routes that decision to
  Kelly. `certification-tour/alloy-certify up` also short-circuits on the shared
  stack and exits 1 without starting the isolated one.

**This is flagged, not worked around. Do not bypass the hook.**

**Why the prior certification still stands:** the migration SQL has a single
commit (`88504a785`) and the five commits since change only routes, rate limits
and tests. `git diff origin/staging...HEAD -- supabase/migrations/` is unchanged
from its certified state. That earlier run produced:

```
PASS  rejected scoped link missing invitation_id
PASS  rejected scoped link missing recipient_person_id
PASS  rejected scoped link missing action_kind
PASS  rejected arbitrary action_kind
PASS  rejected arbitrary invitation status
PASS  rejected use_count exceeding max_uses
PASS  fully scoped link accepted
```

plus clean replay of 303 migrations, idempotent rerun ×2, 8 indexes, 7 FKs, and
0 legacy rows needing conversion. Run against **real FK-backed fixtures** — an
earlier attempt proved nothing because a fake `opportunity_id` tripped an FK
before the CHECK was ever reached.

---

## 6. Defects found during Slice C — read these before writing more tests

**Terminal invitations were dead ends.** The authorizer treated `declined` /
`booked` as non-actionable, so a parent clicking decline twice got "this link is
no longer valid" instead of "you already declined." `usable` now includes both.
The authorizer only answers *"is this forged?"* — what a terminal state *means*
is the route's decision.

**Live revalidation rejected every booking.** `AvailableTourSlot` is camelCase
(`startAt`, `ruleId`). Both `book` and `reschedule` annotated the revalidation
callback with a hand-written *snake_case* shape, so every comparison read
`undefined` → `NaN` and `stillAvailable` was **always false**.

**And the tests mirrored the bug.** The route suite mocked availability in that
same invented shape, so 70 cases passed over a permanently-rejecting path. The
fixture is now typed `AvailableTourSlot[]`. **Lesson: a structurally-typed fake
only certifies the shape it invents — type fixtures against the real type.**

**Four routes would have 500'd.** `decline`, `confirm`, `reschedule` and
`cancel` passed rate-limit kinds absent from `TOUR_PUBLIC_RATE_LIMIT`, resolving
to `undefined` config and throwing on `cfg.windowMs`. `routeName` is now typed
`TourPublicRateLimitKind` so a new route cannot ship without a budget.

All three of the last group were caught by **CI, not by local runs** — see §7.

---

## 7. Environment traps in this worktree

**`node_modules` gets swept.** It was missing mid-session, and a `tsc` run
against the empty tree reported "0 errors" — a false clean that was briefly
reported as real. **Always confirm `web/node_modules` exists before trusting any
local typecheck or test result.** Recover with `npm ci` from `web/`.

**Local `tsc` gets reaped** (exit 144) on this memory-constrained machine even
with `--max-old-space-size=6144`. **Treat CI's `Production graph` as the
authoritative typecheck**, not a local run.

**Use arm64 node:** `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
`npx vitest` fails to resolve `vitest/config` — use `./node_modules/.bin/vitest`.

---

## 8. Standing constraints (still in force)

- Do not push, merge, rebase, create/update a PR, trigger Vercel, or modify
  `staging` without Kelly's explicit authorization.
- No live provider sends. Provider clients mocked. **Do not send to a real family.**
- Do not log raw codes or persist raw tokens; no tokens in event payloads or
  timeline payloads; no token hashes as public IDs; never reuse one raw token
  across action kinds.
- No ownership guesses — ambiguous or unmapped objects fail closed.
- Never raw `supabase db reset` — use `alloy-db-reset --recover-docker`.
- Never run `supabase start`; use `alloy-stack use` / `alloy-stack release`.
- Do not reset or mutate the shared cert stack while another worker holds a lease.
- Deterministic command parsing for SMS replies — never an LLM deciding whether
  a recipient confirmed or cancelled.

---

## 9. Next actions, in order

1. **Kelly reviews PR #300** and decides whether the existing migration
   certification suffices or the isolated re-run must happen first.
2. If the re-run is required, Kelly authorizes either the isolated stack (hook
   override) or a window when the shared stack is unleased.
3. Mark #300 ready and merge **only** on Kelly's explicit authorization.
4. Update the Code Retirement Ledger with the legacy creator deletion
   (`6ca61e346`) and its evidence. **Still outstanding.**
5. Only then: Slice D (email/SMS delivery of the invitation).

---

## Program context

Conversation Platform V1 — Phase 0 complete and merged; Phase 1 Slice 1 merged
(#295); GHL retirement complete. Interactive Tour milestone: Slices A and B
certified, C at review. Program ~6%; milestone ~35%.
