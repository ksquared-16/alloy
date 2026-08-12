---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Navigation and workspace doctrine

**Status:** Canonical (July 2026 stabilization).

Consolidates routing, navigation, and workspace landing rules. Implementation detail for work units lives in `business-process-system.md`.

> **Platform stabilization (July 2026).** Record selection (`:recordId` segment) is served by **Focus Panel + VM Runtime** — not legacy drawer products. Surface Host + Presentation Runtime own warm navigation between Workspace and Work Unit. **No legacy drawer fallback** exists for unsupported entities. Canonical: [`../milestones/stabilization-july-2026.md`](../milestones/stabilization-july-2026.md), [`../experience/surface-host-architecture.md`](../experience/surface-host-architecture.md).

---

## Operator hierarchy

```
Organization
  └── Business Process     (/workspace tiles, sidebar groups)
        └── Stage          (queue lanes on work-unit route)
              └── Record   (drawer :recordId segment)
```

**Department** exists for ACL, metadata, and KPI rollup — **not** daily navigation spine.

---

## Routes (operator)

| Route | Purpose |
|-------|---------|
| `/workspace` | Operational command center — four-zone launch surface |
| `/workspace/work-unit/:slug` | Work Unit execution (Operational Mode default) |
| `/workspace/work-unit/:slug?work_view=:id` | Work Unit with predefined Work View (deep link) |
| `…/:recordId` | Record drawer (same route, no remount) |

**Internal compat:** `/adminV2/workspace/dept/:id/...` — tests and legacy only.

**Rewrites:** `/workspace/**` → `app/adminV2/workspace/**`

Full URL rules: `../../system/routing-doctrine.md` (frozen detail).

---

## Sidebar

- **Home** → `/workspace`
- **Business process groups** — expandable; child links to work-unit slug hrefs
- **Prefetch:** `prefetch={false}` on heavy routes; hover prewarm on WU hrefs
- **Site filter:** sticky scope for queue/bootstrap (`workspace_site_id`)

Catalog source: `loadOperatorLifecycleLandingCards` (same as landing tiles).

---

## Workspace landing (V3 — Operational Command Center)

**Doctrine:** [`../operator/workspace-v3-command-center-doctrine.md`](../operator/workspace-v3-command-center-doctrine.md) (Rev 2)  
**Operational Surfaces:** [`../operator/workspace-v3-operational-surface-doctrine.md`](../operator/workspace-v3-operational-surface-doctrine.md)  
**Sprint packs:** Sprint 1 (historical: `../../sprints/archive/06_2026/workspace-v3-operational-command-center/README.md`) · Sprint 2 (historical: `../../sprints/archive/06_2026/workspace-v3-operational-command-center/sprint-2-evolution.md`) · Sprint 3 — Evolution Reset (historical: `../../sprints/archive/06_2026/workspace-v3-operational-command-center/sprint-3-evolution-reset.md`)

Four zones — **one question each**. Visual changes are **evolution inside existing chrome** — see Sprint 3.

Component stack: `WorkspaceRootShell`, `WorkspaceRootLifecycleGrid` (→ `OperationalSurfaceLauncher`), `WorkspaceHealthPulseSection`.

Four zones — **one question each**:

| Zone | Question |
|------|----------|
| 1 — Organization Pulse | How is the organization? |
| 2 — Operational Pulse | What requires attention? |
| 3 — Operational Surfaces | Where should I go? |
| 4 — Operational Activity | What just happened? |

- Zone 3 surfaces are **miniature Work Unit launchers** — operational storytelling + enterable Work View deep links
- **Enterability law:** visible operational numbers → predefined Work View entry when mapped
- **Deep links:** `/workspace/work-unit/:slug?work_view={id}` (compat: `?queue=`)
- Analytics is **not** embedded on Workspace
- No department-first grid

### Progressive operational depth

```
Organization → Workspace → Operational Surface → Work Unit → Queue → Focus Panel → Embedded Workspace → BOS
```

Every transition preserves shell continuity — zoom-in, not page-swap.

---

## Work-unit entry (runtime)

| Concern | Behavior |
|---------|----------|
| Cold load | `WorkUnitWorkspaceColdShell` until atomic bundle ready |
| Warm load | Session cache, bootstrap inflight reuse |
| Queue selection | URL `?queue=` beats bootstrap default — route-owned |
| Site scope | URL + sessionStorage continuity |

Performance locked: `../../system/adminv2-runtime-performance-doctrine.md`.

Layout locked: `../../system/work-unit-layout-doctrine.md` (V3).

---

## Admin navigation

