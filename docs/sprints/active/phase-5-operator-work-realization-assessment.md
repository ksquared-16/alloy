---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Operator Work Realization Assessment

**Mission:** `alloy-phase-5-product-realization` (slot 1) · **Baseline:** `origin/staging @ 2129149e9` (rebased; + this sprint's docs)
**Method:** realization review — not implementation. Document the product that already exists, prove one owner per
concept, isolate only genuine operator-experience gaps, and describe the Operator Work card as a **composition** of
existing capabilities. Grounded in code with `file:line` citations. Builds on the frozen-for-freeze doctrine in this
folder; it does **not** reopen it.

**Headline finding, up front:** the "Operator Work card" is not a thing to be invented. It already ships as
`CurrentWorkCard` (`current_work`) — the largest, most-developed card in the Focus Panel
(`web/components/admin/focusPanel/cards/CurrentWorkCard.tsx`, 874 lines). This mission **realizes an existing surface
by composing it with runtimes that already exist**. Every improvement below reuses a shipped capability; none requires
a new primitive. The recommendation is therefore eligible for **APPROVAL** under the mission's own rejection test.

---

## Part 1 — Current Product Composition (the composition map)

### 1.1 How a Subject becomes a Focus Panel

`openDrawer()` (`web/contexts/AdminDrawerContext.tsx`) selects a Subject → `AdminEntityDrawer.tsx:14` routes by grain
(`opportunity` → the enrollment Focus Panel; `person`/`child` → the person surface) → `OpportunityDrawerVmRuntime.tsx`
mounts the operating shell → `OpportunityFocusPanelModeBody.tsx:43` builds a source-agnostic `FocusPanelWorkModeModel`
→ `OpportunityFocusPanelModeGrid.tsx` renders each cell through `FocusPanelCardRenderer.tsx:83`. Every card binds to one
object: the **`OperationalContext`** (`web/lib/adminV2/runtime/operationalContext/types.ts:166`) —
`{ grain, subject, businessProcess, truth, signals{work,attention,tour,communications,billing}, stageWorkRuntime,
lifecycleRail }`. Cards are pure over that context; they never fetch on expand.

### 1.2 Ordered Summary composition (the operating surface)

The order is not hardcoded — it comes from a **published `LayoutDoc`**, falling back to the code default
`focusPanelSummaryDefaultGridLayout` (`web/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc.ts:32`,
re-encoding `SUMMARY_GRID` at `deriveOpportunityFocusPanelCards.ts:794`): **Current Work · Household · Children ·
Readiness · Tour · Communications · Documents**.

> Stale-comment flag: the doc block at `deriveOpportunityFocusPanelCards.ts:762-782` still claims a "Core Four" with
> Tour/Communications/Documents suppressed; the shipping grid includes all three. The code is authoritative.

### 1.3 Responsibility → owner (one owner per concept)

| Responsibility | Where it is realized | Owning runtime / capability |
|---|---|---|
| **Focus Panel composition** (which cards, in what grid) | published `LayoutDoc` → `FocusPanelCardRenderer` | **Presentation** — "Runtime commits Config's published composition." `entity-layouts/focus-panel-summary` API + Experience Builder |
| **Household card** (primary/secondary contact, identity, household relationships, emergency contacts) | `cards/HouseholdCard.tsx` · `buildHouseholdCardEvidence`+`buildIdentityCardVM` | Reads `context.truth` (Identity archetype); edits via injected `mutation` (person PATCH) |
| **Children card** (per-child roster, child identity, per-child emergency contacts) | `cards/ChildrenCard.tsx` · `buildChildrenCardEvidence` | Reads `context.truth._inquiry_children` |
| **Current / Operator Work card** (the active work item, checklist, outcome-completion, activity, stage transition) | `cards/CurrentWorkCard.tsx` (+`CurrentWorkWorkspace/ActionPanel/ActivityPreview/StageTransitionPanel`) | **Current Work Runtime** (`projectStageWorkRuntime`) via `context.stageWorkRuntime`+`signals.work`; completion via `useWorkIntentOutcomeCompletion` |
| **Action surface** (how commands are offered/launched) | workspace/work-unit **header control band** `WorkspaceHeader.tsx:241` → `WorkspaceRightRailActions.tsx`; plus each card's `primary_action` | **Command/Action Runtime** — `runRegisteredAction` (`actionExecutor.ts:126`), registry `actionRegistry.ts`, flow model `platform/commands/commandFlow.ts` |
| **Command flow** (define → launch → result) | `RegisteredAction` contract (`actionTypes.ts:165`); result `ActionResult` (`actionTypes.ts:107`) | **Command/Action Runtime** (one subsystem; "Action Runtime" = "Command Runtime") |
| **Readiness presentation** (is this ready / what's missing) | `cards/ReadinessCard.tsx` (factor checklist, hands off to owner card via `coordination`) + live `ActionEligibility` gate (`actionExecutor.ts:173`) | **Readiness** — `actionEligibility.ts` (live gate); `evaluateOperationalReadiness` (partial wrapper over `evaluateEffectiveRequirements`) |
| **Outcome presentation** (declare a result → consequences) | completion flow in `CurrentWorkCard` → `completeStageWorkWithOutcome.ts` → `executeStageOperatingOutcome.ts` → `stageOutcomeRuleTargetExecutor.ts` | **Outcome Runtime** (distinct from Command; in `lib/lifecycle/`) |
| **Scheduling** (is a tour booked / when) | `cards/TourCard.tsx` → opens existing tour modal via `ADMINV2_OPEN_TOUR_SCHEDULE_MODAL` | `context.signals.tour`; only registered tour command is `confirmTourAction` |
| **History** (what recently happened) | `cards/TimelineCard.tsx` | Presentational over `context.truth` |
| **Business Process** (stages, work templates, outcomes, rules) | `defaultEnrollmentStageOperatingPlans.ts` via `StageOperatingPlanV1` | **Business Process Runtime** — `lifecycleBuilderConfig.ts`, contract `stageOperatingPlanV1.ts` |
| **Adaptive presentation** (region roles, floating BOS, responsive states) | `web/lib/presentation/adaptiveWorkspace*.ts` + `web/lib/bos/*` | **Adaptive Workspace System** (permanent platform capability; do not fork) |

**Proof of single ownership:** every row has exactly one owner. The two places two owners *appear* today are named in the
prior doctrine as constitutional defects to remove, not to entrench (grain vocabulary; two outcome target-kinds). The
Focus Panel↔BOS relationship is peer regions under one ambient shell (`AdminV2Shell.tsx:216`), not nesting — so
"Operator Work" and "assistant" do not contend for the same owner.

---

## Part 2 — Product Gaps (genuine operator-experience problems only)

Missing implementation (e.g. "Offer Extended step doesn't exist", child-grain executor errors) is **not** listed as a
product gap. What follows are experience problems that persist even where the capability exists.

| # | What the operator experiences | Why it creates friction | Class |
|---|---|---|---|
| **P1 — The card doesn't move when reality does** | After sending a message or completing work, Current Work shows the old state until a reload. | Breaks the core promise "the surface reflects reality after each action." The operator distrusts the card and re-checks elsewhere. (Underlying: G2 — invalidate-without-reapply; no recompose dispatch.) | **workflow** (+ presentation) |
| **P2 — One intent, two surfaces** | Booking/rescheduling a tour happens in a modal; the stage only moves via a separate action. Two clicks in two places for one operator intent. | The operator mentally reconciles "I booked it" with "did the process advance?" Scheduling and progress read as unrelated. | **composition** |
| **P3 — No visible "why am I here"** | Opening a Subject drops the operator into cards without a stated Mission/Frame; the panel ships a temporary two-mode model with no distinct Summary + Frame. | The operator must assemble "what matters now / why" from Attention + Readiness + Current Work themselves — the exact assembly the card is supposed to remove. | **hierarchy** (+ presentation) |
| **P4 — Child-grain work forces a drop to the drawer** | For per-child steps the operator falls back to a legacy admin surface, and the child is not always named at the point of action. | Violates "one surface" and "the child is always named." The operator leaves the composed experience to finish the job. (Underlying: G1/R1 — subject not carried at declared grain.) | **composition** |
| **P5 — The same command behaves differently by entry point** | A command launched from the header, from a card's primary action, or from BOS can travel different paths (G3: five). | The operator's command vocabulary isn't uniform; behavior depends on where they clicked. | **information architecture** |

Everything else the exploration surfaced (unregistered capabilities, hardcoded `sent_text`/status mapping, absent Offer
step, no Attendance/Billing UI) is **realization debt**, correctly excluded from this list per the mission's rule.

---

## Part 3 — Existing Capability Reuse (per proposed improvement)

No proposal introduces a new primitive. Each maps to a shipped capability.

| Improvement (addresses) | Existing capability reused |
|---|---|
| **Live recomposition** — card re-projects after every action (P1) | **Current Work Runtime** (`projectStageWorkRuntime`), the existing invalidate/`onQueueUpdated` seam, and the existing `opportunity-updated` event bus. Re-apply the slice + dispatch recompose — no new store. |
| **Unify scheduling intent** (P2) | **Command/Action Runtime** (route Schedule/Reschedule/Cancel through registered actions) + **Outcome Runtime** (tour outcomes/domain signals already drive movement, per the Cancel-Tour pattern). Reuse the existing tour modal as the input surface. |
| **Mission / Frame** (P3) | **Existing card models** — `attention` (Why Now) and `current_mission` are already built in `buildCardModels` (`deriveOpportunityFocusPanelCards.ts:454`). Realize Summary mode (`focusPanelMode.ts`) + surface the Frame; compose existing models, invent no status object. |
| **Complete child-grain work in-panel; name the child** (P4) | **Current Work Runtime** + **Business Process Runtime** — carry the Subject at the stage's declared grain (constitutional refinement R1). The **Outcome Runtime** executor already requires it; this feeds it, not replaces it. |
| **One command path** (P5) | **Command/Action Runtime** — converge the five paths onto `runRegisteredAction`; present via the **Adaptive Workspace** header control band (`WorkspaceHeader` actionsSlot) already built for exactly this. |
| **Composition/order changes** | **Experience Builder** + published `LayoutDoc` (`entity-layouts/focus-panel-summary`). Composition is authored/published, never hardcoded. |
| **Readiness display & hand-off** | **Readiness** (`ReadinessCard` + `actionEligibility`) — already hands incomplete factors to the owning card via `coordination`. Reuse the hand-off; add no second readiness surface. |

**New-primitive justification required?** None. Every improvement is composition or wiring of an existing runtime. The
one net-new datum contemplated by the plan — a provenance *attribute* on the outcome fact (R3) — is explicitly "an
attribute of the fact, not a new fact kind." No new primitive is proposed; therefore no justification is owed.

---

## Part 4 — Realization Boundary (what will NOT change)

Confirmed, each with the reason it holds:

- **Household card remains intact.** `HouseholdCard.tsx` keeps ownership of contact identity, household relationships,
  and emergency contacts. Operator Work *references* it (and hands off to it) — never re-implements it.
- **Children card remains intact.** `ChildrenCard.tsx` keeps the per-child roster, child identity, and per-child
  emergency contacts. Child naming for work is threaded *through* the runtime to this card's grain, not duplicated.
- **Focus Panel architecture remains intact.** One universal panel; cards stay pure over `OperationalContext`;
  composition stays published via `LayoutDoc`. "One universal panel, never a second composition product."
- **Presentation Runtime remains intact.** Adaptive Workspace System and Presentation Runtime V2 are inherited, not
  forked. Actions stay in the header control band already provided.
- **Command Runtime remains intact.** `runRegisteredAction` + registry stays the one execution path; we converge onto
  it, we do not add a sixth.
- **Business Process Runtime remains intact.** Stages, work templates, outcomes, and rules stay authored in
  `StageOperatingPlanV1` config; runtime resolves, never hardcodes.
- **No new runtime.** Zero introduced.
- **No duplicate action system.** All commands route through Command/Action Runtime.
- **No duplicate readiness system.** `ReadinessCard` + `actionEligibility` remain the only readiness surfaces.
- **No duplicate status system.** Stage/queue membership stays runtime-derived from effective stage.
- **No duplicate work system.** `CurrentWorkCard` + Current Work Runtime remain the sole owner of "what to do next."

---

## Part 5 — Proposed Operator Work Card (as a composition)

> This describes the operator *experience* of the existing `CurrentWorkCard`, realized. No implementation detail.

**The question it answers:** *"For this Subject, what should I do right now — why, with what, and what happens when I
do?"* One card, no mental assembly.

**Information it OWNS:** the active Current Work contract for the attended Subject — the required work, its checklist,
the affordances (Commands) that discharge it, and the vocabulary of Outcomes that close it. It owns the **act of
declaring an outcome** and the **transition of the card's own state** on completion. Nothing else.

**Information it REFERENCES (never re-owns):**
- *Household* — whose family this is, and the contact to reach.
- *Children* — which child a child-grain step concerns (always named).
- *Tour/Scheduling* — the current booking state as context for tour work.
- *Communications* — outreach status feeding contact work.
- *Readiness* — whether the next step is ready or blocked, with the blocking factor handed to its owner card.
- *History/Timeline* — what already happened.

**How it coordinates with Household & Children:** through the **existing `coordination` hand-off** the Focus Panel
already uses — an incomplete factor or a checklist item routes the operator to the owning card
(`resolveWorkItemHandoff`, and Readiness→owner hand-off) rather than editing that data in place. Operator Work asks;
Household and Children answer. The child is carried at the stage's declared grain so the reference is unambiguous.

**How commands launch:** from one place conceptually — the **Adaptive Workspace header control band** presents the
available commands (registry-resolved), and the card's own `primary_action` offers the single most-relevant one inline.
Both travel the one Command/Action Runtime path, so a command means the same thing wherever the operator clicks it.

**How outcomes appear:** completing work is an **outcome declaration**, not a technical result. The operator chooses
from the authored Outcome vocabulary; the Outcome Runtime turns that judgment into consequences (movement, next work,
events) via authored rules. A command's objective Result may *discharge* a `direct_action` work item per config, but
`outcome_led` work always waits for the operator's declared Outcome.

**How completion changes the card:** on the same action, without a reconciling click, the card **recomposes live** —
the finished item closes, the next Current Work item appears, Readiness updates, and the Queue moves. The operator sees
reality change under their hand. This is the single behavior that makes the panel feel alive.

---

## Part 6 — Product Constitution Review

1. **Does this make the operator's work clearer?** Yes. It answers matters-now / why / what-can-I-do / what-happened /
   what's-next in one card instead of five, and removes the drop-to-drawer detour.
2. **Does it reuse existing platform capabilities?** Yes, exclusively — Current Work, Command/Action, Outcome, Business
   Process, Presentation/Adaptive Workspace, Readiness, Experience Builder, and the existing cards (Part 3).
3. **Does it preserve product simplicity?** Yes. Fewer surfaces (one card vs. card + modal + drawer), one command path,
   one readiness surface, one work surface. It subtracts detours; it adds no concepts.
4. **Does it avoid introducing parallel systems?** Yes. No new runtime, no duplicate action/readiness/status/work
   system; the only new datum is a provenance attribute, not a subsystem.
5. **Does it make Alloy feel more alive?** Yes. Live recomposition (P1) is precisely "the surface reflects reality after
   each action" — the difference between a form and an operating system.
6. **Could Scheduling, Billing, Attendance, Compliance, Staffing, and future domains reuse the same composition?** Yes.
   The card composes over the generic `OperationalContext` + Stage Operating Plans; nothing in it is enrollment-shaped.
   A new domain authors stages/work/outcomes in config and inherits the same Operator Work experience unchanged — which
   is the whole point of the frozen execution model.

---

## Required Output

### 1. Current composition map
Part 1. One owner per responsibility, all realized in code, all cited. The Operator Work card already exists as
`CurrentWorkCard`.

### 2. Product gaps
Part 2. Five genuine experience gaps (P1 recomposition, P2 two-surface scheduling, P3 missing Mission/Frame, P4
child-grain drop-to-drawer, P5 command-path dispersion). Realization debt deliberately excluded.

### 3. Reuse map
Part 3. Every improvement maps to a shipped capability; zero new primitives.

### 4. Realization boundary
Part 4. Household, Children, Focus Panel, Presentation/Command/Business Process runtimes intact; no new runtime; no
duplicate action/readiness/status/work systems.

### 5. Operator Work composition proposal
Part 5. Realize the existing `CurrentWorkCard`: owns the active work contract + outcome declaration; references
Household/Children/Tour/Comms/Readiness/History; commands via the header band + one runtime; outcomes via the Outcome
Runtime; completion recomposes live.

### 6. Risks
- **R-A · Recomposition correctness (P1).** If the re-apply/recompose is imprecise, the card lies more confidently than
  before. Mitigation: reuse the existing invalidation seam and event bus; treat "no reload" as an acceptance gate, not a
  nicety.
- **R-B · Child-grain is a prerequisite, not a nicety (P4).** The "one surface" promise stays broken until the Subject
  is carried at declared grain (R1). This is a constitutional refinement that must land before P4 can be claimed.
- **R-C · Mission/Frame drift into a status system (P3).** Realizing the Frame must compose the existing `attention` /
  `current_mission` models, not mint a new status object — or it becomes the parallel system the constitution forbids.
- **R-D · Command convergence (P5).** Presenting commands in the header while five paths still exist risks divergence.
  Converge onto `runRegisteredAction` as part of the work, not after.
- **R-E · Doctrine is `proposed`, not frozen.** This assessment builds on a proposed constitution; ratification is
  Kelly's act. Nothing here should be read as freezing it.

### 7. Product Office recommendation

**APPROVE (as a realization, not a redesign).**

The proposal introduces no new architectural concept, no new runtime, and no duplicate system, and it does not redesign
Household, Children, or any authoritative card — it **composes** them. It passes the mission's own rejection test on
every clause. The Operator Work card is realized by wiring the existing `CurrentWorkCard` to runtimes that already ship,
with the operator-visible payoff being live recomposition and the end of the drop-to-drawer detour.

**Recommended realization order** (all composition/wiring, matching the Reconciliation plan's first sprint):
1. **P1 live recomposition** — highest leverage, makes the panel feel alive, unblocks trust in every later slice.
2. **R1 child-grain subject** (prereq for P4) — the one correctness refinement the experience depends on.
3. **P4 child-grain completion in-panel** — closes the "one surface" promise.
4. **P3 Mission/Frame** — realize Summary + the visible "why am I here."
5. **P2 unify scheduling intent** & **P5 command convergence** — collapse the two-surface and multi-path seams.

No implementation begun. Awaiting review.
