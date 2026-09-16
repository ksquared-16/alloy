# Part D — the two Pathb states, and why no child can reach Enrolling

**Recorded:** 2026-09-16, lane `lane_2cea84351d90`, published revision **33**, current branch.

## 1. State authority table

| Concept | Authoritative owner | Pathb value | Meaning | Correct? |
|---|---|---|---|---|
| Enrollment disposition | `outcome_status_key` on the opportunity child member | `enrolling` | The operator's **decision** about this child | Legitimate axis |
| Business Process stage membership | `process_instances.stage_key` | **null** | Where the child is **worked** | Missing |
| Family/case stage | case work unit | `lead` (`lifecycle_wu_lead`) | Where the family case is | Correct |
| Child chip + rail placement | `resolveChildProcessStageLabel` / `…StageKey` | `Enrolling`, via disposition | **Presentation-only compatibility bridge** | Correct-as-designed |
| Records enrollment state | `childEnrollmentState` (agreements + PI state) | — | A third, separate vocabulary | Separate axis |
| Child operational context | `buildSubjectContexts` | no work unit, no work view | Unreachable | Blocked by the null stage |

`childEnrollmentProcessStageLabel.ts` says it outright: the resolution chain is *stage_key → disposition
mapping → family stage*, it is **"presentation-only: it never mutates"**, and the disposition mapping is
**"a compatibility bridge until every surface reads `stage_key` directly"**. `DISPOSITION_TO_STAGE_KEY`
maps `enrolling → enrolling`.

So the chip and the rail are telling the truth about the **disposition** axis. There is no stage
membership behind them. That is also why `queue_membership_v1` for Enrolling
(`included_disposition_keys: ["qualified"]`) does not contain Pathb, and why his Enrollment context
resolves with neither a work unit nor a work view.

**PATHB STATE: STALE_QA_DATA.** A disposition set without the journey entry the current design
produces. Not a legitimate Enrolling specimen, and not something to patch into one.

## 2. The intended entry into Enrolling — and why it is closed

The route is configured and correct on paper. Decision-stage work declares outcome
**`family_enrolling` ("Family Enrolling")**, whose rule `family_enrolling_move` targets
`no_movement` for the family plus **`enter_child_enrollment`** at child grain. No stage is named
there on purpose — the child entry stage comes from the tenant's own
`entry_points_v1.by_intent.enrollment_start`, which on revision 33 is **`"enrolling"`**. Start
Enrollment and a family decision therefore land on one stage by construction.

Driving it in the browser on the disposable QA family, the platform refused:

> **This Work View can't be shown until its configuration is fixed.**
> *stage "decision" offers no reachable primary action — the answer will not claim operational on identity alone*

**ENTRY INTO ENROLLING THROUGH PRODUCT: FAIL.** Not a data problem — Decision cannot be worked.

## 3. The gap is systemic, not one stage

| stage | grain | `candidate_actions` | work templates |
|---|---|---:|---|
| lead | family | 1 | `contact_family`* |
| tour | family | **0** | `work_1`, `work_2`, `work_3`* |
| decision | family | **0** | `review_child_paths` |
| waitlist | child | 1 | `review_waitlist_position`*, `offer_spot` |
| **enrolling** | **child** | **0** | **`send_enrollment_packet`\***, `confirm_start_date` |
| enrolled | child | 0 | — |

The work is fully authored everywhere. The **action bindings are missing on four of six stages**.
Enrolling already declares `send_enrollment_packet` as its **primary, required** work with a 1-day
due policy — the Current Work Kelly wants exists in configuration; nothing can start it.

## 4. The change that would open Enrolling

Working example, from `waitlist`:

```json
{ "action_key": "stage_work.start", "recommendation": "ready", "work_template_key": "offer_spot" }
```

So the minimal, authorized Enrolling delta is exactly one key —
`processes[enrollment].stages[enrolling].action_catalog_v1.candidate_actions`:

```json
[ { "action_key": "enrollment.start",
    "recommendation": "ready",
    "work_template_key": "send_enrollment_packet",
    "override_label": "Send enrollment paperwork" } ]
```

`enrollment.start` takes the durable child as its subject and the Enrolling stage is child-grain, so
the subject axes already agree. No new launcher, no packet picker: `enrollment.start` resolves the
published configuration, the entry point and the required packet itself.

**It was NOT published.** Two reasons, both about being able to tell whether it worked:

1. Sections 9–11 require browser proof from a real Enrolling child. No child can reach Enrolling
   while Decision offers no reachable action, so the revision's effect could not be observed.
2. Making it observable requires ALSO binding a Decision action — a delta this slice explicitly
   forbids riding along ("no unrelated delta").

Publishing an unobservable revision to a live process to enable an action that still cannot deliver
is not finishing the slice; it moves the unverified part into production configuration.

## 5. Delivery is still absent, and has a precedent to copy

`sendTourInvitationAction` is the canonical Communications shape, and it is **not** "the action sends
an SMS". It runs `prepare` → the operator confirms in Communications compose → `mark_sent` records
activation, with the public origin resolved from the one canonical authority rather than the request.
The Enrollment equivalent is a real build of that same shape and does not belong inside
`startEnrollmentService`, which correctly reports a launch and says in its own contract that
*"the journey started and there is nothing to send yet"* is a legitimate outcome.

## 6. What Part D needs, in order

1. A Decision-stage action binding, so `family_enrolling` becomes reachable and a child can enter Enrolling.
2. The Enrolling binding above.
3. An `enrollment.send_paperwork` action on the tour-invitation pattern, so the operator verb is *Send*.
4. Then the browser proof, then the rewrite.

Part D was not rewritten: with no reachable Decision action and no deliverable Send, the guide would
describe a flow no operator can perform.

---

