> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Alloy Interface Architecture

> **Note (2026-04):** Structural doctrine for workspaces, work units, drawers vs full record, and RRS is in [`docs/architecture/`](./architecture/README.md). This document is a **conceptual region map** (sidebar, canvas, inspector); it is not the canonical data or resolver model.

## Overview

The Alloy interface combines:

• minimal navigation
• operational visualization
• AI command interaction

The UI consists of five primary regions.

---

# 1. Sidebar Navigation

Collapsed by default.

Contains primary system areas.

Dashboard  
Operations  
Customers  
Jobs  
Workflows  
Documents  
Settings  

The sidebar should expand when hovered or clicked.

---

# 2. Top Navigation

Displays context.

Supports breadcrumb navigation.

Example:

Operations → Scheduling → Job 4123

Allows users to zoom between system levels.

---

# 3. Operational Canvas

The center of the interface.

Displays dynamic nodes representing system entities.

Nodes can represent:

• departments  
• workflows  
• records  

Nodes should change size based on activity.

Examples:

Scheduling node grows when many jobs exist.

Billing node grows during invoice cycles.

---

# 4. Inspector Panel

Right-side panel that displays contextual information.

Fixed sections include:

Details  
Activity  
AI Suggestions  
Related Records  
History  

This panel updates based on the selected node or record.

---

# 5. AI Command Bar

Pinned to the bottom of the screen.

Supports natural language commands.

Example commands:

Create job for customer Sarah  
Show overdue invoices  
Generate invoice for job 482  
Import documents  

The command bar should not replace search.

---

# Search System

Search must exist independently from AI.

Search should support:

jobs  
customers  
documents  
invoices  

Search should appear in the top navigation.

---

# Node Interaction

Nodes should support:

dragging  
expanding  
opening detail view  
triggering workflows  

Connections between nodes should be visible when relevant.

---

# Motion & Animation

Animations should enhance clarity.

Examples:

node growth  
connection animation  
slide confirmation actions  

Animations should remain subtle.

---

# Summary

The interface combines:

• minimal navigation
• visual system mapping
• AI command interaction
