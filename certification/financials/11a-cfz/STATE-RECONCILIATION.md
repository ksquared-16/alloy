---
title: Thread 11A — instruction checkpoint vs actual tree
status: sprint
---

# The dispatched checkpoint is several runs stale

`erun_55c59ad2f0065e9d` was dispatched with:

```
Evidence candidate: cf562231d
Product candidate:  008b9db66
Section 3/4/5/6 COMPLETE, Section 7 findings OPEN
```

The tree is well past that. It is the same instruction text previously executed as
`erun_d545f8694d5169cf`, and its §1 findings were disposed across the runs since.

## §1 Core-blocking findings — ALREADY DISPOSED

| § | Finding | Disposition | Where |
|---|---|---|---|
| 7A | partial allocation not disclosed | **REPAIRED + mounted** — `partial` state, `Cert Certhouse · $57.00 unassigned`, both hosts | `partialAllocationDisclosure.test.ts` (8) |
| 7B | household obligation could not be owed | **REPAIRED + mounted** — household row resolves, 2 allocations, net $75.00 | `section7Dispositions.test.ts` |
| 7C | child-grain arrangement not authorable | **REPAIRED + mounted** — scope control, household default, supersedes `6669d66c → fd525086` | `section7Dispositions.test.ts` |
| 7D | share methods | **DEFERRED** — `SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` | `SECTION7-DISPOSITIONS.md` |
| 7E | due-date policy had no caller | **REPAIRED + mounted** — Certa due Sep 25 (`on_invoice`), Certb due Oct 5 (`days_after_invoice 10`), pre-policy charge "No configured terms" | `multiChildIdempotencyContract.test.ts`, `section7Dispositions.test.ts` |
| 7F | four inert policy types | **WITHHELD from authoring + mounted** — `inertShown=[]`, six consuming types remain | `section7Dispositions.test.ts` |
| 7G | charge reversal read as Credit | **REPAIRED + mounted** — 5 charge-level reversals typed `Reversal`, both hosts, `stillCallingThemCredit=0` | `section7Dispositions.test.ts` |
| 7H | ledger provenance inspection | **DEFERRED** — `LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED` | `SECTION7-DISPOSITIONS.md` |

Per §0 of the instruction — "do not reopen settled authorities unless mounted evidence demonstrates a
contradiction" — none were reopened.

## §2 Matrix — PASS 78 · FAIL 0 · BLOCKED 5

The five BLOCKED rows are the recurring-billing rows, and they share one dependency that is NOT a
Financials defect: **Billing Preview does not mount**, so no operator can accept recurring tuition
terms, so the tenant has no accepted `enrollment_pricing_terms`, so `billing.generate_tuition` has
nothing to bill.

## §3–§8 — not reachable

Catalog freeze, documentation canon, governed reseed, governance deadlock, reconciliation, promotion
and deployed smoke all sit behind a green Section 7.

## The one open question

Six hypotheses have been eliminated with evidence (see `RECURRING-REACHABILITY-DIAGNOSIS.md`). What
remains is a single measurement: **instrument the admitted-card-key list** and find the first stage
where `billing_preview` is present on one side and absent on the other.

One unexplained observation worth carrying: the mounted panel's geometry (Financials at 8/12 with a
4/12 companion slot) matches the **code composition's `area` model**, while the published doc
addresses geometry by `gridRow` buckets — every published section reads `gridRow: 0`. If the runtime
is composing from the code path for this subject, then `focusPanelSummaryUsesPublishedDoc` is
returning false (i.e. `context.familySettlement !== true`) and the v159/v160 publications were never
consulted at all. That is the cheapest thing to measure next.
