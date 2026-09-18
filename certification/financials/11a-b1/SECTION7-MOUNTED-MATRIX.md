---
title: Thread 11A §7 — mounted matrix (Batch B1)
status: sprint
---

# Section 7 mounted matrix

Candidate **`b8247f946`** · production · no HMR · hosted `ikaxilmwmrmbagoidedu` · QA guard ACCEPT.
Engineering mounted PASS. **This is not Human QA PASS, which remains ZERO.**

## The three named repairs

| § | Capability | Authority | Surface | Specimen | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|---|
| 7C | child-grain arrangement scope | `billing.configure_responsibility` | Manage responsibility | Field trip · Certa | Household + child offered, household default | `["Household — the whole account","Certa Certhouse only"]`, default `household` | **PASS** |
| 7C | deliberate child grain is sent | same | same | same | payload names the chosen child | `customer_member_id: e408fa51…` | **PASS** |
| 7C | supersession by effective dating | `arrangementService` | same | same | predecessor closed, not edited | `arrangement_id fd525086`, `superseded_id 6669d66c`, effective `2026-09-19` | **PASS** |
| 7C | household charge offers no scope | same | same | Registration fee · Household | no control where there is no second scope | control absent | **PASS** |
| 7E-A | `on_invoice` | `resolveDueDate` → `chargeLifecycleService` | charge detail | Materials · Certa | due = invoice | Invoice **Sep 25** · Due **Sep 25** | **PASS** |
| 7E-B | `days_after_invoice` 10 | same | same | Materials · Certb | due = invoice + 10 | Invoice **Sep 25** · Due **Oct 5** | **PASS** |
| 7E-C | no policy | same | same | Registration fee · Household (pre-policy) | untouched, never today | **"No configured terms"** | **PASS** |
| 7E-D | date identity | — | same | both Materials charges | five distinct dates | Service **Sep 18** ≠ Invoice **Sep 25** ≠ Due · Billing period **September 2026** · Accounting period **not posted** | **PASS** |
| 7E | configuration lifecycle | `financial_policies` | policies chapter | two authored policies | effective-dated, visible | `Current Sep 18 → ongoing` / `Scheduled Sep 19 → ongoing` | **PASS** |
| 7G | charge reversal concept | `financialRowConceptLabel` | Focus Panel Details | `b4b0caed` (`reversal of charge 6005cf5f…`) | `Reversal`, never `Credit` | type **Reversal**, −$25.00, Certa, GL 4060 | **PASS** |
| 7G | same, other host | same | Workspace Accounts | 5 charge-level reversals | all `Reversal` | 5/5 `Reversal`, `stillCallingThemCredit = 0` | **PASS** |
| 7G | original keeps its identity | — | both | `6005cf5f` | still its own charge | `Late pickup · $25.00 · GL 4040 · reversed` | **PASS** |

## A · /organization/financials

| Capability | Expected | Actual | Verdict |
|---|---|---|---|
| tuition plans + billing frequencies | reachable | Plans / Enrolment Commitments / Billing Frequencies | **PASS** |
| catalog charge types | reachable | `New Catalog Item`, 4 items | **PASS** |
| GL codes + category mapping | reachable | `New GL Code`, "where each charge category posts" | **PASS** |
| simulator | reachable | `Preview pricing` | **PASS** |
| discount policy | authorable | `New Policy` (commercial authority) | **PASS** |
| execution policy types | six consuming offered | `active=6` | **PASS** |
| inert types withheld | late_fee / nsf_fee / refund / deposit absent | `inertShown=[]` | **PASS** |

## B · Focus Panel Summary

| Capability | Actual | Verdict |
|---|---|---|
| approved rich anatomy | `body=rich`, **8/8** zones — Current period, Charges, Discounts & credits, Net obligation, Due, Past due, Balance, Paid | **PASS** |
| prepaid when positive | `Available` shown | **PASS** |

## C · Focus Panel Details

| Capability | Actual | Verdict |
|---|---|---|
| one focused surface, full ledger | `overlay=detail`, 103 rows | **PASS** |
| lenses | `all / charges / credits / funding / payments` | **PASS** |
| filters | subject · period · **responsible-party** | **PASS** |
| row commands | `reverse · adjust · post · resolveResponsibility · reallocateResponsibility` | **PASS** |
| responsibility states | `not-allocated · partial · unassigned · not-applicable` | **PASS** |
| no orphan payment band | band owned by the card (1) | **PASS** |
| GL + billing periods | both render | **PASS** |

## D · Workspace Accounts

| Capability | Actual | Verdict |
|---|---|---|
| zero-activity household reachable | account queue lists households with nothing billed | **PASS** |
| no false "Financial Account Unavailable" | absent | **PASS** |
| same ledger / lenses / GL | 64 rows, 5 lenses, GL present | **PASS** |
| same filters | subject · period · responsible-party | **PASS** |
| same row commands | reverse · adjust · resolve · reallocate | **PASS** |
| same responsibility states incl. partial | `not-allocated · partial · unassigned` | **PASS** |

## H · Responsibility

| Capability | Evidence | Verdict |
|---|---|---|
| household-grain arrangement | §4B/§7B — resolves a household obligation | **PASS** |
| child-grain arrangement | 7C above | **PASS** |
| partial allocation disclosure | `Cert Certhouse · $57.00 unassigned`, both hosts | **PASS** |
| Resolve | `kind: resolved`, 2 allocations, net $75.00 | **PASS** |
| Reallocate reachability | offered only where named; reason required; Confirm disabled without it | **PASS** |
| historical non-retroactivity | Sep 2 obligation still `Unassigned` | **PASS** |
| child identity unchanged | byte-identical before/after | **PASS** |
| payer unchanged | write-boundary proof; no payment created | **PASS** |

