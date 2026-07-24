---
owner: operator
status: canonical
last_reviewed: 2026-07-24
supersedes: []
---

# Surfaces product UI

UI-only product realization for **Surfaces** (`/organization/surfaces`). **Product realization is complete** — see [`../milestones/organization-configuration-product-realization-closeout.md`](../milestones/organization-configuration-product-realization-closeout.md).

This document freezes the operator experience so `/organization/surfaces` matches the compact
Organization landing pattern already shipped for Financials and Programs & Locations:

1. **Landing** — category tiles (Focus Panels, Queue Rows, Workspaces, Work Units, Operational
   Intelligence)
2. **Category drill-in** — Collection rail + Selected Surface workspace (no category rail; the
   landing owns category navigation)

Existing editors and their save/publish endpoints remain authoritative; this sprint changes
presentation and navigation only.

Legacy `/settings/surfaces` redirects to `/organization/surfaces`.

It does **not** redefine canonical Surface/Experience Builder doctrine
(`docs/platform/operator/experience-builder-doctrine.md`,
`docs/platform/operator/experience-builder-universal-composition-model.md`).

## Critical product rule

Selecting a Surface, or clicking Edit, **never navigates to a detached full-bleed standalone
builder** as the primary journey. Before this sprint,
`router.replace('/settings/surfaces?editor=1&layout=…')` was the normal Focus Panel edit path, and
it flipped the page into full-bleed studio chrome that hid the Settings shell entirely.

`?editor=1&layout=` is now **only** an optional deep-link. It resolves INTO embedded Edit mode
inside the Surfaces workspace shell — the category rail and collection rail stay mounted and
visible the whole time. `isExperienceBuilderStudioActive()` now returns `false` unconditionally
for any `/settings/surfaces` path (`web/lib/layout/experienceBuilderStudioMode.ts`); the legacy
`/settings/layouts` gallery route keeps its previous full-bleed behavior unchanged, since it is a
separate back-compat redirect source outside this product path.

## Sprint scope

**In scope**

- Category → Collection → Selected Surface workspace for `/settings/surfaces`
- Surface collection rail (search) per category, replacing the prior tile-landing default
- Selected Surface workspace with a 5-tab bar: **Edit · Assignments · Versions · Health · History**
  (Edit-first — no Overview tab)
- Embedding every existing Surface editor **inline** inside the Edit tab (never full-bleed)
- Collapsible builder inspector (`SurfaceBuilderInspectorRail`, default collapsed)
- Save / Publish / Undo / Reset lifted onto the workspace tab row (`SurfaceEditTabActions`)
- Publication posture on collection rows (`publicationBySurfaceId`)
- Disabling full-bleed studio chrome for the Surfaces product path
- Truthful runtime certification matrix for how published Surface config reaches operator runtime

**Out of scope**

- New Surface/Experience Builder runtime, or a parallel builder alongside any existing editor
- Schema changes, new persistence endpoints, or new mutation paths
- Rewriting any editor's internal composition UI (`FocusPanelSummarySurfaceEditor`,
  `QueueRowSurfaceEditor`, `WorkspaceHeaderSurfaceEditor`, `WorkspaceProcessesSurfaceEditor`,
  `WorkUnitHeaderSurfaceEditor`, `OperationalIntelligenceSurfaceBuilder`, `NestedSurfaceEditor`)
- Fixing the known runtime gaps this sprint documents (Focus Panel Summary secondary client
  fetch, Workspace Header client-primary load) — see the certification matrix
- A real cross-Surface Version/Health/History data model
- In-context Work Unit authoring beyond the existing `WorkUnitHeaderSurfaceEditor`

## Information architecture

```
Surfaces
  Category rail: Focus Panels · Queue Rows · Workspaces · Work Units · Operational Intelligence
  Collection rail (search, per category)
  Selected Surface
    Edit          — default; embeds the existing editor inline
    Assignments
    Versions
    Health
    History
```

### Operator definitions

| Concept | Meaning |
|---|---|
| Surface | A presentation composition operators configure once and every matching operator sees at runtime (a Focus Panel, a Queue Row layout, a Workspace/Work Unit header, an Operational Intelligence metric set) |
| Category | One of the five Surface kinds; owns its own collection of Surface objects |
| Edit | The existing composer for that Surface kind, embedded inline — never a detached route |
| Assignments | What business process / department / singleton scope this Surface applies to |
| Health | Planned: composition + assignment issue checklist — not yet backed by an evaluator |
| Versions | Planned: cross-editor version timeline — each editor's own draft/publish state already lives inside its own Edit tab |
| History | Planned: a verified configuration-change timeline — not yet backed by an event table |

## Category → Collection → Selected Surface workspace

**Category rail** (`SurfacesCategoryNav`): Focus Panels · Queue Rows · Workspaces · Work Units ·
Operational Intelligence — the existing `SURFACE_CONFIG_SECTIONS` from
`useSurfacesConfigurationSettings`, with a one-line subtitle per category shown in the context bar
(`sectionSubtitle()`).

**Collection rail**: search box + the section's `listItems` (reused from
`useSurfacesConfigurationSettings`, `useWorkspaceProcessCatalog`, `useQueueRowProcessCatalog`).
Each row shows publication posture when known. Selecting a row lands on **Edit**
(`SURFACE_WORKSPACE_DEFAULT_TAB`), never a read-only Overview.

**No selection**: an intentional `ConfigurationEmptyState` — "Choose a Surface" / "Select a
Surface to review its composition, assignments, versions, and health."

**Selected Surface workspace**: title + subtitle, then the 5-tab bar
(`SURFACE_WORKSPACE_TABS`) with **Edit** first. When `tab=edit`, **Save / Publish / Undo / Reset**
render on the tab row via `SurfaceEditTabActions` (registered by each editor through
`SurfaceBuilderChromeProvider`). Deep link `?editor=1&layout=X` selects Surface `X` and opens Edit
without hiding the category/collection rails and without activating studio chrome.

