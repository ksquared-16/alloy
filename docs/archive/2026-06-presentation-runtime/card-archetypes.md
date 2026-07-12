# Alloy Card Archetypes

**Status:** Foundational platform doctrine (June 2026). Defines the reusable operational building blocks used throughout the platform.
**Follows:** [`operational-grammar.md`](./operational-grammar.md) (why Alloy exists) · [`card-language.md`](./card-language.md) (how cards behave).
**Code-anchored companion:** [`universal-card-archetypes.md`](./universal-card-archetypes.md) (System 5A composition primitives in `web/lib/adminV2/runtime/focusPanel/`).

> An archetype is **not a visual template** — it is an **operational pattern**. Every card belongs to exactly one archetype and inherits its behavior automatically.

---

## What an archetype determines

The operational question · information hierarchy · interaction behavior · editing behavior · density behavior · expected actions · expected collections · visual emphasis.

---

## Identity Archetype

- **Purpose:** Help the operator understand who they are working with.
- **Question:** Who is this?
- **Typical cards:** Household, Children, Contacts, Assignment, Organization, Staff
- **Primary answer:** Identity. **Supporting evidence:** relationships, contact information, ownership, role.
- **Typical actions:** Call, Message, Edit, Assign, Add Relationship.
- **Focus behavior:** Select one subject while preserving context.

> **Reference implementation (frozen):** the **Household Card** is the canonical Identity reference — see the design freeze [`household-reference-card.md`](./household-reference-card.md). It answers *"Who belongs to this household, and who can I contact?"* (one question, two facets: belonging + reachability), assembles its answer from the observed Operational Context (primary contact, children, additional contacts, emergency contacts, authorized pickups, billing contact), and supports collapsed → expanded → focused-evidence perspectives as local UI state. Cards build against the Operational Context boundary ([`operational-context-boundary.md`](./operational-context-boundary.md)), not "drawer". Convergence sequencing: [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md).

---

## Process Archetype

- **Purpose:** Help the operator understand where the subject is.
- **Question:** Where are we in the process?
- **Typical cards:** Enrollment, Tour, Waitlist, Schedule, Program, Status
- **Primary answer:** Current operational position. **Evidence:** dates, transitions, milestones, requirements.
- **Typical actions:** Advance, Pause, Move, Schedule, Cancel.

---

## Work Archetype

- **Purpose:** Help the operator know what to do next.
- **Question:** What should happen next?
- **Typical cards:** Current Work, Tasks, Next Action, Required Information
- **Primary answer:** Immediate work. **Evidence:** due dates, priority, owner, dependencies.
- **Typical actions:** Complete, Assign, Delay, Escalate, Create.

---

## Intelligence Archetype

- **Purpose:** Help the operator think.
- **Question:** Should I care?
- **Typical cards:** Readiness, Attention, Health, Recommendations, Risk
- **Primary answer:** Operational assessment. **Evidence:** rules, signals, metrics, predictions.
- **Typical actions:** Review, Resolve, Override, Explain.

---

## Collection Archetype

- **Purpose:** Help the operator explore related evidence.
- **Question:** What related information exists?
- **Typical cards:** Documents, Messages, Children, Contacts, Payments, Forms
- **Primary answer:** Collection summary. **Evidence:** individual collection items.
- **Typical actions:** Filter, Search, Focus Item, Add Item, Edit Item.
- **Law:** Collections never own information — they organize evidence.

---

## Communication Archetype

- **Purpose:** Help the operator communicate.
- **Question:** What has been communicated?
- **Typical cards:** Messages, Notes, Forms, Announcements
- **Primary answer:** Current communication state. **Evidence:** threads, recipients, attachments, templates.
- **Typical actions:** Reply, Compose, Schedule, Generate.

---

## Financial Archetype

- **Purpose:** Help the operator understand money.
- **Question:** What is the financial position?
- **Typical cards:** Billing Preview, Invoices, Payments, Credits, Discounts
- **Primary answer:** Current balance or obligation. **Evidence:** transactions, invoices, adjustments.
- **Typical actions:** Charge, Refund, Adjust, Invoice.

---

## Activity Archetype

- **Purpose:** Help the operator understand history.
- **Question:** What happened?
- **Typical cards:** Timeline, Audit, History
- **Primary answer:** Chronological narrative. **Evidence:** events, changes, actors, timestamps.
- **Typical actions:** Inspect, Filter, Compare, Export.

---

## Metrics Archetype

- **Purpose:** Help the operator measure performance.
- **Question:** How are we doing?
- **Typical cards:** KPI, Trend, Forecast, Benchmark
- **Primary answer:** Current measurement. **Evidence:** comparisons, historical values, targets.
- **Typical actions:** Drill Down, Compare, Filter.

---

## Inheritance & Platform Principle

Every card inherits behavior from its archetype: a Household card behaves like every Identity card; a Timeline like every Activity card; a Current Work card like every Work card. **Modules change; archetypes do not.**

**Business Processes do not invent new archetypes — they compose existing ones.** Enrollment, Attendance, Billing, Scheduling, Staff, Parent Portal, and Analytics all reuse the same operational language. This creates **one consistent operating system** rather than multiple independent applications.
