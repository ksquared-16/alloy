# System Structure V1

> **Doctrine (2026-04):** For **resolver-first records**, **persons-first identity**, **overview layout**, and **workspace/work-unit/scope semantics**, use [`docs/architecture/README.md`](../architecture/README.md). This document remains the best map of **V1 admin IA** and how it relates to hierarchy and UI V2 shells.

## 1. Purpose

This document is the **single working reference** for how Alloy should think about **admin product structure** after Admin API org-scoping remediation (through Batch 3). It ties together three threads that were previously split across [System foundation v1](./SYSTEM_FOUNDATION_V1.md), [Workspace system v1](./WORKSPACE_SYSTEM_V1.md), and [Department UI system v1](./DEPARTMENT_UI_SYSTEM_V1.md):

1. **UI V1 information architecture** — where operators find day-to-day work vs configuration vs money vs automation.
2. **Hierarchy model** — how **Organization → Department → Work Unit → Record** should organize work across industries (conceptual and, later, data).
3. **System / org settings** — the dedicated surface for org-wide configuration (today fragmented under `/admin/system`, Financials, and Operations).

**Why it exists**

- Align engineering, product, and demos on **one** structure before building more surfaces.
- Prevent “where does this live?” drift while V1 navigation still reflects historical growth.
- Make explicit how **V1 admin truth** (lists, settings, APIs) relates to **UI V2 workspaces** (Company / Department / Work Unit / Record shells) without collapsing them into one UI pass.

**How it connects UI V1, hierarchy, and future UI V2**

| Layer | Role |
|-------|------|
| **UI V1** | Canonical **operational and configuration** IA: real routes, real data, org-scoped admin APIs. |
| **Hierarchy model** | **Semantic backbone**: what a department vs work unit means, what rolls up, what a record is—used to name queues, scope automation, and eventually persist `departments` / `work_units`. |
| **UI V2** | **Rendering and density** on top of the same hierarchy and config: workspace shells, rollups, command rails—not a second source of truth for entities. |

This pass is **documentation and system planning only** (no redesign, no route refactors required to ship the doc).

---

## 2. UI V1 Information Architecture

**Goal:** `/admin` reads as six top-level **concerns**, each with a clear job. Names on the left are **recommended V1 section titles**; paths in parentheses are **illustrative** (exact URLs can follow in an implementation pass).

### 2.1 Operations

| | |
|--|--|
| **Purpose** | Run the business **this week and today**: pipelines of work, time-bound execution, assignments, messaging tied to work. |
| **What belongs** | Opportunities, jobs, schedules, assignments (or schedule assignment UX), operational recurrence, messages / outbox tied to execution, future **queues** that represent “work in motion.” |
| **What exists today** | **Operations** nav group: Opportunities, Jobs, Schedules, nested Workflows (Builder, Events, Runs), Messages, nested Settings → Recurrence. **Documents** and **Locations** currently sit here too (see below). |
| **Scattered / should move** | **Documents** (list + ingestion) fit better under **Documents** as a first-class section (content lifecycle vs job execution). **Locations** are master data—arguably **Records** or a **Records → Places** sub-area, unless the product explicitly treats “site visits today” as operations-only. **Workflows** are automation—see **Workflows** section (may stay linked from Operations as a shortcut until nav is unified). |

### 2.2 Records

| | |
|--|--|
| **Purpose** | Durable **people, companies, places, and CRM objects** that operations reference—not the timed execution row itself. |
| **What belongs** | Customers, contacts, persons, customer members, vendors, locations, opportunities (if framed as “pipeline records” they can appear here **and** surface in Operations; primary list home should be one place by convention). |
| **What exists today** | **Directory** group: People, Customers, Vendors. Additional record-like pages exist outside that group (e.g. Contacts, Customer Members, Locations under Operations). |
| **Scattered / should move** | Unify **Directory** + stray entity lists under **Records** with consistent subgrouping (e.g. *People & roles*, *Accounts*, *Partners*, *Places*). **Subscriptions** (recurring customer programs) are financially adjacent—see **Financials**; list/detail may stay in Financials or appear as a cross-link from Records. |