## Edit (default tab)

When a Surface has a wired editor, the Edit tab renders it **inline** in the main workspace pane,
with the category and collection rails still visible. Builder **inspectors** wrap in
`SurfaceBuilderInspectorRail` (**default collapsed**); the row canvas is the primary editing surface.

| Surface kind | Editor component |
|---|---|
| Focus Panel Summary | `FocusPanelSummarySurfaceEditor` |
| Queue Row | `QueueRowSurfaceEditor` |
| Workspace Header | `WorkspaceHeaderSurfaceEditor` |
| Workspace Process Summary | `WorkspaceProcessesSurfaceEditor` |
| Work Unit Header | `WorkUnitHeaderSurfaceEditor` |
| Operational Intelligence | `OperationalIntelligenceSurfaceBuilder` |
| Nested surface (drill-in) | `NestedSurfaceEditor` |

Every editor's `onBack` calls `clearSelection` — returns to the collection without inner
← Surfaces chrome. `WorkspaceProcessesSurfaceEditor`'s `onSelectProcess` still calls
`openSurface(id)` to move between processes while staying in Edit, preserving its existing
in-editor navigation behavior. Surfaces without a wired editor show either a live/preview link
(when the catalog provides one) or a calm "Authoring for this surface is coming soon" note —
never a blank page.

### URL persistence (selection source of truth)

Category, selected Surface (`layout=`), and tab (`tab=`) are written with `router.replace`
(scroll: false) so Fast Refresh / soft remounts rehydrate the same selection. `editor=1` is
**never written** by the shell — it remains a read-only deep-link alias that resolves into
`tab=edit`. This is not a detached builder navigation; category + collection rails stay mounted.

## Assignments

- Surfaces bound to a `LifecycleCatalogEntry` (Queue Rows, Workspace Process Summaries): shows the
  bound business process name and a deep link to `/settings/processes?processId=…`.
- Org-wide singleton surfaces (Workspace Header, Work Unit Header, Operational Intelligence):
  states plainly that these apply organization-wide with no per-location/per-process assignment to
  configure.
- Everything else: `data-capability="planned"` — "A dedicated Business Process assignment table
  for this Surface is planned. No assignment is fabricated here."

## Versions / Health / History

All three are calm Planned empty states, `data-capability="planned"`, matching the Access /
Business Processes pattern:

- **Versions** — "Version history will appear here when available. Open Edit to see this
  Surface's own draft / publish status inline." No version numbers fabricated.
- **Health** — "Surface configuration health will list composition and assignment issues here."
  No percentage scores fabricated.
- **History** — "A verified change history for this Surface is planned. No events are fabricated
  for display."

## Capability status (summary)

| Area | Status |
|---|---|
| Category rail, collection rail (search + publication posture), selected-Surface header, tab navigation | Wired (existing hooks/catalogs) |
| Edit tab — all 6 editor kinds + nested surface | Wired (existing editors, embedded inline; inspector default collapsed) |
| Save / Publish / Undo / Reset on tab row | Wired (`SurfaceEditTabActions` + `SurfaceBuilderChromeProvider`) |
| Assignments tab — catalog-bound and org-singleton surfaces | Wired (truthful) |
| Assignments tab — unresolved bindings | Planned |
| Versions tab | Planned |
| Health tab | Planned |
| History tab | Planned |
| Studio chrome disabled for `/settings/surfaces` | Wired |

Detailed classification: `.alloy-agent-evidence/surfaces-ui-discovery/SURFACES-UI-DISCOVERY.md`
Runtime certification matrix (truthful, includes known gaps): `.alloy-agent-evidence/surfaces-ui-discovery/SURFACE-RUNTIME-CERTIFICATION-MATRIX.md`

## Known runtime gaps (documented, not fixed in this UI-only sprint)

1. **Focus Panel Summary** — the Focus Panel host seeds `summaryDocSeed` from the server-composed
   Work Unit provisioning answer, but a client hook (`usePublishedFocusPanelSummaryDocForScope`)
   still fetches `/api/admin/entity-layouts/focus-panel-summary` after mount and replaces the seed
   once it settles. Not certified SSR-only.
2. **Workspace Header** — no SSR seed exists at all; `useWorkspaceHeaderSurfaceConfigState` is the
   *primary* (only) load path, via a client fetch to `/api/admin/surfaces/workspace-header`.
3. **Work Unit Header builder/runtime seam** — the editor's own preview function
   (`buildWorkUnitHeaderPresentation`) is not the function the runtime uses
   (`workUnitHeaderConfigFromLayoutDoc` inside `resolveOperationalPresentation`). Both read the
   same published `LayoutDoc`, via two different code paths.
4. **Operational Intelligence builder/runtime seam** — the builder edits a `SurfaceDoc`, persisted
   into `metric_placements`; the runtime reads those placements directly, not the `SurfaceDoc`
   shape, at paint time.

Fixing any of the above is a separate, explicitly-scoped runtime sprint — do not claim these are
resolved until wired through a single server-authoritative path with a determinism test.

## Implementation-sprint dependencies

1. A decision on whether to trust the Work Unit provisioning-answer seed for Focus Panel Summary
   and skip the client refetch (or vice versa) — runtime sprint, not UI.
2. An SSR seed path for Workspace Header (today client-primary).
3. A cross-Surface Health evaluator (composition + assignment issue checklist).
4. A cross-Surface configuration-change event/history table.
5. A generic Business-Process-assignment API for Surfaces not already resolved through a
   `LifecycleCatalogEntry`.

Do not claim these shipped until wired through server-authoritative paths.
