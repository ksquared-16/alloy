---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Operator Work: Engineering Execution Plan

**Author stance:** Lead Engineer, accountable for shipping the approved What's Next experience safely. Product is frozen
(handoff, contract, derivation architecture, mockups). This plan re-derives the *implementation* sequence from the code
— not the Product-Office slice list — and optimizes for safest, smallest, highest-value-first delivery. **No
implementation in this document.**

**Inputs reviewed:** `CurrentWorkCard.tsx`, `CurrentWorkActionPanel/Workspace`, `buildCurrentWorkSurfaceVM` +
`currentWorkSurfaceTypes.ts` (the VM), `projectCurrentWork` / `buildCurrentWorkCardEvidence`, `useRecordWorkRuntime`
(inline VM owner), `projectStageWorkRuntime` (`buildExecutionSubject`), `stageOutcomeRuleTargetExecutor`
(`StageOutcomeExecutionSubject`), Focus Panel composition (`OpportunityFocusPanelModeGrid`, `FocusPanelCardRenderer`),
Required Information (`ReadinessCard`), Household/Children cards, and the current-work + lifecycle test suites.

---

## 1. What the code actually says (and where Product Office was wrong)

Five findings that change the plan:

1. **The card is already presentation-only.** `CurrentWorkCard.tsx` has **no** business literals and **no**
   `stage_key`/`status`/`journey_segment` string branches — every label comes from the VM. The derivation contract is
   *already* largely satisfied in the presentation. → *PO "Slice 1: lock the VM / prove no hardcoding" is mostly
   already true; it is a test-hardening chore, not a prerequisite.*
2. **The VM already exposes everything the mock needs.** `CurrentWorkSurfaceVM` carries `title`, `description`,
   `status`, `primaryAction`, `supportingActions`/`communicationActions`/`alternatePaths`, `completionOutcomes`
   (declare-only), `lastActivity`, `isEmpty`, and **`readiness.requirements.items[]` with `{label, status}`**. The
   "Ready to continue ✓ / Still needed •" view is a **split of an array the VM already produces** — no new VM field, no
   runtime change. → *PO framed the presentation evolution as needing VM/derivation work first. It does not. This makes
   the flagship visible change a pure, isolated presentation PR.*
3. **Recomposition is orthogonal and already landed.** The confirmed inline gap in `useRecordWorkRuntime.onQueueUpdated`
   is fixed (`9f5924428`): it re-projects on `stage_work_outcome` with a stale-response guard. The "feels alive"
   property does not depend on the presentation rewrite. → *PO ordered recomposition (Slice 4) after presentation;
   correctly front-loaded here as isolated runtime.*
4. **Child grain is architectural, not a one-line thread.** `buildExecutionSubject` (`projectStageWorkRuntime.ts:394`)
   is **stage-scoped** — it returns one execution subject per stage projection. `StageOutcomeExecutionSubject` already
   supports optional `customer_member_id`/`process_instance_id`, and the executor resolves via `resolveChildSubjectId`,
   but the projection never populates them, and a family can hold *multiple* children at once. Correct child grain needs
   a **per-work-item** subject and is gated behind `isChildcareOperationalEnrollmentV1EnabledForOrg`. → *PO "Slice 3:
   carry the child id" understated this by an order of magnitude. Isolate it, flag-gate it, do it late.*
5. **Command integration is largely done.** The primary action is already a registry-resolved `CurrentWorkActionVM`
   (`execution`/`primaryAction`), routed through `runRegisteredAction`; header and card resolve the same capability. →
   *PO "Slice 5: converge command launch" is mostly verification, not new work.*

**Baseline hazard (must be handled first, not mid-refactor):** the rebased `origin/staging` already has ~4–5 **failing
current-work/lifecycle tests** — brittle *source-string* assertions that drifted from staging refactors (e.g.
`currentWorkCard.test.tsx` asserts the card source contains `case "inline_form"`, which legitimately moved to
`CurrentWorkActionPanel.tsx`; plus `currentWorkCardEvidence` `statusChip`, `completeStageWorkWithOutcome`,
`currentWorkOperationalSurface`). These will fight the presentation refactor and make "pass tests" ambiguous.

---

## 2. Minimum to feel "this is a different product"

