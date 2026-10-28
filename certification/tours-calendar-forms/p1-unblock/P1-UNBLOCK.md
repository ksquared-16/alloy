# Tours & Public Forms P1 — approval unblock and end-to-end certification

**Outcome: COMPLETE for P1 on an isolated copy.** The approval blocker was a product defect in the
Enrollment-owned public-form approval path, fixed and certified here. The full public inquiry → Processing
approval → confirmed tour → consent and opt-out journey passes in the browser against a real database.
Communications' remaining items are independent and listed below as open. No PR, merge into staging,
push, deployment, staging migration or release request.

| | |
|---|---|
| Branch | `sprint/tours-polish-p1` — history preserved; staging reconciled by **merge** (no rebase) |
| Approval fix | `01d76bc1b` |
| Polish | `17a22b3cc` (UX-04 409 noise, T1 copy, placement tests) |
| Staging merge | `5bea7b940` = merge of staging `317eafa5b` (0 behind staging) |
| **Integrated candidate** | **`5bea7b940ba8`** — `vac run build` PASSED (tree `7733eaf4fa8d90be`); preview production build BUILD_ID `I2RpAugIaQ2mvA8oY3HlQ` |
| Isolated QA | preview `alloy.candidate.enrollment` on lane-owned `certenv-8b1a2284d8` (built from `317eafa5b`, the merge's staging parent) |
| Governed | activation `gar_4e05007ba407ea`, session `gar_98f5d0177ae74d` (run `erun2_3f16747afbc02422`) |

Isolation re-measured on this candidate: builtSha = runtimeSha = `5bea7b940ba8`; `supabaseProjectRef: null`;
hosted project ref in 0 client chunks, certenv API in 1. Business Processes' preview stayed ACTIVE.

## 1. The approval blocker — root cause

Not tenant configuration, and not the Business Process builder. `buildPlan` placed a public-form case's
new lead with `resolveCreateLeadPlacement(orgId, {})`, discarding the routing its intake link was minted
with. The Riverside link carries `default_department_id` = Enrollment (`…0020`),
`default_work_unit_id` = Enrollment Pipeline (`…0031`), `default_opportunity_status_key` = `new_inquiry`;
the case stores it as `link_metadata`. With `{}` the resolver can only pick an org-wide builder-owned
entry department — none exists for a legacy (seeded) Enrollment department — so every routed inquiry was
refused (422 `lead_placement_unresolved`), while BOS Create Lead, which names its department, placed the
same lead. The code is Enrollment's (#1445 "approved public-form leads become canonical Enrollment
leads"); no backend lane was required.

**Fix (`01d76bc1b`).** `caseLeadPlacementInput` reads the case's `link_metadata` through the existing
`parseIntakeReviewConfig` (nested `intake_outcome` honoured) and passes **only the department**; the
canonical resolver still chooses work unit and status, org-scoped (`resolveLifecycleCreateLeadBinding` →
the department's active `enrollment_pipeline` for a legacy department; the New Lead stage for a
builder-owned one). `buildPlan` and the read-only readiness (`evaluateCaseLeadPlacement`) ask with the
same input. No parallel lifecycle, no workaround; the approval check stays authoritative.

The I1 live suite had mocked `resolveCreateLeadPlacement` to inject the work unit ("cert-tenant
configuration") — that mock hid this defect; it can now be removed (tracked).

**Distinguished from (recorded, not on this path):** B1 New Business Process create flow 400 on a partial
activation bundle; B2 no way to convert a legacy department to builder-owned — both Business Processes.

## 2. End-to-end browser QA (real database, isolated)

| # | Step | Result |
|---|---|---|
| 1–3 | Hosted calendar, Fri Oct 30 1:00 PM, published form completed | PASS (`browser/g1-received.png`) |
| 4 | One consent control; *Email me news* only | PASS — 1 control; submit `{email:true, sms:false}` |
| 5 | Processing receives case + pending tour | PASS — "Tour requested — pending acceptance (not booked)" |
| 6 | Nothing sent before approval | PASS — "Nothing is booked and nothing has been sent"; the auto-confirm approval below reports `replay:false`, i.e. the booking was created by approval, not before |
| — | Readiness | `leadPlacement {applies:true, ok:true}`; **Approve — Create enrollment lead** enabled (was blocked before the fix) |
| 7–8 | Approve | 200 `completed`: household, child, person, link, lead, participation each `committed` once; lead handed to work unit `…0031`, work view `new_leads`, stage `lead` |
| 9–10 | Revalidate + book exactly once | booked `4d5a1f61…` (`pending_approval` — the schedule requires staff approval); replayed approval → `alreadyDone`, same booking `replay:true`; Fri 1:00 PM no longer offered (1:30 PM remains) |
| 10 | Staff confirms the booking | `POST …/bookings/{id}/confirm` → 200 `confirmed`; second confirm → 400 "confirm only allowed from pending_approval" |
| 10–11 | Auto-confirm schedule (Mon Nov 2 10:00 AM) | approval → `booked`, `confirmed`, `replay:false`, comms `{status:"sent", detail:"email:sent"}` = confirmation **enqueued** as a `communication_messages` row (delivery not claimed: no provider on the target). Internal calendar invite goes only to configured staff recipients — none configured; not evidenced |
| 12 | Consent survives approval | email marketing `opted_in`, source `public_intake`, method `form_checkbox`; SMS `skipped_unset`; replay → `replayed:true` (written once) |
| 13 | Existing opt-out enforced | operator set email marketing **Blocked** → `opted_out`; repeat inquiry with email ticked matched the family (**Approve — Link existing**, same person and lead after *Review matches → Same child*) → `preserved_opt_out`; state still `opted_out`. The family's active tour was not duplicated: `needs_rescheduling: existing_active_tour` |
| 14 | Requested slot unavailable at approval | schedule switched off → approval 200, lead created, `needs_rescheduling: slot_unavailable`; case shows "Lead accepted — tour needs rescheduling", current openings, "Schedule a time from the lead's tour action" (`browser/g3-unavailable-approved.png`); schedule re-activated |

Full JSON responses: `responses/`. Screenshots: `browser/`.

## 3. P1 polish

Preserved and re-verified on the integrated candidate: branding truth, readiness (now with a positive
"ready" case), one consent control, labels. New: anonymous inquiry pages no longer log 409 (`NO_SESSION` on
the two read-only participant probes answers `ok:false` with 200; every consumer reads `ok`/`data`;
`INVALID_LINK` stays 404, other refusals 409); overriding fields read "school name and brand colour".
**Deferred with owner:** Studio Health / Work "trend" placeholders — pinned by the workspace doctrine test
(`WORK_TRENDS` / `STUDIO_TRENDS`) as design placeholders until a historical comparison API exists (Workspace/UI).

## 4. Validation

| Check | Result |
|---|---|
| `toursP1Close` (now 24 cases) + D3/D4 Processing suites | 58/58 · placement-related suites 73/73 |
| Related suites on the integrated tree | **643/647** — 4 inherited from staging (`rawSelectAdoptionLedger` ×3, `configurationRuntimeLocations` ×1); P1's diff vs staging touches none of their sources |
| `vac run typecheck` / `typecheck:tests` | PASSED on the integrated tree |
| `npm run prebuild` | exit 0 |
| `vac run build` | PASSED on `5bea7b940ba8` |

## 5. Observations for owners

- **Communications (COM-02):** after an opted-out person's repeat intake, the preference's `lastChange.source`
  reads `public_intake` though the state did not change — provenance display must not read as an opt-in.
- **Processing (cosmetic):** completed cases' queue chips read "Link existing" even when a new family was
  created (re-matched against the just-created person).

## Residue (isolated certenv only)

Leads/persons for `qa+g1approve@`, `qa+g2auto@`, `qa+g3resched@`; bookings `4d5a1f61…` (confirmed, Fri)
and `fd02ffcb…` (confirmed, Mon); earlier unapproved cases; orphan department "Tour Inquiries QA";
enqueued (undeliverable) confirmation messages. All go with the environment.

## Addendum (2026-10-28) — step 11 evidence, mock removed, staging re-reconciled

**Why.** Two claims above were weaker than they read. (a) Step 11 recorded only `comms: sent`; the family's
calendar invitation (the confirmation email's *Add to calendar* link — `tour_comms.ics` itself has no
consumer; internal staff ICS needs configured recipients) was never captured. (b) The S7 live suite still
mocked `resolveCreateLeadPlacement`, the mock that hid the blocker. The preview runtime is gone, so both were
closed on the shared real database (`alloy-cert`) instead of re-activating a governed preview.

**`d4b2ac7ed`** — S7's `mintLink` now applies `resolveOrgIntakeRoutingDefaults` exactly as a Studio-minted
link does (`default_department_id` = Northwind Enrollment) and the placement mock is deleted; step 8
asserts the confirmation email body carries `Add to calendar: https://calendar.google.com/…20330301T180000Z…`
for the booked time. **Negative control:** with `01d76bc1b`'s `buildPlan` line reverted, 15 tests fail with
`422 lead_placement_unresolved`; restored byte-identical (sha256 `e4daaf38…`), 22/22.

**`5d3a73697`** — merge of staging `24b03991c` (Documents EN-FI-01, 7 commits; no file overlap with P1;
0 behind). **New integrated candidate.**

| Check (tree `1d7ec334a4649d60` = `5d3a73697`) | Result |
|---|---|
| Related suites: toursP1Close, S7 live, `tests/processing`, placement ×3, consent/unsubscribe ×4, `tests/documents`, `tests/tours/publicCalendar` | **829 passed, 0 failed**, 30 skipped |
| Skipped | `processingIdentityCert{E2E,Operator,Rls}` — hard-wired to a dedicated `:55321/:55322` stack that is not run on this host (no private stack may be started). Not run; S7 covers public-form approval on `alloy-cert` |
| `vac run typecheck` / `typecheck:tests` | PASSED |
| `npm run prebuild` | exit 0 |
| `vac run build` | **PASSED** |

Browser QA was not repeated on `5d3a73697`: the staging delta is Documents-only and the browser journey
above stands on `5bea7b940`. A preview of the new candidate is the next certification step if the Director
wants browser evidence on the exact tree.

## Program tracker (2026-10-28)

| # | Item | Owner | State | Evidence |
|---|---|---|---|---|
| 1 | Approval blocker (422 `lead_placement_unresolved`) | Enrollment | **DONE** | `01d76bc1b`; browser §2; S7 negative control |
| 2 | §G steps 1–10, 12–14 end to end | Enrollment | **DONE** | browser §2 on `5bea7b940`; S7 22/22 on `5d3a73697` |
| 3 | Step 11 family calendar invitation (Add to calendar link) | Enrollment | **DONE** | S7 step 8 (`d4b2ac7ed`) |
| 3a | Step 11 internal staff calendar invite | Tours comms config | NOT EVIDENCED | needs `tour_comms.internal_recipients.user_ids`; none configured on any QA tenant |
| 3b | `tour_comms.ics` policy has no consumer | Tours comms | RECORDED | parsed and merged only; flag does not gate links |
| 4 | Branding truth, readiness, one consent control, labels, scheduling UX, Preview parity | Enrollment | **PRESERVED** | toursP1Close 24/24 in the related run |
| 5 | UX-04 anonymous 409 console noise | Enrollment | **DONE** | `17a22b3cc` |
| 6 | T1 copy ("and") | Enrollment | **DONE** | `17a22b3cc` |
| 7 | Studio Health / Work trend placeholders | Workspace/UI | DEFERRED | pinned by doctrine test until a historical comparison API exists |
| 8 | S7 placement mock | Enrollment | **DONE** | `d4b2ac7ed` |
| 9 | Staging reconcile | Enrollment | **DONE** | `5d3a73697`, 0 behind `24b03991c` |
| 10 | Production build on final candidate | Enrollment | **DONE** | `vac run build` PASSED, tree `1d7ec334` |
| 11 | Browser QA on exact final tree | Enrollment | OPEN (optional) | needs governed preview activation |
| B1 | New Business Process create → `lifecycle-activation` 400 | Business Processes | OPEN | P1-CLOSE |
| B2 | No path converts a legacy department to builder-owned | Business Processes / Lifecycle | OPEN | P1-CLOSE |
| C1 | Operator-visible consent status and provenance (incl. COM-02 `lastChange.source` after preserved opt-out) | Communications | OPEN | §5 |
| C2 | Governed non-500 response for an opted-out direct send | Communications | OPEN | data layer already `blocked` / `policy:OPTED_OUT` (S7 C·12) |
| C3 | Unsubscribe round-trip certification | Communications | OPEN (owner cert) | integration green: S7 C·9–C·12 |
| C4 | C1 Python CI coverage | Communications | OPEN | — |
| P1x | Completed-case queue chip reads "Link existing" for a new family | Processing | RECORDED (cosmetic) | §5 |
