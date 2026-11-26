# Surface Runtime Certification Matrix

Truthful record of how each Surface type's **published configuration** reaches the **operator
runtime** (not the builder/editor preview). This is documentation of the existing topology — this
sprint (Surfaces Product Realization, UI-only) does **not** change any of these paths, does not
add a new cache/loader architecture, and does not "fix" the known gaps below. Where a secondary
client fetch exists, it is named and left as-is; certification status is reported honestly.

Research method: direct code reading (file:line citations), not speculation. Where the runtime
consumer was ambiguous, that ambiguity is stated rather than resolved by assumption.

## Legend

- **Initial payload owner** — what puts pixels/data on screen at first paint for the *committed*
  operator surface (not a builder preview).
- **Secondary fetch?** — does anything re-fetch published config from the client after mount.
- **Certified?** — "SSR-only" (no client refetch of this config), "Seed + refetch" (server seed
  exists but a client fetch still runs and can replace it), "Client-primary" (no SSR seed; client
  fetch is the only path), or "N/A" (authoring-only context).

## Matrix

| Surface | Assignment | Resolver (server) | Initial payload owner | Secondary client fetch? | Certified? | Notes |
|---|---|---|---|---|---|---|
| **Focus Panel Summary** | Per work-view / stage (`focusPanelSummaryRowsPromise`, `resolvePublishedFocusPanelSummaryRecord`) | `web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts:570-586,740-751` | Work Unit **provisioning answer** seeds `focusPanelSummaryDoc` → passed as `summaryDocSeed` (`ProvisionedWorkUnitSurface.tsx:126-128` → `InlineOpportunityFocusPanel.tsx:366-377`) | **Yes.** `FocusPanelSummaryDocProvider` always runs `usePublishedFocusPanelSummaryDocForScope`, which `fetch`es `/api/admin/entity-layouts/focus-panel-summary` (`usePublishedFocusPanelSummaryDoc.ts:67-75`) and **replaces** the seed once it settles (`usePublishedFocusPanelSummaryDoc.ts:174-178`) | **Seed + refetch — KNOWN GAP** | The client fetch is not fallback-only; it runs unconditionally and wins once loaded. Documented as a known gap per this sprint's instructions — not fixed here. |
| **Workspace Header** | Org-wide singleton | *(none found)* | No SSR seed. `/adminV2/workspace/page.tsx` is a client page mounting `PresentationRuntime`; header state comes from `useWorkspaceSurfaceRuntime()` | **Yes — this is the only load.** `useWorkspaceHeaderSurfaceConfigState` (`useWorkspaceHeaderSurfaceConfig.ts:50-62`) calls `loadWorkspaceHeaderSurfaceConfig()` → `GET /api/admin/surfaces/workspace-header` (`workspaceHeaderSurfaceService.ts:17-22`); consumed at `useWorkspaceSurfaceRuntime.ts:209,255-262` | **Client-primary — KNOWN GAP** | No server seed exists at all for this Surface. Defaults (`DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG`) render until the client fetch resolves. Documented as a known gap; not fixed here. |
| **Work Unit Header** | Org-wide singleton | `resolveOperationalPresentation` reading `listWorkUnitHeaderLayoutRecords` | Work Unit **provisioning answer** resolves the published header inside `resolveOperationalPresentation` (`workUnitProvisioningAnswer.ts:520-547`, `operationalPresentation.ts:228-250`) → mapped to `WorkspaceHeaderPresentationModel` (`workUnitSurfaceModelFromSnapshot.ts:79-99`) → rendered by `<WorkUnitHeader>` | **No config refetch found on the committed path.** `useCommittedWorkUnitSurfaceRuntime` builds from the committed snapshot only; `useWorkUnitSettlement` fetches **KPI values**, not header config (`useWorkUnitSettlement.ts:89-107`); an explicit code comment states the old client config waterfall was removed (`useCommittedWorkUnitSurfaceRuntime.ts:13-17`) | **SSR-only** | `buildWorkUnitHeaderPresentation` (the function `WorkUnitHeaderSurfaceEditor.tsx:165` uses for its own preview) is **not referenced in production runtime composition** — only in the editor and in tests (`workUnitHeader.test.tsx`, `workUnitHeaderSurfaceConfig.test.ts`). Runtime instead uses `workUnitHeaderConfigFromLayoutDoc` inside `resolveOperationalPresentation`. Both read the same published `LayoutDoc`, but via two different code paths — noted, not unified, in this pass. |
| **Queue Row** | Per department / process / work-view (`queueRowSurfaceIdForDepartment`) | `resolveQueueRowLayoutServer` (`web/lib/layout/runtime/queueRowLayoutServer.ts:162-209`) | Work Unit **provisioning answer** (`workUnitProvisioningAnswer.ts:512-541`) → `mapQueueRowSurfaceToCompactConfig` (`operationalPresentation.ts:276-285`) → applied to queue rows (`workUnitSurfaceModelFromSnapshot.ts:167-175,197`) | **A client fetch path still exists** (`fetchWorkUnitSurfaceConfigBundle` → `GET /api/admin/queue-row-layout/...`, `workUnitSurfaceConfigFetch.ts:68-90`) but it is used for **nav prewarm** (`warmWorkUnitSurfaceSession.ts`), not the committed render. The provisioning-answer route's own comments state it replaced that client chain (`app/api/admin/work-units/[id]/provisioning-answer/route.ts:8-14`) | **SSR-only for committed render; prewarm fetch is separate** | If no published config exists, server falls back to the canonical default via `mapQueueRowSurfaceToCompactConfig(null)` (`operationalPresentation.ts:276-278`) — not a client fallback. |
| **Operational Intelligence** | Org-wide singleton (`surface: "operational_intelligence"`) | `buildOperationalSurfaceModel` → `resolveConfiguredMetricList` → `resolvePlacementsForSurface` (`web/lib/analytics/runtime/operationalSurface.ts:62-79,191-198`) | No page SSR seed. `OperationalIntelligencePanel` is client-mounted inside Analytics | **Yes — this is the only load.** Panel's warm cache `fetch`es `/api/admin/intelligence/operational` (`operationalIntelligenceWarmCache.ts:42-50`; `OperationalIntelligencePanel.tsx:65-75`), which calls the server-side `buildOperationalSurfaceModel` on each request | **Client-primary (server computes on request, no page SSR seed) — see note** | The runtime **does not read the builder's `SurfaceDoc` shape at paint time** — `OperationalIntelligenceSurfaceBuilder` persists via `saveOperationalIntelligenceDoc`, which maps into `metric_placements` (`operationalIntelligenceSurfacePersistence.ts:3-7,109-115`); runtime reads those placements through `resolvePlacementsForSurface`. Builder and runtime share storage (`metric_placements`), not the authoring doc shape — this is an existing architectural seam, not something this sprint changes. |
| **Builder Preview** (any editor's live in-editor preview pane) | N/A | N/A | The editor's own in-memory draft state | N/A | **N/A** | This is an authoring context, not an operator-facing runtime surface. Not subject to certification. |

## Cross-cutting note

Focus Panel Summary, Work Unit Header, and Queue Row all ride the **same** operator-critical seam:
`GET /api/admin/work-units/[id]/provisioning-answer` → `composeWorkUnitProvisioningAnswer`
(`web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts`). Workspace Header and Operational
Intelligence do **not** ride that answer — they are separate client→API loads with no SSR seed at
all. This existing split (not introduced by this sprint) is why Workspace Header is flagged
"client-primary" while Work Unit Header and Queue Row are "SSR-only" for the committed render.

## Explicit non-goals of this certification pass

- Does **not** propose a unified Surface config cache or loader.
- Does **not** change `usePublishedFocusPanelSummaryDocForScope` to skip its refetch.
- Does **not** add an SSR seed for Workspace Header or Operational Intelligence.
- Does **not** unify `buildWorkUnitHeaderPresentation` (builder-only) with
  `workUnitHeaderConfigFromLayoutDoc` (runtime-only) into one function.

These are documented as **known gaps for a later, explicitly-scoped runtime sprint** — not solved
here, per the instruction to avoid inventing new cache/loader architecture in a UI-only pass.
