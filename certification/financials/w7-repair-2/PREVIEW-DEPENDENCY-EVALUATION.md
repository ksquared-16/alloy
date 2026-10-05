# Does Preview need to be a separate mandatory click? — the evaluation the Director asked for

**Director's question (W7-F003D):** "Also evaluate whether Preview genuinely needs to be a mandatory
separate click versus whether Confirm itself could perform the preview/confirmation sequence
cleanly. Do not preserve an unnecessary workflow merely because it exists today."

**Answer: no, it does not. It is now one control in two stages.**

## What the two buttons actually were

Both called the SAME registry-owned command, differing only by a `mode` argument:

* `Preview` → `mode: "preview"`, which validates server-side and returns `{summary, changes}`,
  writing nothing.
* `Confirm` → `mode: "execute"`, guarded by `disabled={busy !== null || !preview || !reconciliation.ok}`.

So "Preview" was not a different capability. It was a precondition the operator had to satisfy by
finding and pressing an extra control — and because only the reconciliation half of that guard ever
produced a sentence (and that sentence is `null` whenever the split is valid), the common case was a
dead primary action with no stated requirement anywhere on screen. Measured on deployed before any
repair: `confirmDisabled: true`, `reconciliationMessage: null`, `anyVisibleRequirement: false`.

## What is genuinely required, and what was ceremony

**Required:** that the operator SEES the effect of a financial change before it is committed. This
is a responsibility arrangement — who owes what — and a split committed unseen is a real risk.

**Ceremony:** that they earn that sight by locating a secondary button. Nothing happened between the
two presses: no batch, no reviewer, no queue anyone worked. The second press was the same intent
restated — the same objection the Add Charge review boundary already settled, in the opposite
direction.

## What it is now

One primary control carrying a `stage`:

| stage | label | what it does |
|---|---|---|
| `review` | "Review this change" | runs the command in preview mode; writes nothing |
| `commit` | "Confirm — apply this change" | commits exactly what is displayed |

`stage` is `commit` only when a preview exists, and `execute` is reachable only from the commit
stage. An unpreviewed commit is therefore not *guarded against* — it is **unreachable**, which is a
stronger guarantee than the disabled button it replaces.

The dependency is no longer hidden: it is the button's own label, read before it is pressed, with a
sentence underneath saying which half of the sequence is about to happen. The only remaining reason
the control is ever disabled is a split that cannot reconcile, and that reason is rendered beside it.

## A defect this found on the way

A preview describes ONE split, and the old flow never invalidated it. Press Preview, edit an amount,
press Confirm — and the panel committed a split nobody had reviewed while going on displaying the
old numbers. That is worse than displaying nothing: it is a confident statement about a change that
is no longer the one being made. Any edit to the shares or the effective date now clears the preview
and returns the control to its review stage.

## Selector continuity

The element carries `data-financials-responsibility-preview-btn` while it is the preview control and
`data-financials-responsibility-confirm` once it is the confirm control, so each certified selector
still names the thing that does that job. `data-financials-responsibility-stage` and
`-stage-hint` are new and say which stage is live.
