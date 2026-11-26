---
title: Thread 11A §5 — deep-surface convergence matrix
status: sprint
---

# Focus Panel Details vs Financials Workspace Accounts

Authority/meaning identity, not pixel identity. Mounted on candidate `c473487f4`
(production, no HMR, hosted `ikaxilmwmrmbagoidedu`, guard ACCEPT).

**A** = Focus Panel → Financials → Details **B** = Financials Workspace → Accounts

| # | Capability | A authority | B authority | Same? | Mounted result | Follow-up |
|---|---|---|---|---|---|---|
| 1 | ledger | `FinancialsLedger` | `FinancialsLedger` | YES | both render the shared row component; lenses `all/charges/credits/funding/payments` identical on both | — |
| 2 | transaction concepts | `reductionProvenance` | `reductionProvenance` | YES | `Discount · Credit · Adjustment · Reversal` all four present under the credits lens | — |
| 3 | child/subject scope | `financialsRowScope` | `financialsRowScope` | YES | one predicate, three scopes (`all`/`household`/member); child scope includes household rows | — |
| 4 | responsible-party scope | `accountLenses.responsiblePartyOptions` | same | YES | `Responsible party` is a shared LEDGER COLUMN on both; independent of subject (locked) | — |
| 5 | payer scope (Payments) | payments lens only | payments lens only | YES | `payerOptions` reads payments; never the ledger | Payer administration stays Payments scope |
| 6 | Billing Period | `billingPeriod.ts` | same | YES | `BILLING PERIOD September 2026` on the Add surface; `Billing period August 2026` on the charge detail | — |
| 7 | dates | template strategies | same | YES | `SERVICE DATE`, `dated by the event / to the service period / today` identical in both hosts | — |
| 8 | GL | charge template `default_gl_mapping_key` | same | YES | `GL account 4040 · Late Pickup Fees` on the charge detail | GL not surfaced on the Focus Panel ledger row |
| 9 | discount provenance | `reductionProvenance` | `reductionOf(row)?.conceptLabel` | YES | `10% of $400.00 · Ongoing` renders in both | — |
| 10 | prepaid | `availableFunds` | `availableFunds` | PARTIAL | `AVAILABLE PREPAID $200.00` stat on A; B renders no summary band at all | see note 2 |
| 11 | row actions | shared `RowAction` | shared `RowAction` | YES | A showed `reverse/adjust/post`, B `reverse/adjust`; `charge.post` IS wired in B and renders only for DRAFT rows | conditional, not a fork |
| 12 | Add | `AddChargeCommand` | `AddChargeCommand` | YES | B raises the SAME surface: same 5 types, same `APPLIES TO`, same tablist; choosing a child reveals the same `ALSO BILL` and the same `$40.00 per child · 2 children` | — |
| 13 | Adjustment | `billing.adjust_account` | `billing.adjust_account` | YES | same command key from both hosts' row actions | — |
| 14 | Reverse | `charge.reverse` | `charge.reverse` | YES | same command key; A proven to return to the same Details | — |
| 15 | responsibility administration | **absent** | **absent** | N/A | `Manage responsibility` is on neither; it lives on Financials → Charges → charge detail | `RESPONSIBILITY_ADMINISTRATION_NOT_ON_DETAILS` |
| 16 | command dismissal / back-stack | Cancel/Escape/outside-click → same Details | not re-measured | PARTIAL | A fully proven in Section 3; B not measured | B back-stack unproven |

## Notes

1. **No semantic fork was found.** Two candidates were investigated and both dismissed: the missing
   `post` action in B is conditional rendering for draft rows, and B's missing stats are deliberate.
2. **B renders no summary band by design.** Its own source states the composed Financials card above
   it is the account's one summary, and that repeating those figures "gave the surface two summaries
   and no hierarchy". Responsibility is carried per-row instead of as a stat. This is a presentation
   difference under one authority, which §5 permits — not a fork.
3. **Nothing new was abstracted** to make a row green.

## Remaining for a complete §5

Rows 10 and 16 on the Workspace side, and GL on the Focus Panel ledger row (row 8 follow-up).
