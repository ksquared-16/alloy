# W7 slice 1, measured on the deployed build

Deployed SHA `980436d228cefe1bb29b76d51054ccb8e3c4cfbf`, read from `/api/build-info` on
staging.workwithalloy.com inside the same browser session that took every reading below.

Both probes are READ-ONLY. The responsibility one presses the *review* stage, which runs the command
in preview mode and writes nothing; it never reaches a commit stage. Nothing was posted, no
arrangement was written, and no money moved.

## F003D — the staged primary control (`zz-11g-w7-slice1-smoke.spec.ts`)

```
STAGED {"primaryPresent":true,"stage":"review","label":"Review this change","disabled":false,
        "hint":"Nothing is saved yet. This shows what the change would do, and Confirm then applies it.",
        "blocker":null,"stageControls":1,"shareRows":1,"addable":0}

AFTER_REVIEW {"stage":"commit","label":"Confirm — apply this change","previewShown":true,
              "hint":"This applies the change shown above. Nothing else is altered."}
```

This is the exact inverse of the pre-repair reading, which was `confirmDisabled: true`,
`reconciliationMessage: null`, `anyVisibleRequirement: false` — a dead primary with no stated
requirement anywhere on screen.

* `stageControls: 1` — the Preview/Confirm pair is gone; there is one control.
* `disabled: false` on open, with a hint saying what it will do before it is pressed.
* One press moves it to `commit`, relabels it, and renders the preview being committed.

`shareRows: 1, addable: 0` on this account: it has one responsible party and no other eligible
candidate, so F003A's additive affordance has nothing to offer here. That is the account, not the
repair — the mounted test covers the three-candidate case.

## F001 — the band and the awaiting reasons (`zz-11h-w7-awaiting-smoke.spec.ts`)

```
BAND      CHARGES · Needs a person 35 · Posts on a date 0 · Households 2
AWAITING  {"queueRows":35,"reasonElements":35,"byReason":{"unclassified":35},
           "tabLabels":["Awaiting posting35","Posted102"]}
DETAIL    {"awaitingKey":"unclassified",
           "awaitingSentence":"Why this draft is waiting was never recorded — it predates automatic
                               posting. Review the amount, then post it if it is right."}
```

* The band no longer shows one count of drafts. **Every one of the 35 rows carries a reason**
  (`reasonElements` equals `queueRows`), and the detail panel says the same thing in a sentence.
* All 35 classify as `unclassified`, which is the correct and honest answer: the deployed census
  confirms none of them carries a `post_gate` and none is bound to a canonical billing period. They
  are named as unrecorded rather than given an invented reason.
* `Posts on a date 0` is also correct — nothing future-dated exists on the estate yet. The
  Director's `future_period_charge` scenario creates the first one.

## What these probes did NOT reach

**The identity line.** `identityGap` and `origin` were both null on the draft opened, because these
template-raised drafts carry `created_by = null`. An automatic charge has no actor to name, so there
is no gap to state — that is the designed behaviour, not an absence of the repair. The unmet-identity
sentence needs a charge a *person* created, which is what the Director's walkthrough produces.

**A future-period draft.** None exists yet, so the gate's visible behaviour and the activation
handler's effect are certified by unit tests and by the schedule's registration on the primary, not
by a deployed reading. Scenario `future_period_charge` is what produces the first one.

## Two probe errors worth recording, because both would have read as product defects

1. The first version dispatched a DOM event to open the Financials workspace. `openWorkspaceModal`
   is a module-level store with a subscription — nothing a page script dispatches reaches it. It
   recorded `NOT_REACHED` for a surface that opens perfectly well from its own sidebar control.
2. The second version read an absent band and concluded the workspace had not opened, when
   `financials-workspace-shell` and `financials-overview` were both mounted: the workspace opens on
   **Overview**, and the band and the queue live on the **Charges** section. The section tab has to
   be selected.

Both are the same class of error as the `AlloyDateInput` wrapper probe from the previous slice:
a measurement that reads the wrong element reports a null and looks exactly like a missing feature.
