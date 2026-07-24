# Surfaces Product UI — Discovery & Classification

UI-only convergence of `/settings/surfaces` onto Category rail → Surface collection → Selected
Surface workspace (same family as Access Users and Business Processes). No new Surface runtime, no
parallel builder, no schema changes, no new cache/loader architecture. Every existing editor
(`FocusPanelSummarySurfaceEditor`, `QueueRowSurfaceEditor`, `WorkspaceHeaderSurfaceEditor`,
`WorkspaceProcessesSurfaceEditor`, `WorkUnitHeaderSurfaceEditor`,
`OperationalIntelligenceSurfaceBuilder`, `NestedSurfaceEditor`) is reused verbatim, rehosted inline
in a workspace tab instead of a detached full-bleed studio route.

Product owner doc: `docs/platform/operator/surfaces-product-ui.md`
Runtime certification matrix: `.alloy-agent-evidence/surfaces-ui-discovery/SURFACE-RUNTIME-CERTIFICATION-MATRIX.md`

## Critical product rule (why this sprint exists)

Before this sprint, selecting a Focus Panel and clicking Edit performed
`router.replace('/settings/surfaces?editor=1&layout=…')`, which flipped
`isExperienceBuilderStudioActive()` to `true` and swapped the entire Settings shell (Category rail,
Settings nav, everything) for a full-bleed builder. That is no longer the primary journey.
`?editor=1&layout=` is now **only** an optional deep-link that resolves INTO embedded Edit mode
inside the same Category → Collection → Selected Surface shell — the rails never disappear.

## What changed vs. what stayed

Stayed exactly as-is (reused, not touched):

- Every existing Surface editor component's internal implementation — `FocusPanelSummarySurfaceEditor`,
  `QueueRowSurfaceEditor`, `WorkspaceHeaderSurfaceEditor`, `WorkspaceProcessesSurfaceEditor`,
  `WorkUnitHeaderSurfaceEditor`, `OperationalIntelligenceSurfaceBuilder`, `NestedSurfaceEditor`.
- All Surface persistence endpoints (`entity-layouts` family, `surfaces/workspace-header`,
  `queue-row-layout`, operational-intelligence placements save path).
- `useSurfacesConfigurationSettings` — section/selection state hook — reused, not rewritten.
- `useWorkspaceProcessCatalog` / `useQueueRowProcessCatalog` — catalog loaders, reused.
- The legacy `/settings/layouts` route's full-bleed studio behavior (`entity_layouts` gallery) —
  intentionally left untouched; it is a separate back-compat redirect source, not part of this
  Surfaces product path.

Changed (this sprint):

- Page entry (`web/app/adminV2/settings/surfaces/page.tsx`) always mounts
  `SurfacesConfigurationPage`; `OrganizationDomainLanding` is no longer the default render path.
- `SurfacesConfigurationPage.tsx` rewritten into a three-column shell: category rail (left),
  collection rail with search (middle), selected-Surface workspace with a 6-tab bar (right):
  **Overview · Edit · Assignments · Versions · Health · History**.
- New **Overview** tab (`SurfacesOverviewPanel.tsx`) — presentation-only snapshot, composition
  hint, assignments hint, publication note, health entry point.
- Editors are rendered **inline** inside the Edit tab's main pane instead of replacing the page.
  `onBack` now calls `setTab("overview")` — a local state change, never a route navigation.
- `isExperienceBuilderStudioActive()` now explicitly returns `false` for any `/settings/surfaces`
  path. Full-bleed studio chrome is disabled for the Surfaces product path entirely; it remains
  active only for the legacy `/settings/layouts` gallery route.
- `web/lib/configRuntime/surfacesLandingModel.ts` — `summaryCards: []`; purpose text calmed;
  tiles kept as deep-link hrefs only (compat, not the default render path).

## Files touched

