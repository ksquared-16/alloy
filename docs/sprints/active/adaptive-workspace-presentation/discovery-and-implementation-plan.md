---
owner: platform
status: active-sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Adaptive Workspace Presentation Contract — Discovery & Implementation Plan

> **Sprint:** `adaptive-workspace-presentation` · slot **3** · branch `agent/cursor/3-adaptive-workspace-presentation`  
> **Base:** `origin/staging` @ `1bfe7d1de`  
> **Not doctrine.** Durable rules land in `docs/platform/core/navigation-and-workspace-doctrine.md` and `docs/platform/modules/communications-platform.md` at closeout.

## 0. Problem evidence (initiating)

On constrained desktop/laptop canvases the same canonical composition becomes unfriendly:

1. Pinned BOS / command rail (~345px, `max(345px, 28vw)`) consumes scarce working width.
2. Queue rail is rigid at `xl:w-[24rem]` (384px) and does not yield before Focus Panel.
3. Workspace metric tiles use `flex-wrap` + `min-w-[9.5rem]` and wrap into a second row.
4. Communications Activity always mounts the topic rail (~200px), including empty and reply states.
5. Height reduction clips useful content when outer shells assume large-screen no-scroll composition.

**Frozen product decisions:** one runtime; Focus Panel primary; BOS always available but not always pinned; queue is condensed preview; metrics stay one row; Communications adapts by operator state; scrolling is allowed under controlled ownership; decisions prefer container width with Expanded / Compact / Constrained states.

## 1. Ownership map

```text
AdminV2Shell (h-screen overflow-hidden)
├── Sidebar
└── content column
    ├── TopNavBar
    └── [data-adminv2-workspace-ambient-root]  ← ADAPTIVE MEASURE TARGET
        ├── primary canvas (min-w-0 flex-1)
        │   ├── WorkspaceSurface → WorkspaceHeader KPIs + ProcessGrid
        │   └── WorkUnit → FocusPanelSurface
        │       ├── QueueRegion column (xl:w-[24rem] today)
        │       └── Focus Panel boundary → InlineOpportunityFocusPanel
        │           └── Activity → activity_embed + alloy-os-activity-cockpit
        └── AdminV2PersistentCommandRail (345px) + CommandRailBosMount overlay
```

| Region | Canonical owner | Key files |
|--------|-----------------|-----------|
| Workspace landing KPIs | Presentation Runtime | `WorkspaceHeader.tsx`, `workspaceTokens.ts` |
| Process tiles | Presentation Runtime | `ProcessGrid.tsx`, `ProcessSummaryCard.tsx` |
| Queue ↔ Focus split | Presentation Runtime | `FocusPanelSurface.tsx`, `QueueRegion.tsx` |
| Focus cards | Focus Panel grid engine | `FocusPanelCardGrid.tsx`, `focusPanelCardGrid.ts` (ResizeObserver) |
| BOS / command rail | AdminV2 shell | `AdminV2Shell.tsx`, `AdminV2PersistentCommandRail.tsx`, `CommandRailBosMount.tsx`, `adminV2.css` |
| Activity / Communications | Comms + Focus Activity | `FamilyCommunicationWorkspaceView.tsx` (`activity_embed`), `alloyOsRuntime.css` cockpit |
| Scroll doctrine | Shell + region owners | ambient `overflow-hidden`; queue/focus/timeline own `overflow-y-auto` |

### Fixed widths / breakpoints found

| Rule | Value | Scope |
|------|-------|-------|
| Persistent command rail | `width: var(--ws-rail, 345px)`; `max-width: min(345px, 28vw)` | Shell CSS |
| Rail ≤1000px viewport | full-width stack, `max-height: min(42vh, 520px)` | Viewport media (not container) |
| Queue column | `xl:w-[24rem]` (384px), `xl:flex-none` | Presentation Tailwind |
| Alloy OS queue token (legacy split) | `--alloy-os-queue-compressed-width: 440px` | Alloy OS CSS (not Presentation owner) |
| Focus card columns | &lt;560→1, ≥560→2, ≥820→3, ≥1040→4; min card 240px | JS ResizeObserver |
| KPI tile | `min-w-[9.5rem]` standard / `min-w-[7rem]` compact API (unused by header) | Presentation |
| KPI region | `flex flex-wrap gap-4` | **wraps today** |
| Topic rail (activity_embed) | `w-[12.5rem]` (190–220 clamp) | Communications |
| Activity cockpit | `1fr` + `minmax(220px, min(320px, 28vw))`; stacks ≤900px | Alloy OS CSS |

