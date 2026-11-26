---
title: Adjustment UX Convergence — the repair, measured mounted on deployed
program: Financials V1
slice: Adjustment UX Convergence
run: erun_7ca2204cd141d507
before_sha: f981b23ba9a7221ddb9999a6e88c4412624b6e22
after_sha: bd00bbf714561deef627161e8c0e3870f958e957
---

# THE REPAIR, MOUNTED

Same spec, same account, same card, same three viewports. Only the build differs.
Raw output: `BEFORE-deployed-measurement.txt` and `AFTER-deployed-measurement.txt`.
Screenshots: `stacking-{phone,tablet,desktop}.png` are the BEFORE state on `f981b23ba`;
`after-{phone,tablet,desktop}.png` are the same three viewports on `bd00bbf71`. The after-run
overwrote the before files in place — they are restored here from the commit that carried them, so
the names say what each one is.

## THE BAND, BEFORE AND AFTER

| property | before | after | Add → Charge body |
|---|---|---|---|
| `border-top-width` | 1px | **0px** | 0px |
| `border-top-left-radius` | 12px | **0px** | 0px |
| `background-color` | rgb(255,255,255) | **rgba(0,0,0,0)** | rgba(0,0,0,0) |
| `max-height` | 520px | **none** | none |
| `overflow-y` | auto | **visible** | visible |
| `z-index` | **61** | **auto** | auto |
| `position` | relative | **static** | static |
| painting above the host's own layer | the band | **NONE** | NONE |

The band is now identical, property for property, to the body Add Charge puts in the same host. That
is the shared contract applied, at all three widths.

`liftedAboveCommand` went from `[{ cls: "alloy-os-fdetail__movepanel", z: "61" }]` to `[]`. The host
is `z-index: 60`; nothing inside it is above it any more.

The screenshots show it without needing the numbers: before, a visibly bordered inner card runs from
"Add adjustment" down to the buttons inside the outer command card; after, the content sits directly
on the command card.

## A CORRECTION TO THE BEFORE-RECORD'S CAUSAL CLAIM

`CERTIFICATION.md` says the Adjustment card "stops 125–165px short of the room the host gave it,
**because** the band caps itself at 520px and scrolls inside a container that is already scrolling."

**The measurement does not support that `because`, and the after-run is what exposed it.**

| viewport | host cap | Charge card | Adjustment card before | after |
|---|---|---|---|---|
| desktop | 711px | 694px | 569px | **547px** |
| tablet | 734px | 734px | 569px | **547px** |
| phone | 387px | 387px | 358px | **387px** |

With the 520px cap removed the card got **22px shorter**, not taller. It was never being clipped: the
band's content measured 458px before and 446px after — under the cap throughout. The height
difference against Add Charge is simply that Add Charge has more content to show (a 631–683px body
against this one's 446px), and the 22px is the band's own padding and bottom margin going away.

So the honest account of the defect is the other three facts, all of which were real and are all now
fixed:

1. **A bordered, opaque, 12px-radius card inside a 20px-radius card.** This is the one the Director
   saw and the screenshots show.
2. **`z-index: 61` inside a `z-index: 60` host** — a descendant painting over its own host's rounded
   edge. This is the protrusion, and it was present at every width.
3. **A second declared scroll container** — the band's own `max-height` + `overflow-y: auto` inside a
   body that already caps and scrolls. Latent at this account's content length rather than active,
   and it would have bound on a longer form or a shorter viewport. §20 forbids the nested pair
   whether or not it is currently overflowing.

I overstated the mechanism of the height difference. The diagnosis of what was wrong with the element
stands; the arithmetic I attached to it does not.

## THE OPERATOR-VISIBLE WIN I DID NOT PREDICT

At phone width (390×844), measured on the same account:

| control | before | after |
|---|---|---|
| `adjustment-direction` | **ABSENT from the DOM** | **present**, 186×32, in view, above the fold |
| `adjustment-category` | present | **ABSENT** |
| `adjustment-reason` | below the fold | **above the fold** |
| `adjustment-preview-button` | below the fold | **above the fold** |
| `adjustment-confirm` | below the fold | **above the fold** |
| `adjustment-cancel` | below the fold | **above the fold** |
| `adjustment-effective-date` | below the fold | below the fold |
| `horizontalOverflow` | false | false |

**Five controls sat below the browser fold before; one does now.** Preview, Confirm and Cancel — the
controls that complete the command — are reachable without scrolling at phone width. The band's own
CSS comment had named exactly this risk ("the confirm button fell below the fold of a surface that
does not look scrollable"), and the band's self-capping was part of what kept it true.

## THE BAND'S OWN TEXT, BEFORE AND AFTER

Before:

> Add adjustment · Against enrolment · **Against charge** · *Choose the charge this is about…* ·
> **Type** · *Credit — lowers what the family owes* · Amount · Reason · Effective date

After:

> Add adjustment · Against enrolment · **What this is about** · *The account as a whole — not one
> charge* · **What needs to change** · *Reduce what the family owes* · **Reduce by** · Reason ·
> Effective date

No storage taxonomy, no sign convention, and the account-level answer stated as a decision rather
than left blank.

## A SECOND CORRECTION — THE "UNNAMEABLE LAYER" CLAIM

The commit and the before-record say Add → Adjustment "was the only command in this card whose layer
was not observable in the DOM". **That is wrong.** The Add command already had an outer shell
carrying `data-financials-overlay="add_charge"` and `data-financials-entry-mode={entryMode}`, so the
mode *was* observable — the probe reads `outerEntryMode: "adjustment"` on the deployed build.

What is true is narrower: the outer shell is named `add_charge` in **both** modes, which is
inaccurate for an adjustment. The wrapper added by this slice renders
(`[data-financials-overlay="add_adjustment"]` count = 1 on deployed) and gives the Adjustment layer a
correctly-named element of its own. It is useful; it was not necessary for observability, and the
justification written beside it overstates the problem.

The outer shell's `add_charge` label in adjustment mode is left as it is — renaming a shell both
modes share is a decision about the Add command's identity, not a stacking repair.

## RESPONSIVE QA, MOUNTED

- No horizontal overflow at any of the three widths, before or after.
- No emoji in the band; the effective date uses the canonical Alloy date control and no
  `input[type=date]` survives in the card.
- Preview / Confirm / Cancel are light-on-white — no navy or black primary.
- One scroll container inside the command, not two.
- No clipped underlying card protruding into the command surface.
