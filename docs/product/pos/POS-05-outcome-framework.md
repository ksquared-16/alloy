# POS-05 — Outcome Framework

> **Status:** Planning artifact (frozen outcome doctrine v1, draft). **Not implementation.**
> No schema, no workflow code, no API. Defines *how information becomes operational outcomes* at the product level.
> Inherits from **POS-01 / POS-02 / POS-03**. Branch: `pos-planning-v1`. Author gate: **Doctrine Gate** (taxonomy) → exercised at later gates.

## Purpose

Every POS source must answer one question:

> **What happens when this is approved?**

This document defines the outcome taxonomy, example outcome recipes, the approval model, and how outcomes relate to workflows, lifecycle, billing, and communications. A source has value only if it can produce an operational result (POS-01).

## Outcome doctrine (recap)

- An **Outcome** is the operational result to execute once approved (POS-02).
- Outcomes are **BOS-prepared** and **operator-approved** in V1. No silent execution.
- Outcomes act **against canonical records and platform workflows** — POS proposes, the owning pillar owns the result (POS-03).
- Approving an outcome is what moves a Processing Case to **Completed** and produces **Operational Results**.

## Outcome taxonomy

Outcomes fall into five categories. Each is a *type* of operational result; specific outcomes are instances.

### Record outcomes

Create or update canonical CRM/financial records.

- create lead
- update person
- create child
- update customer
- create subsidy profile
- create billing profile

*Owner of result:* CRM / Billing. *POS role:* proposes against canonical records; never owns identity or ledger.

### Workflow outcomes

Start or advance platform processes.

- start lifecycle
- move work unit
- create task
- start reimbursement workflow
- start enrollment workflow

*Owner of result:* Lifecycle / platform workflow spine. *POS role:* triggers via approved outcome; does not own workflow definitions or execution.

### Communication outcomes

Reach the family/contact or notify an operator — through Communications.

- send packet
- request missing information
- send confirmation
- notify operator
- notify family

*Owner of result:* Communications (canonical enqueue → worker → provider). *POS role:* composes intent; Communications delivers. Customer-facing copy is synthesized as a communication draft, never raw recommendation text (bos-foundation.md).

### Document outcomes

Produce or attach artifacts.

- generate PDF
- attach document to record
- create completed state form
- create contract record

*Owner of result:* Documents. *POS role:* triggers generation/attachment from approved data (same path as existing "Generate document" → `createGeneratedPdfForSubmission`, reframed under POS).

### Review outcomes

Route the work itself rather than the data.

- assign review
- escalate to director
- request resolution
- defer decision

*Owner of result:* POS (work routing) with operator/role context. *POS role:* manages its own case routing.

### Taxonomy table

| Category | Example outcomes | Result owner |
|----------|------------------|--------------|
| **Record** | create lead, update person, create child, update customer, create subsidy profile, create billing profile | CRM / Billing |
| **Workflow** | start lifecycle, move work unit, create task, start reimbursement workflow, start enrollment workflow | Lifecycle / platform |
| **Communication** | send packet, request missing information, send confirmation, notify operator, notify family | Communications |
| **Document** | generate PDF, attach document to record, create completed state form, create contract record | Documents |
| **Review** | assign review, escalate to director, request resolution, defer decision | POS |

## Outcome recipes (examples)

A **recipe** is the ordered set of outcomes attached to a source type. Recipes are configured in Outcome Configuration (POS-04 #22–23), not coded per case. Recipes are illustrative, not a committed configuration.

### Recipe — Enrollment form

When approved:

1. create lead *(Record)*
2. create household / update customer *(Record)*
3. create child *(Record)*
4. start enrollment lifecycle *(Workflow)*
5. send packet *(Communication)*

### Recipe — Subsidy contract

When approved:

1. create subsidy profile *(Record)*
2. create billing setup *(Record / Billing)*
3. link child *(Record)*
4. start reimbursement workflow *(Workflow)*
5. send confirmation *(Communication)*

### Recipe — Registration packet

When approved:

1. update family data *(Record)*
2. collect / verify required documents *(Document + Review)*
3. generate completed documents *(Document)*
4. move lifecycle forward *(Workflow)*

### Recipe — Incident report (illustrative)

When approved:

1. attach document to child record *(Document)*
2. notify operator / escalate to director *(Communication / Review)*
3. create task for follow-up *(Workflow)*

## Approval model

V1 approval doctrine, stated precisely:

- Every recipe produces a **proposed** outcome set on the Processing Case.
- BOS validates the set (required steps present, logical order, mappings valid, conditions satisfied) and surfaces readiness + estimated impact (POS-04 #8, #22).
- An **operator approves** before any step executes. Approval may be **all** or a **subset** of steps.
- A step may be configured **optional** or **auto-execute**, but auto-execute in V1 still occurs **only within an operator-approved recipe** — it is not silent, un-reviewed execution. (Whether auto-execute is enabled at all in the first release is an open question; see README.)
- Execution is **idempotent** where it touches generation/records (mirrors existing idempotent PDF generation), so re-approval or retry does not double-apply.
- Every executed step yields an **Operational Result** recorded in case history with human attribution.

### Approval states (per case)

| Case state | Outcome posture |
|------------|-----------------|
| Needs Review / Needs Resolution | Outcome may be proposed but is **blocked** until open items clear |
| Ready | Outcome validated and **awaiting approval** |
| Completed | Approved outcome **executed**; Operational Results exist |

## Relationship to platform

### Workflows

Workflow outcomes **start** platform workflows through the existing event/workflow spine. POS does not define or run workflows; it provides the approved trigger and the validated data. The boundary: *POS decides that a workflow should start; the platform decides how it runs.*

### Lifecycle

Workflow/record outcomes can **advance lifecycle** (start enrollment lifecycle, move work unit). The Processing Case's own lifecycle (POS-02) is separate from the CRM/Lifecycle progression it triggers. POS never substitutes for case-vs-candidate enrollment truth owned by Lifecycle.

### Billing

Record outcomes can **create subsidy/billing profiles and billing setup**; workflow outcomes can **start reimbursement workflows**. POS proposes; Billing owns ledger semantics and truth. POS never writes ledger state directly — it triggers billing-owned setup/workflows that do.

### Communications

Communication outcomes execute **only** through Communications' canonical enqueue. POS supplies recipient + intent + synthesized draft; Communications owns delivery, threading, and receipts. Recommendation strings are never sent as customer copy without synthesis.

## What this framework is not

- Not a workflow engine spec.
- Not a list of database writes.
- Not a commitment to specific recipe configurations — recipes here are illustrative and will be configured at the appropriate later gate.
- Not an authorization model — capability/permission gating remains the platform's (roles-and-permissions doctrine).
