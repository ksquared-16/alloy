---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Billing rate-resolution contract (`BillingScheduleProjection`)

**Status:** Proposed — the revised Scheduling ↔ Billing projection that supports **rate choice and financial values**. It **supersedes the `BillingProjection` shape** in [`scheduling-billing-boundary.md`](./scheduling-billing-boundary.md) §4 (which returned a single rate). It is **refined against the existing Billing/commercial implementation**, not invented parallel to it. Companion: [`scheduling-pattern-and-financial-spec.md`](./scheduling-pattern-and-financial-spec.md).

**Ownership is unchanged:** Billing owns this projection and every amount in it; Scheduling **requests** it (with a schedule context) and **displays** it. Scheduling computes nothing and exposes no ledger.

---

## 1. The contract

```
BillingScheduleProjection {                 // Billing owns; Scheduling requests + displays
  status: 'resolved' | 'pending' | 'needs-authorization' | 'stale' | 'unconfigured'
  effectiveFrom, effectiveTo | openEnded

  recommendedRate: {
    rateId, name, basis,                     // basis: 'week'|'day'|'hour'|'program'|…
    recurringFrequency,                      // 'month'|'week'|…
    baseAmount,                              // money
    reason                                   // why this rate applies (plain language)
  }

  eligibleRates: [ {
    rateId, name, basis, baseAmount,
    recommended: bool,
    overrideRequirements: { permission?, approval?: bool, reasonRequired?: bool } | null
  } ]

  selectedRate: {
    rateId,
    selectionSource: 'recommended' | 'operator' | 'override',
    overridden: bool,
    overrideReason?: string,
    overrideStatus?: 'pending-approval' | 'approved'
  }

  discounts: [ { discountId, name, amount, frequency, effectiveFrom, effectiveTo } ]

  funding: [ {
    fundingId, name,                         // funding source
    projectedAmount | null,                  // null when pending
    status: 'projected' | 'pending' | 'partial' | 'expired',
    effectiveFrom, effectiveTo
  } ]

  totals: {
    baseRecurringTuition,
    totalDiscounts,
    totalFunding,                            // null-aware: pending funding excluded, flagged
    familyResponsibility,                    // baseRecurring − discounts − funding (residual to primary payer)
    recurringFrequency
  }

  warnings: string[]                         // unresolved rate · pending funding · stale · unconfigured · override-unapproved
  permissions: { mayOverride: bool, mayApprove: bool }
  freshness: { computedAt, state: 'fresh'|'stale', inputVersions }
  detailLink                                 // → Billing (discount/funding/ledger detail)
}
```

- **Choice, not a single answer:** `recommendedRate` + `eligibleRates[]` support §3–4 of the spec. `selectedRate` records what the operator chose and whether it was an override.
- **Numeric discounts & funding:** `discounts[].amount` and `funding[].projectedAmount` are always amounts **or** an honest `pending` status — never vague text.
- **Family responsibility** is Billing's residual after discounts and funding (the primary payer's share).
- **Refresh & staleness:** `freshness` drives the "review again" behavior; `status:'stale'` blocks commit until re-requested.

---

## 2. How it maps to what Billing already has (no parallel concepts)

The contract is a **read-shaping** over the existing commercial/consumption pipeline, not new pricing:

