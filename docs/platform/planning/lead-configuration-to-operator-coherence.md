# Lead — Configuration → Runtime → Operator Coherence

**The sprint's question:** configure *"Contact Family → Left Message → follow up tomorrow → no
contact after 3 attempts → Tour Scheduled moves to Tour"*, then watch the runtime behave that way.

**The answer: no.** Not because the platform can't — it can, and the database proves it — but
because the operator surface exposes **none of the six configured outcomes**, and the one work item
it does show is marked **Blocked** with no stated reason.

> *If I hired a new director, could they configure Lead correctly the first time?*
>
> They could configure it. They could publish it. They could not **operate** it, and they would have
> no way to tell that what they configured is working.

All findings below are recorded from a running tenant, not inferred. Harnesses:
`certification/playwright/lead-director-walkthrough.cert.spec.ts`,
`lead-clickthrough.cert.spec.ts`, `lead-blocked-reason.cert.spec.ts` (all opt-in via
`WALKTHROUGH=1`; they mutate the tenant). Evidence in `certification/evidence/lead-walkthrough/`.

---

# Part 1 — Configuration → Runtime trace matrix

Each row: where it is configured · where runtime consumes it · where the operator sees it · what
evidence is recorded.

| Configured object | Runtime consumer | Operator sees | Evidence recorded | Verdict |
|---|---|---|---|---|
| **Work item** `contact_family` | `resolveCurrentWorkTemplateFromPublishedPlan` | **Yes** — "WHAT'S NEXT · Contact Family" | `operational_tasks` row | ✅ |
| **Work item purpose** | same | **Yes** — rendered verbatim on the card | — | ✅ |
| **Primary + helpful actions** | `resolveWorkTemplateActionOptions` | **Yes** — Send Message · Schedule Tour · Send form | per-action | ✅ |
| **Due policy** (1 day) | `stageFollowUpWorkDuePolicy` | Indirectly — a due date | `operational_tasks.due_at` | ⚠️ |
| **Outcomes** (6) | `buildCurrentWorkResolutions` | **NO — zero of six are reachable** | — | ❌ |
| **Outcome rules → `create_next_work`** | `stageOutcomeRuleTargetExecutor` | No | new task row | ⚠️ deduped |
| **Attempt gate** (`when_attempt_count_lt/gte: 3`) | `applyConfiguredStageRulesForDomainSignal` | **No** — attempt count never shown | `metadata.attempt_count` | ⚠️ |
| **Outcome rules → `move_to_stage`** | `executeStageOperatingOutcome` | Only as a changed stage chip | `opportunities.stage_key` | ✅ backend |
| **`when_domain_signal` tour booking** | `emitDomainLifecycleSignalEvent` | No | `workflow_events` on the booking | ✅ backend |
| **Attention rules** (4) | `evaluateStageOperatingPlanAttention` | "Needs contact" badge | — | ⚠️ unattributable |
| **Outgoing transitions** (2) | `resolveOutgoingProcessTransitions` | No | — | ⚠️ |
| **Work View filters** (`opportunity_stage = lead`) | `computeOperationalProjection` | **Rows yes, counts say 0** | — | ❌ |
| **Stage grain** (`family`) | `workUnitProvisioningAnswer` | Contradicted — "100 Children" | — | ❌ |
| **Any outcome recording** | — | — | **`activity_log` = 0 rows** | ❌ |

**Two things disappear into the platform entirely**: every outcome the operator is supposed to
record, and the audit trail of having recorded it.

---

# Part 2 — Director walkthrough

Acting as a new director. No docs, no implementation reading.

### Arrival — `/workspace`

```
1000 Needs attention     247 Overdue work     0 Active children
Enrollment  · No signal · — Time to schedule tour · Target 48h
TODAY'S WORK
  Follow Up   Keep the conversation moving toward a decision.   100 Children ›
  All Work    Every open case in this process.                  100 Children ›
  Tours       Confirm the visit and record the outcome.           1 Child ›
  New Leads   Respond to every new family inquiry before it goes cold.   0 ›
```

The tenant holds **146 opportunities in stage `lead`**. The view built for them reads **0**.

*247 Overdue work is exactly right* (verified: 247 open tasks past due). So the header is not
uniformly broken — which makes the wrong numbers harder to spot, not easier.

### Opening New Leads — `/workspace/work-unit/new-leads`

The queue **does** list leads: `Inquiry 0059 — Test Family 0059`, `Inquiry 0119 …`, thirteen visible.
The tab above them still reads **`New Leads 0`**, and the header tile reads **`0 Lead count`**.

The Focus Panel opens correctly and shows real configuration:

```
WHAT'S NEXT                                    [Blocked]
Contact Family
Reach the family, understand their needs, determine fit, and establish
the next operational step.
[ Send Message ]  [ Schedule Tour ]  [ Send form ]
View details →
```

The purpose is the configured string, verbatim. The three actions are the configured actions. **This
is the configuration reaching the operator, and it works.**

Then it stops.

### Attempting the seven tasks the brief lists