### Container queries

- **None** under `web/components/presentation`.
- Drawer overview uses `@container`; Alloy OS focus panel sets `container-type` without `@container` rules; Focus cards use ResizeObserver.

### Platform vs domain

Shared: shell rail, Presentation queue/Focus split, WorkspaceHeader KPIs, Focus card grid.  
Domain-specific: Opportunity inline panel, Activity cockpit / `activity_embed`, enrollment accents.

### Minimum viable widths (coded floors → plan inputs)

| Surface | MVW | Basis |
|---------|-----|-------|
| BOS pinned | 220–345px | page-split min / `--ws-rail` |
| Readable queue | ~280–384px | condensed rows; today’s pin is 384 |
| Focus work cards | 240px card; ~420px usable pane; 560px for 2-col | grid constants |
| Comms reading | ~380px conversation after topic | Command Center track + topic 200 |
| Comms composing | ~420px+ conversation | recipient + composer comfort |

## 2. Accepted adaptive contract (to implement)

### States (operational ambient width = `[data-adminv2-workspace-ambient-root]`)

Starting thresholds (validate with browser evidence; adjust only with recorded rationale):

| State | Ambient width | Intent |
|-------|---------------|--------|
| **Expanded** | ≥ 1320px | Pinned command/BOS rail allowed; queue ~320–384px; Focus gets remainder; metrics standard density |
| **Compact** | 980–1319px | BOS **unpinned** (overlay on demand); queue condensed ~280–320px; metrics compact density, one row; Focus reclaims rail width |
| **Constrained** | &lt; 980px | BOS unpinned; queue may become temporary/collapsible selection surface; metrics compact one-row (horizontal overflow only if unavoidable); Comms collapses non-task columns |

Measurement target is the ambient root (primary + rail row), not raw viewport — accounts for sidebar and top chrome indirectly via remaining width.

### Behavioral rules

1. **Focus Panel primary** — reclaim width from BOS then tertiary queue chrome before Focus becomes unusable.
2. **BOS** — same conversation/runtime; pin only in Expanded; Compact/Constrained hide rail column width and open via existing overlay/panel + a compact platform trigger (no second BOS).
3. **Queue** — clamp widths by state; remain preview/selection; preserve URL/selection/warm nav.
4. **Metrics** — never wrap; use compact density before overflow; prefer `flex-nowrap` + shrink; contained `overflow-x-auto` only as last resort; never silently hide.
5. **Communications Activity** — derive composition from existing state:
   - empty / no conversations → hide topic rail
   - reading selected thread (composer collapsed) → show topic rail
   - new message / reply composing → hide/collapse topic rail; preserve timeline + composer width
   - cancel/send restores prior reading/selection (no lifecycle fork)
6. **Scroll** — keep explicit owners; allow body scroll under reduced height; do not clip to preserve large-screen no-scroll myth.

## 3. Implementation plan (smallest coherent change)

### A. Shared adaptive state

Add:

- `web/lib/presentation/adaptiveWorkspacePresentation.ts` — pure helpers: thresholds, `deriveAdaptiveWorkspacePresentation(width)`, BOS pin predicate, queue width class tokens, metric density.
- `web/lib/presentation/useAdaptiveWorkspacePresentation.ts` — ResizeObserver on ambient root; sets `data-workspace-presentation` on ambient root (and optionally `html` for shell CSS).
- `web/app/adminV2/components/adaptiveWorkspacePresentation.css` — container/data-attribute rules for rail visibility, queue clamps, metric nowrap. Prefer data-attribute driven CSS over a new framework.