| File | Change |
|---|---|
| `web/app/adminV2/settings/surfaces/page.tsx` | Always renders `SurfacesConfigurationPage`. Parses `?section=`, `?layout=`, `?editor=1`, `?tab=` into `initialSection` / `initialSurfaceId` / `initialTab`; no longer imports `OrganizationDomainLanding`. |
| `web/components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx` | Rewritten: category rail (`SurfacesCategoryNav`) + collection rail (`ConfigurationQueue` + search) + selected-Surface workspace (`ConfigWorkspaceTabBar`, 6 tabs). Editors rendered inline in `renderEditTab()`. Single `useEffect` resolves `?layout=`/`?tab=`/`?editor=1` into local state only — no `router.replace`, no `enterFocusPanelStudio`/`exitStudio`, no `isFullBleedWorkspaceEditor` branch. |
| `web/components/adminV2/settings/surfaces/SurfacesOverviewPanel.tsx` | **New.** Presentation-only: Surface Snapshot, Composition Summary, Used By / Assignments, Publication, Health — each derived only from `selectedObject` / bound catalog entry already in memory; no independent fetch. |
| `web/lib/adminV2/settings/surfaces/surfacesNavigationModel.ts` | Extended: `sectionSubtitle()`, `SurfaceWorkspaceTab` type, `SURFACE_WORKSPACE_TABS`, `editorKindLabel()`. |
| `web/lib/configRuntime/surfacesLandingModel.ts` | `summaryCards: []`; purpose: "Configure the presentation operators use across Alloy."; tiles retained as deep-link hrefs only. |
| `web/lib/layout/experienceBuilderStudioMode.ts` | `isExperienceBuilderStudioActive()` returns `false` for any `/settings/surfaces` path before evaluating `?editor=1&layout=` — full-bleed studio chrome disabled for the Surfaces product path. `/settings/layouts` behavior unchanged. |
| `web/tests/configRuntime/organizationDomainLandings.test.ts` | Updated Surfaces assertions for always-mounts-workspace entry + empty `summaryCards`. |
| `web/tests/adminV2/adminV2ShellStudioGating.test.ts` | Updated: studio mode is `false` for `/settings/surfaces?editor=1&layout=…`, still `true` for `/settings/layouts?editor=1&layout=…`. |
| `web/tests/adminV2/runtime/focusPanelSummarySurfaceEditor.test.tsx` | Removed assertions tied to full-bleed navigation (`enterFocusPanelStudio`, `exitStudio`, `router.replace`, `data-focus-panel-builder-wide`); added assertion that the editor renders inline with `onBack` wired to `setTab("overview")`. |
| `web/tests/surfaces/surfacesProductUi.test.ts` | **New.** Page-entry, landing model, no full-bleed navigation source guards, tab structure, Planned markers, category keys, inline editor embedding for every editor kind. |

## Classification: Real vs Planned

| Surface | Status | Why |
|---|---|---|
| Category rail, collection rail (search), selected-Surface header, tab navigation | **Real** | Pure presentation over `useSurfacesConfigurationSettings` / catalog hooks already loaded. |
| Edit tab (all 6 editor kinds + nested surface) | **Real** | Unmodified existing editor components, only reachable inline instead of via full-bleed navigation. |
| Overview tab (Snapshot, Composition Summary, Used By/Assignments, Publication, Health entry) | **Real** | Composed entirely from `selectedObject` + bound catalog entry already in memory; no new fetch. |
| Assignments tab — process-bound surfaces (Queue Row, Workspace Process Summary) | **Real** | Reads the same `LifecycleCatalogEntry` binding already resolved for the collection rail; deep-links to Processes. |
| Assignments tab — org-wide singleton surfaces (Workspace Header, Work Unit Header, Operational Intelligence) | **Real, truthful** | States plainly these are org-wide singletons with no per-location/per-process assignment to configure — does not fabricate an assignment table. |
| Assignments tab — surfaces with no known binding | **Planned** | `data-capability="planned"` calm note: "A dedicated Business Process assignment table for this Surface is planned. No assignment is fabricated here." |
| Versions tab | **Planned** | No cross-editor version-history read exists; each editor's own draft/publish state stays inside its own Edit tab. `data-capability="planned"`. No version numbers invented. |
| Health tab | **Planned** | No composition/assignment health evaluator exists yet for Surfaces as a whole. `data-capability="planned"`. No percentage scores invented. |
| History tab | **Planned** | Same pattern as Access / Business Processes History. `data-capability="planned"`. No events fabricated. |
| Studio chrome disable for `/settings/surfaces` | **Real** | `isExperienceBuilderStudioActive()` now returns `false` unconditionally for this path; verified by `adminV2ShellStudioGating.test.ts`. |