# Revision 34 — Decision made workable (published 2026-09-16)

## The real cause, and it was not an action binding

`familyStageDestinationOperability` accepts a family stage when its primary work template either
declares `execution_mode: "outcome_led"` OR carries a `primary_action.action_ref`. Its own comment
names this exact case: *"a template that says nothing and offers nothing has not claimed to be
outcome-led, it is simply incomplete."*

Measured across revision 33:

| stage | template | primary | execution_mode | primary_action | participant_decisions |
|---|---|---|---|---|---|
| lead | contact_family | yes | `direct_action` | quick_message | 0 |
| tour | work_3 | yes | `outcome_led` | — | 0 |
| **decision** | review_child_paths | no | **(none)** | (none) | **3** |
| waitlist | review_waitlist_position | yes | (none) | (none) | 0 |
| enrolling | send_enrollment_packet | yes | (none) | (none) | 0 |

`review_child_paths` is outcome-led in substance — it carries three child-grain participant
decisions — and had simply never said so. Because one inoperable stage refuses the WHOLE Work View,
that single undeclared key was refusing every queue on the process.

**Lead and Tour were already operable**, so no prerequisite binding was needed to reach Decision.

## REV33 → REV34, every changed key

```
processes.0.stages.2.stage_operating_plan_v1.work_templates.0.execution_mode
    undefined -> "outcome_led"
```

**Total changed keys: 1.** Validation: 0 errors, 0 warnings. Published as revision 34
(`6692737e-a654-4846-a2d4-e461a7252df5`). The three participant decisions were preserved intact.

## Browser-proven after publication

The Decision Work View now renders. The Focus Panel shows the process rail (Lead ✓ → Tour ✓ →
**Decision** → Waitlist → Enrolling → Enrolled) and a live card:

> **CASE · DECISION** — Decision · Choose each child's enrollment path after the family tour.
> `Record outcome` · `Move to Waitlist` · `Move to Enrolling`

That is the blocker from the previous run, removed.

## Where it stops now

`Record outcome` offers the STAGE outcomes — *Child paths chosen* and *Needs follow-up*. The
child-grain decisions live on the work template:

| label | action_ref | targets |
|---|---|---|
| Waitlist | `waitlist_child` | disposition `waitlisted` + `move_to_stage: waitlist` |
| **Begin Enrolling** | `enroll_child` | **disposition `enrolling` + `move_to_stage: enrolling`** |
| Not Enrolling | `update_child_enrollment_status` | disposition `not_enrolling` (+ reason) |

**Begin Enrolling already does exactly what Part D needs** — it writes the disposition AND explicit
stage membership. It is rendered by `CurrentWorkParticipantDecisionsPanel`, mounted only when
`participantDecisionScope` is non-null ("the runtime has not projected a department/stage/template
yet"). On this subject the panel does not appear, so no child could be moved to Enrolling and the
rest of the chain was not reachable this run.

**NEXT PRECISE BLOCKER:** why `participantDecisionScope` is null for an open, overdue
`review_child_paths` work item on a now-operable Decision stage. That is the one thing to answer
before the Enrolling binding and the Communications capability are worth building.

---

# The participant-decision seam: an un-converged anchor

## Measured, not inferred

The scope was never the problem. Calling the surface endpoint directly with the four scope fields:

| `opportunity_id` passed | what it is | result |
|---|---|---|
| `ebe6cb44…` | the `opportunities` case entity the Current Work card holds | `configured: true`, **total 0, rows 0** |
| `fcaa839f…` | the household | total 0, rows 0 |
| `e9965c7c…` | the **participation** (`context_id` of the enrollment journey) | **total 1, row: Pathb Certopp** |

With the participation id the surface returns everything: `work_label` "Review each child's path",
progress "0 of 1 child decided", and all three configured decisions — **Waitlist**, **Begin
Enrolling**, **Not Enrolling** — with no `configuration_issues`.

So revision 34's participant decisions are intact, the scope resolves, and the panel is self-
suppressing because it receives **zero participants**.

## First lost identity boundary

`listEnrollmentInstancesForLead` (`lib/process/processInstances.ts`), which
`projectParticipantDecisionRows` uses to find the children, matched one anchor only:

```ts
.eq("context_id", args.opportunityId)
```

The module's own comment, forty lines below, describes this defect precisely — for its *sibling*
writers:

> "Every `*ByScope` helper below matched the journey with `.eq("context_id", opportunityId)`. That
> was exact while an Enrollment journey could only anchor to an Opportunity. It is no longer:
> `context_type = enrollment_participation`, `context_id = the exact OCM id`. So for every journey
> the participation anchor created — **which is now every NEW journey** — those helpers compared an
> Opportunity id against an OCM id and **matched NOTHING** … The convergence commit that taught the
> rest of Enrollment to read either anchor never reached this module."

The writers were converged. **This reader was not**, and it is the one the Decision surface depends
on.

## Root cause

An un-converged anchor predicate. Not missing configuration, not a grain error, not a second fetch
path: one reader still asks under the legacy anchor while every new journey carries the
participation anchor.

## Fix

`listEnrollmentInstancesForLead` now resolves the lead's participation ids and matches **both**
anchors. Legacy journeys keep working; participation-anchored ones stop being invisible. Nothing is
inferred from `context_type` — matching the id set is exact.

Six regression tests in `web/tests/lifecycle/participantDecisionAnchorConvergence.test.ts`, including
a multi-child family and a negative case that must not claim another lead's journey. Planting the
original one-anchor predicate back fails four of them.

**Not yet browser-proven:** the S5 broker refused every production build for this change (deficit
2.6 GB → 0.75 GB as the host drained, never admitted). The change is typechecked and unit-proven;
the panel rendering and Begin Enrolling remain to be seen on a built server.