| Route | Purpose |
|-------|---------|
| `/admin` | Configuration home (not operator home) |
| `/admin/settings/lifecycle` | Business process builder |
| `/admin/settings/*` | Fields, layouts, actions, statuses |

---



## Navigation ownership (July 2026 — frozen)

| Concern | Owner | Rule |
|---------|-------|------|
| **Canonical deep links** | Route + query param projection | Work View: `?work_view=`; Location: `?locationId=` on `/settings/locations` |
| **Focus Panel ownership** | Inline Focus Panel region (`InlineOpportunityFocusPanel`) | The ONE record surface. Selection is an attention movement; the kernel projects `?subject_id=` and `?aspect=` with `replaceState` — no route remount, and no overlay |
| **Settings ownership** | Configuration Runtime (`/settings/*`) | Locations, surfaces, fields, business processes — not drawer opens |
| **Search ownership** | `GlobalSearchBox` → `dispatchOperatorFocusSelection` | Campus/location → Settings deep link; every other subject → a focus intent applied by `OperatorFocusAttentionListener` inside the kernel. Search is not special: the same seam serves every producer outside the runtime |
| **Location operating surface** | `LocationsConfigurationPage` | Inline create panel; successful create selects new site; **no drawer** |
| **Record overlay** | **None — deleted** | `AdminEntityDrawer` and both VM runtimes are gone (August 2026). There is no address that means "open the record overlay" and no fallback to one |
| **Record → destination** | `lib/workUnits/operatorFocusTarget` + `useOperatorRecordFocus` | ONE resolver: record → host record → the Work Unit whose `work_unit_id` holds it. Never a Business Process key. `null` means "no queue holds this record" and the gesture does nothing |

Authenticated verification: `../../sprints/archive/07_2026/platform-simplification-staging-qa-checklist.md` (historical: `../../sprints/archive/07_2026/platform-simplification-staging-qa-checklist.md`).


## Focus Panel navigation (summary)

- Queue row → Focus Panel frame immediate; payload warm on intent
- Linked navigation (a person or child inside the family) is a **card + item ASPECT** on the same
  panel, not a second record surface — Household card for a person, Children card for a child
- Queue prev/next scoped to active lane
- Active-runtime movement goes through the Runtime Kernel. `router.push` to a work-unit route is
  reserved for COLD ENTRY from outside the workspace layout; inside it, a push composes nothing

Full drawer rules: `../operator/drawer-system.md`.

---

## Frozen decisions

| Topic | Decision |
|-------|----------|
| Primary spine | Business Process → Stage → Record |
| Dept-first nav | Removed from operator landing |
| Slug routes | Product path for WU entry |
| Atomic reveal | Required for WU + drawer above-fold |

---

## Alloy Operational Workspace Doctrine V3 (frozen)

**Status:** **Frozen and certified** (July 2026).

**Reference implementation:** **Processing (Digital Mailroom)** — every future operational workspace inherits this shell, hierarchy, tokens, and presentation patterns unchanged.

**Also certified (compose the same primitives):** Communications, Work Items.

This is the **canonical operational workspace visual system** for every AdminV2 module modal — Scheduling, Attendance, Billing, Commercial, and future modules inherit it unchanged. Distinct from the org-level `/workspace` landing (Presentation Runtime four-zone command center).

**Supersedes:**

- **V1** — established the component barrel and Processing reference.
- **V2** — added inset stone field ownership in `WorkspaceShell` and certified module migrations.
- **V3 (this revision)** — reframes the **KPI philosophy**: metrics are **contextual, operational, and section-scoped**. **Overview** sections render compact **Today's activity** tiles in the overview landing body (below primary action cards). **Operational** sections (Queue, Inbox, Studio tabs) use a flat **Operational Health strip** in the nav control band with reserved trend intelligence.

### KPI philosophy (V3 — the metric contract)

Metrics are:

- **Contextual** — they belong to the **active section**, not the workspace as a whole.
- **Operational** — they answer "what needs attention right now," not "how much exists."
- **Not inventory** — never total-count catalogs (no "Forms: 214"); operational states only.
- **Not workspace-wide** — the same band changes as the operator changes sections.
- **Not interactive cards** — operational sections use a flat **Operational Health strip** in the nav band; overview sections use compact non-interactive **`SurfaceHeaderKpiCard`** tiles in the landing body.

**Metrics belong to the active section.** When the section changes, the metric set changes. One shell, many contextual health bands.

**Overview vs operational placement (required):**

