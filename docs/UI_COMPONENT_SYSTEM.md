# Alloy UI Component System

## Purpose

This document defines the core component system for Alloy UI V2.

It translates the interface vision into reusable UI building blocks that can be implemented in React / Next.js.

The goal is to ensure:

- consistency
- scalability
- reusability
- clean implementation by Cursor

This component system is designed for an AI-native operational OS, not a traditional SaaS dashboard.

---

# Component Philosophy

All components should follow these principles:

1. Reusable across departments and verticals
2. Visually consistent with Alloy brand
3. Support both structured data and AI interaction
4. Prioritize clarity over novelty
5. Allow progressive disclosure of detail
6. Support animation and state changes without feeling noisy

---

# Component Categories

The component system is organized into the following categories:

1. App Shell Components
2. Navigation Components
3. Dashboard Components
4. Org Chart / Canvas Components
5. Inspector Components
6. Workflow Components
7. Record / Table Components
8. AI Interaction Components
9. Feedback / Status Components
10. Settings / Configuration Components

---

# 1. App Shell Components

## AppShell
Primary application wrapper.

Responsibilities:
- layout structure
- sidebar placement
- top navigation placement
- KPI strip placement
- canvas area placement
- inspector panel placement
- command bar placement
- alert tray placement

## MainContentFrame
Wraps the center content area under the top nav and above the command bar.

## PageTransitionContainer
Handles animated view transitions between perspective changes and zoom level changes.

---

# 2. Navigation Components

## MinimalSidebar
Collapsed by default.

Responsibilities:
- icon-only navigation
- expandable on interaction
- system-level destinations only

Examples:
- Home
- Settings
- Integrations
- Admin
- Logs
- Account

Operational entities like Jobs or Invoices should not live here.

## TopNavBar
Top-level navigation wrapper.

Contains:
- logo
- global search
- perspective tabs
- optional account/menu actions

## GlobalSearchBar
Fast lookup for records.

Purpose:
- find specific customers
- jobs
- invoices
- documents
- workflows

Search is distinct from AI.

## PerspectiveTabs
Switches dashboard lens without changing layout.

Fixed tabs:
- Overview
- AI Activity
- Queue

Dynamic tabs:
- generated from configured departments

Examples:
- Operations
- Finance
- Sales
- Subsidy
- Claims

## BreadcrumbBar
Shows current zoom path.

Examples:
- Company
- Company > Operations
- Company > Operations > Scheduling Manager

---

# 3. Dashboard Components

## AIKPIStrip
Top strip for AI performance metrics.

Examples:
- Transactions processed
- Automation rate
- Accuracy
- Avg processing time

Should update based on current scope:
- company
- department
- manager
- agent

## BusinessKPIStrip
Secondary strip for business metrics.

Examples:
- Revenue
- Jobs completed
- Conversion rate
- Utilization
- Exceptions

Should also update by selected perspective / zoom level.

## KPIStatCard
Small reusable KPI component.

Supports:
- label
- value
- delta/trend
- icon
- health state

## KPIGroup
Container for groups of KPIStatCards.

---

# 4. Org Chart / Canvas Components

## OperationalCanvas
Main draggable, zoomable canvas.

Responsibilities:
- render org chart structure
- support dragging
- support manual zoom
- support guided zoom transitions
- preserve layout state
- support dynamic node sizing

## OrgChartGrid
Grid-based layout for top-level departments.

Supports:
- dynamic department count
- dynamic spacing
- responsive layout

## SystemNode
Core node component.

Used for:
- departments
- managers
- agents
- workflows
- aggregated operational systems

Node must support:
- icon
- name
- health state
- primary KPI
- secondary KPI
- alert count
- activity level
- visual state changes
- hover/focus state
- click state

## DepartmentNode
Specialized SystemNode for top-level departments.

Should support:
- dynamic size based on activity
- subtle brand tint
- progressive reveal of managers

## ManagerNode
Specialized SystemNode for manager-level AI systems.

Should show:
- manager name
- health
- workload/activity
- alert state

## AgentNode
Specialized SystemNode for agent-level systems.

Should show:
- current status
- throughput
- exceptions or pending work

## WorkflowNode
Represents an automation workflow.

Can be rendered inside deeper zoom levels or inspector contexts.

## NodeConnectionLine
Visual relationship connection between nodes.

Used to show:
- parent-child hierarchy
- related workflows
- entity relationships where appropriate

Connections should be subtle and animated only when needed.

## NodeRevealLayer
Controls progressive reveal behavior for:
- manager preview
- agent preview
- related subnodes

---

# 5. Inspector Components

## InspectorPanel
Right-side panel used for detail inspection.

Responsibilities:
- overlay current canvas context
- allow inspection without navigation loss
- support multiple entity types

## InspectorSummaryHeader
Always-visible summary section at top.

Contains:
- entity title
- health state
- AI summary
- key metrics
- alert state

## InspectorTabs
Tabbed navigation inside the inspector.

Default tabs:
- Metrics
- Activity
- Actions
- Records
- History

