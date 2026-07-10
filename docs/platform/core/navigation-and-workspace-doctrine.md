# Navigation and workspace doctrine

**Status:** Canonical (June 2026 freeze).

Consolidates routing, navigation, and workspace landing rules. Implementation detail for work units lives in `business-process-system.md`.

> **Runtime convergence note (June 2026).** The `Record (drawer :recordId segment)` leaf below is served by the **Focus Panel** runtime (one operational subject, no per-entity drawer products), and every route reveals through a **Surface ViewModel** (`reveal.canCommit`) over the existing loader/cache/bootstrap — no new fetch or skeleton layer. The default Work Unit state is **condensed queue → Focus Panel** (Operational Mode). Canonical: [`../operator/surface-view-model-composition.md`](../operator/surface-view-model-composition.md), [`../operator/focus-panel-runtime-cutover-report.md`](../operator/focus-panel-runtime-cutover-report.md). Routing/segments here are unchanged; legacy loading paths must not be expanded.

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
**Sprint packs:** [Sprint 1](../../sprints/06_2026/workspace-v3-operational-command-center/README.md) · [Sprint 2](../../sprints/06_2026/workspace-v3-operational-command-center/sprint-2-evolution.md) · [Sprint 3 — Evolution Reset](../../sprints/06_2026/workspace-v3-operational-command-center/sprint-3-evolution-reset.md)

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

## Drawer navigation (summary)

- Queue row → drawer frame immediate; VM warm on intent
- Linked navigation (person ↔ opportunity): hold prior body until next VM ready
- Queue prev/next scoped to active lane

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
- **V3 (this revision)** — reframes the **KPI philosophy**: metrics are **contextual, operational, and section-scoped**. Boxed interactive KPI cards are retired in favor of a flat **Operational Health strip** with reserved trend intelligence.

### KPI philosophy (V3 — the metric contract)

Metrics are:

- **Contextual** — they belong to the **active section**, not the workspace as a whole.
- **Operational** — they answer "what needs attention right now," not "how much exists."
- **Not inventory** — never total-count catalogs (no "Forms: 214"); operational states only.
- **Not workspace-wide** — the same band changes as the operator changes sections.
- **Not interactive cards** — rendered as a flat **Operational Health strip**, not clickable tiles or pills.

**Metrics belong to the active section.** When the section changes, the metric set changes. One shell, many contextual health bands.

| Section | Operational metrics |
|---------|---------------------|
| **Processing → Queue** | Active Work · Needs Review · Ready · Published |
| **Communications → Inbox** | Needs Reply · Unread · Scheduled · Needs Review |
| **Work Items → Queue** | Open · Due Today · Overdue · Completed |

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
| **`WorkspaceModeNav`** | Composes mode + section tabs; optional metrics column | Work \| Studio + Overview \| Queue + KPI band |
| **`WorkspaceModeTabs`** | Primary mode rail (Work \| Studio) | Work mode default |
| **`WorkspaceSubTabs`** | Secondary section navigation | Overview \| Queue |
| **`WorkspaceOperationalHealth`** | Flat operational health band — not cards, not pills, not interactive | `ProcessingKpiStrip` → Work + Studio contextual metrics |
| **`WorkspaceMetricTiles`** | Legacy boxed KPI tiles — **deprecated for operational health**; Communications / Work Items pending migration | — |
| **`WorkspaceSurface`** | Scrollable stone-field body for overview/studio | `ProcessingOverviewLanding` |
| **`WorkspaceCard`** | White contained panel on stone field | Overview lower zones, summary groups |
| **`WorkspaceZonePanel`** | Multi-column zone with header + body (queue, source, inspector) | Queue / Source document / Review questions |
| **`WorkspaceDivider`** | Subtle stone hairline between zones | Canvas ↔ inspector where needed |

Processing-specific presentation adapters (not duplicated by future modules):

| Adapter | Purpose |
|---------|---------|
| **`ProcessingKpiStrip`** | Work vs Studio operational health adapter (data + trend placeholders only) |
| `ProcessingLandingActionCard` | Overview action-card hierarchy |
| `ProcessingSourceDocumentViewport` | Artifact fit-page / fit-width / manual zoom |
| `ProcessingQueueList` | Folder rail + work lanes + row density |

### Structural rules (frozen July 2026)

| Rule | Implementation |
|------|----------------|
| **Compact header band** | `WorkspaceHeader` — single compact row: icon + title (Midnight Forge) + Slate subtitle + actions + Close |
| **Control band** | Header + `WorkspaceModeNav` + optional `WorkspaceOperationalHealth` wrapped in `WS_CONTROL_BAND_DIVIDER` (`border-b border-alloy-stone/30`) — full inner width |
| **Metric band attachment** | Eyebrow stacked **above** tiles; metrics vertically aligned with Work navigation stack — not a floating card row |
| **Queue → detail divider** | `WS_QUEUE_RAIL` (`border-r border-alloy-stone/30`, white background) — full height below control band |
| **Artifact viewport** | `ProcessingSourceDocumentViewport` + `WorkspaceArtifactZoomControls` — bounded scroll, dual-axis fit-page, manual zoom on content wrapper |
| **Queue typography** | `PROCESSING_QUEUE_ROW_TITLE` (11px) + `PROCESSING_QUEUE_METADATA` — compact row density |
| **Inspector** | Spacing + hierarchy over heavy borders; Bend Pine for active/selection only |