| Section type | Metric placement | Component |
|--------------|------------------|-----------|
| **Overview** (Work → Overview) | Below primary action cards, above information zones | `SurfaceHeaderKpiCard` grid + **Today's activity** eyebrow in `*OverviewLanding` |
| **Operational** (Queue, Inbox, Studio tabs) | Nav control band beside mode/section tabs | `WorkspaceOperationalHealth` via module KPI strip adapter |

Overview sections **omit** the header metrics column. Operational sections **include** it. Processing and Communications are the reference pair for this split.

| Section | Operational metrics |
|---------|---------------------|
| **Processing → Overview** | Active Work · Needs Review · Ready to Publish · Published (body tiles) |
| **Processing → Queue** | Active Work · Needs Review · Ready · Published (header health band) |
| **Communications → Overview** | Reply · Unread · Scheduled · Sent (body tiles) |
| **Communications → Inbox** | Needs Reply · Unread · Scheduled · Needs Review (header health band) |
| **Work Items → Overview** | None — action cards + continue/recent panels only (no metric tiles) |
| **Work Items → Queue** | Assigned · Waiting · Due Soon · Overdue (header health band) |

Each metric reserves space for **trend intelligence** (see below): e.g. `↑ 12 today`, `↓ 18% week over week`, `↑ 4 since yesterday`.

### Visual hierarchy (five layers — frozen)

| Layer | Name | Treatment | Components / tokens |
|-------|------|-----------|---------------------|
| **1** | Application shell | White modal chrome; compact header; mode/sub-nav; control-band divider | `WorkspaceShell`, `WorkspaceHeader`, `WorkspaceModeNav`, `WorkspaceModeTabs`, `WorkspaceSubTabs`, `WS_CONTROL_BAND_DIVIDER` |
| **2** | Workspace field | Inset stone canvas (~7% River Stone wash) inside white gutter | `WS_SHELL_INSET`, `WS_FIELD_CANVAS`, `WS_FIELD` |
| **3** | White operational surfaces | Cards, queue rail, source document, review inspector, studio panels | `WorkspaceSurface`, `WorkspaceCard`, `WorkspaceZonePanel`, `WS_QUEUE_RAIL`, `WS_ARTIFACT_CANVAS` |
| **4** | Interactive objects | Buttons, rows, CTAs, toggles, zoom controls, queue actions | `WS_ACTION_PRIMARY`, `WS_ACTION_SECONDARY`, `WorkspaceArtifactZoomControls` |
| **5** | Selection / Bend Pine | Selected queue row, active tab, active stage, primary progress | `WS_ROW_SELECTED`, Bend Pine washes, left selection rails |

Layer 1 is **never** stone-tinted full-bleed. Layer 2 is **inset** inside the white shell. Layer 3 surfaces **float** on the stone field with soft elevation — not flat all-white modals.

### Canonical component library

Import from `@/components/workspace/doctrine`. Tokens: `web/components/workspace/workspaceTokens.ts`.

| Component | Role | Processing reference |
|-----------|------|----------------------|
| **`WorkspaceShell`** | Invariant modal hierarchy: control band + inset field + body | `DigitalMailroomShell` |
| **`WorkspaceHeader`** | Compact identity: icon, title, subtitle, actions, Close | Digital Mailroom title band |
| **`WorkspaceModeNav`** | Composes mode + section tabs; optional metrics column (operational sections only) | Work \| Studio + Overview \| Queue + KPI band when not on Overview |
| **`WorkspaceModeTabs`** | Primary mode rail (Work \| Studio) | Work mode default |
| **`WorkspaceSubTabs`** | Secondary section navigation | Overview \| Queue |
| **`SurfaceHeaderKpiCard`** | Compact non-interactive overview activity tiles — **Today's activity** eyebrow + 2×2 / 4-column grid | `ProcessingOverviewLanding`, `CommunicationsOverviewLanding` |
| **`WorkspaceOverviewStack`** (+ Action / Activity / Info primitives) | Shared overview content width + grids for large desktops (1440–1920); modules compose these inside `WorkspaceSurface` | Processing / Communications / Scheduling Overview |
| **`WorkspaceOperationalHealth`** | Flat operational health band in nav control band — not cards, not pills, not interactive | `ProcessingKpiStrip`, `CommunicationsWorkspaceKpiStrip` (Queue / Inbox / Studio only) |
| **`WorkspaceMetricTiles`** | Legacy boxed KPI tiles — **deprecated for operational health**; pending migration | — |
| **`WorkspaceSurface`** | Scrollable stone-field body for overview/studio | `ProcessingOverviewLanding` |
| **`WorkspaceCard`** | White contained panel on stone field | Overview lower zones, summary groups |
| **`WorkspaceZonePanel`** | Multi-column zone with header + body (queue, source, inspector) | Queue / Source document / Review questions |
| **`WorkspaceDivider`** | Subtle stone hairline between zones | Canvas ↔ inspector where needed |

