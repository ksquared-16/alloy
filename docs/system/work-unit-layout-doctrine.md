# Work Unit Layout Doctrine

**Status:** Canonical V3 (June 2026)  
**Scope:** All Admin V2 work-unit execution surfaces (`WorkUnitWorkspace`, slug and UUID routes)

## Purpose

Lock a consistent work-unit page structure where the **queue remains the primary operating surface**. Workflow telemetry is **secondary diagnostic information** and lives in the **right command rail** — not in the primary page flow.

Related: **`workspace-system.md`**, **`platform-performance-doctrine.md`**, **`bos-foundation.md`**.

## Primary page flow

Work-unit pages contain **two vertical zones only**:

1. **Header** — lifecycle, filters, KPI strip, lane context  
2. **Queue** — dominant operating surface for record processing  

**Nothing appears below the queue.** Telemetry is not part of the main page flow.

## Queue visibility doctrine

Queue visibility is **higher priority** than telemetry visibility.

- Queue list uses a **bounded scroll shell** (`.adminv2-ws-wu-queue-list-shell`) with **`overflow-y: auto`** — the queue owns scroll, not the page.
- Target **5–6 visible rows** on laptop viewports; **6–7** on larger monitors (with **`data-ws-wu-queue-density="pass-1"`** compact spacing active on `WorkUnitWorkspace`).
- Queue lane **bottom aligns with command rail bottom** on desktop (throughput deck stretches to rail height).
- **Scroll ownership:** `.adminv2-ws-wu-queue-list-shell` owns `overflow-y: auto`; header and rails stay fixed.
- Work-unit rows use **compact spacing** (`data-ws-wu-queue-density="pass-1"`) — padding/gap only; typography and badge sizes unchanged.
- Row behavior, selection, drawer open, and registry actions are **unchanged**.
- Telemetry must **not** consume primary-column vertical space.

**CSS tokens** (work-unit surface only):

| Token | Role |
|-------|------|
| `--ws-wu-queue-visible-rows-target` | Row-count floor (6 laptop / 7 @1440px+ with pass-1) |
| `--ws-wu-queue-row-min-height` | Work-unit row min height (~37px with pass-1) |
| `--ws-wu-queue-row-stack-estimate` | Per-row height estimate for scroll floor |
| `--ws-wu-queue-records-scroll-top-offset` | Reserve space for header deck (~14rem) |
| `--ws-wu-queue-records-scroll-max-height` | Viewport-based scroll fallback (mobile) |
| `--ws-wu-contain-padding-inline-end` | Trailing contain inset (`0` — rail closer to viewport edge) |
| `--ws-wu-workbench-gutter` | Primary ↔ command gap (`14px`; default surfaces use `20px`) |
| `--ws-wu-queue-icon-primary-size` | Household / entity icon (`16px`) |
| `--ws-wu-queue-icon-secondary-size` | Contact / child / email / phone icons (`14px`) |
| `--ws-wu-queue-icon-muted-color` | Neutral metadata icon color |
| `--ws-wu-queue-icon-neutral-color` | Primary entity icon color |

## Horizontal layout polish (right rail edge alignment)

Reclaim **~16–32px** for the primary queue without shrinking the command rail or BOS content.

**Rules:**

- Trim **trailing** workspace scroll padding on work-unit routes (`padding-right: 12px` at `sm+`; was `20px` from shell `px-5`).
- Set **`--ws-wu-contain-padding-inline-end: 0`** on work-unit root (default contain trailing inset is `12px`).
- Tighten **`--ws-wu-workbench-gutter`** to `14px` for page split, operational row, and command-rail separator padding.
- **Do not** change command column grid fraction or BOS host `min-height`.
- **Do not** introduce horizontal overflow; drawer overlay geometry unchanged (`--adminv2-drawer-outer-margin` untouched).
- Scoped to **`work_unit` + `adminv2-ws-wu-v2`** only — department/record/company surfaces keep default gutters.

## Queue record icon + color doctrine

Work-unit queue rows use **neutral metadata icons**. Pine/green is **not** a default person/contact accent.

| Role | Size | Color |
|------|------|-------|
| Household / primary entity | `16px` (`--ws-wu-queue-icon-primary-size`) | `--ws-wu-queue-icon-neutral-color` |
| Person, email, phone, related child | `14px` (`--ws-wu-queue-icon-secondary-size`) | `--ws-wu-queue-icon-muted-color` |
| Primary contact name | typography tier | dark / midnight — **not** green |
| Email / phone values | typography tier | muted text + muted icon |
| Status / attention | semantic tokens | unchanged — amber/red only when meaningful |
| BOS + row action buttons | existing pine treatment | **only** explicit action affordances |

**Reserved pine/green for:**

- BOS composer and row **Work with BOS** controls
- Positive / selected / active action states
- Brand accents on buttons — **not** record metadata icons

**Do not:** mix green person icons with dark email/phone icons in the same contact stack; use decorative pine circles on household icons.

