---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Commercial Execution Simulator — expected deltas vs Substrate A

**Status:** Phase 8. The Commercial Execution preview path (`POST /api/admin/commercial/execution/preview`) runs the platform pipeline `evaluate() → attribute()? → expand()` over **frozen Commercial V1**. The legacy consumption simulator (`POST /api/admin/financial/consumption/simulate`) runs the **Substrate-A** pipeline (`resolveConsumption` over `childcare_rate_*` + `financial_charge_templates` + `financial_policies`). Both are **preview-only** and create no financial truth. This document records where — and why — the two are expected to differ, so a "difference" is not mistaken for a regression.

Each relevant delta is also surfaced per-preview in the response `notes[]`.

---

## The paths are not identical by construction

| Axis | Commercial Execution (new) | Substrate A (existing) |
|---|---|---|
| **Input** | `CommercialContext` (program/offering/variant + cadence + payer intent) | `OperationalFactDto` (an operational *fact*: schedule/attendance event) |
| **Pricing source** | `commercial_tuition_rates` (variant × cadence × payer × location) + `commercial_products` | `childcare_rate_plans` / `childcare_rate_rules` (scope + schedule_basis) |
| **Policies** | `commercial_policies` (Commercial-owned) | `financial_policies` (Substrate A) |
| **Funding** | `attribute()` + consumer `FundingPlan` (multi-payer) | single `responsibility_key` |
| **Output** | `CommercialResolution` (+ optional `CommercialSchedule`) | Consumption Event + Resolved Obligation(s) |

Because the two consume **different configuration substrates**, byte-for-byte equivalence is only expected when an org has configured both consistently. Where they overlap (recurring tuition), the amounts match **iff** `commercial_tuition_rates` and `childcare_rate_rules` hold the same price for the same scope.

---

## Expected, non-regression deltas

1. **Null accounting → structured warnings.** Commercial Execution surfaces `accounting_unmapped_revenue_category` / `accounting_unmapped_gl_account` as **non-blocking warnings** when a line has no revenue category or the category is unmapped. Tuition is unmapped today (its `revenue_category_id` is unpopulated until Accounting V2 UI wiring), so tuition previews carry this warning **by design** — the line still prices; the resolution can still be `resolved`. Substrate A resolves GL via a charge template's `default_gl_mapping_key`, which is likewise often null. *No default revenue category is invented (per approval).*

2. **Policy differences.** Commercial Execution applies `commercial_policies`; Substrate A applies `financial_policies`. In an org with **no `commercial_policies` configured**, Commercial Execution applies no policy → `net === gross`, while Substrate A may independently apply proration / posting-review from `financial_policies`. This is an expected delta until policy config is migrated. Only resolution-time policy types (proration, discount, sibling_discount, waiver, eligibility, approval) exist in Commercial Execution; payment-time policies (late_fee, grace_period, …) are intentionally absent.

3. **Funding differences.** Commercial Execution can split `net` across payers via a `FundingPlan` (`attribute()`), producing per-line allocations + residual. Substrate A carries a single `responsibility_key`. With **no plan supplied**, Commercial Execution defaults to single-payer (residual = full net → primary), which corresponds to Substrate A's single responsibility. Multi-payer previews have **no Substrate-A equivalent**.

4. **Recurrence / timing.** `expand()` produces neutral dated `ScheduledOccurrence`s (calendar cadences step via `date-fns`; one-time/usage lines emit one occurrence). Substrate A emits obligations tied to charge-template `occurs_on`/`billable_on` strategies. The **occurrence dates** should align for a monthly recurring tuition anchored at the same date; the **shapes differ** (occurrences vs obligations) by design — Commercial Execution keeps Billing vocabulary out.

5. **Vocabulary.** The Commercial Execution preview contains no `charge`, `obligation`, `posted`, or `invoice`. Those appear only in the Substrate-A / Billing output. This is the intended boundary, not a missing feature.

---

## What is guaranteed equal

- **Determinism:** the same `CommercialContext` + config version always yields the same `resolutionKey`, the same lines, and the same `occurrenceKey`s (golden-file/snapshot-tested).
- **No financial truth:** neither path writes; the Commercial Execution preview has no obligation/charge/ledger fields at all.
- **Pricing equality where configured consistently:** a resolved tuition line's `gross` equals the Substrate-A rate-resolved amount when `commercial_tuition_rates` and `childcare_rate_rules` agree for the scope.

---

## Not in Phase 8

No Billing integration, no obligations, no draft charges, no writes, no removal of the Substrate-A simulator, and no UI change (the preview path is API + pure builder only). Wiring a UI panel and a full A/B amount reconciliation over real org data are follow-ups.
