# Alloy Cursor Implementation Plan

## Purpose

This document defines how Cursor should implement Alloy UI V2.

It translates the UI vision, information architecture, and component system into a structured build plan.

Cursor should use this document to avoid guessing on:

- layout
- hierarchy
- interaction behavior
- component structure
- implementation order

The goal is to build Alloy V2 intentionally, one coherent layer at a time.

---

# Guiding Principles for Cursor

1. Do not invent UX patterns that are not defined in the specs.
2. Do not replace the org-chart-first model with standard sidebar SaaS patterns.
3. Keep AI command and search as separate systems.
4. Use reusable components.
5. Build the app shell first, then one vertical slice deeply.
6. Prioritize correctness of structure over polish in early iterations.
7. Maintain a clean, modern feel with subtle motion.

---

# Primary Spec Files Cursor Must Follow

Cursor should reference these files before building UI V2:

- **Canonical doctrine:** `/docs/architecture/README.md` (platform direction; overrides older vision docs if they conflict)
- `/docs/implementation/INFORMATION_ARCHITECTURE.md`
- `/docs/implementation/UI_COMPONENT_SYSTEM.md`
- **Archived (historical tone/layout):** `/docs/archive/UI_VISION_AND_DOCTRINE.md`, `/docs/archive/INTERFACE_ARCHITECTURE.md`, `/docs/archive/AI_INTERACTION_MODEL.md`

Do not proceed with high-level design decisions without checking architecture doctrine and the active implementation specs above.

---

# Recommended Build Strategy

Build in this order:

## Phase 1 — App Shell
## Phase 2 — Dashboard Skeleton
## Phase 3 — Org Chart Canvas
## Phase 4 — Inspector Panel
## Phase 5 — Operations Vertical Slice
## Phase 6 — Workflow Visualization
## Phase 7 — Record / Table Drilldown
## Phase 8 — AI Interaction Layer
## Phase 9 — Settings / Branding Configuration

---

# Phase 1 — App Shell

## Goal

Create the base application layout without implementing all business logic.

## Components to build

- AppShell
- MinimalSidebar
- TopNavBar
- GlobalSearchBar
- PerspectiveTabs
- BreadcrumbBar
- MainContentFrame
- AICommandBar
- AIAlertTray placeholder
- InspectorPanel container

## Requirements

- Sidebar collapsed by default
- Search at top
- Perspective tabs visible
- Bottom AI command bar pinned
- Right inspector panel hidden by default
- Main canvas area reserved in center

## Output

A stable shell that visually represents the overall product architecture.

---

# Phase 2 — Dashboard Skeleton

## Goal

Build the first real dashboard structure using static or mocked data.

## Components to build

- AIKPIStrip
- BusinessKPIStrip
- KPIStatCard
- KPIGroup
- Dashboard layout wrapper

## Requirements

- KPI strips above canvas
- Top-level company metrics shown by default
- Perspective tabs can swap KPI sets
- No deep business logic required yet

## Output

Dashboard structure with functioning KPI zone behavior.

---

# Phase 3 — Org Chart Canvas

## Goal

Implement the draggable, zoomable org-chart system using mocked data.

## Components to build

- OperationalCanvas
- OrgChartGrid
- DepartmentNode
- NodeConnectionLine
- NodeRevealLayer

## Requirements

- Grid layout at top level
- Dynamic department data
- Dynamic node sizing based on mocked activity score
- Progressive reveal of managers on hover/focus
- Smooth zoom + structural re-layout on click
- Breadcrumb updates on zoom

## Output

A functioning system-map dashboard for top-level navigation.

---

# Phase 4 — Inspector Panel

## Goal

Enable inspection of selected entities without leaving the canvas.

## Components to build

- InspectorPanel
- InspectorSummaryHeader
- InspectorTabs
- MetricsTab
- ActivityTab
- ActionsTab
- RecordsTab
- HistoryTab
- AISummaryBlock

## Requirements

- Open from right side
- Overlay current context
- Summary fixed at top
- Tabs below
- Use mocked data initially
- Preserve current canvas state

## Output

Usable right-side inspection model.

---

# Phase 5 — Operations Vertical Slice

## Goal

Build one complete drilldown path deeply.

Recommended path:

Dashboard
→ Operations Department
→ Scheduling Manager
→ Scheduling Agent
→ Workflow
→ Job Records

## Components to build/refine

