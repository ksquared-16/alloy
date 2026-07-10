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

## Related

- `business-process-system.md`
- `../operator/operational-workspace-shell.md` — Operational Workspace Doctrine V2 (Processing reference; Communications adopter)
- `../operator/canonical-interaction-model.md` — full interaction spine (Workspace → … → Field)
- `../operator/interaction-grammar.md` — drawer preserves workspace/perspective/queue context
- `../operator/queue-system.md`
- `../../system/navigation-doctrine.md` (transitional — same content, prefer this file)
