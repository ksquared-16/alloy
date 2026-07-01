# Workspace V3 — Operational Command Center Sprint

**Status:** Design blueprint (pre-implementation) — June 2026  
**Canonical doctrine:** [`docs/platform/operator/workspace-v3-command-center-doctrine.md`](../../../platform/operator/workspace-v3-command-center-doctrine.md)  
**Scope:** `/workspace` landing only — **not** Work Units, Queues, Focus Panel, Universal Cards, or BOS  
**Runtime:** Frozen — compose and elevate existing systems

---

## Executive summary

The Work Unit runtime has matured into Alloy OS's primary operational surface. The Workspace landing still behaves like a traditional SaaS dashboard — KPI strip + process tiles — when it should feel like **mission control**.

This sprint redesigns `/workspace` around the operating system doctrine: four operational zones, Business Process cards as miniature Work Unit previews, and a strict separation from Analytics.

**Sprint 2 (Evolution):** [`sprint-2-evolution.md`](./sprint-2-evolution.md) — Operational Surfaces, storytelling, enterability, Work View deep links, role architecture.

**Sprint 5 (Final UX Validation):** [`sprint-5-final-ux-validation.md`](./sprint-5-final-ux-validation.md) — **Pre-implementation gate.** ONE Enrollment Operational Surface evolution mockup + implementation readiness review. Proceed to code after approval.

**Sprint 4 (UX Continuity — System 5 reset):** [`sprint-4-ux-continuity.md`](./sprint-4-ux-continuity.md) — Workspace ↔ Work Unit continuity using **current** System 5 baselines only; shared `OperationalContextStack`, expand/reveal transition. Obsolete pre–Focus Panel WU comparisons retired.

**Sprint 3 (Evolution Reset):** [`sprint-3-evolution-reset.md`](./sprint-3-evolution-reset.md) — **Canonical visual direction.** Refine today's Alloy Workspace; baseline-anchored mockups only. Sprint 2 greenfield mockups superseded.

**Deliverables in this pack (Sprint 1):**

