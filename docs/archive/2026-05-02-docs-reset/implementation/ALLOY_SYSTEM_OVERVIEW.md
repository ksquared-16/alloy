Alloy System Overview

1. System Philosophy

Alloy is a multi-tenant, event-driven operating system for vertical SaaS businesses.

It is not a no-code automation tool.
It is not a single-vertical application.
It is not a collection of scripts.

Alloy is built around:
	•	Event-first architecture
	•	Ledger-native financial integrity
	•	Deterministic workflow execution
	•	Multi-tenant isolation
	•	Configurable vertical abstractions
	•	AI-assisted but not AI-dependent orchestration

Every feature must align with these principles.

⸻

2. Core Architectural Model

Alloy follows this core structure:

Org → Entities → Events → Workflows → Actions → Ledger Effects

Organization (org_id)
	•	Every record is scoped to an org_id.
	•	Row Level Security (RLS) enforces isolation.
	•	No cross-tenant data leakage is permitted.
	•	Workflows execute within org boundaries.

⸻

3. Entity Model

Entities represent domain objects such as:
	•	Customers
	•	Jobs
	•	Schedules
	•	Bookings
	•	Opportunities
	•	Payments
	•	Documents
	•	Custom vertical-specific types

Each entity:
	•	Has a UUID primary key
	•	Is scoped to an org
	•	Can emit canonical events
	•	Can trigger workflows

Entities are extensible per vertical via configuration, not code duplication.

⸻

4. Canonical Event Layer

All business actions emit events.

Examples:
	•	booking_confirmed
	•	schedule_created
	•	action_link_consumed
	•	quote_started
	•	payment_posted

Events are:
	•	Immutable
	•	Timestamped
	•	Associated with entity_type + entity_id
	•	Scoped to org_id

Events trigger workflows.

This makes Alloy event-driven by design.

⸻

5. Workflow Engine

Workflows are:
	•	Configurable per org
	•	Triggered by event_type
	•	Executed deterministically
	•	Fully instrumented

Execution lifecycle:
	1.	Event occurs
	2.	workflow_runs record created
	3.	Actions executed in defined order
	4.	Each action recorded in workflow_action_runs
	5.	Status updated (started → completed / skipped / failed)

Workflow execution is:
	•	Durable
	•	Traceable
	•	Auditable
	•	Idempotent where required

No action executes silently.

⸻

6. Action Link System

Action links are secure, tokenized execution triggers.

Use cases:
	•	Customer cancels schedule
	•	Vendor accepts job
	•	Approval links
	•	External confirmations

Properties:
	•	Token-based
	•	Single-use
	•	Expirable
	•	Linked to workflow trigger event

Consumption emits an event:
action_link_consumed

This feeds back into the workflow system.

⸻

7. Ledger-Native Financial Model

Alloy includes a general ledger layer:
	•	gl_accounts
	•	ledger_transactions
	•	Direction checks (inflow / outflow)
	•	Account type constraints (asset, liability, revenue, etc.)

All financial movements must:
	•	Respect double-entry integrity
	•	Pass check constraints
	•	Remain auditable
	•	Be org-scoped

The ledger is not optional.
It is core infrastructure.

This differentiates Alloy from automation tools.

⸻

8. Multi-Tenant Design

Alloy uses:
	•	Shared database
	•	org_id scoping
	•	Strict RLS enforcement
	•	No per-tenant schema duplication

Tenant isolation is enforced at:
	•	Query level
	•	API level
	•	Workflow level
	•	Ledger level

All future verticals must respect this model.

⸻

9. AI Orchestration Layer

AI is used to:
	•	Interpret user intent
	•	Route commands
	•	Extract structured data
	•	Suggest actions
	•	Assist in monitoring

AI is not trusted blindly.

AI must:
	•	Produce structured outputs
	•	Operate within defined action boundaries
	•	Never bypass ledger or workflow integrity
	•	Never bypass tenant isolation

AI is an assistant to the deterministic engine, not a replacement for it.

⸻

10. Vertical Expansion Model

Alloy supports multiple verticals:
	•	Cleaning
	•	Childcare
	•	Insurance
	•	Future service businesses

Vertical differences are handled through:
	•	Configurable entities
	•	Custom fields
	•	Workflow configuration
	•	Settings-driven behavior

Core architecture remains unchanged.

⸻

11. Non-Goals

Alloy is not:
	•	A drag-and-drop no-code tool
	•	A generic Zapier clone
	•	A BPM engine
	•	A microservices playground

Complexity must be intentional.

⸻

12. Architectural Guardrails

All new features must:
	•	Emit canonical events
	•	Respect org boundaries
	•	Use workflow instrumentation
	•	Maintain ledger integrity (if financial)
	•	Be observable and debuggable
	•	Avoid bypassing core abstractions

If a feature requires bypassing these layers, it is likely mis-designed.

⸻

13. Long-Term Vision

Alloy evolves into:
	•	A configurable operating system for service businesses
	•	With built-in ledger
	•	With workflow automation
	•	With AI orchestration
	•	With vertical flexibility

The system must scale horizontally across industries without architectural rewrite. 