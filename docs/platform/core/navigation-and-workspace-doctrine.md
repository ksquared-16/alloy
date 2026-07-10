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

## Alloy Operational Workspace Doctrine V2 (frozen)

**Status:** **Frozen** (July 2026). **Certified implementations:** Processing (Digital Mailroom), Communications, Work Items.

This is the **canonical operational workspace visual system** for every AdminV2 module modal — Scheduling, Attendance, Billing, Commercial, and future modules inherit it unchanged. Distinct from the org-level `/workspace` landing (Presentation Runtime four-zone command center).

**Supersedes:** Alloy Workspace Doctrine V1 (same hierarchy; V2 adds inset stone field ownership in `WorkspaceShell`, mandatory `WorkspaceMetricTiles`, and certified Communications + Work Items migrations).

### Structural rules (frozen July 2026)

| Rule | Implementation |
|------|----------------|
| **Compact header band** | `WorkspaceHeader` / `OperationalModalHeader` — single compact row: icon + title (Midnight Forge) + muted subtitle + actions + Close; no tall standalone hero |
| **Nav → content divider** | `WS_NAV_CONTENT_DIVIDER` on `WorkspaceModeNav` — visible stone hairline under secondary tabs before workspace body |
| **Queue → detail divider** | `WorkspaceDivider` vertical + `WS_QUEUE_RAIL` border — visible separation between queue rail and working canvas |
| **Artifact viewport** | `WS_ARTIFACT_VIEWPORT` + `WS_ARTIFACT_VIEWPORT_SCROLL` — PDF/region stacks scroll inside the document zone with page labels and bottom padding (no clipped edge) |
| **Queue typography** | `PROCESSING_QUEUE_ROW_TITLE` / `PROCESSING_QUEUE_METADATA` — compact row density; status + time preserved |
| **Inspector simplification** | Spacing + hierarchy over heavy borders; Bend Pine only for active/success/action states |

### Visual polish (July 2026 — presentation only)

| Area | Change |
|------|--------|
| **Stone field** | `WS_FIELD` at ~7% (`bg-alloy-stone/[0.07]`) + subtle `ring-alloy-stone/25` on canvas — white cards visibly float |
| **KPI tiles** | `WorkspaceMetricTiles` uses accent icon wells + accent rings; value weight reduced (`font-medium`); labels use `WS_TEXT_SECONDARY` |
| **Typography** | Three levels frozen: Primary (`text-alloy-midnight`), Secondary (`text-alloy-slate`), Muted (`text-alloy-midnight/40`) |
| **Containment** | Stronger card elevation (`WS_PROCESS_TILE_CHROME`, `WS_PANEL_SURFACE_FLAT`); spacing via `WS_SURFACE_CONTENT_PAD` |

### Purpose

One operating system for operational module UIs. The hierarchy and visual language are fixed; **only the content changes**. No module may invent parallel shell chrome, KPI styles, or accent themes.

### Layer model (frozen)

| Layer | Treatment | Token / component |
|-------|-----------|-------------------|
| **1 — White modal shell** | Header, mode nav, metrics band | `WorkspaceShell` outer chrome |
| **2 — Inset stone workspace field** | ~16px white gutter; ~7% stone operational canvas | `WS_SHELL_INSET` + `WS_FIELD_CANVAS` (owned by `WorkspaceShell`) |
| **3 — White operational surfaces** | Cards, queues, review panels, studio libraries | `WorkspaceCard`, `WorkspaceZonePanel`, module white frames |
| **4 — Interactive objects** | Buttons, rows, selections, badges, hover states | Bend Pine selection; Midnight Forge structure |

The modal shell is **never** fully stone-tinted. The stone field is **inset** inside the white shell.

### Required hierarchy (never deviate)

