# Lead Operating Model V1

**Status: APPROVED and CERTIFIED (B1.7). 12/12, `rc=0`.**
Kelly's decisions of 2026-08-01 are incorporated below and are live in the published configuration.
B2 (premium UI) may now begin against this contract.

This is the product contract for the Lead stage. It is written against the **actual persisted
configuration** in the certification tenant, not against what the configuration was assumed to be.

---

## Part 1 · Inventory of the current Lead configuration (B1.1)

Read from the published projection, `stages[lead].stage_operating_plan_v1`.

| Aspect | Current value |
|---|---|
| Stage identity | `lead` / "New Lead" |
| Purpose | "Reach the family and determine next steps." |
| Grain / journey segment | `family` |
| Outgoing transitions | `lead_to_tour` → tour (`status_key: open`) · `lead_to_closed` → closed (`status_key: closed`, `closes_record: true`) |
| Work Items | **one** — `contact_family` (primary, required, due +1 day, `direct_action`) |
| Primary action | `quick_message`, relabelled "Contact Family" |
| Helpful actions | `schedule_tour`, `send_form` |
| Outcomes | `reached_family`✓ · `left_message` · `needs_follow_up` · `interested`✓ · `not_interested` (completes work) |
| Outcome rules | `reached_family`→**lead_to_tour** · `interested`→**lead_to_tour** · `not_interested`→lead_to_closed · `left_message`→no_movement · `needs_follow_up`→no_movement |
| Attention rules | `first_contact_overdue` (work_overdue, +1d, scoped to `contact_family`) · `stage_age_7d` (stage_age_exceeded, 7d) · `missing_required_fields` (missing_requirements) |
| Work Views | `new_leads`, `tours`, `follow_up`, `all_work` — **all bind via `compat_queue_key`; none has `filters_v1`** |
| Legacy `tour_scheduled` status | **not written as a durable opportunity status.** The string appears only as an *outcome* on the Tour stage. |

### Classification

**Platform capability — present and working.** Transitions with source/destination and status
effects; outcome rules with `move_to_stage` / `no_movement`; work templates with primary and
helpful action references; attention rules scoped by `template_key` or stage; execution preflight;
publication. None of the gaps below are platform gaps.

**Tenant configuration — present but wrong.** See defects L1–L4.

**Legacy compatibility — Work View membership.** All four views resolve through
`compat_queue_key` against legacy queue definitions rather than declarative `filters_v1` on the
process. Membership is therefore not expressed in the process configuration at all.

**Missing product definition.** Outcomes for "tour scheduled" and "unable to reach"; follow-up
work rules; contact-attempt evidence; requirement definitions behind `missing_required_fields`.

---

## Part 2 · Defects found (this is the substance)

### L1 — `reached_family` moves the family to Tour. *(severity: high)*

```json
{ "rule_key": "reached_family_to_tour", "when_outcome_key": "reached_family",
  "targets": [{ "kind": "move_to_stage", "transition_ref": "lead_to_tour" }] }
```

Reaching a family is **not** the same as that family agreeing to tour. Today an operator who
records a successful phone call has silently moved the record out of Lead and into Tour, with no
tour booked and nothing scheduled. Tour's Work View then shows a family that has no tour.

This is the central modelling error, and it is exactly the conflation the brief's hypothesis
separates: *contact happened* and *a tour exists* are different facts.

### L2 — `interested` also moves to Tour. *(severity: high)*

The same defect, duplicated on a second outcome. Two different outcomes both mean "go to Tour",
and neither of them means a tour was booked.

### L3 — there is no `tour_scheduled` outcome on Lead. *(severity: high)*

`schedule_tour` is configured as a **helpful action** on `contact_family`, but no outcome
represents its result. So the canonical path the product needs —

> Action *Schedule Tour* → Outcome *Tour Scheduled* → Transition *lead_to_tour*

— **does not exist in configuration.** The action can run, but nothing connects its result to a
stage movement. The only routes to Tour are the two wrong ones above.

