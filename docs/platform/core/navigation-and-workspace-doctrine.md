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

**Status:** **Frozen and certified** (July 2026).

**Reference implementation:** **Processing (Digital Mailroom)** — every future operational workspace inherits this shell, hierarchy, tokens, and presentation patterns unchanged.

**Also certified (compose the same primitives):** Communications, Work Items.

This is the **canonical operational workspace visual system** for every AdminV2 module modal — Scheduling, Attendance, Billing, Commercial, and future modules inherit it unchanged. Distinct from the org-level `/workspace` landing (Presentation Runtime four-zone command center).

**Supersedes:** Alloy Workspace Doctrine V1 (same hierarchy; V2 adds inset stone field ownership in `WorkspaceShell`, mandatory `WorkspaceMetricTiles`, and certified module migrations).

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
| **`WorkspaceMetricTiles`** | Canonical KPI tiles — **data-only adapters** supply counts | `ProcessingKpiStrip` → Today's activity band |
| **`WorkspaceSurface`** | Scrollable stone-field body for overview/studio | `ProcessingOverviewLanding` |
| **`WorkspaceCard`** | White contained panel on stone field | Overview lower zones, summary groups |
| **`WorkspaceZonePanel`** | Multi-column zone with header + body (queue, source, inspector) | Queue / Source document / Review questions |
| **`WorkspaceDivider`** | Subtle stone hairline between zones | Canvas ↔ inspector where needed |

Processing-specific presentation adapters (not duplicated by future modules):

| Adapter | Purpose |
|---------|---------|
| `ProcessingKpiStrip` | Queue-derived operational metrics only |
| `ProcessingLandingActionCard` | Overview action-card hierarchy |
| `ProcessingSourceDocumentViewport` | Artifact fit-page / fit-width / manual zoom |
| `ProcessingQueueList` | Folder rail + work lanes + row density |

### Structural rules (frozen July 2026)

| Rule | Implementation |
|------|----------------|
| **Compact header band** | `WorkspaceHeader` — single compact row: icon + title (Midnight Forge) + Slate subtitle + actions + Close |
| **Control band** | Header + `WorkspaceModeNav` + optional `WorkspaceMetricTiles` wrapped in `WS_CONTROL_BAND_DIVIDER` (`border-b border-alloy-stone/30`) — full inner width |
| **Metric band attachment** | Eyebrow stacked **above** tiles; metrics vertically aligned with Work navigation stack — not a floating card row |
| **Queue → detail divider** | `WS_QUEUE_RAIL` (`border-r border-alloy-stone/30`, white background) — full height below control band |
| **Artifact viewport** | `ProcessingSourceDocumentViewport` + `WorkspaceArtifactZoomControls` — bounded scroll, dual-axis fit-page, manual zoom on content wrapper |
| **Queue typography** | `PROCESSING_QUEUE_ROW_TITLE` (11px) + `PROCESSING_QUEUE_METADATA` — compact row density |
| **Inspector** | Spacing + hierarchy over heavy borders; Bend Pine for active/selection only |

### Visual polish (certified — Processing QA)

| Area | Rule |
|------|------|
| **Stone field** | `WS_FIELD` at ~7%; white cards visibly float with `WS_PROCESS_TILE_CHROME` / `WS_PANEL_SURFACE_FLAT` |
| **KPI tiles** | 21px semibold values; 11px Slate labels; semantic accent icon wells; eyebrow above tile row |
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
  WorkspaceModeNav             Work | Studio + section tabs [+ WorkspaceMetricTiles]
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

### Metric KPI semantic accents (frozen)

`WorkspaceMetricTiles` accent + status must agree:

| Metric | Accent | Meaning |
|--------|--------|---------|
| Active work | Bend Pine | Actionable queue |
| Needs review | Alloy Ember / warning | Operator review required |
| Ready to publish | Bend Pine | Generated form awaiting publish |
| Published | Alloy Gold | Finalized forms (from form library API) |

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

**Operational Health Doctrine V3 (July 2026):** Module nav-band metrics use `WorkspaceOperationalHealthStrip` — a **flat** operational health ribbon (hairline-separated cells, state dot + value color, trend placeholder row). **No boxed KPI cards** in the nav band. Processing is the reference presentation; Work Items adopts it with section-specific metric sets.