| Task | Outcome |
|---|---|
| Call family | ✅ "Send Message" / "Schedule Tour" available |
| Leave message | ❌ no way to record "Left Message" |
| Schedule follow-up | ❌ not offered; it is a *consequence* of an outcome that cannot be recorded |
| Mark awaiting response | ❌ no way to record |
| Retry contact | ❌ no attempt count anywhere |
| Schedule tour | ✅ action exists |
| Close lost | ❌ no way to record |

Measured on the card: **"Configured outcomes visible: (none)"**, **"Record outcome affordance:
false"**.

### The block

The chip says `Blocked`. It has **no tooltip, no `title` attribute, and hovering reveals 0 additional
characters**. `View details →` does not navigate — the URL is unchanged and nothing new appears.

The code computes `outcomeCompletionBlockReason` (`buildCurrentWorkResolutions.ts:74`). **It is
never rendered.** The product knows why and does not say.

### What the backend actually does (driving the canonical command directly)

| Step | Result |
|---|---|
| Left Message | ✅ work stays open, follow-up created due **tomorrow** — exactly as configured |
| Awaiting Response | ⚠️ **nothing changed** — no second follow-up, due date still tomorrow, not +3 days |
| Unable to Reach ×3 | ⚠️ `attempt_count` → 5, but no visible attention and no escalation the operator can see |
| Tour Scheduled | ✅ **stage `lead` → `tour`** |
| Closed Lost (2nd family) | ✅ stage → `closed`, status `closed` |

**The two headline behaviours work.** The chain in between does not, and none of it is observable.

### The audit

```
ACTIVITY FEED for the family: (empty)
WORKFLOW EVENTS keyed to the family: (empty)
```

Seven outcomes recorded. **Zero rows in the family's own history.**

---

# Part 3 — Every hesitation

1. *"New Leads says 0 — is the process broken, or is there genuinely no work?"* The count and the
   list contradict each other **on the same screen**.
2. *"Which number do I believe?"* Home says `Follow Up 100 Children / Tours 1 Child`; the work-unit
   page says `Follow Up 500 / Tours 33`. Same views, same moment, four different numbers.
3. *"Why does it say Children when I configured this stage as one row per family?"*
4. *"0 Active children — with 3000 child records?"* Possibly correct (no stage is "enrolled"), but
   nothing on screen lets a director decide.
5. *"1000 Needs attention"* — a suspiciously round number against 3000 opportunities. Unverified.
6. *"It says Blocked. Blocked by what?"* **The dead end.** No reason, no tooltip, no link.
7. *"I called and left a message. Where do I record that?"* Nowhere.
8. *"I configured 'retry until 3 attempts, then escalate'. How many attempts have we made?"* Not
   shown anywhere.
9. *"Did my configuration publish?"* The stage editor says Published; the runtime shows 0. Both are
   telling the truth about different things.
10. *"What happened on this family last week?"* Activity tab exists; the feed is empty.
11. *"Two children named Tatum Testfamily-0059, both 'Needs a room'."* Duplicate-looking rows.
12. *"Actions (4)" in the header vs three buttons on the card.* Which four?
13. *"All Work"* → `Work View "All Work": lens spans 2 Row Grains (family, child) — a surface cannot
    be grain-ambiguous`. Correct engineering; unusable to a director, and the home screen still
    advertises it as `100 Children`.

---

# Part 4 — Runtime coherence, classified

| # | Observation | Classification |
|---|---|---|
| 1 | Outcomes unreachable in the Focus Panel | **Product** — the surface renders no resolution list |
| 2 | "Blocked" with no reason | **Product** — reason computed, never rendered |
| 3 | New Leads count 0 while rows render | **Runtime** — count and list use different paths |
| 4 | Home tile vs work-unit page counts disagree | **Runtime** |
| 5 | "Children" where stage grain is `family` | **Runtime** — provisioning ignores stage grain |
| 6 | All Work grain-ambiguous | **Configuration** — a real defect, correctly reported |
| 7 | 2nd/3rd follow-up deduped; per-outcome timing lost | **Business Process** — `dedupe_key` omits the outcome |
| 8 | Attempt count invisible | **Product** |
| 9 | Escalation invisible | **Product** |
| 10 | `activity_log` empty | **Runtime** — no projection onto the family |
| 11 | Completing outcome missing from work metadata | **Business Process** — `last_outcome_key` says `unable_to_reach` on a task completed by `tour_scheduled` |
| 12 | Stage movement + Closed Lost | ✅ **correct** |

---

# Part 5 — Configuration coherence

| Object | Belongs here? | Friction |
|---|---|---|
| Work item, purpose, actions, outcomes | ✅ | none |
| Attention rules | ✅ | operator can't tell which rule fired |
| Outgoing transitions | ✅ | good since the last sprint |
| **Work View filters** | ⚠️ | authored against `opportunity_*` fields with no indication the runtime rows may be child-grain — the mismatch is silent and produces `0` |
| **Field requirements (56)** | ❌ | a director would never expect 56 required fields on Lead; **prime suspect for the block**, and nothing connects the two |
| **Row grain** | ❌ | set per stage, but the work unit provisions its own grain; two sources, no reconciliation |
| Journey segment | ⚠️ | "family / child" duplicates row grain conceptually |
| `interested` (retired) | ❌ | still in the published outcome list, marked "(retired)" |

