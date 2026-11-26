---
owner: platform
status: runtime-consumer-completion-in-progress
last_reviewed: 2026-07-19
---

# Runtime V1 — Consumer Completion Status

Branch `agent/claude/3-runtime-drawer-deletion` @ `cc6930d43` — **94 ahead / 0 behind `origin/staging`**,
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

Delivered SESSION 2026-07-19b (commit hashes):

- `26d690564` — **Readiness ready-at-commit** via ONE shared evidence-derived model
  (`buildReadinessCardModel`, derived from the SAME `buildReadinessCardEvidence` the card body
  renders, used by BOTH producers; the enriched path's separate `readinessKpiInsight` derivation
  deleted). Settlement attention blockers enrich the same cell in place.
- `9ca325c41` — **timing instrumentation** (`focusPanelCommitTiming.ts`): destination commit (K3
  `onCommitCompleted`) → `model_commit_critical` → per-card `card_ready` → `settlement`, each with
  `since_commit_ms`. Console filter `[perf:work-unit] focus_panel_chain:*`; mirrored to
  `window.__alloyPerf.marks`. Dev/staging gated, boundary-only.
- `a70bd8255` — **published Summary composition is COMMIT-CRITICAL.** The answer resolves the
  applicable published Focus Panel Summary doc server-side (P3-A resolver, `fps:` config-cached,
  publish/rollback/delete-invalidated) and carries it (`focusPanelSummaryDoc`); the doc seed threads
  committed snapshot → `OperationalSubject` → `FocusPanelSummaryDocProvider`, which treats it as the
  loaded answer until the scope fetch settles. First committed frame = the PUBLISHED composition —
  no default-doc stand-in, no post-commit composition reflow. (This was the root of the "detail at
  commit" complaint: mode was already `summary` and densities compact; the default doc was standing
  in for the async published-doc fetch.)
- `cc6930d43` — **commit-critical ready set DERIVED from a declared registry**
  (`focusPanelCommitCriticalCards.ts`, scalability gap 4 for the existing card set): the producer
  iterates specs declaring `isKnowable(context)` + `build(context)`; promoting the next knowable
  card is one registry entry.

---

## IN PROGRESS

### A — Focus Panel atomic composition (engineering COMPLETE for the knowable set; cert pending)
- **Implementation state:** remount eliminated; composition configuration-driven AND commit-critical
  (the answer carries the published Summary doc — first committed frame is the published
  composition); Current Work + Household + Children + **Readiness** ready at commit from the answer
  with no new DB read, via the declared commit-critical registry; reserved cells show identity;
  timing instrumentation in place. Source typecheck clean; producer tests green (7/7); no new
  failures vs the baseline-red suite.
- **Browser state:** STILL UNVERIFIED against the authenticated operator experience. The in-app pane
  has no session (separate cookie jar) and the Claude-in-Chrome extension was not connected this
  session. Unauthenticated smoke passed (routes compile: /admin 307, provisioning-answer 401 honest,
  summary-doc API 401).
- **Remaining engineering:**
  1. Cold-frame browser cert (operator-blocked on auth): committed panel = published Summary
     composition, meaningfully complete, no preview-plus-placeholders, no geometry shift; read the
     `focus_panel_chain:*` marks to PROVE commit → complete-panel gap ≈ 0.
  2. Classify any remaining published-doc cells (tour/communications/documents are genuinely
     Settlement; nothing else is currently knowable at commit).

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
