# Alloy Operational Doctrine v1

**Path:** `docs/sprints/05_2026/alloy_operational_doctrine_v1.md`  
**Status:** Draft v1 (May 2026)  
**Scope:** Platform operating concepts across CRM, enrollment, billing, scheduling, payments, and future industries.

**Related:** [`childcare_lifecycle_matrix_v1.md`](./childcare_lifecycle_matrix_v1.md), [`action_button_lifecycle_alignment_audit.md`](./action_button_lifecycle_alignment_audit.md), [`docs/system/actions-and-workflows.md`](../../system/actions-and-workflows.md), [`docs/execution/operating-doctrine.md`](../../execution/operating-doctrine.md)

---

## Purpose

Define the operating concepts Alloy uses across CRM, enrollment, billing, scheduling, payments, and future industries.

This doctrine prevents statuses, tasks, actions, workflows, requirements, automations, layouts, and BOS guidance from overlapping or duplicating each other.

---

## Core Concepts

### Lifecycle Status

Represents where a record is in its lifecycle.

Statuses should be few, stable, reportable, and meaningful for pipeline movement.

Statuses are not tasks, contact attempts, workflow steps, or temporary follow-up needs.

Examples:

- New Lead
- Qualification
- Tour
- Waitlist
- Enrollment
- Active
- Lost
- Withdrawn

### Task / Work Item

Represents work that needs to be completed.

Tasks are temporary, assignable, completable, and may have due dates.

Examples:

- Contact Parent
- Confirm Tour
- Review Enrollment Packet
- Request Missing Information
- Verify Start Date

### Action

Represents a canonical business operation.

An action can be surfaced as:

- an action button
- a BOS recommendation
- a task completion operation
- a workflow step
- an API invocation

Examples:

- Create Lead
- Schedule Tour
- Send Enrollment Packet
- Move to Waitlist
- Approve Enrollment
- Assign Classroom
- Assign Schedule
- Set Start Date
- Collect Deposit

**Action buttons are UI placements of canonical actions.** They are not the action itself.

### Workflow

Represents automated or guided process execution.

Workflows may:

- create tasks
- send communications
- update statuses
- invoke actions
- create reminders
- record activity

Examples:

- Send tour reminder
- Create follow-up task after missed tour
- Set enrollment date when enrollment is approved
- Notify staff when paperwork is submitted

### Requirement

Represents what must be true before a save, action, transition, or workflow can proceed.

Requirements are contextual and should be attached to layout, status, action, workflow, role, or policy context — not only to base field definitions.

Examples:

- Parent phone or email required before contacting.
- Tour date required before scheduling a tour.
- Classroom, schedule, and start date required before approving enrollment.
- Employee ID required when person is marked employee.

### Automation

Represents system-performed updates or side effects.

Prefer automation over forcing users to manually enter obvious system-generated data.

Examples:

- Enrollment date = today when enrollment is approved.
- Create activity when child is moved to waitlist.
- Create follow-up task when tour date passes without outcome.
- Send reminder before tour.

### BOS Guidance

Represents explainable attention, recommendation, or risk.

BOS does not own lifecycle state. BOS explains the state, highlights gaps, and recommends actions.

Examples:

- No contact attempt in 3 days.
- Tour date passed with no outcome.
- Enrollment packet submitted but not reviewed.
- Opening available for a waitlisted child.

---

## Separation Rules

1. Use status for lifecycle, not work.
2. Use tasks for work, not lifecycle.
3. Use actions for business operations, not one-off button logic.
4. Use workflows for automation, not status naming.
5. Use requirements for validation, not UI clutter.
6. Use BOS for guidance, not hidden business logic.
7. Use configuration for customer-specific policies.
8. Use templates for industry defaults.
9. Avoid creating new statuses for follow-up, contact attempts, reminders, or paperwork substeps.

---

## Configuration Layers

### Platform Capability

Generic engine:

- lifecycle statuses
- action definitions
- task definitions
- workflow definitions
- requirement policies
- automation policies
- BOS guidance

### Industry Template

Default childcare configuration:

- lead-to-enrollment lifecycle
- childcare-specific actions
- default requirements
- default workflows
- default BOS guidance

### Customer Configuration

Customer-specific overrides:

- activation policy
- waitlist fee policy
- deposit policy
- registration fee policy
- reminder cadence
- required paperwork
- approval rules

---

## BOS Configuration Steward

Future BOS should help manage configuration by:

- explaining consequences of changes
- suggesting best-practice defaults
- detecting conflicting rules
- warning when a change weakens operational controls
- helping customers configure workflows safely

---

## Implementation notes (Alloy today)

| Doctrine concept | Current platform anchor |
|------------------|-------------------------|
| Canonical action | `action_definitions.key` + `executeAdminAction.ts` |
| Action button (placement) | `action_placements` + `resolveActionsForContext.ts` |
| Lifecycle status | `status_definitions` + opportunity `status_key` |
| Requirement | `status_transition_rules`, form `required_fields`, layout field behavior (partial) |
| Workflow / automation | `workflows` + `emitEvent` / `executeWorkflowRun` |
| BOS guidance | Attention resolver + operational recommendation catalog |

See [`action_button_lifecycle_alignment_audit.md`](./action_button_lifecycle_alignment_audit.md) for the gap between this doctrine and current configured action buttons.
