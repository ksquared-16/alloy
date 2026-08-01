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