**Duplicated concepts:** stage grain vs journey segment vs work-unit grain (three names, one idea);
"Needs attention" as a header tile, a badge, and a configured rule set with no link between them;
counts computed twice by two paths.

**Missing explanations:** why work is blocked; what the attempt count is; which attention rule fired;
why a Work View returns 0; what "Active children" counts; what the four Actions are.

---

# Part 6 — Premium product review

| Dimension | Score | Why |
|---|---|---|
| Discoverability | **2/5** | Leads are listed under a tab reading `0`; a director would not click it |
| Confidence | **1/5** | Four contradictory counts for the same views; nothing tells you which is true |
| Editing | **4/5** | The stage editor is good after the last sprint |
| Validation | **4/5** | Publication gate is honest and blocks correctly |
| Publication | **5/5** | Certified, truthful, reversible |
| **Operating** | **1/5** | **Zero configured outcomes recordable. This is the sprint's finding.** |
| Understanding | **2/5** | Configuration is legible; runtime is not — no attempt count, no reason, no history |
| Navigation | **3/5** | Queue → Focus Panel works; global search works; Work View counts mislead |
| Reading | **4/5** | The Focus Panel reads well and shows configured language verbatim |
| Decision making | **1/5** | A director cannot answer "what should I do next" — the card says Blocked and offers no path |

**Configuration is a premium product. Operating is not yet a product at all.**

---

# Part 7 — Prioritized backlog

### Critical — the loop is open

1. **Render the configured outcomes in the Focus Panel.** `buildCurrentWorkResolutions` already
   builds them from the published plan. Nothing an operator can record ⇒ nothing configured matters.
2. **Show the block reason.** `outcomeCompletionBlockReason` exists and is discarded. Put it on the
   chip and in the card. If it is the 56 field requirements, name the fields.
3. **Fix the Work View count path.** Rows and counts must come from one query. Today the same screen
   shows a list of leads under a tab reading `0`.
4. **Reconcile row grain.** Stage grain says `family`; the work unit provisions `child`. Until these
   agree, opportunity-scoped filters silently return nothing.

### High — the operator cannot see what they configured

5. **Project outcome recordings onto the family activity feed.** `activity_log` is empty after seven
   outcomes. (Carried from the Lead UX sprint; now confirmed with evidence.)
6. **Show the attempt count and the escalation threshold** on the work item — "Attempt 3 of 3".
7. **Include the outcome in the follow-up `dedupe_key`.** Per-outcome timing is configurable and only
   the first outcome's timing ever applies.
8. **Record the completing outcome in work metadata.** A task completed by `tour_scheduled` reports
   `last_outcome_key: unable_to_reach`.
9. **Make home tiles and work-unit counts agree.**

### Medium

10. Explain "Needs attention" — which rule, on what.
11. Remove `interested (retired)` from the published outcome list.
12. Surface the grain-ambiguity error where the view is *configured*, not only where it renders.
13. Warn in the Work View editor when a filter field's grain differs from the surface's.
14. Reconsider 56 required fields on Lead, or explain them.

### Low

15. "0 Active children" — state the definition.
16. Reconcile "Actions (4)" with the three buttons shown.
17. Duplicate-looking child rows in Assignments.
18. Retire journey segment or row grain — one name for one idea.

---

# Part 8 — Recommended implementation order

**Slice 1 — Make the loop closeable (items 1, 2).** Render outcomes and the block reason. Both read
data the surface already computes; no new architecture. After this a director can operate Lead at
all, which nothing else in this list is worth doing before.

**Slice 2 — Make the numbers true (3, 4, 9).** One query for rows and counts; reconcile grain. Until
this lands every count on the operator's home screen is advisory.

**Slice 3 — Make the behaviour visible (5, 6, 8).** Activity feed, attempt count, correct completion
metadata. This is what turns "it worked" into "I can see it worked".

**Slice 4 — Fix the configured chain (7).** Follow-up dedupe. Deliberately after Slice 3: without the
activity feed there is no way to certify the fix from the operator's side.

**Slice 5 — Medium/Low.**

Slices 1 and 2 are the gate. Everything above "High" is invisible-to-the-operator work that cannot be
certified from the outside until Slice 1 exists.

---

## What is already right, and must not regress

- The Focus Panel renders the configured work item, its purpose **verbatim**, and its configured
  actions. The configuration→operator path exists and works — it stops at outcomes.
- `Tour Scheduled` moves the family `lead → tour`. `Closed Lost` closes the record. Both certified,
  both confirmed live in this walkthrough.
- `Left Message` creates follow-up work due tomorrow, exactly as configured.
- "247 Overdue work" is exactly correct.
- Publication is truthful and the validation gate blocks correctly.
- The stage editor, after the previous sprint, is the strongest surface in the product.
