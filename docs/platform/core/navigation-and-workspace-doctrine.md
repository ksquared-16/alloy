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

## Alloy Workspace Doctrine V1 (operational module modals)

**Status:** Frozen (July 2026). **Reference implementation:** Processing (Digital Mailroom).

This section defines the **shared modal workspace** every operational module consumes — Communications, Work Items, Scheduling, Attendance, Billing, Reporting, and future modules. It is distinct from the org-level `/workspace` landing (four-zone command center above).

### Purpose

One operating system for operational module UIs. The hierarchy and visual language are fixed; **only the content changes**. Processing validated the pattern; no module may invent parallel shell chrome.

### Required hierarchy (never deviate)

```
Module title + tagline     WorkspaceHeader
Work | Studio              WorkspaceModeTabs
Module section tabs        WorkspaceSubTabs   [optional WorkspaceMetricTiles in nav band]
────────────────────────── WorkspaceDivider (stone hairline)
Workspace body             WorkspaceSurface (stone field)
  └ white surfaces         WorkspaceCard / WorkspaceZonePanel
```

### Visual hierarchy

| Layer | Treatment |
|-------|-----------|
| Shell header | White, Bend Pine left accent, Midnight Forge title |
| Mode + section nav | White band, Bend Pine active selection |
| Metric tiles | White KPI cards on nav band (Work mode) |
| Workspace field | River Stone ~4% (`WS_FIELD`) |
| Cards / zones | White surfaces, thin stone border, soft elevation |
| Separators | Stone hairlines only — never black, never heavy |

### Color hierarchy (frozen)

| Token | Role |
|-------|------|
| **Midnight Forge** | Structure, navigation, typography, icons, secondary actions |
| **Bend Pine** | Primary action, active selection, progress, success, publish/generate/compose |
| **Alloy Gold** | Attention, published state |
| **White** | Surfaces and cards |
| **River Stone** | Workspace field background |

No other accent colors in operational module workspaces. Bend Pine is never used as decoration.

### Containment model

- **Stone field** replaces flat white modal backgrounds globally.
- **White cards** carry contained content (Overview action cards, summary panels).
- **Zone panels** split multi-column workspaces (queue rail, source document, inspector).
- **Dividers** separate regions horizontally (below nav) and vertically (queue ↔ canvas).

### Component library

Import from `@/components/workspace/doctrine`:

| Component | Responsibility |
|-----------|----------------|
| `WorkspaceShell` | Invariant modal chrome (header + nav + body) |
| `WorkspaceHeader` | Module title, tagline, actions, Close |
| `WorkspaceModeTabs` | Work \| Studio |
| `WorkspaceSubTabs` | Module section tabs |
| `WorkspaceModeNav` | Composed two-level nav (+ optional metrics column) |
| `WorkspaceMetricTiles` | Canonical metric tiles (shared KPI card) |
| `WorkspaceSurface` | Scrollable stone-field body |
| `WorkspaceCard` | White contained surface |
| `WorkspaceZonePanel` | Multi-column zone (queue, source, review) |
| `WorkspaceDivider` | Subtle stone separator |
| `WorkspaceSection` | Eyebrow + content group |

Code: `web/components/workspace/doctrine.ts`, tokens: `web/components/workspace/workspaceTokens.ts`.

### Rules for future modules

1. Compose `WorkspaceShell` + workspace primitives — no custom hierarchy.
2. Module-specific code supplies **data and content only** (e.g. `ProcessingKpiStrip` derives metrics, renders `WorkspaceMetricTiles`).
3. Do not duplicate shell layout in module folders.
4. Do not introduce module-specific themes or accent colors.
5. Migrate legacy modules (Communications, Work Items) to the doctrine barrel incrementally.

---

## Related

- `business-process-system.md`
- `../operator/canonical-interaction-model.md` — full interaction spine (Workspace → … → Field)
- `../operator/interaction-grammar.md` — drawer preserves workspace/perspective/queue context
- `../operator/queue-system.md`
- `../../system/navigation-doctrine.md` (transitional — same content, prefer this file)
