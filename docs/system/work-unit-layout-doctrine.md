# Work Unit Layout Doctrine

**Status:** **Canonical V3 — frozen (June 2026)**  
**Scope:** All Admin V2 work-unit execution surfaces (`WorkUnitWorkspace`, slug and UUID routes)

This is a **doctrine lock**, not a redesign exercise. Do not propose alternatives unless correcting a defect.

Related: **`workspace-system.md`**, **`queue-record-doctrine.md`**, **`platform-performance-doctrine.md`**, **`bos-foundation.md`**.

Closeout: **`docs/sprints/archive/06_2026/completed/work_unit_layout_v3_freeze_closeout.md`**.

---

## Approved Layout Baseline (June 2026)

Validated on staging and approved as the canonical work-unit implementation:

| Baseline | Rule |
|----------|------|
| **Queue density (pass-1 adopted)** | Spacing-only compact rows — reduced vertical padding, internal gaps, action-rail spacing. **No** further typography reduction. |
| **Queue icon doctrine** | Household `16px`; person / child / email / phone `14px`; **neutral** metadata color only. Pine reserved for BOS + explicit actions. |
| **Queue width doctrine** | Trailing contain inset `0`, workbench gutter `14px`, scroll-surface trailing padding `12px` — reclaim primary queue width without changing BOS rail width. |
| **Command rail utilities** | Collapsed **Actions (N)** and **Workflow Telemetry (n)** — single-line headers with counts only. |
| **BOS preservation** | Sticky, full-height within rail; telemetry never steals BOS vertical space. |

---

## Canonical Work Unit Layout (V3)

### Zone 1 — Header

Contains:

- Lifecycle title
- Work-unit pills
- Attention summary (KPI / lane context)

**Fixed height.** No additional telemetry sections in the primary column.

### Zone 2 — Queue (primary surface)

The **dominant** operating surface. Operator attention stays on records.

**Goals:** maximum visible records · fast scanning · fast actions · minimal scrolling.

**Nothing appears below the queue.**

#### Queue density (pass-1 — adopted)

Maintain:

- Reduced vertical spacing
- Reduced row padding
- Reduced action-rail spacing

**Do not** reduce typography further. **Do not** reduce readability. Density changes prioritize **spacing** before font size.

**Targets:** ≥5 visible rows on laptop; 6–7 on larger monitors.

**Scroll:** `.adminv2-ws-wu-queue-list-shell` owns `overflow-y: auto`; header and rails stay fixed; 50+ records reachable.

#### Queue row icon doctrine

All work-unit queues use a **consistent icon system**:

| Type | Size |
|------|------|
| Household | 16px |
| Person | 14px |
| Child | 14px |
| Email | 14px |
| Phone | 14px |

**Rules:**

- Neutral color only for record metadata icons
- No green icons by data type; no special coloring for people
- Pine reserved for **actions** and **BOS** only
- Hover states remain subtle (dark text / neutral icon — not pine flood)
- Contact names: standard dark text — **not** green by default

Applies to **all future work-unit queue layouts**.

#### Queue width doctrine

Maintain:

- Reduced trailing page padding (`--ws-wu-contain-padding-inline-end: 0`)
- Reduced primary ↔ rail gutter (`--ws-wu-workbench-gutter: 14px`)
- Reduced scroll-surface right padding (`12px` at `sm+` on work-unit routes)

**Goals:** maximize queue width · preserve BOS rail width · preserve BOS usability · preserve drawer alignment.

**Do not** increase or shrink BOS width. Future gains come from **workspace reclamation**, not BOS reduction.

**CSS tokens** (work-unit surface):

| Token | Role |
|-------|------|
| `--ws-wu-queue-visible-rows-target` | Row-count floor (6 laptop / 7 @1440px+) |
| `--ws-wu-queue-row-min-height` | ~37px compact row stack |
| `--ws-wu-queue-row-gap` | 5px inter-row gap |
| `--ws-wu-contain-padding-inline-end` | Trailing contain inset (`0`) |
| `--ws-wu-workbench-gutter` | Primary ↔ command gap (`14px`) |
| `--ws-wu-queue-icon-primary-size` | Household icon (`16px`) |
| `--ws-wu-queue-icon-secondary-size` | Contact / child icons (`14px`) |
| `--ws-wu-queue-icon-muted-color` | Metadata icon color |
| `--ws-wu-queue-icon-neutral-color` | Primary entity icon color |