```
WorkspaceHeader              Module title + tagline + actions + close
WorkspaceModeNav             Work | Studio + section tabs [+ WorkspaceMetricTiles]
WS_SHELL_INSET               White gutter (~16px)
  WS_FIELD_CANVAS            Stone operational canvas (Layer 2)
    WorkspaceSurface         Scroll region (inherits field — no duplicate tint)
      WorkspaceCard          Overview panels, summary groups
      WorkspaceZonePanel     Queue / source / inspector columns
```

### Color doctrine (frozen)

| Token | Role |
|-------|------|
| **Midnight Forge** | Structure, titles, default icons, inventory (forms library, category folders) |
| **Alloy Slate** | Secondary copy, metadata, counts, dates |
| **Bend Pine** | Actionable, active, selected, ready, progress, primary CTA |
| **Alloy Gold** | Published, finalized, completed, attention where appropriate |
| **White** | Modal shell + contained surfaces (Layer 1 + 3) |
| **River Stone ~7%** | Inset workspace field (Layer 2) |

Green (Bend Pine) indicates **action or active operational state** — not decorative fill. Do not make every icon green.

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

### Metric KPI semantic accents (frozen)

`WorkspaceMetricTiles` accent + status must agree:

| Metric | Accent | Meaning |
|--------|--------|---------|
| Active work | Bend Pine | Actionable queue |
| Needs review | Alloy Ember / warning | Operator review required |
| Forms | Midnight Forge | Inventory |
| Published | Alloy Gold | Finalized |

Eyebrow labels (e.g. "Today's activity") stack **above** the tile row via `WorkspaceMetricTiles` `eyebrow` prop — never beside tiles in a horizontal band.

**Never** use module-specific color themes. Processing, Communications, Work Items, Scheduling, Attendance, and Commercial share one visual language.

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

`WorkspaceMetricTiles` is the **only** KPI primitive — Workspace, Work Unit headers, Processing, Communications, Work Items, and future modules. No `CompactKpiStrip`, no custom variants, no alternate KPI styles. Module adapters (e.g. `ProcessingKpiStrip`) supply **data only**.

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
| `WorkspaceMetricTiles` | Any KPI / status strip in nav band |
| `WorkspaceDivider` | Vertical/horizontal separation between zones |

### Component library

Import from `@/components/workspace/doctrine`. Code: `web/components/workspace/doctrine.ts`, tokens: `web/components/workspace/workspaceTokens.ts`.

### Certified implementations

| Module | Shell | Metrics | Surface |
|--------|-------|---------|---------|
| **Processing** | `DigitalMailroomShell` → `WorkspaceShell` | `ProcessingKpiStrip` → `WorkspaceMetricTiles` | Overview / Queue / Studio unchanged |
| **Communications** | `CommunicationsWorkspaceShell` → `WorkspaceShell` | `CommunicationsWorkspaceKpiStrip` → `WorkspaceMetricTiles` | Inbox / Templates / Announcements unchanged |
| **Work Items** | `WorkItemsShell` → `WorkspaceShell` | `WorkItemsKpiStrip` → `WorkspaceMetricTiles` | Overview + Queue via `WorkspaceSurface` |

### Rules for future modules

1. Compose `WorkspaceShell` + workspace primitives — no custom hierarchy.
2. Module code supplies **data and content only**.
3. Do not duplicate shell layout in module folders.
4. Do not introduce module-specific themes or accent colors.
5. Do not create competing KPI or surface components.

---

## Alloy Workspace Doctrine V1 (superseded)

V1 established the component barrel and Processing reference (July 2026). **V2 above is authoritative** — inset field in shell, universal metric tiles, Communications + Work Items certification.

---

## Related

- `business-process-system.md`
- `../operator/canonical-interaction-model.md` — full interaction spine (Workspace → … → Field)
- `../operator/interaction-grammar.md` — drawer preserves workspace/perspective/queue context
- `../operator/queue-system.md`
- `../../system/navigation-doctrine.md` (transitional — same content, prefer this file)
