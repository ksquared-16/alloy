# Alloy Admin V2 Node System

## Purpose

This document defines the node system for Alloy Admin V2.

It exists to guide implementation of the operational canvas and ensure that nodes are:

- meaningful
- consistent
- interactive
- visually branded
- extensible across verticals

The node system is a core differentiator of Alloy.

Admin V2 should not feel like a traditional SaaS dashboard with boxes and tables.
It should feel like an operational system map where users can inspect the business through dynamic nodes, relationships, AI actions, workflows, and records.

---

# Core Philosophy

Nodes are not decorative cards.

Nodes are operational system objects.

A node may represent:

- a department
- a manager
- an agent
- a workflow
- an individual record
- an aggregated system bucket

The node system must support both:

1. aggregated operational views
2. deep record-level inspection

This enables Alloy to function as both:

- an AI operating system
- a structured operational database

---

# Node Hierarchy

The node system follows this hierarchy:

1. Company
2. Departments
3. Managers
4. Agents
5. Workflows
6. Records

Each level should support its own node type and interaction behavior.

---

# Node Categories

## 1. Company Node

Represents the full company / org level.

Used at:
- top-level dashboard view

Purpose:
- anchor the operational canvas
- visually represent the full system
- support top-level KPI context

Contents:
- company name
- overall health
- company-level KPI summary
- alert count
- optional active perspective marker

Behavior:
- mostly structural
- not frequently edited
- supports zoom root reset

---

## 2. Department Nodes

Represents configurable operational departments.

Examples:
- Operations
- Sales
- Finance
- Customer Success
- System Admin
- Claims
- Underwriting
- Subsidy
- Enrollment

Department nodes are dynamic and organization-specific.

Contents:
- small icon
- department name
- health state
- primary KPI
- secondary KPI
- alert count

Behavior:
- visible at top-level company view
- arranged in grid layout
- dynamically sized based on activity
- progressively reveal managers on hover/focus
- clicking triggers guided zoom

---

## 3. Manager Nodes

Represents AI manager systems within a department.

Examples:
- Operations Manager AI
- Finance Manager AI
- Sales Manager AI
- System Admin AI

Contents:
- manager name
- department reference
- health state
- workload / throughput KPI
- alert count
- AI summary preview

Behavior:
- appears when zooming into department
- may appear on preview hover from parent department
- clicking opens inspector and deeper zoom

---

## 4. Agent Nodes

Represents operational AI agents that perform bounded tasks.

Examples:
- Scheduling Agent
- Dispatch Agent
- Billing Agent
- Collections Agent
- Document Parsing Agent
- Routing Agent
- Anomaly Detection Agent

Contents:
- agent name
- current status
- activity volume
- exception count
- latest execution indicator

Behavior:
- visible at agent zoom level
- linked to manager parent
- opens workflow and records through inspector
- can surface contextual prompt suggestions

---

## 5. Workflow Nodes

Represents automated workflow systems or workflow groups.

Examples:
- Job Created → Schedule Assigned
- Invoice Approved → Reminder Sent
- Document Uploaded → Parse + Match
- Action Link Consumed → Cancel Schedule

Contents:
- workflow name
- trigger label
- last run status
- success/failure indicator
- execution count (optional)

Behavior:
- visible in deeper zoom states or inspector
- supports graph view and table view
- linked to execution history
- opens workflow viewer and audit trail

---

## 6. Record Nodes

Represents individual business records.

Examples:
- Job #48213
- Customer #992
- Invoice #1033
- Schedule #3291
- Document #A-492

Contents:
- record label
- status
- key metadata
- linked entity preview
- optional AI summary preview

Behavior:
- visible in record exploration states
- opened more commonly through tables and inspector
- may appear on graph when relationship visualization is useful

---

# Aggregated Nodes vs Individual Nodes

The system must support both:

## Aggregated nodes
Examples:
- Scheduling
- Billing
- Documents
- Active Jobs

Purpose:
- summarize clusters of work
- reduce clutter
- provide operational entry points

