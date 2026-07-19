---
owner: platform
status: runtime-consumer-completion-in-progress
last_reviewed: 2026-07-19
---

# Runtime V1 — Consumer Completion Status

Branch `agent/claude/3-runtime-drawer-deletion` @ `c3641cd6e` — **89 ahead / 0 behind `origin/staging`**,
tree clean, nothing pushed, no PR, no merge.

This session did **Runtime Consumer Completion** on top of the accepted Runtime platform. The platform
architecture is not reopened. This document is the authoritative status: what is complete, what is
partial, and the remaining checklist.

---

## COMPLETED

Architecture/platform accepted before this session (do not reopen):

- **Runtime platform / kernel** — Attention (K1), Provisioning (K2), Focus (K3), atomic commit.
- **Canonical Destination identity** — `lib/runtime/graph/destinationId.ts` + `resolveOperationalDestination.ts`.
- **Preparation pipeline** — `prepareOperationalDestination` / `workUnitProvisioningPrefetch` (URL cache, canonical-identity-keyed) + `prewarmRecordWork`.
- **Provisioning pipeline** — `lib/runtime/kernel/provisioning.ts` + D1 answer `workUnitProvisioningAnswer.ts`.
- **Runtime ownership** — one owner per responsibility (see `docs/handoffs/runtime-v1-freeze-report.md` §2).
- **Prior purification** — abandoned Operational Graph, Prepared Destination store, dead SurfaceHost state deleted.
- **B2 Back/Forward** — `history.state` DestinationId stamping (`d861ad4dc`, pre-session; browser-certified earlier).
- **B4 provable-dead deletion** — `surfaceRefToPath` / `isSameSurface` (`5de295cb9`, pre-session).
- **B5 publish-driven config invalidation** — `hdr:` / `qrl:` / `dept:` (`9740595c6`, pre-session).

Delivered THIS session (commit hashes):

- **B — Work Unit Actions Runtime (server-side complete):**
  - `20443d02b` — the provisioning answer carries a resolved right-rail `actionsProjection` (count + identities + availability/order/placement) from the SAME `/process` resolver Workspace uses (`loadRightRailActionsBundleServer`), resolved concurrently, config-cached (`act:`), non-fatal; rendered at commit in `workUnitSurfaceModelFromSnapshot`. The settlement merge only overlays non-empty results, so it can't clobber the committed count to zero (no Actions(0) flash).
  - `79e07f31a` — `act:` cache invalidation wired into every `/process` action write (placements POST/PATCH/DELETE, definitions PATCH, stage-actions POST).
- **A — canonical FocusPanelWorkModeModel + source-agnostic grid:**
  - `40a4f9afe` — the canonical `FocusPanelWorkModeModel` contract + the resolved input-boundary doc (`OperationalSubjectViewModel` = the legacy drawer aggregate; `OperationalContext` is the forward contract) + committed-subject extensions (`publishedStageInputs`, `workIntentRuntime`).
  - `fa2ee0cc6` — producer: drawer VM → model (enriched source).
  - `62ac1002a` — producer: provisioning answer → model (commit-critical) + shared `buildCurrentWorkCardModel`.
  - `6c3559e6c` — projected the two settlement drill fields (`lifecycleRail`, `communicationsPreview`) into `OperationalContext`, containing the last VM reads to the adapter.
  - `881e4b6aa` — **`OpportunityFocusPanelModeGrid` consumes `FocusPanelWorkModeModel`** source-agnostically. Configuration determines composition; readiness determines content; `visible:false` no longer removes configured cells; **`compat.subjectVm` eliminated**; the standalone `CurrentWorkRuntimeCard` pending path deleted from the Focus Panel.
  - `e678f444a` — ONE Focus Panel body (`OpportunityFocusPanelBody`) + stable subject-id key → **remount eliminated** (pending→enriched is a model prop change, not a remount).
  - `b47c19ac3` — **preparation completeness (partial):** the answer carries a `focusPanelSubjectSnapshot` (primary contact + `metadata.inquiry_children`, no new DB read); **Household + Children render READY at commit** via shared builders (byte-identical to enriched).
  - `c3641cd6e` — reserved cells show card **identity + "Preparing…"**, not blank white rectangles.