Processing-specific presentation adapters (not duplicated by future modules):

| Adapter | Purpose |
|---------|---------|
| **`ProcessingKpiStrip`** | Work vs Studio operational health adapter for **Queue / Studio** nav band (data + trend placeholders only) |
| `useProcessingOverviewKpis` / `buildProcessingOverviewKpis` | Work → Overview activity tile data for `SurfaceHeaderKpiCard` grid |
| `ProcessingLandingActionCard` | Overview action-card hierarchy |
| `ProcessingSourceDocumentViewport` | Artifact fit-page / fit-width / manual zoom |
| `ProcessingQueueList` | Folder rail + work lanes + row density |

### Structural rules (frozen July 2026)

| Rule | Implementation |
|------|----------------|
| **Compact header band** | `WorkspaceHeader` — single compact row: icon + title (Midnight Forge) + Slate subtitle + actions + Close |
| **Control band** | Header + `WorkspaceModeNav` + optional `WorkspaceOperationalHealth` (operational sections only) wrapped in `WS_CONTROL_BAND_DIVIDER` (`border-b border-alloy-stone/30`) — full inner width |
| **Overview activity band** | **Today's activity** eyebrow + compact `SurfaceHeaderKpiCard` grid below primary action cards, above information zones — not in header |
| **Operational metric band attachment** | Eyebrow stacked **above** health metrics; metrics vertically aligned with Work navigation stack — not a floating card row |
| **Queue → detail divider** | `WS_QUEUE_RAIL` (`border-r border-alloy-stone/30`, white background) — full height below control band |
| **Artifact viewport** | `ProcessingSourceDocumentViewport` + `WorkspaceArtifactZoomControls` — bounded scroll, dual-axis fit-page, manual zoom on content wrapper |
| **Queue typography** | `PROCESSING_QUEUE_ROW_TITLE` (11px) + `PROCESSING_QUEUE_METADATA` — compact row density |
| **Inspector** | Spacing + hierarchy over heavy borders; Bend Pine for active/selection only |

### Visual polish (certified — Processing QA)

| Area | Rule |
|------|------|
| **Stone field** | `WS_FIELD` at ~7%; white cards visibly float with `WS_PROCESS_TILE_CHROME` / `WS_PANEL_SURFACE_FLAT` |
| **KPI / health band** | Overview: compact activity tiles in landing body. Queue/Studio: flat operational health in nav band; eyebrow above metric row; reserved trend line per metric | `SurfaceHeaderKpiCard` + `WorkspaceOperationalHealth` / `ProcessingKpiStrip` |
| **Typography** | Three levels: Primary (`WS_TEXT_PRIMARY`), Secondary (`WS_TEXT_SECONDARY`), Muted (`WS_TEXT_MUTED`) |
| **Action cards** | Import (strongest Pine) → Active work (Pine CTA) → Form library (Midnight inventory) — all Open CTAs interactive |
| **Queue rows** | ~8–10% tighter vertical padding; selection Pine rail preserved |

### Purpose

One operating system for operational module UIs. The hierarchy and visual language are fixed; **only the content changes**. No module may invent parallel shell chrome, KPI styles, or accent themes.

### Layer model (implementation map)

| Layer | Treatment | Token / component |
|-------|-----------|-------------------|
| **1 — Application shell** | Header, mode nav, metrics band, control-band divider | `WorkspaceShell` outer chrome |
| **2 — Workspace field** | ~16px white gutter; ~7% stone operational canvas | `WS_SHELL_INSET` + `WS_FIELD_CANVAS` |
| **3 — White surfaces** | Cards, queues, review panels, artifact canvas | `WorkspaceCard`, `WorkspaceZonePanel` |
| **4 — Interactive objects** | Buttons, rows, toggles, zoom controls | `WS_ACTION_*`, artifact controls |
| **5 — Selection** | Bend Pine selection, active tabs, queue rail | `WS_ROW_SELECTED`, Pine washes |

The modal shell is **never** fully stone-tinted. The stone field is **inset** inside the white shell.

### Required hierarchy (never deviate)

```
WorkspaceShell
  WorkspaceHeader              Module title + tagline + actions + close
  [control band divider]
  WorkspaceModeNav             Work | Studio + section tabs [+ WorkspaceOperationalHealth when not Overview]
  WS_SHELL_INSET               White gutter (~16px)
    WS_FIELD_CANVAS            Stone operational canvas (Layer 2)
      WorkspaceSurface         Scroll region (overview / studio)
        WorkspaceCard          Action cards
        [Overview only]        Today's activity — SurfaceHeaderKpiCard grid
        WorkspaceCard          Information zones (recent work, folders, quick nav)
      WorkspaceZonePanel       Queue | source document | inspector (queue view)
```

