# D0 — Tours, Operating Calendar & Public Forms — Discovery evidence

Discovery only. No application, schema, configuration or doctrine change was made. Paths are under
`web/` unless they start with `supabase/`, `docs/` or `certification/`. **FACT** = read in code,
schema or live census; **INFERENCE** = reasoning from facts; **REC** = recommendation.

## 0. Lineage (2026-10-21)

| Item | Value |
|---|---|
| origin/staging | `ed700dfc5` (#1562, certification files only) |
| Deployed staging (`/api/build-info`) | `28ad0a31f` (#1561) — code-identical to `ed700dfc5` |
| Toolkit installed | `0cc773d1f3a1` (installed 2026-10-21T20:48Z) |
| Context package | `alloy-context.v1`, status `READY_FINANCIALS_PENDING`, source `ea596e615` (2026-09-30) — **280 commits behind staging**; 57 manifest docs, 1 drifted (`financials-canonical-authorities.md`) |
| Certified lanes | developer-platform-api, runtime, business-process, identity-access, enrollment-placement, staff-scheduling, attendance, subsidy, commercial, operational-intelligence, communications, configuration, ai-bos; financials-payments PENDING_DISABLED |
| **No lane / owner-map row** | **Tours, Forms Studio / public form runtime, Locations, operating calendar** |
| Collision check | No open PR or active lane branch touches tours, forms runtime, locations, book or calendar paths (open PRs are stale ≤ #1372) |
| Local note | A local branch literally named `origin/staging` exists (`refs/heads/origin/staging`) — not this lane's; use `refs/remotes/origin/staging` |

## 1. Forms Studio public branding (F01–F03)

- **F01 root cause (FACT, verified):** the public runtime never paints the accent.
  `participantBrandStyle` sets `--participant-accent` (`lib/public/forms/participantBrandTheme.ts:62`)
  on the frame (`app/forms/embed/[token]/ParentIntakeShell.tsx:76-81`); **nothing reads it**
  (repo-wide grep: one definition, one test). The primary button is hardcoded
  `bg-alloy-juniper … text-white` (`ParentIntakeShell.tsx:312`), as are progress, chips, checklist,
  spinner, `FormEmbedClient.tsx:1525,1610,1835-1848`, `EnrollmentConversationCard.tsx:430,506,1740`,
  `SignatureCaptureDialog.tsx:197`, `ParticipantPaymentCard.tsx:65`, checkbox `accent-color`
  (`app/globals.css:1911-1913`). Masking: builder default `#00A283`
  (`lib/forms/processingFormBranding.ts:13`) equals the hardcoded colour; runtime default is
  `#1F2937` (`participantBrandTheme.ts:24`) — two disagreeing defaults.
- Storage: `form_definitions.metadata.accent_color|logo_url|brand_name` (no theme table); builder
  `ProcessingFormBuilder.tsx:790-840`; saved by `syncFormStats` (`useProcessingFormApi.ts:153-191`),
  which **ignores write failures**; `PATCH /api/admin/forms/[formId]` replaces metadata wholesale
  (`route.ts:86-91`). Publish snapshots **no** branding (`formsAdminDb.ts:183-201`); public runtime
  reads **live** definition metadata (`resolvePublicFormLink.ts:66-71,144`). INFERENCE: branding is
  unversioned — a draft save changes the live published form.
- Caching: none (no revalidate/unstable_cache/Cache-Control; `page.tsx` is dynamic). Not a cause.
- Builder preview paints the accent (`ProcessingFormBuilder.tsx:758-763`); runtime does not.
- Tests that lock the hardcoded colour: `tests/lifecycle/participantOneResponseModel.test.ts:57-62`,
  `playwright/tests/configuration-runtime-qa-fix-2.spec.ts:178-179`.
- **F02 (FACT):** no submit-label support anywhere. `formSchemaV1Schema` is `.strict()`
  (`lib/forms/schema.ts:339-348`) — an unknown key would fail publish/resolve. Runtime labels are
  hardcoded (`FormEmbedClient.tsx:1736,1929,1979,2021,2055-2064`); `IntakeFooter` already takes
  `primaryLabel` (`ParentIntakeShell.tsx:278`).
- **F03 (FACT):** primary is `flex-1`/`w-full` at every breakpoint (`ParentIntakeShell.tsx:297,312`,
  `FormEmbedClient.tsx:1525,1610`); only precedent for responsive width is
  `ParticipantPaymentCard.tsx:65` (`w-full … sm:w-auto`). No participant button doctrine exists.
- No contrast computation for tenant colours anywhere; white text is hardcoded — a light accent
  would fail WCAG AA once applied.
- Distributions (standalone `/forms/embed/<token>`, iframe snippet, packet/enrollment links,
  location-scoped links) all share one runtime and one brand path; iframe sets `chrome="none"`.
  Marketing lead widgets (`components/gutters/GutterLeadForm.tsx`, `QuoteModal.tsx`) are legacy and
  separate.

## 2. Tours configuration (T01–T05)

- Model (FACT): `tour_availability_rules` (`20260511143000…:18-41`) — one row = one weekday × one
  window (`day_of_week`, `start_time`/`end_time` `time`, `timezone` text, slot length, buffer,
  `max_bookings_per_slot`, `approval_required`), org-wide when `location_id` null. `tour_bookings`
  (`:97-144`) store `timestamptz` + tz snapshot, **no FK to rules**, one active booking per
  opportunity. No tour types, templates, exceptions/blackouts, effective dating or materialised
  slots.
- Slots are computed on the fly (`lib/tours/availability/internalCompute.ts:88-179`) from rules and
  blocking bookings only (`computeAvailableTourSlots.ts:22,46` — verified); step = duration +
  buffer from window start (no fixed 15-minute grid); overlapping rules double-offer the same time.
- **T01:** no org/location brand storage, resolver or UI; tour public page hardcodes the Alloy mark
  (`app/tour-booking/[token]/TourBookingPublicClient.tsx:391-396`). Forms' resolver is per form.
- **T02:** no duplicate capability. `TourWindowForm` already accepts `existingRule`
  (`TourAvailabilitySettingsClient.tsx:325-351`) — client-only duplicate is possible.
- **T03:** mixed. Rule list renders raw `start_time` (24h, likely with seconds)
  (`TourAvailabilitySettingsClient.tsx:230`); drawer/modal use browser locale
  (`OpportunityTourDrawerSection.tsx:28-40`, `OpportunityTourScheduleActionModal.tsx:30-42`);
  focus-panel cards use **viewer** tz, not site tz (`tourPresentation.ts:22-44`). Tours take tz from
  rules (`resolveTourLocationTimezone.ts:9-38`; free-text, default `America/Los_Angeles`, not IANA
  validated); the canonical `resolveLocationTimezone` (`lib/location/timezoneResolution.ts:78-92`)
  has **no production consumer**. INFERENCE: `formatTourDateTime` (`lib/enrollment/formatTourDateTime.ts:55-56`)
  has the server-tz-dependent pattern documented elsewhere as wrong on non-UTC hosts.
- **T04:** flat list ordered by `created_at` (`availability-rules/route.ts:35`); single-day select.
  The Locations → Tours panel hides org-wide rules (`LocationOwnedConcernPanels.tsx:56,75,87-89`)
  although they still generate slots.
- **T05:** Mon–Fri × two windows = 10 rows today. REC Option A (no schema): weekday×window editor +
  bulk create tagged `metadata.schedule_group_id`; slot engine unchanged.
- Authority: `tours.configure` / `tours.book` gate the 9 mutation routes
  (`lib/access/toursAuthority.ts:44-77`); command adapters (`tourExecutionAdapter`,
  `cancelTourAdapter`, `tourTerminalTransitionAdapter`) carry no tours capability check — UNVERIFIED
  whether the command runtime gates them elsewhere. UI does not hide edit controls without
  `tours.configure`.

## 3. Operating calendar (C01–C03)

- **No holiday/closure entity exists** (no table/column/option set at org or location scope).
- **Closures exist as Attendance-owned day statements** in the Operational Expectations ledger
  (`operational_expectations`, purpose `attendance.service_day_exception`, predicate
  `operating_grain_closed`; commands `serviceDayExceptionCommands.ts:241-281`; interpreter
  `serviceDayExpectations.ts:290-400`). Subject = site or room; whole-day, bounded in **UTC**
  (`:75-83`, code-acknowledged debt); multi-day API-only; no partial-day; no org scope; no
  recurrence. Consumers: roster (`buildCombinedRoster.ts:351-372,511`), kiosk
  (`kioskServiceDayGuard.ts`), metrics. Product stance: closures "are recorded on the day, not
  configured here" (`AttendanceExpectationsGuidePage.tsx:58-71`).
- Weekly operating hours: two stores — `childcare_operating_windows` (scoped org→site→program→room,
  effective-dated; `20260628120000…:199-232`) and `locations.metadata.location_scheduling_v1.operating_days`
  — plus a dormant EAV `location.operating_hours`.
- Consumers that do **not** read closures: Tours, staff scheduling/coverage/staffing demand,
  placement, enrollment start dates, Communications sends, every Financials path. Financials
  (inspected directly): proration counts calendar days even for `business_day`
  (`resolveTuitionRecurrence.ts:86-90,151-154`); autopay `businessDaysBetween` excludes weekends only
  ("Holidays are not modelled in V1", `autopayHandler.ts:75-88`); late fees have no runtime consumer
  (`financialPolicyTypes.ts:106-123`); `serviceDayBillingInput` exposes `closure:true` but "creates no
  charge, voids no charge, issues no credit" (`serviceDayDownstreamContract.ts:145-170`, tests only).
- Parallel-engine risk: **high** — ≥9 calendar-like structures already exist (ledger closures,
  operating windows, `location_scheduling_v1`, tour rules, staff availability windows/exceptions,
  unused `operating_hours`, quiet hours, hardcoded closure reasons, Financials day-count helpers).
- Stale docs: `docs/audits/active/location-operational-platform-certification-2026-07.md`,
  `docs/platform/rfcs/location-operational-domain-convergence.md:81,113,474` (proposes a new closures
  table; code took the ledger route), `docs/system/operational-configuration-platform-phase-b-blueprint.md:47,107`,
  `docs/system/operational-configuration-experience-product-spec.md:126,170-211` (UI that does not exist).

## 4. New-lead booking / approval / communications trace

```
A) Public form lead (today)
POST /api/public/forms/[token]/submissions → form_submissions(draft)
POST …/submit  (no rate limit) → ingestPublicFormThroughProcessing
   → processing_cases(needs_resolution), processing_facts, processing_resolutions
     (duplicates: persons.email ilike / phone variants — phone_canonical NOT used)
   → form_submissions.submitted; workflow_events form_submitted / intake_case_* (insert only, no dispatch)
      … operator review …
POST /api/admin/processing/cases/[id]/approve  (processing.operate)   ← ACCEPTANCE EVENT
   → commitApprovedLeadForCase → persons, customers, customer_persons, customer_members,
     opportunities, participation → case completed → lead_created → org workflows (first possible comms)

B) Tour (only once an opportunity exists)
operator send_tour_invitation → tour_invitations + tour_public_booking_links → invitation message
POST /api/public/tour-booking/[token]/book (in-memory per-instance rate limit)
   → slot recheck → createTourBooking(status = rule.approval_required ? pending_approval : confirmed)
   → orchestrateTourBookingConfirmed  — NO STATUS GUARD → "Your tour is confirmed" email+SMS,
     staff ICS (TENTATIVE when pending); reminders only if confirmed/rescheduled
   → family receives confirm_tour link → POST …/confirm → confirmTourBooking(actorUserId:null)
cron process-due → sends reminders with no booking-status recheck
```

- **Confirmed defects (FACT, verified):**
  - D-T1: public book sends "Your tour is confirmed" for `pending_approval` bookings
    (`book/route.ts:237-244` → `tourCommsOrchestrator.ts:708-730`, no status check; template
    `tourCommsTemplates.ts:92`).
  - D-T2: the family can confirm its own pending booking (`confirm_tour` in
    `POST_BOOKING_ACTION_KINDS`, `mintTourInvitation.ts:43-48`; `confirm/route.ts:41`,
    `actorUserId:null`). "Approval required" today means family double opt-in, locked by
    `tests/tours/tourConfirmationOrdering.test.ts:40-43`.
  - D-T3: `assertSlotAvailableForWrite` drops `excludeBookingId`
    (`tourBookingService.ts:73-95`) — INFERENCE: confirming a pending booking on a capacity-1 slot
    counts itself and fails.
  - D-T4: due reminders are sent without re-checking booking status
    (`communicationScheduledSendsService.ts:581-699`).
  - D-T5: no capacity lock — read-then-write; two families can overbook the last seat (INFERENCE).
  - Impact census (`d0-tour-confirmation-impact-census.sql`, staging, counts): 1 active
    approval-required rule (15 not); 0 bookings currently `pending_approval`; all
    `tour_confirmation` messages belong to bookings now confirmed/canceled. D-T1/D-T2 are latent
    but reachable.
- **Missing capability:** a public lead has no opportunity before acceptance, and
  `tour_bookings.opportunity_id` is NOT NULL — there is nowhere to store "requested tour" before
  acceptance. No holds exist. No public (non-invitation) booking link exists.
- **Single authoritative gate (REC):** a `mayCommunicateForTour` predicate in
  `orchestrateTourCommsForBooking` (covers immediate sends, reminder scheduling, staff ICS for every
  caller), plus three separate checks it does not cover: reminder dispatch recheck, org workflows on
  `tour_booking_pending`, invitation comms. Pre-acceptance tour request stored on the processing case
  (facts), materialised into a booking by the approve route after `commitApprovedLeadForCase`, with
  revalidation and exactly-once confirmation.

## 5. Vacilando governance (sprint-level merge)

See the Director packet §SPRINT EXECUTION. Key FACTS (installed toolkit `0cc773d1f3a1`):
merge target allowlist = `staging` only (`trusted-host-merge.mjs:408-414`; PR base
`trusted-host-open-pr.mjs:120-135`); no parent sprint or promotion-hold concept; slice model
(`promotion-slice.mjs`) assumes every slice merges and is piloted only on the vacilando repo;
every Alloy merge today escalates to the operator because `product_readiness_accepted` is
unmeasured (368/368 merges operator-approved); `certified_staging_merge_v1` auto-approval is
enabled and would apply if that gate became measurable; `no_operator_hold` is never set;
`delete_branch_on_merge:false`; governed push accepts `sprint/*`; Vercel builds only
staging/main/master (`web/scripts/vercel-ignored-build.sh:12-27`) — a sprint branch gets no
hosted preview; the seat's `gh` credential is admin (raw merge possible, prevented by convention).
