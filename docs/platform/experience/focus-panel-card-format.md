---
owner: platform
status: frozen
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

## 4 · Assigned height — the published composition owns card geometry

> Added once implemented. This replaces the earlier note that equal-height rhythm was
> unresolved on the composed canvas.

**Cards own their content. The published Focus Panel composition owns their geometry.**

### 4.1 Two heights, kept apart

| | |
| --- | --- |
| **intrinsic** | what the card's content needs · measured · owned by the card |
| **assigned** | what the authored bands give it · solved · owned by the composition |

`lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights.ts` is pure and receives only
measurements, so it has no way to read its own output.

### 4.2 Why CSS could not do this

The composed canvas positions every area **`position: absolute`** with JS-computed
`left`/`width`/`top`. `align-items` is inert on absolutely positioned children — tested live by
injecting `stretch` on both the canvas and the area, which changed nothing.

### 4.3 `rowStart` is a placement coordinate, not a visual row

**This is the rule that was got wrong, shipped, and measured wrong on the live panel.**

Column-aware placement advances each column independently, so two cards an operator composed side
by side are routinely published with *different* `rowStart` values. The live Firefly Work Unit
panel publishes exactly that:

| card | colStart | colSpan | rowStart | rowSpan |
| --- | --- | --- | --- | --- |
| `business_process` | 1 | 8 | **1** | 2 |
| `financials` | 9 | 4 | **2** | 2 |

They are drawn side by side — each starts at the top of its own column — and an engine that
equalises on `rowStart === rowStart` sees two unrelated cards. Measured on staging-equivalent
build: **325px beside 299px**, with every same-`rowStart` test in the suite green.

So:

> **Equal-height rhythm follows authored VISUAL BANDS, not literal `rowStart` equality.**
> `rowStart` is a placement coordinate under column-aware composition. It is not by itself a
> visual row identity.

### 4.4 What a band is

`focusPanelVisualBands.ts` merges the authored row extents `[rowStart, rowStart + rowSpan)`. Each
merged interval is one band — `[1,3)` and `[2,4)` overlap, so `business_process` and `financials`
are one band, which is the relationship the builder drew and the coordinate alone lost.

Within a band, cards sharing a column form a **chain** and stack on each other. The band is as tall
as its tallest chain; every shorter chain is stretched to match, its shortfall split equally across
its cards. A single-card chain simply takes the band's height.

```
┌──────────────┬──────────────┐   A + gap + B is one chain
│      A       │              │   C is another
├──────────────┤      C       │   band height = max(A+gap+B, C)
│      B       │              │   so top(C) == top(A), bottom(C) == bottom(B)
└──────────────┴──────────────┘
```

Band identity and chain identity both come from the **published composition** — never from a
rendered rectangle or DOM order. `deriveVisualBands` and `columnChains` are built on
`packOrder` and `columnsOverlap`, the placement engine's own primitives, so the builder preview
and the Work Unit runtime cannot disagree about where a band begins. One composition, one
interpretation, both surfaces.

A band holding any **unmeasured** card is left entirely alone. An assignment derived from a height
nobody has measured is a guess, and a guess here is a rectangle on screen.

`rowSpan` is still **not** a height floor: it says which rows a card occupies, and therefore which
band it joins. How tall the band is comes from measured content alone, so a band whose cards shrink
shrinks with them.

### 4.5 What this does not restore

`resolveColumnAwareLayout` abandoned global CSS-grid rows for a measured reason: Household ended
at y=1448 and Health, directly beneath it, began at y=1716 — 268px owned by rows occupied only in
the opposite columns. **Bands do not bring that back.** A band never spans rows no card occupies,
and cards in different bands are never equalised, so cards in unrelated columns stay as independent
as the column-aware model made them.

### 4.6 Intrinsic child vs assigned wrapper

**The element the layout stretches can never be the element the layout measures.**

```
AREA WRAPPER                  position: absolute
  .alloy-os-fp-grid-area      top/left/width = placement, height = assigned band height
        │
        ▼
  INTRINSIC NODE              min-height: 100%  — fills the band, can exceed it
  .alloy-os-fp-card-intrinsic measured, and watched by both observers
        │
        ▼
  CARD                        flex: 1 1 auto — takes the room, so the chrome is the band's height
```

The intrinsic node is rendered by `FocusPanelCardGrid`, one per authored area, so it outlives every
subtree a card swaps in when its data arrives — which is what the earlier move to the wrapper was
protecting, kept without the wrapper's dishonesty.

This canvas has now shipped the feedback failure **in both directions**, and the rules exist
because of each:

| shipped | mechanism | symptom |
| --- | --- | --- |
| wrapper carried `min-height`, measurement read the wrapper | the measurement returned its own output | *"a card could only ever grow"* — a Children roster shrinking 17 → 2 kept the whitespace |
| PR #989 pinned the wrapper with `height` and measured it | a fixed box cannot report that its content no longer fits | late-arriving card content **overflowed and the row beneath was drawn straight across it** |

Four rules keep both closed:

1. the measurement reads the **intrinsic node** with the wrapper's height neutralized
   (`wrapper.style.height = "auto"`) and restored in the same synchronous block — layout is forced,
   nothing is painted between, so the value is intrinsic and nothing flickers;
2. the intrinsic node's fill is `min-height: 100%`, a **floor, not a ceiling** — content that
   outgrows its band pushes through and the `ResizeObserver` sees it. That is the overlap fix;
3. a `MutationObserver` on the intrinsic node's subtree catches the half a `ResizeObserver` cannot
   see — content shrinking *below* the floor changes no box and fires no resize. It watches
   `childList`/`subtree`/`characterData` and **never `attributes`**, because the only thing the
   engine writes is inline style on the wrapper, outside that subtree, so the measurement cannot
   re-trigger itself. Reads are coalesced to one per frame;
4. the solver is pure — re-solving with its own output as input returns the same answer.

All four are asserted. Rules 1–3 each close a different half; any one of them alone reopens a loop.

### 4.7 Certification

| claim | proof |
| --- | --- |
| solver constraints, spans, convergence | unit — `focusPanelRowHeightSolver.test.ts` |
| assignment applied, measurement neutralized | source contract — `focusPanelExpandedSurfaceGeometry.test.tsx` |
| **cards actually align on screen** | **browser geometry, ≤1px** |

Geometry is authoritative. jsdom computes no layout, so an equal-height assertion there would pass
against any implementation at all.
