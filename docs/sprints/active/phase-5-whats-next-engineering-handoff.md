---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — What's Next Configured-Work Runtime: Engineering Handoff

**Purpose:** let a brand-new session continue implementation with **no prior conversation**. Everything needed is here
or in the linked docs. **Do not re-run Product discovery** — Product is closed and frozen.

**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` (managed slot 1, port 3011).
**Branch:** `agent/claude/1-alloy-phase-5-product-realization`. **Base:** `origin/staging @ 2b554b4b4`.
**Status:** 24 commits ahead, clean tree, **nothing pushed, nothing merged.** Do not push/merge without Kelly's word.

**Frozen inputs (read these, do not reopen):**
- Engineering handoff / contract: [phase-5-operator-work-engineering-handoff.md](phase-5-operator-work-engineering-handoff.md)
- Lead-Engineer execution plan: [phase-5-operator-work-engineering-execution-plan.md](phase-5-operator-work-engineering-execution-plan.md)
- Derivation architecture (canonical ref): [phase-5-current-work-derivation-architecture.html](phase-5-current-work-derivation-architecture.html)
- Build-target mock: [phase-5-enrollment-focus-panel-target.html](phase-5-enrollment-focus-panel-target.html)
- Interaction-runtime recon + generic capability matrix: [phase-5-configured-work-interaction-runtime.md](phase-5-configured-work-interaction-runtime.md)
- Implementation contract + config §9-bis: [phase-5-enrollment-operator-work-implementation-contract.md](phase-5-enrollment-operator-work-implementation-contract.md)

**Accepted slice order (frozen): B → E → F → D → A → G.** Status: M1 accepted; **Slice B done**; E/F/D/A/G not started.

**Product target (accepted):** the operator-facing **What's Next** card (obligation-first) → a centered configured-work
surface → configured capability → recomposition, driven entirely by configuration with **no business-process branches**.

---

## 1. Current architecture

### Runtime contracts (the derivation)
`What's Next presentation = active subject + configured Business Process/stage + active Current Work items +
work-template config + registered command resolution + command eligibility + configured outcomes + required-info/
readiness + canonical record truth + automation state`. No `stage ===`/`process ===`/`journey_segment ===` branches
exist in the current-work runtime or card (verified).

- **Current Work Runtime (projection):** `web/lib/lifecycle/projectStageWorkRuntime.ts` → `StageWorkRuntimeProjection` /
  `StageWorkItemProjection` (`stageWorkRuntimeTypes.ts`). Note the child-grain gap: `buildExecutionSubject`
  (`projectStageWorkRuntime.ts:~156` and its stage-scoped call site ~394) carries only `journey_segment` +
  `opportunity_id`; `StageOutcomeExecutionSubject` (`stageOutcomeRuleTargetExecutor.ts:30`) already supports optional
  `customer_member_id`/`process_instance_id`.
- **Command/Action Runtime:** `runRegisteredAction` (`web/lib/adminV2/actions/actionExecutor.ts:126`) with the
  eligibility gate; `ActionEligibility { eligible, blockers, availableTransitions, requiredInputs }`. Only 3 real
  handlers (`update_status`, `create_lead`, `confirm_tour`); the rest are `CanonicalActionDefinition` metadata routed to
  `admin_execute`/`relationship_execute`/`dedicated_modal`/`ui_intent` executors.
- **Outcome Runtime:** `completeStageWorkWithOutcome.ts` → `executeStageOperatingOutcome.ts` →
  `stageOutcomeRuleTargetExecutor.ts`; outcomes are `StageCompletionOutcomeV1` (`stageOperatingPlanV1.ts`).
- **Business Process Runtime:** stage operating plans authored in `StageOperatingPlanV1`
  (`defaultEnrollmentStageOperatingPlans.ts` for the enrollment fixture); transitions derived generically.

### View Models
- **`CurrentWorkSurfaceVM`** (`web/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes.ts:107-147`),
  built by `buildCurrentWorkSurfaceVM.ts` (776 lines). Exposes: `title`, `description`, `operatorGuidance`,
  `status`/`statusLabel`, `readiness: CurrentWorkReadinessVM` (with `requirements.items[]` of
  `{key,label,status,scope?,targetLabel?}`), `progress` (legacy — no longer rendered), `checklist`, `primaryAction`,
  `recordOutcomeAction`, `execution`, `supportingActions`/`alternatePaths`/`administrativeActions`/
  `communicationActions`/`bosRecommendations`, `lastActivity`, `showOutcomeCompletion`, `completionOutcomes`,
  `primaryWorkItem`, `isEmpty`. **`CurrentWorkActionVM`** (lines 29-42): `{key,label,description?,icon?,category,
  placement,handlerKey?,actionRef?,disabled?,disabledReason?,resolved?}` — **no `eligibility` field yet** (Slice F adds
  the resolved execution state).
- Wrapped by `projectCurrentWork.ts` → `buildCurrentWorkCardEvidence.ts` → consumed by the card as
  `evidence.viewModel.surface`.

### Capability resolution (after Slice B — fully generic)
`resolveCurrentWorkActionSurface.ts` maps an action to a host **from metadata only**: declared
`canonical.interactionHost` → `canonical.category` (`communication`→composer, `bos_native`→unsupported, else
`header_delegate`) → registry-resolved handler (`action.resolved`→`header_delegate`) → else **`unsupported`**. No
name/allowlist/intent branches remain here. `executeCurrentWorkAction.ts` dispatches on generic `plan.kind`
(`record_outcome`/`open_workspace`/`open_inline_panel`/`communications_composer`/`header_delegate`/`process_transition`/
`blocked`/`unsupported`).

### Interaction host model
`CapabilityInteractionHost = "inline_form" | "communications_composer" | "header_delegate"` declared on
`ActionRegistryEntry` (`actionDefinitionRegistry.ts`) and threaded onto `CanonicalActionDefinition`
(`canonicalActionRegistry.ts`). `schedule_tour`/`reschedule_tour` declare `interactionHost: "inline_form"`. Host modes
resolve to: composer (`resolveCommunicationsComposerAction` → canonical Compose modal), inline form
(`CurrentWorkActionPanel` → `OpportunityTourScheduleActionModal`, rendered on `surface==="inline_form"` alone),
header delegate (`invokeHeaderAction`/registry), process transition (`process_stage_transition`), reserved
`record_outcome`/`expand_work`.

### Ownership model (requirement handoff)
Today: `handoffOwnerCardForChecklistScope(scope)` + `inferWorkItemOwner` (`inferWorkItemOwner.ts:~39`, **label regex** —
this is the debt Slice E removes). Readiness items carry `scope` and `targetLabel`; the card's `ReadinessSummary`
(in `CurrentWorkCard.tsx`) shows only outstanding items, deduped/capped, with per-item handoff (`Children →`).

### Recomposition model
`useRecordWorkRuntime.ts` is the inline VM owner. After a committed command/outcome, an
`OPPORTUNITY_QUEUE_UPDATED_EVENT` for the subject calls `reloadDisplayVm()` (fixed in M1 — see below), with a
`reloadGenRef` stale-response guard. Events: `OPPORTUNITY_QUEUE_UPDATED_EVENT`/`dispatchOpportunityQueueUpdated`,
`invalidateOpportunityStageWorkCache`, `dispatchOpportunityDrawerRecordPatch`. Outcome completion:
`useWorkIntentOutcomeCompletion`.

---

## 2. Completed work

### M0 — Rename + inline recomposition
- `1e78729e3` — operator title `Current Work → What's Next` (4 display sites; runtime key `current_work` unchanged).
- `9f5924428` — **Slice-4 recomposition fix** in `useRecordWorkRuntime.ts`: on `stage_work_outcome` queue events call
  `reloadDisplayVm()` (was invalidate-and-return); added `reloadGenRef` stale-response guard.