**One presentation PR over the existing VM.** If Current Work stops leading with a percentage meter and a generic
progress frame, and instead shows **one obligation → why → one action → Ready/Still-needed**, and (already true) it
**recomposes live** after an action — the operator feels a different product on the first screen. That requires **no
runtime change, no config change, no new VM field**. Everything else (workspace retirement, child grain, config
labels) deepens it but is not required for the felt change.

---

## 3. Engineering roadmap — independently shippable milestones

Each milestone compiles, passes tests, passes QA, and leaves a valid product. None requires a later one to fix it.
**M0 already landed this session.**

### M0 — Landed (title rename + inline recomposition) ✅
Already committed and validated (`1e78729e3`, `9f5924428`): operator title → "What's Next"; inline recompose on
`stage_work_outcome` + stale-response guard. Zero new test failures vs pure staging baseline. *(Included for
completeness; no further work.)*

### M0.5 — Stabilize the test baseline *(prerequisite, tiny, no product change)*
- **Goal:** make "pass tests" unambiguous before touching the card. No operator-visible change.
- **Runtime:** none. **Presentation:** none. **Config:** none.
- **Tests:** convert the ~4–5 pre-existing brittle *source-string* assertions to **behavioral** assertions
  (`renderToStaticMarkup` / VM output), or move them to where the logic now lives (`CurrentWorkActionPanel`). Do not
  change product code to satisfy a stale string.
- **QA:** none (test-only).
- **Rollback:** revert the test edits; trivially safe (tests only).

### M1 — Obligation-first presentation over the existing VM *(the "different product" moment)*
- **Goal:** the operator opens a subject and sees one obligation, why, one primary action, then readiness as
  Ready/Still-needed — no percentage meter, no "Open workspace →".
- **Runtime:** **none.** Reads the existing VM only.
- **Presentation:** `CurrentWorkCard.tsx` summary body only — reorder to obligation → why → primary → secondary →
  readiness → prior activity → waiting/settled; **remove `SurfaceProgress`** (`%` + "N of M requirements complete") and
  the **"Open workspace →"** affordance from the summary; render readiness by splitting
  `vm.readiness.requirements.items` into satisfied (`status === "complete"`) and still-needed. Keep all action-routing,
  mutation seams, and the workspace *mode* intact (workspace retired later in M3).
- **Config:** none.
- **Tests:** new `renderToStaticMarkup` structural tests — obligation present, primary present, **no `%`/meter**, Ready
  and Still-needed sections derived from VM items, empty sections omitted; extend the billing-parity test to confirm the
  new layout renders for a non-enrollment BP with no enrollment branch.
- **QA:** New inquiry, follow-up, and enrolling subjects show the obligation-first card; after an action it recomposes
  (M0) with no reload; percentage meter is gone. *(Structural tests pass now; visual QA when the authenticated preview
  is unblocked — see risks.)*
- **Rollback:** revert one component file. No runtime/config/schema touched.

### M2 — State completeness: waiting · blocked · completed · multi-work *(presentation)*
- **Goal:** calm waiting ("Nothing needs your attention" + what's awaited), blocked (plain reason + owner handoff +
  disabled primary), quiet completion ("Done" → next), and Priority / Also active / Completed grouping.
- **Runtime:** none. Uses existing `isEmpty`, `status`, `readiness`, `primaryWorkItem` + `additional`, `lastActivity`,
  `OutcomeCompleteBody`.
- **Presentation:** `CurrentWorkCard.tsx` — the state branches over VM fields; group multiple items.
- **Config:** none.
- **Tests:** one structural test per state; multi-work ordering from VM (no component-specific ordering).
- **QA:** scheduled-tour waiting; blocked child work with handoff; completed → settles + next; multi-child two items.
- **Rollback:** revert the component; M1 remains valid on its own.

### M3 — Retire / narrow the expanded workspace *(presentation + composition)*
- **Goal:** remove the second "application inside the card"; fold its unique value into summary/inline.
- **Runtime:** none of the work runtime; touches the Focus Panel *coordination* seam only.
- **Presentation:** collapse `CurrentWorkWorkspace.tsx` unique surfaces (outcome picker, "Other transitions", activity)
  into the summary/inline; remove the `openCurrentWorkWorkspace` affordance and the `presentation="workspace"` branch
  once parity is proven; update `OpportunityFocusPanelModeGrid` host.
