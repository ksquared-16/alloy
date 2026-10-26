# Tours I1 — C1 Communications + S7 completion + staging convergence

Sprint: Tours, Operating Calendar & Public Forms · integration I1 · **commit-only, not promoted.
Outcome: PARTIAL** — integration and targeted certification complete; the full typecheck receipt and the
cert-stack migration apply are outstanding (host Docker went down mid-run; see Blockers).
Lane `lane_2cea84351d90` · objective `OPWORK_2CEA84351D90_SPRINT_80ADA49DE68E` · run `erun2_632019b9bff3020a`.

## Starting point

| | SHA |
|---|---|
| `origin/staging` at start (and at end — no new commits appeared) | `d18d4e524` (#1603) |
| Sprint HEAD at start (S7 record) | `82f8d5c1e` |

## Lineage (no rebase, no reset, no rewrite)

| Commit | What |
|---|---|
| `488ed307f` | Merge of C1 `agent/cursor/c1-comms-consent-eligibility` @ `7fc0f63ab`. C1 branched from S1 `2d68f30be` (an ancestor of the sprint), so its commits keep their SHAs: `eb70d3ff4` unsubscribe links, `025c4f89e` typed category on scheduled/tour/legacy enqueue, `7fc0f63ab` intake consent handoff + START/opt-out rules. One conflict, imports only, `web/lib/pos/processingIdentity/commands/ports.ts` (sprint D2 `attachDocument` vs C1 `updateCommunicationPreferences` — disjoint hunks, both kept). |
| `b1d67ba5f` | Merge of `origin/staging` `d18d4e524`: #1601 scheduling assignment-type behaviour, #1602 multi-session attendance expectations / site staff totals, #1603 enrollment pricing facts. No migrations. One shared file, `web/lib/roster/buildCombinedRoster.ts`, auto-merged and read: S5/S6 `calendarSiteClosure` and V7 S6 primary-first `groupByChildId` both kept. Staging is an ancestor of the candidate. |
| `67558d533` | I1 — public intake marketing consent (below). |
| `9c8b9f47d` | I1 — test/guard re-binding where C1 legitimately changed a pinned contract; owner docs; context package. |

C1 worktree (`wt3-comms-c1-consent`) was read only: clean, untouched. C1 left no certification record of its
own; its evidence is its three unit files (green here, below). Its two Python test files
(`backend/tests/test_email_thread_headers.py`, `test_inbound_sms_keywords.py`) were **not run** — no Python
environment exists on this host; CI runs them.

## S7 public consent capture (closes S7-G)

- **Offer.** `publicLinkOffersMarketingConsent(linkMetadata, {packet})` — a lead-capture Processing intake
  link with the server-controlled tour calendar flag; never a packet. Resolve payload carries only the derived
  `marketing_consent_offered`; the flag itself stays stripped.
- **Control.** Forms runtime (`FormEmbedClient`, single-form branch) — two **unchecked** boxes: marketing email
  and marketing texts, each with its own wording (`INTAKE_MARKETING_CONSENT_LANGUAGE`, version
  `intake_marketing_consent.2026-10.v1`; email names unsubscribe, SMS names rates + STOP). Not a schema field.
- **Submit.** Only a literal `true` is consent; unchecked/absent → recorded "no"; malformed → 400
  `MARKETING_CONSENT_INVALID`; an answer from a non-offering link → 400 `MARKETING_CONSENT_NOT_ACCEPTED`;
  both before any write (draft kept). Evidence `processing_cases.metadata.marketing_consent`
  (`communications.intake_marketing_consent.v1`: choices, response, wording + version, captured_at, link,
  submission). An affirmative answer Processing cannot hold fails the submit (503). No person, preference
  or message before Approve. The acknowledgement still says "received … not confirmed yet" (S7, unchanged).
- **Approve.** After the lead commits, before the requested tour: `commitIntakeMarketingConsentForCase` →
  C1 `commitMarketingConsentCaptures` for the resolved person (created, or the existing one linked). Opt-out
  preserved; replay writes nothing (commit marker on the case); no person / identity review → evidence held
  uncommitted. Never blocks the lead; sends nothing. Preference event `source=public_intake`,
  `method=form_checkbox`; full evidence stays on the case (the event table has no metadata column; no
  migration added).
- **Re-subscription:** intake never re-subscribes an opted-out person; there is no intake re-subscription path.
- **No second store:** the one writer is `persistCommunicationPreference` (guard re-bound, below).

## Live evidence — real `alloy-cert` database (`tests/tours/live/publicTourIntake.live.test.ts`, 18/18)

| Scenario | Proven |
|---|---|
| C·1 | resolve offers the control on the calendar link, not on a plain lead link; flag absent from payload |
| C·2 | malformed answer → 400, draft, no case; answer on non-offering link → 400, draft; control: same link without an answer takes the lead with no record |
| C·3 | unchecked → recorded "no"; Approve → `skipped_unset` ×2; no marketing preference; no marketing message |
| C·4 | absent answer on an offering link → recorded "no"; no preference after Approve |
| C·5 | email only: evidence before Approve, no person/preference/message; after Approve `email_marketing=opted_in` only, event `public_intake/form_checkbox`, commit marker names the person; no marketing message; tour confirmation `category=transactional` |
| C·6 | replayed Approve: `replayed:true`, zero new preference events |
| C·7 | SMS only → `sms_marketing=opted_in` only |
| C·8 | repeat inquiry after `recipient_unsubscribe`, and an existing email+SMS marketing opt-out: identity path (review or link) → `preserved_opt_out`; states stay `opted_out`; no marketing message |
| 4–13, pending-approval, 14·17 (S7) | unchanged S7 behaviour: pending request sends nothing; Approve books once + one confirmation; replay/race; unavailable slot → `needs_rescheduling`, lead kept; last-seat race → exactly one booking; `approval_required` → `pending_approval`, zero confirmations |

**Negative controls** (guard removed → suite red → restored byte-exact, sha256-checked): NC1 parser coerces
truthy → C·2 fails; NC2 offer gate forced open → C·2 fails; NC3 commit-once marker ignored → C·6 fails;
NC4 C1 opt-out precedence removed → C·8 fails; NC5 Approve wiring removed → C·3/5/6/7/8 fail.

## Contract changes C1 brought (each failed on the integrated tree, passed on `82f8d5c1e`)

1. **Tour confirmations now reach transactional/operational opt-outs.** C1 classes parent lifecycle notices
   `transactional` (S1's `TOUR_COMMS_MESSAGE_CLASS` already did; S1 recorded the switch as C-D0's decision).
   Canonical eligibility (policy `2026-07-31.1`) exempts transactional from preference opt-outs; only
   bounce/complaint suppression, STOP holds and channel usability block it. S7 14·17 asserted `blocked`;
   re-stated: confirmation sent, `transactional`, no `OPTED_OUT`, no marketing, opt-outs untouched.
   **Operator decision flagged:** if a transactional opt-out should still suppress tour confirmations, that is
   a canonical-policy change, not an I1 repair.
2. **S1 reminder test** hand-copied the dispatcher's adapter call; C1's adapter refuses a missing category and
   the real dispatcher now passes `transactional` / `tour_coordination`. Copy aligned; category asserted. 8/8 live.
3. **Consent-writer guard** (`tests/docs/communicationsCertificationClaims`) matched only literal table names,
   so it never saw `persistCommunicationPreference` (staging's admin route and unsubscribe already used it);
   C1 moved `ports.ts` onto it → writer set read empty. Re-bound: one writer (literal or constant) + five
   classified callers. Owner-doc census updated to match.

## Targeted batch (vitest, 13 domains: tours, communications, publicForms, forms, processing, pos,
operatingCalendar, roster, scheduling, childcareOperational, enrollment/pricing, branding, intake)

2,471 suites · 6,619 tests · 100 failing in 52 files. Re-run of those 52 files on a probe worktree at
`82f8d5c1e`: 51 fail identically (99 tests) → inherited. The one new file (`tourBookingSafety`) is item 2
above, fixed. `tests/docs`: 3 failing on base (incl. context-package drift) → 2 on candidate, both
inherited (`authSessionOwnerTruthfulness`); drift cleared.

Gate files: c1TourCategoryAndIntakeConsent 5/5 · c1UnsubscribeOutbound 4/4 · recipientUnsubscribe 18/18 ·
canonicalEnqueueEligibilityGate 14/14 · eligibilityEvaluator 30/30 · dispatchContractParity 10/10 ·
smsKeywordContractParity 10/10 · commsV2ConsentGate 6/6 · i1IntakeMarketingConsentCapture 15/15 ·
tourCommsEligibility 41/41 · tourCommsOrchestrator 29/29 · tourOperatingCalendar (live) 10/10 ·
operatingCalendar (live) 9/9.

**Prebuild guards** (all six, on `9c8b9f47d`): module-imports, service-client-principal,
unauthenticated-side-effects, route-capabilities, runtime-mode-audience, governed-documents — green.
**Context package:** `build-context-package --check` current.

## Migration audit (alloy-cert)

- Sprint adds one migration: `20261210090000` (S1 slot-capacity guard). S5/S6, S7, C1, #1601–#1603 add none.
- The ledger is not evidence: 129 repo versions absent from it; one ledger version (`20261206090000`) has no file.
- **S1 discrepancy, explained and repaired:** the guard was applied under its pre-renumber version
  `20261206090000` (renamed R100 in `a984ac0d1`); objects present (function, trigger, one-active index).
  `supabase --workdir certification migration repair --local --status applied 20261210090000` — ledger row
  added; nothing deleted (the `20261206090000` row is left).
- **`20261129090000` drift, confirmed:** `processing_case_subject_removed()` absent. Rolled-back dry run on
  cert: clean. Governed `database.apply_migration` (certification, expectedSha = staging `d18d4e524`) filed
  `gar_997f04ea741b98` → **failed in preflight**: the cert DB had become unreachable (Docker down). Nothing
  applied. The S7/I1 live suites still stub that guard.
- No migration applied to shared staging.

## Not run / outstanding

1. Full `typecheck:tests` — the broker held it for memory capacity; filed with Vacilando on the final candidate.
2. `20261129090000` on cert — refile once Docker is back (new request; the failed one is terminal).
3. Live unsubscribe-in-delivered-content and scheduled-marketing dispatch against the real DB — unit-covered
   (above); a live proof was not written before Docker went down.
4. Browser verification of the consent control (standalone/iframe, phone/desktop) with S2/S4/S5/S6/S7 19–20.
5. One production build + full Tier 1 on the frozen candidate at the final QA checkpoint.
6. C1 Python tests (no Python env on host). Operator surface does not yet show the consent evidence.