### 2.3 Workflows

| | |
|--|--|
| **Purpose** | **Automation system**: definitions, triggers/events, runs, debugging—separate from “doing a job” in Operations. |
| **What belongs** | Workflow builder, workflow events, workflow runs, future dry-run / test harnesses, vendor enrichment debug paths, field catalogs used only for workflow authoring. |
| **What exists today** | Nested under **Operations → Workflows**: Builder, Events, Runs. APIs support run, debug, and field-catalog patterns. |
| **Scattered / should move** | Promote to a **top-level Workflows** section so automation is not buried inside Operations. Keep deep links from department/work-unit UIs (V2) into “runs for this scope” later. |

### 2.4 Documents

| | |
|--|--|
| **Purpose** | **Content**: uploaded files, types, extraction / metadata fields, signing and retrieval—not the same as “Financials documents” unless product merges them. |
| **What belongs** | Document library list, upload flows, document field definitions (system config side), per-type extraction config, links to entity attachments. |
| **What exists today** | **Documents** under Operations (`/admin/documents`). **Document field definitions** live under **System → Directory Settings → Document Fields**. |
| **Scattered / should move** | Co-locate **list + upload** with **document configuration** in the IA (configuration might remain under `/admin/system/...` URLs but grouped under **Documents** in the nav). |

### 2.5 Financials

| | |
|--|--|
| **Purpose** | **Money and commercial structure**: payments, ledger, statements, pricing, discounts, subscriptions, payouts, GL accounts where exposed. |
| **What belongs** | Payments, ledger, statements, pricing matrix / offerings / plan templates / add-ons, discount programs and redemptions, contractor payouts, subscription billing settings. |
| **What exists today** | **Financials** group: Payments, Ledger, Statements, Discount Redemptions, Pricing. Additional pages: subscriptions, discounts, financials accounts, add-ons, service offerings, plan templates, subscription settings under `financials/settings/...`, payouts under System. |
| **Scattered / should move** | **Payouts** under **System** today—consider **Financials → Payouts** for IA consistency (implementation can keep URL). **Discounts** (program management) vs **Discount Redemptions** should be adjacent. **Subscriptions** should appear in nav next to related financial objects. |

### 2.6 System

| | |
|--|--|
| **Purpose** | **Org-wide configuration** that changes how the app behaves for every user in the tenant: labels, statuses, custom fields, access, industry attachment, document rules. |
| **What belongs** | Everything in §3 (detailed below). |
| **What exists today** | **System** group with Access Control, Verticals / Industries, Entity Labels, Statuses, Directory Settings (many field-definition pages), Payouts, and related routes. |
| **Scattered / should move** | Field definitions are grouped as “Directory Settings” but span jobs, schedules, vendors, etc.—rename/rebucket to **Custom fields** (by entity) under System. **Recurrence** under Operations is system behavior—candidate for **System → Operations defaults** or **Scheduling**. **Dashboard** remains top-level or under Operations by product choice. |

### 2.7 Cross-cutting: Dashboard

Treat **Dashboard** as an **entry summary** (KPIs, upcoming schedules, snapshot) that can stay **above** the six sections or as the default `/admin` view. It should **deep-link** into Operations, Records, Financials—not host configuration.

---

## 3. System / Org Settings Surface

**Target:** a coherent **`/admin/system`** hub (or equivalent) that groups org configuration **by concern**, not by historical “Directory Settings” naming. Existing routes can be **linked or redirected** from this hub in a later implementation pass.

### 3.1 Organization

| | |
|--|--|
| **Configurable today** | Org membership and roles via **Access Control**; vertical selector in admin chrome (`AdminVerticalContext`); industries/verticals association via **Verticals / Industries** and industry detail pages. |
| **Code-ready, not fully exposed** | Org profile fields (name, timezone, branding) if/when stored on `orgs` or related tables—verify schema before promising in UI. |
| **Add later** | Explicit **“config lock”** (freeze industry/template), org-level feature flags, data retention policies. |

### 3.2 Labels

