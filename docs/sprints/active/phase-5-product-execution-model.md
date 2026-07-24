---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — The Product Execution Model

**Sprint:** `alloy-phase-5-product-realization` · **Baseline:** `origin/staging @ 1217f5c93` (+ this sprint's report commits)
**Method:** doctrine discovery — how the existing layers form one coherent execution system, traced through code, and
where realization still depends on vertical (childcare) assumptions. Read-only. No redesign. No implementation.

**The question:** how do Business Process · Stage · Current Work · Actions · Outcomes · Queues · Focus Panel · Work
Views · Configuration · Runtime become **one execution system** — and what remains to make that system fully
operational and industry-agnostic, so Enrollment is the *first* product, not the *only* one.

**Evidence:** `VERIFIED` = read in code/config on this baseline. `INFERRED` = reasoned, not executed.

---

## 0. The pattern already exists — and it is already named

The platform team has already articulated the generic pattern (`docs/sprints/archive/07_2026/process_instance_enrollment_materialization.md`, `VERIFIED`):

> **`Process Instance → Outcome → Materialize Durable Operational Facts`.** Platform speaks only generic language —
> *process, process_instance, subject, context, outcome, materialization, durable facts.* **Enrollment is the
> reference implementation of that pattern — not the pattern itself.** Childcare names live only inside
> `lib/childcareOperational/*`. The one deliberate platform→childcare touch point is the outcome executor calling
> the childcare materializer on the `enrolled` disposition, flag-gated and isolated.

This discovery **confirms that doctrine is real in the code** and finds where it is not yet finished. The finding
in one sentence: **the execution model's skeleton is industry-agnostic; the vertical assumptions that remain are
load-bearing in a few platform-level *types and vocabularies*, not in the *shapes*.** Runtime V1 is clean
(its only vertical mention is a comment using `enrollment` as an example URL slug). The scaffolding — tracks,
split-rules, work-view predicates, effective-stage membership, the opaque `ProcessTrackSubject`, the outcome
grammar's generic kinds, the domain-branch-free Current Work VM — is already generic. Realization is **finishing a
generalization the team started**, not inventing one.

---

## Deliverable 1 — The Product Execution Model

One record flows down one chain. Each layer below is given its **owner · responsibility · configuration ·
runtime · execution grain · industry-agnostic verdict**.

```
Business Process   the journey's shape           CONFIG (lifecycle_builder_v1)
      ↓
Stage              a position in the journey      CONFIG (stage_operating_plan_v1)
      ↓
Current Work       the active work here           RUNTIME projects CONFIG's work_templates
      ↓
Actions            capabilities to advance work    PLATFORM catalog · CONFIG selects · Process-Actions gate
      ↓
Outcomes           what the operator reports        CONFIG (outcomes/outcome_refs) · RUNTIME records
      ↓
Outcome Rules      what an outcome causes           CONFIG (outcome_rules→targets) · RUNTIME executes
      ↓
Stage Transition   earned, authored movement        CONFIG (outgoing_transitions) · RUNTIME move_to_stage
      ↓
Queue Membership   which lane the row joins         RUNTIME by effective stage · CONFIG (queue_membership_v1)
      ↓
Work Views         the operator's lens              CONFIG (work_views_v1) consumes membership
      ↓
Focus Panel        the committed surface            CONFIG (published composition) · RUNTIME commits
      ↓
Operational        durable facts the journey makes  PLATFORM pattern · VERTICAL materializes (childcareOperational)
Consequences
```

### 1 · Business Process
- **Owner / config:** the authored `lifecycle_builder_v1` (tracks, stages, `split_rules`, `work_views_v1`). Written only by the app, never by migration.
- **Responsibility:** defines the *shape* of the journey — which tracks (subjects) exist, which stages, how a record fans from one grain to another (`split_rules`).
- **Runtime:** read-only consumer; it never invents journey structure.
- **Execution grain:** the process spans grains via **tracks** — `ProcessTrackSubject` is an **opaque string** (`processConfigTypes.ts:9`, *"template defines meaning, e.g. family_case, payer_obligation"*). `VERIFIED generic.`
- **Verdict:** ✅ industry-agnostic in shape. Enrollment fills the tracks with `family_case`/`child_enrollment_track`; a healthcare process would fill them with `matter`/`claim` and nothing structural changes.

### 2 · Stage
- **Owner / config:** `stage_operating_plan_v1`, stored in `departments.metadata` (no DB schema). Authored per builder stage.
- **Responsibility:** everything that happens at a position — declares **grain**, **work_templates**, **outcomes**, **outcome_rules**, **outgoing_transitions**, **attention_rules**.
- **Runtime:** the plan is resolved and projected; the stage owns grain and movement (the frozen chain: Stage owns grain; Work Views consume it).
- **Execution grain:** the stage carries **three** grain fields (see §Grain) — this is where the model's one real vocabulary debt sits.
- **Verdict:** ✅ shape generic; ⚠️ the grain field *values* (`family`/`child`) and two target-kind *names* are vertical (§Grain, §Leaks).

### 3 · Current Work
- **What it IS (`VERIFIED`):** the **active work item(s) for a record at its current stage, projected one-per-`work_template`, hydrated against live `operational_tasks`, with one designated `primary`.** Projection = `projectStageWorkRuntime.ts`; presentation VM = `buildCurrentWorkSurfaceVM.ts` (explicitly *"no domain-specific branches in components"*).
- **Owner:** *config* owns *which* work (the stage's templates); *runtime* owns *the instances* (`operational_tasks`) and the projection.
- **How generated:** resolve the stage's operating plan → for each template, match/emit a `StageWorkItemProjection` (state `planned|open|completed`, its outcomes, completion policy).
- **How completed:** the operator **records an outcome** → `completeStageWorkWithOutcome` → `executeStageOperatingOutcome` → the outcome's rule targets fire. Recording an outcome *is* completion.
- **Inside vs outside (`VERIFIED`):** *Inside* — the checklist, the `primary_action`, the helpful actions, and outcome recording (the affordances to **do and finish** the work). *Outside* — process-owned "Other Transitions" (movement is separate from work), status-umbrella editors (explicitly pushed out), and the record drawer (a separate authority that only *falls back* into Current Work when config is silent). **The Process Instance is never operator-facing.**
- **Execution grain — the model's one correctness gap (`VERIFIED`):** the execution subject is built with only `{ journey_segment, opportunity_id }` (`projectStageWorkRuntime.ts:156-164`) — it does **not** carry the stage's grain subject id. But child-grain outcome execution *requires* one (`stageOutcomeRuleTargetExecutor.ts:107-112` → *"Could not resolve child…"*). So **Current Work can generate a child-grain work item it cannot itself complete.** This is a *generic* defect (the engine must carry the subject id for any non-root grain) that surfaces as childcare because child is the first non-root grain.
- **Verdict:** ✅ mechanism and VM generic; ⚠️ the config→runtime **subject-identity contract is under-specified** — the highest-leverage realization item.

### 4 · Actions
- **Where defined (`VERIFIED`) — five authorities, layered:** (1) the **canonical action registry** — the platform capability catalog (category, placement, executor, required context); (2) the **action button library** (operator settings); (3) **`action_definitions` / `action_placements`** in the DB — the **Process-Actions ON/OFF** authority; (4) **work_template refs** (`primary_action` / `helpful_actions`) — which action surfaces *here*; (5) **automation** (outcome-rule targets) — non-interactive execution.
- **Canonical model (as it should resolve):** the **registry defines the capability**, **Process Actions gates availability** (org-level ON/OFF), the **work template selects surfacing** (which capability leads / helps at this step). One capability, one availability gate, one surfacing selection.
- **The debt (`VERIFIED`, M1-A):** Current Work's helpful actions resolve from **two competing authorities** — work-template config, *or* a placement-derived fallback when config is silent — and the fallback's guard **degrades to "allow all" when the stage action catalog is empty** (`classifyCurrentWorkActions.ts:95-104`). Absent work-template authority is overridden by placement authority, backstopped only by a name-based umbrella filter.
- **Industry-agnostic (`VERIFIED`):** the registry **shape** is generic; the **contents are ~60% childcare-named** (`schedule_tour`, `send_enrollment_packet`, `enroll_child`) rather than generic primitives parameterized by config. `send_form` and `quick_message` are the proof the generic pattern works — `schedule_tour` should be `schedule_appointment(type)`.
- **Verdict:** ⚠️ shape generic; **dual authority** and **vertical catalog contents** are realization debt.

### 5 · Outcomes → 6 · Outcome Rules → 7 · Stage Transition
- **Outcomes (config):** what the operator can report at a step (`outcomes`, scoped to a template by `outcome_refs`). `successful`/`completes_work` flag which outcome closes the item. Purely declarative.
- **Outcome Rules (config → runtime):** `when_outcome_key | when_enter_status_key | when_domain_signal → targets[]`. Three trigger types, all industry-neutral. Executed by `stageOutcomeRuleTargetExecutor.ts` (self-titled *"generic executor"*).
- **Target kinds (`VERIFIED`):** 6 generic (`no_movement`, `mark_stage_work_complete`, `move_to_stage`, `create_next_work`, `reopen_work`, `create_needs_attention`); `update_family_case_status` is generic-but-named (updates `opportunities.status_key`); **`update_child_enrollment_status` and `update_candidate_status` are childcare-specific kinds** in the platform enum, with the enrollment materializer imported behind the one flag-gated seam.
- **Stage Transition (`VERIFIED`):** movement is **earned by an outcome and references an authored `outgoing_transition`** (`move_to_stage` via `transition_ref`) — never raw destination text, on the new path. This is the correct model; the debt is a surviving **legacy raw-destination fallback** and two **dangling targets** in the reference config (the M1-C / journey-report findings).
- **Ownership per link:** *what the operator can report* = config · *what an outcome causes* = config · *executing the cause* = runtime · *the movement graph* = config · *walking it* = runtime.
- **Verdict:** ✅ the Action→Outcome→Rule→Transition→Consequence chain is the model's strongest, most generic spine; ⚠️ two grain-named target kinds + the legacy movement fallback are the debt.

### 8 · Queue Membership
- **Owner / runtime (`VERIFIED`):** membership is resolved **by effective stage** (`process_instances.stage_key ?? context.stage_key`), **persisted, not status-derived** — a protected invariant. `count_unit` rides on the stage's `queue_membership_v1`.
- **Verdict:** ✅ mechanism generic; ⚠️ `subject_type`/`count_unit` value enums (`candidate`, `enrollment_tracks`) are vertical.

### 9 · Work Views
- **Model (`VERIFIED`): hybrid.** The template *generates* an initial set; thereafter Work Views are **authored per-process as predicate + sort + layout**, default include-all, with grain **derived from the stages they scope** (not authored on the view). A Work View is *a lens (predicate), not a container of stages.*
- **Relationship:** Business Process → Stages (declare grain) → Stage Membership → **Work View = the lens** → projection → rows/counts/focus-eligibility.
- **The single-grain limit (`VERIFIED`) — answers the mission's "All Leads" test:** the runtime surface assumes **exactly one grain per Work View/queue** (`queue_grain` and `count_unit` are single-valued; a view binds one lane via `compat_queue_key`). Config *permits* a predicate-only include-all view that doesn't inherit stage grain, but **no runtime path aggregates *different* grains into one view** — the system tells the operator to split, or use same-case grouped rows. So *"All Leads should not require every record to have the same grain"* is **not satisfied at runtime today.**
- **Queue Lanes:** still **live** as the single-grain binding target (`compat_queue_key`). The *"Queue Lanes are not a product concept / should disappear"* verdict is `status: proposed` — aspiration, not current code.
- **Verdict:** ✅ authored-lens model generic; ⚠️ **single-grain projection** and the **live queue-lane binding** are realization debt.

### 10 · Focus Panel
- **Owner / runtime (`VERIFIED`):** the **published Summary composition committed *with* the surface** inside the one provisioning answer (Runtime V1). Universal; re-led by the Context Frame; the org's custom composition renders with zero engineering.
- **Verdict:** ✅ industry-agnostic by construction (Runtime V1 constitutional decision #2). Debt is the M5 mode/Frame realization (separate report), not the execution model.

### 11 · Operational Consequences
- **Pattern (`VERIFIED`):** the journey's terminal outcome **materializes durable operational facts** — the generic pattern. For enrollment (the reference implementation, under `lib/childcareOperational/*`): `child_enrollment_agreements → child_placements → schedule_assignments`, consumed by Attendance/Billing (which read the **agreement, never the process instance**).
- **Verdict:** ✅ the pattern is generic and correct; ⚠️ the platform→vertical call is a **flag-gated direct import** with a **deferred clean event-driven split** already designed but not built.

### The boundary — the answer to "what is configurable vs platform vs runtime"

| Tier | What lives here | Examples |
|---|---|---|
| **Platform invariant** (never configured, never per-vertical) | the *pattern*: the chain above; the kernel lifecycle (Attention→Provisioning→Commit→Settlement); the **generic outcome target-kind grammar**; persisted-membership-by-effective-stage; **movement references authored transitions**; one-owner-per-responsibility; count-is-settlement | `lib/runtime/*`, the generic half of `lib/lifecycle/*`, `lib/process/*` |
| **Configuration** (per-org, authored) | the *specific journey*: stages, grain assignments, work templates, actions selected, outcomes, outcome_rules, transitions, work views, published Focus Panel composition | `lifecycle_builder_v1`, `stage_operating_plan_v1`, published composition, queue defs |
| **Runtime** (executes) | projection, provisioning, commit, outcome execution, membership resolution, warm caching | `projectStageWorkRuntime`, `stageOutcomeRuleTargetExecutor`, `resolveQueueMembership`, the kernel |
| **Reference implementation** (a vertical package, *not* the platform) | the domain's consequences and vocabulary — the durable facts a completed journey makes, and the domain nouns | `lib/childcareOperational/*` (agreement/placement/schedule/attendance/room/program) |

**The doctrine in one line:** *Platform owns the pattern; Configuration owns the process; Runtime executes it;
the Vertical owns only the durable consequences and its nouns.* The execution model is complete when **every layer
obeys that line** — today three layers still carry vertical vocabulary in the platform tier.

### The Grain model (canonical, as it exists)

Three grain fields coexist on the stage, and they are genuinely **distinct axes** (`VERIFIED` — the seed proves they diverge):

| Axis | Field · owner | Means | Example divergence |
|---|---|---|---|
| **Row Grain** | `StageGrain` · stage | what one queue **row** represents | `waitlist` and `enrolling` are both `child`… |
| **Record of Attention** | `subject_type` + `count_unit` · stage | the underlying **entity the row counts** | …yet resolve to **candidate** vs **child/OCM** — one row-grain, two records |
| **Journey Segment** | `journey_segment` · operating plan | **who the work is performed with** | `enrolling` is row-grain `child` but journey_segment `family` |

Family / Child / Lead / Case / Household coexist in one process via **tracks + split_rules**: the **Case grain *is*
the family/household** (`opportunities`); a child rides as a **member of the family record** while on the family
track, and becomes a **first-class subject** only after the `decision` split fans it into the child track. This is a
sound, generic mechanism — **the leak is only that the field *values* are a closed childcare enum**, where
`ProcessTrackSubject` shows the generic form (an opaque, config-defined identifier). **Canonical projection today
is single-grain**; multi-grain aggregation ("All Leads" across grains) is unbuilt.

---

## Deliverable 2 — Remaining Realization Work

Only realization — not Runtime, not Platform redesign. Each item **finishes the generalization already begun**;
none reopens a frozen decision. Ordered by leverage.

**R1 · The Subject-Identity Contract (grain-general execution).** Make the config→runtime execution subject carry
the **stage's declared grain subject id** (whatever the grain), threaded through projection → Current Work → outcome
executor → actions. *Fixes the "Could not resolve child" class; makes the engine grain-general rather than
family-plus-a-child-special-case.* This is the single highest-leverage item — it is what makes Current Work
able to complete the work it generates. (Generic framing of M4/M1-B.)

**R2 · Generic Outcome Grammar.** Replace the grain-specific target kinds (`update_child_enrollment_status`,
`update_candidate_status`) with a generic **`update_subject_disposition(grain, disposition)`** kind, and move the
domain consequence (materialization) to an **event subscriber on disposition-changed** — the clean split the team
already designed and deferred. *Result: the outcome executor becomes fully generic; verticals subscribe, they are
not imported.*

**R3 · Config-defined Grain & Action Vocabulary.** Turn the closed grain enums (`journey_segment`, `StageGrain`
values, `subject_type`, `count_unit`) into **config-defined identifiers** the way `ProcessTrackSubject` already is,
and reframe the childcare-named action catalog as **generic primitives parameterized by config**
(`schedule_appointment(type)` not `schedule_tour`). Move `family`/`child`/`candidate` labels into the enrollment
reference config. *Result: a non-enrollment process can be authored without touching platform types.*

**R4 · Multi-grain Projection & Work Views.** Extend the canonical projection so a **Work View aggregates records of
different grains** ("All Leads"), and decouple Work Views from single-grain compat queue lanes. *Result: the
operator's lens is a true lens, not a single-grain queue alias.*

**R5 · Canonical Action Authority.** Collapse the dual authority to one chain — registry defines, Process Actions
gates, work template surfaces — and retire the placement-derived fallback so a disabled capability is gone
everywhere. (Generic framing of M1-A.)

**R6 · Movement Integrity.** Retire the legacy raw-destination fallback and repair the dangling targets, so movement
**always** references an authored transition. (Generic framing of M1-C + the reference-config repair.)

**R7 · Reference-Implementation Containment.** Move the ~21 enrollment-named modules in `lib/lifecycle/*` and the
enrollment-only default-plan bootstrap behind the `lib/childcareOperational/*` boundary the doctrine already
declares, and provide a **generic default-plan bootstrap** so the platform can start a non-enrollment process.

*Not in scope (correctly): Runtime, the kernel, the Focus Panel composition model, the materialization pattern —
all frozen and generic. This is vocabulary, contract, and containment work, not architecture.*

---

## Deliverable 3 — Engineering Roadmap (waves to complete the execution model)

Organized around **completing the execution model**, dependency-ordered — not around product missions. Each wave is
validated by the industry-agnostic test *and* proven by executing a process in the certification environment (M7).

### Wave 1 — The Subject Contract
**Objective:** the execution model executes against any grain.
**Work:** R1 (thread the stage's grain subject id end-to-end).
**Depends on:** the certification environment (to prove it).
**Outcome:** Current Work completes the child-grain (and any-grain) work it generates; no "resolve subject" errors.
*This wave alone converts the model from "family + a child special case" to "grain-general."*

### Wave 2 — The Generic Outcome Grammar
**Objective:** the outcome executor owns no vertical vocabulary.
**Work:** R2 (`update_subject_disposition` + event-subscriber materialization split).
**Depends on:** Wave 1 (subject identity is the event key).
**Outcome:** the platform→vertical import is gone; consequences are subscribed, not imported.

### Wave 3 — Config-defined Vocabulary
**Objective:** a non-enrollment process can be authored without editing platform types.
**Work:** R3 (grain identifiers config-defined; action primitives parameterized) + R7 (contain the reference package; generic bootstrap).
**Depends on:** Waves 1–2.
**Outcome:** the second vertical (or a bare generic process) configures on the same engine — the industry-agnostic test passes structurally, not just in shape.

### Wave 4 — Multi-grain Projection
**Objective:** the operator's lens spans grains.
**Work:** R4 (multi-grain Work View aggregation; decouple from single-grain lanes).
**Depends on:** Wave 3 (config-defined grain identifiers to aggregate over).
**Outcome:** "All Leads" works across grains; Work Views become the navigation tier the doctrine intends.

### Wave 5 — Single Authority for Action & Movement
**Objective:** actions and transitions each have exactly one authority.
**Work:** R5 (canonical action authority) + R6 (movement references authored transitions only).
**Depends on:** Wave 1 (actions execute against the subject); can parallel Wave 4.
**Outcome:** a disabled capability is gone everywhere; a dangling target is unauthorable — the execution model is
trustworthy end-to-end.

**At the end of Wave 5** the Product Execution Model is complete: a configured Business Process of *any* grain
composition, in *any* vertical, executes the full chain — Current Work → Actions → Outcomes → Transition → Membership
→ Work Views → Focus Panel → durable Consequences — with no vertical assumption in the platform tier, proven by
executing a non-enrollment process on the same engine.

---

## Industry-agnostic test — where realization still leans on childcare

| Assumption (in the **platform** tier, not the vertical package) | Location | Realization item |
|---|---|---|
| `journey_segment = "family" \| "child"` (closed enum in a platform type) | `stageOperatingPlanV1.ts:28` | R3 |
| Grain-specific target kinds `update_child_enrollment_status`, `update_candidate_status` | `stageOperatingPlanV1.ts:129-137`; executor `:107-193` | R2 |
| Execution subject omits the grain subject id → child work errors | `projectStageWorkRuntime.ts:156-164` | R1 |
| Action catalog contents ~60% childcare-named (not generic primitives) | `actionDefinitionRegistry.ts`, `canonicalActionRegistry.ts` | R3 |
| `LIFECYCLE_PLATFORM_ACTIONS` scoped `allowedBusinessProcesses: ["enrollment"]` | `canonicalActionRegistry.ts:186-277` | R3/R7 |
| Default operating plans return null for non-enrollment | `defaultEnrollmentStageOperatingPlans.ts:862` | R7 |
| Runtime assumes one grain per Work View | `lifecycleSubjectContracts.ts:286`; `workViewsRuntimeConvergence.ts` | R4 |
| Dual action authority (placement fallback overrides absent config) | `buildCurrentWorkSurfaceVM.ts:416-429` | R5 |
| Materialization imported (not subscribed) across the one seam | `stageOutcomeRuleTargetExecutor.ts:23-28` | R2 |

**Everything else passes.** Tracks, split-rules, effective-stage membership, the outcome-rule trigger grammar, the
work-view predicate model, the Focus Panel composition, the materialization pattern, and the whole Runtime kernel
are already industry-agnostic. The remaining coupling is **vocabulary and contract**, concentrated in four files —
not architecture. Enrollment is wired as the first implementation; three of its assumptions merely reach one layer
too high, into platform types, and pulling them down is realization, not redesign.

---

**Discovery complete. No implementation begun. Awaiting review.**
