# Lead Stage Configuration UX — Gap Map

Audit of the stage editor as it stands against the certified Lead operating model.
Reference implementation target: **Lead only**.

---

## What the editor renders today

| # | Section | Contents |
|---|---|---|
| 1 | Stage Identity | name, purpose, description, allow-skipping |
| 2 | Stage Context | grain, subject resolution, membership |
| 3 | **Operational Experience** | the *entire* operating plan — purpose, journey, transitions, work items, actions, outcomes, attention — plus a dead "Recommended actions" panel and operator guidance |
| 4 | Operational Requirements | field requirements (one flat list) |
| 5 | Possible Outcomes | a **read-only** second rendering of the same outcomes |

---

## Gaps

### G1 — Outcomes are rendered twice, in two different sections *(high)*

Outcomes are editable inside §3 and displayed again read-only in §5. A director reading the page
sees the same concept in two places with different affordances and no statement of which is
authoritative. Related concepts, disconnected cards.

### G2 — "Recommended actions" is an empty panel that points elsewhere *(high)*

§3 contains a dashed box whose entire content is *"Process Actions supply the action catalog.
Configure … in the Operating Plan editor above."* It occupies a section heading and teaches
nothing. This is the clearest instance of schema-shaped UI: a slot exists, so a panel exists.

### G3 — Work Items are not the centre *(high)*

The approved model is Stage → Work Items → (purpose, completion, actions, outcomes, follow-up,
attention). Today Work Items are a list inside a collapsible inside §3, below stage purpose and
transitions. The thing operators actually do is the third-level noun on the page.

### G4 — Nothing communicates the operating model while collapsed *(high)*

Every section collapses to a bare title. Certification requires understanding the stage *without
expanding every section*; today collapsing the page removes all meaning. There is no Stage
Overview at all.

### G5 — Attention is not split between work and stage *(medium)*

All four attention rules sit in one flat list at the bottom of §3. `first_contact_overdue` and
`no_contact_attempt` are scoped to `contact_family` and belong **with** that Work Item;
`stage_age_7d` and `missing_required_fields` are stage-level. The persisted model already
distinguishes them by `template_key` — the UI does not.

### G6 — Requirements have no timing *(medium)*

§4 is a single "required fields" list. The certified model distinguishes five moments: record
creation, working the lead, running Schedule Tour, leaving Lead, entering Tour. Flattening them
invites exit requirements to read as creation blockers — the specific confusion the model warns
about.

### G7 — Transitions are configuration, not product language *(medium)*

Outgoing transitions render as rows with identity/source/destination fields. Nothing says *which
outcomes use this transition*, whether it is published, or what would break if it were removed.
"Lead → Tour" is the most important fact on the page and it reads like a database row.

### G8 — The Tour Scheduled automation is invisible *(medium)*

The certified model produces `Tour Scheduled` **automatically** from the `tour_booking.scheduled`
domain signal. The editor shows a `when_domain_signal` rule with no explanation, so a director
cannot tell that booking a tour moves the family by itself — and might reasonably conclude an
operator must record the outcome by hand, which is exactly the double step the model rejects.

### G9 — Publication state is present but not adjacent to findings *(low)*

The publication bar is truthful (certified). Validation findings appear in a list at the top of
the operating plan rather than beside the object they concern.

---

## What is already right, and must not regress

- The publication bar's five states are certified and correct.
- `LifecycleStageWorkTemplateActionsEditor` already composes **actions + outcomes together per
  work item** — the right shape. The problem is what surrounds it, not this editor.
- Attention rules already carry `template_key`, so the work/stage split is a *presentation*
  change with no persistence change. Nothing should move in the database for the layout's sake.
- Work-item completion policy and due policy already edit in place.

---

## Approach

Two additive pieces, no rewrite of the certified editors:

1. **A pure summary module** that reads the operating plan and produces operator-language
   sentences. Pure functions, unit-testable without a browser, and the single source both the
   overview and the work-item cards read from — so the UI cannot drift from the configuration it
   describes.
2. **Presentational components** that consume it: a Stage Overview, and a Work Item summary that
   stays meaningful while collapsed.

Deliberately *not* doing: moving persistence, re-parenting attention rules, or touching the
transition/outcome editors' write paths. G1/G2 are removals; the rest is presentation over
configuration that is already correct.