- ManagerNode
- AgentNode
- WorkflowNode
- department-specific KPI state
- linked record opening behavior

## Requirements

- Department zoom updates KPIs
- Manager nodes visible in zoomed view
- Agent nodes visible one level deeper
- Inspector data changes based on selected entity
- Contextual AI suggestion chips appear for operational nodes

## Output

First real end-to-end proof of the Alloy UI model.

---

# Phase 6 — Workflow Visualization

## Goal

Implement explainable workflow views.

## Components to build

- WorkflowViewer
- WorkflowGraphView
- WorkflowTableView
- WorkflowExecutionHistory
- WorkflowActionBadge

## Requirements

- Graph is default
- Table is alternate view
- Execution history visible
- Workflow steps readable and state-aware
- Should work inside inspector panel or dedicated deep view

## Output

Operational transparency for automation logic.

---

# Phase 7 — Record / Table Drilldown

## Goal

Implement record-level inspection and structured tables.

## Components to build

- DataTable
- TableToolbar
- RecordInspectorView
- RecordSummaryHeader
- RecordDetailsGrid
- RelatedRecordsSection
- RecordHistoryTimeline

## Requirements

- Search can open records directly
- Records open in inspector panel
- AI summary on top of record view
- Structured fields below
- Table rows clickable
- Filtering/sorting enabled

## Output

Power-user data inspection layer.

---

# Phase 8 — AI Interaction Layer

## Goal

Implement the core AI interaction surfaces.

## Components to build

- AICommandInput
- AISuggestionChips
- AIResponsePanel
- AIConfirmationSlider
- AIAlertTray

## Requirements

- Command bar always visible
- Search remains separate
- Suggestion chips appear contextually
- AI alerts can surface issues
- Destructive or meaningful actions require confirmation interaction

## Output

AI-native interaction model layered into the system.

---

# Phase 9 — Settings / Branding Configuration

## Goal

Support configurability and multi-tenant visual flexibility.

## Components to build

- BrandingConfigPanel
- StatusMappingEditor
- DepartmentConfigEditor
- IconMappingEditor
- AutomationPricingConfig

## Requirements

- logo upload
- brand color configuration
- configurable statuses
- configurable department labels
- configurable department tinting

## Output

System-level configurability for deployment across orgs and verticals.

---

# Suggested File / Folder Direction

Cursor should organize UI V2 code with reusable structure.

Example direction:

- components/app-shell/
- components/navigation/
- components/dashboard/
- components/canvas/
- components/nodes/
- components/inspector/
- components/workflows/
- components/records/
- components/ai/
- components/settings/

Exact paths can be adapted to the existing codebase, but component boundaries should remain clear.

---

# Build Method

## Step 1
Build shell and layout first.

## Step 2
Implement mocked dashboard and canvas behavior.

## Step 3
Implement one real vertical slice.

## Step 4
Iterate visually and structurally.

## Step 5
Only after structural confidence, bind to real data.

Do not attempt to bind the full system to production data too early.

---

# Prompting Guidance for Cursor

When asking Cursor to build, prompts should always include:

1. Which spec files to follow
2. Which components to build
3. Which interactions must be preserved
4. Which scope not to exceed

Example prompt pattern:

“Using /docs/archive/UI_VISION_AND_DOCTRINE.md (historical), /docs/implementation/INFORMATION_ARCHITECTURE.md, and /docs/implementation/UI_COMPONENT_SYSTEM.md, implement the Phase 1 App Shell only. Do not invent additional navigation patterns. Keep the sidebar collapsed by default, include top search, perspective tabs, a center canvas placeholder, hidden right inspector panel, and pinned bottom AI command bar.”

---

# Important Constraints

Cursor must not:

- replace the org-chart model with standard CRUD page layouts
- merge AI command and search into one field
- overuse flashy motion
- expose too many entities in the sidebar
- flatten the hierarchy into traditional pages
- skip the inspector panel model

---

# Immediate Next Build Target

The first implementation target should be:

## Phase 1 + Phase 2 + beginning of Phase 3

This means:

- App shell
- KPI strips
- top-level org chart canvas
- department nodes
- search
- perspective tabs
- pinned AI command bar

This is enough to establish the Alloy V2 language.

---

# Summary

This plan exists to ensure Cursor builds Alloy V2 as an intentional AI operating system interface.

Build order matters.

Structure first.
Then interaction.
Then depth.
Then polish.