| | |
|--|--|
| **Configurable today** | **Entity Labels** (`/admin/system/entity-labels`) driving plural/singular copy in nav and drawers (`EntityLabelsContext`). |
| **Code-ready, not fully exposed** | API `/api/admin/entity-labels` and context already wire labels; any missing entity types should be enumerated in product QA. |
| **Add later** | Section titles / custom terminology packs per department (hierarchy-aware labels). |

### 3.3 Statuses

| | |
|--|--|
| **Configurable today** | **Statuses** page for effective status definitions per entity family (jobs, opportunities, vendors, schedules, documents, etc.). |
| **Code-ready, not fully exposed** | Status resolution helpers in admin (`resolveStatusLabel`, effective definitions)—ensure every entity type used in V1 lists is covered. |
| **Add later** | Department-scoped status overrides (requires hierarchy persistence). |

### 3.4 Custom fields

| | |
|--|--|
| **Configurable today** | Per-entity field definition pages under **System → Directory Settings**: Person, Customer, Job, Opportunity, Vendor, Schedule, Location, Document fields. |
| **Code-ready, not fully exposed** | Typed field values and drawer attachment across entity APIs; admin entity drawer reads field defs. |
| **Add later** | Field groups, conditional visibility, industry templates for field packs. |

### 3.5 Relationships

| | |
|--|--|
| **Configurable today** | **Person relationship types**, **Customer person roles**, **Customer member** contact roles, **DB relationships** explorer. |
| **Code-ready, not fully exposed** | Many relationship tables are org-scoped in API; UI coverage varies. |
| **Add later** | Visual relationship graph admin, validation rules (e.g. max one primary). |

### 3.6 Document config

| | |
|--|--|
| **Configurable today** | **Document field definitions** (system); document list/upload under `/admin/documents`. |
| **Code-ready, not fully exposed** | Signed URLs, entity-linked documents, extraction status—API routes exist; unify discovery under Documents + System hub. |
| **Add later** | Document types as first-class configurable taxonomy, retention per type, OCR model selection per org. |

### 3.7 Permissions / roles

| | |
|--|--|
| **Configurable today** | **Access Control** (`/admin/system/access-control`), **Roles** (`/admin/system/roles` if present in nav elsewhere—verify), user listing (`/admin/users`). |
| **Code-ready, not fully exposed** | `user_roles`, permission keys in schema—map to UI for fine-grained grants if not already visible. |
| **Add later** | Department-scoped roles (hierarchy-aware RBAC). |

### 3.8 Industry / vertical / config lock

| | |
|--|--|
| **Configurable today** | **Verticals / Industries**, industry detail (`/admin/system/industries/[id]`), vertical picker in layout. |
| **Code-ready, not fully exposed** | Industry workspace demo registry (`industry-workspace-registry`) for V2 demos—real binding to org “industry package” TBD. |
| **Add later** | **Config lock**: prevent field/status changes after go-live; template diff when industry updates. |

### 3.9 Other org-wide settings

| | |
|--|--|
| **Configurable today** | **Operations → Recurrence**; **Financials → settings** (e.g. subscription); **Payouts** (system or financials); **Messaging** pages. |
| **Code-ready, not fully exposed** | Pricing matrix API (org scoping / product rules still per audit notes). |
| **Add later** | Notification channels, business hours, holiday calendars, SLA rules per department. |

---

## 4. Hierarchy Model

This is the **conceptual** model V1 should **name and respect** in UX copy, queues, and navigation labels—even before every table exists. It aligns with [System foundation v1](./SYSTEM_FOUNDATION_V1.md) §3 and [Workspace system v1](./WORKSPACE_SYSTEM_V1.md).

### 4.1 Organization

| | |
|--|--|
| **Definition** | The **tenant**: the business using Alloy (`org_id` in data; portfolio level in UI V2 **Company workspace**). |
| **Ownership / purpose** | Owns all data, configuration, and users. **Billing and compliance** anchor here. |
| **Data that belongs** | Org profile, vertical/industry, GL accounts, org-wide statuses/labels/fields, users and roles, cross-department KPIs. |
| **Rolls up / down** | **Down**: departments (once modeled) or logical “lanes” today; **Up**: nothing inside the product (multi-org is separate product decision). |
| **Examples** | **Childcare:** BrightCare Learning. **Insurance:** NorthRiver Agency. **Home Services:** SparkleCo LLC. |