---

## IN PROGRESS

### A — Focus Panel atomic composition (NOT complete)
- **Implementation state:** remount eliminated; composition configuration-driven; Current Work +
  Household + Children commit-critical (ready at commit) from the answer, no new DB read; reserved
  cells show identity. Source typecheck clean; 16 producer/renderer unit tests green.
- **Browser state:** UNVERIFIED against the operator experience. The pane is isolated from Kelly's
  Chrome login (separate cookie jar), so cold-frame cert did not run this session. The last operator
  evidence (before the preparation-completeness commit) showed Current Work resize + blank cells; the
  fix is committed but not visually confirmed.
- **Remaining engineering:**
  1. **Summary-vs-detail composition (NEW, product-critical — see focus-panel-runtime-review.md §Product).**
     The panel currently presents the EXPANDED/detail card presentation, not the published **Summary**
     composition. The first committed operator experience must be the published Summary composition.
  2. Promote **Readiness** (and any other card whose first-operational content is now in `truth`) to
     ready-at-commit; classify the remaining SUMMARY_GRID cells against the published Summary doc.
  3. **Timing instrumentation** (destination commit → provisioning answer available → model available
     → each card ready → Settlement arrival) — NOT added; completeness must be measured, not asserted.
  4. Cold-frame browser cert: complete panel at commit, no preview-plus-placeholders, no geometry shift.

### B — Work Unit Actions Runtime
- **Implementation state:** server-side COMPLETE (answer carries actions, rendered at commit, publish
  invalidation wired). Browser cert (count at commit / no zero-flash / zero-one-multi / applicability)
  NOT run.
- **Browser state:** unverified.
- **Remaining:** browser cert; purge the now-redundant late settlement right-rail fetch in
  `useWorkUnitSettlement` (kept this session to avoid a blind live-path deletion).

### Runtime test debt
- **State:** the focus-panel test suite is heavily PRE-EXISTING red (15 failures on clean HEAD before
  this session) plus this session's grid refactor supersedes several `focusPanelArchitectureCutover`
  assertions (compat shape, grid-builds-context). Also 5 pre-existing runtime failures
  (`d1ProvisioningAnswer`, `d4SettlementReservedGeometry`) + the 10-error typecheck baseline (all in
  `tests/`). Not repaired this session (Kelly deferred to a dedicated sweep).
- **Remaining:** repair/rewrite/delete to the final contract (directive G); a baseline-red suite is not
  acceptable for freeze.

### Work View / Activity / Operational Workspaces (C, D, E and beyond)
- **State:** NOT started this session. `ProvisionedWorkUnitSurface` keys the shell by work-unit target
  (so a pill switch should not remount the shell), but no verification or runtime migration was done.

---

## REMAINING — Runtime Consumer Completion checklist

1. **Focus Panel preparation completeness** — Summary composition at commit (not detail); Readiness +
   remaining knowable cards ready at commit; timing instrumentation; cold-frame cert.
2. **Summary composition as the first committed experience** — honor the published Focus Panel Summary
   composition; detail is Settlement enrichment.
3. **Work View transition runtime** — New Leads / Active Pipeline / Registration / Waitlist / Tours
   feel like attention movement, not navigation; no page reload, no Focus Panel flash.
4. **Activity runtime** — prepared destination + atomic commit + retained geometry (D).
5. **Communications runtime** — canonical conversation surface (topic → thread → reply → compose in
   place) shared by Communications Workspace and Activity (E).
6. **Processing runtime** — inherit Destination → Preparation → Commit → Settlement.
7. **Work Items runtime** — same.
8. **Operational Intelligence runtime** — same.
9. **Runtime purification** — delete superseded owners (see runtime-purification-review.md).
10. **Runtime certification** — production-like browser cert across all consumers (directive F).
11. **Runtime freeze** — only when every item above is met.
