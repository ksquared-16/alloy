---
owner: product
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Operator Work: Engineering Handoff

**Mission:** `alloy-phase-5-product-realization` (slot 1) · **Baseline:** `origin/staging @ 2129149e9`
**This is the single handoff** from Phase 5 Product Office to Engineering. It consolidates the approved direction; it is
not a mockup and introduces no new product. Supporting references (do not re-litigate): the build-target screen
[phase-5-enrollment-focus-panel-target.html](phase-5-enrollment-focus-panel-target.html); vocabulary sources
[phase-5-enrollment-vocabulary-derivation.md](phase-5-enrollment-vocabulary-derivation.md); prior contract
[phase-5-enrollment-operator-work-implementation-contract.md](phase-5-enrollment-operator-work-implementation-contract.md).

**One-line scope:** evolve the existing `CurrentWorkCard` from a runtime-first progress container into an
obligation-first operational card, **by composition and presentation only** — no new runtime, work, command, readiness,
or card system. The card answers: **“What needs to happen for this family or child right now?”**

**Load-bearing finding from code inspection (§10):** `CurrentWorkCard.tsx` is **already presentation-only** — no
enrollment vocabulary and no `stage_key`/`status`/`journey_segment` string branches; every business label comes from the
view model. The derived model (`CurrentWorkSurfaceVM`) already exposes title, description, subject, bucketed actions,
outcomes, readiness (requirements complete/total/remaining/items), and last activity. So this is **less "build a derived
model" and more "re-present the model we have, remove the progress-meter framing, and close the recomposition gap."**

---

## 1. Approved product behavior

The card renders a **conditional** hierarchy; **empty sections do not render**:
1. **Current obligation** — one sentence.
2. **Why it matters** — one line.
3. **Primary action** — one obvious button.
4. **Relevant secondary actions** — subordinate.
5. **Readiness or blocker** — only when useful; as *Ready to continue ✓ / Still needed •*, or one clear blocker. **No
   progress percentages or completion meters** (remove the current `SurfaceProgress` "N of M requirements complete" +
   `%` bar) unless a future work type's operational meaning *is* progress.
6. **Relevant prior activity** — only when it helps; a single settled line, not a feed.
7. **Waiting / settled** — calm when no action is required; no fake busywork.

Commands appear in exactly two operator places: the Focus Panel **Manage/header** surface and the Current Work **primary
action** — the same registered capability, one contextual placement, not a duplicate. Multi-child groups as **Priority /
Also active / Completed**. Household and Children remain authoritative and are never duplicated.

## 2. Derivation contract (non-negotiable)

Visual anatomy may be code-owned. **All business content is runtime-derived.** No visible business noun, verb,
requirement, outcome, command, status, or automation fact may be hardcoded in `CurrentWorkCard` or in any
enrollment-specific presentation branch.

```text
active process subject
+ configured Business Process and stage
+ active Current Work items          (StageWorkItemProjection)
+ work-template configuration         (StageWorkTemplateV1: label, description, execution_mode, action_refs, outcomes)
+ registered command resolution       (RegisteredAction + placement)
+ command eligibility                 (ActionEligibility)
+ configured outcomes                 (StageCompletionOutcomeV1)
+ required-information / readiness     (CurrentWorkReadinessVM)
+ canonical record truth              (Household / Children / record)
+ relevant automation state           (scheduled sends / reminders)
= Operator Work presentation
```

**Rejected patterns** (must not appear): `if (stage === "new_lead") show("Contact Family")`,
`if (child.status === "enrolling") show("Send Enrollment Packet")`, or any literal business label in the card. The same
presentation model must render **any** Business Process (billing, staffing, compliance) with **no** process-specific UI
branch. Existing tests already assert this posture (§10) — e.g. *"renders billing published checklist without
enrollment-specific truth branches"* — and must stay green.

> Existing coupling to remove/relocate: `classifyCurrentWorkActions.ts:77-85` (`isEnrollmentIntentAction`) hardcodes
> `move_to_waitlist`/`enroll_subject`/`close_lead`. It is in the derivation lib, not the card, but it is
> process-specific logic and must become configuration-driven (category from the action catalog), not a literal set.

## 3. Configuration traceability matrix

Every visible element → its source, fallback, and whether any hardcoding is allowed. Sources verified in code (§10).

