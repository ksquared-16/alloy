# Work Unit Layout Doctrine

**Status:** Canonical V2 (June 2026)  
**Scope:** All Admin V2 work-unit execution surfaces (`WorkUnitWorkspace`, slug and UUID routes)

## Purpose

Lock a consistent work-unit page structure where the **queue remains the primary operating surface**, while **Workflow Telemetry stays discoverable** without consuming excessive vertical space.

Related: **`workspace-system.md`**, **`platform-performance-doctrine.md`**, **`bos-foundation.md`**.

## Page zones (priority order)

### Zone 1 — Work Unit Header

**Contains:** lifecycle name, work unit title, stage pills / sibling work units, Needs Attention (when configured), filters/search.

**Behavior:** Normal page content in the control deck. Unchanged.

**Implementation:** `adminv2-ws-dept-v2-control-deck` inside `WorkUnitWorkspace` primary column.

### Zone 2 — Queue Workspace (primary)

**Contains:** queue rows, queue actions, row interactions, row expansion.

**Behavior:**

- Queue is the **dominant** surface — not compressed to expose telemetry.
- Queue list uses a **bounded scroll shell** (`.adminv2-ws-wu-queue-list-shell`).
- Target **~5–7 visible rows** on standard laptop viewports; **~6–8** on larger monitors.
- Row behavior, selection, drawer open, and registry actions are **unchanged**.

**CSS tokens** (work-unit surface only):

| Token | Role |
|-------|------|
| `--ws-wu-queue-visible-rows-target` | Row-count target (6 laptop; 7 @1440px; 8 @1280×900+) |
| `--ws-wu-queue-row-stack-estimate` | Per-row height estimate from `--ws-dept-queue-row-min-height` |
| `--ws-wu-queue-records-scroll-top-offset` | Reserve space for Zone 1 header deck |
| `--ws-wu-queue-intelligence-banner-reserve` | Reserve ~4.5rem for collapsed telemetry banner |
| `--ws-wu-queue-records-scroll-height-cap` | Hard cap (640px) |
| `--ws-wu-queue-records-scroll-max-height` | `min(row-target, viewport-remaining, cap)` |

### Zone 3 — Workflow Telemetry Summary Banner

**Contains:** collapsed telemetry summary — Runs Today, Success Rate, Failures, Expand control.

**Behavior:**

- **Always visible** below the queue without page scroll (standard desktop).
- Single compact row (~60–80px).
- Immediately communicates automation health.
- **Collapsed by default** on work-unit pages.

**Implementation:** `AutomationWorkflowsBlock` with `presentation="work_unit_summary"` in `primaryFooterSlot` → `[data-workspace-zone="operational-intelligence"]`.

### Zone 4 — Expanded Operational Intelligence (on demand)

**Contains:** full telemetry — throughput/reliability metric groups, scoped workflow lists, Open Automations / Ask Workflow Assist.

**Behavior:**

- Revealed when operator clicks **Expand** on the summary banner.
- Expands **inline** below the banner (no modal, no drawer).
- May use full telemetry height when expanded.
- **No data removed** — same KPIs and workflow partitions as the full department card.

## BOS Rail Doctrine

BOS is a **persistent assistant surface** outside the four-zone vertical flow.

**Requirements:**

- BOS rail stays **fixed in viewport** while primary-column content scrolls.
- BOS does **not** move when scrolling queue content or telemetry sections.
- BOS remains continuously available as operational copilot.

**Implementation:** `[data-adminv2-workspace-command-column]` uses `position: sticky` + `--adminv2-workspace-rail-height` in `adminV2.css`.

## Future work units

All new work-unit surfaces **must**:

1. Render through `WorkUnitWorkspace` + `WorkspaceShellLayout`.
2. Keep Zone 2 queue bounded but **row-count-primary** (~5–7+ visible rows).
3. Mount `AutomationWorkflowsBlock` with `presentation="work_unit_summary"` below the queue.
4. Keep BOS in the sticky command column.

**Must not:**

- Shrink the queue solely to expose telemetry detail by default.
- Hide telemetry entirely below the fold.
- Require scrolling before operators discover that automation exists.

## Validation checklist

- [ ] Queue shows ~5–7 records on standard laptop without inner scroll (or scrolls only when list exceeds target).
- [ ] Workflow Telemetry summary banner visible without page scroll.
- [ ] Telemetry detail hidden until Expand.
- [ ] Expand reveals full telemetry (metrics + workflow lists + actions).
- [ ] BOS rail position stable while primary column scrolls.
- [ ] Queue row open, filters, and registry actions unchanged.
- [ ] Slug and UUID work-unit routes share `WorkUnitWorkspace` shell.

## Code map

| Concern | Location |
|---------|----------|
| Zone layout shell | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` |
| Telemetry summary + expand | `web/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx` |
| Queue height tokens | `web/app/adminV2/components/workspace/workspace.css` |
| BOS sticky rail | `web/app/adminV2/adminV2.css` |
| Tests | `web/tests/adminV2/workUnitLayoutDoctrine.test.ts`, `web/tests/admin/adminV2QueueRowClick.test.ts` |
