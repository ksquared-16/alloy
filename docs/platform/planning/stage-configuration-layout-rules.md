# Stage Configuration Layout Rules

The layout system every Business Process stage editor follows. Written after the Premium Process
Configuration UX sprint, which found the stage editor had been built **outside** the design system
this repository already had.

---

## The finding that shaped the sprint

Before any layout change, the editors were measured:

| | Measured |
|---|---|
| Distinct font sizes in the stage editor | **9** — `text-[8px]`, `[9px]`, `[10px]`, `[10.5px]`, `[11px]`, `[12px]`, `text-xs`, `[13px]`, `text-sm` across 269 usages |
| Radius families at the same nesting depth | **4** — `rounded`, `rounded-md`, `rounded-lg`, `rounded-xl`, used interchangeably |
| Uses of the existing `config-typo-*` scale | **0** |

`web/app/adminV2/settings/configurationRuntime.css` has defined a complete typographic scale since
Configuration Runtime V1. The stage editor used none of it.

**So the rule is not "invent a design system". It is "use the one that exists."** Everything below
either reuses a `--cr-*` token or composes a class already in that file.

---

## 1. The type scale

Four steps. Nothing else appears in a stage editor.

| Step | Size | Use |
|---|---|---|
| `0.6875rem` | 11px | field labels, hints, meta, counts, tags |
| `0.75rem` | 12px | section summaries, secondary rows, checkbox labels |
| `0.8125rem` | 13px | controls, section titles, work item names |
| `config-typo-workspace-title` | 19px | the workspace heading — owned by the shell |

If a new size feels necessary, the layout is wrong, not the scale.

## 2. The grid

```
.stage-grid .stage-grid--2 | --3 | --4      one row, N equal columns at ≥60rem
.stage-field                                label above control
.stage-field--wide                          spans two columns
.stage-field__label                         the ONLY label treatment
.stage-field__hint                          the ONLY hint treatment
.stage-control                              the ONLY control — input, select, textarea
```

**Every** labelled control sits in a `.stage-field` inside a `.stage-grid`. No control is
positioned independently. `.stage-control` fixes one height (`2rem`) across input/select/textarea,
which was the single largest source of the "uneven density" the audit recorded.

`.stage-field--wide` is defined at the **same breakpoint** as `.stage-grid--*`. Do not pair a
Tailwind `lg:col-span-2` (64rem) with a 60rem grid — between those widths the span and the column
count disagree and the row breaks.

## 3. Panels and headings

```
.stage-panel  .stage-panel__header  .stage-panel__body      one card, one header, one body
.stage-section-label                                        the ONLY sub-section heading
.stage-count                                                a count beside a heading
.stage-tag  .stage-tag--accent                              two tones, replacing five pills
```

Radii: `rounded-md` for controls, `rounded-lg` for panels. Two, not four.

## 4. Exit paths read as paths

```
.stage-exit  .stage-exit__headline  .stage-exit__name  .stage-exit__trigger  .stage-exit__body
```

An exit renders its sentence **above** its controls:

```
Continue to Tour → Tour   [Automatic]   Triggered by Tour Scheduled, tour booking scheduled (automatic)
────────────────────────────────────────────────────────────────────────────────────────────────────
WHAT OPERATORS CALL IT        MOVES TO        RECORD STATUS
[ Continue to Tour        ]   [ Tour    ▾ ]   [ Open      ▾ ]
```

The trigger line is **derived** from `summarizeStageOperatingPlan().exitPaths` — the same module the
Overview and the work items read. A path cannot describe a trigger the configuration does not have.

## 5. Progressive disclosure

**A collapsed section states what it contains.** A bare title is not disclosure — the operator has
to open it to learn whether it holds anything.

```
Operator work     1 work item · 2 way outs · 4 attention rules      ✓ Configured   ›
Requirements      56 required fields                                ✓ Configured   ›
Stage identity    Not described                                       Optional     ›
Stage Context     One row per family                                ✓ Configured   ›
```

Summaries derive from the same bootstrap the editors write. Counts render as `.stage-count` beside
the heading, never as `(2)` inside the text — assertions should test the number, not the
punctuation.

