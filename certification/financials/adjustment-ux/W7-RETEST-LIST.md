---
title: W7 scenarios to retest once Adjustment UX Convergence deploys
program: Financials V1
run: erun_7ca2204cd141d507
status: IDENTIFIED — NOT MARKED
---

# W7 RETEST LIST

**Nothing below is marked.** W7 remains paused and Kelly's testimony is untouched. This is the list
§24 asked for: the exact scenarios in `core_financials_director_qa` whose script or surface this
slice changes, with what changed and why it matters to that scenario.

Catalog read from `web/lib/qa/financialsDirectorQa/scenarioCatalog.ts`.

## THE SCENARIO SCRIPT IS NOW STALE — retest and re-author the step text

### `adjustment_draft` — "A credit is drafted against a named obligation"
Its `doThis` reads: *"Against charge → choose the obligation. **Type → Credit — lowers what the
family owes.**"*

Both steps have changed:
- **The Type control no longer exists.** It asked `credit` / `adjustment` and then showed a
  direction only for `adjustment` — one decision in two controls, and they disagreed: the sign was
  `category === "adjustment" && direction === "increase"`, so *credit + increase* produced a
  **reduction**. The operator now chooses once: **"What needs to change → Reduce what the family
  owes"** or **"Increase what the family owes"**. The category is derived.
- **"Against charge" is now "What this is about", and it is optional.** Its placeholder states the
  account-level answer: *"The account as a whole — not one charge"*. The canonical authority always
  allowed a source-less adjustment; Preview refused to let an operator reach one.

The scenario's *intent* — a credit names what it reduces and moves nothing yet — is unchanged, and
the `expectUnchanged` / `invariant` still hold.

### `reduction_zero_bound` — "A credit stops at zero"
Its navigate step still works, but the source is now chosen through a control with a different label
and an explicit empty answer. Worth confirming the refusal still reaches the operator in the
obligation's terms rather than as a permissions message (its own `failSymptoms` names that).

## BEHAVIOUR CHANGED UNDERNEATH THE SCENARIO

### `reverse_adjustment` — "Reversing a credit restores the obligation"
**The reversal no longer carries the original's period key.** It was correctly dated today and then
handed `original.period_key`, so a credit raised in a finalized November and reversed in December
was written as a December charge **stating November** — the canonical `billing_period_id` was right
and the stated period contradicted it, so every surface reading `period_key` showed the reversal
inside closed history.

Everything this scenario asserts is unchanged: the original stays listed with its reason, an
opposite entry is appended, the obligation is restored, and a second reversal is still refused. What
changes is the period the reversal says it belongs to.

### `adjustment_post` — "Posting the credit is what reduces the obligation"
No behaviour change of its own, but it `requires` `adjustment_draft`, which now runs through the
rebuilt panel. Retest the chain rather than the step.

## SURFACE CHANGED

### `reload_switch_viewport` — "Reload, switch household, and shrink the window"
**The most directly affected.** Its `failSymptoms` include *"A control off-screen and unreachable"*
and *"The page sliding left to right"*, and it asks the tester to work at roughly 390×844 — which is
exactly where the stacking defect was measured. The Adjustment band no longer carries its own
border, background, 520px cap, `overflow-y: auto` or `z-index: 61` inside the command host.

### `charge_detail_attribution` — "The charge says whose it is"
Charge Details gained a **Correction** block for a charge that is somebody's adjustment — direction
in words, what it corrects, whether that period is finalized, why, and reversal lineage as sentences
rather than ids — and a **"Correct this charge"** command beside Close.

### `cross_surface_consistency` — "Every surface tells the same story"
Accounts and the Focus Panel render one band through one command. Both were changed together, and
this scenario is the one that would catch them diverging.

### `discount_vs_adjustment` — "An authored discount is not a manual correction"
Its whole point is that the two remain distinguishable. The manual-correction half now presents
differently, and the operator is no longer offered a control that names `credit` as a *type* — so
the distinction has to carry on the account's labelling alone, which is what this scenario reads.

## WORTH CONFIRMING UNCHANGED

### `add_charge_honours_review_boundary` — "Add puts the charge where the review boundary says"
Add → Charge is the control half of the stacking comparison and shares the mode tabs and the command
shell with Adjustment. Nothing in the Charge path was modified, and this scenario is the cheapest
confirmation of that.

### `financial_subject` — "A household with no money is still a financial subject"
Unchanged by this slice, but it is the entry scenario for the account surface the repaired command
opens over, and a cheap first step before the list above.
