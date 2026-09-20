---
owner: platform
status: frozen
last_reviewed: 2026-09-15
---

# Focus Panel card format — the frozen contract

> What a Focus Panel card row looks like, what the Process Card's command region contains, and why
> each rule exists. Frozen because each one has already been lost once.

## 1 · Row rhythm — cards sharing a row share a height

> **SUPERSEDED by [§6](#6--intrinsic-height-column-flow--the-equal-band-contract-retired).** Cards
> sharing a row no longer share a height. This section is kept because the rules it records about
> the grid coming from **/surfaces** still hold, and because the reasoning that led to equal-height
> rhythm is worth reading beside the measurement that retired it.

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
│ Lead · Reach the family, understand …                              │
│ Record outcome            ← link, under the stage's own lines      │
│ [ Contact Family ][ Tour ▾ ][ Move to Waitlist ]                   │
│ [ Add Child ]             ← one compact region; wraps as needed    │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 The stage names itself

`Lead`, not `Case · Lead`. The panel is already scoped to the grain; prefixing every card with it
spends a line on something no operator asked.

### 2.2 One compact command region — one row when it fits, clean wrapping when it does not

```css
display: flex;
flex-wrap: wrap;
gap: 6px;
/* and on each command */
flex: 0 0 auto;
width: auto;
```

**Commands must fit the card; the card must not be distorted to fit the commands.**

Consistency is **height, padding and treatment** — 1.9rem, `0 10px`, inherited from the platform's
own `.alloy-os-currentwork__helpful-action` so Process cannot drift from What's Next. Consistency is
**not identical width**: equal widths force truncation, and they waste the room a short label would
otherwise return to a long one, causing wraps that were never necessary.

At wider authored widths the set fits one line. At the narrowest supported width it takes the
minimum number of clean rows. Nothing is hidden, nothing is truncated, nothing scrolls sideways.

This is the fourth rule to stand here, and each of the first three was correct at the width it was
designed against:

| rule | failed |
| --- | --- |
| `nowrap` + `overflow-x: auto` | clipped — deployed Waitlist card measured `scrollWidth 409` vs `clientWidth 300`, the whole of "Send form" outside the box behind a hidden scrollbar. Six of six sampled cards clipped. |
| `flex-wrap: wrap`, content-sized | every command reachable, but lines of differing width — read as assembled rather than designed |
| one row of equal columns | consistent, and at the authored Business Process width it **ellipsized labels mid-word**. Legible clipping is still clipping. |

The third is the one this replaces, and the reason it had to go is that equal columns *cause* the
truncation they were meant to make legible: four commands take a quarter of the track each whether
or not their labels fit. Measured at 340px with that rule, all five of the longer configured set
read `clipped=true`.

Wrapping is not the stagger objection returning — that objection was overruled by product, because
a second line costs nothing an operator loses, and a truncated label does.

**Certified by rectangle, not by rule.** `web/playwright/geometry/processCommandRegion.spec.ts`
measures the real `ActionRow` / `Action` inside `.alloy-os-process__work-actions` at **300 / 340 /
420 / 560 / 700px** — 300 being the `minmax(300px, …)` floor the Process work band gives this
column — and asserts at each width:

- `scrollWidth <= clientWidth`
- every command rectangle inside the region bounds
- no command clipped by its own box (`scrollWidth > clientWidth` on the control)
- configured order preserved, reading across each row then down
- one distinct height across the set, **more than one distinct width**
- no two commands on a line overlapping

Restoring the equal-column rule fails **11 of 15** of those.

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

> **PARTLY SUPERSEDED by [§6](#6--intrinsic-height-column-flow--the-equal-band-contract-retired).**
> The composition no longer assigns a card a height at all: §4.3–§4.5 (bands, chains, the band
> solver) are retired and their modules deleted. What survives, and is now load-bearing, is
> §4.6 — the intrinsic node kept separate from the assigned wrapper, and the four rules that keep
> the measurement honest.

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

| claim | automated owner |
| --- | --- |
| band derivation, chains, solver constraints, convergence | `web/tests/surfaces/focusPanelRowHeightSolver.test.ts` |
| assignment applied, measurement neutralized, one planner | `web/tests/surfaces/focusPanelExpandedSurfaceGeometry.test.tsx` |
| **cards actually align on screen, ≤1px** | **`web/playwright/geometry/focusPanelGeometry.spec.ts`** |

**Browser geometry certification** — required, and owned by:

| | |
| --- | --- |
| spec | `web/playwright/geometry/focusPanelGeometry.spec.ts` |
| fixture | `web/playwright/geometry/focusPanelGeometryFixture.tsx` — mounts the **real** `FocusPanelCardGrid` |
| config | `web/playwright.geometry.config.ts` |
| command | `npm run test:focus-panel-geometry` |
| required check | `Surfaces / Focus Panel certification` → *Certify Focus Panel browser geometry* |

Geometry is authoritative and is now measured, not argued. Vitest runs in `environment: "node"`,
which computes no layout, so an equal-height assertion there passes against any implementation at
all — and twice it did, for [§4.3](#43-rowstart-is-a-placement-coordinate-not-a-visual-row) and
[§4.6](#46-intrinsic-child-vs-assigned-wrapper) respectively. Both reached staging.

The browser layer **adds to** the suites above rather than replacing them; each owns a layer the
others cannot see. It depends on no server, tenant, network or sleep: the fixture is bundled with
esbuild and served through `setContent`, and it waits on three consecutive animation frames of
unchanged geometry — a measured settle, which doubles as the loop guard.

Its binding is proven by planting each shipped defect and watching it fail:

| planted defect | result |
| --- | --- |
| bands grouped by literal `rowStart` equality | scenario A fails at 1180 / 1440 / 1680, and B with it |
| measurement reads the assigned wrapper (PR #989) | 5 of 16 fail, including the shrink case |

A scenario asserting that cards in **different** bands stay independent sits alongside them, so an
implementation that simply equalised everything fails too. Between them, neither wrong
implementation this work shipped can pass.

---

## 5 · Internal vertical rhythm — what a card does with the height it is given

§4 ends at *"the painted card is the band's height"*. That is the outer half. This section owns the
inner half, and it is a **frozen contract**:

> **OUTER COMPOSITION OWNS ASSIGNED HEIGHT.**
> **CARD CONTENT OWNS NATURAL MINIMUM HEIGHT.**
> **SURPLUS HEIGHT IS DISTRIBUTED BETWEEN SEMANTIC REGIONS.**
> **CARD-LEVEL FOOTERS MAY ANCHOR TO THE BOTTOM.**
> **INLINE ACTIONS REMAIN WITH THE CONTENT THEY ACT ON.**
> **TEXT AND CONTROLS DO NOT STRETCH.**
> **ASSIGNED HEIGHT MUST NOT CONTAMINATE INTRINSIC MEASUREMENT.**

Cards sharing a band have very different intrinsic heights, and that is legitimate: Financials
Compact carries more summary content than a Process card whose stage has no configured work. The
answer is never to invent Process content or densify Financials. It is to let the shorter card
spend its surplus deliberately.

### 5.1 The defect, measured

Two separate faults produced one symptom — *a short card floating at the top of a tall box*.

**Fault 1 — the band did not reach the card at all.** §4.6's propagation rule was written as
`.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell > .alloy-os-process`, on a premise
stated in its own comment: *"For every other card that child IS the painted `article.alloy-os-ucard`"*.
That premise was false when written. Measured on deployed `dced5ba79` at 1440:

| card | wrapper chain | band | painted card |
| --- | --- | --- | --- |
| `business_process` | `.alloy-os-process` *(flex column — the card this rule named)* | 234px | 234px |
| **`health_safety`** | `div.alloy-os-health` → `div.alloy-os-health` → `article` *(both **block**)* | **640px** | **141.8px** |
| `financials` | `div.alloy-os-financials` → `div.alloy-os-billing` → `article` *(both **block**)* | 131px | 130.9px |

A block container does not hand its height to its child, so Health & Safety lost **498.2px** into a
transparent wrapper. Financials has the same shape and never showed it, because its band happens to
be the height its content already needs — it was one composition away from the same defect.

**A rule naming one card can only ever fix one card.** The propagation is now stated over the
*chain* — `.alloy-os-fp-card-intrinsic *:has(.alloy-os-ucard)` — so any wrapper, at any depth, and
any card added later, passes the height on.

**Fault 2 — the card had nowhere to put the surplus.** `.alloy-os-ucard` was already
`flex-direction: column`, but nothing inside it grew, so free space collected *after the last
child*: the footer's `border-top` floated mid-card with white beneath it. `.alloy-os-ucard__body`
now grows, which puts the surplus between the body's content and the footer.

### 5.2 The shared primitive

One owner, no per-card rules:

| | |
| --- | --- |
| **height delivery** | `.alloy-os-fp-card-intrinsic *:has(.alloy-os-ucard)` — every ancestor of the painted card becomes a column and grows; the card grows with it |
| **surplus absorption** | `.alloy-os-ucard__body` — `display: flex; flex-direction: column; flex: 1 1 auto` |
| **body-resident footer** | `.alloy-os-ucard__body-footer` — `margin-top: auto` |

Normal flow only. **No** `position: absolute`, no spacer heights, no `min-height` floors, no
`height: 100%` anywhere in the chain — growth says *take the room the band already assigned*, while
a percentage would resolve against the assigned band and feed it back (§5.4).

Two footer spellings exist because Alloy has two, and both must anchor. Most cards pass
`footerAction` and get the real `<footer class="alloy-os-ucard__footer">`, which the body's growth
pushes to the bottom edge. Business Process carries its foot row *inside* the body, and the
`timeline` archetype hides the shell footer outright — those use `__body-footer`.

**Only card-level content may anchor.** Process command buttons stay in
`.alloy-os-process__work`, attached to the work they act on; `Record outcome` stays with its stage;
Attendance's `Check in` / `Mark absent` stay with the attendance state; Household member actions
stay on their member. Moving a control down to fill space makes the card lie about what it applies
to. Only *card-level* navigation and activity settle — Process's `Recent activity` foot row,
`View children →`, `View health details →`.

### 5.3 Card anatomy, as rendered

Audited on deployed `dced5ba79`. `HEADER` is the shell's own and is omitted.

| card | archetype | primary | supporting / actions | semantic footer | anchors via |
| --- | --- | --- | --- | --- | --- |
| Business Process | `action` | lifecycle rail, stage/current-work | `__work` commands, Record outcome | `__foot` — participants + Recent activity | `__body-footer` |
| Financials Compact | `status` | responsibility, balance, past-due | — | `__footer` — Payment / Add / Details | body growth |
| Attendance | `timeline` | attendance state | Check in / Mark absent *(stay with state)* | **none** — shell footer is `display: none` | *n/a* |
| Children | `collection` | child rows | — | `__footer` — `View children →` | body growth |
| Health & Safety | `status` | status / attention rows | — | `__footer` — `View health details →` | body growth |
| Household | `profile` | summary regions | member-level actions *(stay on the member)* | `__footer` — card-level nav | body growth |
| Current Work | *(see §2)* | current work | command rail | `Recent activity` context region — **identified, not yet anchored** | *(none)* |

Attendance has **no** card-level footer, so it anchors nothing — its surplus stays below its
content, which is correct. A card with nothing to anchor is not given something to anchor.

Current Work is audited but **not changed** in this slice. It passes `footerAction = null`, so it has
no shell footer, and its `Recent activity` region sits inside a wider context block alongside
`Also in progress` — anchoring part of that block is a composition decision, not a mechanical one.
It is also superseded by the Process card on the focused surface
([`process-card-supersedes-current-work`]), so the change could not be verified against a rendered
surface here. Identified as the footer candidate; left as debt rather than applied unmeasured.

Sparse states — `loading`, `empty`, `unavailable`, `forbidden`, `error` — keep the same anatomy and
are **not** vertically centred. Space existing is not a reason to move a message to the middle of a
card; an empty Health card and a populated one must read as the same card.

### 5.4 Intrinsic measurement is unaffected — and why that is structural

The danger this repair had to avoid is §4.6's loop in a third spelling: a card that consumes its
assigned height must not then *report* that height as its natural content height, or the solver
would assign it, the card would consume it, report it again, and the row would ratchet open.

It cannot, and that is a property of `flex-grow` rather than a hope. The measurement neutralizes
the wrapper's height (§4.6 rule 1), which leaves `.alloy-os-fp-card-intrinsic` content-sized — and
**a flex child cannot grow past a container that is itself content-sized**. Nothing in the chain
resolves a percentage against the assigned band, which is the spelling that *would* feed back.

The gate is the round trip: measure `X` with the wrapper neutralized, assign `Y > X`, confirm the
painted card really is `Y`, measure again, and get `X` back — then repeat at 320/480/640/900px and
confirm `X` never moves.

### 5.5 Certification

Extends the existing painted-surface gate rather than adding a harness.

| claim | owner |
| --- | --- |
| the chain rule exists, names no card, names no pixel, stays scoped to the solved grid | `web/tests/surfaces/focusPanelBandFillRuntimePath.test.ts` |
| sparse card anchors its footer; growth collapses the surplus; content is not stretched | `web/playwright/geometry/paintedSurface.spec.ts` |
| `X → assign Y → still X`, and no ratchet across four bands | *(same spec)* |

The jsdom suite's premise test is now the corrected one. Its previous version was titled *"Business
Process really does wrap its UniversalCard, **and is the only card that does**"* and asserted only
the first half — **a claim stated in a test name and never asserted is not a claim**, and that is
precisely the hole the 498px passed through.

Binding proven by planting each defect and watching the right gate fail:

| planted defect | result |
| --- | --- |
| `margin-top: auto` removed from `__body-footer` | 3 fail — sparse anchor, growth, no-stretch *(shell-footer cases correctly still pass — different mechanism)* |
| `__body-footer` forced `position: absolute; bottom: 0` | 2 fail — the `position: static` gate and no-stretch |
| assigned height applied to the intrinsic node instead of the wrapper | 4 fail — every `X → Y → X` gate and the ratchet test |

---

## 6 · Intrinsic-height column flow — the equal-band contract, retired

This supersedes [§1](#1--row-rhythm--cards-sharing-a-row-share-a-height) and the band half of
[§4](#4--assigned-height--the-published-composition-owns-card-geometry). It is a **material
doctrine change**, recorded rather than quietly folded in.

### 6.1 The previous contract, and why it is gone

> **PREVIOUS:** cards sharing a derived *visual band* were drawn to a common height. A shorter
> card stretched to its neighbour's height, and that stretch was the pass condition of the
> browser gate.

The reasoning was sound for the composition it was designed against — two cards, deliberately
paired, looking ragged when their bottoms disagreed. It does not survive a canvas where operators
compose arbitrary spans, because **"the row" is not something the operator authored.** Bands were
*derived* from overlapping `rowStart` extents, so cards that had nothing to do with each other
were made to agree on a bottom edge.

Measured on deployed `d0870c58c`, the real published composition, at 1440:

| card | columns | content needs | was drawn | manufactured |
| --- | --- | --- | --- | --- |
| `business_process` | 1–8 | 227px | 402px | **+175px** |
| `financials` | 9–12 | 402px | 402px | — |
| `children` | 1–8 | 534px | 534px | — |
| `household` | 9–12 | 419px | 419px | — |
| **`health_safety`** | **1–3** | **178px** | **419px** | **+241px** |
| `attendance` | 4–12 | 124px | 124px | — |

Health occupies **columns 1–3**. The 419px it was drawn at is Household's height, in **columns
9–12** — a card it shares no column with, whose content has no relationship to it. 410px of the
panel, 30% of its total height, was empty for no authored reason.

### 6.2 The new contract

> **HORIZONTAL PLACEMENT IS AUTHORED.**
> **VERTICAL HEIGHT IS INTRINSIC.**
> **VERTICAL POSITION IS COLUMN-AWARE FLOW.**
>
> **CARDS ONLY WAIT FOR CARDS WHOSE COLUMNS THEY OVERLAP.**
> **SIDE-BY-SIDE CARDS DO NOT NEED EQUAL BOTTOMS.**
> **AUTHORED ORDER OUTRANKS PACKING DENSITY.**

`colStart` and `colSpan` are exact and the runtime never touches them: the engine decides Y, never
X. A card whose columns are free begins immediately after the card above it *in its own columns* —
a skyline, constrained by the authored column grid.

### 6.3 What actually changed — one substitution, removed

The engine was never wrong. `resolveColumnAwareLayout` has always been a column-aware skyline over
measured heights; it was being **handed numbers that were not measurements**. `useColumnAwareStack`
ran `solveRowHeights` and substituted the equalised band height for each card's measured one
immediately before placing it.

Deleting that substitution is the whole behavioural change. With it went its two modules —
`focusPanelRowHeights.ts` and `focusPanelVisualBands.ts` — and the unit suite that certified them.
That suite was **green throughout**, testing a solver the runtime had every right to stop
consuming: the same certification hole this canvas has now hit at four layers, and the reason the
browser gate exists.

### 6.4 `rowStart` / `rowSpan`

No schema change, and none was needed — the migration had already happened:

| field | meaning |
| --- | --- |
| `rowStart` | **ordering** — the sequence a card takes within the columns it occupies (`packOrder`) |
| `rowSpan` | **authoring metadata** — it prescribes no height and reserves no space |

Published layouts keep rendering unchanged. Card height is runtime content truth and is never
persisted: no `masonryRow`, no `visualBandId`, no `runtimeHeight`, no `pixelHeight`.

### 6.5 What the change produced, on the real composition

Simulated with the real engine before implementation, then certified in a browser after:

| card | current top → proposed | current height → proposed |
| --- | --- | --- |
| `business_process` | 0 → 0 | 402 → **227** |
| `financials` | 0 → 0 | 402 → 402 |
| `children` | 412 → **237** | 534 → 534 |
| `household` | 412 → 412 | 419 → 419 |
| `health_safety` | 956 → **781** | 419 → **178** |
| `attendance` | 956 → **841** | 124 → 124 |

Total panel height **1375 → 965px** at 1440 (−410), 1391 → 1011 at 1180, 1183 → 957 at 1680.

Household does **not** rise: it spans 9–12 and must clear Financials, which it does by exactly one
gap. That is the model working, not a missed optimisation. One gap survives — columns 4–8 between
Children's bottom and Attendance's top — because Attendance spans 4–12 and must clear Household in
9–12. It is an unavoidable consequence of the authored spans, and closing it would mean moving a
card horizontally, which the runtime may not do.

### 6.6 What §5 still means

[§5](#5--internal-vertical-rhythm--what-a-card-does-with-the-height-it-is-given) is **kept, not
reverted.** The propagation chain still delivers the wrapper's height to the painted card — the
wrapper is now the card's own intrinsic height, so propagation is what makes *painted height ==
intrinsic height* true rather than merely intended. The measurement contract (neutralise the
wrapper, read the intrinsic node) matters more than before, because the number it reports is now
the number that gets drawn.

What §5 may no longer justify is manufactured surplus. A card with 220px of content is not
stretched to 350px because of a neighbour; the composition no longer creates that surplus at all.
Semantic footers still anchor small, legitimate surplus internal to a single card.

### 6.7 Certification

The equal-band assertions were **rewritten, not preserved** — `Process bottom == Financials bottom`
is precisely what was retired.

| invariant | owner |
| --- | --- |
| authored columns exact; painted height == intrinsic; no overlap among column-sharing cards; disjoint-column cards may overlap vertically; a card clears only its own columns; spanning cards clear all of theirs; growth and shrink reflow; authored order beats density; no horizontal overflow; deterministic cold reload | `web/playwright/geometry/focusPanelGeometry.spec.ts` |
| the equaliser stays deleted, and the stack keeps handing the engine measurements | `web/tests/surfaces/focusPanelBandFillRuntimePath.test.ts` |

Binding proven by planting each defect and watching the right fixtures fail:

| planted defect | result |
| --- | --- |
| every card takes the tallest height (global row max) | 18 fail — headline, regression fixture, three tracks, growth, shrink, loading→ready |
| a spanning card considers only its first column | 9 fail — D, F, the regression fixture, loading→ready |
| a card inherits the height of the card placed before it | 6 fail — three tracks, the regression fixture |
| placement is not recomputed when content changes | 7 fail — both dynamic fixtures |
| cards reordered for denser packing | 8+ fail — including the authored-order guard |

The reorder control is worth a note: planted in `useColumnAwareStack` it changed **nothing**,
because `resolveColumnAwareLayout` calls `packOrder` internally and re-sorts. A plant that stays
green is a no-op, not a passing test — the control only bound once planted inside `packOrder`, and
finding that is what revealed there was no authored-order assertion at all. One was added.
