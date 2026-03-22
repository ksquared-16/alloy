# Alloy UI V2 Workspace System Spec

## Purpose
This document defines the UI V2 workspace system for Alloy so engineering can implement a flexible, AI-configurable, multi-level workspace that works across industries without hardcoded vertical assumptions.

This is not a one-off dashboard redesign. It is a system for rendering workspaces across:
- Organization level
- Department level
- Work unit level
- Record level

The same system must support home cleaning first, while remaining flexible enough for childcare, CRM/opportunities, and future verticals.

---

## Core Principles

1. **One operating system, different centers of gravity**
   - Org = awareness and prioritization
   - Department = coordination and throughput
   - Work unit = execution
   - Record = inspection and editing

2. **The UI is built from universal blocks, not bespoke pages**
   Alloy should not build separate UIs per industry. The same block system should adapt through config.

3. **AI configures meaning, not pixels**
   AI during onboarding/setup should define labels, grouping, relationship presentation, priorities, and action exposure. It should not freeform-design pages.

4. **Progressive disclosure**
   Higher levels summarize and route. Lower levels expose detail and execution.

5. **Actions are always system actions**
   UI actions must map to APIs/events/workflows. No local-only business mutations.

---

## Universal Workspace Blocks

All workspaces are composed from the same six blocks.

### 1. Signals
Purpose: surface urgency, exceptions, or items requiring attention now.

Examples:
- Cleaning: cleaner not assigned, job running late
- Childcare: ratio exceeded, child not checked in
- CRM: deal at risk, stalled follow-up

### 2. KPIs
Purpose: show measurable performance indicators.

Examples:
- Revenue
- Utilization
- Attendance rate
- Conversion rate
- Staff coverage

### 3. Queues
Purpose: show what needs to be worked.

Examples:
- Unassigned jobs
- Rooms needing coverage
- Deals needing follow-up

### 4. Work
Purpose: show active execution of steps/stages/checklists.

Examples:
- Cleaning checklist
- Classroom activities / attendance flow
- Deal stage progression

### 5. Context
Purpose: provide supporting information required to act.

Examples:
- Home details, notes, documents
- Child profile, guardians, documents
- Account contacts, files, related records

### 6. Actions
Purpose: expose primary system actions.

Examples:
- Assign cleaner
- Assign teacher
- Notify staff
- Send follow-up
- Complete work

---

## Level Model

### Level 1: Organization
Purpose: “Where do I need to focus?”

Dominant blocks:
- Signals
- KPIs

Supporting blocks:
- Queues (exceptions only)
- Actions
- Light context

No heavy work block should appear here.

### Level 2: Department
Purpose: “What does my team need to move today?”

Dominant blocks:
- Queues
- Signals
- KPIs
- Actions

Supporting blocks:
- Work summary
- Context rail

This is the most important daily-use workspace.

### Level 3: Work Unit
Purpose: “What needs to happen here, right now?”

Dominant blocks:
- Work
- Context
- Actions
- Signals

Supporting blocks:
- Light KPIs
- Optional related queue

This should feel like an execution cockpit.

### Level 4: Record
Purpose: “What is this thing, and how do I update it?”

Dominant blocks:
- Context
- Actions

Supporting blocks:
- Minimal signals

No heavy queue or work blocks here.

---

## UX Rules (Locked)

1. Every signal must support at least one direct action.
2. Every queue item can expose quick actions without forcing full drill-down.
3. Deep drill-down opens the full lower-level workspace.
4. Routing can vary by role and urgency.
5. Higher levels should summarize and route; lower levels should execute.
6. Users should not be forced through all levels to do an obvious action.

---

## Visual System Principles

### Global rule
Design around **block dominance**, not “card soup.”

### Signals
- Elevated but controlled
- Strong accent treatment
- Max 3–5 surfaced at a time

### KPIs
- Compact, scannable, stable
- 4–6 visible in top band max
- No primary actions inside KPI tiles

### Queues
- Dense but readable
- Stacked/grouped
- Quick actions on each row/item
- Preview list, not full data tables by default

### Work
- Strongest visual treatment at work-unit level
- Tactile, active, progress-oriented

### Context
- Quiet, supportive, relationship-aware
- Collapsible sections where needed

### Actions
- 1–3 primaries visible
- Overflow for the rest
- AI-recommended action can be visually highlighted, but should not dominate