## 6. Reading order

```
Overview → Operator work → Ways out → Attention → Requirements → Identity → Context → Publish
```

**Operator work opens by default; everything else starts collapsed.** A director arrives asking
"what do my staff do here?" — that answer must not begin behind a click.

Identity and Context describe how the stage is *stored* and are set once at creation. They follow
the work rather than preceding it.

**Attention stays inside Operator work.** It is part of the operating-plan draft; making it a
sibling section would lift state ownership for the sake of layout. Render together what is asked
together; persist where the model says it belongs.

## 7. Allocation

- **Navigation yields to work.** The process rail collapses to a strip once a process is selected.
  It held two cards and ~550px of nothing while the editor beside it truncated its own dropdowns.
- **No `min-height` on a region that may be empty.** A reserved empty area is the "giant empty
  editing region" complaint, verbatim.
- **A one-item picker is not a choice.** With a single work item, render the work item — not a
  column of chrome around one row.
- **Never open onto an empty pane.** The work list auto-selects its primary item. "Select a work
  item…" wastes the first screen of the surface the operator came for.

## 8. Copy

Remove, in this order:

1. **Paragraphs that restate the heading beneath them.** "Helpful Actions support this work" under
   a "Helpful Actions" heading.
2. **Explanations the page now shows.** Two sentences about how transitions are owned, when "Ways
   out" names every path and its triggers.
3. **The same concept announced twice.** "Available Outcomes" + description + "Outcome Definitions"
   + description was four lines for one idea. One heading, one description.
4. **Schema words in operator surfaces.** "creates follow-up work due in 1 day" → "Follow up
   tomorrow". `when_attempt_count_lt: 3` → "retrying until 3 attempts — then escalate".

**But do not rename the product's own vocabulary to seem friendlier.** "Outcomes" is what the
Overview counts, the summary module names, and the certified Lead model is written in. Three unit
tests pin that word and they are right to. Two words for one concept is noise, not polish.

## 9. Presentation vs persistence

The rule from the work-item slice, unchanged and load-bearing here:

> **Render together what is asked together; persist where the model says it belongs.**

Nothing in this sprint moved a field, changed a write path, or altered a draft/publication
boundary. When a panel needs data another object owns, it renders a **lens** (filter the array,
splice edits back) or a **derived read-only view** (state the fact, name where it is configured).
Never a copy.

---

## Applying this to a new stage

Nothing here is Lead-specific. `stageOperatingPlanSummary.ts`, `StageOperatingPlanOverview.tsx` and
the `.stage-*` classes take a `StageOperatingPlanV1` and render whatever is configured, and the
Overview is mounted in `StageEditorV2`, which every stage uses.

A stage with less configuration **looks lighter, not different** — verified across Lead, Tour and
Placement / Decision, which share one layout at three configuration depths.

1. Author the operating plan through the draft model. No code.
2. Read the Overview. It says what the stage does, and says plainly when a stage has no ways out or
   no work items rather than rendering an empty frame.
3. Add stage-specific certification in the shape of L11–L16.

## Measuring a change

`certification/playwright/stage-ux-audit.cert.spec.ts` measures three **defined** states — landing,
all-collapsed, all-expanded — and writes `evidence/ux-audit/<phase>/metrics.json`.

Two lessons from building it:

- **Measure defined states, not "the page as it opens."** This sprint changes which sections default
  to open, so an as-it-opens comparison would flatter or damn either phase for the wrong reason.
- **Prefer metrics that do not move with content volume.** Distinct font sizes and radius families
  are honest across versions. Dead-space ratio, page height, control count and edge-adherence all
  shift when a page renders *more* — and this sprint made the work-item editor render without a
  selection step, so the after-page legitimately holds ~80% more controls. Both a whitespace ratio
  and a grid-adherence score were computed, found to be measuring that change rather than layout
  quality, and withdrawn rather than reported.
- **If a metric moves the wrong way, find out why before changing either the metric or the code.**
  Two of the three "regressions" in this sprint were harness bugs; the third was real and is
  reported as a change of subject, not a win.
