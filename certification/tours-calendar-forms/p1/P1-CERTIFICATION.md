# Tours & Public Forms — P1 post-release polish: certification record

**Branch** `sprint/tours-polish-p1` (local; not pushed) · **base** staging `b5abf2d02` (#1606 merge) ·
**candidate** `10febe244` (+ this record) · **outcome** COMPLETE_COMMITTED_READY_FOR_DIRECTOR_QA.
No PR, merge, push or deployment was performed.

## Commits (on top of `b5abf2d02`)

| SHA | Slice |
|---|---|
| `1a7bd49a3` | I1 delivery evidence receipt (cherry-pick of local-only `157b4b82d`; docs only) |
| `95167c634` | Forms P1-C — Preview uses the runtime's row primitives (no second layout interpreter) |
| `2edcd6446` | Tours P1-B — configurable CTA (default "Schedule a Tour") + contrast-safe brand button pair |
| `f6ff6dbb9` | Tours P1-A — Availability / Booking experience / Preview & Share; org route; schedule shown once |
| `1de557cde` | Forms P1-C — rows follow the FORM's width (container query); hover keeps 4.5:1 |
| `b50b3af3b` | P1-A evidence — staging census of tour rules + regression test of that exact shape |
| `10febe244` | Preview & Share route gated by `tours.configure`; Studio Preview inputs; walkthrough; browser evidence |

## Root cause — "Monday appears twice"

Census `p1-tour-rule-presentation-census.sql` (`gar_53077cd111c5b8`, ALLOY_STAGING, read-only): the
Director's organization has 6 tour rules, all legacy standalone windows (no schedule identity).
**Organization-wide Monday 09:00–12:00 exists as two identical rows**; South Campus adds Monday 10:00–12:00.

- *Duplicate source rules:* yes — two identical org-wide rows.
- *Duplicate presentation:* yes — each row became its own "Monday window" card AND its own "Week at a
  glance" entry, so the duplicate showed twice over, beside the location's own Monday.
- *Duplicate bookable slots:* no — `offerEachTimeOnce` offers an identical time once at max (not summed)
  capacity (pinned in `toursPolishP1.test.ts`).
- Nothing was deleted. Removing one row is an operator decision at `/organization/tours` (walkthrough §9).

## Organization-wide tour configuration — owner and route

The owner was always `/adminV2/settings/tours/availability` (scope "Organization-wide (all locations)"),
but **no navigation reached it**. P1 adds the browser route **`/organization/tours`** (rewrite onto the
same surface — no second schedule authority) and links to it from every location's Tours tab.
Inheritance is **additive** (engine unchanged): org-wide schedules apply at every location; a location
adds its own and cannot switch an org-wide one off. The UI now says exactly that.

## What changed for operators

- **Tours tab** = `SettingsEntityTabBar`: **Availability · Booking experience · Preview & Share**.
- **Availability**: ownership box (n set here + m organization-wide); each schedule once with weekday chips
  and all windows; repeats named on both cards; inherited cards read-only ("Copy to this location", with a
  note that the original keeps applying). "Week at a glance" removed.
- **Booking experience**: School identity · Brand colour (picker, derived-pair explanation and ratio) ·
  Booking button text; miniature of the booking page's step 1 and the website button.
- **Preview & Share** (new; previously API-only per S7): lists the location's intake links, publish /
  withdraw via the existing guarded link PATCH, hosted URL (Open/Copy), iframe snippet, website button
  snippet. Read route `GET /api/admin/tours/calendar-links` requires `tours.configure`.

## Branding / CTA

`public_brand_v1.tour_cta_label` (org default, location override). `brandButtonColors(accent)`: brand
never altered; fill+label derived at ≥ 4.5:1 — white on the brand if it holds; mid-tone brands deepened in
hue under white (Bend Pine `#00A283` → `#00856B`, 4.60:1); light brands keep their fill under a deep
same-hue label (`#FFD400` → `#665500`, 5.12:1). Exhaustive test over all 4,096 12-bit colours.

## Forms parity

1. Preview had its own row code (flex `gap-3` vs the editor's `gap-2.5` widths → two halves need
   100% + 0.125rem → always wrapped). Now uses `composeRuntimeRows`/`runtimeRowClass`/`runtimeCellSpanClass`.
2. Runtime rows switched at the **viewport** `md` (768px); the 760px iframe has `innerWidth` 760, so a
   542px-wide form stacked when framed but not standalone. Now `@container` + `@md` (28rem of form width).

## Browser evidence (Chromium, `browser/`)

Public journey on the shared cert stack (dev server on this worktree, `.env.certification.local`; external
origin `localhost:4719` framing `127.0.0.1:3014`):

| Variant | Two-column parent fields | First / Last (x, w) | Buttons | Errors |
|---|---|---|---|---|
| standalone 1440 | yes | 449/732, 259 | white on `#00856B`, 4.6:1 | 0 |
| iframe 1440 (760 frame) | yes | 399/682, 259 | same | 0 |
| standalone 390 | one column | 49, 292 | full width 316 | 0 |
| iframe 390 | one column | 73, 244 | full width 268 | 0 |

- Step 2 stays **inside the frame** (parent URL unchanged); state in `?start=&end=`.
- Submit → Processing case `needs_resolution` with requested tour + `marketing_consent` (email true,
  sms false, `committed: null`); **0 bookings, 0 messages, 0 scheduled sends** before approval.
- Unavailable slot (window withdrawn mid-form): "That time is no longer available…", answers kept.
- Brand matrix (computed styles, tour page and standalone form identical): org `#1F6FEB` → location
  `#B91C1C` → form snapshot `#7C3AED` → draft-only `#FFD400` **did not** change the page → republish
  `#FFD400` did; iframe matched.
- Operator screens (read-only, own dev server on default/hosted config with the lane's QA session; no
  writes): South Campus shows 1 + 4 schedules, two "Monday window" cards flagged; Studio Edit and Preview
  pair the same fields at 299px each.

**Not browser-verified:** approval through the operator UI (session/database mismatch on cert; the I1 live
suite covers Approve against the real database) — walkthrough §G. The Firefly production website was not
accessed.

## Validation

- Targeted: `toursPolishP1` 21/21; tours/branding/forms/configuration sweep 2,086/2,122 — the 36 failures
  are identical per file on untouched `b5abf2d02`; access sweep 19 failures, identical on base.
- `vac run typecheck` PASSED · `vac run typecheck:tests` PASSED · all six prebuild guards exit 0 ·
  `vac run build` PASSED on `10febe244`.

## Communications debt (not included — owned by Communications)

1. Opted-out direct send → HTTP 500: `executeLegacyCommunicationsSendAdapter.ts:382` folds an
   `eligibility_blocked:*` skip into "insert failed". Suppression is correct upstream. Small, safe fix
   (4xx `recipient_suppressed`), but outside this polish.
2. Consent evidence not shown to operators: stored on the case, read only by Approve. Read-model + card.
3. C1 Python tests: **no CI workflow runs pytest** (I1's "CI runs them" is incorrect). Not runnable on
   this host (Python 3.9; tests need ≥ 3.10 + pytest). Needs a CI job.

## Documentation / context impact

S7-CERTIFICATION's "No operator UI toggle yet (API only)" is superseded by Preview & Share. I1's C1
"CI runs them" is corrected above. Accessibility note for Forms: runtime `<label>`s are not associated
with their inputs (no `for`/`id`) — pre-existing; recommended follow-up.

## Residue

Cert (Northwind): two synthetic Processing cases (`qa+p1qa-mvqudlj0-…@example.invalid`) — processing facts
are immutable; everything else from the fixture was deleted and the org brand restored.