| Visible element | Runtime/config source | Fallback rule | Hardcode? |
|---|---|---|---|
| Work title (obligation) | `CurrentWorkSurfaceVM.title` ← `StageWorkTemplateV1.label` → work-item → runtime (`buildCurrentWorkSurfaceVM.ts:648-658`) | runtime work label; else hide item | **No** |
| Work description / why | `vm.description` / `vm.operatorGuidance` ← template `description` | omit line if absent | **No** |
| Subject name | canonical record truth (Children/Household); child id via carried subject (R1) | family name when family-grain | **No** |
| Primary command label | `vm.primaryAction.label` ← registered command / template `action_ref` override | none — no primary if none eligible | **No** |
| Secondary command labels | `vm.supportingActions/communicationActions/alternatePaths[].label` ← registry | omit bucket if empty | **No** |
| Outcome labels | `vm.completionOutcomes[].label` ← `StageCompletionOutcomeV1` | omit; no default outcomes | **No** |
| Requirement labels | `vm.readiness.requirements.items[].label` ← Required Information / progression catalog | omit summary if none | **No** |
| Waiting explanation | universal shell copy + runtime automation facts | generic "Nothing needs your attention" | **Only universal shell copy** |
| Automation timing ("reminder sends Monday") | automation/scheduled-comms runtime state | **omit specific timing if unavailable** | **No** (see gap G-AUTO) |
| Status labels | `vm.statusLabel` / durable status vocab (`enrollmentProcessStatusVocabulary.ts`) | runtime status enum | **No** |
| Platform headings ("Current Work", "Ready to continue", "Still needed", "Next") | platform presentation | fixed | **Yes** (universal) |

**Every current mock label, classified by proven source:**
- *config available now:* work titles/descriptions, primary/secondary command labels (via override/registry), outcome
  labels, status labels, requirement labels (Classroom/Schedule/Enrollment start date/Enrollment packet reviewed).
- *canonical record truth:* subject names (Digan/Sofia/Mateo/Aisha), contact, ages, dispositions.
- *universal platform copy:* "Current Work", "Ready to continue", "Still needed", "Next", "Nothing needs your
  attention", "Message".
- *configuration gap:* the **decision-stage** label and the **waitlist-action** label are configured but **prohibited**
  ("Placement / Decision", "Offer spot") → must be renamed (§9). "Enroll" terminal command label — **not configured**.
- *runtime gap (G-AUTO):* automation timing copy ("A reminder sends Monday morning") has no confirmed runtime source —
  either wire the scheduled-comms state or drop the specific timing to universal copy. **Do not invent it.**
- *remove from target:* the `%` progress meter and "N of M requirements complete" (present today) — remove from the
  obligation-first card.

## 4. Card state model

Ten states. Each: required runtime inputs · visible anatomy · primary · secondary · readiness · outcome · post-success.
All read the single VM (`buildCurrentWorkCardEvidence(context)` → `vm.surface`); state is a function of VM fields, never
of stage/status literals.

**active** — inputs: ≥1 open `StageWorkItemProjection`, eligible primary. Anatomy: obligation + why + primary (+ secondary). Primary: eligible registered command. Secondary: bucketed helpful actions only if present. Readiness: summary only if requirements exist. Outcome: hidden. Post-success: recompose (§8).

**follow-up** — inputs: open item + a prior completed attempt with `last_outcome` (e.g. retry outcome, no movement). Anatomy: active layout + one prior-activity line (`vm.lastActivity`). Primary: same obligation's command. Readiness: as relevant. Outcome: hidden until declaring. Post-success: prior line updates; attempt count via VM.

**waiting** — inputs: no open obligation, subject progressing / awaiting external; optional automation state. Anatomy: calm lead ("Nothing needs your attention"), what Alloy awaits, automatic next step (only if G-AUTO satisfied), useful exception actions only. Primary: none. Secondary: exception commands (e.g. reschedule) if eligible. Readiness/outcome: hidden. Post-success: n/a.

**blocked** — inputs: primary obligation gated by `ActionEligibility.blockers` / unmet required info. Anatomy: obligation + plain blocker (one clear reason) + resolve handoff + **shown-but-disabled** primary with `disabledReason`. Primary: disabled, carries `disabledReason`. Secondary: the resolving handoff to the owning card. Readiness: "Still needed" naming the blocking fact(s). Outcome: hidden. Post-success: on requirement satisfied → recompute eligibility → unblock.