### AI placement
AI is not one giant chatbot card. It appears as:
- summary strip at higher levels
- rationale lines in signals/queues
- recommended actions near actions block
- assistant input anchored at bottom in work-unit views

---

## Relationship-Aware Context (Configurable)

The UI must not hardcode “parent,” “child,” “primary contact,” etc.

Instead, the Context block must render relationship groups from configuration.

The UI contract should support:
- group label
- source relationship type keys
- source entity type
- order
- visibility by level and role
- preview fields
- default expanded/collapsed state
- quick actions per group

### Example UI-facing config shape
```json
{
  "block": "context",
  "entity_type": "person",
  "relationship_groups": [
    {
      "key": "guardians",
      "label": "Guardians",
      "source": {
        "relationship_type_keys": ["guardian", "parent"],
        "entity_type": "person"
      },
      "order": 1,
      "visibility": {
        "levels": ["work_unit", "record"],
        "roles": ["director", "teacher"]
      },
      "display": {
        "style": "list",
        "max_items": 3,
        "default_expanded": true,
        "preview_fields": ["phone", "email"]
      },
      "actions": ["call", "message", "open_record"]
    }
  ]
}
```

This config should be generated/refined during AI-assisted setup.

---

## Block Templates

### Signals Template
Includes:
- severity
- title
- short description
- optional AI explanation
- one direct action minimum
- meta (timestamp/source)

### KPI Template
Includes:
- value
- label
- unit
- trend
- optional AI summary

### Queue Template
Includes:
- title
- count badge
- preview items (3–5)
- quick actions per item
- optional AI prioritization message
- “View all” action

### Work Template
Includes:
- title
- progress
- steps/stages/checklist
- assignees if relevant
- optional AI suggestion
- direct work actions

### Context Template
Includes:
- fields
- relationship groups
- documents
- notes/related records
- optional AI summaries

### Actions Template
Includes:
- 1–3 primary actions
- overflow actions
- AI-suggested action emphasis

---

## Department Workspace Spec (Level 2)

### Purpose
What needs to move today, and what should I do about it?

### Layout zones
- Top: signal + AI summary band
- Below: KPI strip
- Main center: primary queue + secondary queue / work summary
- Side rail: actions + context

### Department examples
#### Cleaning
- Signals: jobs late, jobs unassigned, invoice issues
- KPIs: jobs today, utilization, on-time %, revenue today
- Queues: unassigned jobs, needs review
- Actions: assign cleaner, rebalance routes, notify team
- Context: team availability, client issues

#### Childcare
- Signals: ratio exceeded, missing check-ins, teacher absent
- KPIs: attendance today, room/teacher utilization, ratio compliance, staff coverage
- Queues: rooms needing coverage, check-ins pending
- Actions: assign float staff, notify parents, approve override
- Context: classroom roster, teacher availability, alerts

#### CRM
- Signals: deals stalled, deals at risk
- KPIs: pipeline $, conversion %, rep utilization
- Queues: follow-ups due, proposals pending
- Actions: send email, schedule call, reassign deal
- Context: account owner, next meetings, notes

---

## Work Unit Workspace Spec (Level 3)

### Purpose
What needs to happen here right now?

### Layout zones
- Top: state + signals strip
- Main left/center: dominant work block
- Right: context panel
- Bottom or close to work: actions + AI assistant

### Work unit examples
#### Cleaning job
- Signals: cleaner not assigned, waiver missing, running late
- Work: cleaning checklist + progress
- Context: home details, customer notes, documents, contacts
- Actions: assign cleaner, reschedule, complete job, message customer
- AI bottom assistant: suggest best cleaner, generate customer message

#### Childcare classroom/session
- Signals: ratio exceeded, child not checked in, substitute needed
- Work: daily activities + attendance flow
- Context: teachers, children, guardians, allergies, room details
- Actions: assign teacher, move child, notify staff, contact guardian
- AI bottom assistant: suggest coverage move, draft notification

#### CRM opportunity
- Signals: at risk, no activity in 5 days
- Work: stage progression / required steps
- Context: account, contacts, documents, meeting notes
- Actions: send follow-up, schedule call, update stage
- AI bottom assistant: draft email, recommend next step

---

## Record Workspace Spec (Level 4)

### Purpose
What is this thing, and how do I update it?

