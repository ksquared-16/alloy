# Tour and Enrolling are one grammar — and the gate stops short of Forms

**Run:** `erun_7258f610d8ae3213` · **Investigation only. Nothing mutated.**

## 0. A correction I owe first

Last run I said *"nothing today can make an outcome available only once paperwork is complete."*
**That was wrong, and wrong in the direction that matters.** A transition-blocking layer exists and
runs on every stage-changing outcome:

```
completeStageWorkWithOutcome
  → preflightStageChangingOutcomeReadiness   (blocks atomically; nothing mutates on failure)
    → evaluateTransitionRequirementPreflight (per destination transition)
      → "Cannot move stage — missing required fields: …"
```

I had read the outcome *type* (no condition field) and concluded there was no gate. The gate is not on
the outcome — it is on the **transition the outcome resolves to**. What is actually true is narrower
and more useful: **the gate exists and does not yet see Form requirements.**
`evaluateTransitionRequirementPreflight` reads `ruleMeta.by_rule_id` — **field rule ids only** — and
never reads `requirements_v1`.

## 1. Tour's actual execution grammar

| | |
|---|---|
| purpose | *"Conduct the tour and record what happened."* |
| work | one template `conduct_tour`, `execution_mode: outcome_led` |
| helpful actions | `schedule_tour` · `send_confirmation` · `send_reminder` · `reschedule` · `quick_message` |
| outcomes | `tour_scheduled` · `tour_completed` ✅ · `no_show` ✅ · `needs_follow_up` · `family_declined` ✅ · `no_availability` (✅ = completes work) |
| transitions | `tour_to_decision` "Continue to Decision" · `tour_to_waitlist` · `tour_to_closed_lost` |
| outcome rules | `tour_completed → move_to_stage(tour_to_decision)` · `no_show → no_movement + create_next_work(conduct_tour, +2h)` · `needs_follow_up → no_movement + create_needs_attention` |

**Tour has no readiness evidence and no requirements at all.** "Tour Completed" is an *operator
assertion*, not a derived fact — nothing checks that a tour happened. So:

* **Can a Tour be skipped today?** Yes, trivially — an operator records a different outcome or takes a
  transition. There is no skip *primitive* because there is no *gate* to skip.
* **Does skipping lie?** No. Nothing is marked satisfied, because nothing was ever required.

That is the honest baseline, and it is why Tour has never needed a waiver.

## 2. Enrolling's actual execution grammar

| | |
|---|---|
| purpose | *"Complete enrollment paperwork after the family decides to enroll."* |
| work | `send_enrollment_packet`, `execution_mode: direct_action`, primary action `send_form` |
| outcomes | `packet_sent` ✅ · `packet_pending` |
| transitions | **none** |
| outcome rules | `packet_sent → mark_stage_work_complete` · `packet_pending → create_needs_attention` |

**This is stale relative to B1.** `enrollment.start` already realizes the participant objective —
`launchParticipantEnrollment` derives the packet, mints the link and creates the session. So "Send
Enrollment Packet" is no longer the primary work; sending already happened. It is now a *resend /
share / follow-up* capability.

And with **zero transitions**, nothing moves a child from Enrolling to Enrolled at all today.

## 3. One grammar, or two? — **One.**

The four concepts are already separated in the model, and Tour uses all four:

| Concept | Where it lives | Tour | Enrolling |
|---|---|---|---|
| **Work** | `work_templates` | `conduct_tour` | `send_enrollment_packet` (stale) |
| **Readiness** | requirements + preflight | **none** | `requirements_v1` (kind=form) — *not read by the gate* |
| **Outcome** | `outcomes[]` | 6 outcomes | 2 outcomes |
| **Transition** | `outgoing_transitions` + `outcome_rules` | 3 transitions, rules route them | **none** |

Nothing here needs a second system. Enrolling is the same grammar **under-configured**, plus one
evaluator that stops short of Forms.

## 4. Existing primitives — more than I credited

| Primitive | Status |
|---|---|
| Per-transition requirement preflight | ✅ exists, blocks atomically |
| `timing: stage_exit` scoping | ✅ exists |
| **Per-exit-path scoping** — `applies_to_transition_keys` / `excluded_transition_keys` on `StageRequirementV1` | ✅ exists **and is consumed** (`requirementTimingEvaluation`) |
| Enforcement derived from level | ✅ `enforcementFromLevel` |
| Outcome → consequence rules | ✅ `move_to_stage` · `no_movement` · `create_next_work` · `create_needs_attention` · `mark_stage_work_complete` |
| Outcome note | ✅ `note?: string` on the outcome record |
| Requirement satisfaction facts | ✅ `satisfied / outstanding / unrealized / unsupported` |
| Packet review approval | ✅ `needs_review / approved / rejected / needs_correction` + `reviewed_at` / `reviewed_by_user_id` |

