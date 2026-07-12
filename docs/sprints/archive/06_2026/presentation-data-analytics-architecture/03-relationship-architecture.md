# Relationship Architecture

**Path:** `docs/sprints/archive/06_2026/presentation-data-analytics-architecture/03-relationship-architecture.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 3 — Relationship architecture

---

## 1. Why relationships are a first-class source kind

Most useful information about a record lives on **related** records. An enrollment's email is really the *primary contact's* email; its room is really the *child's current room*. If the Experience Builder could only bind fields on the subject entity, every surface would be impoverished. Relationships let a reference **traverse the business** — *Enrollment → Primary Contact → Email* — without the administrator ever seeing a foreign key.

## 2. Relationships are declared, named, and typed

Relationships are **not** arbitrary joins. They are platform/entity-level declarations with:

| Property | Meaning | Example |
|---|---|---|
| **Role name** (business) | What the related entity *is* to the subject | "Primary Contact", "Children", "Assigned Employee", "Location" |
| **Target entity** | What kind of record it points to | Person, Child, Employee, Location |
| **Cardinality** | to-one or to-many | Primary Contact (to-one), Children (to-many) |
| **Resolution rule** | How the role is computed when ambiguous | "the customer_person flagged primary" |
| **Direction** | Forward/inverse traversal | Enrollment→Contacts vs Contact→Enrollments |

The **role name hides the resolution.** "Primary Contact" is not the `persons` table — it is *the person resolved as primary among this enrollment's `customer_persons`*. The administrator picks the business role; the model owns the resolution.

## 3. Traversal grammar

A relationship reference is a **path** of hops ending in a leaf:

```
Subject ─(relationship)→ Entity ─(relationship)→ Entity ─(field|collection)→ Leaf
```

| Path | Hops | Result type |
|---|---|---|
| Enrollment → Primary Contact → Email | rel(to-one) → field | `Text` |
| Enrollment → Assigned Employee → Phone | rel(to-one) → field | `Text` |
| Enrollment → Location → Name | rel(to-one) → field | `Text` |
| Enrollment → Children | rel(to-many) | `Collection<Child>` |
| Enrollment → Children → Current Room | rel(to-many) → field (per item) | `Collection<Text>` or scalar (needs selection rule, §5) |
| Enrollment → Primary Contact → Children | rel(to-one) → rel(to-many) | `Collection<Child>` |

**Depth is bounded** (platform-set max hops, e.g., 3) to keep resolution predictable and prevent pathological traversals. The Browser only offers hops that exist as declared relationships.

## 4. To-one traversal

A to-one hop yields a single related **Entity**, from which you select a field (scalar), another relationship, or a collection. This is the common case (*Primary Contact → Email*) and resolves to a clean scalar. The intermediate Entity can itself be bound (e.g., a Relationship Card renderer that accepts `Entity`).

## 5. To-many traversal and the selection rule

A to-many hop yields a **Collection**. Two presentation intents:

| Intent | Result | Renderer |
|---|---|---|
| **Show the set** | `Collection<Child>` | Collection renderer (Table/List/Relationship Card) with per-item slot template |
| **Show one scalar from the set** | scalar via a **selection rule** | scalar renderer |

When the admin traverses a to-many relationship to a scalar (*Children → Current Room*), the model **requires a selection rule**:

| Selection rule | Meaning | Example result |
|---|---|---|
| **First / Primary** | The first (or role-primary) item | the eldest child's room |
| **Each (list)** | One value per item, rendered as a small collection | "Sunflower, Tulip" |
| **Aggregate** | A summary across items (count, any, all) | "2 children", "any unpaid" |

The selection rule is part of the Data Reference and is chosen in the Browser (see mockup `03-primary-contact-selection`). Without it, a to-many→scalar reference is invalid.

## 6. Role resolution and ambiguity

Some roles are **resolved** (computed), not stored:

- *Primary Contact* — resolved from `customer_persons` primary flag; falls back per platform rule if none flagged.
- *Assigned Employee* — resolved from current assignment state (a State-adjacent resolution).
- *Current Room* — resolved from the child's active room assignment (time-bounded).

The model declares the resolution per role so it is **consistent everywhere** the role is used. The Experience Builder shows the business role and, on demand, a plain-language description of how it resolves ("the parent marked primary"). Admins never write the resolution.

## 7. Org scoping and authority through traversal

- Every hop **stays within `org_id`** (and site/department scoping where the relationship carries it). A traversal can never reach another tenant's records.
- Traversed values are **previews**, like all presentation data — authoritative related-record detail comes from that entity's GET / record responder, not from the binding.
- Permission-gated relationships (e.g., an employee a viewer can't see) resolve to a governed empty/redacted state, not an error.

## 8. Relationships in conditions

Because conditions and bindings share the same references ([`06-condition-builder.md`](./06-condition-builder.md)), relationship references work in conditions too:

- *Visible When* **Primary Contact → Email** *is empty* (prompt to collect it)
- *Highlighted When* **Children → (aggregate) any** *is unenrolled*
- *Badge When* **Assigned Employee** *is the Current User* (System kind on the right)

## 9. What relationship architecture must not do

- Must not expose foreign keys, join tables, or `customer_persons` mechanics to the operator.
- Must not allow arbitrary ad-hoc joins — only **declared** relationships/roles.
- Must not traverse unbounded depth.
- Must not let a to-many→scalar reference exist without a selection rule.
- Must not become a query language — it is a **named-path picker**, not SQL.

## 10. Cross-references

| Concern | Doc |
|---|---|
| Source kinds (Relationship, Collection) | [`02-data-taxonomy.md`](./02-data-taxonomy.md) §2–3 |
| Collection renderers & per-item templates | [`05-renderer-contracts.md`](./05-renderer-contracts.md) |
| Browsing relationships | [`07-data-source-browser.md`](./07-data-source-browser.md) |
| Identity model (persons / customer_persons) | `docs/platform/core/entity-model.md` |