### L4 — `left_message` and `needs_follow_up` create nothing. *(severity: medium)*

Both are `no_movement` and stop there. No follow-up work is created, no contact-attempt evidence
is recorded. An operator who leaves a message has no next work item and nothing to come back to;
the only safety net is `first_contact_overdue`, which fires off the *original* due date.

### L5 — no "Unable to Reach" outcome. *(severity: medium)*

There is no way to record that the family cannot be reached, so there is no attempt policy, no
escalation, and no defensible path to closure for unreachable families.

### L6 — Work View membership is not in the process. *(severity: medium)*

All four views bind through `compat_queue_key`. Lead / Tour / All Leads membership is therefore
decided by legacy queue definitions, outside the published process configuration. B1.7 requires
predicates; today there are none to certify.

---

## Part 3 · The canonical Lead operating model (B1.2)

Validated against the existing command, work, outcome and transition runtime. Everything below is
expressible in the current platform — **no new action system, no second outcome engine.**

**Stage** `lead` · grain `family`
**Purpose** Reach the family, understand their needs, determine fit, and establish the next
operational step.

### Work Item: Contact Family *(primary, required, due +1 day)*

| Outcome | Completes work | Movement | Follow-up | Attention |
|---|---|---|---|---|
| **Reached / Qualified** | yes | **none — stays in Lead** | none | clears first-contact |
| **Tour Scheduled** | yes | **`lead_to_tour`** | none | clears |
| **Left Message** | no | none | new Contact Family, +1 day | increments attempt evidence |
| **Awaiting Response** | no | none | new Contact Family, +3 days | attention when follow-up overdue |
| **Unable to Reach** | no | none | new Contact Family while attempts < 3 | attention at 3 attempts; permits closure |
| **Closed Lost** | yes | **`lead_to_closed`** (`closes_record`) | none | clears all |

The correction to L1/L2 is the first row: **Reached / Qualified does not move the family.** It
records that contact succeeded and leaves the record in Lead, where the next operational action —
booking a tour — can happen. Movement to Tour has exactly one cause: a tour was scheduled.

### Actions

| Action | Purpose | Outcome it produces |
|---|---|---|
| Call Family | record a phone contact | Reached / Left Message / Unable to Reach |
| Send Message | quick message | Reached / Awaiting Response |
| Schedule Tour | canonical tour booking | **Tour Scheduled** |

`Schedule Tour` is already registered as a helpful action. What is missing is the outcome it
resolves to (L3).

---

## Part 4 · Ownership (B1.3)

**Work Item owns:** purpose · required/optional · primary · completion policy · due expectations ·
related actions · possible outcomes · follow-up rules · work-scoped attention.

**Stage owns:** identity · purpose · grain · outgoing transitions · stage-level requirements ·
genuinely stage-level attention · stage success criteria.

The persisted model already has this ownership correct. `attention_rules` carrying a
`template_key` are work-scoped; those without are stage-scoped. **Presentation-versus-persistence
boundary:** the UI should group work-scoped attention *under* its Work Item, but it stays
persisted in `attention_rules` keyed by `template_key`. Nothing should be moved in the database
for the convenience of the layout.

---

## Part 5 · Action / Outcome / Transition contract (B1.4)

- **Action** — how the operator performs work
- **Outcome** — what happened
- **Transition** — how the subject moves between stages
- **Attention** — why work needs intervention

The canonical chain:

```
Work Item  Contact Family
Action     Schedule Tour
Outcome    Tour Scheduled
Transition lead_to_tour
Result     Lead work completed · Tour entered · Tour view gains the record
           · Lead view loses it · All Leads retains it
```

**An action label is never outcome authority.** **A status is never transition authority** — the
transition graph is, and `status_key` is an *effect* of a transition, not its cause.

---

## Part 6 · Attention model (B1.5)

