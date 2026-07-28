# Phase A — Live state owners (before further edits)

**Sprint:** operational-surface-realization · slot 4 · server `http://localhost:3014` running  
**Base commits:** `0bd4c209a` … `d6d26bdd4` (ahead 4 of staging)

## Observed product issues → owners

### 1. Shared sizing omitted Work Items / OI
| Module | Owner | Gap |
|--------|-------|-----|
| Processing / Communications / Scheduling Overview | `WorkspaceOverviewStack` | Already migrated |
| Work Items Overview | `WorkItemsOverviewLanding.tsx` | Still `max-w-6xl` hand-rolled |
| Operational Intelligence | `OperationalIntelligencePanel` / `AnalyticsWorkspacePanel` | No overview width contract; full-bleed custom chrome |

### 2. Work Unit metrics “disappeared”
**Owner:** `WorkspaceHeader` focus density (first-pass change).  
When `selectedRecordId` is set, large KPI **cards** are replaced by a low-contrast **inline text strip** (`data-work-unit-header-kpi-inline`). Values still come from the same settlement path (`useWorkUnitSettlement` → `useOperationalAnswers`). Not a data-owner loss — a presentation regression vs product intent (need small metric objects, not invisible text).

### 3. Children → `inquiry_child.program_category` publish failure
**Owner:** first-pass `diagnoseIneffectiveQueueRowFieldKeys` on Surfaces POST.  
- Picker item **Children** uses refKey `children` (compact-effective).  
- Layout/library also carries `inquiry_child.program_category` (labeled “Program”; Waitlist placement ranking uses the same key).  
- Compact vocabulary accepts `inquiry_child.program` only — not `program_category` / `program_category_id`.  
- Publish scans **all** Default + variant columns; reports first ineffective key with copy that says “for example Children” while rejecting a different key → operator mismatch.

### 4. Current Work flip (hypothesis — verify live)
Likely **record/stage variation or warm settlement**, not header density (Focus Panel VM is untouched by first-pass header). Trace in Phase D after screenshots.

## Browser evidence status
Toolkit Playwright chromium missing in this environment; Phase A screenshots deferred to Phase F once browser install succeeds. Code owners above are sufficient to proceed with B/C/E.
