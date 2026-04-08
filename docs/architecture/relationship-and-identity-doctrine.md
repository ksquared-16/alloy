# Relationship & identity — doctrine

## Identity

**`persons` is canonical** for human identity going forward.

- **Contacts are a sunset path** — They remain in the schema and APIs for compatibility and migration, but **new product design must not treat `contacts` as the first-class future model** for people.
- **`contacts.person_id`** (where present) links legacy rows to canonical persons during transition.

## Layered relationships (do not unify into one mega-table)

Alloy intentionally uses **multiple relationship mechanisms**, each suited to its job:

| Layer | Purpose |
|-------|--------|
| **`person_relationships`** | Person ↔ person edges (guardian, colleague, household member, etc.), typed by `relationship_type`. |
| **`customer_persons`** | Person ↔ customer/account **roles** (`role_type`, primary flags, dates). Govern role **vocabulary** via org/industry-scoped role type tables where seeded. |
| **Direct entity FKs** | Operational truth on the graph: e.g. `job.customer_id`, `job.location_id`, `schedule.job_id`, `opportunity` links, etc. |
| **Resolver relationship groups** | **UI-facing semantic bundles** built by the record resolver — not a direct “render this join” mapping. |

**Principle:** We are **not** forcing one relationship table to express every kind of edge. Cross-cutting **presentation** is unified in the **resolver + config**, not by overloading a single storage pattern.

## Relationship groups vs storage

- **Storage** can be normalized across several tables (above).
- **Relationship groups** in the payload are **named, ordered, and filtered** for a given record type and context (overview vs full record).
- Groups **must not** assume a single underlying table shape.

## Vendors and providers

Vendor ↔ person linkage today may still flow through **contact-centric** tables (e.g. `vendor_contacts`, `vendors.primary_contact_id`). Doctrine direction matches [IDENTITY_MODEL_REFACTOR_AUDIT.md](../audits/IDENTITY_MODEL_REFACTOR_AUDIT.md): **evolve toward person-backed links** without blocking current operations. No requirement to model vendors as persons.

## Governance

- **Relationship types** for `person_relationships` should be **constrained and documented** per org/industry via settings tables (the schema already supports org/industry-scoped type metadata patterns).
- **Customer–person role types** similarly use seeded/controlled keys (e.g. primary contact) to avoid unbounded free text in critical flows.

## Explicit non-goals

- Declaring `contacts` removed from the database (migration is incremental).
- Mandating immediate replacement of every `primary_contact_id` FK in one release.

**Terms:** [glossary.md](./glossary.md) · **Vendor/person deferrals:** [deferred-decisions.md](./deferred-decisions.md)
