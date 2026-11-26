# Human QA V2 — final walkthrough on the certified baseline

Branch `sprint/tours-human-qa-v2`. Product candidate `964da7ef7` (last product-code commit `927707010`). Staging tip
`1045a8ce0` (unchanged during this run). Isolated QA environment `certenv-3669337690` (staging `1045a8ce0`, 550
migrations), preview `alloy.candidate.enrollment` serving `964da7ef7`. Synthetic Northwind tenant, `*.invalid`
addresses, no messaging providers. No push, PR, merge, deployment or hosted write.

Evidence provenance key: **B** = real browser on the isolated preview; **DB** = real isolated database read back
through the app's admin APIs (approve, requested-tour, bookings, communication-preferences, send, threads);
**L** = live test against the shared `alloy-cert` database; **U** = unit test with fakes/mocks; **P** = real provider
transport (none in this run).

## 1. Marketing consent authoring (Forms Studio) — B

| Step | Result |
|---|---|
| Open Forms Studio; create `QA V2 Inquiry` | Processing → Studio → Forms → **New form** → builder |
| Add from the supported picker | **+ Add question → Answer types → Marketing consent**: one question *Stay in touch (optional)*, tag *Marketing consent · Optional*; adding again selects the same question; **Alloy fields** search `opt` → *No fields match* (legacy opt-in fields not offered) |
| Email / SMS independently | inspector *Ask about marketing email* / *Ask about marketing texts (SMS)*; unticking SMS removes it from the canvas |
| Governed wording | label, note and email wording edited; wording version `form_field.v1:95d6de48` → `form_field.v1:9c83012b`; *Always optional*, no *Store answer in* |
| Placement | between *Date of birth* and *Parent / guardian first name* (canvas order; public order indices 100 < 118 < 393) |
| Preview | consent control (not a text box), both boxes unchecked and clickable, authored wording |
| Publish | header *Published* with Copy link / Copy iframe / Open runtime / Manage distribution / Republish |
| Public standalone form (hosted link) | 1 consent control, both unchecked |
| Public form embedded on an external origin (copied **Copy embed** snippet) | desktop + 390 px: 1 control, `data-consent-field-id=stay_in_touch_optional`, version `9c83012b`, unchecked; submit body `marketing_consent {email:true, sms:false}`, no consent key in `values` |
| Embedded Tour intake (copied tour iframe) | step 2: exactly 1 consent control = the authored question, no default *Stay in touch* |

**Semantic binding (DB):** the answer is carried as `marketing_consent`, not as a form value; the case shows
*Marketing consent — Email news: yes · Not applied yet*, *Captured … · wording form_field.v1:9c83012b*; Approve
commits it through the Communications consent authority (`marketingConsent.kind = committed`, outcomes per channel)
to the person's `email_marketing` / `sms_marketing` preferences with source `public_intake`. No second consent
store exists.

## 2. Tour → Processing end to end — B + DB

| # | Check | Result |
|---|---|---|
| 1–2 | Public calendar on an external origin, location, date, time | Riverside, Mon Nov 2: 8 times 9:00 AM–2:30 PM; frame stays on `https://qa-school.example/visit` |
| 3–5 | Published inquiry form, explicit consent, submit | email+SMS ticked; body `{email:true, sms:true}`, `requested_tour: true`; *Your tour request was received … not confirmed yet* |
| 6–7 | Case + pending intent; nothing before approval | *Tour requested — pending acceptance (not booked)*, *Nothing is booked and nothing has been sent*; API `state pending_acceptance`, `booking null`, `comms null`, `opportunityId null` |
| 8–9 | Approve; canonical records | 200; household, child, person, lead, participation created; opportunity `0af850e0…` |
| 10 | Booking exactly once | 1 booking `confirmed` (`source form_submission`, linked to the case) |
| 11 | Family + staff invitation intents | family confirmation `email:sent`; staff calendar invitation: with no recipients configured `internal_calendar_last.outcome = no_internal_recipients`; after enabling 1 staff recipient (T4) `action request, outcome queued`, 1 message |
| 12 | Consent on the canonical person | `email_marketing opted_in`, `sms_marketing opted_in`, source `public_intake` |
| 13 | Replay approval ×2 | `alreadyDone: true`, same booking id, `replay: true`, consent `replayed: true`; still 1 booking |
| 14 | Requested slot unavailable (schedule deactivated before Approve) | case before: *This time is no longer open…*; Approve → `needs_rescheduling` / `slot_unavailable`, *Lead accepted — tour needs rescheduling*, *No confirmation — none is due*, 0 bookings, 1 requested-tour attention; replay idempotent; schedule re-activated |

## 3. Consent, SMS and unsubscribe regression

