---
owner: platform
status: active
last_reviewed: 2026-07-19
---

# Runtime Purification Review

## Deleted (this session)

- **`OpportunityFocusPanelCommitCriticalBody.tsx`** — folded into the one `OpportunityFocusPanelBody`
  (`e678f444a`).
- **Standalone pending Current Work renderer removed from the Focus Panel** — the pending branch no
  longer renders `LayoutRuntimeCurrentWorkWidget`/`CurrentWorkRuntimeCard`; it renders the same grid
  via the commit-critical model (`881e4b6aa`, `e678f444a`).
- **`compat.subjectVm`** removed from `FocusPanelCardCompat` and every call site (`881e4b6aa`). The
  drawer VM no longer leaks to any card; the lifecycle rail + comms preview are context projections.
- The grid's internal `buildOperationalContext(displayVm)` + `deriveOpportunityFocusPanelPresentation(displayVm)`
  calls were removed — those derivations now live in the producers.

## Deleted (prior sessions, still relevant context)

- Abandoned Operational Graph (`operationalGraph.ts` + compile/materialize + flag), Prepared
  Destination store, dead SurfaceHost reducer/state/context, `surfaceRefToPath`/`isSameSurface`.

## Remaining legacy / compatibility (NOT yet removable)

- **`OpportunityDrawerViewModel` (= `OperationalSubjectViewModel`)** — the broad drawer aggregate. Still
  the ENRICHED source (the drawer VM is projected to the model by `focusPanelWorkModeModelFromDrawerVm`).
  It remains the record-VM/Settlement carrier; not removable until Settlement itself is re-projected.
- **`OpportunityFocusPanelModeBody.tsx`** — still used by the MODAL drawer runtime
  (`OpportunityDrawerVmRuntime`). It is no longer used by the inline Focus Panel. Removable only when
  the modal drawer is also migrated (or retired).
- **`LayoutRuntimeCurrentWorkWidget` / `CurrentWorkRuntimeCard`** — no longer used by the Focus Panel,
  but still used by `LayoutRuntimePlanView` (a different surface). Not globally dead.
- **Hardcoded card logic** — `buildCardModels` (per-key `map.set`) and `FocusPanelCardRenderer`'s
  per-key switch. Not "legacy" per se, but the archetype-driven rewrite (see
  `runtime-scalability-review.md`) supersedes them.
- **Late settlement right-rail fetch** — `useWorkUnitSettlement` still fetches + overlays the right-rail
  actions after commit, now redundant with the answer's `actionsProjection` (kept this session to avoid
  a blind live-path deletion; the merge guard prevents a clobber). Should be removed with cert.

## Cleanup opportunities / delete before freeze

1. **Runtime test debt** — repair/rewrite/delete the pre-existing red focus-panel + runtime tests and
   the obsoleted architecture-cutover assertions; a baseline-red suite is not freezable (directive G).
2. **The redundant late right-rail settlement fetch** (above) — delete once B is browser-certified.
3. **The `.next-prodcert` scaffolding + `ALLOY_PROD_CERT_DIST` gate** — cert scaffolding; keep for prod
   cert, remove after freeze if desired.
4. **`OpportunityFocusPanelModeBody`** — retire when the modal drawer is migrated.
5. **Hardcoded card behavior** — replace with archetype-driven rendering (the scalability work), then
   delete the per-key model/renderer paths.

Nothing dangling was left uncommitted this session; the tree is clean.