## Individual nodes
Examples:
- specific job
- specific invoice
- specific customer

Purpose:
- support precise inspection
- show relationship detail
- support record-level workflows

This dual model is required.

Admin V2 should allow a department to zoom into aggregated systems and then into individual records.

---

# Node Visual Direction

All nodes should be designed as **system nodes**.

This means they should feel like:

- modules
- system components
- active operational units

Not:
- oversized cards
- decorative illustrations
- generic CRM blocks

The visual style should align with the Alloy brand guide:

- clean
- premium
- calm
- trustworthy
- subtle motion
- never overly corporate
- never gimmicky

Reference colors should be taken from the Alloy palette:
- Alloy Blue `#00458C`
- Bend Pine `#00A283`
- Juniper Ember `#BC4300`
- River Stone `#F4F6F9`
- Midnight Forge `#273F52`

Use River Stone as the primary light UI background and white / near-white surfaces, with Alloy Blue and Bend Pine as primary accents.

---

# Node Color Rules

## Base UI
- background: River Stone or white surface
- border: light neutral border
- text: Midnight Forge
- selected state: Alloy Blue accent
- active state: Bend Pine accent
- warning / urgent actions: Juniper Ember

## Health states
- healthy → Bend Pine
- attention → Juniper Ember
- critical → stronger ember/red-orange treatment
- informational / selected → Alloy Blue

## Department tinting
Departments may use subtle tints derived from their configured identity color.

These tints must be:
- subtle
- low opacity
- brand-consistent
- never oversaturated

Department coloring is configurable by org settings.

## Configurable branding
Admin V2 must support:
- logo upload
- brand color upload / mapping
- configurable department colors
- configurable status colors

Brand configuration should override default system colors where appropriate.

---

# Node Size Rules

Nodes should resize dynamically based on activity.

This is one of the key ways the system feels alive.

## Inputs to node sizing
Node size may be influenced by:
- transaction volume
- workflow throughput
- alert count
- record count
- queue volume
- configured importance weighting

## Size bands
Use constrained size bands:
- small
- normal
- large
- emphasized

Do not allow uncontrolled scaling.

The difference between sizes should be noticeable but not chaotic.

## Animation
Node resizing should animate smoothly.

No sudden jumps.

Recommended behavior:
- subtle growth when activity rises
- subtle contraction when activity falls
- soft transitions on state changes

---

# Node States

All nodes must support consistent state handling.

## Required states
- default
- hovered
- focused
- selected
- loading
- healthy
- attention
- critical
- disabled

## State behavior
### Hover
- subtle elevation
- manager preview reveal (for department nodes)
- pointer affordance

### Focus / selected
- stronger border/accent
- eligible to open inspector
- may update contextual suggestion chips

### Loading
- skeleton or low-detail placeholder
- no jitter

### Attention / critical
- alert badge visible
- subtle animated emphasis allowed

---

# Node Content Rules

## Department node content
- icon
- department name
- health state
- primary KPI
- secondary KPI
- alert count

## Manager node content
- manager name
- health state
- primary KPI
- workload indicator
- alert count

## Agent node content
- agent name
- status
- activity metric
- exception count or latest execution status

## Workflow node content
- workflow name
- trigger
- execution status
- last run summary

## Record node content
- record title
- status
- key metadata
- optional linked relationship hint

---

# Progressive Reveal Rules

Admin V2 uses progressive reveal to avoid clutter.

## Top-level company view
Visible:
- department nodes only

## Department preview
On hover/focus:
- manager nodes may preview below department

## Department zoom
Visible:
- managers

## Manager zoom
Visible:
- agents

## Agent zoom
Visible:
- workflows

## Workflow zoom or drill-in
Visible:
- records / execution history / related tables

This behavior must remain consistent.

---

# Node Interaction Rules

## Click
Primary click triggers:
- structured zoom
- breadcrumb update
- inspector context update

## Secondary click / alternate interaction
May open inspector directly where appropriate.