### Visual polish (certified — Processing QA)

| Area | Rule |
|------|------|
| **Stone field** | `WS_FIELD` at ~7%; white cards visibly float with `WS_PROCESS_TILE_CHROME` / `WS_PANEL_SURFACE_FLAT` |
| **KPI / health band** | Flat operational health; eyebrow above metric row; reserved trend line per metric | `WorkspaceOperationalHealth` + `ProcessingKpiStrip` |
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
  WorkspaceModeNav             Work | Studio + section tabs [+ WorkspaceOperationalHealth]
  WS_SHELL_INSET               White gutter (~16px)
    WS_FIELD_CANVAS            Stone operational canvas (Layer 2)
      WorkspaceSurface         Scroll region (overview / studio)
        WorkspaceCard          Action cards + information zones
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

`WorkspaceOperationalHealth` is the **canonical operational health primitive** for module nav bands. Processing is the reference implementation.

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
| **Processing** | Queue | Active Work · Needs Review · Ready · Published |
| **Processing** | Studio | Forms · Published · Draft · Generated |
| **Communications** | Inbox | Needs Reply · Unread · Scheduled · Needs Review |
| **Work Items** | Queue | Open · Due Today · Overdue · Completed |

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

`WorkspaceMetricTiles` remains for Communications and Work Items until migrated. **Do not use for new operational health bands.**

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

`WorkspaceOperationalHealth` is the **operational health primitive** for module nav bands (Processing reference). Module adapters (e.g. `ProcessingKpiStrip`) supply **data and trend placeholders only**.

`WorkspaceMetricTiles` is **legacy** — Communications and Work Items only until migrated. No `CompactKpiStrip`, no custom card variants, no alternate KPI styles for new work.

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
| `WorkspaceOperationalHealth` | Operational health strip in nav band (flat, non-interactive) |
| `WorkspaceMetricTiles` | Legacy boxed KPI tiles (pending migration) |
| `WorkspaceDivider` | Vertical/horizontal separation between zones |

### Component library

Import from `@/components/workspace/doctrine`. Code: `web/components/workspace/doctrine.ts`, tokens: `web/components/workspace/workspaceTokens.ts`.

### Certified implementations

| Module | Status | Shell | Metrics | Notes |
|--------|--------|-------|---------|-------|
| **Processing (Digital Mailroom)** | **Reference implementation** | `DigitalMailroomShell` → `WorkspaceShell` | `ProcessingKpiStrip` → `WorkspaceOperationalHealth` | Work + Studio contextual health; overview action cards, queue rail, artifact viewport |
| **Communications** | Certified (health-band migration pending) | `CommunicationsWorkspaceShell` → `WorkspaceShell` | `CommunicationsWorkspaceKpiStrip` → `WorkspaceMetricTiles` | Inbox target metrics: Needs Reply · Unread · Scheduled · Needs Review |
| **Work Items** | Certified (health-band migration pending) | `WorkItemsShell` → `WorkspaceShell` | `WorkItemsKpiStrip` → `WorkspaceMetricTiles` | Queue target metrics: Open · Due Today · Overdue · Completed |

### Processing certification checklist (reference — all satisfied)

| Area | Requirement | Implementation |
|------|-------------|----------------|
| Header | Compact identity band, no hero | `WorkspaceHeader` via `DigitalMailroomShell` |
| Modes | Work \| Studio primary tabs | `WorkspaceModeTabs` |
| Subnavigation | Overview \| Queue under Work | `WorkspaceSubTabs` |
| Metric band | Flat operational health; Work vs Studio metrics; trend line reserved | `ProcessingKpiStrip` → `WorkspaceOperationalHealth` |
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
6. Metrics are **section-scoped and operational** — never inventory totals, never workspace-wide rollups, never interactive cards. Use `WorkspaceOperationalHealth` with a per-section metric set and reserved trend line.

---

## Alloy Workspace Doctrine V1 / V2 (superseded)

- **V1** established the component barrel and Processing reference (July 2026).
- **V2** added inset stone field ownership in `WorkspaceShell` and certified Communications + Work Items.

**V3 above is authoritative** — contextual, operational, section-scoped metrics rendered as a flat Operational Health strip with reserved trend intelligence. Boxed interactive KPI cards are retired.

---

## Related

- `business-process-system.md`
- `../operator/canonical-interaction-model.md` — full interaction spine (Workspace → … → Field)
- `../operator/interaction-grammar.md` — drawer preserves workspace/perspective/queue context
- `../operator/queue-system.md`
- `../../system/navigation-doctrine.md` (transitional — same content, prefer this file)