### Color doctrine (frozen — no additional accent colors)

| Token | Role |
|-------|------|
| **Midnight Forge** | Structure, titles, default icons, inventory (form library, category folders) |
| **Alloy Slate** | Secondary copy, metadata, counts, dates |
| **Bend Pine** | Action, selection, progress, primary CTA, ready/active operational states |
| **Alloy Gold** | Publish, finalized, completed |
| **Alloy Ember** | Needs-review attention only (KPI warning accent — not a general theme color) |
| **White** | Modal shell + contained surfaces (Layers 1 + 3) |
| **River Stone ~7%** | Inset workspace field (Layer 2) |

Green (Bend Pine) indicates **action or active operational state** — not decorative fill. Do not make every icon green. **No blue accents.** No module-specific themes.

### Artifact document viewport (frozen)

Source-document zones (Processing and future artifact-heavy modules) use `ProcessingSourceDocumentViewport` + `WorkspaceArtifactZoomControls`:

| Mode | Behavior |
|------|----------|
| **Fit page** (default) | `scale = min(availW/contentW, availH/firstPageH, 1)` — entire first page visible; preserves aspect ratio |
| **Fit width** | Width fits viewport; vertical scroll through full document |
| **Manual zoom** | Predictable +/- steps; scroll when content exceeds viewport |

Requirements:

- Bounded flex child (`min-h-0 flex-1`); scroll element owns `overflow-auto`
- `ResizeObserver` + post-layout measurement (not a single early `scrollHeight` read)
- Multi-page stacks scroll inside the source-document panel; footer CTA stays fixed outside scroll
- Regions and PDF modes share fit/zoom semantics
- Manual zoom must never clip content inside an inaccessible wrapper
- The displayed percentage must match the applied `effectiveScale` on the content wrapper (`zoom` or equivalent in-flow scale)
- `ResizeObserver` remeasurement must not reset manual zoom (never force `zoom: 1` during measure while manual mode is active)

Scale helpers: `web/lib/workspace/artifactViewportScale.ts`

### Operational health doctrine (V3 — replaces boxed KPI cards)

`WorkspaceOperationalHealth` is the **canonical operational health primitive** for module **nav bands on operational sections** (Queue, Inbox, Studio tabs). Processing and Communications are the reference implementations.

**Overview sections do not use the nav-band health strip.** Work → Overview renders **Today's activity** as compact `SurfaceHeaderKpiCard` tiles in the overview landing body, below primary action cards and above information zones — matching Communications.

**Not cards. Not pills. Not interactive.** Operational health only — lighter and less dominant than boxed KPI tiles.

Each metric column:

```
{value} {label}
{trend line — reserved even when placeholder}
```

Example (Processing Queue section):

```
TODAY'S ACTIVITY

25 Active Work          1 Needs Review
↑ 4 today               ↓ 42%

24 Ready                13 Published
↑ 6 today               ↑ 2 since yesterday
```

#### Metrics are section-scoped (required)

Metrics **belong to the active section**, not the mode or the workspace. When the operator switches sections, the metric set changes with it. Module adapters supply counts + trends per section; `WorkspaceOperationalHealth` owns layout and typography.

| Module | Section | Operational metrics |
|--------|---------|---------------------|
| **Processing** | Overview | Active Work · Needs Review · Ready to Publish · Published (`SurfaceHeaderKpiCard` in body) |
| **Processing** | Queue | Active Work · Needs Review · Ready · Published (`WorkspaceOperationalHealth` in nav band) |
| **Processing** | Studio | Forms · Published · Draft · Generated |
| **Communications** | Overview | Reply · Unread · Scheduled · Sent (`SurfaceHeaderKpiCard` in body) |
| **Communications** | Inbox | Needs Reply · Unread · Scheduled · Needs Review |
| **Work Items** | Overview | None — launch action cards + continue/recent panels (no metric tiles) |
| **Work Items** | Queue | Assigned · Waiting · Due Soon · Overdue (`WorkspaceOperationalHealth` in nav band) |

Rules:

- **Do not** reuse one metric set across sections.
- **Do not** show inventory totals ("how many exist") — show operational states ("what needs attention").
- **Do not** show workspace-wide rollups in a section band — those belong to the org-level `/workspace` command center.