**`excluded_transition_keys` is the finding that matters.** "Paperwork is required to *Enroll*, but not
on the *Waive* path" is already expressible — a requirement can exclude a transition. The exit-path
grammar you described is largely *already modelled*; it is the Form evaluator and the exception record
that are missing.

## 5. The exact missing primitives — three, not one

1. **Form requirements do not participate in the transition gate.**
   `evaluateTransitionRequirementPreflight` reads `by_rule_id` (field rules) only. Authoring five
   `kind: form` requirements at `enforcement: blocking` **does not block anything today.**
2. **Requirement exception / waiver is still not modelled.** Confirmed unchanged — and the platform
   already names its owner: hold `AWAITING_REQUIREMENT_EXCEPTION_MODEL`, D-H2, *"An exemption is not a
   health fact — it is permission to skip a requirement, and it needs the evidence that justifies it.
   **Business Process owns requirement exceptions.**"*
   The certification corpus makes this vivid: one of the five Forms is the **Oregon Nonmedical
   Exemption** — a waiver artifact whose canonical owner does not exist yet.
3. **Authorization is not per-outcome.** Recording *any* outcome runs under one capability,
   `record_outcome`. Nothing lets "Enroll" and "Waive paperwork" require different authority, and no
   per-outcome reason is mandated (`note` is optional and unstructured).

## 6. Proposed Enrolling model — smallest thing that renders your grammar

**Work**

> **Enrollment paperwork** — 5 forms · *3 of 5 complete* / *Needs review* / *Approved*
> (`send_enrollment_packet` demoted to a helpful *Resend / share link* action, since B1 already sent it)

**Ways out**

| Outcome | Availability | Mechanism |
|---|---|---|
| **Enroll** | paperwork satisfied + review approved | new transition `enrolling_to_enrolled` + `outcome_rule` → `move_to_stage`; gate via `timing: stage_exit` once the preflight reads Forms |
| **Enroll without paperwork** | explicit authorized exception | same transition, listed in the requirements' `excluded_transition_keys`, plus a recorded exception |
| **Needs correction / follow up** | always | outcome with `no_movement` + `create_needs_attention` — exactly Tour's `no_show` shape |

**No "stay" transition is needed** — `no_movement` is already how Tour stays put, and the outstanding
work keeps surfacing. That matches existing doctrine.

## 7. How skip stays truthful

The design falls out of what already exists, and it never touches Forms:

* requirements remain `outstanding` — no submission is manufactured, no approval invented, no
  `form_submissions` row written;
* the **exception record** carries who, when, why, and which requirements it covered;
* the transition is permitted by `excluded_transition_keys`, *not* by pretending the requirement was
  met;
* history reads: *"5 requirements were required; 2 satisfied; 3 outstanding; proceeded via authorized
  exception by X on date, reason Y."*

The one thing that must not be built is a "mark satisfied" shortcut — that is the failure mode this
whole section exists to prevent.

## 8. Can Certification V1 publish now? — **YES**

And the reason is precise rather than optimistic:

* The certification proves the **normal path**: paperwork → submitted → reviewed → approved.
* Authoring five `kind: form` requirements **cannot corrupt anything**, because the gate does not read
  them. Nothing gets falsely blocked and nothing gets falsely satisfied.
* Nothing in the configuration asserts *"every family must complete these"* — requirements record what
  is asked for; no transition is gated on them today.
* The absent Enrolling→Enrolled transition means the certification stops at *paperwork completed*,
  which is exactly what V1 set out to prove. Moving a child to Enrolled was never in scope.

**NO would only be right if publishing made a false claim.** It does not.

One caveat to state plainly rather than bury: because the gate ignores Forms, `enforcement: blocking`
on those five requirements is **aspirational today** — it describes intent, not enforced behaviour.
That is honest to record and is the first hardening slice.

## 9. Narrowest hardening sequence after certification

1. **Teach the transition preflight to read `kind: form` requirements.** One evaluator; the scoping,
   timing, enforcement and blocking machinery all already exist. This alone makes `blocking` true.
2. **Author Enrolling's exit paths** — the `enrolling_to_enrolled` transition and outcome rules Tour
   already demonstrates. Configuration, not code.
3. **Requirement exception record** — the D-H2 owner the platform already names: who, when, reason,
   which requirements, immutable. Unblocks the Nonmedical Exemption honestly.
4. **Per-outcome authorization** — let an exceptional outcome demand different authority and a
   mandatory reason than an ordinary one.

Steps 1–2 are small. Steps 3–4 are the real product work, and neither blocks V1.
