# Tours & Public Forms P1-close — branding truth, Processing readiness, final QA

**Outcome: PARTIAL** — D1, D2 (product), D3, D4, D5 and D8 are implemented, tested and browser-verified on an
isolated copy. The full §G approval journey is **not** verified: the isolated test organization could not
be given a Business Process that accepts new leads through any supported path (see "§G blocker").
No PR, merge, push, deployment, staging migration or release request was made.

| | |
|---|---|
| Branch | `sprint/tours-polish-p1` (base staging `b5abf2d02`; staging tip `317eafa5b` is 27 commits ahead — not rebased) |
| Starting HEAD | `020bb6251` (product candidate `3f86d657d` + certification commits) |
| Implementation | `ab3bb9b0d` (D1–D5, D8 + tests) · `54bd2b07a` (D1 wording: per-field sources in Preview & Share) |
| Final product candidate | **`54bd2b07a300d488976e78419a719bb8070c188b`** |
| Isolated QA | preview `alloy.candidate.enrollment` serving `54bd2b07a300` (BUILD_ID `swYcIum68yDiLkhIyZLEX`, production) on lane-owned `certenv-8b1a2284d8` |
| Runs | `erun2_55e8f811882ff1f7` (activation `gar_e78938d695c2ba`, `gar_c52109140d42c2`; sessions `gar_7aeb2f118f62fb`, `gar_8971b35b873c02`) |

Isolation was re-measured after each activation: `/api/runtime-info` builtSha = runtimeSha = candidate;
`/api/build-info` `supabaseProjectRef: null`; the hosted project ref occurs in 0 client chunks, the certenv API
in 1; no messaging provider in the preview's environment. Business Processes' `certenv-d59e73b0fd` and preview
`alloy.candidate.business-processes` stayed ACTIVE and untouched. Sessions were proven by navigation
(lands on `/organization/locations`, Northwind data renders), never by the action's status.

## D1 — Branding truth

**Root cause.** The tour page header comes from `buildPublicFormResolvePayload` → `resolvePublicFormBrand`:
**published form snapshot → location → organization → platform**. Booking experience (and the Preview & Share
button snippet) called `resolveEffectivePublicBrand` with location + organization only, so "Shown to families"
was false whenever the published form set its own name, colour or logo.