| # | Deliverable | Section |
|---|-------------|---------|
| 1 | Workspace V3 doctrine | [Canonical doc](../../../platform/operator/workspace-v3-command-center-doctrine.md) |
| 2 | Information architecture | [§2](#2-information-architecture) |
| 3 | Complete page layout | [§3](#3-complete-page-layout) |
| 4 | Business Process card redesign | [§4](#4-business-process-card-redesign) |
| 5 | Conceptual mockups | [§5](#5-conceptual-mockups) + [`mockups/`](./mockups/) |
| 6 | Runtime implementation plan | [§6](#6-runtime-implementation-plan) |
| 7 | Domain validation matrix | [§7](#7-domain-validation-matrix) |

---

## 1. Strategic context

### What exists (stable platform architecture)

✔ Runtime · Work Units · Universal Queue · Focus Panel · Universal Cards · System 5 · Card Archetypes · Interaction Doctrine · Content Templates · Operational Modes

Future work focuses on **refinement** — hierarchy, polish, motion, content quality, spacing, configuration exposure, performance, operational flow — not invention.

### What this sprint changes

| Before (dashboard mental model) | After (OS mental model) |
|--------------------------------|-------------------------|
| "What happened?" KPI strip dominates | Organization Pulse — calm health heartbeat |
| Process tiles feel like nav links | Business Process cards feel like Work Unit previews |
| No cross-process attention layer | Operational Pulse — actionable indicators |
| No activity context | Recent Operational Activity — quiet, below fold |
| Analytics mixed with operations | Strict separation — Analytics is its own workspace |

### Current implementation baseline

| Component | File | V3 alignment |
|-----------|------|--------------|
| Page shell | `web/app/adminV2/workspace/page.tsx` | Retain reveal gate + data pipeline |
| Root shell | `web/components/admin/workspace/WorkspaceRootShell.tsx` | Restructure zones |
| Health + pulse | `WorkspaceHealthPulseSection.tsx` | Split Zone 1 / Zone 2 explicitly |
| BP grid | `WorkspaceRootLifecycleGrid.tsx` | Evolve card anatomy (§4) |
| Card data | `buildOperatorLifecycleLanding.ts` | Extend preview payload |
| Command rail | `WorkspaceRootActionsRail.tsx` | Unchanged |

---

## 2. Information architecture

### 2.1 Page information hierarchy

```
/workspace
├── Zone 1 — Organization Pulse          [priority: orient]
│   ├── Organization name
│   └── Health snapshot strip
│       ├── Operational Health
│       ├── Enrollment Health (when applicable)
│       ├── Business Health
│       └── Critical System Alerts (when critical)
│
├── Zone 2 — Operational Pulse           [priority: attention]
│   ├── Primary indicators row
│   └── Secondary indicators row (when configured)
│
├── Zone 3 — Business Processes          [priority: launch — DOMINANT]
│   └── Business Process card grid
│       └── [Enrollment] [Billing] [Scheduling] …
│
└── Zone 4 — Recent Operational Activity [priority: context]
    ├── Activity feed (collapsed default on mobile)
    └── Optional BOS insight snippets
```

### 2.2 Navigation IA (continuous zoom)

```
Sidebar
  Home ──────────────────────► /workspace (Command Center)
  Business Process group
    └── Process name ────────► /workspace/work-unit/:slug (Operational Mode)
          Condensed Queue
          Focus Panel
          Embedded Workspace (card expand)
          BOS (command rail — persistent)
```

**Breadcrumb mental model (implicit, not always visible):**

`Home · {Process} · {Perspective} · {Subject}`

Workspace owns **Home** only. Deeper context is owned by Work Unit chrome.

### 2.3 Content sourcing IA

| Zone | Primary data source | Fallback |
|------|---------------------|----------|
| Organization Pulse | OIP metric packs → `computeWorkspaceHealthSummary` | "No data" chips |
| Operational Pulse | OIP placements (`surface=workspace_header`) | Legacy KPI strip (`OipPerformanceKpiRow`) |
| Business Processes | `loadOperatorLifecycleLandingCards` + OIP tile metrics | Empty state copy |
| Recent Activity | Workflow events + notifications API (new) | Hidden when empty |

### 2.4 Analytics separation IA

| Route | Plane | On Workspace? |
|-------|-------|---------------|
| `/workspace` | Operations — launch | ✅ |
| Analytics surfaces (existing admin metrics) | Intelligence — analyze | ❌ Never embedded |
| `/admin/settings/*` | Configuration | ❌ Sidebar admin only |

---

## 3. Complete page layout

### 3.1 Viewport anatomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR │  PRIMARY COLUMN                              │ COMMAND RAIL       │
│         │                                              │ (Actions · WF · BOS)│
│  Home   │  ┌─ Zone 1: Organization Pulse ─────────────────────────────┐   │
│  BP ▾   │  │ Firefly Early Learning                                    │   │
│         │  │ [Operational ●] [Enrollment ●] [Business ●] [Alerts ○]  │   │
│         │  └───────────────────────────────────────────────────────────┘   │
│         │                                              │                   │
│         │  ┌─ Zone 2: Operational Pulse ────────────────────────────────┐  │
│         │  │ NEEDS ATTENTION  OVERDUE  STARTING SOON  OUTSTANDING  …     │  │
│         │  │    12              4         3            $14.2k            │  │
│         │  └───────────────────────────────────────────────────────────┘  │
│         │                                              │                   │
│         │  BUSINESS PROCESSES                                              │
│         │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│         │  │ Enrollment   │ │ Billing      │ │ Scheduling   │             │
│         │  │ Needs Attn   │ │ $14.2k Out   │ │ 12 Changes   │  …         │
│         │  │ 7 Active     │ │ 6 Overdue    │ │ 4 Conflicts  │             │
│         │  │ 3 Tours      │ │ 3 Collections│ │              │             │
│         │  │ Open →       │ │ Open →       │ │ Open →       │             │
│         │  └──────────────┘ └──────────────┘ └──────────────┘             │
│         │                                              │                   │
│         │  ┌─ Zone 4: Recent Activity (collapsed) ────────────────────┐   │
│         │  │ ○ Tour confirmed · ○ Payment received · ○ Form completed  │   │
│         │  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Responsive behavior

| Breakpoint | Zone 3 grid | Zone 2 | Zone 4 |
|------------|-------------|--------|--------|
| ≥1280px | 3 columns | 2 rows max | Expanded |
| 960–1279px | 2 columns | 1–2 rows | Collapsed header |
| <960px | 1 column (full width cards) | Horizontal scroll strip | Collapsed |

### 3.3 Spacing tokens (System 5 aligned)

| Zone | Top margin | Internal padding | Max height guidance |
|------|------------|------------------|---------------------|
| Zone 1 | 0 | `px-0 pt-0 pb-2` | ~72px |
| Zone 2 | `WS_ZONE_MT.bandRow` | compact row | ~96px |
| Zone 3 | `WS_ZONE_MT.commandToGrid` | card grid gap 16px | flex-grow |
| Zone 4 | `mt-6` | `py-3` | ~120px expanded |

### 3.4 Zone visibility rules

| Condition | Behavior |
|-----------|----------|
| OIP health unavailable | Zone 1 shows "No data" — never hide zone |
| No pulse placements | Zone 2 hidden (not empty skeleton) |
| No lifecycle cards | Zone 3 empty state — configuration CTA for admins only |
| No activity feed | Zone 4 hidden entirely |
| `workspaceRollupRefined === false` | Zone 1–2 reserve quiet space; Zone 3 may render from cache |

---

## 4. Business Process card redesign

### 4.1 Anatomy (V3 target)

```
┌─ domain left rail ─────────────────────────────────────┐
│  [icon]  Enrollment                    [Health ● OK]   │
│                                                         │
│  ▎ Highest priority insight                            │
│     Needs Attention · 7 Active Leads                    │
│                                                         │
│  Tour Conversion          42%                           │
│  Tours Today                 3                          │
│  Waitlisted                  2                          │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Records 47    Attention 7    Stages 6      [ Open → ] │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Element specification

| Element | Source | Display rule |
|---------|--------|--------------|
| Process identity | `lifecycle.label` + `oipProcessIconKey` | Title 16/600 |
| Health indicator | Process-scoped OIP pack status | Chip top-right when not healthy |
| Highest-priority insight | First attention-bearing metric OR configured `primary_insight` placement | Ember when attention |
| Preview metrics | `MetricPlacementRenderer` zone `tile_metrics` | Max 3 lines, meaning-first labels |
| Workload footer | `activeRecordCount`, `needsAttentionCount`, `stageCount` | Micro labels 8px uppercase |
| Primary action | Static `Open →` | Juniper ghost → filled on hover |

### 4.3 Domain card examples

**Enrollment**
```
Enrollment                          [At Risk]
Needs Attention
7 Active Leads · 3 Tours Today · 2 Waitlisted
Records 47 · Attention 7 · Stages 6        Open →
```

**Billing**
```
Billing                             [Healthy]
Outstanding Balance
$14,200 Outstanding · 6 Overdue · 3 Collections
Accounts 128 · Attention 9 · Stages 4      Open →
```

**Scheduling**
```
Scheduling                          [Needs Attention]
Staffing Conflicts
12 Room Changes · 4 Staffing Conflicts
Assignments 340 · Attention 4 · Stages 3   Open →
```

### 4.4 Card interaction

| Interaction | Behavior |
|-------------|----------|
| Hover | Subtle border deepen; `Open →` fills juniper; prewarm WU bootstrap |
| Click card | Same as Open → — Operational Mode entry |
| Cmd/Ctrl+click | Native new tab (no transition intercept) |
| Keyboard | Focus ring; Enter activates |

### 4.5 Diff from current `WorkspaceRootLifecycleGrid`

| Current | V3 target |
|---------|-----------|
| Metrics inline without priority insight row | Explicit highest-priority insight line |
| Health implicit in metric coloring only | Process health chip when pack available |
| Fixed footer trio (Records · Attention · Stages) | Same, but Attention suppressed when shown in insight row |
| `MetricPlacementRenderer` with legacy fallback | Placement-first; legacy fallback retained for transition |

---

## 5. Conceptual mockups

Static mockups in [`mockups/`](./mockups/):

| File | Concept |
|------|---------|
| [`01-command-center-full-page.png`](./mockups/01-command-center-full-page.png) | Full four-zone layout — desktop command center |
| [`02-business-process-card-enrollment.png`](./mockups/02-business-process-card-enrollment.png) | Enrollment card — V3 anatomy with priority insight |
| [`03-business-process-grid.png`](./mockups/03-business-process-grid.png) | Zone 3 grid — six process gateway cards |
| [`04-navigation-zoom-sequence.png`](./mockups/04-navigation-zoom-sequence.png) | Workspace → Work Unit → Embedded Workspace → BOS continuity |

Mockups express System 5 tokens: white canvas, quiet borders, domain rails, juniper/ember accents, compact density. They are **conceptual targets** for Phase 1–2 implementation — not pixel-perfect specs.

---

## 6. Runtime implementation plan

### Phase 0 — Doctrine freeze (this sprint)

- [x] Canonical doctrine published
- [x] IA + layout + card spec
- [x] Mockups
- [ ] Stakeholder review

### Phase 1 — Zone restructuring (UI-only, ~3–5 days)

**Goal:** Split current command header into explicit Zone 1 / Zone 2 without changing data pipeline.

| Task | File(s) | Risk |
|------|---------|------|
| Extract `OrganizationPulseBand` from health section | New component + `WorkspaceHealthPulseSection.tsx` | Low — UI split |
| Extract `OperationalPulseBand` | New component | Low |
| Add `data-workspace-zone` attributes for all four zones | `WorkspaceRootShell.tsx` | Low |
| Zone 4 placeholder shell (hidden when no feed) | New `WorkspaceRecentActivitySection.tsx` | Low |

**Tests:** `workspaceRevealGatePage.test.ts`, `workspaceLayoutAlignment.test.ts` — must pass unchanged.

### Phase 2 — Business Process card V3 (~5–7 days)

**Goal:** Evolve card anatomy per §4 without changing entry routes or reveal gates.

| Task | File(s) | Risk |
|------|---------|------|
| Add `primaryInsight` to `OperatorLifecycleLandingCard` | `buildOperatorLifecycleLanding.ts` + API enrichment | Medium — data shape |
| Process health chip on tile | `WorkspaceRootLifecycleGrid.tsx` + OIP pack lookup | Low |
| Highest-priority insight row | `WorkspaceRootLifecycleGrid.tsx` | Low |
| CSS token alignment with System 5 card micro density | `workspace.css`, `alloyOsRuntime.css` | Low |

**Tests:** Snapshot/layout tests only — no runtime gate changes.

### Phase 3 — Recent Activity feed (~5–8 days)

**Goal:** Zone 4 with real data.

| Task | File(s) | Risk |
|------|---------|------|
| `GET /api/admin/workspace-recent-activity` | New route — workflow events + notifications | Medium — new API |
| Feed component with collapse | `WorkspaceRecentActivitySection.tsx` | Low |
| BOS insight snippet opt-in | Config flag | Low |

**Performance:** Background fetch only — never blocks above-fold reveal.

### Phase 4 — Motion and continuity (~3–5 days)

**Goal:** Zoom-in transition polish.

| Task | File(s) | Risk |
|------|---------|------|
| Shared transition token with WU entry | `runAdminV2NavigationTransition` | Medium — feel only |
| Card → WU visual continuity (rail persists) | Already true via `AdminV2Shell` | Low |

### Phase 5 — OIP placement migration (~2–3 days)

**Goal:** Retire legacy KPI strip fallback when all tenants have workspace_header placements.

| Task | File(s) | Risk |
|------|---------|------|
| Default placement seeds for Operational Pulse | Migration/seed script | Low |
| Remove `OipPerformanceKpiRow` fallback path | `WorkspaceHealthPulseSection.tsx` | Low — after seed |

### Out of scope (explicit)

- Work Unit layout changes
- Queue / Focus Panel / Universal Card changes
- BOS rail changes
- Analytics workspace build-out
- Experience Builder "Workspace layout" composer
- Department-first landing restoration

### Files touched (expected)

```
web/components/admin/workspace/
  WorkspaceRootShell.tsx
  WorkspaceRootLifecycleGrid.tsx
  WorkspaceHealthPulseSection.tsx
  OrganizationPulseBand.tsx          (new)
  OperationalPulseBand.tsx           (new)
  WorkspaceRecentActivitySection.tsx (new)
web/lib/admin/buildOperatorLifecycleLanding.ts
web/app/api/admin/workspace-recent-activity/route.ts (new)
docs/platform/operator/workspace-v3-command-center-doctrine.md
docs/platform/core/navigation-and-workspace-doctrine.md (cross-ref)
```

---

## 7. Domain validation matrix

Each row validates that the four-zone model + Business Process card doctrine works **without domain-specific UI branches**.

### Enrollment (reference implementation)

| Zone | Signal | Source |
|------|--------|--------|
| Org Pulse | Enrollment Health | OIP `enrollment` pack |
| Operational Pulse | Needs Attention · Upcoming Tours · Waiting Families | OIP placements |
| BP Card | 7 Active Leads · 3 Tours · 2 Waitlisted | Tile metrics + WU summaries |
| Entry | `/workspace/work-unit/enrollment_pipeline` | `entryHref` |
| Activity | Tour confirmed · Lead stage change | Workflow events |

**Pass criteria:** Operator sees attention before opening Enrollment; card preview matches first Work Unit scan.

### Billing

| Zone | Signal | Source |
|------|--------|--------|
| Org Pulse | Business Health | OIP `operational_health` + billing pack |
| Operational Pulse | Outstanding Payments · Overdue Accounts | OIP placements |
| BP Card | $14,200 Outstanding · 6 Overdue · 3 Collections | Billing metric pack |
| Entry | Billing WU slug | Lifecycle catalog |
| Activity | Payment received · Invoice sent | Workflow events |

**Pass criteria:** Dollar amounts are preview-only; authoritative balances inside Work Unit/drawer.

### Scheduling

| Zone | Signal | Source |
|------|--------|--------|
| Org Pulse | Operational Health | Cross-pack |
| Operational Pulse | Staffing Conflicts · Room Changes | OIP placements |
| BP Card | 12 Room Changes · 4 Conflicts | Scheduling summaries |
| Entry | Scheduling WU | Lifecycle catalog |

### Attendance

| Zone | Signal | Source |
|------|--------|--------|
| Operational Pulse | Children Starting Soon · Absence alerts | OIP placements |
| BP Card | Today's expected · Check-in gaps | Attendance pack |
| Entry | Attendance WU | Lifecycle catalog |

### Compliance

| Zone | Signal | Source |
|------|--------|--------|
| Operational Pulse | Licensing Deadlines · Expiring Documents | OIP placements |
| BP Card | Expiring count · Overdue filings | Compliance pack |
| Entry | Compliance WU | Lifecycle catalog |

### Staffing

| Zone | Signal | Source |
|------|--------|--------|
| Operational Pulse | Open shifts · Coverage gaps | OIP placements |
| BP Card | Unfilled shifts · Time-off pending | Staffing pack |
| Entry | Staffing WU | Lifecycle catalog |

### Health (medical / safety)

| Zone | Signal | Source |
|------|--------|--------|
| Operational Pulse | Expiring immunizations · Allergy updates | OIP placements |
| BP Card | Records needing review · Exclusions | Health pack |
| Entry | Health WU | Lifecycle catalog |

### Cross-domain validation rules

| Rule | Test |
|------|------|
| Same card anatomy for all domains | No `if (processKey === 'enrollment')` layout branches |
| Preview ≠ authority | Opening card never skips entity GET inside WU |
| Analytics separated | No trend charts on Workspace for any domain |
| Operational Mode entry | Every card → immediate subject + Focus Panel |
| Site filter respected | Pulse and tile counts honor `workspace_site_id` |

---

## Appendix — Critique of current landing

| Issue | Current behavior | V3 fix |
|-------|------------------|--------|
| Dashboard framing | KPI row reads as reporting | Operational Pulse — action-oriented labels |
| Zone 3 not dominant | Header + KPI compete with tiles | Reduce Zone 1–2 height; expand grid |
| No activity context | Missing Zone 4 | Recent Activity feed |
| Cards feel like nav | Link-styled tiles | Miniature operational surfaces |
| Implicit health | Health buried in strip | Organization Pulse — explicit heartbeat |
| Analytics bleed | KPI targets/status on landing | Strict operational vs analytical split |

---

## Related

- [`workspace-v3-command-center-doctrine.md`](../../../platform/operator/workspace-v3-command-center-doctrine.md)
- [`navigation-and-workspace-doctrine.md`](../../../platform/core/navigation-and-workspace-doctrine.md)
- [`operational-surface-design-system.md`](../../../platform/operator/operational-surface-design-system.md)
- [`adminv2-runtime-performance-doctrine.md`](../../../system/adminv2-runtime-performance-doctrine.md)
