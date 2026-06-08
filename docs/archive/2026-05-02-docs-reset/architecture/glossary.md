# Glossary — canonical terms

Short definitions aligned with [workspace-work-unit-scope-doctrine](./workspace-work-unit-scope-doctrine.md), [record-rendering-system-spec](./record-rendering-system-spec.md), [relationship-and-identity-doctrine](./relationship-and-identity-doctrine.md), and [overview-layout-doctrine](./overview-layout-doctrine.md). **Decided** semantics below; deferred nuance lives in [deferred-decisions](./deferred-decisions.md).

| Term | Definition |
|------|-------------|
| **Org** | Tenant boundary: all operational data is scoped to an organization (company). Isolation, billing, and org-wide config attach here. |
| **Location** | A physical or geographic site (service address, facility, unit) used in operations. **Not** a functional department. May link to a customer or vendor context. |
| **Department** | A **functional lane of work** inside an org (coordination, throughput, ownership of a slice of operations). Distinct from **cost center / GL “department”** labels. |
| **Work unit** | Configurable **execution surface** within a department (and ultimately within **scope**): where day-to-day work is done and **queues** are projected. Not a hardcoded vertical screen. |
| **Workspace** | A **UI shell** at a given altitude (org, department, work unit, record) that composes **work blocks** under shared layout rules. Not the same thing as “work unit” (data); a workspace *renders* a scope. |
| **Record** | Authoritative **entity instance** for inspection and editing: truth-bearing state, history, and structured detail. Contrasts with queue rows and lightweight previews. |
| **Queue** | A **filtered/sorted projection** of work items within a work unit. **Queue preview ≠ record truth**; triage uses summaries; decisions use resolver-backed records. |
| **Role** | Coarse **membership label** for a user relative to an org (e.g. admin, ops). Part of access; **not sufficient alone** for full doctrine (see scope, capability). |
| **Scope** | Where a user or surface **may operate** within the org (e.g. org-wide vs subset of locations/departments/work units). **Decided** as a target composition with role + capability; **storage** is still incremental (see gap audit). |
| **Capability** | Fine-grained **permission** to perform an operation (distinct from role). Doctrine expects capabilities to combine with role and scope; **full model deferred**. |
| **Relationship group** | A **semantic bundle** in a record payload (e.g. people-in-role summaries): resolver-built, not a direct 1:1 render of one SQL join. |
| **Overview** | **Structured summary surface** for a record: header, summary grid, optional bands — driven by config and fixed templates, not an unbounded field dump. |
| **Resolver** | Backend layer that **composes** a record (or surface-specific view): system fields, custom fields, relationship-resolved fields, computed values, groups, financial context, actions, signals — with explicit **edit ownership**. |
| **Custom field** | Org-defined field via **`field_definitions`** / **`field_values`** (or successor), as opposed to native columns on entity tables. |
| **Option set** | Controlled vocabulary for select-like fields: keyed options (often org- or vertical-scoped) used by field config and public/booking flows — **implementation** may live in `field_definitions.config`, dedicated tables, or seeds; **concept** is industry-agnostic. |
| **Financial context** | Resolver-supplied **money-related** facts (balances, payment state, quote/invoice summaries) surfaced **where materially relevant**, not duplicated identically on every screen. |
| **Cost center / accounting department code** | **GL or billing** classification. **Must not** be overloaded into **functional department** in product language or schema intent. |
| **Person** | Canonical **human identity** row. Long-term anchor for people; **`contacts`** remain legacy/compatibility (see relationship doctrine). |
| **Customer** | Account / household / business **container** (customer record) that people and locations attach to; not interchangeable with “person.” |
| **Member** | Legacy pattern: **customer_member** (and links) as household-style membership; migration direction is **person-backed** roles via **`customer_persons`** where possible. Still relevant until fully migrated. |
| **Action** | Executable **system-backed** operation (API/workflow/event), exposable on **queue, drawer, or full record** per configuration — same definition, different placement. |
| **Signal** | **Attention item**: exception, SLA risk, or “needs eyes now” — distinct from static fields; may feed overview or workspace blocks. |
| **KPI** | **Quantitative rollup** for a scope (org/dept/work unit): measurement strip, not the detailed record. |
| **Work block** | Reusable **workspace UI unit** (e.g. signals, KPIs, queues, work steps, context, actions) composed into a shell at a given level — industry-agnostic building block. |
| **Operational context** | Where the user is working in the **workspace stack**: org vs department vs work unit vs record, plus **lane** (e.g. throughput vs exception) and optional **exception focus**. Drives **which queues and actions** apply; with the visual system, also drives **approved chrome** for surrounding shells. |
| **Visual context** | Resolved **semantic** key (registered) that maps to **Alloy palette roles** (families, emphasis) for shells and record chrome — **not** department branding by display name. Derived from **operational visual context** hints via a **context resolver** (priority: explicit key → lane → work unit → department defaults → neutral). |
| **Exception work unit** | Work unit specialized for **exception / attention** work (see workspace doctrine). **Needs Attention** is the canonical first-class example. |
| **Exception type** | A **lane** or **filter key** within an exception work unit (e.g. overdue vs payment vs readiness) — orthogonal to entity type; used to **project** a subset of records into the queue without forking records. |

**See also:** [deferred-decisions.md](./deferred-decisions.md) · [implementation-gap-audit.md](./implementation-gap-audit.md) · [Workspace V2 (implementation)](../implementation/workspace-v2/README.md)
