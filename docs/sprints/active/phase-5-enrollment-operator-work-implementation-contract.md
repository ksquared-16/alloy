---
owner: product
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Enrollment Operator Work: Implementation Contract

**Mission:** `alloy-phase-5-product-realization` (slot 1) · **Baseline:** `origin/staging @ 2129149e9`
**What this is:** the final Product Office pass before implementation — the clean product mock lives in
[phase-5-enrollment-realization-mockups.html](phase-5-enrollment-realization-mockups.html); this document is the
**implementation contract and configuration appendix** that must never appear in the UI. Vocabulary sources are derived
in [phase-5-enrollment-vocabulary-derivation.md](phase-5-enrollment-vocabulary-derivation.md).

> **The build target** is [phase-5-enrollment-focus-panel-target.html](phase-5-enrollment-focus-panel-target.html) —
> one polished Current Work screen on the real Focus Panel shell (Digan Family header, Open / North Campus chips, BOS,
> Manage, Work / Activity tabs) plus six behavior states. It converges the runtime-first baseline and the task-list
> concept: **obligation-first, but the runtime's readiness is kept** and rendered as **"Ready to continue ✓ / Still
> needed •"** — no meters, no percentages, no `n/m complete`, no giant requirements/outcome sections, no "Open
> Workspace". The Current Work information hierarchy Engineering implements: **(1)** one-sentence obligation → **(2)**
> one primary action (secondaries subordinate) → **(3)** one-line why → **(4)** readiness/blockers *only if relevant*,
> as Ready-to-continue / Still-needed (blockers name the missing fact + a resolve link, primary shown-but-disabled) →
> **(5)** previous activity *only if it helps* (a single settled line, not a feed) → **(6)** waiting = calm
> ("Nothing needs your attention" + what Alloy awaits + the automatic next step) → **(7)** completion = quiet settle
> ("Done." then the next obligation; no reload, toast, or celebration). Multi-child groups as **Priority / Also active
> / Completed**, each item naming its child; Children still owns identities/ages/statuses and is never duplicated. The
> readiness summary in Current Work is the distilled view of the Required Information runtime (same source, not a second
> list). Everything else in this contract — components, runtime inputs, state model, prioritization, grain, command,
> outcome, recomposition, and the Appendix A/B/C — stands unchanged and governs the build.

**Language rule honored:** the prohibited configured labels ("Placement / Decision", "Offer spot", and the invented
"Offer"/"Extend Offer"/"Enrollment Offer"/"Placement") are treated as **naming defects**. They are **not rendered** in
the mock, and none of the ten states requires the decision stage or the waitlist action. Where the specification must
name them, it uses **placeholders** — `[DECISION STAGE LABEL]`, `[WAITLIST ACTION LABEL]` — pending Product Office
approval of the proposed renames in Appendix B. No final rename is adopted silently.

---

## Appendix A — Current configuration defects

**A1 · Prohibited labels currently configured**
| Configured label | Where | Defect |
|---|---|---|
| **"Placement / Decision"** (stage `decision`) | `enrollmentProcessTemplate.ts:27` | operator-facing stage name uses prohibited "Placement". Rename required → `[DECISION STAGE LABEL]`. |
| **"Offer spot"** (work template `offer_spot`, stage `waitlist`) | `defaultEnrollmentStageOperatingPlans.ts:440-441` | operator-facing action uses prohibited "Offer". Rename required → `[WAITLIST ACTION LABEL]`. |
| **"Spot offered"** (outcome, stage `waitlist`) | `defaultEnrollmentStageOperatingPlans.ts:448` | outcome of the above; rename in lockstep → `[WAITLIST OUTCOME LABEL]`. |

**A2 · Missing labels** — actions referenced with no configured operator label (humanized fallback only):
`send_confirmation`, `send_reminder`, `reschedule` (`defaultEnrollmentStageOperatingPlans.ts:192-194`). `reschedule`
also mismatches the catalog key `reschedule_tour`.

**A3 · Missing work** — the `enrolling` stage has exactly one configured work template ("Send Enrollment Packet").
There is **no** configured work for the required-information items (Classroom, Schedule, Enrollment Start Date). Those
are satisfied via the record / forms, surfaced by the **Required information** card — not by Operator Work items. This
is acceptable *if* Operator Work reads readiness; it is a gap only if the product wants an explicit "assign classroom"
work item (a Product decision — see B).

**A4 · Missing outcomes** — none blocking; the configured outcome sets are complete for the stages with work.

**A5 · Missing terminal command / transition** — there is **no configured terminal "enroll" command** in the
`enrolling` plan. Completion is the outcome **"Packet sent"** (`:401`), which does **not** move the child to
`enrolled`. `enroll_child` / intent `enroll_subject` ("Enroll") exist only as **catalog metadata**, unwired. So today
an operator cannot move a child from Enrolling to Enrolled from Operator Work. **This is the one behavior gap that
blocks the mock's states 07/10** and needs a configured completion command + transition.

