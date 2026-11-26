---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Focus Panel — Canonical Card Library

> **Status**: Canonical (July 2026). Cards 1–8 implemented. Billing Preview, Tour, Communications, and Timeline joined the Core Four (Household, Children, **What's Next** (`current_work`), Readiness). **What's Next** is the canonical operational progression owner on the Focus Panel — see [current-work-surface.md](./current-work-surface.md).

The card library is the authoritative catalog of every Focus Panel card. Each entry names the card's operational question, archetype, lifecycle states, evidence source, and behavioral contract. New experiences are assembled from these primitives — they are not invented per-surface.

---

## Identity Domain

### Household

| | |
|---|---|
| **Key** | `household` |
| **Archetype** | Profile |
| **Tier** | Reference |
| **Operational question** | "Who is this family and how do I reach them?" |
| **Lifecycle** | Summary → Focus → Edit |
| **Evidence source** | `context.truth._identity`, `context.truth._inquiry_children` (via `buildHouseholdCardEvidence`) |
| **Capabilities** | supportsFocus, supportsInlineEdit, supportsExpanded, supportsSubjectChange, supportsProfileImage |
| **Editable groups** | primary_contact, other_parent, emergency_contacts, pickup, billing, members |
| **Expansion groups** | addresses, additional_contacts, languages, household_notes |
| **Related views** | Contact History |
| **Footprint** | wide (2 columns) |

Primary contact and household composition at a glance. Expanded reveals all contact roles. Edit transforms contact rows into inline controls — no modal, no route change.

---

### Children

| | |
|---|---|
| **Key** | `children` |
| **Archetype** | Collection |
| **Tier** | Reference |
| **Operational question** | "What is true for each child right now?" |
| **Lifecycle** | Summary → Focus → Edit |
| **Evidence source** | `context.truth._inquiry_children` (via `buildChildrenCardEvidence`) |
| **Capabilities** | supportsFocus, supportsInlineEdit, supportsExpanded, supportsSubjectChange, supportsProfileImage |
| **Editable groups** | identity, placement, medical, documents, notes |
| **Expansion groups** | placement, medical, documents, pickup, notes, readiness |
| **Related views** | Schedule History, Placement History |
| **Footprint** | wide (2 columns) |

Each child row: program · room · schedule · teacher · desired start · enrollment status. Placement is an evidence group on the child (not its own card). Focus moves to an individual child; Edit transforms that child's row into inline controls.

---

## Work Domain

### What's Next (Current Work)

| | |
|---|---|
| **Key** | `current_work` (canonical; legacy aliases `whats_next` / label "Current Work" normalize here) |
| **Operator label** | **What's Next** (builder catalog, search, reset-to-default, runtime micro-label) |
| **Archetype** | Action |
| **Tier** | Work |
| **Card class** | **Work-owning** |
| **Operational question** | "What needs to happen next on this record?" |
| **Lifecycle** | Summary → Focus (completion inside Focus) |
| **Evidence source** | `projectCurrentWork(context)` from `context.stageWorkRuntime` + `context.signals.work` |
| **Capabilities** | supportsFocus (no expanded overlay — Focus replaces it) |
| **Footprint** | full (default row 1; configurable via `/settings/surfaces`) |

Primary work title, purpose, and progress in 2 seconds on Summary. Click or Bend Pine CTA opens Focus — same grammar as Household. Focus holds checklist (work-surface handoffs), blockers, and outcome completion via **`Record what happened`** → **What happened?** picker → `completeStageWorkWithOutcome`. Outreach items hand off to Communications; contact-data verification to Household; program/fit to Children; packet work to Documents — never edit truth here.

See [current-work-surface.md](./current-work-surface.md) and [actions-current-work-alignment.md](./actions-current-work-alignment.md).

---

## Diagnostic Domain

### Readiness

| | |
|---|---|
| **Key** | `readiness_kpi` |
| **Archetype** | Status |
| **Tier** | Metric |
| **Operational question** | "Is this family ready to advance?" |
| **Lifecycle** | Summary only (diagnostic — never becomes a Focus Card) |
| **Evidence source** | `context.truth`, `context.signals.attention` (via `buildReadinessCardEvidence`) |
| **Capabilities** | supportsExpanded |
| **Expansion groups** | blockers |
| **Footprint** | medium (1 column) |

Gauge + verdict (Ready / Blocked / Partial) in 2 seconds. Deeper view (factor checklist + owner pointers) appears in an inline overlay. Clicking an incomplete factor hands off to the owning card. Never edits directly.

---

## Context Domain

### Tour

| | |
|---|---|
| **Key** | `tour_summary` |
| **Archetype** | Summary |
| **Tier** | Context |
| **Operational question** | "Is a tour scheduled, and when?" |
| **Lifecycle** | Action-only (no inline edit; actions via `FocusPanelTourMutation`) |
| **Evidence source** | `context.signals.tour` (via `buildTourCardEvidence`) |
| **Capabilities** | Action-only |
| **Actions** | Cancel tour · Confirm tour · Reschedule · Schedule (when no tour booked) |
| **Footprint** | narrow (1 column) |

Upcoming tour datetime + status chip, or "No tour scheduled" empty state. Action buttons (cancel/confirm/reschedule/schedule) call existing tour API routes via `mutation.tour`; no new persistence paths. Tour booking truth lives in the scheduling side-panel.

---

### Communications

| | |
|---|---|
| **Key** | `communications` |
| **Archetype** | Summary |
| **Tier** | Context |
| **Operational question** | "What is the current outreach status for this family?" |
| **Lifecycle** | Summary → Focus → Expanded |
| **Evidence source** | `context.signals.communications` (via `buildCommunicationsCardEvidence`) |
| **Capabilities** | supportsFocus, supportsExpanded, supportsSubjectChange |
| **Expansion groups** | message_history |
| **Footprint** | wide (2 columns) |

Scheduled send count or next follow-up date at a glance. Message thread history and contact preferences live in the inbox — this card reports the operational signal only. Never edits channel preferences from the Focus Panel surface.

---

### Billing Preview (Financial Configuration)

| | |
|---|---|
| **Key** | `billing_preview` |
| **Archetype** | Status |
| **Tier** | Context |
| **Operational question** | "Is billing configured and ready for this enrollment?" |
| **Lifecycle** | Summary + Expanded |
| **Evidence source** | `context.signals.billing` (via `buildBillingPreviewCardEvidence`); tuition rates from `GET /api/admin/financial-config/opportunity/[id]` (lazy, expanded only) |
| **Capabilities** | supportsExpanded |
| **Expansion groups** | billing_readiness, placement_tuition, billing_responsibility |
| **Footprint** | medium (1 column) |

Configured/not-configured status chip + tuition rate label. Expanded reveals: billing readiness checklist (billing contact · tuition rate), per-child placement + resolved tuition rate from `commercial_tuition_rates`, and billing responsibility section (missing-state until write path exists). Tuition rates are lazy-fetched via `useFinancialConfig` when the expanded overlay opens — not available in the summary. Read-only. Never fabricates financial values.

---

### Documents

| | |
|---|---|
| **Key** | `documents` |
| **Archetype** | Summary |
| **Tier** | Context |
| **Operational question** | "Are required documents on file?" |
| **Lifecycle** | Summary → Focus → Edit |
| **Evidence source** | `context.truth` (document status) |
| **Capabilities** | supportsFocus, supportsInlineEdit, supportsExpanded, supportsSubjectChange |
| **Editable groups** | document_status |
| **Expansion groups** | document_history |
| **Footprint** | wide (2 columns) |

Form completion status at a glance. Detailed document checklist and upload affordances in Focus. Phase D1 migration: currently uses compat wrapper for drawer tab drill.

---

## Historical Domain

### Timeline

| | |
|---|---|
| **Key** | `timeline` |
| **Archetype** | Timeline |
| **Tier** | Historical |
| **Operational question** | "What has recently happened on this record?" |
| **Lifecycle** | Summary + Expanded |
| **Evidence source** | `context.truth` (via `buildTimelineCardEvidence` → `resolveLeadActivityPreview`) |
| **Capabilities** | supportsExpanded |
| **Expansion groups** | event_list |
| **Related views** | Full Timeline |
| **Footprint** | full (row) |

Max 3 events visible at summary density; "View all →" opens inline overlay with all 5. Sources notes, communications, tasks, activity signals, and created/updated metadata. Never fabricates events. Migrated from compat wrapper (drawer VM tab) to pure Operational Context card.

---

## Reference Domain

### Attention (Why Now)

| | |
|---|---|
| **Key** | `attention` |
| **Archetype** | Action |
| **Tier** | Attention |
| **Operational question** | "Why does this record need attention right now?" |
| **Evidence source** | `context.signals.attention` |
| **Footprint** | narrow |

---

### Current Mission

| | |
|---|---|
| **Key** | `current_mission` |
| **Archetype** | Action |
| **Tier** | Work |
| **Operational question** | "What is the primary objective for this stage?" |
| **Evidence source** | `displayVm.workspace.stage_work_runtime`, `perspective` |
| **Footprint** | medium |

---

### Tasks

| | |
|---|---|
| **Key** | `tasks` |
| **Archetype** | Collection |
| **Tier** | Work |
| **Operational question** | "What follow-up tasks are open?" |
| **Evidence source** | `displayVm.summaries.tasks` |
| **Capabilities** | supportsExpanded |
| **Expansion groups** | task_list |
| **Footprint** | medium (1 column) |

---

### Enrollment Health

| | |
|---|---|
| **Key** | `health` |
| **Archetype** | Status |
| **Tier** | Metric |
| **Operational question** | "What is the overall enrollment health signal?" |
| **Evidence source** | `displayVm.header.oper_trust_preview`, `displayVm.summaries.attention` |
| **Footprint** | medium |

---

## Card Library Inventory (Summary)

| Card | Key | Archetype | Tier | Status |
|------|-----|-----------|------|--------|
| Household | `household` | Profile | Reference | ✅ Pure card |
| Children | `children` | Collection | Reference | ✅ Pure card |
| What's Next | `current_work` | Action | Work | ✅ Pure card |
| Readiness | `readiness_kpi` | Status | Metric | ✅ Pure card |
| Tour | `tour_summary` | Summary | Context | ✅ Pure card (Sprint 2) |
| Communications | `communications` | Summary | Context | ✅ Pure card (Sprint 2) |
| Billing Preview | `billing_preview` | Status | Context | ✅ Pure card (Sprint 2) |
| Timeline | `timeline` | Timeline | Historical | ✅ Pure card (Sprint 2) |
| Documents | `documents` | Summary | Context | ⚠️ Compat (Phase D1) |
| Tasks | `tasks` | Collection | Work | ⚠️ Generic payload |
| Attention | `attention` | Action | Attention | ⚠️ Generic payload |
| Current Mission | `current_mission` | Action | Work | ⚠️ Generic payload |
| Enrollment Health | `health` | Status | Metric | ⚠️ Generic payload |
| Workflow Steps | `workflow_steps` | Summary | Work | ⚠️ Compat (lifecycle rail) |
| Notes | `notes` | Summary | Historical | ⚠️ Compat (Phase D1) |
| Work Launcher | `work_launcher` | Launcher | Work | ⚠️ Generic payload |
| Automations | `automations` | Summary | Context | ⚠️ Generic payload |
| Required Information | `required_information` | Action | Work | ⚠️ Generic payload |
| Audit | `audit` | Summary | Historical | ⚠️ Generic payload |
| Workflow History | `workflow_history` | Summary | Historical | ⚠️ Generic payload |
| Primary Next Action | `primary_next_action` | Action | Work | ⚠️ Generic payload |

**Legend**  
✅ Pure card — derives entirely from `OperationalContext`; no compat wrapper.  
⚠️ Generic payload — uses model payload only; no dedicated evidence builder or component yet.  
⚠️ Compat — still reaches the drawer VM or compat wrapper (Phase D1 migration target).