| Case | Result | Source |
|---|---|---|
| No marketing consent | Approve `skipped_unset` ×2; person unset/unset; marketing email 409 `eligibility_blocked:MARKETING_REQUIRES_OPT_IN`; SMS 409 `no_usable_phone` | B + DB |
| Email consent | email `opted_in`, SMS `skipped_unset`; marketing email `sent_to_queue`; SMS 409 `MARKETING_REQUIRES_OPT_IN` | B + DB |
| SMS consent | SMS `opted_in`, email `skipped_unset`; marketing SMS `sent_to_queue`; email 409 | B + DB |
| Both | both `opted_in`; email and SMS `sent_to_queue` | B + DB |
| Existing opt-out before repeat inquiry (email, SMS) | **Review matches → Same child → Approve — Link existing**; `preserved_opt_out`; person stays `opted_out`; history `public_intake opted_out->opted_out`; case *Not applied — the person had opted out; the opt-out stands* | B + DB |
| Opt-out preserved after approval | as above, both channels | B + DB |
| Consent evidence visible to operators | case panel (answer, wording, version, what Approve did); person **Communication preferences** (state, *Set by … wording …*, *Can be sent now* / *Will not be sent — …*, History) via Search → Household → person | B |
| Unsubscribe token round trip | link minted into a queued marketing email → confirmation page → **Unsubscribe** → *You have been unsubscribed*; person email `opted_out` (`recipient_unsubscribe`), SMS unchanged; altered token → *no longer valid*, nothing changed | B + DB; also U `recipientUnsubscribe`, `c1UnsubscribeOutbound` |
| Subsequent marketing send suppressed | after unsubscribe / operator opt-out: 409 `eligibility_blocked:OPTED_OUT` | DB |
| Direct suppressed send → governed 409 | `outcome: blocked`, never 500 | DB |
| Scheduled and workflow sends respect eligibility | `tourSchedulingScheduledSends`, `communicationScheduledSendProcessMetadata`, `canonicalEnqueueEligibilityGate`, `eligibilityEvaluator` | U |
| Legacy workflow SMS cannot bypass | `workflowSmsGovernance.live` 4/4 (legacy create/send_message refused, nothing deliverable; opted-out blocked; automation cannot send marketing) | L; also U `c2LegacyAdapterSuppression` |
| SMS STOP | `commsV2SmsKeywords`, `unattributedCanonicalStopHold`, `unresolvedInboundStopHold` | U only — inbound STOP needs a provider |

Regression run on this candidate: 15 unit files / 201 tests passed; live 1 file / 4 tests passed; guide parser 6/6.

## 4. Real provider delivery — NOT RUN

No approved QA email/SMS recipient list exists (the guide's known limitation), and no message may go to a family or
arbitrary recipient, so nothing was sent through a real provider. Prepared and **not filed**:
`provider-smoke-hosted-qa-UNFILED.json` (hosted `environment.qa_run_open`, needs the Director's own recipients and
hosted authorization). Part H of the guide is the Director's.

## 5. Guide and website installation — B

Verified against the preview: A1 time zone (Edit location), A2/A5 branding (*Families see "QA School" … in #1F6FEB*,
contrast 4.6:1, hosted page shows the name), B1 schedule fields (Tour length, Gap between tours, Families per time,
Add another time window, Active), C1 holiday (impact *Ordinary hours → Closed*, saved notice, date disabled on the
booking page), C2/C3 partial closure (removes only 9:00/9:30; impact names the existing 9:30 booking, which is kept),
D2–D9, E1 publish on the inquiry link, tour iframe and form embed snippets on an external origin, F1–F5, G1–G6,
G12–G14, person preferences path.

The external website was a **controlled fixture**: Playwright served `https://qa-school.example` with the copied
snippet. Nothing was installed on Firefly's real website.

Guide corrections in this commit: staging SHA; A1 (tour schedules carry their own zone; the operating calendar is
what refuses); D1 exact Alloy field names; F3 booked panel and the staff-invitation prerequisite; F4 exact messages;
G intro (unique surname/phone per scenario, person preferences path, BOS panel); G12 engineer evidence; G16/G17
re-run evidence; known limitations (completed-case identity panel, BOS overlay, no provider recipients).

## 6. Findings (not fixed here — outside the consent/authoring scope)

- **Completed case identity panel** re-evaluates against current records: a completed case shows *Matched by exact
  email … Link existing* and *Lead stage — Will be created after approval*. Presentation only; the lead exists.
  Owner: Processing.
- **BOS Rail overlay** intercepts clicks on the location schedule card's **Edit** and floats over the household
  preferences panel at 1440 px. Owner: Workspace shell.
- Staff calendar invitations need **Send internal calendar notifications** + recipients; the seed has none.

## QA data left in the isolated environment

Persons/leads `qa+v3*@northwind.invalid`; 4 pending duplicate-match cases from identity re-use (3 *Robin Qav2*,
1 *Jordan Tourtwo*); schedule `QA Weekdays`; published tour calendar on `QA V2 Inquiry`; operating-calendar entries
*QA Holiday* (Nov 5) and *QA Partial closure* (Nov 4 9–10 AM); branding *QA School* / `#1F6FEB`; location time zone
America/Los_Angeles; org Tour delivery internal recipients = the QA operator. The environment is discarded at
retirement.