**A6 · Vocabulary/product mismatches** — three parallel stage vocabularies (example 8-stage template · `@deprecated`
V1 granular · progression-doctrine), and a dangling `qualification` transition in the granular `contacting` plan
(`:611`). The 8-stage template was the seed Firefly started from — an optional example, not doctrine; the granular plans are non-live. Stages are configured per process and per tenant. Reconciling to one set is
required so readiness (keyed to progression stages like `enrollment`) maps cleanly to template stages like `enrolling`.

---

## Appendix B — Required configuration changes

Each row: current → proposed operator label → consuming surface → change class. **Every rename is marked
`⟨APPROVAL⟩` and must not be finalized without Product Office sign-off.**

| # | Current label / key | Proposed operator label | Surface that consumes it | Class |
|---|---|---|---|---|
| B1 | stage `decision` = "Placement / Decision" | **"Decision"** `⟨APPROVAL⟩` | Focus Panel stage indicator; Work View names | **config-only** |
| B2 | work `offer_spot` = "Offer spot" | **"Invite to enroll"** `⟨APPROVAL⟩` | Operator Work item title; command label | **config-only** |
| B3 | outcome `spot_offered` = "Spot offered" | **"Invited"** `⟨APPROVAL⟩` | outcome declaration; timeline | **config-only** |
| B4 | `send_confirmation`, `send_reminder` (no label) | **"Send confirmation"**, **"Send reminder"** `⟨APPROVAL⟩` | Tour helpful actions | **config-only** (add catalog labels) |
| B5 | `reschedule` (bare) → catalog `reschedule_tour` = "Reschedule tour" | **"Reschedule tour"** `⟨APPROVAL⟩` | Tour helpful action | **config-only** (fix key reference) |
| B6 | Enrolling completion = outcome "Packet sent" only | add a configured completion command **"Enroll"** `⟨APPROVAL⟩` + a `move_to_stage: enrolled` transition gated on Required information | Operator Work primary action at Enrolling when ready | **runtime + config** (needs a registered handler + transition rule) |
| B7 | three stage vocabularies + dangling `qualification` | converge to the example 8-stage template set; remove `qualification` reference | queue membership, operating-plan lookup, readiness mapping | **config + light runtime** (reconciliation) |

Renames B1–B5 are **configuration-only** (edit labels in the stage operating plans / action catalog). B6 and B7 need
**runtime work** (a completion command + transition; vocabulary convergence). Nothing here requires new architecture.

---

## Appendix C — Derivation contract (out of the UI)

```text
active process subject
+ configured stage                (canonical enrollment stage the subject occupies)
+ active Current Work              (projectStageWorkRuntime → StageWorkItemProjection[])
+ readiness                        (Required information factors + actionEligibility gate)
+ registered command eligibility  (runRegisteredAction eligibility for the stage's actions)
+ configured outcomes             (the stage work template's outcome vocabulary)
+ canonical record truth          (Household / Children / record facts, referenced not restated)
= Operator Work presentation
```

The card is **always** this composition. It is never a per-stage bespoke screen; each state in the mock is the same
derivation with different configured inputs.

---

## Implementation-ready specification

### Components to reuse (no new ones)
- **`CurrentWorkCard`** (`web/components/admin/focusPanel/cards/CurrentWorkCard.tsx`) + `CurrentWorkWorkspace`,
  `CurrentWorkActionPanel`, `CurrentWorkActivityPreview`, `CurrentWorkStageTransitionPanel`.
- Focus Panel shell & grid: `OpportunityFocusPanelModeGrid`, `FocusPanelCardRenderer`, `FocusPanelCardGrid`, the
  published `LayoutDoc` (`entity-layouts/focus-panel-summary`).
- Right-column cards unchanged: `HouseholdCard`, `ChildrenCard`, `ReadinessCard` (Required information).
- Commands: header control band (`WorkspaceHeader` actionsSlot → `WorkspaceRightRailActions`) and the item primary
  action, both via `runRegisteredAction` (`actionExecutor.ts`).
- Outcome completion: `useWorkIntentOutcomeCompletion` → `completeStageWorkWithOutcome` → `executeStageOperatingOutcome`.

### Runtime inputs (the derivation, concretely)
`OperationalContext` (`operationalContext/types.ts:166`): `subject`, `businessProcess`, `truth`,
`signals{work,attention,…}`, `stageWorkRuntime`. Work items: `StageWorkItemProjection` (`stageWorkRuntimeTypes.ts`).
Readiness: `ReadinessCard` evidence + `ActionEligibility`. Commands: `RegisteredAction` + `ActionResult`.

### Card state model (one card, five presentations)
`active` (≥1 open obligation) · `blocked` (primary obligation gated by eligibility/readiness) · `waiting` (no open
obligation but the subject is progressing / awaiting external) · `settled` (an obligation just completed — quiet) ·
`empty/terminal` (no work; e.g. Enrolled). The mock's 10 states are instances of these five.

