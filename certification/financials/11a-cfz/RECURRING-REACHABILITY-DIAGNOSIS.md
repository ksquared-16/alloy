---
title: Thread 11A — recurring terms operator reachability, diagnosed
status: sprint
---

# `RECURRING_TERMS_OPERATOR_REACHABILITY_GAP` — three causes, two fixed

`AssignmentTuitionCard` (card key `billing_preview`) owns acceptance of recurring tuition terms
through `enrollment.pricing.accept`. It does not appear on the enrolled-child Focus Panel. Three
independent things kept it away; two are now fixed and the third is not.

## 1 · Grain declaration — **FIXED** (`1f78589d4`)

`billing_preview` declared no `grains`, so `grainsForDeclaration` fell to `DEFAULT_CARD_GRAINS`
(`["opportunity"]`) and the card was omitted from every **child**-grain panel — which is exactly
where enrolment pricing is decided.

It now declares `["opportunity", "child"]`, the same pair `financials` and `scheduling` carry. The
"silence never widens applicability" rule is untouched and still correct; relying on it for a card
that genuinely composes at both grains was the error.

## 2 · Published layout placement — **FIXED** (layout v158 → v159)

The tenant's published composition never placed the card. Republished through the canonical
append-only path — the current document cloned into a new draft, nothing edited in place — with the
section seated beside `scheduling`, so an enrolment and its price read together.

Verified: `placed: true`, `createdStatus 201`, `publishStatus 200`, `newVersion 159`.

## 3 · No card producer — **NOT FIXED, and this is the blocker**

After both fixes the card still does not mount. `focusPanelCardProducers.ts` composes exactly two
cards — `attendance` and `financials`. `billing_preview` has no producer, and neither does
`scheduling`, which is why **both** are absent from the runtime panel while sitting in the published
layout and declaring the child grain.

This matches the standing observation that focus-panel cards without a producer never compose.

**This is real feature work, not a certification fix.** `AssignmentTuitionCard` fetches its own data
client-side, so the producer may only need to admit the card rather than fetch for it — but that is
a runtime-composition decision to make deliberately, not to improvise.

## Consequence for Core

Recurring billing has **no operator entry point**: no operator can establish or change a child's
recurring tuition terms, which is why the QA tenant has no accepted `enrollment_pricing_terms` and
why `billing.generate_tuition` answers `Generate 0 · $0.00` for every period.

Section 7's five BLOCKED recurring rows all sit behind this one gap.