- **Config:** none.
- **Tests:** update `currentWorkFocusWorkspace.test.tsx`; assert no capability lost (outcome-led still promotes Record
  Outcome inline).
- **QA:** every action previously reachable only in the workspace is reachable inline; no dead "Open workspace" link.
- **Rollback:** keep the workspace seam mounted; the affordance removal is a one-line revert. **Fold-before-remove.**

### M4 — Child-grain per-work-item subject *(runtime, flag-gated)*
- **Goal:** child-grain work names its child and completes from the card without the executor "Could not resolve child"
  error; multiple children coexist.
- **Runtime:** move the execution subject from stage-scoped to **per `StageWorkItemProjection`**; populate
  `customer_member_id`/`process_instance_id` on child-grain items in `projectStageWorkRuntime`; thread through
  `completeStageWorkWithOutcome`. Behind `isChildcareOperationalEnrollmentV1EnabledForOrg`.
- **Presentation:** child name already supported by the VM subject; minor.
- **Config:** none (uses existing enrollment stage plans).
- **Tests:** lifecycle — child-grain outcome resolves the child and commits; `stageWorkRuntimeProjection` per-item
  subject; family-grain unchanged.
- **QA:** multi-child household completes a child-grain step in-panel (flag on, seeded org).
- **Rollback:** feature flag off restores today's behavior; the projection change is additive (family path unchanged).

### M5 — Configuration follow-up (§9-bis) *(config + one handler)*
- **Goal:** non-defective enrollment labels + a terminal enrollment capability.
- **Runtime:** register the completion capability handler for the frozen terminal-enrollment pipeline (capability, not
  copy).
- **Presentation:** none (labels are runtime-derived; the card already renders whatever config supplies).
- **Config:** apply the approved label corrections + gated `enrolled` transition in the stage operating plans/template,
  **and a re-seed migration for persisted tenant `departments.metadata`**; converge the stage vocabulary; fix the
  `reschedule`→`reschedule_tour` and catalog-label gaps.
- **Tests:** label change reflects with no presentation-code change; terminal transition gated on Required Information.
- **QA:** the Enrollment-specific scenarios (decision/waitlist surfaces, enroll-complete).
- **Rollback:** config/seed revert; capability handler behind the same flag as M4.

---

## 4. Challenge the implementation

