Perfect — this is the right moment to lock this into a real operating doc. I’m going to structure this like something you can actually drop into /docs/ and use with Cursor + future team members.

⸻

📄 docs/SYSTEM_FOUNDATION_V1.md

⸻

0. Purpose

This document defines the core system foundation for Alloy across three critical areas:
	1.	Admin API org scoping (security + tenancy)
	2.	UI V1 information architecture (operational clarity)
	3.	Hierarchy model (how the system organizes work)

This is the baseline required before:
	•	expanding configurability
	•	wiring UI V2 to real data
	•	introducing AI-driven configuration

⸻

1. Admin API Org Scoping Audit

Objective

Ensure every admin API route is properly scoped to org_id, especially when using elevated clients.

This is P0 for multi-tenant safety.

⸻

1.1 Risk pattern

Any route using:
	•	createAdminClient()
	•	service role keys
	•	bypassed RLS

MUST explicitly enforce org scoping

⸻

1.2 Required enforcement pattern

Every admin route must:

Step 1 — resolve admin context

const { org_id, user_id, role } = await getAdminContext(req)

Step 2 — scope queries

.from("table")
.select("*")
.eq("org_id", org_id)

Step 3 — scope mutations

.insert({ ...data, org_id })
.update({ ...data })
.eq("org_id", org_id)

Step 4 — validate ownership on read/update/delete

Never trust incoming IDs without checking org ownership.

⸻

1.3 Audit checklist

For each file in:

web/app/api/admin/**

Check:
	•	Uses getAdminContext
	•	Applies .eq("org_id", org_id) on ALL queries
	•	Applies .eq("org_id", org_id) on ALL updates/deletes
	•	Does NOT return cross-org data
	•	Does NOT rely on client-supplied org_id

⸻

1.4 Known high-risk areas

From audit:
	•	workflows
	•	pipelines
	•	any list endpoints using createAdminClient()

⸻

1.5 Deliverable (historical — superseded)

The standalone **`docs/ADMIN_API_AUDIT_CHECKLIST.md`** was never added as a separate file. Equivalent tracking lives in:

- [`docs/audits/ADMIN_API_ORG_SCOPING_AUDIT_V1.md`](../audits/ADMIN_API_ORG_SCOPING_AUDIT_V1.md) — per-route risk and remediation column
- [`docs/implementation/ADMIN_API_REMEDIATION_BATCH_1.md`](./ADMIN_API_REMEDIATION_BATCH_1.md) (and batches 2–3) — applied fixes

Use those for route / org-scoping status rather than expecting a checklist file at the old path.

⸻

2. UI V1 Information Architecture

Objective

Make /admin:
	•	coherent
	•	complete
	•	the single source of truth for configuration and operations

⸻

2.1 Problem today
	•	settings scattered
	•	unclear separation of:
	•	system config
	•	operational data
	•	financials
	•	hidden capabilities (pipelines, workflows, document fields)

⸻

2.2 Target structure

Primary navigation

/admin

Dashboard (future)
/admin/operations
/admin/records (or entities)
/admin/workflows
/admin/documents
/admin/financials
/admin/system


⸻

2.3 Section definitions

Operations

Day-to-day execution
	•	jobs / records
	•	schedules
	•	queues (future)
	•	assignments

⸻

Records (Entities)

Core data model
	•	customers
	•	persons
	•	vendors
	•	opportunities
	•	locations

⸻

Workflows

System automation
	•	workflow builder
	•	workflow runs
	•	triggers + actions

⸻

Documents

Document system
	•	uploaded docs
	•	document types
	•	document field definitions

⸻

Financials

Money layer
	•	pricing
	•	plans
	•	discounts
	•	payouts
	•	ledger (future expansion)

⸻

System (NEW — critical)

This is the biggest missing piece.

/admin/system

Contains:

Organization
	•	org name
	•	industry
	•	config lock

Labels
	•	entity renaming

Statuses
	•	per entity type

Custom fields
	•	all entity types

Relationships
	•	person relationships
	•	contact roles

Document config
	•	doc types
	•	extraction fields

Permissions
	•	roles
	•	permission grants

⸻

2.4 Principles
	•	No hidden configuration surfaces
	•	No duplication across pages
	•	Everything configurable is discoverable
	•	Settings grouped logically, not historically

⸻

2.5 Deliverable

Refactor /admin navigation to match:

Operations
Records
Workflows
Documents
Financials
System


⸻

3. Hierarchy Model (CRITICAL)

Objective

Define how Alloy structures work across all industries.

This powers:
	•	UI V1 clarity
	•	UI V2 workspace
	•	AI configuration
	•	workflow routing

⸻

3.1 Core hierarchy

Organization
  → Department
    → Work Unit
      → Record


⸻

3.2 Definitions

Organization

The tenant (company using Alloy)

⸻

Department

Function of the business

Examples:

Childcare
	•	Operations
	•	Enrollment
	•	Compliance

Insurance
	•	Renewals
	•	Sales
	•	Servicing

Home Services
	•	Cleaning Ops
	•	Dispatch
	•	Customer Support

⸻

Work Unit

The grouping of work inside a department

This is the most important level.

Examples:

Childcare
	•	Classroom (Room A, Room B)
	•	Staff pool

Insurance
	•	Renewal batch (by date)
	•	Agent book

Home Services
	•	Route cluster
	•	Daily job queue

⸻

Record

The atomic unit of work

Examples:

Childcare
	•	Student
	•	Classroom day
	•	Attendance instance

Insurance
	•	Policy renewal
	•	Customer policy

Home Services
	•	Job
	•	Appointment

⸻

3.3 Key rules

Rule 1 — Work units own records

Every record must belong to a work unit.

⸻

Rule 2 — Departments group work units

Departments do NOT directly own records.

⸻

Rule 3 — Work units define operational UX

Queues, routing, and prioritization happen at this level.

⸻

Rule 4 — Records are detail views

Everything actionable ultimately resolves to a record.

⸻

3.4 Why this matters

This fixes:
	•	UI V2 confusion
	•	navigation inconsistency
	•	data modeling ambiguity
	•	AI agent targeting

⸻

3.5 Example (Childcare)

Organization: BrightCare

Department: Operations

Work Units:
  - Room A
  - Room B
  - Float Pool

Records:
  - Classroom state (today)
  - Student attendance


⸻

3.6 Example (Insurance)

Department: Renewals

Work Units:
  - Expiring in 7 days
  - High premium renewals
  - Blocked renewals

Records:
  - Individual policy renewal


⸻

3.7 System implications

You will need:
	•	departments table
	•	work_units table
	•	foreign key:
	•	record → work_unit_id
	•	work_unit → department_id

⸻

4. How these three connect

Area	Role
API scoping	Ensures safe multi-tenant system
UI V1	Exposes config + structure
Hierarchy	Defines how work is organized

Together, they enable:
	•	real configurability
	•	meaningful UI V2
	•	AI-driven setup

⸻

5. Immediate execution plan

Step 1 (now)
	•	audit admin APIs
	•	fix org scoping

Step 2
	•	define hierarchy tables + relationships
	•	no UI yet, just schema clarity

Step 3
	•	unify /admin navigation
	•	introduce /admin/system

Step 4
	•	map existing config into system section

⸻

6. What NOT to do yet
	•	do NOT overbuild UI V2
	•	do NOT add new config types
	•	do NOT build AI agents yet

Focus on:
	•	structure
	•	clarity
	•	safety

⸻

Final note

Once this document is implemented:
	•	UI V1 becomes your control center
	•	UI V2 becomes your operating system UI
	•	AI becomes your configuration layer

⸻