**command in progress** — inputs: an open command flow (`resolve→preview→confirm→execute`). Anatomy: obligation + inline command (context, required inputs, preview) + confirm/cancel. Primary: Confirm. Secondary: Cancel. Readiness/outcome: hidden during flow. Post-success: §8 recomposition.

**completed / recomposing** — inputs: `ActionResult`/outcome committed for the item. Anatomy: quiet settled line ("Done" / "{outcome} · just now") then the **next** obligation. Primary: next obligation's command. Post-success: no reload, no toast, no celebration.

**settled / no active work** — inputs: no open obligations; terminal or awaiting external with nothing to do. Anatomy: calm settled state (e.g. "Sofia is enrolled. Started Sep 3."). No primary. No fake task.

**multiple active work items** — inputs: ≥2 open items across grains. Anatomy: **Priority** (1) / **Also active** (n) / **Completed** (bounded). Primary: the single prioritized item's command. Secondary: others are navigable, not competing primaries. Prioritization from configured ordering + recommendation + due/risk + eligibility (§5) — never component logic.

**stale or superseded work** — inputs: a newer committed subject/work state supersedes an in-flight response. Anatomy: the card always reflects the **latest committed** state; a stale response is dropped, never rendered. Guard: subject-generation ref (exists) + **new** correlation-id guard (§8). Post-success: latest wins.

**load failure** — inputs: VM/runtime fetch error. Anatomy: plain-language message; the obligation stays retryable; **no raw technical error, no command keys**. Primary: retry. A blocked precondition is *not* a load failure (it is `blocked`).

## 5. Grain and prioritization rules (frozen)

**Family-grain work:** names the household/family only when needed; references Household for contact/relationship truth;
**does not duplicate** Household content.
**Child-grain work:** **always names the affected child** (requires the carried child subject, R1 — §10.5); references
Children for identity and durable state; **does not reproduce the child roster**; may coexist with family-grain work in
the same card (each item self-labels by subject).

**Prioritization (multiple items)** — one prioritized item; others secondary; completed quiet and bounded. Order is
derived from, in precedence: (1) configured work-template ordering / `primary` flag; (2) recommendation state
(`recommended | ready | context_dependent` from the action catalog); (3) due/risk facts (`dueLabel`, overdue signals in
`context.signals.work`); (4) runtime command eligibility. **No enrollment- or component-specific ordering.**

## 6. Commands and outcomes contract

