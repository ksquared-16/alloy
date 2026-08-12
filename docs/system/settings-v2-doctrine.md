---
owner: runtime
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# Settings V2 Doctrine

**Status:** Active — Business Processes is the first reference implementation (June 2026).

## Purpose

Settings should be organized around **configuration domains** — how customers think about configuring Alloy — not internal implementation ownership.

The prior index grouped surfaces by engineering subsystem (Enrollment Operations, Record Setup, Actions & Automation). Settings V2 regroups by operator mental model while preserving canonical routes and storage.

**Reference implementation:** `/admin/settings/lifecycle` (Business Processes). Visual design, navigation, information hierarchy, section patterns, and save patterns established here should be reused for Fields, Layouts, Forms, Communications, Automation, and Permissions.

## Visual doctrine

Use existing AdminV2 design language. Reference Workspace, Work Unit, Opportunity Drawer, and BOS panels.

- Midnight shell (sidebar)
- White canvas (settings content)
- Pine accents (primary actions)
- Minimal blue (track / selection highlights)
- Soft green highlights (saved / success)
- Premium spacing, card-based hierarchy

**Avoid:** dense admin-table styling, generic enterprise blue, repeated Save buttons on every subsection, large dropdown-driven navigation.

## Configuration domains

### Configure

People, locations, access, and communication.

| Surface | Route |
|---------|-------|
| Locations & hierarchy | `/admin/settings/locations` |
| Departments | `/admin/settings/departments` |
| Users & access | `/admin/settings/users-roles` |
| Communications | `/organization/communications` |

### Data Model

Records Alloy uses.

| Surface | Route |
|---------|-------|
| Fields | `/admin/settings/fields` |
| Relationships | `/admin/settings/relationships` |
| Record labels | `/admin/settings/entity-labels` |
| Option sets | `/admin/settings/option-sets` |
| Layouts | `/admin/settings/layouts` |

### Operations

How work moves through Alloy.

| Surface | Route |
|---------|-------|
| **Business Processes** | `/admin/settings/lifecycle` |
| Action Buttons | `/admin/settings/actions` |
| Automations | `/admin/workflows` |
| Attention & SLA | `/admin/settings/attention-sla-rules` |
| Work Units & Queues | `/admin/settings/work-units` |
| Waitlist ranking | `/admin/settings/placement-priority` |
| Tour availability | `/admin/settings/tours/availability` |

Business Processes is the **organizing spine** for operational workflow configuration. Work Units, status rollups, and queue presentation should be **derived or guided** from process metadata — not hand-maintained as parallel truths.

### Workspace Experience

How information appears to staff.

| Surface | Route |
|---------|-------|
| Workspace metrics | `/admin/settings/kpis` |
| Forms & Packets | `/admin/forms` |
| Document fields | `/admin/settings/documents/document-fields` |
| Configuration proposals | `/admin/settings/config-proposals` |

Queue **presentation** (row layout, columns, widgets) belongs under **Layouts**, not Business Processes.

### Advanced

Diagnostics, developer, audit, and internal references. Not intended for everyday configuration.

| Surface | Route |
|---------|-------|
| Workflow automation rules | `/admin/settings/status-transition-rules` |
| Field grouping (advanced) | `/admin/settings/field-sections` |

## Business Processes reference patterns

### Process catalog

Replace dropdown selectors with a **process card list**. Each card shows name and summary stats (tracks, stages, queues).

### Process workspace

Selecting a process opens a workspace with:

1. Process header — name, description, summary stats
2. Track-grouped stage navigation (not a flat stage list)
3. Stage configuration panel

### Stage configuration sections (consistent order)

1. **Stage Membership** — who belongs here; which statuses roll up to this stage
2. **Required Information** — fields to collect before work advances
3. **Expected Work** — operating plan / work templates for this stage
4. **Actions** — buttons staff see (matrix link)
5. **Ready Check** — runtime validation for workspace readiness

Queue lane **presentation** is secondary — configure under Layouts or an advanced collapsed section. Business Processes define **what belongs** and **what should happen**; Layouts define **how it appears**.

### Save pattern

One **Save stage** action per stage workspace. Avoid per-section Save buttons.

## Related docs

- `docs/system/configuration-system.md` — control plane vs runtime
- `docs/sprints/archive/06_2026/business_processes_v2_qa_path.md` — QA walkthrough
- `docs/sprints/archive/06_2026/enrollment_operations_configuration_ux_audit.md` — fragmentation diagnosis