- Validation: typecheck clean; refresh tests 5/5; zero new failures vs baseline.

### M1 — Obligation-first presentation, then correction
- `dcf0956c1` — removed `SurfaceProgress` %-meter + `RequirementsDisclosure`; added `ReadinessSummary` (Ready/Still-
  needed from `readiness.requirements.items`). Presentation-only.
- `e41c5263e` — **M1 correction (accepted)**: rejected the superficial first pass. Now the card matches the target on
  the **authenticated Wenc Family record**: eyebrow WHAT'S NEXT → obligation → one why (dedup removed) → **one dominant
  Bend Pine `__primary-action` button** → subordinate secondary actions + outcome access (removed the `__work-primary`
  nested panel and standalone "Open workspace") → **"Still needed"** only (deduped/capped; dropped the satisfied raw-
  field dump where `Location Id`/dupes leaked). Files: `CurrentWorkCard.tsx` + updated markup tests
  (`currentWorkCard`, `currentWorkFinalPolish`, `currentWorkProcessBuilderQa`, `currentWorkFocusWorkspace`).
- Authenticated QA: screenshotted Wenc Family; visibly matches the target hierarchy/density.
- **Known live deviation (config, not code):** the primary button reads **"Message"** not "Contact Family" because this
  org's *published* lead plan lacks `override_label: "Contact Family"` on the `quick_message` primary_action (the seeded
  default has it). Fix = config re-seed (§9-bis), never a hardcode.