#### Trend intelligence (reserved per metric)

Every metric reserves a second-line trend slot. Static placeholders are acceptable until historical comparison APIs exist. Supported comparison windows:

| Window | Example |
|--------|---------|
| Since yesterday | `↑ 4 since yesterday` |
| Today | `↑ 12 today` |
| Week over week | `↓ 18% week over week` |
| Last 7 days | `↓ 12% vs last 7 days` |
| Last 30 days | `↑ 5 this month` |

Trend direction uses semantic color:

| Signal | Color |
|--------|-------|
| Increase / healthy | Bend Pine |
| Published / completed | Alloy Gold |
| Review / attention metric | Alloy Ember |
| Inventory / neutral / decrease | Midnight Forge or Slate |

#### Color doctrine (operational health)

| Token | Use |
|-------|-----|
| **Bend Pine** | Increases, healthy states, active operational counts |
| **Alloy Gold** | Published, completed |
| **Alloy Ember** | Needs review, attention |
| **Midnight Forge** | Inventory, neutral counts |
| **Alloy Slate** | Labels, metadata, de-emphasized trends |

**No additional accent colors.** Preserve nav-band spacing — reduce visual weight only; do not change layout grid.

### Legacy metric KPI tiles (superseded for operational health)

`WorkspaceMetricTiles` is **legacy** — superseded by `WorkspaceOperationalHealth` for all certified modules. **Do not use for new operational health bands.**

Previous boxed tile accents (for migration reference):

| Metric | Accent | Meaning |
|--------|--------|---------|
| Active work | Bend Pine | Actionable queue |
| Needs review | Alloy Ember | Operator review required |
| Ready to publish | Bend Pine | Generated form awaiting publish |
| Published | Alloy Gold | Finalized forms |

Eyebrow labels stack **above** the metric row — never beside metrics in a horizontal band.

**Never** use module-specific color themes.

### Typography hierarchy (three levels)

| Level | Token | Use |
|-------|-------|-----|
| Primary | `WS_TEXT_PRIMARY` | Titles, section headers, selected tabs |
| Secondary | `WS_TEXT_SECONDARY` (`text-alloy-slate`) | Descriptions, metadata, timestamps |
| Muted | `WS_TEXT_MUTED` | Disabled / de-emphasized states only |

### Icon hierarchy

| Role | Token |
|------|-------|
| Structural | `WS_ICON_STRUCTURAL` |
| Interactive | `WS_ICON_INTERACTIVE` |
| Attention / publish | `WS_ICON_ATTENTION` |
| Disabled | `WS_ICON_DISABLED` |

### Metric doctrine

**Overview sections:** compact **Today's activity** tiles via `SurfaceHeaderKpiCard` in `*OverviewLanding` — below action cards, non-interactive, same grid density as Communications (`grid-cols-2 lg:grid-cols-4`, `space-y-5` rhythm).

**Overview content width (shared):** compose `WorkspaceOverviewStack` / `WS_OVERVIEW_*` tokens from `@/components/workspace/doctrine` — `max-w-6xl` through tablet, expanding to `xl:max-w-[80rem]` / `2xl:max-w-[90rem]` so large desktops use the expanded canvas intentionally. Information zones use `WorkspaceOverviewInfoGrid` (primary continue/recent panel first) or `WS_OVERVIEW_INFO_SPLIT` for two-zone overviews (Scheduling). Live adopters: Processing, Communications, Scheduling, Work Items (no Overview metric tiles), and Operational Intelligence Overview (same `WS_OVERVIEW_CONTENT` width without inventing a second shell). Do **not** invent module-specific max-width shells.

**Operational sections:** `WorkspaceOperationalHealth` in the nav control band. Module adapters (e.g. `ProcessingKpiStrip`, `CommunicationsWorkspaceKpiStrip`) supply **data and trend placeholders only**. Shell adapters omit `metricsColumn` when the active section is Overview.

`WorkspaceMetricTiles` is **legacy** — no remaining operational health adopters. No `CompactKpiStrip`, no custom card variants, no alternate KPI styles for new work.

### Containment doctrine

- **Spacing over boxes** — major regions separated by rhythm, not extra borders.
- **Visible stone hairlines** — `WS_NAV_CONTENT_DIVIDER`, `WS_DIVIDER_FILL`, `WS_QUEUE_RAIL` must read in browser; never black or heavy dividers.
- **Soft elevation** on white surfaces (`WorkspaceCard`, zone panels).
- **No double stone tint** — `WorkspaceShell` owns Layer 2; module bodies use white surfaces on the field (`WorkspaceSurface` tone `stone` inherits shell; queue views use `canvas` when zone panels carry chrome).