---

# Delivered — Lead reference implementation

Certified **15/15** (`lead-operating-model.cert.spec.ts`, L11–L13 are the UX scenarios).
Non-regression **35/35**; Schedule Tour still **8/8**.

## What the Stage Overview renders, verbatim from the browser

```
Reach the family, understand their needs, determine fit, and establish the next operational step.
1 WORK ITEM · 6 OUTCOMES · 2 WAYS OUT

Contact Family   [Primary] [Required] [Due in 1 day]
Reach the family, understand their needs, determine fit, and establish the next operational step.
4 actions · 6 outcomes · 2 attention rules
→ Tour Scheduled moves the family on — automatically

WAYS OUT
Continue to Tour   used by Tour Scheduled, tour booking scheduled (automatic)
Close as Lost  [Closes the record]   used by Closed Lost

STAGE-LEVEL ATTENTION
Lead stage age > 7 days
Missing stage-required information
```

Every one of the eight questions a director should be able to answer is on the page before
anything is expanded, and no transition identity appears (`lead_to_tour` is asserted absent).

## Gaps closed

| Gap | Resolution |
|---|---|
| G1 outcomes rendered twice | The read-only duplicate is gone; its place is taken by the Overview, which describes effects rather than repeating the editor |
| G2 dead "Recommended actions" panel | Removed |
| G4 nothing legible while collapsed | Stage Overview |
| G5 attention not split | Work-scoped attention counts on the work item; stage-scoped listed separately — presentation only, `template_key` already distinguished them |
| G7 transitions read as schema | "Continue to Tour … used by Tour Scheduled" |
| G8 Tour Scheduled automation invisible | "moves the family on — automatically", and the exit path names the signal |

Still open, deliberately deferred: **G3** (Work Items are summarised but their *editor* still sits
inside Operational Experience), **G6** (requirement timing), **G9** (findings beside the object).

## A real defect this work surfaced

`when_attempt_count_lt` / `_gte` are **rule-level** gates. The Lead configuration published in the
previous slice put them inside *targets*, where they are silently never read — the attempt policy
appeared configured and did nothing. The platform's own `upsertAttemptConditionalOutcomeRules`
builds **two rules** on one outcome for exactly this reason.

Corrected to `unable_to_reach_retry` (`when_attempt_count_lt: 3`) plus `unable_to_reach_escalate`
(`when_attempt_count_gte: 3`), and **L13 now asserts the gate is where the runtime reads it** —
rule-level > 0, target-level == 0. The earlier certification passed because it only asserted "does
not auto-close", which was true either way.

Building the UI is what found it: describing the attempt policy in operator language required
reading the gate, and the gate was not where the description needed it to be.

## The reusable pattern for Tour, Decision, Waitlist, Enrolling, Enrolled

Nothing in `stageOperatingPlanSummary.ts` or `StageOperatingPlanOverview.tsx` is Lead-specific —
both take a `StageOperatingPlanV1` and render whatever is configured. The Overview is already
mounted in `StageEditorV2`, which every stage uses, so **the other five stages get it for free**;
they will simply describe less until they are configured as fully as Lead.

To productize another stage:

1. Author its operating plan through the draft model (no code).
2. Read the Overview — it states what the stage does, and says plainly when a stage has no ways
   out or no work items rather than rendering an empty frame.
3. Add stage-specific certification scenarios in the shape of L11–L13.

The rule that makes this safe: **one summary module, read by every surface.** The page cannot
describe configuration it does not have, because the description is derived from the configuration
rather than written alongside it.

## Carried backend questions (not addressed here, by instruction)

1. **Family activity feed** — a tour booking writes no `activity_log` row against the opportunity;
   the audit lives in `workflow_events` keyed on the booking. Operators will look for it on the
   family. Recommend a follow-up that projects booking events onto the family feed.
2. **Tour availability defaults** — a fresh tenant has no `tour_availability_rules`, so Schedule
   Tour cannot succeed. The configuration UX should surface missing availability where Schedule
   Tour is referenced; not built in this slice.
3. **Off-grid slot messaging** — "slot is not available" does not say the time was off-grid.
   Recorded as a scheduling-copy follow-up.