`WorkspaceMetricTiles` remains available for legacy/adopter modules (Communications) until migrated. No `CompactKpiStrip`, no custom variants. Module adapters (e.g. `ProcessingKpiStrip`, `WorkItemsKpiStrip`) supply **data only**.

### Alloy Operational Health Doctrine V3 (frozen)

**Status:** Frozen (July 2026). **Reference:** Processing (Digital Mailroom) nav-band metrics.

| Rule | Implementation |
|------|----------------|
| **Flat ribbon** | `WorkspaceOperationalHealthStrip` — one row, `divide-x` hairlines, `WS_OPERATIONAL_HEALTH_STRIP` container |
| **No boxed KPI cards** | No `SurfaceHeaderKpiCard`, no `WS_KPI_CARD_CHROME`, no card shadow in nav metrics |
| **Signal read order** | Label → value → trend placeholder (`—` until trend data exists) |
| **State encoding** | Small dot + value color only — no colored boxes or pills |
| **Trend placeholders** | Every signal reserves a third row (`data-operational-health-trend`) |

**Work Items metric sets (presentation only — same APIs):**

| Section | Metrics |
|---------|---------|
| **Overview** | Open · Due Today · Overdue · Completed Today |
| **Queue** | Assigned · Waiting · Due Soon · Overdue |

Eyebrow stacks above the strip (`Overview` / `Queue` / `Today's activity`) via the `eyebrow` prop — same layout as V2 metric bands.

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
| `WorkspaceOperationalHealthStrip` | Nav-band operational health (V3 flat ribbon — Processing, Work Items) |
| `WorkspaceMetricTiles` | Legacy boxed KPI tiles (Communications until migrated) |
| `WorkspaceDivider` | Vertical/horizontal separation between zones |

### Component library

Import from `@/components/workspace/doctrine`. Code: `web/components/workspace/doctrine.ts`, tokens: `web/components/workspace/workspaceTokens.ts`.

### Certified implementations

| Module | Status | Shell | Metrics | Notes |
|--------|--------|-------|---------|-------|
| **Processing (Digital Mailroom)** | **Reference implementation** | `DigitalMailroomShell` → `WorkspaceShell` | `ProcessingKpiStrip` → `WorkspaceOperationalHealthStrip` | Overview action cards, queue rail, artifact viewport, review inspector — canonical |
| **Communications** | Certified | `CommunicationsWorkspaceShell` → `WorkspaceShell` | `CommunicationsWorkspaceKpiStrip` → `WorkspaceMetricTiles` | Inherits Processing shell patterns |
| **Work Items** | Certified | `WorkItemsShell` → `WorkspaceShell` | `WorkItemsKpiStrip` → `WorkspaceOperationalHealthStrip` | Overview + Queue metric sets via `WorkspaceSurface` |

### Processing certification checklist (reference — all satisfied)

| Area | Requirement | Implementation |
|------|-------------|----------------|
| Header | Compact identity band, no hero | `WorkspaceHeader` via `DigitalMailroomShell` |
| Modes | Work \| Studio primary tabs | `WorkspaceModeTabs` |
| Subnavigation | Overview \| Queue under Work | `WorkspaceSubTabs` |
| Metric band | Today's activity above flat health strip; operational counts only | `ProcessingKpiStrip` → Active work, Needs review, Ready to publish, Published |
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

---

## Alloy Workspace Doctrine V1 (superseded)

V1 established the component barrel and Processing reference (July 2026). **V2 above is authoritative** — inset field in shell, universal metric tiles, Communications + Work Items certification.

---

## Related

- `business-process-system.md`
- `../operator/operational-workspace-shell.md` — Operational Workspace Doctrine V2 (Processing reference; Communications adopter)
- `../operator/canonical-interaction-model.md` — full interaction spine (Workspace → … → Field)
- `../operator/interaction-grammar.md` — drawer preserves workspace/perspective/queue context
- `../operator/queue-system.md`
- `../../system/navigation-doctrine.md` (transitional — same content, prefer this file)