Wire observer from `AdminV2Shell` ambient root (one mount).

### B. BOS rail

- Conditionally omit or collapse `AdminV2PersistentCommandRail` column when presentation ≠ expanded (CSS `display`/`width:0` via `data-workspace-presentation` on ambient ancestor, or conditional render that keeps BOS mount alive).
- Reuse `CommandRailBosMount` overlay; add compact trigger (header or floating control) that reveals the overlay panel without a pinned column.
- Preserve Actions registration path; when rail collapsed, Actions remain reachable via existing registrar patterns or a compact menu if already present.
- Certify pin↔unpin both directions without remounting a second AI runtime if avoidable (keep `CommandRailBosMount` mounted).

### C. Queue / Focus

- Replace rigid `xl:w-[24rem]` with state-driven widths:
  - Expanded: ~24rem
  - Compact: ~18–20rem
  - Constrained: collapsible / temporary panel presentation of **same** queue state
- Keep `FocusPanelSurface` structure; only change width/clamp/collapse chrome.

### D. Metrics

- Workspace header KPI row: `flex-nowrap`, enable `density="compact"` under Compact/Constrained, reduce gap; optional `overflow-x-auto` fallback with visible affordance — never wrap.

### E. Communications Activity

- In `activity_embed` branch of `FamilyCommunicationWorkspaceView`:
  - Hide topic rail when `activityThreadList.length === 0` OR composing (`isNewMessageMode || replyComposerExpanded`).
  - Keep New affordance in conversation header when rail hidden.
  - No changes to send/select/cache/VM paths.

### F. Scroll

- Audit Focus Activity `overflow-hidden` vs reduced height; ensure queue body, focus body (non-Activity), topic list, timeline, composer remain reachable.
- Prefer fixing `min-h-0` / flex chain over removing ownership.

### G. Docs / tests / evidence

- Update `navigation-and-workspace-doctrine.md` with Adaptive Workspace Presentation Contract.
- Update `communications-platform.md` for Activity composition states.
- Unit tests: presentation derivation; BOS pin predicate; Comms composition derivation.
- Browser evidence matrix at 1728×1117, 1440×900, 1366×768, 1280×800, and one constrained width.

## 4. Non-goals (enforced)

No mobile runtime, no second shell/queue/BOS/comms lifecycle, no Presentation Runtime redesign, no visual-language rewrite, no queue authority changes.

## 5. Success gate

Large screens retain today’s composition; compact screens reclaim Focus width; BOS available without permanent scarce-space occupancy; queue recognizable as condensed rail; metrics one row; Activity prioritizes task; height uses controlled scroll; one runtime inherited by current/future workspaces.

## 6. Checkpoint status

| Item | Status |
|------|--------|
| Managed sprint bootstrap | Done (slot 3, clean, 0/0 vs staging) |
| Ownership map | Done (this doc) |
| Implementation plan | Done (this doc) |
| Code realization (shared state, BOS unpin, queue clamps, metrics one-row, Activity composition) | In progress — landed in worktree |
| Focused unit tests (`adaptiveWorkspacePresentation`) | Pass (5/5) |
| Browser certification | Pending (runtime admission currently refused-capacity; actuate when capacity allows) |
| Doctrine | Updated: navigation-and-workspace-doctrine + communications-platform |
| Closeout | Pending |

### Implementation summary (current)

- `adaptiveWorkspacePresentation.ts` — Expanded/Compact/Constrained + BOS pin + Activity composition
- `useAdaptiveWorkspacePresentation` on AdminV2 ambient root
- Compact/Constrained: command/BOS rail off-canvas; `AdaptiveBosRailTrigger` slides same rail in
- Queue column: 24 / 18 / 16 rem by state via `data-adaptive-queue-column`
- WorkspaceHeader metrics: `flex-nowrap` + compact density below Expanded
- Activity embed: topic rail only in reading; New affordance moves to conversation header when rail hidden

---

*No constitutional conflict found. Realization continues inside existing Presentation Runtime and shell primitives.*