**Command relationship (one capability, many placements):**
- Focus Panel **Manage/header** command surface = the full eligible set for the subject.
- Current Work **primary action** = the single most-relevant *contextual placement* of an existing registered command
  (from the work template's `primary_action.action_ref`, resolved through the registry). **Not a duplicate definition.**
- Current Work **secondary actions** = the template's `helpful_actions` / catalog placements, bucketed by category.
- The same registered capability means the same thing everywhere (label, eligibility, execution).

**Command flow (unchanged runtime):** `resolve context → resolve subject → eligibility → required inputs → preview →
confirm → execute → audit → refresh/recompose` via `runRegisteredAction` (`actionExecutor.ts:126`). Command **keys and
runtime terms are never shown** (operator sees "Send enrollment packet", not `send_form`).

**Outcomes:** labels from `StageCompletionOutcomeV1` (stage operating plan) via `vm.completionOutcomes`. Outcomes are
**visible only when the operator is declaring a result** (the record-outcome intent) — never render every possible
result as permanent UI. Selecting an outcome launches confirmation, then commits through the Outcome Runtime
(`completeStageWorkWithOutcome → executeStageOperatingOutcome`), which applies authored consequences: complete/advance
work, move stage membership, write durable state, spawn next work. After recomposition, a prior outcome appears as the
single settled line (`vm.lastActivity`), not a permanent panel. `direct_action` work may be discharged by a sufficient
command result without re-declaration; `outcome_led` work always requires a declared outcome.

## 7. Readiness and Required Information contract

Current Work shows a **concise readiness summary**; the **Required Information card remains the authoritative, complete
surface** and is not duplicated.
- **Qualifies for the summary:** the stage's *required* factors for the current obligation (from `CurrentWorkReadinessVM
  .requirements.items`), split into **satisfied** ("Ready to continue ✓") and **still-needed** ("Still needed •"); at
  most one **clear blocker** highlighted when it gates the primary.
- **Label source:** `readiness.requirements.items[].label` ← Required Information / progression catalog (never authored
  in the card). **Ordering:** required-before-recommended, then configured order.
- **Blocker copy:** generated from the blocking factor label + a fixed universal template ("{Subject} can't {obligation}
  yet — {factor(s)} still needed."). The *factors* are runtime; the sentence frame is universal shell copy.
- **Owner handoff:** "Still needed" / the resolve link deep-links to (focuses) the **owning card** (Required Information
  / Children / Household) via the existing `coordination` handoff — it never edits the fact inline.
- **Update flow:** when the owning card commits a fact change, its record patch flows back through the recomposition
  seam (§8) and the readiness summary recomputes — same action, no reload.

## 8. Recomposition contract (critical acceptance)

After a command or outcome commits: **no full page reload**; the affected item settles; the next obligation appears;
command eligibility recalculates; readiness recalculates; configured outcomes refresh; Household/Children update **only
if their underlying truth changed**; unrelated Focus Panel content stays stable; the **latest committed subject remains
authoritative**; **stale responses cannot overwrite newer state.**

**Use the existing seams — do not build a new refresh system.** Verified owners/events (§10.4):
- **View-model owner (inline Focus Panel):** `useRecordWorkRuntime` (`web/lib/presentation/runtime/useRecordWorkRuntime.ts`)
  — holds `displayVm`, re-projects Current Work from `displayVm.workspace.stage_work`. `reloadDisplayVm()` (lines
  218-224) recomposes atomically.
- **The gap to close:** `useRecordWorkRuntime.onQueueUpdated` (lines 236-259) **invalidates the stage-work cache then
  returns for non-tour action keys** — invalidate-without-re-apply. And `useWorkIntentOutcomeCompletion`'s
  `reloadOpportunityDisplayVm()` **no-ops without a drawer context**, which the inline panel lacks. **Fix:** on a
  `stage_work_outcome` queue-updated event, re-apply the stage-work slice / call `reloadDisplayVm()` in the inline
  runtime. This is the single highest-value wiring change.
- **Events:** `OPPORTUNITY_QUEUE_UPDATED_EVENT` / `dispatchOpportunityQueueUpdated`
  (`web/lib/admin/opportunityQueueRefreshEvent.ts`); `invalidateOpportunityStageWorkCache`
  (`stageWork/opportunityStageWorkResource.ts`); `dispatchOpportunityDrawerRecordPatch` /
  `ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH` (`web/lib/admin/opportunityDrawerTargetedRefresh.ts`).
- **Stale-response protection:** a subject-generation guard exists (`fetchGenRef`, lines 179/185/202) — guards subject
  *swaps*. There is **no** correlation-id guard: `ActionResult.correlationId` (`actionExecutor.ts:148/161/177`) is never
  consumed. **Add** a per-subject latest-response guard keyed on `correlationId` so an out-of-order response for the same
  subject cannot overwrite newer state.

## 9. Configuration defects and required decisions

Do not use "Placement" or "Offer" in any proposed operator copy. Renames marked `⟨APPROVAL⟩` need Product Office sign-off.

| # | Current key / label | Proposed correction | Config-only or Engineering | When | Approval? |
|---|---|---|---|---|---|
| C1 | stage `decision` = "Placement / Decision" | operator label **"Decision"** `⟨APPROVAL⟩` | config-only | **before** | **yes** |
| C2 | work `offer_spot` = "Offer spot" (stage `waitlist`) | **"Invite to enroll"** `⟨APPROVAL⟩` | config-only | **before** | **yes** |
| C3 | outcome `spot_offered` = "Spot offered" | **"Invited"** `⟨APPROVAL⟩` | config-only | **before** | **yes** |
| C4 | `send_confirmation`, `send_reminder` (no label) | **"Send confirmation"**, **"Send reminder"** `⟨APPROVAL⟩` | config-only (add catalog labels) | during | minor |
| C5 | `reschedule` (bare) ≠ catalog `reschedule_tour` | use **"Reschedule tour"**; fix key ref | config-only | during | no |
| C6 | Enrolling completion = outcome "Packet sent" only; **no terminal enroll** | add configured **"Enroll"** command `⟨APPROVAL⟩` + gated `move_to_stage: enrolled` transition | **Engineering + config** | before (for enroll-complete QA) | **yes** |
| C7 | three stage vocabularies + dangling `qualification` (`defaultEnrollmentStageOperatingPlans.ts:611`) | converge to canonical 8-stage set; remove `qualification` ref | config + light Engineering | during | no |
| C8 | missing outcomes/placements mismatches (helpful actions unlabeled) | align template `action_ref`s to labeled catalog entries | config-only | during | no |

## 10. Existing-code impact map

**Preserve (do not touch behavior):** Current Work / Command / Outcome / Required Information / Business Process
runtimes; Household, Children; Focus Panel shell, Presentation Runtime reveal.

**Evolve (exact):**
- `web/components/admin/focusPanel/cards/CurrentWorkCard.tsx` — **presentation only.** Remove/replace `SurfaceProgress`
  (lines 523-559: `%` bar + "N of M requirements complete") with the readiness summary (Ready/Still-needed). Reorder to
  the obligation-first hierarchy (§1). Keep VM-driven labels (already no hardcoding). Narrow `RequirementsDisclosure`
  (561-605) into the summary. Keep the `presentation="summary"|"workspace"` seam but see workspace narrowing below.
- `web/lib/adminV2/runtime/focusPanel/currentWork/*` — **compose, mostly present.** `buildCurrentWorkSurfaceVM`
  (`CurrentWorkSurfaceVM` at `currentWorkSurfaceTypes.ts:107-147`) already exposes title/description/subject/actions/
  outcomes/readiness/lastActivity. Add: a grain-correct subject naming field; a single due/risk scalar if needed for
  prioritization. Relocate `classifyCurrentWorkActions.ts:77-85` enrollment literals to config-driven categorization.
- Recomposition wiring in `web/lib/presentation/runtime/useRecordWorkRuntime.ts` (§8) — re-apply on `stage_work_outcome`;
  add correlation-id staleness guard.
- Child subject: `web/lib/lifecycle/projectStageWorkRuntime.ts:156-164` `buildExecutionSubject` carries only
  `journey_segment` + `opportunity_id` — **add the child id at child grain** (R1).

**Current hardcoded assumptions:** none of enrollment vocabulary in the card (confirmed). Only `isEnrollmentIntentAction`
(lib) and the `%`-meter framing. **Duplicate paths:** two refresh owners (`useWorkIntentOutcomeCompletion` drawer path
vs `useRecordWorkRuntime` inline path) — the inline path is the one that under-recomposes. **Expanded workspace:**
`CurrentWorkWorkspace.tsx` (604 lines) via coordination `openCurrentWorkWorkspace(intent)`; "Open workspace →" (card
line 784), "← Back to summary"; hosted by `OpportunityFocusPanelModeGrid`. Narrow/retire = collapse its unique value
(outcome picker, other transitions, activity) into the summary/inline flows; keep only if a genuine expanded need
remains.

**Tests already protecting the runtime (keep green):** `projectCurrentWork.test.ts`,
`currentWorkOperationalSurface.test.ts` (*"renders billing published checklist without enrollment-specific truth
branches"*), `workTemplateCurrentWorkRuntime.test.ts` (*"never surfaces generic Change Enrollment Status"*),
`currentWorkActionIntentResolution.test.ts`, `currentWorkCardEvidence.test.ts`, `currentWorkCard.test.tsx`,
`currentWorkFocusWorkspace.test.tsx`; lifecycle `completeStageWorkWithOutcome.test.ts`,
`stageWorkRuntimeProjection.test.ts`, `workIntentRuntimeProjection.test.ts`; UI `currentWorkOutcomeFlow518k.test.tsx`;
refresh `operationalWorkRefresh*.test.ts`. **Known coverage gap:** no test asserts the inline `useRecordWorkRuntime`
re-projects after a `stage_work_outcome` event (the recomposition gap) — add it.

## 11. Implementation slices (smallest safe sequence)

Order validated against the code: the presentation model largely exists, so the derivation/tests slice is light; the
recomposition wiring is the highest-risk correctness slice and gets its own step.

1. **Presentation model + traceability tests.** Scope: assert every visible field resolves from the VM; lock "no
   business literals in the card / no stage-status branches" as a test. Files: `currentWork/*`, new
   `operatorWorkTraceability.test.ts`. Behavior: none visible. Tests: traceability + a second BP (billing) renders
   through the same model. Stop: green + a non-enrollment BP passes. Non-goal: UI change.
2. **Evolve card presentation (no execution change).** Scope: obligation-first hierarchy; remove `%` meter; conditional
   sections. Files: `CurrentWorkCard.tsx`. Behavior: the target look. Tests: `currentWorkCard.test.tsx` updated; empty
   sections don't render. QA: New inquiry renders obligation+why+primary, no meter. Stop: visual parity with the target.
   Non-goal: recomposition, grain.
3. **Grain-correct subject naming + multi-work prioritization.** Scope: carry child id (R1) in `buildExecutionSubject`;
   child-named items; Priority/Also active/Completed from configured order+recommendation+due+eligibility. Files:
   `projectStageWorkRuntime.ts`, `buildCurrentWorkSurfaceVM.ts`, card. Tests: child-grain completes without error;
   ordering rules. QA: multi-child household. Stop: child-grain outcome commits in-panel. Non-goal: readiness summary.
4. **Readiness summary + owning-card handoff.** Scope: Ready/Still-needed summary; blocker copy; deep-link. Files: card,
   `resolveWorkItemHandoff`. Tests: summary qualifies required-only; handoff focuses owner. QA: blocked child work.
   Stop: blocker names the fact + handoff works. Non-goal: duplicate the Required Information card.
5. **Converge primary command launch + inline return.** Scope: primary action = contextual placement of the registered
   command; inline preview/confirm. Files: card, `CurrentWorkActionPanel`, `runRegisteredAction` call site. Tests:
   same-capability-everywhere; command keys never shown. QA: command preview+confirm. Stop: one command path. Non-goal:
   new command.
6. **Outcome declaration behavior.** Scope: outcomes visible only when declaring; confirm → commit. Files: card,
   `useWorkIntentOutcomeCompletion`, `StageWorkOutcomePicker`. Tests: outcomes gated; commit applies consequences. QA:
   tour outcome. Stop: declaring changes work/stage. Non-goal: permanent outcome UI.
7. **Exact recomposition (highest-value correctness).** Scope: re-apply stage-work on `stage_work_outcome` in
   `useRecordWorkRuntime`; correlation-id staleness guard; stable unrelated cards. Files:
   `useRecordWorkRuntime.ts`, `useWorkIntentOutcomeCompletion.ts`. Tests: **new** inline-recompose test; stale response
   dropped. QA: send packet → settles + next appears, no reload. Stop: acceptance §13.9. Non-goal: new refresh system.
8. **Retire/narrow the expanded workspace.** Scope: fold unique value into summary/inline; remove "Open workspace →" if
   redundant. Files: `CurrentWorkWorkspace.tsx`, coordination model, ModeGrid host, card workspace branch. Tests: update
   `currentWorkFocusWorkspace.test.tsx`. QA: no dead affordance. Stop: no capability lost. Non-goal: delete before value
   folded in.
9. **Configuration corrections.** Scope: apply C1-C8 (approved). Files: `defaultEnrollmentStageOperatingPlans.ts`,
   action catalog, template. Tests: label change reflects with no code change. QA: §13.11/13. Stop: no prohibited label
   renders. Non-goal: runtime change beyond C6.
10. **Authenticated operator QA.** Scope: run §13 end-to-end on seeded Digan records. Stop: all pass. Non-goal: new
    features.

*Dependency note:* slices 1-2 and 7 are **process-agnostic** and can start immediately (no dependency on the C1-C3/C6
label/decision approvals). Slice 9 and enroll-complete QA depend on those approvals.

## 12. Test plan

- **Traceability (new):** no business literal in `CurrentWorkCard`; every visible label maps to a VM field; a
  non-enrollment BP (billing) renders through the same model with no enrollment branch (extends the existing
  billing-parity tests).
- **State model:** one unit test per §4 state (inputs → anatomy; empty sections omitted).
- **Grain:** child-grain outcome commits without the `projectStageWorkRuntime:156-164` error; child always named.
- **Prioritization:** configured-order/recommendation/due/eligibility drives the single primary.
- **Readiness:** summary = required-only, split satisfied/needed; blocker names the fact; handoff focuses owner.
- **Command:** same capability = same label/eligibility in header and primary; keys never rendered.
- **Outcome:** outcomes only during declaration; commit applies consequences.
- **Recomposition (new):** inline `useRecordWorkRuntime` re-projects after `stage_work_outcome`; correlation-id guard
  drops a stale response; unrelated cards stable.
- **Config-driven (new):** changing a label / disabling an action placement / changing outcomes updates the card with
  **no presentation-code change**.
- Keep all §10 existing tests green.

## 13. Authenticated QA plan (seeded Digan Family)

1. New inquiry → one active item (obligation + why + primary, no meter).
2. Prior contact attempt completed; next attempt active (single prior-activity line).
3. Scheduled tour → waiting state (calm; automation line only if G-AUTO satisfied).
4. Tour outcome declaration → confirm → commits.
5. Multi-child household: family-grain + child-grain work coexist; each named; no duplicate roster.
6. Child work with missing Required Information → Still-needed summary + handoff.
7. Blocked command → clear reason + handoff; primary shown-disabled.
8. Command preview + confirmation.
9. **Successful command recomposition without reload** (settles + next appears; unrelated cards stable).
10. Completed process → no active work (calm settled).
11. **Configuration label change reflected without code change.**
12. Action placement disabled → button disappears safely (no crash, no empty section).
13. **Outcome configuration changed → card updates with no presentation-code change.**
14. **Another Business Process (billing) renders through the same presentation model** (no enrollment branch).

## 14. Risks and rollback posture

- **R1 · Recomposition precision (highest).** Fixing `onQueueUpdated` could over- or under-refresh. Mitigation: scope
  re-apply to the stage-work slice; acceptance §13.9 (settles + next, unrelated stable) is the gate. Rollback: the
  change is isolated to `useRecordWorkRuntime`; revert restores today's (stale-until-remount) behavior.
- **R2 · Removing the progress meter.** Some operators may rely on it. Mitigation: readiness summary conveys the same
  truth better; it is behind the card presentation slice (2) and revertible independently.
- **R3 · Workspace narrowing loses a capability.** Mitigation: fold-before-remove (slice 8); gate on "no capability
  lost". Rollback: keep the workspace seam until parity proven.
- **R4 · Prohibited labels render before C1-C3 land.** Mitigation: the process-agnostic slices don't touch those stages;
  do not ship enrollment decision/waitlist surfaces until C1-C3 applied. Rollback: config-only revert.
- **R5 · Correlation-id guard regressions.** Mitigation: additive guard; feature-flag if needed; covered by the new
  stale-response test.
- **Overall rollback:** every slice is independently revertible; presentation (2,4), wiring (7), config (9) are
  separable. No schema/runtime-kernel change is required, so rollback is code/config revert, not migration.

## 15. Explicit non-goals

- No new runtime, work system, command system, readiness system, or card platform.
- No redesign of Household, Children, Required Information, the Focus Panel shell, the Command/Outcome/Business Process
  runtimes, or Presentation reveal.
- No enrollment-specific UI branch; no business literal in the card.
- No new refresh system (reuse the existing seams).
- No permanent outcome/requirements panels; no progress percentages/meters (unless a future work type's meaning *is*
  progress).
- No post-enrollment busywork (Attendance/Billing own what follows).
- No "Open Workspace" as a second application inside the card.

## 16. Final readiness decision

### BLOCKED ON PRODUCT DECISIONS

The presentation, composition, and runtime work is **fully specified and buildable** — the card is already
presentation-only, the derived VM exists, the recomposition seam and staleness fix are located, and the derivation/state/
grain/command/outcome/readiness/recomposition contracts above leave Engineering nothing to invent in those areas. The
**process-agnostic slices (1, 2, 7) can start immediately.**

It is **not** `READY FOR ENGINEERING` because Engineering would still have to **invent visible language and one behavior**
for the enrollment surfaces that touch prohibited/absent configuration — which the derivation rule forbids. A **bounded,
enumerated** set of Product Office decisions unblocks it:

1. **Approve C1-C3 operator labels** — the decision-stage label (**"Decision"**), the waitlist-action label (**"Invite
   to enroll"**), and its outcome (**"Invited"**). Until approved, those stages have no non-prohibited operator words.
2. **Decide C6** — add a configured **"Enroll"** completion command + a Required-Information-gated `enrolled` transition.
   Without it, no operator can complete an enrollment from the card (today's completion is only "Packet sent", which does
   not advance).
3. **Confirm C7 scope** — converge to the canonical 8-stage vocabulary and remove the dangling `qualification` reference.

Each has a proposed answer above awaiting yes/no; none is open-ended design. On sign-off, the config corrections (§9) are
mechanical and this handoff becomes **READY FOR ENGINEERING** with no further product input. G-AUTO (automation-timing
source) is a minor runtime confirmation, not a blocker — if unavailable, the waiting copy drops specific timing.

No implementation begun. No code written. This document is the Phase 5 Product Office → Engineering handoff.
