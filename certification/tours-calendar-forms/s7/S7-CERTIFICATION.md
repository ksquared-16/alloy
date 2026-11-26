# S7 — Public tour booking, lead intake & approval integration — certification record

Sprint: Tours, Operating Calendar & Public Forms · slice S7 · **commit-only, not promoted. Outcome: PARTIAL**
(implementation and behavioural certification complete; consent-dependent gates outstanding on C1).
Lane: Enrollment (`lane_2cea84351d90`) · objective `OPWORK_2CEA84351D90_SPRINT_80ADA49DE68E` · run `erun2_a109fd7d65706b65`.

| | SHA |
|---|---|
| Starting sprint HEAD | `2cb3eee0b` (S5/S6 record) — S1–S6 preserved, no rewrite |
| `refs/remotes/origin/staging` | `d18d4e524` — 6 commits (#1601–#1603) ahead of the sprint's merge base `33426b634`; 34 files (attendance/scheduling/roster), **no overlap** with any S7 file. Not reconciled (final checkpoint). |
| S7-A core — credential, slot source, publication | `a6baeffdb` |
| S7-B — intake persistence, Approve handoff, operator surfaces | `ec1d8422c` |
| S7-A — public two-step journey | `7e32d79ac` |
| S7-A — service-client principal exception (prebuild) | `93e41ea8d` |
| S7-C — live certification suite + owner docs | `eb4f4a81f` |

## Preflight (targeted)

| Area | Finding |
|---|---|
| Public tours | Every public tour credential (`tour_public_booking_links`) is bound to an invitation, a recipient and an Opportunity (NOT NULL); no published-location or location token existed. |
| Slot authority | `computeAvailableTourSlots` (S3 schedules, S5/S6 calendar, S1-counted bookings) is the only slot source; reused unchanged. |
| Forms | Location-specific intake links (`form_public_links.metadata.default_location_id`) already carry org, location, expiry, embed allowlist and the S4 brand chain. |
| Processing | Public submit opens a case with no CRM writes; Approve → `commitApprovedLeadForCase` → lead; no post-approve hook existed. `ingestPublicFormThroughProcessing` replaces case metadata wholesale and ignored write errors. |
| Frame policy | No `X-Frame-Options` / `frame-ancestors` anywhere (pre-existing); the only embed control is the per-link `allowed_embed_origins` (Referer/Origin). |
| **C1 Communications** | **Not integrated** — not on this branch, not on staging. Exists only as 3 unpushed commits on `agent/cursor/c1-comms-consent-eligibility` (worktree `wt3-comms-c1-consent`); even there `commitMarketingConsentFromIntakeCapture` has no caller and `capturedAt`/evidence are not persisted. The public forms runtime has no consent field type. |

## Model

**Public credential.** A location-scoped Processing intake link with `metadata.tour_calendar_v1 = { enabled }`.
Server-controlled: stripped from client metadata on create/PATCH; set only by `tour_calendar` on
`POST/PATCH /api/admin/forms/[formId]/public-links[/linkId]` under `forms.author` **and** `tours.configure`,
only on a location-specific lead-capture link; stripped from the public resolve payload. The hosted
calendar is `/tours/<token>` (same token as `/forms/embed/<token>`). No operator UI toggle yet (API only).

**Public calendar (S7-A).** `resolvePublicTourCalendar` (active, unexpired link → flag → intake mode →
active, non-archived location the link names → an active tour schedule → embed origin); every refusal
answers like an unknown token (404; inactive/expired 410; disallowed origin 403). `GET /api/public/tours/[token]/slots`
returns `{start_at,end_at,timezone}` only, from tomorrow in site time, 45-day window, rate-limited
(`calendar_slots` 120/min per client+token, in-process). Times render 12-hour in the location's zone.

**Two-step journey (S7-B of the brief).** `/tours/[token]`: server-resolved, noindex, no marketing chrome,
brand from the published form → location → org chain in the same frame for both steps. Step 1 month grid
(the invitation surface's `tourParentView` helpers). Step 2 is the **existing Forms runtime** with an optional
`tourRequest` (summary + Change time; the two instants are sent with submit). The step is in the URL
(Back/Forward), the form stays mounted and its draft autosaves; the selection lives in session storage ≤ 6 h.
The acknowledgement says "received … not confirmed yet". Enrollment journeys keep their screens.

**Pending request (S7-C of the brief).** `processing_cases.metadata.requested_tour` (`processing.requested_tour.v1`):
location, start/end, timezone, rule id (evidence), `requested_at`, `submission_key = form_submission:<id>`,
provenance `{public_tour_calendar, form_public_link_id, form_submission_id}`, lifecycle
`pending_acceptance → booked | needs_rescheduling | failed`. Submit revalidates the exact interval for the
LINK's location before any write (409 `TOUR_SLOT_UNAVAILABLE`, draft kept); a request Processing could not
record fails the submit (503) rather than being dropped. No Opportunity, booking, seat hold or message.
**No migration** — durable on the case; idempotency is held by the booking and existing DB constraints.

**Approve handoff (S7-D/E).** After the lead commits and the case completes, `materializeRequestedTourForCase`:
(1) a booking already made for the case (`tour_bookings.metadata.processing_case_id`) is reused;
(2) a recorded `needs_rescheduling` is the operator's — never re-picked; (3) location must match the lead;
(4) one active tour per Opportunity (existing tour kept → `existing_active_tour`); (5) revalidate schedule,
calendar and capacity (`too_soon` / `calendar_closed` / `slot_unavailable`); (6) `createTourBooking`
(`source=form_submission`, tour-rule `approval_required` honoured → `pending_approval`, silent);
(7) one confirmation via `orchestrateTourBookingConfirmed`, outcome recorded (`sent` / `suppressed` with the
policy code / `not_applicable`). Nothing here rolls back the lead. Re-running Approve on a completed lead
retries (idempotent); a crash between booking and send completes the send under the orchestrator's key.
Concurrency: the unique index `ux_tour_bookings_one_active_non_terminal_per_opportunity` and the S1
capacity trigger hold the line; a loser re-reads and finds the winner's booking.

**Operator (S7-I).** Processing case → "Requested tour" panel (pending / booked / awaiting tour approval /
needs rescheduling with reason / failed; still-open check; booking; family-message outcome; up to 6 current
openings). `GET /api/admin/processing/cases/[caseId]/requested-tour` (read-only). The lead's Schedule tour
modal shows an accepted request that still needs a time (derived on read; resolved once a tour is scheduled;
no stored flag, no Work Item, no new dashboard).

**Existing families (S7-F).** Identity is Processing's: intake creates no person; a plausible match is a
candidate in the governed review path (Approve refuses `identity_review_required` until decided). Email
equality is never a merge. A linked existing lead with an active tour keeps it (`existing_active_tour`).
Repeat submissions are separate cases (one per submission); the second resolves through the same rules.

## Communications & consent (S7-G) — PARTIAL

Held: before Approve nothing tour-related can be sent (no booking exists); after Approve exactly one
confirmation through the S1 policy then canonical eligibility; prior opt-outs block it (live: `OPTED_OUT`,
recorded `suppressed`); no marketing preference is written by intake or Approve.
**Not delivered — outstanding on C1:** an optional, unchecked marketing-consent control on the public form,
consent provenance, and the "consent never overrides an opt-out through duplicate intake" gate. Seam: when
C1's capture contract is integrated, the form gains a consent field and Approve calls
`commitMarketingConsentFromIntakeCapture` for the committed person — no new preference store. Also open:
tour sends still pass no `category` (operational fallback — S1/C-D0); there is **no family ICS** (only the
staff calendar invite); no "request declined" message.

## Evidence

| Gate | Result |
|---|---|
| Live cert DB — `tests/tours/live/publicTourIntake.live.test.ts` | **10/10** (scenarios 1–17; see file) |
| Unit — `tests/tours/publicCalendar/*` (publication authority, strip/smuggle, record, operator panel render) | 16/16 |
| Negative controls (live suite, guard removed → restored byte-exact) | NC1 submit revalidation → 4 fail (scenario 2 first); NC2 case-booking lookup → scenario 11 fails; NC3 tour-rule approval ignored → pending-approval scenario fails; NC4 publication flag ignored → scenario 15 fails; plus unit: forms authority without `tours.configure` → 403 |
| Live regressions — S1 `tourBookingSafety`, S3 `tourWeeklySchedules`, S6 `tourOperatingCalendar`; invitation routes `tourBookRoute`/`tourResolveRoute`/`tourActionRoutes`/`authorizeTourAction` (scenario 18) | green (169 files; the 1 failure, `pos/formDraft`, fails identically on base) |
| Affected batch (805 base / 808 S7 files: tours, pos, processing, publicForms, forms, lifecycle, lib/admin, branding, operatingCalendar, …) | 131 failing, **identical on base `2cb3eee0b`** (probe worktree); 0 new after fixing one source guard (`participantPaymentJourneyStep`) |
| `tests/docs` | 3 failing, identical on base (context-package drift, account-disabling path, handler count) |
| `npm run prebuild` (6 guards) | rc=0 after `93e41ea8d` (routes declared `none`; service-client exception 28→29 with history) |
| `vac run typecheck` (`tsconfig.build.json`) | PASSED on the uncommitted S7 tree before the final edits; the final candidate's typecheck (incl. tests) is filed with Vacilando — see receipt in the run report |
| `vac validation-classify` | `build_sensitive` (route, page, layout added) |
| Production build | **Deferred** to the integrated checkpoint (one build, mandatory) |
| Browser QA | **Not run** — no browser session in this seat. Unverified gates: scenarios 19 (standalone vs iframe equivalence), 20 (phone/desktop), visual brand parity of both steps, Back/Forward state retention |

Live residue (synthetic, Northwind `zz`/`ZZ s7-*`): committed leads, people, households and Processing cases;
calendar entries withdrawn (append-only ledger); links deactivated; the campus location remains (FK from
leads). Bookings, rules and the throwaway org's rows removed. Negative-control runs added more synthetic
cases of the same kind.

## Certification-stack status

No schema change in S7. `alloy-cert` lacks staging migration `20261129090000`
(`processing_cases.processing_case_subject_removed`), so the live suite stubs only that guard; Northwind
has no Create Lead entry department, so placement is pointed at its `new_leads` work unit. Both are cert-data
drift, not S7 behaviour. The S1 ledger reconciliation (`20261206090000` → `20261210090000`) is still open.

## Dirty census preservation

`git status --porcelain --untracked-files=all` (excluding S7's own paths and a scratch dir) is identical
before and after all S7 commits (2,562 entries); `certification/migrations/hosted-migration-identity-census.sql.results.json`
sha256 `f8d1e2b2…315aec` unchanged. Every commit named its paths; nothing was staged by sweep.

## Documentation / context impact

- `docs/platform/modules/documents-and-forms.md` § Public tour request on intake (new).
- `docs/platform/modules/communications-platform.md` § Tour communications authority — S7 bullet; this is a
  **certified Communications lane owner doc** → recertification trigger for that lane at the checkpoint.
  `distribution-manifest.json` blob updated for it (the manifest's other drift is pre-existing on base).
- Ownership (proposed, not certified): the public calendar credential and slot view are **Tours** (consuming
  Forms' link and Locations' calendar); the requested-tour record is **Processing** intake data written by
  the Forms submit route; the Approve handoff is a **Tours** consequence invoked by Processing. Tours,
  Locations and Forms still have no certified owner-map row — not asserted here.

## Remaining final-checkpoint obligations

1. C1 integration → consent control, provenance, opt-out-preservation gate (S7 PARTIAL until verified).
2. Browser verification: S2/S4/S5/S6 and S7 scenarios 19–20 (standalone/iframe, phone/desktop).
3. One production build on the integrated candidate; full Tier 1 on the exact integrated tree.
4. Final typecheck receipt for the S7 candidate (filed detached) if not returned green.
5. Staging reconciliation (#1601–#1603; no overlap) and migration-version recheck.
6. S1 cert-ledger reconciliation; `alloy-cert` drift (`20261129090000`).
7. Location/Tours/Forms owner-map certification gap; Communications lane recertification (doc edit).
8. Promotion-governance G0; slice registration for S5/S6/S7 (blocked by the tracked dirty census file — see run report).
9. Product gaps recorded, not built: operator UI toggle to publish a calendar; header-level frame policy
   (`frame-ancestors`) platform-wide; durable (cross-instance) rate limits; family ICS; manage/reschedule
   links in the post-approval confirmation (the invitation credentials do not exist for an intake booking);
   "request declined" message.

**No staging PR, merge, push or deployment. No shared migration applied.**