| Rule | Owner | Trigger | Evidence | Clears when | Creates attention | Creates work | Blocks? |
|---|---|---|---|---|---|---|---|
| `first_contact_overdue` | Work Item | work overdue +1d | task due_at | work completed | yes | no | warns |
| *(new)* attempts < 3 after 7d | Work Item | attempt evidence | attempt count | reached, or closed | yes | no | warns |
| *(new)* follow-up overdue | Work Item | follow-up due_at | follow-up task | follow-up completed | yes | no | warns |
| `stage_age_7d` | Stage | 7 days in stage | stage entry time | stage exit | yes | no | warns |
| `missing_required_fields` | Stage | missing requirements | field rules | fields supplied | yes | no | warns |

No new attention engine. All of these are expressible as `attention_rules` with existing `kind`
values. The two new work-scoped rules depend on contact-attempt evidence, which L4 must add first.

---

## Part 7 · Requirements and readiness (B1.6)

| Moment | Required |
|---|---|
| **create a Lead** | family name, one contact method. Nothing more. |
| **work a Lead** | nothing beyond the above |
| **schedule a Tour** | a contactable family; a tour slot |
| **leave Lead** | the outcome's own preconditions only |
| **enter Tour** | a booked tour |

Stage-exit requirements must **never** block record creation — a lead that cannot be created
cannot be worked. And missing information is not incomplete work: `missing_required_fields` warns,
it does not close or block.

---

## Part 8 · What B1.7 must configure and certify

1. Remove the `reached_family_to_tour` and `interested_to_tour` movement rules (L1, L2).
2. Add a `tour_scheduled` outcome on Lead, wired to `lead_to_tour` (L3).
3. Add follow-up `create_next_work` targets to `left_message` and `needs_follow_up` (L4).
4. Add an `unable_to_reach` outcome with attempt policy (L5).
5. Author `filters_v1` predicates for Lead / Tour / All Leads (L6).
6. Publish through the draft model, then certify the 13 checks in the brief.

**None of this requires a platform change.** Every item is tenant configuration authored through
the draft/publication model that Platform V1 now guarantees.

---

## Approved decisions — as published

| # | Decision | Published as |
|---|---|---|
| 1 | Reached / Qualified **completes** Contact Family and does **not** move the family | `reached_qualified_complete` → `mark_stage_work_complete` + `no_movement` |
| 2 | Attempt policy is **configuration**, never platform code; never auto-closes | `unable_to_reach_retry` → follow-up while `when_attempt_count_lt: 3`, attention at `when_attempt_count_gte: 3`, no close target |
| 3 | `interested` retired as a stage-moving outcome, history preserved | outcome retained, removed from `outcome_refs`, rule → `no_movement` |
| 4 | Work Views use authoritative **stage**, not status | `filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "lead" \| "tour" }]`; All Leads `[]` |

Decision 3 deliberately keeps the `interested` **outcome** while removing its movement rule and
its place in the work item's `outcome_refs`. Renaming or deleting the key would orphan every
historical record that referenced it; this way it is unselectable going forward, moves nothing,
and old evidence still resolves.

---

## Published configuration (B1.7)

`certification/fixtures/lead-plan.json` is the authored plan. Certified by
`certification/playwright/lead-operating-model.cert.spec.ts` — **12/12, rc=0**, log at
`certification/evidence/lead-operating-model-12of12.log`.

### Outcomes as published

| Outcome | Completes work | Movement | Follow-up | Attention |
|---|---|---|---|---|
| Reached / Qualified | ✅ | **none** | — | — |
| Tour Scheduled | ✅ | `lead_to_tour` | — | — |
| Left Message | no | none | Contact Family +1d | — |
| Awaiting Response | no | none | Contact Family +3d | — |
| Unable to Reach | no | none | Contact Family +2d while attempts < 3 | Needs Attention at ≥ 3 attempts |
| Closed Lost | ✅ | `lead_to_closed` (`closes_record`, `status_key: closed`) | — | — |
| *Interested (retired)* | no | **none** | — | — |

### Actions — registered capabilities only

`quick_message` (primary, "Send Message") · `call_parent` ("Call Family") · `schedule_tour`
("Schedule Tour") · `send_form`.

