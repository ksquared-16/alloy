---
owner: platform
status: active
last_reviewed: 2026-07-19
---

# Focus Panel Runtime — Final Review

The final understanding of the Focus Panel runtime at session close. Read
`docs/platform/experience/focus-panel-work-mode-model.md` for the contract.

## What was fixed (this session)

- **Source-agnostic model.** The grid (`OpportunityFocusPanelModeGrid`) consumes ONE canonical
  `FocusPanelWorkModeModel` (`lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel.ts`), never the
  drawer VM. Both producers emit it identically — `focusPanelWorkModeModelFromProvisioningAnswer`
  (commit-critical) and `focusPanelWorkModeModelFromDrawerVm` (enriched). The grid never branches on
  source. (`881e4b6aa`)
- **Configuration-driven composition.** The set of cells comes from the published composition, never
  from data presence. The `visible:false` data-driven drop is removed; a missing settlement value
  RESERVES a cell, never removes it. (`881e4b6aa`)
- **`compat.subjectVm` eliminated.** No card reads the drawer VM. The two settlement drill fields
  (`lifecycleRail`, `communicationsPreview`) are projected into `OperationalContext` by the one adapter
  (`buildOperationalContext`). (`6c3559e6c`, `881e4b6aa`)
- **Shared card builders.** `buildCurrentWorkCardModel`, `buildHouseholdCardModel`,
  `buildChildrenCardModel` are shared by both producers, so those cards are byte-identical
  pending → enriched. (`62ac1002a`, `b47c19ac3`)
- **Remount elimination + unified body + stable key.** ONE `OpportunityFocusPanelBody` renders the
  same grid instance for both models under a stable subject-id key. The pending→enriched transition is
  a model prop change, not a remount — no grid teardown, no lane re-resolution, no Current Work resize.
  (`e678f444a`)
- **Preparation completeness (partial).** Household + Children carry commit-critical content in the
  answer (`focusPanelSubjectSnapshot`, no new DB read) and render ready at commit. (`b47c19ac3`)
- **Reserved ≠ blank.** Reserved cells show card identity + "Preparing…", not blank white
  rectangles. (`c3641cd6e`)

## What still fails (browser evidence)

- **Current Work is no longer the architectural issue.** Its resize was a remount artifact, now fixed.
  It renders from the answer's `stage_work_runtime` through the same `CurrentWorkCard`.
- **Preparation completeness is the live problem.** Before `b47c19ac3` the committed model carried only
  `current_work`; every other card was a blank reserved cell until the drawer VM (Settlement) landed —
  the operator saw a Current Work preview plus placeholders. Household + Children are now fixed;
  Readiness and any other knowable card still need promotion, and the fix is **browser-unverified**.
- **Summary vs detailed composition (the biggest remaining issue).** The panel presents the EXPANDED /
  detail card presentation, not the published **Summary** composition. The committed operator
  experience should be the Summary composition; the expanded detail is a drill/Settlement concern. This
  is why the panel "shows the wrong level of information" even when cells are filled.
- **Staged readiness.** With only some cards ready at commit and the rest settling, there remain
  multiple visible readiness moments. Completing the Summary composition (all Summary cards ready or
  meaningfully reserved) collapses this to one boundary.
- **Timing not measured.** No instrumentation for commit → answer → model → per-card ready → Settlement,
  so "completeness" is asserted, not proven. This must be added before A is called complete.

## Product feedback (captured explicitly — carry to the next session)

1. **The Focus Panel currently shows the wrong level of information.** It should INITIALLY present the
   published **Summary** composition, not the expanded detail presentation.
2. **The runtime must honor the published Focus Panel composition.** The committed panel is what the
   published Summary doc declares — cards, order, placement.
3. **Changing the published configuration must not require engineering.** A Product change to the
   Summary composition should just be honored by the runtime.
4. **The runtime should operate from card ARCHETYPES and published placement, not hardcoded card
   behavior.** Today `deriveOpportunityFocusPanelCards.buildCardModels` and `FocusPanelCardRenderer`'s
   per-key switch hardcode card logic; this must move to archetype + published-config driven rendering.
   See `runtime-scalability-review.md`.
