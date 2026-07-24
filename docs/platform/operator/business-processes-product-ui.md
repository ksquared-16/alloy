---
owner: operator
status: canonical
last_reviewed: 2026-07-24
supersedes: []
---

# Business Processes product UI

UI-only product realization for **Business Processes** (`/organization/processes`). **Business Processes UI is realized** (Collection → Selected Process → Focused workspace); Automation authoring and configuration-history runtime remain deferred — see [`../milestones/organization-configuration-product-realization-closeout.md`](../milestones/organization-configuration-product-realization-closeout.md).

This document freezes the operator experience so `/settings/processes` matches the Collection →
Selected object → Focused workspace pattern already shipped for Access and Tuition Plans, without
redesigning the Business Process System, the stage/work-view/action runtime, or any schema.

It does **not** redefine canonical Business Process doctrine (`docs/platform/core/business-process-system.md`).
Existing lifecycle APIs remain authoritative; this sprint changes presentation and navigation only.

## Sprint scope

**In scope**

- Collection → Selected Process → Focused workspace for `/settings/processes`
- Process collection rail (replaces the chip/dropdown selector strip)
- Selected Process header (name, Active/Inactive badge, meta, Edit/More) + 7-tab bar
- New Overview tab (presentation only, composed from data the board already loads)
- New History tab (calm Planned empty state)
- Calmer Automation placeholder copy
- Truthful, non-fabricated location-availability summary ("Organization definition")
- Presentation ViewModels for Planned surfaces

**Out of scope**

- New process/stage runtime, or a parallel builder alongside `LifecycleActivationBoard`
- Schema changes
- Rewriting `StageEditorV2`'s accordion, the Work Views setup workspace, or `LifecycleActionsMatrix`
- A real location-override matrix (no API/schema exists for it yet)
- A real configuration-history/event feed
- Automation authoring

## Information architecture

```
Business Processes
  Collection rail (all processes)
  Selected Process
    Overview
    Stages
    Work Views
    Actions
    Automation
    Health
    History
```

### Operator definitions

| Concept | Meaning |
|---|---|
| Business Process | An organization-owned definition of how work moves through stages |
| Stage | A step within a process; owns membership, requirements, actions, and operating plan |
| Work View | An operator-facing lens onto process work (queue-style grouping/sorting) |
| Health | The existing ready-check (`lifecycle-activation/validate`) that flags configuration gaps |
| History | Planned: a verified configuration-change timeline — not yet backed by an event table |

Business Processes are organization-defined, not location-owned; a location "activates" or "sees"
a process through the existing department/workspace runtime, not through a per-location override
record.

## Collection → Selected Process → Focused workspace

**Collection rail** (`BusinessProcessCollectionRail`): search, **New Business Process**, rows show
`{n} stages · {healthHint}` where `healthHint` (`Healthy` / `Needs attention` / `Not visible`) is
derived only from existing catalog workspace truth (`runtime_status`, `department_is_active`,
`user_has_access`) — never fabricated. First process auto-selects on load (operator convenience);
an explicit `?processId=` deep link takes priority.

**No selection**: an intentional `ConfigurationEmptyState` — "Choose a Business Process" / "Select
a Process to configure its stages, work views, actions, automation, and health." Shown only when
the catalog is empty or an explicit selection was cleared.

**Selected Process header**: Name + Active/Inactive badge (from
`workspace.department_is_active`), meta line (`{n} stages · {healthHint}`), **Edit Process**
(existing rename modal) and **More** (delete/repair, gated by `can_delete` / `can_repair`).

**Tabs** (`BUSINESS_PROCESS_HEADER_TABS`): Overview · Stages · Work Views · Actions · Automation ·
Health · History. These are Selected-Process header tabs only — they are deliberately excluded
from the board's internal `CONFIGURATION_PROCESS_QUEUE_SECTIONS` (the frozen 5-item nav), so the
existing doctrine tests for that array are unaffected.

## Overview

Presentation only — reads state `LifecycleActivationBoard` already has loaded; makes no
independent request.

- **Process Snapshot**: name, status, stage count, tracks (if any), availability
- **Journey**: ordered stage labels with arrows; calm empty state if no stages exist yet
- **Operator Experience**: stage/work-view counts, buttons to jump to Stages / Work Views / Actions
- **Configuration Readiness**: the board's existing ready-check result, with a button to jump to Health

Availability always reads **"Organization definition"** — the process is org-owned. A Planned note
states that per-location override management does not exist yet. No override matrix is invented.

## Stages / Work Views / Actions / Automation / Health

Unchanged behavior, reachable through the new header tabs instead of the old chip strip:

- **Stages** — existing stage list + `StageEditorV2` accordion (not rewritten this sprint)
- **Work Views** — existing `BusinessProcessWorkViewsSetupWorkspace` / `WorkViewsConfigurationContext`
- **Actions** — existing `LifecycleActionsMatrix`
- **Automation** — existing `BusinessProcessAutomationShell`; copy calmed to explicit Planned language
- **Health** — existing `LifecycleActivationValidation` ready-check

## History

Planned. Calm empty card, `data-capability="planned"`: "Process configuration history will appear
here when available. No events are fabricated." No configuration-change event table exists for
Business Processes yet.

## Presentation contracts

`web/lib/businessProcesses/businessProcessPresentationContracts.ts` defines ViewModels such as:

`BusinessProcessCollectionVm`, `BusinessProcessSelectedHeaderVm`, `BusinessProcessOverviewVm`,
`BusinessProcessHistoryVm` (Planned), `BusinessProcessAutomationVm` (Planned),
`BusinessProcessLocationAvailabilityVm` (Planned)

## Capability status (summary)

| Area | Status |
|---|---|
| Collection rail, Selected Process header, tab navigation | Wired (existing catalog API) |
| Overview tab | Wired (presentation over existing board state) |
| Stages, Work Views, Actions, Health tabs | Wired (existing editors, unchanged) |
| Automation tab | Placeholder / Planned |
| History tab | Planned |
| Per-location availability overrides | Planned — no API/schema decision made |

Detailed classification: `.alloy-agent-evidence/business-processes-ui-discovery/BP-UI-DISCOVERY.md`

## Implementation-sprint dependencies

1. Process configuration-history event source (stage/work-view/action/automation changes over time)
2. Automation authoring runtime (trigger definitions, execution, activation)
3. A real per-location availability/override decision — schema and API, if the product needs one
4. Full stage-level Overview cards (distinct from the process-level Overview tab added here)
5. Raw-key hiding across every "Advanced · Technical identity" subsection in Work Views

Do not claim these shipped until wired through server-authoritative paths.