### When to use which primitive

| Primitive | Use when |
|-----------|----------|
| `WorkspaceShell` | Every operational module modal (always) |
| `WorkspaceSurface` | Scrollable overview/studio body inside the stone canvas |
| `WorkspaceCard` | Single contained white panel (overview sections, summary groups) |
| `WorkspaceZonePanel` | Multi-column operational layout (queue, source document, inspector) |
| `SurfaceHeaderKpiCard` | Overview **Today's activity** compact tile grid in landing body |
| `WorkspaceOperationalHealth` | Operational health strip in nav band (Queue / Inbox / Studio) |
| `WorkspaceMetricTiles` | Legacy boxed KPI tiles (pending migration) |
| `WorkspaceDivider` | Vertical/horizontal separation between zones |

### Component library

Import from `@/components/workspace/doctrine`. Code: `web/components/workspace/doctrine.ts`, tokens: `web/components/workspace/workspaceTokens.ts`.

### Certified implementations

| Module | Status | Shell | Metrics | Notes |
|--------|--------|-------|---------|-------|
| **Processing (Digital Mailroom)** | **Reference implementation** | `DigitalMailroomShell` → `WorkspaceShell` | Overview: `useProcessingOverviewKpis` → `SurfaceHeaderKpiCard`. Queue/Studio: `ProcessingKpiStrip` → `WorkspaceOperationalHealth` | Overview activity tiles below action cards; queue rail, artifact viewport |
| **Communications** | Certified | `CommunicationsWorkspaceShell` → `WorkspaceShell` | Overview: body tiles (pending `SurfaceHeaderKpiCard`). Inbox/Announcements/Scheduled/Templates: `CommunicationsWorkspaceKpiStrip` → `WorkspaceOperationalHealth` | Same overview vs operational metric split as Processing |
| **Work Items** | Certified | `WorkItemsShell` → `WorkspaceShell` | Queue: `WorkItemsKpiStrip` → `WorkspaceOperationalHealth` | Overview omits metrics; Queue section-scoped health band |

### Processing certification checklist (reference — all satisfied)

| Area | Requirement | Implementation |
|------|-------------|----------------|
| Header | Compact identity band, no hero | `WorkspaceHeader` via `DigitalMailroomShell` |
| Modes | Work \| Studio primary tabs | `WorkspaceModeTabs` |
| Subnavigation | Overview \| Queue under Work | `WorkspaceSubTabs` |
| Metric band | Overview: body activity tiles. Queue/Studio: flat operational health in nav band; trend line reserved | `SurfaceHeaderKpiCard` + `ProcessingKpiStrip` → `WorkspaceOperationalHealth` |
| Overview activity | **Today's activity** below action cards, above information zones | `ProcessingOverviewLanding` + `useProcessingOverviewKpis` |
| Action cards | Three-tier semantic hierarchy | `ProcessingLandingActionCard` on overview |
| Containment | Stone field + white surfaces | `WorkspaceShell` inset + `WorkspaceSurface` / `WorkspaceCard` |
| Queue | Folder rail, compact rows, Pine selection | `ProcessingQueueList` + `WS_QUEUE_RAIL` |
| Artifact viewer | Fit-page, fit-width, manual zoom, scroll | `ProcessingSourceDocumentViewport` |
| Inspector | Quiet review column | `ProcessingQuestionReviewList` in `WorkspaceZonePanel` |
| Separators | Control band + queue rail stone dividers | `WS_CONTROL_BAND_DIVIDER`, `WS_QUEUE_RAIL` |
| Colors | Midnight / Slate / Pine / Gold / Ember (review only) | Frozen semantic tokens — no module theme |

### Rules for future modules

1. Compose `WorkspaceShell` + workspace primitives — no custom hierarchy.
2. Module code supplies **data and content only**.
3. Do not duplicate shell layout in module folders.
4. Do not introduce module-specific themes or accent colors.
5. Do not create competing KPI or surface components.
6. Metrics are **section-scoped and operational** — never inventory totals, never workspace-wide rollups. **Overview:** compact activity tiles in landing body (`SurfaceHeaderKpiCard`). **Queue/Inbox/Studio:** `WorkspaceOperationalHealth` in nav band with per-section metric set and reserved trend line.

---

## Adaptive Workspace Presentation Contract (July 2026)

**Status:** Canonical. **Adaptive Workspace System** is a permanent Presentation Runtime capability — not a per-module responsive fork.

Measured on `[data-adminv2-workspace-ambient-root]`:

| Canvas | Ambient width |
|--------|---------------|
| **Expanded** | ≥ 1320px |
| **Compact** | 980–1319px |
| **Constrained** | &lt; 980px |

### Adaptive Workspace Region Contract

| Role | Purpose |
|------|---------|
| **selection** | Queue / topic / case list |
| **primary** | Focus Panel / thread+composer / artifact / work detail |
| **supporting** | Inspector, metadata, secondary panes |
| **assistant** | BOS |

**Priority:** primary → selection → supporting → assistant. Assistant presentation changes before primary work loses usability.

Public module: `web/lib/presentation/adaptiveWorkspaceSystem.ts`.

### Focus Panel priority (Business Process Work Units)

- Normal: `[ condensed queue rail | Focus Panel primary ]` side by side through laptop widths.
- Never permanently stack queue above Focus at Tailwind `xl` (1280px).
- True two-pane floor (~700px primary): temporary slide-over selection; Focus remains main.
- Metrics remain one coherent row (compact density before overflow).

### BOS — persistent assistant (not a permanent rail)

| State | Behavior |
|-------|----------|
| **closed** | Floating launcher only — full canvas restored |
| **floating** | Operator-controlled window (drag header, resize, persist x/y/width/height) — **default**; does not reserve width |
| **pinned** | Optional right rail; workspace reflows; horizontally resizable in a bounded range; preference persists |

Pinned is optional productivity. Floating is the natural operating mode. Passive context updates as quiet chrome pills; passive “Switched active record…” must not appear as chat.

**Floating geometry:** lower-right default; min ~320×420; default ~400×620; max ~60% canvas width and usable height minus safe margins. Viewport clamp is temporary and does not overwrite preferred geometry until the operator moves/resizes. Unpin restores last floating geometry; Reset restores defaults; Close returns to launcher.

### Actions — operational chrome (not assistant ownership)

Actions belong to the surface they affect — **not** the BOS assistant region:

| Owner | Placement |
|-------|-----------|
| Workspace | Workspace header / control band |
| Business Process / Work Unit | Work Unit header / control band |
| Focused record | Focus Panel Manage |
| Module | Module WorkspaceHeader (e.g. Communications Compose) |

Closing, floating, or pinning BOS must not hide or relocate these Actions. BOS may recommend or invoke the same Operational Command Runtime; it does not own action chrome.

**Operational module workspaces** (Communications, Processing, Work Items, Operational Intelligence, and future peers) inherit the same Adaptive Workspace BOS contract via Operational Workspace Geometry:

- **Pinned** — workspace band ends at the BOS rail (current reserved form)
- **Floating / closed** — workspace expands the full operational band (sidebar → viewport)
- Horizontal fill inset is ~2.5% each side (`--operational-workspace-fill: 0.95`)

Architecture: `../../sprints/active/adaptive-workspace-presentation/adaptive-workspace-system-architecture.md`.

---

## Alloy Workspace Doctrine V1 / V2 (superseded)

- **V1** established the component barrel and Processing reference (July 2026).
- **V2** added inset stone field ownership in `WorkspaceShell` and certified Communications + Work Items.

**V3 above is authoritative** — contextual, operational, section-scoped metrics. **Overview** sections use compact **Today's activity** tiles in the landing body. **Operational** sections use a flat Operational Health strip in the nav band with reserved trend intelligence.

---

---

## Work Items cross-navigation (July 2026)

Work Items opens as an operational module modal (`adminv2-tasks-modal`) from the workspace command center.

| Event | Purpose |
|-------|---------|
| `adminv2:open-work-items-task` | Open Work Items with exact row selected (source/view/filter in detail) |
| `adminv2:open-communications-thread` | Open Communications inbox on exact thread |
| `adminv2:open-processing-case` | Open Processing on exact case |
| `adminv2:opportunity-focus-current-work` | Focus Current Work on record from Work Items |

InboxModal switches to **Inbox** tab when pending command-center selection or `ADMIN_V2_OPEN_COMMUNICATIONS_THREAD` is present — prevents Overview landing on cross-nav from Work Items.

Operational refresh: `dispatchOperationalWorkRefresh` — see `web/lib/workItems/operationalWorkRefresh.ts`.


## Related

- `business-process-system.md`
- `../operator/operational-workspace-shell.md` — Operational Workspace Doctrine V2 (Processing reference; Communications adopter)
- `../operator/canonical-interaction-model.md` — full interaction spine (Workspace → … → Field)
- `../operator/interaction-grammar.md` — drawer preserves workspace/perspective/queue context
- `../operator/queue-system.md`
- `../../system/navigation-doctrine.md` (expanded reference — prefer this file)
