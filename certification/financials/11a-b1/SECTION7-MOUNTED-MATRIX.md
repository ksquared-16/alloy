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

## Not covered by this run

| Row | Status | Why |
|---|---|---|
| **E · recurring billing (weekly + monthly)** | **NOT RUN** | The weekly/monthly boundary proof is its own specimen chain — assignment → cadence → generation → idempotent rerun. It was not reached before the run ended, and monthly grouping must not be used as evidence for weekly billing. |
| **F · multi-child independence** | carried from Section 3 | Proven on earlier candidates (`$40.00 per child · 2 children`, independent discounts, independent responsibility); **not re-run on `b8247f946`**. |
| **G · prepaid** | partial | `Available` shown when positive (B-prepaid). Zero-silence, allocation reuse and payer-unchanged were proven earlier in the thread, not re-run here. |

## Deferred boundaries — behaving honestly, not reopened

`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` · `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED` ·
`DEPOSIT_OPERATOR_PRODUCTIZATION_GAP`.

## Tally

**PASS 44 · FAIL 0 · BLOCKED 0 · NOT RUN 3 (E, F re-proof, G re-proof) · DEFERRED 3.**

Three rows failed on first execution and all three were probe artifacts, corrected and re-run: a
1100-character text capture that cut off the resolved-policy panel, a 6-second wait that read the
workspace shell instead of the account queue, and a search for a policy's label on a panel that
lists by type.