Implementation: `workspace.css` under `[data-ws-surface="work_unit"].adminv2-ws-wu-v2`. Cross-surface queue row rules remain in **`queue-record-doctrine.md`**; work-unit surfaces override icon color to neutral per this doc.

## Right rail utilities (Actions → Telemetry → BOS)

Telemetry is a **right rail utility** alongside Actions and BOS — same collapsible pattern as Actions.

**Order (fixed):**

1. **Actions** — registry / lifecycle actions  
2. **Workflow Telemetry** — compact operator utility  
3. **BOS** — sticky assistant dock  

### Workflow Telemetry — collapsed (default)

**Collapsed rail modules are always a single row with a count**, matching Actions.

- **▶ Workflow Telemetry (n)** with workflow iconography — `n` = runs today (recent activity), not failures  
- **No** secondary line, metrics, health summary, or subtitles in collapsed state  
- Failures / health concerns use **attention badge** on the collapsed header, not the count  
- Telemetry details appear **only when expanded**  

Canonical rail pattern:

```
▶ Actions (N)
▶ Workflow Telemetry (n)
BOS
```

### Workflow Telemetry — expanded (on demand)

Operator-relevant information **only**:

- **Workflow Health** — status label + runs today / success / failures (plain lines)  
- **Recent Workflow Activity** — short bullet list of recent scoped workflow runs  
- **Actions** — Open Automations, Workflow Diagnostics  

**Must not** show in work-unit rail expand:

- Throughput dashboards  
- Reliability cards  
- 7-day KPI grids  
- Analytics blocks  

Detailed analytics belong on department surfaces (`presentation="full"`) or dedicated diagnostics pages.

Expanded content scrolls **inside the telemetry section**. It must **not** push queue content down or reduce BOS height.

**Implementation:** `AutomationWorkflowsBlock` with `presentation="work_unit_rail"` in `commandRailTelemetrySlot` → `[data-command-rail-telemetry]` inside `WorkspaceCommandRailShell`.

## BOS rail doctrine

BOS is a **persistent assistant surface** fixed below telemetry in the command rail.

**Requirements:**

- **Do not** reduce, shrink, or move BOS to make room for telemetry.  
- BOS stays **fixed in viewport** while primary-column content scrolls.  
- Telemetry adapts around BOS (internal scroll / collapse), not the reverse.  
- BOS remains continuously available as operational copilot.  

**Implementation:** `[data-adminv2-workspace-command-column]` uses `position: sticky` in `adminV2.css`. BOS host uses `flex: 1 1 auto` with `min-height: 14rem` on work-unit surfaces.

## Department / diagnostics full telemetry (unchanged)

Department context-lower surfaces keep `AutomationWorkflowsBlock` with `presentation="full"` (default) — full metric groups, scoped workflow lists, Ask Workflow Assist.

## Future work units

All new work-unit surfaces **must**:

1. Render through `WorkUnitWorkspace` + `WorkspaceShellLayout`.  
2. Keep primary flow as **Header → Queue** only.  
3. Mount telemetry with `presentation="work_unit_rail"` in the command rail.  
4. Keep BOS below telemetry without height reduction.  

**Must not:**

- Mount telemetry below the queue or anywhere in the primary column.  
- Show analytics dashboards in work-unit rail expand.  
- Shrink BOS for telemetry expansion.  

## Success criteria

A user should be able to:

1. See **more queue records** without scrolling (≥2–3 additional rows vs pre-rail layouts).  
2. Keep **BOS fully visible**.  
3. **Expand telemetry** when workflow health, recent activity, or diagnostics are needed.  
4. **Access Automations** without leaving the work unit.  

## Validation checklist

- [ ] Queue shows 6–8 rows on common laptop viewports without page scroll.  
- [ ] No telemetry below queue or in primary column.  
- [ ] Right rail shows Actions, Workflow Telemetry, BOS in order.  
- [ ] Queue scrolls independently (`overflow-y: auto` on `.adminv2-ws-wu-queue-list-shell`); 50+ records reachable.
- [ ] Wheel over queue scrolls the queue (not the page shell).
- [ ] Telemetry collapsed header is single-row (matches Actions).  
- [ ] Expand shows operator content only (health, recent activity, actions).  
- [ ] Expand does not move queue or shrink BOS.  
- [ ] BOS remains visible or recoverable after telemetry expansion.  
- [ ] Slug and UUID routes share `WorkUnitWorkspace` shell.  
- [ ] Department pages keep full telemetry (`presentation="full"`).  

## Code map

| Concern | Location |
|---------|----------|
| Primary layout shell | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` |
| Command rail shell | `web/app/adminV2/components/workspace/WorkspaceCommandRailShell.tsx` |
| Rail telemetry block | `web/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx` |
| Queue height tokens | `web/app/adminV2/components/workspace/workspace.css` |
| Rail telemetry styles | `web/app/adminV2/adminV2.css` |
| BOS sticky rail | `web/app/adminV2/adminV2.css` |
| Tests | `web/tests/adminV2/workUnitLayoutDoctrine.test.ts`, `web/tests/admin/adminV2QueueRowClick.test.ts` |
