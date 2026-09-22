---
title: Thread 11A §6 — /organization/financials configuration inventory
status: sprint
---

# What an operator can actually configure, and what consumes it

Reachability, not schema existence. Mounted across all six chapters on candidate `c473487f4`.
A configuration nothing consumes is not productization, so every row names its runtime consumer —
established by tracing actual `resolveFinancialPolicy(...)` call sites, not by string search.

| # | Item | Canonical authority | Configuration route | Reachable | Runtime consumer | Disposition |
|---|---|---|---|---|---|---|
| 1 | billing cadence | `financial_policies.billing_cadence` + Tuition ▸ Billing Frequencies | `?chapter=policies` (New policy) and `?chapter=tuition` | YES | `consumptionService` | CONFIGURABLE_AND_REACHABLE |
| 2 | recurring tuition / charge generation | `generateTuitionCharges` | Financials → Charges ▸ **Generate a period's tuition** | YES | `generateTuitionCharges`, `previewTuitionGeneration` | CONFIGURABLE_AND_REACHABLE |
| 3 | Billing Period behaviour | `billingPeriod.ts` (code-owned) | none — derived from the agreement's anchor | N/A | charge write + ledger grouping | NOT_SUPPORTED as configuration, by design |
| 4 | invoice / bill timing | template `billable_on_strategy` | `?chapter=catalog` / template authoring | YES | `resolveChargeFromTemplate` | CONFIGURABLE_AND_REACHABLE |
| 5 | **due-date policy** | `financial_policies.due_date` + `resolveDueDate.ts` | `?chapter=policies` (offered, resolves "no policy — fallback") | YES | **NONE — `resolveDueDate` has no caller and `ctx.dueDate` is never supplied** | IMPLEMENTED_NOT_SURFACED (see note 1) |
| 6 | posting review | `financial_policies.posting_review` | `?chapter=policies` | YES | `chargeLifecycleService` (the write path), `buildFinancialsCardVM`, `consumptionService` | CONFIGURABLE_AND_REACHABLE |
| 7 | proration | `financial_policies.proration` | `?chapter=policies` | YES | `generateTuitionCharges`, `previewTuitionGeneration`, `consumptionService` | CONFIGURABLE_AND_REACHABLE |
| 8 | subject-grain | `chargeCategorySemantics` (CODE-owned) | none — deliberately not operator-configurable | N/A | Add write path + `APPLIES TO` list (both, as of `c473487f4`) | NOT_SUPPORTED as configuration, by design |
| 9 | discount policy | `commercial_policies` | `?chapter=policies` ▸ **New Policy** | YES | `resolveFinancialReductions` | CONFIGURABLE_AND_REACHABLE |
| 10 | discount eligibility / exemption | policy params + `chargeCategorySemantics.discountable` | `?chapter=policies` (basis, coverage, scope) | PARTIAL | `resolveReductionEligibility` reads `child_enrollment_agreements` / `employments` | CONFIGURABLE_AND_REACHABLE for coverage; per-category exemption is code-owned |
| 11 | deposit policy | `financial_policies.deposit` | `?chapter=policies` | YES | none via the policy resolver | `DEPOSIT_OPERATOR_PRODUCTIZATION_GAP` — preserved, not built |
| 12 | prepaid policy | `availableFunds` (`heldSupported: false`) | none | NO | position readers only | FUTURE_PAYMENTS_SCOPE |
| 13 | accounting calendar | — | none observed | NO | — | MODEL_EXISTS_NOT_PRODUCTIZED |
| 14 | accounting periods | `accountingPeriod.ts` | none observed | NO | charge detail states `Accounting period — Not posted to a period yet` | FUTURE_ACCOUNTING_SCOPE |
| 15 | GL mappings | `gl_codes` + charge-category mapping | `?chapter=accounting` ▸ New GL Code, "Where each charge category posts" | YES | charge write (`default_gl_mapping_key`) | CONFIGURABLE_AND_REACHABLE |

## The policies chapter carries TWO authorities

Easy to miss and worth stating: **New Policy** (capital P) authors `commercial_policies` — the
pricing/discount rules, with basis × coverage × scope. **New policy** (lowercase) authors
`financial_policies` — the execution rules. The "Resolved (org default)" panel enumerates ten:
Proration, Billing cadence, Grace period, Late fee, NSF fee, Deposit, Refund policy, Posting review,
Vacation credit, Due date. All ten currently read `no policy — fallback` at org scope.

Of those ten, **four have no runtime consumer at all**: `late_fee`, `nsf_fee`, `refund_policy` and
`deposit`. They are offered by the configuration surface. Per the instruction's own rule — a
configuration nothing consumes is not productization — they are named here rather than counted as
capability.

## Note 1 — the due-date policy is authored but not wired

`resolveDueDate.ts` implements four strategies and is called by nothing; `ChargeResolutionContext`
declares `dueDate` and no caller supplies it, so `resolveChargeFromTemplate` always records `null`.
NOT repaired in this batch, deliberately: the cross-batch rules forbid touching the due-date model,
and its enabling migration (`20260918120000`) is the one held by the PR #1070 governance deadlock,
so the `due_date` policy type cannot even be stored hosted until that applies.

**Follow-up: `DUE_DATE_POLICY_NOT_WIRED`.**

## Funding is a stated boundary, not a gap

The funding chapter renders "Payment responsibility stays in Processing… Programs and Financials set
price and catalog; Processing decides responsibility." FUTURE_PAYMENTS_SCOPE, documented by the
product itself.