- **Harder than we think:** M3 (workspace retirement) — the workspace hosts real capabilities (outcome picker, "Other
  transitions", stage-transition panel) reached only there today; folding them inline without losing a path is the
  fiddliest work. M4 (child grain) — per-item subject changes the projection shape that several consumers read.
- **Hidden coupling:** (a) the card's `presentation="summary"|"workspace"` seam and the coordination model
  (`openCurrentWorkWorkspace`) are entangled with the ModeGrid host — M1 must *not* touch them (only summary body), or it
  balloons. (b) `projectCurrentWork` adds legacy fields (`progressLabel`, `progressVerdict`, legacy `checklist`) that
  other surfaces (queue summary) may read — removing the meter from the *card* must not remove these VM fields. (c) two
  refresh owners (`useWorkIntentOutcomeCompletion` drawer path vs `useRecordWorkRuntime` inline path) — M0 fixed inline;
  don't assume the drawer path behaves identically.
- **Likely regressions:** the **brittle source-string tests** (M0.5 exists to defuse this); the billing-parity tests if
  the new layout accidentally special-cases enrollment; queue-row Current Work summary if a shared VM field is dropped.
- **Technical debt hiding:** the dual stage vocabulary + dangling `qualification` transition
  (`defaultEnrollmentStageOperatingPlans.ts:611`); `classifyCurrentWorkActions.isEnrollmentIntentAction` hardcodes
  intent keys in the derivation lib; no correlation-id guard on the *drawer* refresh path (only inline, added in M0).
- **Wrong PO assumptions (from §1):** VM work is *not* a prerequisite for presentation; child grain is architectural not
  a thread; command convergence is mostly done; the card has no hardcoded vocabulary to remove. Net effect: the biggest
  visible win is also the *smallest, safest* PR — so it should go first, which the PO order did not do.

---

## 5. Optimization (how the milestones are shaped)

- **Smallest PRs:** M1 and M2 touch essentially one file (`CurrentWorkCard.tsx`) + its tests. M0.5 is tests-only. M4/M5
  are isolated to the runtime/config they own.
- **Easiest review:** presentation diffs read against the frozen mock; no runtime semantics to reason about in M1/M2.
- **Easiest rollback:** M1/M2/M3 revert a single component/affordance; M4 is a feature-flag flip; M5 is a config/seed
  revert. No schema or runtime-kernel change anywhere.
- **Safest runtime changes:** the only runtime edits are M0 (done, isolated) and M4 (flag-gated, additive). Presentation
  milestones carry zero runtime risk.
- **Minimal merge conflicts:** M1→M2→M3 are sequential on the card file (same owner, no cross-conflict). M4 (lifecycle)
  and M5 (config) are different trees → parallel-safe.
- **Highest value earliest:** M1 delivers the "different product" feeling in the first PR.

---

## 6. End state

### Final roadmap
**M0 (done) → M0.5 stabilize tests → M1 obligation-first card → M2 states/multi-work → M3 retire workspace → M4
child-grain (flag) → M5 config follow-up.**

### Critical path
**M1 unlocks everything visible.** It depends only on the existing VM (ready today) and is made "alive" by M0 (already
shipped). M0.5 is a 1–2 hour de-risk before M1. Nothing else gates M1.

### Biggest engineering risks (ordered by likelihood)
1. **Brittle source-string tests break the card refactor** (HIGH — already failing). → M0.5 first.
2. **Visual validation is blocked** — authenticated preview fails on the cert-platform SSR session-cookie handshake, so
   M1/M2 can pass *structural* tests but not full operator visual QA until that's fixed (MEDIUM-HIGH). → treat the
   cert-cookie fix as a QA-enablement task parallel to M1.
3. **Workspace retirement drops a capability** (MEDIUM). → fold-before-remove (M3 after M1/M2).
4. **Child-grain projection ripple + flag** (MEDIUM). → isolate M4, additive, flag-gated.
5. **Config labels not reflected in persisted tenant metadata** (MEDIUM). → re-seed migration in M5.
6. **Recompose edge cases** (LOW — M0 shipped/validated). → watch drawer-path parity.

### What can happen in parallel
- **Engineer A (presentation):** M0.5 → M1 → M2 → M3, sequential on `CurrentWorkCard.tsx` (avoids self-conflict).
- **Engineer B (runtime):** M4 child-grain in `lib/lifecycle/*` — independent tree, parallel from day one.
- **Engineer C (platform/QA):** fix the cert-platform SSR cookie to unblock authenticated QA (parallel, unblocks R2);
  then M5 config once Product Office label approvals land.
Three engineers can run M1-track, M4, and QA-enablement/M5 simultaneously with no shared files.

### Recommendation (as Engineering Director)
**Change the order.** Do **not** implement PO's sequence (lock VM → presentation → grain → recompose → command →
readiness). Reading the code: the VM is already sufficient, recompose was the real gap (front-loaded and done), and the
presentation change is the smallest, safest, highest-value PR — so it goes **first**, after a tiny test-baseline
stabilization. Child grain and config are isolated later tracks, not early blockers. This ordering ships the felt "different
product" in one revertible presentation PR while the risky runtime/config work proceeds in parallel and gated.

---

## If I owned this implementation, where would I start Monday morning?

**Monday: M0.5 then M1 — the obligation-first `CurrentWorkCard` summary over the existing `CurrentWorkSurfaceVM`.**
First convert the ~4–5 drifted source-string tests to behavioral `renderToStaticMarkup`/VM assertions so "green" means
something. Then, in one PR touching only `CurrentWorkCard.tsx` and its tests: reorder to obligation → why → primary →
secondary, render readiness as **Ready to continue ✓ / Still needed •** by splitting the VM's existing
`readiness.requirements.items`, and delete the `SurfaceProgress` percentage meter and the "Open workspace →" affordance
from the summary. No runtime, no config, no VM change — and because recomposition already landed, the card updates live
the moment the operator acts. That single, trivially-revertible PR is where the operator first says "this is a different
product," and it becomes the first engineering sprint.
