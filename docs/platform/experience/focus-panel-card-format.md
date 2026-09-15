---
owner: platform
status: active
last_reviewed: 2026-09-15
---

# Focus Panel card format — the frozen contract

> What a Focus Panel card row looks like, what the Process Card's command region contains, and why
> each rule exists. Frozen because each one has already been lost once.

## 1 · Row rhythm — cards sharing a row share a height

The Focus Panel grid is configured in **/surfaces**. The rendered panel must match that
configuration's shape, which means:

| configured row | rendered result |
| --- | --- |
| two cards | 50/50 width, **equal height** |
| two cards stacked left, one right | the stack (plus its gap) equals the tall card's height |
| any row | every cell stretches to the row band; no card sizes to its own content |

Implemented by three rules in `app/adminV2/components/alloyOsRuntime.css`, declared **once, for
every mode**:

```css
.alloy-os-focus-panel-grid { align-items: stretch; }
.alloy-os-focus-panel-grid .alloy-os-focus-panel-grid__cell { display: flex; }
.alloy-os-focus-panel-grid .alloy-os-focus-panel-grid__cell > * { width: 100%; }
```

### How this was lost, twice over

It failed from **both ends at once**, which is why it looked like nothing had changed:

1. Work mode was excluded — `:not(.alloy-os-focus-panel-grid--work)` on all three rules, reasoning
   that work mode "evolves on its own cadence".
2. A later block re-declared `align-items: start` on the grid **and on every cell**, under the
   heading *"Override the equal-height row rhythm: natural heights, not stretched cells."* Being
   later in the cascade, it won.

So the modes that had the rhythm had it revoked, and the one mode that might have escaped the
override had been carved out of the rhythm to begin with. **No mode aligned.** The visible symptom
was Enrollment and Financials — a plain two-card row — at visibly different heights.

**Rule: height alignment is never mode-scoped and never overridden later.** A mode that needs
different gutters or borders may have them; it may not opt out of the row rhythm.

Guarded by `tests/surfaces/focusPanelRowRhythm.test.ts`, which asserts the rules are unconditional
and that no excluded selector declares `align-items`. Geometry itself is proven in the browser
against the deployed surface — jsdom computes no layout, so an equal-height assertion there would
pass against any CSS at all.

## 2 · Process Card command region

```
┌────────────────────────────────────────────────────────────────────┐
│ ENROLLMENT                                          [stage band]   │
├────────────────────────────────────────────────────────────────────┤
│ Lead                                    [ Cmd ][ Cmd ][ Cmd ][Cmd] │
│ Lead · Reach the family, understand …    ← one row, equal columns  │
│ Record outcome            ← link, under the stage's own lines      │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 The stage names itself

`Lead`, not `Case · Lead`. The panel is already scoped to the grain; prefixing every card with it
spends a line on something no operator asked.

### 2.2 One row, equal columns

```css
display: grid;
grid-auto-flow: column;
grid-auto-columns: minmax(0, 1fr);
```

Every command is the **same width** regardless of label length, and the filled primary is sized with
the outline commands rather than sizing itself.

This is the third attempt at this row, and the first two are why the rule is written this way:

- **`nowrap` + `overflow-x: auto`** clipped. Measured on a deployed Waitlist card: `scrollWidth 409`
  against `clientWidth 300` — the whole of "Send form" outside the visible box, with a hidden
  scrollbar and so no signal it existed. Six of six sampled cards were clipped.
- **`flex-wrap: wrap`** kept every command reachable but produced the stagger: three commands on one
  line, two on the next, each a different width.

Equal columns give one row without bringing the clipping back. When the set is wide, labels
**ellipsize inside their own column** — a visible truncation the operator can see and hover, not a
hidden region behind a gesture nobody is prompted to make. That is the whole difference from the
rule this replaces: the failure mode is legible instead of silent.

### 2.3 Resolving the work is a link, not a button

`record_outcome` sits under the stage's lines as a link. The other commands *start* something; this
one *closes* what those lines just described, so it reads as a consequence of them rather than a
peer competing for the same row. It is also what takes the row from five commands to four and makes
one row honest at this width.

**The card does not decide this.** `ProcessCard` is forbidden from filtering or re-ordering the
configured set — configuration decides the set and the order; the platform decides what can run. The
split happens in `adaptBusinessProcessEvidenceToProcessCard`, which hands the card two slots:
`actions` and `outcomeAction`. Matched on `key`, never on label, because configuration may rename
"Record outcome".

The link keeps `data-process-action`, so command identity and every certification selector are
unchanged by the move out of the row.

Guarded by `tests/surfaces/processCardCommandRowAndOutcome.test.tsx`.

## 3 · What is static and what must be rendered

Consistent with `tests/adminV2/sourcePresenceIsNotRuntimeProof.test.tsx`:

| claim | proof |
| --- | --- |
| no hardcoded action key in the card | static |
| the rhythm rules are unconditional | static |
| a card renders, a section appears, a link is reachable | **render** |
| heights actually match | **browser geometry** |

A source guard proves the markup was typed. It cannot prove the operator sees it.