### Slice B — Metadata-driven capability/host resolution
- `345fc53f8` — removed the 3 non-generic shims and made host resolution fully metadata-driven.
  - **Purpose:** eliminate action-name/allowlist/enrollment-intent routing so any BP resolves through the same engine.
  - **Files:** `actionDefinitionRegistry.ts` (add `CapabilityInteractionHost` + `interactionHost`; schedule/reschedule
    tour declare `inline_form`), `canonicalActionRegistry.ts` (thread `interactionHost`),
    `resolveCurrentWorkActionSurface.ts` (metadata-driven; removed `isScheduleTourRegistryAction` +
    `HEADER_DELEGATE_KNOWN_KEYS`), `CurrentWorkActionPanel.tsx` (render inline host on `surface==="inline_form"` alone),
    `classifyCurrentWorkActions.ts` (`isEnrollmentIntentAction` → `isLifecycleIntentAction`, `category==="lifecycle"`).
  - **Validation/tests:** 2 proof tests (same declared host across differently-named capabilities; label with
    tour/message/form/enrollment gets no special treatment without metadata). Fixed 2 pre-existing failures
    (`bos/unknown → unsupported`; card has no hardcoded enrollment keys). Broad `tests/adminV2/runtime + actions` sweep:
    **81 failed vs 83 baseline (zero new, net −2)**; typecheck clean.
  - **Authenticated QA:** Wenc Family card renders unchanged (all 4 actions present ⇒ all resolved to supported hosts).
  - **Intentionally unchanged visible behavior** (this was a runtime convergence).

---

## 3. Remaining implementation (do in order: E → F → D → A → G)

### Slice E — Ownership-driven requirement grouping
- **Objective:** group "Still needed" requirements by **runtime ownership metadata**, not `inferWorkItemOwner` label
  regex. Output: `Owner label` → human-readable requirements → `Open owner →`. Owner label + handoff from runtime;
  field label from the canonical display-label resolver (`resolveCurrentWorkFieldRuleDisplayLabel`); no internal ids;
  deduped; grouped.
- **Dependencies:** none on later slices; builds on the accepted card.
- **Expected visible behavior:** the readiness summary groups by owner (may show >1 owner group); `Location Id`-style
  internal ids never appear; owners are not limited to Household/Children/Required Information.
- **Runtime contracts touched:** `CurrentWorkReadinessItemVM` (add explicit owner metadata: owner key + label + link
  target); `buildReadinessVM`/`classifyChecklistItems` in `buildCurrentWorkSurfaceVM.ts` (source the owner from the
  checklist/field-rule projection, not labels); replace `inferWorkItemOwner` label regex. Apply the display-label
  resolver at the projection where checklist requirement labels are built (this is also where `Location Id` leaks).
- **Configuration touched:** none required; if ownership metadata is absent/malformed, fix the **derivation** layer,
  don't guess in the renderer.
- **QA:** two owners in one item; duplicate fields; an internal-ID field (suppressed); an unknown/new owner; a
  non-enrollment process fixture. Commit independently.