### Prioritization rules
1. Exactly one **primary** item — the stage's `primary` work template, else the most-overdue required item.
2. Required work outranks helpful/optional work.
3. Overdue outranks on-time; child-grain items sort under the primary by due urgency.
4. Completed items settle **below** the current primary and never outrank open work.
5. Items with no obligation (e.g. an Enrolled child) do **not** appear.

### Family-grain vs child-grain behavior
- Before the split (`lead`/`tour`/`[DECISION STAGE LABEL]`), work is **family-grain**: the subject is the household
  case; items are not child-named.
- After the split, work is **child-grain**: each item names its child (`subject`), and the child id is carried at the
  stage's declared grain (Engineering R1). A household may hold both grains at once (mock state 05) — each item is
  self-labeling by subject; **no grain chip is shown** because the child name (or its absence) already carries it.

### Command launch & return
- Appears in exactly two places: the Focus Panel **header/command surface** and the work item's **primary action**.
- Launch = the existing Command Runtime flow (resolve → preview → confirm → execute); rich input may use an existing
  referenced surface (e.g. tour modal). **No card-specific command system.**
- Return = the result flows through the recomposition contract below. Command **keys and runtime terms are never shown**
  (operator sees "Send enrollment packet", not `send_form`).

### Outcome behavior
- `direct_action` work: a sufficient command result may **discharge** the item per config (e.g. an integrated send →
  "Left message"); the operator is not asked to re-declare.
- `outcome_led` work: the operator **declares** an outcome from the configured vocabulary (mock state 04); the Outcome
  Runtime applies authored consequences. The operator reports a result; they never assert a stage move.

### Recomposition & refresh contract
On a successful command/outcome, **only affected regions** recompose: the completed item settles quietly; the next
obligation appears; this subject's readiness updates; the timeline gains an entry; queue membership moves **iff** the
outcome's rule moves the stage. **Hold stable:** Household, Children identity, and every card not downstream of the
outcome — they recompose **only if their underlying truth changed**. **Guarantee:** same action, **no page reload**, no
celebratory clutter. If nothing downstream changed, the item settles and the card states the wait (mock state 09).

### Loading / error / empty states
- **Loading:** the card reveals atomically once the runtime is ready (existing `ready` gate) — no per-item spinners.
- **Error:** a failed command shows a **plain-language** message and leaves the obligation open and retryable; **no raw
  technical errors, no command keys**. A blocked precondition is a *reason* (mock 07), not an error.
- **Empty:** the calm settled state (mock 10) — never a blank void or a fake task.

### Narrow-screen behavior
Inherit the Adaptive Workspace presentation states. Below the two-pane floor, the right column (Household / Children /
Required information) collapses beneath Operator Work; Operator Work stays the top, full-width primary region. No
separate mobile layout is authored — the adaptive shell governs it.

### Configuration changes required before/during implementation
- **Before:** approve renames B1–B5 (config-only) so no invented terminology is needed.
- **During:** B6 (Enrolling completion command + transition) and B7 (vocabulary convergence) — these are the two
  behavior/config items the experience depends on; they can land as their own slices but must land for states 07/10 to
  be truthful.

### Explicit non-goals
- No redesign of Household, Children, Required information, the Focus Panel shell, or the Presentation/Command/Business
  Process/Outcome runtimes.
- No new runtime, no card-specific command system, no duplicate readiness/status/work model.
- No post-enrollment busywork; Attendance/Billing own what follows enrollment.
- No new vocabulary invented at implementation time — every operator label comes from configuration (renamed via
  Appendix B where defective).

---

## Final decision

### NEEDS PRODUCT DECISIONS

The **experience, hierarchy, and behavior are implementation-ready** — the composition, prioritization, grain rules,
command law, and recomposition contract above are complete, and the mock proves them without clutter. But Engineering
**cannot build without inventing terminology or behavior** until a **bounded, enumerated set of Product decisions** is
made — and the instruction is explicit that pending renames disqualify a READY verdict:

1. **Approve the label renames B1–B5** (esp. `[DECISION STAGE LABEL]` and `[WAITLIST ACTION LABEL]`). Until approved,
   the operator words for the decision stage and the waitlist action do not exist in a non-defective form.
2. **Decide B6** — add a configured **"Enroll"** completion command + `enrolled` transition gated on Required
   information. Without it, no operator can complete enrollment from the card (states 07/10 are otherwise un-buildable
   truthfully).
3. **Decide A3/B7 scope** — whether Enrolling needs explicit "assign classroom/schedule" work items or keeps them as
   Required-information factors, and confirm convergence to the example 8-stage template vocabulary.

These are **decisions, not open design** — each has a proposed answer above awaiting a yes/no. Once 1–3 are signed off,
this contract becomes **READY TO IMPLEMENT** with no further product input. Nothing else in the experience is unresolved.

No implementation begun. No code written.