## MetricsTab
Displays performance metrics, mini-charts, summaries.

## ActivityTab
Readable event feed of recent system activity.

Examples:
- Scheduling Agent assigned job
- Billing Agent sent invoice
- Dispatch workflow failed

## ActionsTab
Manual and AI-assisted actions.

Examples:
- Optimize schedule
- Pause workflow
- Re-run dispatch
- Review anomaly

## RecordsTab
Shows linked records and allows drill-in.

## HistoryTab
Audit-oriented detail:
- workflow runs
- state changes
- config changes
- execution history

## AISummaryBlock
Reusable AI-generated explanation component.

Used in inspector headers and record views.

---

# 6. Workflow Components

## WorkflowViewer
Top-level workflow viewer wrapper.

Supports two modes:
- graph view
- table view

## WorkflowGraphView
Default visual workflow view.

Shows:
- trigger
- agent
- condition
- action
- outputs

Should support:
- readable nodes
- directional flow
- execution state overlays

## WorkflowTableView
Alternative structured workflow representation.

Columns may include:
- step
- type
- actor
- description
- last run
- status

## WorkflowExecutionHistory
List/table of workflow runs.

Examples:
- run id
- completed / failed
- execution time
- reason for failure

## WorkflowActionBadge
Small component for action states:
- running
- completed
- failed
- skipped

---

# 7. Record / Table Components

## RecordInspectorView
Hybrid record detail view.

Structure:
- AI summary on top
- structured fields below
- related tabs / sections beneath

## RecordSummaryHeader
Record title + status + AI summary.

## RecordDetailsGrid
Structured field layout.

Examples:
- customer
- technician
- address
- schedule
- amount
- status

## RelatedRecordsSection
Shows linked entities.

Examples:
- linked jobs
- invoices
- customers
- documents

## RecordHistoryTimeline
Timeline of record activity.

## DataTable
Primary structured table component.

Used for:
- jobs
- invoices
- customers
- schedules
- payments
- documents

Requirements:
- sorting
- filtering
- row click opens inspector
- selectable columns
- strong readability

## TableToolbar
Supports:
- filters
- bulk actions
- search-within-table
- export actions

## TableFilterPill
Reusable filter token component.

---

# 8. AI Interaction Components

## AICommandBar
Pinned bottom command interface.

Responsibilities:
- natural language command entry
- command execution
- command suggestion support
- persistent availability

Examples:
- optimize tomorrow’s schedule
- explain invoice delay
- show underperforming technicians

## AICommandInput
Text input field inside command bar.

## AISuggestionChips
Contextual prompt shortcuts.

Examples:
- Optimize schedule
- Review delays
- Investigate anomaly

Can appear:
- near nodes
- in inspector panel
- on dashboard

## AIResponsePanel
Optional expandable area for AI responses when needed.

Used when command output is explanatory or actionable.

## AIAlertTray
Floating alert tray for proactive issues.

Examples:
- workflow failures
- conflicts
- billing exceptions
- anomaly warnings

Should remain calm by default.

## AIConfirmationSlider
Robinhood-style slide-to-confirm component.

Used for high-confidence actions requiring confirmation.

Examples:
- send invoice
- dispatch technician
- re-run workflow
- approve payment

---

# 9. Feedback / Status Components

## HealthBadge
System health state badge.

States:
- healthy
- attention
- critical

## AlertCountBadge
Badge for alert counts on nodes and panels.

## ActivityPulse
Subtle animated indicator for active systems.

## TrendIndicator
Up / down / neutral metric trend component.

## LoadingStateSkeleton
Used across:
- nodes
- inspector
- tables
- KPI strips

## EmptyStatePanel
Graceful empty states for:
- no records
- no alerts
- no workflows
- no AI actions

---

# 10. Settings / Configuration Components

## BrandingConfigPanel
Used in settings to configure:
- logo upload
- brand colors
- status color mapping
- department tint options

## StatusMappingEditor
Allows configurable status colors.

## DepartmentConfigEditor
Create/edit dynamic departments and labels.

## IconMappingEditor
Allows mapping icons to departments/managers.

## AutomationPricingConfig
Used for AI transaction pricing and automation billing configuration.

---

# Component State Rules

All major components should support consistent state handling:

- loading
- empty
- healthy
- attention
- critical
- selected
- hovered
- disabled

---

# Motion Rules

Animations must be:

- subtle
- fast
- meaningful
- state-driven

Examples:
- node resize on activity changes
- pulse on alert appearance
- smooth zoom transitions
- panel slide-in
- slide-to-confirm interaction

Avoid flashy or decorative motion.

---

# Reuse Guidance

Cursor should implement these as reusable components, not one-off page fragments.

Priority should be given to:

1. App shell
2. Canvas + nodes
3. Inspector panel
4. KPI strips
5. AI command bar
6. Workflow viewer
7. Tables

---

# Summary

This component system defines the reusable building blocks of Alloy UI V2.

All future UI build work should map to this system.