### 4.2 Department

| | |
|--|--|
| **Definition** | A **major function** of the business: how work is **partitioned by mission** (not necessarily by org chart title alone). |
| **Ownership / purpose** | Owns **strategy and health** for a slice of the org: enrollment vs ops vs compliance (childcare), renewals vs sales (insurance), dispatch vs support (home services). UI V2 **Department workspace** is the **operating console** for this level ([Department UI system v1](./DEPARTMENT_UI_SYSTEM_V1.md)). |
| **Data that belongs** | Department-scoped KPIs, rollup queues, workflow scope, templates—**not** the atomic transaction row (that’s Record). Today, departments may be **implicit** (nav sections, saved views) until persisted. |
| **Rolls up / down** | **Up** to org summaries; **down** to work units and their queues. |
| **Examples** | **Childcare:** Operations, Enrollment, Compliance. **Insurance:** Renewals, New Business, Servicing. **Home services:** Cleaning ops, Dispatch, Customer support. |

### 4.3 Work Unit

| | |
|--|--|
| **Definition** | The **operational bucket** inside a department: how work is **batched or routed** day to day. |
| **Ownership / purpose** | Owns **throughput and prioritization**—where “what do I do next?” is answered at list depth. UI V2 **Work Unit workspace** shows the **primary queue** and lane focus ([Workspace system v1](./WORKSPACE_SYSTEM_V1.md)). |
| **Data that belongs** | Queue membership rules, cohort keys (date range, territory, classroom, agent book), assignment pools—not the full CRM profile (that’s usually Record). |
| **Rolls up / down** | **Up** to department rollups (counts, exceptions); **down** to individual records. |
| **Examples** | **Childcare:** Room A, Room B, float pool. **Insurance:** Expiring in 7 days, high premium renewals, blocked renewals. **Home services:** East route cluster, today’s installs, callback queue. |

### 4.4 Record

| | |
|--|--|
| **Definition** | The **atomic unit** a human opens to **inspect or change** something specific: one job, one renewal case, one child-day, one policy view. |
| **Ownership / purpose** | Canonical **detail** surface: facts, related entities, timeline, document links, actions. UI V2 **Record workspace** uses **embedded context** for customer/contact and related entities ([Workspace system v1](./WORKSPACE_SYSTEM_V1.md)). |
| **Data that belongs** | Row-level fields, status, assignments, payments lines tied to that job, messages about that entity. |
| **Rolls up / down** | **Up** into work unit queues and department metrics; **sideways** to linked records (customer, vendor, schedule). |
| **Examples** | **Childcare:** Today’s classroom attendance row, one student profile. **Insurance:** One renewal workflow case, one policy. **Home services:** One job, one appointment/schedule visit. |

### 4.5 Foundational rules (v1)

1. **Departments group work units;** work units hold **queue semantics**; records are **instances**.
2. **Every record should eventually declare a work unit** (and thus a department) for routing—today some records may only have implicit grouping; migration is a later step.
3. **Automation** (workflows) should target **record events** or **work unit thresholds** with visible scope, not hidden global rules.

---

## 5. Rules for Determining Departments vs Work Units

Use these **tests** when deciding how to model something in product or data.

### 5.1 Favor a **Department** when

- The area has its **own success metrics** (e.g. renewal rate vs CSAT vs utilization) reviewed on different cadences.
- **Different people** “own” the function most days (even if small org overlaps hats).
- **Configuration** could plausibly differ (status sets, workflows, templates)—see open questions for department-scoped config.
- You would put it on a **separate leadership slide** as a pillar of the business.

### 5.2 Favor a **Work Unit** when