| Contract element | Existing Billing/commercial capability |
|------------------|----------------------------------------|
| `recommendedRate` / `eligibleRates` | `commercial_tuition_rates` (variant × cadence × payer × location) + `commercial_products`; the resolver picks the applicable rate for the context — **eligibility is enumerating the configured rates valid for the context** |
| `baseAmount` / pricing | the commercial preview pipeline `evaluate() → attribute() → expand()` — **write-free, deterministic** ([`../core/commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md)) |
| `discounts[]` | `commercial_policies` (proration, discount, sibling_discount, waiver) resolved at evaluation |
| `funding[]` + `familyResponsibility` | **`attribute()` + the multi-payer `FundingPlan`** — a funding source is a payer; `familyResponsibility` is the **residual to the primary payer** (the existing model already splits net across payers with residual → primary) |
| `effectiveFrom/To` | `effectiveDating`; `expand()` dates the recurring occurrences |
| `warnings` | the existing preview `notes[]` (e.g. unmapped accounting, no policy configured) |

So **funding, discounts, and multi-payer family responsibility are already computed** by the commercial preview; the contract just shapes them for Scheduling and adds explicit rate *choice*.

---

## 3. Implementation gap report

Comparing the contract to built Billing capabilities. Classified: **already available · requires binding · small extension · blocks Scheduling implementation · V2.**

| Contract need | Status | Note |
|---------------|--------|------|
| Write-free pricing of a schedule context (`baseAmount`, recurring) | **already available** | commercial preview `evaluate→attribute→expand` |
| Discounts as amounts (`discounts[]`) | **already available** | `commercial_policies` resolved in preview |
| Funding + family responsibility (multi-payer) | **already available** | `attribute()` + `FundingPlan`; residual → primary |
| Effective-dated recurring occurrences | **already available** | `expand()` + `effectiveDating` |
| Preview `warnings`/notes | **already available** | preview `notes[]` |
| **`BillingScheduleProjection` read endpoint** (schedule context → §1 shape) | **requires binding** | a Billing-owned read model that packages the above for Scheduling — the central integration |
| **`eligibleRates[]` enumeration** (which configured rates are valid for the context, + recommended flag) | **small extension** | the resolver picks *one* today; enumerating *eligible* configured rates for the context is additive |
| **`overrideRequirements` / override approval status** on rates | **small extension** | override policy + approval exist as commercial policy concepts; surfacing per-rate requirements is thin |
| Rate **selection persistence** (Scheduling stores the selected `rateId` reference on commit) | **requires binding** | persist the reference on the committed schedule/commercial link; no amount stored |
| Configured command placements for **Select rate / Override rate / Request approval** | **requires binding** | register + configure via the Action Runtime ([`scheduling-pattern-and-financial-spec.md`](./scheduling-pattern-and-financial-spec.md) §13) |
| Funding `pending` honesty (null amount + status) | **small extension** | represent unresolved funding explicitly rather than omitting |
| Stale-on-rate/config-change signal | **small extension** | commercial config version already exists; wire the staleness check |
| Custom-amount override, approval workflow UI | **V2** | choose-among-eligible covers V1; free custom amount + full approval flow can follow |

**Nothing in this report blocks Scheduling implementation.** Every amount is already computed; the work is a **read endpoint + a thin eligible-rates enumeration + configured command placements + a persisted rate reference** — bindings and small extensions over built capabilities, no new financial domain, no Billing redesign.

---

## 4. Blocker statement

> **No genuine blocker remains before Scheduling implementation begins.** The four V1 "required-before" items ([`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) §7) plus this pass's additions are all **bindings or small extensions over existing, built capabilities**: the Scheduling card projection read model, the configured Scheduling/rate/override command placements, the temporary-move policy + continuity calculation, the room-week health rollup, and the `BillingScheduleProjection` read endpoint with eligible-rates enumeration. None requires a new runtime, a new financial domain, a Billing redesign, or a resolved product-design question. Scheduling can begin implementation at the [engineering handoff](./engineering-handoff.md) build order; the Billing binding is a parallel read-endpoint task owned by Billing.

---

## Cross-references

- [`scheduling-pattern-and-financial-spec.md`](./scheduling-pattern-and-financial-spec.md) — week config, pattern editor, rate selection, override, numeric discounts/funding, neutral styling, ownership.
- [`scheduling-billing-boundary.md`](./scheduling-billing-boundary.md) — the boundary (this supersedes its single-rate projection shape).
- [`../core/commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md) — the existing write-free pricing/attribution pipeline.
- [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) — the broader value-ownership + command matrix.
