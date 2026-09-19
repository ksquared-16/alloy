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

## 3 · ~~No card producer~~ — **WRONG DIAGNOSIS, corrected below**

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


---

# Correction and deeper trace (run `erun_37c19f1844704dc9`)

## The producer hypothesis was WRONG

`focusPanelCardProducers.ts` is not a mount gate. Its own doctrine: Business Process and Current
Work **project synchronously** from the operational context; Attendance, Health and Financials each
need their **own read**, so they joined one shared lifecycle instead of each booting its own. The
boundary is "initial card truth only".

A card with no producer is not excluded — it simply has no bootstrapped data, which is fine for
`AssignmentTuitionCard` because it fetches its own.

## The two real exclusion mechanisms

`deriveFocusPanelSummaryCompositionInputs` applies exactly two:

1. **Provider availability** — `isCardProviderUnavailable(key)`. `CARD_CAPABILITY_PROVIDERS`
   contains **only `milestones: []`**. `billing_preview` requires no provider and is available.
2. **Authored visibility** — `cardVisibilityFromMeta`. `linked` cards are navigable-only and "must
   not occupy initial Focus Panel settle geometry". The code names Assignments/`scheduling` as
   exactly such a card.

## What that made visible — including my own error

Read back from the published doc, before correction:

| card | visibility | mounts |
|---|---|---|
| business_process, financials, children, household, health_safety, attendance | `null` (→ visible) | YES |
| scheduling | **linked** | no — *by design* |
| milestones | **linked** | no — *and provider-unavailable* |
| **billing_preview** | **linked** | no — **because I cloned `scheduling`'s section in v159** |

The v159 placement carried `scheduling`'s linked intent onto a card meant to be visible. Corrected
in **v160**, published through the same append-only path with `visibility: "visible"`.

## Still not mounted — at least one gate remains

After v160 the card still does not render. Candidates not yet eliminated, in the order worth testing:

1. **Grid source.** `resolveFocusPanelModeGrid` returns
   `deriveFocusPanelGridFromLayoutDoc(FOCUS_PANEL_SUMMARY_DEFAULT_DOC)` — the **code-owned default
   doc**, not the published one — while its own comment says Summary resolves from the active doc.
   If the render path takes the grid from the default doc, a published placement can never add a
   card. (The v158 density fix worked because appearance is card *config*, not grid membership.)
2. **Grain filtering at the child panel**, despite the now-declared `["opportunity","child"]`.
3. **Layout caching** in the admin context.

## `SCHEDULING_PRODUCER_GAP` — WITHDRAWN

There is no scheduling producer gap. `scheduling` is deliberately authored **linked**. Nothing to do,
and no Scheduling work belongs in Thread 11A.

---

# Run `erun_fef4a4b40ce6a05e` — grid-source hypothesis DISPROVEN

Measured under an accepted guard (`d3586bb12`, production, no HMR, fresh server, published v160).

## The Summary grid source, measured

`resolveFocusPanelSummaryActiveDoc` decides it:

```
published = focusPanelSummaryUsesPublishedDoc(grain, context) ? publishedDoc : null
return published ?? focusPanelSummaryDefaultDocForGrain(grain, context)
```

`focusPanelSummaryUsesPublishedDoc` → `opportunity` always; `child` **iff `context.familySettlement === true`**.

So the answer to the §1 multiple choice is **C — merged**: the published doc when the subject speaks
for the family, the code-owned composition otherwise. Not B, and not a cache.

## Why the hypothesis is FALSE

`billing_preview` is present, authored **`visibility: "visible"`**, in BOTH candidate sources:

| source | line | authored as |
|---|---|---|
| `FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION` | 101 | `tier: context`, visible, 6/12 |
| `FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION` | 321 | `tier: context`, visible, **4/12 beside Financials 8/12** |
| published doc v160 | — | visible |

Whichever document the panel composes from, the card is in it. A published placement is therefore
**not** unable to introduce a card, and v159/v160 were not fighting a code-owned grid.

The child-**without**-family composition contains exactly one card (`children`), and the mounted
panel shows six — so this subject is resolving through the **with-family** path, where the card is
authored beside Financials by design ("Billing Preview as its real 4/12 companion").

## Also disproven this run

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Missing runtime producer | **FALSE** (already retired) | `CARD_CAPABILITY_PROVIDERS` holds only `milestones` |
| Grid comes from the code default, so publishing cannot add a card | **FALSE** | card is in the code default too, as visible |
| Stale layout cache in the running server | **FALSE** | fresh qualified build + fresh server + v160 → still absent |
| Authored `linked` visibility (my v159 error) | **REAL but not sufficient** | corrected in v160; card still absent |
| Grain admission | **UNLIKELY** | `["opportunity","child"]` declared and shipped in `d3586bb12` |
| Component mapping | **FALSE** | `FocusPanelCardRenderer` handles `model.key === "billing_preview"` |

## Where it disappears — still unlocated

Mounted card keys under the qualified runtime, unchanged across every attempt:

`business_process · financials · children · household · attendance · health_safety`

That is the with-family composition **minus `billing_preview`**. The card is in the composition and
handled by the renderer, so it is dropped in the **admission step between the two** — the stage that
turns a composition entry into an admitted card model. `FOCUS_PANEL_CODE_OWNED_COMPOSITION_CARD_KEYS`
and `focusPanelCardParticipatesInACodeOwnedComposition` are exported and have **no consumers**, which
is itself worth understanding.

**Next trace step:** instrument the admitted-card-key list between
`deriveFocusPanelSummaryCompositionInputs` and `FocusPanelCardRenderer` and find the first stage
where `billing_preview` is present on one side and absent on the other. Do not attempt another
repair before that single measurement.