---

# G3 closed — the Work Item is now the unit of editing

Certified **18/18** (`lead-operating-model.cert.spec.ts`, L14–L16). Schedule Tour still **8/8**;
non-regression **35/35**.

## What Contact Family now renders, verbatim

```
WHAT HAPPENS NEXT
Set on each outcome above. Shown here so the chain is visible in one place.
Left Message      → Follow up tomorrow
Awaiting Response → Follow up in 3 days
Unable to Reach   → Follow up in 2 days, retrying until 3 attempts — then escalate
Tour Scheduled    → moves the family on, automatically when the booking is made.

ATTENTION FOR THIS WORK
Raised when Contact Family needs someone to look at it. Stage-wide signals stay with the stage.
Contact Family overdue · No contact attempt recorded
```

And the stage section, collapsed, reads **"Stage-level attention (2)"** — the count alone carries
the split before anything is expanded.

## Presentation vs persistence — the decision, and the proof

Nothing moved. **L16 asserts it against the database**: four attention rules, one flat array, two
carrying `template_key: contact_family` and two carrying none.

- **Attention** is persisted as one stage-level array where each row *names* a work item. That is
  the correct normalization: a rule scoped to `contact_family` is a stage row referring to a work
  item, not a child of one. The work item renders a **filtered lens** over that array and splices
  edits back — rules it does not own are passed through untouched, and a rule created in the lens
  is stamped with the work item's key so the operator never picks a scope from a dropdown.
- **Follow-up** is persisted as `create_next_work` targets on outcome rules — outcome
  configuration, correctly. It is rendered here **read-only and derived**, because duplicating the
  control would create two places to change one thing. It states where it is configured.

The rule applied throughout: *render together what is asked together; persist where the model
says it belongs.*

## Operator before / after

| | Before | After |
|---|---|---|
| Configure Contact Family | purpose and timing in one panel; actions and outcomes in a second; follow-up buried inside individual outcome rules; attention in a fourth panel at the bottom of the page, listing all four rules with no indication which applied | one panel: purpose → completion → actions → outcomes → what happens next → attention for this work |
| Understand follow-up | open each outcome and read its targets | "Left Message → Follow up tomorrow" |
| Understand the attempt policy | read `when_attempt_count_lt` on a rule | "retrying until 3 attempts — then escalate" |
| Stage attention | 4 rules, mixed scope | 2 rules, stage-owned, with a sentence saying where the others went |

Still deferred, unchanged: **G6** (requirement timing) and **G9** (findings beside the object).
Requirements were left alone deliberately — the brief scopes timing to a later slice.

---

# Premium Process Configuration UX — the layout sprint

Semantics were already correct. This sprint changed only presentation. The reusable rules live in
[stage-configuration-layout-rules.md](stage-configuration-layout-rules.md); this section records
what was measured and what moved.

## The finding

The stage editor had been built **outside the design system this repository already had**.
`configurationRuntime.css` has defined a `config-typo-*` scale since Configuration Runtime V1.

| Measured before any change | |
|---|---|
| Distinct font sizes in the stage editor | **9** across 269 usages |
| Radius families at one nesting depth | **4** |
| Uses of `config-typo-*` | **0** |

So the brief's "do not create a new visual language" was not a constraint to work around — it was
the fix. Every rule added either reuses a `--cr-*` token or composes a class already in that file.

## The contradiction the first screenshot showed

On a 1512px viewport the editor column was **689px**, while a 352px process rail beside it held two
cards and ~550px of nothing — and the editor's own dropdowns truncated their values
(`Placement / De⌄`, `No status chan⌄`). The page had 800px of emptiness and not enough room, at the
same time.

## Measured, before → after

Three defined states, measured identically in both phases against the same tenant. The baseline was
captured by restoring the pre-sprint `web/` tree over the same running app — not by recollection.

**Collapsed** — what a director sees before touching anything:

| Lead | Before | After |
|---|---|---|
| Editor width (1512px viewport) | 689px | **997px** (+45%) |
| Page height | 794px | **738px** |
| Readable content | 836 chars | **912 chars** |
| Director questions answered | 5/5 | 5/5 |

The collapsed page got **shorter and more informative at once**. That is the density objective, and
it is the one number here that could not be bought by widening the column.

