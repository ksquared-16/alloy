# Record Rendering System (RRS) — doctrine

## Purpose

Define how **records** are **resolved, composed, and presented** in Alloy. This is **platform doctrine**, not a commitment to any single UI framework or screen.

## Core rule

**Records resolve through a backend resolver layer** (one or more cohesive server/API services), not through ad hoc frontend table joins or per-screen Supabase query soup.

The UI consumes **resolved record payloads**; it does not re-derive business meaning by stitching raw tables.

## Payload composition (conceptual)

A resolved record payload **may** include, as first-class sections or typed slots:

| Category | Meaning |
|----------|--------|
| **Base / system fields** | Columns on the primary entity table(s), normalized IDs, status keys, etc. |
| **Custom fields** | Org-defined definitions and values (`field_definitions` / `field_values` pattern or successor). |
| **Relationship-resolved fields** | Labels and shallow stubs from FK targets (e.g. customer name, location summary) produced by the resolver, not guessed in the client. |
| **Computed fields** | Derived values (rollups, display prices, formatted labels) computed in one place for consistency across surfaces. |
| **Relationship groups** | **Semantic** groupings: “people in roles relevant to this job,” “related sites,” “payer vs occupant,” etc. — **not** a 1:1 mirror of a single SQL join. |
| **Financial context** | Balances, payment state, quote/invoice summaries — included **where materially relevant** to the record’s purpose at that moment, not duplicated identically on every surface. |
| **Actions** | Action **definitions** available for this record in context (see workspace doctrine for where they surface: queue, drawer, full record). |
| **Activity / signals** | Recent events, workflow signals, SLA hints — distinct from static field data. |

## Display rules

1. **Interwoven presentation** — The UI **may** display fields originating from multiple entities in one overview or form region. The resolver declares **provenance** (source entity, field key, editability) so the client does not blur ownership.

2. **Explicit edit ownership** — For every editable value, the payload (or parallel metadata) must state **what entity** is mutated on save. Multi-entity “forms” are implemented via explicit writes, not silent cross-table patches.

3. **Relationship groups are semantic** — Group names and membership rules are **domain concepts** (configured + resolved), not “whatever this join returns.” Multiple tables and edges may feed one group.

4. **Financial context is contextual** — Surface financial blocks when decisions or inspection require them; avoid mandatory giant finance panels on every record type.

## Relationship to field registry

Today the repo has **org-scoped field definitions**, **sections**, and **visibility flags** (admin drawer, table, public booking). That system is **compatible** with RRS: definitions govern *which* custom fields exist; the resolver governs *how* they merge with system columns, relationships, and computed data for a given **surface** (overview vs drawer vs full record).

RRS may introduce **additional layout or surface-specific config** (see [overview-layout-doctrine.md](./overview-layout-doctrine.md)) without replacing the need for a field registry for custom data.

## Non-goals (for this doctrine)

- Prescribing a specific GraphQL/REST shape or caching strategy.
- Mandating that every surface loads the full payload (progressive loading is allowed if semantics stay consistent).
- Locking UI V1 or Admin V2 component names as the implementation of RRS.

**Terms:** [glossary.md](./glossary.md) · **Deferrals:** [deferred-decisions.md](./deferred-decisions.md)