## Hover
Used for:
- preview reveal
- subtle state change
- lightweight context

## Drag
Nodes are displayed on a draggable canvas.
Users can pan the canvas freely.

## Keyboard / accessibility
Nodes should support keyboard focus and activation where possible.

---

# Node Inspector Relationship

Any node can open the right-side inspector panel.

Inspector should show:

- summary
- metrics
- activity
- actions
- linked records
- history

The inspector must adapt by node type.

Examples:

## Department inspector
- department health
- top metrics
- alerts
- linked managers
- linked records / tables
- AI suggestions

## Manager inspector
- AI summary
- agent list
- workload
- recent actions
- optimization suggestions

## Agent inspector
- active tasks
- recent executions
- linked workflows
- failure counts
- re-run or pause actions

## Workflow inspector
- graph / table view
- execution history
- success/failure states
- linked records

## Record inspector
- AI summary
- structured field grid
- related records
- history timeline

---

# Edge / Connection Rules

Connections between nodes are important.

They must communicate structure without becoming visually noisy.

## Connection types
- hierarchy edges
- workflow sequence edges
- record relationship edges
- context-only edges (optional, limited use)

## Visual behavior
- subtle by default
- stronger on hover/focus/selection
- animated only when meaningful
- never overly decorative

## Examples
- department → manager
- manager → agent
- agent → workflow
- customer → job
- job → schedule
- job → invoice
- workflow → record set

---

# Node Contextual AI Prompts

Nodes may surface contextual AI shortcuts.

Examples:
- Optimize schedule
- Investigate delay
- Review exceptions
- Explain anomaly
- Forecast billing impact

These prompts should appear:
- on focus
- in inspector
- or contextually near selected nodes

They should not clutter the default node surface.

---

# Search + Nodes

Search is separate from AI.

Search should return:
- records
- workflows
- entities
- departments
- managers where appropriate

Search results may:
- open inspector directly
- focus a node on canvas
- zoom user to the relevant context

This supports fast lookup without using the AI command bar.

---

# AI Command Bar + Nodes

The bottom AI command bar is the primary natural language control surface.

Commands may:
- focus nodes
- highlight node groups
- reveal issues
- trigger safe actions
- open linked records

Examples:
- "Show delayed jobs"
- "Focus operations"
- "Highlight billing exceptions"
- "Explain why this node is critical"

The AI layer should visually map responses back to nodes when possible.

---

# Canvas Integration Rules

The node system exists inside a draggable, zoomable canvas.

## Required canvas behaviors
- drag / pan
- manual zoom
- guided zoom on click
- breadcrumb-aware positioning
- dynamic re-layout on zoom level changes

The canvas should preserve:
- sense of place
- spatial context
- system continuity

---

# Configurability Rules

The node system must be configurable.

Admin settings should support:
- dynamic departments
- department labels
- department icons
- department colors
- status color mapping
- logo / brand upload
- AI manager naming
- visible node categories by org / vertical

This ensures the same system can power:
- cleaning
- insurance
- childcare
- future verticals

---

# Engineering Guidance

The node system should be implemented with reusable components.

Recommended component boundaries:
- BaseSystemNode
- DepartmentNode
- ManagerNode
- AgentNode
- WorkflowNode
- RecordNode
- NodeConnectionLine
- NodeRevealLayer
- NodeHealthBadge
- NodeMetricPair
- AlertCountBadge

Use a shared node config model rather than hardcoding display logic per vertical.

---

# Non-Goals

The node system should not become:
- a mind map
- a decorative graph
- an unreadable network diagram
- a replacement for tables
- a replacement for inspector panels

The node system is the visual operating layer.
Tables, inspectors, workflows, and search remain first-class.

---

# Summary

The Alloy Admin V2 node system must support:

- aggregated operational visibility
- record-level inspection
- AI system supervision
- dynamic sizing and health states
- branded but calm visual behavior
- dynamic vertical configuration

This node system is one of the primary reasons Alloy will feel distinct from traditional SaaS products.