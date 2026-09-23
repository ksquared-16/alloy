# Operator surface convergence — blocked on two authority decisions

**Classification: `BLOCKED_ON_AUTHORITY_DECISION`.** No UI was built. Both blocking conditions in
the final classification are met, and the instruction says to stop at the decision rather than
invent the model.

Starting staging: `4ade23c23`. Its 92 commits touch none of this slice's authorities — the only
`focusPanel` hits are attendance and mountable-cards, and nothing under `lib/financials`,
`lib/commercial`, `lib/enrollment/pricing`, `lib/scheduledWork` or `adminV2/financials`.

## 1. Responsibility shares — NOT blocked, and the deferral is narrower than it reads

`SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED` says, in the canonical doc's own words: *"fixed
shares are operator-authorable; percentage and remainder exist in the arrangement authority with no
Core authoring surface."*

The authority is complete today. `arrangementService` accepts `percentage | fixed | remainder`,
validates 0–10000 basis points, refuses a total over 100%, refuses more than one remainder, refuses
a duplicate party, requires at least one party, verifies every party belongs to the org, and
effective-dates the arrangement.

**So §12's multi-party allocation needs no extension.** Building the authoring surface *retires*
the deferral rather than violating it — but the doctrine line above must be updated in the same
change, or the docs will still claim there is no surface.

## 2. Charge-to responsibility — BLOCKED

Charge-grain responsibility exists: `billing.resolve_responsibility` and
`billing.reallocate_responsibility` both take a `charge_id`, derive the allocatable net from the
charge (the caller may not send amounts), and reallocation requires a reason.

But they divide the net **between the parties the arrangement in force names**. An arrangement's
only scope dimensions are `customerMemberId` — household, or one child — and effective dates
(`arrangementSpecificity`). **There is no charge dimension.**

So "choose the responsibility treatment for THIS charge" cannot be expressed:

- changing the arrangement rewrites who owes for the whole household-or-child across the effective
  window, which §35 forbids;
- `reallocate` can move a charge onto the arrangement in force, but cannot carry a split that
  applies to that charge alone.

### Smallest extension

A **charge-scoped arrangement**: let an arrangement name an optional `charge_id` alongside its
existing `customer_member_id`, and let `arrangementAppliesTo` prefer it over child- and
household-grain for that charge only. Shares, validation, effective dating, supersession and the
allocation engine are all reused unchanged; only the specificity ladder gains a rung.

That keeps one arrangement model and one allocation engine, and it leaves history alone — a
charge-scoped arrangement cannot alter what any other charge already resolved.

## 3. Charge-level discount waiver — BLOCKED

`commercial_policy_exceptions` is keyed `(org_id, policy_id, opportunity_customer_member_id,
effective_start)` and carries no charge. Its own comment states the intent: an exception is *"scoped
to exactly the thing an accepted price is scoped to"* — the relationship.

Dating an exception to cover one charge's service date would waive the policy for that relationship
across the whole window, which §14 explicitly forbids. There is no other path:
`financial_reduction_applications` records reductions **applied**, never one deliberately withheld,
and `waiver` in this codebase is a policy KIND, not a charge-level act.

**So nothing today can say "this applicable policy did not reduce this charge, and here is why."**

### Smallest extension

A **charge-grain reduction exclusion** carrying the provenance §15 requires: policy, charge (or
charge intent, for a waiver decided during Add Charge before the charge id exists), operator,
reason, time, and effect. `resolveFinancialReductions` consults it alongside the relationship
exception and reports `excluded_by_charge_exception` as a distinct reason, so the ledger can
explain the absence.

The charge-intent half matters: §14 asks the operator to decide at Add Charge time, which is before
the charge exists. Either the exclusion is written after the charge is created in the same
orchestration with honest partial-completion behavior, or it is keyed to the charge intent the Add
Charge writer already carries. That is a decision, not a detail.

## What was NOT done, and why

No UI. §10's "Charge to" control and §14's Apply/Waive decision are the two central controls of
this slice, and neither can be honestly driven by an existing authority. Building the rest — the
administration strip, the depth cards, the Overview treatment, the Add Charge clutter removal —
around two controls that cannot yet work would need rework the moment either decision lands, and
§44 says to stop at the decision instead.

`FINANCIALS_ADMINISTRATION_BELOW_LEDGER_FOLLOWUP` remains open and unmeasured this run.
Human QA remains ZERO / 44.