### Layout zones
- Top: header + lightweight signals
- Main: context/detail surface
- Side/bottom: actions and linked records/history

### Record examples
#### Cleaning customer/contact
- details
- relationship-aware contacts
- preferences/documents
- edit/link/message actions

#### Child record
- child details
- guardians / emergency contacts / siblings (from config)
- documents
- edit/message/call actions

#### CRM contact
- contact details
- account + opportunity relationships
- call/email/open actions

---

## Starter Defaults vs Config

The system should provide starter defaults for verticals, but the UI must be driven by config.

### Fixed system elements
- level hierarchy
- block types
- layout zones
- density rules
- progressive disclosure rules
- action/event model

### Configurable elements
- relationship group labels
- order of groups
- fields shown in previews
- quick actions per group
- which groups appear at which levels
- role-based visibility
- default expanded/collapsed states
- industry/vertical terminology

---

## What Engineering Should Build First

### Phase 1
- reusable block components for Signals, KPI, Queue, Work, Context, Actions
- relationship-aware Context block that accepts config
- department workspace shell
- work-unit workspace shell

### Phase 2
- config-driven rendering for relationship groups and block visibility/order
- AI summary strip slots at department/work-unit levels
- quick actions on queue rows/items

### Phase 3
- role/urgency-based drill routing
- AI-recommended actions
- onboarding-generated block config

---

## Department workspace v2 — layout sizing (implementation reference)

Canonical CSS custom properties live on `[data-ws-surface="department"].adminv2-ws-dept-v2` in `web/app/adminV2/components/workspace/workspace.css`. Use these names when extending the spec or matching Figma grids.

| Token | Role |
|--------|------|
| `--ws-dept-page-max-width` | Centered workbench column cap (default 1520px) |
| `--ws-dept-contain-padding-*` | Horizontal/vertical padding for the contained column |
| `--ws-dept-section-gap` | Gap between major vertical sections (e.g. top band ↔ workbench) |
| `--ws-dept-top-band-padding-*` | Top KPI/brief band inner padding |
| `--ws-dept-workbench-gutter` | Gap between operational lanes (throughput / attention / command) and before the workflows strip; ambient can read in gutters |
| `--ws-dept-workbench-board-fr` / `--ws-dept-workbench-rail-fr` | Legacy ratio tokens; department workbench uses an **operational row** (3 or 2 columns) + optional **workflows strip** below |
| `--ws-dept-queue-row-min-height` | Dense queue row minimum height |
| `--ws-dept-operational-row-min-height` | Modest `clamp` min height for the three-lane row (not stretched); `0` when stacked (&lt;1000px) |
| `--ws-dept-primary-queue-list-max-height` | Caps primary throughput list scroll inside the lane (taller cap with larger operational row) |
| `--ws-dept-secondary-queue-list-max-height` | Legacy token; secondary lane uses attention stack (few items), not a tall scroll list |

**Control deck (top band):** `.adminv2-ws-dept-v2-top` is a single CSS grid (`1fr` / `1fr` + `column-gap: --ws-dept-section-gap`). Row 1 is operational briefing + signals (`display: contents` on the inner wrapper). Row 2 is the KPI dual rail as one full-width row (`grid-column: 1 / -1`) with the **same** two-column split and gap, so the vertical centerline and outer edges align across both rows. A stronger **border + inset wash** separates row 1 (control) from row 2 (measurement).

Workbench DOM: `operational-row` — `lane--throughput` (queue) · `lane--attention` (exceptions, hidden if no secondary queue) · `lane--command` (actions + context). Below: optional `workflows-strip` — compact **metrics strip** + **`workflowRuns` list** (telemetry), not a heavy KPI grid.

**Work-object catalog:** `latentWorkObjectQueues` on `DepartmentWorkspaceModel` holds additional actionable categories (not rendered as lanes yet). Demos use it per industry so the full surface is modeled while the UI stays at **two visible work lanes + command center**.

---

## Acceptance Criteria

1. Same workspace system supports cleaning and childcare without code forks.
2. Department view is queue-dominant and action-ready.
3. Work-unit view is execution-dominant and context-aware.
4. Record view is clean and relationship-aware.
5. Context relationship groups render from config, not hardcoded labels.
6. Signals and queue items support direct action.
7. Deep drill-down opens lower-level workspace while preserving context.
8. Visual treatment feels like an operating workspace, not generic SaaS dashboard cards.