**Correction (precedence and snapshot semantics unchanged).**
- `loadPublishedFormBrandLayer` — the snapshot reader, factored out; `resolvePublicFormBrand` now uses it.
- `loadPublishedTourCalendarForm` (new, read-only) — finds the location's usable published-calendar link,
  resolves it through `resolvePublicFormEmbedContext` (the public page's own version choice), then reads the
  form layer with the same loader.
- `GET /api/admin/public-brand` returns `published_form`, an `effective` that includes the form layer, and
  `effective_without_form`.
- Booking experience: a note naming the form the calendar opens into and which settings it overrides (with
  the exact Studio path to stop it); per field, "Families see X (set on the published form "…") — it takes
  precedence here. This setting gives Y to forms that don't set their own."; the preview shows what families see.
- Preview & Share: "Families see "name" (source) in #colour (source)."

**Browser evidence (final candidate, Riverside).**

| Form branding | Booking experience | Preview & Share | Public page header |
|---|---|---|---|
| Customize for this form ("Northwind Early Learning") | note: form sets its own school name, brand colour; name field "Families see Northwind Early Learning (set on the published form…)" ; preview "Northwind Early Learning" | "Northwind Early Learning" (set on the form) in #00A283 (set on the form) | **Northwind Early Learning** |
| Use the school's branding | note: "It uses this location's brand"; "Shown to families: Riverside QA (set for this location)"; preview "Riverside QA" | "Riverside QA" (Booking experience for this location) in #00A283 (Alloy default) | **Riverside QA** |

Screenshots: `browser/d1-customize-*`, `browser/d1-check-*` (Preview & Share screenshots withheld — they show the
link token; the text above is the captured output).

## D2 — Processing approval readiness

**Exact 422 root cause.** `buildPlan` (`operatorReviewService.ts`) places a public-form case's new lead with
`resolveCreateLeadPlacement(orgId, {})` → `resolveCreateLeadEntryDepartmentForOrg`, which only considers
**builder/activation-owned** departments whose entry (New Lead) stage has a lifecycle work unit. Northwind's
seeded Enrollment is a legacy, non-owned department (`lifecycle-catalog`: `activation_owned: false`,
`source: legacy`), so there is no candidate → `unconfigured` → 422 `lead_placement_unresolved`.

**Why the UI disagreed.** "Ready to create" and Approve's enabled state came from identity readiness
(`loadCaseReview` / recommendation) only; nothing asked the placement question before the click.

**Product repair (classified: actual product readiness defect).** One exported predicate
`caseResolvesOwnLeadPlacement` (used by `buildPlan` — no second condition) and a read-only
`evaluateCaseLeadPlacement` that asks the same resolver. The recommendation route returns `leadPlacement`;
`ReviewDecideCard` shows "Can't create the enrollment lead yet — <approval's message> … An administrator sets
that up in Organization › Processes"; both Approve controls (Mailroom rail and case detail) are disabled
("Lead setup needed to approve"). Reusing an existing lead is never blocked. Approval stays authoritative.

Browser: blocked notice + disabled button on the pending case (`browser/d2-case-before.png`,
`browser/d2-case-final.png`); bypassing the button with a direct `POST …/approve` still returns
**422 `lead_placement_unresolved`** (negative control).

**QA fixture (classified: missing fixture configuration — not repairable through a supported path today).**
Tried, all through the UI, isolated certenv only:
1. Process Health › *Repair →* — rebinds `enrollment_pipeline` (`PATCH …/stage-work-unit` 200); placement unchanged.
2. Process › More › *Repair workspace* — `lifecycle-catalog/repair` → `actions: ["already_visible_in_workspace_api"]`
   (no-op); *Repair lifecycle work units* is only offered to activation-owned processes.
3. *Save stage* on New Lead — disabled (nothing changed); *Apply changes* publishes a revision, does not own.
4. **New Business Process** "Tour Inquiries QA" (Staged lifecycle, Opportunity/Lead): department and builder
   process created, then `PATCH …/lifecycle-activation` → **400 "Invalid activation payload"** — the create
   flow sends a partial bundle (`process_id, lifecycle_name, activation_owned, completed_steps`) and the route
   parses it as a complete bundle when nothing was persisted. The process never appears in the catalog
   (`browser/bp9-created.png`). **New Business Processes defect (owner: Business Processes).**

Nothing was written to the database outside the product's own routes. Readiness after the attempt is still
`unconfigured` (not `ambiguous`).

## §G walkthrough

| Step | Result |
|---|---|
| 1–5 public calendar, slot, form, optional consent, submit | PASS (I1/P1 evidence + this run: request received) |
| 6 Processing receives the pending request | PASS — Requested tour, "pending acceptance (not booked)" |
| 7 nothing sent before approval | PASS as far as observable — case "Nothing is booked and nothing has been sent"; no provider configured on the target |
| 8 operator approves | **BLOCKED** — readiness correctly blocks (D2); fixture cannot be made placeable (above) |
| 9–15 lead, slot revalidation, booking once, intents, consent commit, opt-out authority, unavailable at approval | **NOT VERIFIED here** — require 8. Covered by unit suites (below) and by I1's live suite on a real database; must be verified on staging (walkthrough §G 28–30a) |

## Consent and opt-out evidence

- Browser (final-1 candidate): step 2 shows **one** consent control; submission sent
  `marketing_consent: {email: true, sms: false}` and no opt-in field values (`browser/d5-step2-single-consent.png`).
- Negative control: a tampered submit injecting `email_opt_in`/`sms_opt_in: true` → 200, case *Submitted values*
  hold only the six real fields — nothing stored (`browser/d5-tamper-case.png`).
- Commit-side (approval) consent and opt-out preservation: `tests/communications/i1IntakeMarketingConsentCapture.test.ts`,
  `tests/communications/c1TourCategoryAndIntakeConsent.test.ts` (in the related run, passing). Not browser-verified.

## Bounded follow-ups

- **D5** (one consent control): where the link offers the intake consent control, person `email_opt_in` /
  `sms_opt_in` fields are dropped from the rendered schema (browser) **and** from validation and stored values
  (submit route). The Communications evidence record stays the one store Approve commits.
- **D8** (labels): `FormEngineRenderer` associates labels with text, phone, textarea, number, date and select
  controls (`useId` + group-row path). All six inquiry fields resolve by label in the browser.
- **D3** org-scope time-zone hint; **D4** link label no longer repeats the form name.
- Not changed (scope): Studio Health metrics; Communications send/consent display.

## Validation

| Check | Result |
|---|---|
| `tests/tours/toursP1Close.test.tsx` | **20/20** |
| Negative control | D8 test fails on the pre-change renderer (1 failed / 1 passed), restored byte-identical |
| Related suites (41 files touching changed code + P1 + public calendar) | **625/629**; 4 inherited (below) |
| `vac run typecheck` | PASSED (tree `fd84ee4058f43d02`) |
| `vac run typecheck:tests` | PASSED (tree `fd84ee4058f43d02`) |
| `npm run prebuild` | exit 0 on `ab3bb9b0d` and `54bd2b07a` |
| `vac run build` | **PASSED** on `54bd2b07a300` (tree `23c3993cbd87aa1a`); preview production build of the same SHA |

Inherited, not regressions (sources not in this diff): `rawSelectAdoptionLedger` ×3 (six other files grew raw
`<select>`s) and `configurationRuntimeLocations` ×1 ("Edit room"). One regression found and fixed in-slice:
`participantDeterministicJourney` guards the literal `withoutAuthoringNotes(parsedSchema)`.

## Remaining defects

| # | Owner | Defect |
|---|---|---|
| B1 | Business Processes | New Business Process: `lifecycle-activation` PATCH 400 on the create flow's partial bundle → process never activation-owned, invisible in the catalog |
| B2 | Business Processes / Lifecycle | No supported path converts a legacy (seeded/demo) department into one whose New Lead stage can receive public-form leads |
| C1 | Communications | Consent evidence not shown to staff; opted-out direct send → 500 (from P1) |
| T1 | Tours (cosmetic) | "sets its own school name, brand colour" — list lacks "and" |

## Residue (isolated certenv only)

Department "Tour Inquiries QA" (orphaned builder department); Riverside display name "Riverside QA"; form
"Northwind Tour Inquiry" on *Customize for this form*; three new Processing cases (`qa+enrconsent1@`,
`qa+enrtamper@`, plus earlier ones); calendar published on Riverside. All go with the environment.

## Release readiness

**Not ready to promote.** The Director's rule — no promotion until inquiry → Processing approval → tour
confirmation is verified — is not met. The code is ready for Director review; §G needs either a fix for B1/B2
(Business Processes) so an isolated tenant can be configured, or a Director-approved hosted-staging QA run.