**Expanded** — where grid discipline is judged:

| Lead | Before | After |
|---|---|---|
| Distinct font sizes | **9** — 8, 9, 10, 10.5, 11, 12, 13, 14, 16px | **6** — 10, 11, 12, 13, 14, 16px |
| Radius families | 7 | 6 |
| Content density | 1259 ch/1000px | **1376 ch/1000px** (+9%) |
| Page height | 3824px | 6345px |
| Labelled controls | 252 | 456 |

Every sub-10px size is gone. 14px and 16px belong to the page shell (section title, workspace
title) and were left alone; the stage editor's own content is now exactly the four steps
10/11/12/13.

**The last two rows are not a regression, and they are not a win either — they are a change of
subject.** The old expanded page opened onto *"Select a work item to configure purpose, timing, and
outcomes."* and rendered none of it. The 204 extra controls are the work-item editor, which now
renders without a selection step. The page is taller because it finally contains the stage's largest
editor — and density still rose 9%, so the added content is packed tighter than what was there
before.

An earlier version of this table claimed a dead-whitespace reduction. It was withdrawn: the ratio
compared an after-page that renders the work-item editor against a before-page that hid it, so the
number measured content volume, not whitespace. The same confound retired a grid-adherence metric
that scored the top-6 control edges — with the control count nearly doubling, the denominator moved
for reasons unrelated to alignment. Font-size and radius counts are reported instead because they
are unaffected by how much is on screen.

## What changed

**Allocation.** The process rail collapses to a strip once a process is selected; one click
restores it, and manual choice wins for the session. Navigation yields to work.

**Grid.** `.stage-grid` / `.stage-field` / `.stage-control` — one label treatment, one control
height, one set of columns. Four label styles and three control heights inside a single screen
became one of each.

**Exit paths.** Three unrelated dropdowns became a path with its trigger stated above the controls:

```
Continue to Tour → Tour   [Automatic]   Triggered by Tour Scheduled, tour booking scheduled (automatic)
```

The trigger line is derived from `summarizeStageOperatingPlan` — the module the Overview and the
work items already read — so a path cannot describe a trigger the configuration does not have.

**Reading order.** Overview → Operator work → Ways out → Attention → Requirements → Identity →
Context. Operator work opens by default; Identity and Context describe how a stage is *stored* and
now follow the work instead of preceding it.

**Disclosure.** Every collapsed section states its contents:

```
Operator work   1 work item · 2 ways out · 4 attention rules   ✓ Configured
Requirements    56 required fields                             ✓ Configured
Stage identity  Not described                                    Optional
Stage Context   One row per family                             ✓ Configured
```

**Noise.** Removed: a paragraph restating the heading below it; two sentences of schema language
about transition ownership; a four-line triple-announcement of "outcomes"; a participation card
occupying ~215px above the fold to say "nothing to configure" three ways (now a one-line summary
row that expands).

**Never opens onto nothing.** The work list auto-selects its primary item, and a one-item queue is
not rendered at all — a one-item picker is not a choice.

## Two things this sprint got wrong first, and how they were caught

1. **The first "after" measurement was flattering and wrong.** It compared the new page-as-it-opens
   against a fully-collapsed baseline, and this sprint changes which sections default to open. Fixed
   by measuring three *defined* states in both phases.

2. **The grid metric punished correctness.** Counting distinct control edges scores a deeply nested
   but perfectly aligned layout worse than a shallow sloppy one. Replaced with adherence — the share
   of controls landing on the dominant columns.

A third was caught by the tests rather than by measurement: renaming "Available Outcomes" to "What
can happen" broke three unit tests that pin the product's outcome vocabulary. **They were right.**
"Outcomes" is what the Overview counts and the certified Lead model is written in; a friendlier
heading would have made the page use two words for one concept. The heading was restored and the
duplicate *below* it removed instead.

## Scale check

Verified across **Lead, Tour and Placement / Decision** — one layout at three configuration depths.
A stage with less configuration looks lighter, not different. **Waitlist is not configured in this
tenant** (the seed has four stages: New Lead, Tour, Placement / Decision, Closed), so it could not
be reviewed; the same layout applies to it unchanged when it is authored.