### Slice F — Command integrity
- **Objective:** every visible enabled action is provably executable. Thread a **resolved execution state** onto
  `CurrentWorkActionVM` (reuse `ActionEligibility` — do NOT invent a parallel status system). Distinguish
  `executable | disabled | blocked | hidden | configuration_error`. Never render enabled when capability resolution
  fails / host unsupported / subject invalid / payload absent / eligibility fails / binding missing.
- **Dependencies:** builds on Slice B's resolution (`unsupported` already computed). Independent of D/A.
- **Expected visible behavior:** unresolved/ineligible actions hide or disable-with-reason (or blocked-with-handoff);
  configuration errors observable to engineers/admins, not operators. No no-op buttons.
- **Runtime contracts touched:** `CurrentWorkActionVM` (+ execution state), `buildCurrentWorkSurfaceVM` (populate it
  from `resolveCurrentWorkActionSurface` + `ActionEligibility`), the card's action rendering (gate on the state).
- **Configuration touched:** none.
- **QA:** executable registered command; unresolved capability; unsupported host; missing payload; ineligible action;
  blocked-with-handoff; a newly configured action from a **second BP**. Commit independently.

### Slice D — Generic outcomes + transitions
- **Objective:** render configured outcomes (`completionOutcomes`) and BP lifecycle transitions from runtime
  collections through one generic contract; each item carries label/eligibility/handler/confirmation/effect/execution
  state. No hardcoded target-state logic. **Do not move the host yet** (that's A).
- **Dependencies:** B (resolution), F (execution state) stable.
- **Expected visible behavior:** outcomes appear only when declaring; eligible transitions are accessible; both driven
  by config.
- **Runtime contracts touched:** outcome/transition VM shaping in `buildCurrentWorkSurfaceVM` + the outcome/transition
  rendering; `executeStageOperatingOutcome`/transition handlers reused.
- **Configuration touched:** none (uses stage operating plans). QA: outcomes render/execute; an eligible transition is
  reachable; a non-enrollment fixture. Commit independently.

### Slice A — Centered configured-work host
- **Objective:** move `current_work` from the full-canvas workspace to the **canonical centered Focus Card** elevation
  (`useReportPerspective` / `isFocusElevatingCard`) used by Household/Children/etc. The centered host renders the
  generic work VM (obligation, explanation, configured actions/outcomes/transitions, grouped missing info, activity)
  with **no capability-specific dispatch** — all execution delegates to the B/D/F contracts.
- **Dependencies:** E, F, D done (clean generic runtime first). **Biggest structural change / highest regression risk.**
- **Expected visible behavior:** opening the card elevates a centered surface (not the legacy full page).
- **Runtime contracts touched:** `focusPanelCoordinationModel.ts` (`isFocusElevatingCard`/`WORK_OWNING_CARDS` — remove
  the `current_work` exclusion and the `openCurrentWorkWorkspace` canvas-replace special-case),
  `OpportunityFocusPanelModeGrid.tsx` (host), `CurrentWorkCard.tsx` (`useReportPerspective`), a new/adapted centered
  configured-work surface reusing `FocusPanelCardGrid`. Do NOT create a new modal system.
- **Configuration touched:** none. QA: authenticated centered surface on Wenc/Digan + a non-enrollment BP. Commit
  independently.

### Slice G — Legacy workspace retirement
- **Objective:** retire normal navigation to `CurrentWorkWorkspace.tsx` (the full page) **only after parity is proven**.
  Before removal, produce a capability-parity checklist showing every interaction it hosts (Next action, Record outcome
  picker, Requirements, More actions, Other transitions, Recent activity) is reachable from the summary card, the
  centered host, or the canonical owning capability. **Do not delete shared runtime/capability code** — only the page
  host.
- **Dependencies:** A done. QA: nothing reachable-only-in-workspace remains. Commit independently.

---

## 4. Remaining technical debt

- **Pre-existing test drift (~81 failures in `tests/adminV2/runtime + actions`):** staging-drift, mostly brittle
  source-string assertions (e.g. `case "inline_form"` moved to `CurrentWorkActionPanel`; `completeStageWorkWithOutcome`;
  `builds enrollment current work from published operating plan configuration`). **NOT caused by this initiative** —
  confirmed by stash-and-compare each slice. Recommend a separate **M0.5 stabilization PR** (convert source-string tests
  to behavioral) so "green" is meaningful. Every slice here validates by *delta vs baseline*, never absolute green.
- **Configuration issues (§9-bis, need Product Office approval + re-seed):** prohibited/absent labels — decision stage
  ("Placement / Decision"), waitlist action ("Offer spot"); the `quick_message` primary lacks `override_label
  "Contact Family"` in the org's published plan (why the live button reads "Message"); no configured terminal "Enroll"
  command/transition in `enrolling`; dual/deprecated stage vocabulary + a dangling `qualification` transition ref
  (`defaultEnrollmentStageOperatingPlans.ts:611`). All are configuration/seed, not renderer code.
- **Capability gaps:** many header capabilities (`create_task`, `send_email`, `send_sms`, `call_parent`, `log_note`,
  etc.) are **not** in the canonical registry; they resolve via `action.resolved` (registry-resolved) at runtime. If a
  future path surfaces them **without** `resolved`, they'll be `unsupported` (correct, but note it). `send_confirmation`/
  `send_reminder`/`reschedule` are unlabeled/unwired (vocab-derivation gaps).
- **Legacy Current Work workspace dependencies:** `CurrentWorkWorkspace.tsx` still hosts the outcome picker (reached via
  `record_outcome` → `openCurrentWorkWorkspace`), Other transitions, More actions, Requirements, Recent activity. It is
  still the outcome-declaration host (the card cannot render the picker inline yet) — that is the one retained
  dependency until Slice D/A/G.
- **Chrome/QA limitations:** the in-app browser (`mcp__Claude_Browser`) renders the authenticated app for
  `get_page_text`/screenshot but is **not click-interactive here** (viewport 0×0, empty `read_page`). Claude-in-Chrome
  (`mcp__claude-in-chrome`) was intermittently disconnected. Result: QA can *see* the card but not drive clicks —
  interaction QA needs the user or a connected extension. The **cert platform** (`certification/alloy-certify`, ports
  544xx) is the reproducible authenticated path but has a documented SSR session-cookie blocker (reused `@supabase/ssr`
  cookie rejected on cold load → `/login`); fixing it unblocks self-service authenticated QA.
- **Intentionally deferred:** the two `isScheduleTourRegistryAction` call sites **outside** the What's Next surface
  (`useOpportunityDrawerVmHeaderActions.ts:75`, `applyRegistryResolvedActionClient.ts:225`) — different surfaces, later
  convergence. Child-grain per-item execution subject (R1). The `progress` field on `CurrentWorkSurfaceVM` (kept for
  queue-summary consumers; no longer rendered by the card).

---

## 5. Branch status

- **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` (slot 1, port 3011).
- **Branch:** `agent/claude/1-alloy-phase-5-product-realization`.
- **Commits ahead:** 24 (of `origin/staging @ 2b554b4b4`). Latest: `345fc53f8` (Slice B).
- **Tree:** clean (`next-env.d.ts` build artifact restored).
- **Push status:** not pushed. **Merge status:** not merged. Do not push/merge without Kelly's authorization.
- **Dev server:** may be running on 3011 (`alloy-dev-start wt1-alloy-phase-5-product-realization`); slot 3 was paused
  to free a server slot — restore with `alloy-worker-resume 3` when done.

---

## 6. How the next session should proceed

1. Read this doc + the frozen links in the header. Do **not** reopen Product or re-run recon.
2. Confirm branch/worktree (§5). Optionally start the server (`alloy-dev-start wt1-alloy-phase-5-product-realization`).
3. Implement **Slice E** next (§3). Validate by **delta vs a stashed baseline** (never absolute green — see debt).
   Commit independently with the per-slice return (commit, files, contract, tests, auth QA, non-enrollment proof,
   remaining branches/no-op risks/workspace deps). Then F → D → A → G.
4. Before Slice A, answer the architectural gate: *can a new BP configure an action, host, outcome, transition, and
   missing-info ownership and use What's Next with no presentation code?* Must be **yes, backed by tests**.
5. Never introduce a business-specific branch or label-based dispatch. Keep enrollment (Wenc/Digan) as a fixture, plus
   one non-enrollment BP fixture per generic-runtime slice.

No implementation in this handoff. Stop here.