## E · recurring billing — PARTIAL

| Check | Authority | Expected | Actual | Verdict |
|---|---|---|---|---|
| E1 weekly periods are seven days | `assignmentBillingPeriods` | whole weeks | 4+ periods, all 7 days | **PASS** |
| E1 anchored on the agreement, not ISO weeks | same | the term's own weekday | every period starts on the anchor's weekday; a household anchored two days later gets different boundaries | **PASS** |
| E1 tiles with no overlap or gap | same | contiguous | each period starts the day after the previous ends | **PASS** |
| E1 month-crossing week stays whole | `billingPeriodsBetween` | one period spanning Sep→Oct | start `2026-09`, end `2026-10`, key carries both dates | **PASS** |
| E1 weekly key is not `YYYY-MM` | `billingPeriodKeyFor` | `start~end` weekly, `YYYY-MM` monthly | both confirmed | **PASS** |
| E4 span honoured, anchor outside it | `assignmentBillingPeriods` | only the requested span | held for a January anchor billing September | **PASS** |
| E4 no accepted term | same | falls back to the span | periods still produced | **PASS** |
| **E2/E3 monthly + weekly GENERATION and rerun** | `billing.generate_tuition` | charges generated, rerun creates none | **`Generate 0 · $0.00` — 0 to bill · 0 not due · 0 already posted · 0 refused · 0 errored** | **BLOCKED — no specimen** |
| **E5 recurring discount** | — | per-obligation resolution | nothing generated to discount | **BLOCKED — no specimen** |
| **E6 recurring due date** | — | resolved on generated charges | nothing generated to inspect | **BLOCKED — no specimen** |
| **E7 accounting period independence** | — | independent of billing period | nothing generated; stated honestly rather than fabricated | **BLOCKED — no specimen** |

**THE FIXTURE HAS NO RECURRING BILLING SPECIMEN.** The generation surface works and is honest — it
enumerated the organisation for September 2026 and reported nothing to bill, with every bucket zero,
meaning no assignment was even *considered*. The tuition charges on this account were authored by
hand across the thread; no accepted `enrollment_pricing_terms` exist. Establishing one is a
commercial configuration tree (plan → billing frequency → commitment → assignment → accepted terms)
and is **B2 reseed work**, not something to improvise here.

The boundary arithmetic — the part most likely to be wrong and the part the weekly/monthly
distinction actually turns on — is proven directly on the authority the generator and the preview
both call, with the month-collapse regression planted and caught.

## F · multi-child — PARTIAL

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| F1 unified Add command | opens | `add_charge` overlay | **PASS** |
| F2 child-grain type exposes the sibling | offered | 1 sibling checkbox | **PASS** |
| F3 amount stated per child with count | per-child + count | `$75.00 per child · 2 children · each receives their own charge` | **PASS** |
| F7 obligations stay child-attributed | no household row | `["Certa Certhouse"]` | **PASS** |
| F8 responsibility stays per obligation | not one household answer | per-row state | **PASS** |
| **F4/F5/F6 two independent obligations from one gesture** | `customer_member_ids`, 2 created | payload carried only `customer_member_id`; one charge created | **NOT PROVEN — OPEN QUESTION** |

**OPEN AND UNRESOLVED.** The summary line rendered `2 children`, which it only does when the
selection is greater than one — so the selection was 2 when the surface drew it and 1 when the
command was sent. The payload builder is intact (`customer_member_ids` is sent when the selection
exceeds one), so the question is what emptied the extra-child selection between render and confirm:
a probe timing artifact, or a real regression in the multi-child path.

I have not established which, and I will not guess at it. **This is the single most important thing
to settle next** — multi-child is a Core claim that Section 3 certified on an earlier candidate.

## G · prepaid — PASS

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| G1 positive available prepaid visible | > $0 through the read model | **Available $200.00** | **PASS** |
| G2 balance and prepaid are separate facts | two figures | **Balance $37.87** · **Available $200.00** | **PASS** |
| G3 prepaid not netted into the balance | balance stands alone | $37.87 unchanged by $200.00 of available money | **PASS** |
| G4 pending/unavailable money not offered | fail toward do-not-offer | `heldSupported: false`; carried from the prepaid authority, not re-proven here | **CARRIED** |
| G5 allocation reduces available and settles the target | canonical allocation | not exercised this run | **NOT RUN** |

## Deferred boundaries — behaving honestly, not reopened

`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` · `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED` ·
`DEPOSIT_OPERATOR_PRODUCTIZATION_GAP`.

## Tally

**PASS 58 · FAIL 0 · BLOCKED 4 (E2/E3/E5/E6/E7 — one absent specimen) · NOT PROVEN 1 (F4/F5/F6) · NOT RUN 1 (G5) · CARRIED 1 (G4) · DEFERRED 3.**

44 from the surfaces and the three named repairs, plus 14 closed here: 7 weekly-boundary checks,
5 multi-child checks and 3 prepaid checks (G1–G3).

Three rows failed on first execution and all three were probe artifacts, corrected and re-run: a
1100-character text capture that cut off the resolved-policy panel, a 6-second wait that read the
workspace shell instead of the account queue, and a search for a policy's label on a panel that
lists by type.
