# Work Unit Layout Doctrine

**Status:** Canonical V3 (June 2026)  
**Scope:** All Admin V2 work-unit execution surfaces (`WorkUnitWorkspace`, slug and UUID routes)

## Purpose

Lock a consistent work-unit page structure where the **queue remains the primary operating surface**, while **Workflow Telemetry stays discoverable in the right command rail** without consuming primary-column vertical space.

Related: **`workspace-system.md`**, **`platform-performance-doctrine.md`**, **`bos-foundation.md`**.

## Page zones (priority order)

### Zone 1 — Work Unit Header

**Contains:** lifecycle name, work unit title, stage pills / sibling work units, Needs Attention (when configured), filters/search.

**Behavior:** Normal page content in the control deck. Unchanged.

**Implementation:** `adminv2-ws-dept-v2-control-deck` inside `WorkUnitWorkspace` primary column.

### Zone 2 — Queue Workspace (primary)

**Contains:** queue rows, queue actions, row interactions, row expansion.

**Behavior:**

- Queue is the **dominant** surface — telemetry does not sit below the queue.
- Queue list uses a **bounded scroll shell** (`.adminv2-ws-wu-queue-list-shell`).
- Target **≥5 visible rows** on standard laptop viewports; **~7–9** on larger monitors (row height unchanged).
- Row behavior, selection, drawer open, and registry actions are **unchanged**.

**CSS tokens** (work-unit surface only):

| Token | Role |
|-------|------|
| `--ws-wu-queue-visible-rows-target` | Row-count target (7 laptop; 8 @1440px; 9 @1280×900+) |
| `--ws-wu-queue-row-stack-estimate` | Per-row height estimate from `--ws-dept-queue-row-min-height` |
| `--ws-wu-queue-records-scroll-top-offset` | Reserve space for Zone 1 header deck |
| `--ws-wu-queue-records-scroll-height-cap` | Hard cap (680px) |
| `--ws-wu-queue-records-scroll-max-height` | `min(row-target, viewport-remaining, cap)` |

### Zone 3 — Command Rail (Actions → Telemetry → BOS)

**Right rail order:**

1. **Actions** — registry / lifecycle actions (collapsible section).
2. **Workflow Telemetry** — collapsed card by default.
3. **BOS** — sticky assistant dock at bottom of rail.

**Workflow Telemetry collapsed state:**

- Title: **Workflow Telemetry**
- Subtitle: **Automations**
- Inline summary metrics: Runs Today, Success Rate, Failures
- Expand / Collapse control

**Workflow Telemetry expanded state:**

- Full telemetry content inside the rail card (metric groups, scoped workflow lists).
- **Open Automations** and **Ask Workflow Assist** actions.
- Scroll inside the expanded telemetry card or rail area when content exceeds rail height.
- **Must not** push queue content down or move the primary column.

**Implementation:** `AutomationWorkflowsBlock` with `presentation="work_unit_rail"` in `commandRailTelemetrySlot` → `[data-command-rail-telemetry]` inside `WorkspaceCommandRailShell`.

### Zone 4 — Department / diagnostics full telemetry (unchanged)

**Contains:** full telemetry card on department context-lower surfaces and other non-work-unit pages.

**Behavior:** `AutomationWorkflowsBlock` with `presentation="full"` (default). Not mounted below the work-unit queue.

## BOS Rail Doctrine

BOS is a **persistent assistant surface** in the command rail, below Actions and Telemetry.

**Requirements:**

- BOS rail stays **fixed in viewport** while primary-column content scrolls.
- BOS does **not** move when scrolling queue content.
- Expanded telemetry must not push BOS offscreen — use internal scrolling or collapse telemetry.
- BOS remains continuously available as operational copilot.

**Implementation:** `[data-adminv2-workspace-command-column]` uses `position: sticky` + `--adminv2-workspace-rail-height` in `adminV2.css`. BOS host uses `flex: 1 1 auto` with `min-height: 14rem` on work-unit surfaces.

## Future work units

All new work-unit surfaces **must**:

1. Render through `WorkUnitWorkspace` + `WorkspaceShellLayout`.
2. Keep Zone 2 queue bounded but **row-count-primary** (≥5+ visible rows on laptop).
3. Mount `AutomationWorkflowsBlock` with `presentation="work_unit_rail"` in the command rail (not below the queue).
4. Keep BOS in the sticky command column below telemetry.

**Must not:**

- Mount telemetry below the queue on work-unit pages.
- Shrink the queue solely to expose telemetry detail by default.
- Expand telemetry in the primary column (queue must not shift).

## Validation checklist

- [ ] Queue shows more records than V2 (no banner reserve below queue).
- [ ] No telemetry cutoff below queue (telemetry is in the rail).
- [ ] Right rail shows Actions, Workflow Telemetry, BOS in order.
- [ ] Telemetry collapsed by default.
- [ ] Expand works without moving queue.
- [ ] BOS remains visible or recoverable after telemetry expansion.
- [ ] Queue row open, filters, and registry actions unchanged.
- [ ] Slug and UUID work-unit routes share `WorkUnitWorkspace` shell.
- [ ] Department pages keep full telemetry (`presentation="full"`).

## Code map

| Concern | Location |
|---------|----------|
| Zone layout shell | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` |
| Command rail shell | `web/app/adminV2/components/workspace/WorkspaceCommandRailShell.tsx` |
| Telemetry rail card | `web/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx` |
| Queue height tokens | `web/app/adminV2/components/workspace/workspace.css` |
| BOS sticky rail | `web/app/adminV2/adminV2.css` |
| Tests | `web/tests/adminV2/workUnitLayoutDoctrine.test.ts`, `web/tests/admin/adminV2QueueRowClick.test.ts` |