**`log_call` does not exist** in `action_definitions`; the model originally named it and was
corrected to `call_parent` rather than inventing a capability. The editor configures *references*
to registered actions — it never becomes a second execution authority.

### Attention as published

| Rule | Owner | Creates | Clears when |
|---|---|---|---|
| `first_contact_overdue` | Work Item (`contact_family`) | Needs Attention after +1d | work completed |
| `no_contact_attempt` | Work Item (`contact_family`) | Needs Attention after +2d | work completed |
| `stage_age_7d` | Stage | Needs Attention after 7d in Lead | stage exit |
| `missing_required_fields` | Stage | Needs Attention | required fields supplied |

All warn; none block. The attempt-threshold signal lives on the `unable_to_reach` rule rather
than as a separate attention rule, because it is a property of the outcome being recorded.

---

## Certification evidence

```
L0  draft materialized at revision 1;  authored;  published rules UNCHANGED by authoring
L1  validate can_publish=true errors=0 → publish http=200 → revisions 0 → 1
L2  reached_family_to_tour: GONE      interested_to_tour: GONE
    rules referencing lead_to_tour: 1  (tour_scheduled only)
    interested retained as non-moving — historical evidence preserved
L3  new_leads  [{field_key: opportunity_stage, operator: equals, value: lead}]
    tours      [{field_key: opportunity_stage, operator: equals, value: tour}]
    all_work   []   (sanctioned include-all)     no opportunity_status anywhere
L4  Reached / Qualified:  family lead/open/- → lead/open/-   work=completed   ← THE correction
L5  Left Message:         family stays lead;  open work 1 → 2
L6  Awaiting Response:    family stays lead
L7  Unable to Reach:      family stays lead, NOT closed — closure stays an operator decision
L8  Tour Scheduled:       family lead/open/- → tour/open/-   work=completed
    durable opportunity status after the move: open   (never `tour_scheduled`)
L9  opportunities carrying a legacy `tour_scheduled` status: 0
L10 status=published  draft_revision=3  base_revision=present  revisions=1
```

**L4 and L8 together are the whole point.** A recorded phone call leaves the family in Lead; only
a scheduled tour moves them. Before this slice both did the same thing.

---

## Remaining backend ambiguity

- **`follow_up` Work View has no predicate.** Lead, Tour and All Leads were the three the decision
  named; `follow_up` still resolves through `compat_queue_key`. It needs a product definition
  ("what makes work follow-up?") before it can be expressed as a predicate.
- **Outcome availability is not gated by attempt count.** The platform gates *targets*
  (`when_attempt_count_lt` / `_gte`), not whether an outcome is offered. So "Unable to Reach
  becomes available after the threshold" is expressed as *behaviour* that changes at the
  threshold, not as a hidden option. Gating availability would be a platform primitive.
- **Contact-attempt evidence is inferred from work instances**, not from a first-class attempt
  counter. `when_attempt_count_*` reads that inference. If attempts need to be counted
  independently of work items, that is a platform addition.
- **Schedule Tour → booking is not certified end to end.** L8 proves the outcome resolves the
  transition and moves the family. It does not prove the `schedule_tour` action creates a
  canonical booking record, because that command was not exercised. Stated rather than implied.

---

## Superseded

Earlier open decisions for Kelly

1. **Does "Reached / Qualified" complete the Contact Family work item, or leave it open?** The
   model above completes it and relies on the operator taking the next action. The alternative
   leaves it open until a tour is booked or the lead is closed, which keeps a work item on every
   contacted family.
2. **Attempt policy:** is 3 attempts over 7 days right, and does exhausting it *permit* closure or
   *automate* it? The model above permits, never automates.
3. **`interested` outcome:** delete it, or keep it as a non-moving qualifier alongside Reached?
4. **Work View predicates:** author `filters_v1` now, or keep `compat_queue_key` until a later
   slice? Authoring them is what makes membership a property of the published process.
