> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Alloy AI Interaction Model

> **Note (2026-04):** AI must operate **within** platform doctrine; see [`docs/architecture/workspace-work-unit-scope-doctrine.md`](./architecture/workspace-work-unit-scope-doctrine.md#future-ai-compatibility-not-implementation-now) and [`docs/architecture/README.md`](./architecture/README.md).

## Overview

AI interaction is a core component of the Alloy interface.

AI should assist users through:

• command interpretation
• contextual suggestions
• automation recommendations

AI must integrate seamlessly with the UI.

---

# AI Command Bar

The primary AI interaction point is the command bar.

It is pinned to the bottom of the screen.

Users can enter natural language commands.

Example commands:

Create invoice for job 482  
Find overdue invoices  
Generate report for March  

AI interprets the request and executes the corresponding action.

---

# Context Awareness

AI should receive context from the UI.

Examples:

selected record  
active department  
current filters  

Example:

If the user is viewing a job and types:

"Generate invoice"

The system should automatically link the invoice to the selected job.

---

# AI Suggestions

AI suggestions appear in the inspector panel.

Examples:

Suggested workflows  
Detected anomalies  
Document field matches  

These suggestions should never interrupt the user.

They should remain visible but optional.

---

# AI Workflow Assistance

AI should help build workflows.

Example:

User types:

"Create workflow to notify me when invoices are overdue."

AI generates the workflow configuration.

---

# AI Document Parsing

AI should extract structured data from documents.

Example fields:

customer name  
invoice total  
contract date  
address  

Extracted fields should populate system records automatically.

---

# Safety

AI must not execute destructive actions without confirmation.

Examples requiring confirmation:

delete records  
cancel jobs  
issue refunds  

Slide-to-confirm interactions should be used when possible.

---

# Summary

AI interaction should enhance the system through:

• command interpretation
• contextual suggestions
• automation assistance