## Rules followed

- **UI-only.** No migrations, no new mutation endpoints, no new persistence paths, no changes to
  any editor's internal save/publish logic.
- **No detached full-bleed as primary journey.** `SurfacesConfigurationPage.tsx` contains no
  `enterFocusPanelStudio`, no `exitStudio`, no `router.replace` for Surface selection or Edit —
  verified by source-guard assertions in `surfacesProductUi.test.ts`.
- **Deep-link compat preserved.** `?editor=1&layout=X` still works — it now resolves into
  `tab="edit"` + `selectedId=X` inside the mounted shell instead of swapping the page.
- **Planned ≠ fake fetch.** Versions, Health, History, and unresolved Assignments render static
  Planned copy with `data-capability="planned"`; none issues a request to a non-existent endpoint.
- **No new cache/loader architecture invented.** The runtime certification matrix
  (`SURFACE-RUNTIME-CERTIFICATION-MATRIX.md`) documents the *existing* seed/fetch topology for each
  Surface type truthfully, including known gaps (Focus Panel Summary re-fetch after seed,
  Workspace Header client-primary load) — this sprint does not touch or "fix" that runtime wiring.
- **Studio chrome scoped precisely.** Only `/settings/surfaces` is excluded from
  `isExperienceBuilderStudioActive()`; `/settings/layouts` (legacy back-compat gallery) keeps its
  existing full-bleed behavior unchanged.

## Known gaps / follow-ups (explicitly out of scope here)

1. **Focus Panel Summary secondary client fetch** — the Focus Panel host seeds
   `summaryDocSeed` from the server-composed provisioning answer, but
   `usePublishedFocusPanelSummaryDocForScope` still fires a client `fetch` to
   `/api/admin/entity-layouts/focus-panel-summary` after mount and replaces the seed once it
   settles. This is a pre-existing runtime characteristic, not introduced by this sprint, and is
   **not** certified as SSR-only. See the certification matrix for detail. Fixing this (e.g. by
   trusting the seed and skipping the refetch) is a separate runtime sprint.
2. **Workspace Header client-primary load** — `useWorkspaceHeaderSurfaceConfigState` is the
   *primary* load path (no SSR seed exists for it); this is a known gap for a later sprint, not
   something this UI-only pass invents a fix for.
3. **`buildWorkUnitHeaderPresentation` is builder/test-only** — the Work Unit Header runtime does
   not call the function the editor uses to preview; it composes header geometry from
   `workUnitHeaderConfigFromLayoutDoc` inside `resolveOperationalPresentation` instead. Both paths
   read the same published `LayoutDoc`, but they are not the same code path. Documented, not
   unified, in this pass.
4. **Versions / Health / History tabs are intentionally empty Planned surfaces** — no
   cross-Surface version/health/history data model exists yet. Building one is a separate product
   decision, not attempted here.
5. **Assignments table for non-catalog-bound surfaces** — no generic Business-Process-assignment
   API exists for Surfaces that aren't already resolved through a `LifecycleCatalogEntry`; the
   Overview/Assignments tabs show a calm Planned note instead of inventing one.

## Browser QA

Not performed as part of this pass (no `--with-server` session was started); typecheck +
targeted Vitest suites (see Phase F below) were used to validate. A follow-up pass can capture
`.alloy-agent-evidence/surfaces-ui-discovery/qa/` screenshots the same way Access/BP did.