### Zone 3 — Command rail

**Persistence:** The command rail is a **persistent command surface** mounted in `AdminV2Shell` (`AdminV2PersistentCommandRail`). The workspace primary column changes on navigation; the rail shell (Actions → Workflow Telemetry → BOS) does not unmount. Pages register rail bodies through `WorkspaceCommandRailRegistrar`. When a section has no data, collapsed headers still render with zero counts. Exception: full BOS Action Workspace portal may hide the rail until closed.

**Order (fixed):**

1. **Actions** — collapsed utility card, single line, shows count — e.g. `▶ Actions (2)`
2. **Workflow Telemetry** — collapsed utility card, single line, shows count — e.g. `▶ Workflow Telemetry (0)`
3. **BOS** — primary intelligence surface

#### Workflow Telemetry — collapsed (default)

- Single row with count (`n` = runs today; failures use **attention badge**, not count)
- **No** secondary line, metrics, health summary, or subtitles when collapsed
- **No** large telemetry blocks on work-unit pages
- **No** telemetry sections below queues

#### Workflow Telemetry — expanded (on demand)

Operator-relevant information only: workflow health lines, recent activity, Open Automations, Workflow Diagnostics.

**Must not** show: throughput dashboards, reliability cards, 7-day KPI grids, analytics blocks.

Expanded content scrolls **inside** the telemetry section — must **not** push queue content down or reduce BOS height.

**Implementation:** `AutomationWorkflowsBlock` with `presentation="work_unit_rail"` in `commandRailTelemetrySlot`.

#### BOS

BOS is the **primary intelligence surface** in the command rail.

- Telemetry exists to **support** BOS, not compete with it
- BOS must **never** lose vertical space to telemetry
- BOS remains **sticky**, **full-height** within rail, consistent across work units
- **Do not** reduce, shrink, or move BOS for telemetry

**Implementation:** `[data-adminv2-workspace-command-column]` sticky in `adminV2.css`; BOS host `min-height: 14rem`.

---

## Explicitly rejected

Do **not** reintroduce:

- Large workflow telemetry sections below queues
- Expandable telemetry blocks inside primary content
- Reduced BOS height or width
- Colored queue icons by record type
- Green contact names by default
- Additional work-unit chrome
- Horizontal scrolling
- Typography shrink for density (spacing-first only)

---

## Department / diagnostics full telemetry (unchanged)

Department surfaces keep `AutomationWorkflowsBlock` with `presentation="full"` — full metric groups, scoped workflow lists, Ask Workflow Assist.

---

## Future work units

All new work-unit surfaces **must**:

1. Render through `WorkUnitWorkspace` + `WorkspaceShellLayout`
2. Keep primary flow as **Header → Queue** only
3. Mount telemetry with `presentation="work_unit_rail"` in the command rail
4. Apply V3 density, icon, and width tokens on `adminv2-ws-wu-v2`

---

## Validation checklist (frozen — passed June 2026)

- [x] Queue scrolls through all records independently
- [x] Drawer alignment correct after width reclaim
- [x] No horizontal scrollbar on staging
- [x] Laptop and large desktop remain readable
- [x] BOS rail behavior stable
- [x] Queue density increases visible records without harming scanability
- [x] Right rail: Actions → Workflow Telemetry → BOS in order
- [x] Telemetry collapsed headers single-line with counts
- [x] Slug and UUID routes share `WorkUnitWorkspace` shell

---

## Code map

| Concern | Location |
|---------|----------|
| Primary layout shell | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` |
| Command rail shell | `web/app/adminV2/components/workspace/WorkspaceCommandRailShell.tsx` |
| Rail telemetry block | `web/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx` |
| Queue density + icon + width tokens | `web/app/adminV2/components/workspace/workspace.css` |
| Rail telemetry + scroll reclaim | `web/app/adminV2/adminV2.css` |
| Tests | `web/tests/adminV2/workUnitLayoutDoctrine.test.ts`, `web/tests/admin/adminV2QueueRowClick.test.ts` |