- It is a **slice of the same mission** as its parent department—same vocabulary, same primary workflow, different **batching** (date band, territory, room, priority).
- Operators **rotate** through multiple work units in a shift **without changing role**.
- It maps naturally to a **single primary queue** or **Kanban swimlane** in UI V2.
- Removing it would feel like removing a **filter**, not eliminating a **function**.

### 5.3 Do **not** model as a work unit when

- It is only a **report cut** (e.g. “jobs this week”) with no stable ownership or routing rules—use **saved views / reports**.
- It is a **single record type** only—model the **record**, not an extra hierarchy layer.
- It is a **user preference** (sort order, columns)—keep in UI state or lightweight presets.
- It duplicates another work unit with **only cosmetic** differences—merge and use attributes/tags instead.

---

## 6. How This Connects to UI V2

UI V2 (Admin V2 workspaces) is a **presentation and density layer** on top of the same **org + hierarchy + configuration** that V1 manages.

| Workspace | Hierarchy level | Feeds from V1 / system |
|-----------|-----------------|-------------------------|
| **Company** | Organization | Org KPIs, department rollups (when data exists), org-scoped workflows, vertical/industry context from **System**. |
| **Department** | Department | Lanes = work unit rollups + signals; automation strip reads **Workflows**; actions call the same APIs as V1 operations. |
| **Work Unit** | Work Unit | Primary queue = filtered lists backed by same tables as `/admin/jobs`, schedules, renewals list, etc. |
| **Record** | Record | Entity drawer / detail pages; custom fields from **System**; statuses from **Statuses**; documents from **Documents**. |

**Clear separation**

- **V1** remains the **administrative and operational truth**: full lists, bulk actions, configuration, financial detail, and audit-friendly tables.
- **V2** is **role-optimized execution**: fewer objects on screen, stronger **state vs action** split ([Workspace system v1](./WORKSPACE_SYSTEM_V1.md)), same underlying `org_id` and entity IDs.

**Demos today**

Industry demos may use **static demo config** (`web/lib/ui-v2/demo/...`); the product direction is to **swap adapters** to real org-scoped payloads without changing shell grammar.

---

## 7. Recommended Next Implementation Order

1. **Unify V1 navigation / IA** — Re-group `AdminLayout` (or successor) into **Operations, Records, Workflows, Documents, Financials, System**; use redirects for old URLs; no visual redesign required beyond structure and labels.
2. **Build system settings hub** — Single `/admin/system` landing with cards/sections mapping to existing routes (§3); optional rename “Directory Settings” → **Custom fields**.
3. **Define hierarchy schema / data model** — Add `departments` and `work_units` (or agreed names), nullable FKs from key record types, backfill strategy; document in a migration spec.
4. **Connect config to runtime** — Wire work unit membership rules, workflow scope, and (optionally) status/field overrides to hierarchy IDs; ensure APIs enforce `org_id` + hierarchy ownership.
5. **Wire V2 adapters to real payloads** — Replace or augment demo adapters with queries scoped by org and, when ready, department/work unit; keep workspace column contract stable ([Workspace system v1](./WORKSPACE_SYSTEM_V1.md)).

---

## 8. Open Questions

1. **Opportunities** — Primary home under **Records** vs **Operations** (sales pipeline vs execution); single list with two entry points is OK if documented.
2. **Subscriptions** — Nav placement under Financials only vs also under Records (customer-centric view).
3. **Payouts** — Authoritative IA bucket: **Financials** vs **System** (compliance vs money movement).
4. **Department-scoped configuration** — Do statuses, fields, or workflows ever vary by department, or only by org + vertical?
5. **Work unit persistence** — Are work units **only** dynamic saved views, or **first-class rows** with stable IDs for audit and automation?
6. **Record → work unit mandatory?** — Hard FK vs soft tagging for legacy rows during migration.
7. **Multi-department users** — Default department, switching UX, and RBAC implications.
8. **Pricing matrix** — Product rule for global vs org-scoped rows (per admin API audit deferrals).
9. **Documents vs Financials** — Any document types that are legally “financial records only” and should stay out of general **Documents** IA.
10. **Dashboard** — Default landing vs explicit “Operations home” to avoid two competing homes.

---

*End of System Structure v1.*
