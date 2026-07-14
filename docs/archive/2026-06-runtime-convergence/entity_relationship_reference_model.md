# Entity Relationship & Reference Model — Convergence Doctrine

**Path:** `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/entity_relationship_reference_model.md`
**Status:** Doctrine (classification + usage rules). **Not** new architecture.
**Mandate:** Define how Layout Contract V1 represents **relationships, references, projections, and computed values** without flattening them into field definitions.
**Frozen — do not revisit / redesign:** [`layout_contract_v1.md`](./layout_contract_v1.md) (block kinds, RelationDescriptor, surfaces, reveal-as-readiness), the Child Model ([`child_model_convergence_audit.md`](./child_model_convergence_audit.md) §FINAL DECISION — Person / Customer Member / OCM / `inquiry_child`), the field catalog ([`field_catalog_execution_plan.md`](./field_catalog_execution_plan.md)).
**Introduces:** no new block kind, no new runtime, no new platform concept. Every construct below already exists in the frozen contract; this doc only says **which to use when**.

---

## 0. The one rule (anti-flattening doctrine)

> **A relationship is an edge, not a column.** The field catalog owns the **attributes of one record** plus **to-one reference handles**. It never absorbs another record's fields, a collection, a derived ranking, or a multi-source view. Cross-record **display** is a layout concern (`relationship_section` / `repeater` / `widget`); cross-record **derivation** is a runtime concern (`computed` / projection).

Concretely: a Child record must **not** accrue `classroom_name`, `primary_contact_email`, `household_address_line1`, `school_name`, `waitlist_rank` as flat field definitions. Each of those is reachable through a relationship, a reference, a computed value, or a runtime projection — and belongs there.

---

## 1–4. Definitions (the five-rung spectrum)

There is a spectrum from "lives here" to "assembled across records." Each rung maps to an **existing** frozen-contract primitive.

| Rung | What it is | Frozen primitive it uses | Owns truth? | Editable? |
|---|---|---|---|---|
| **Field** (Q1) | An **attribute of this one record** — a scalar that lives as a native column (system/business) or in `field_values` (custom). | Catalog field + `LayoutFieldRef` (contract §2.3) | Yes (this record) | If business/custom |
| **Reference** (Q3) | A **to-one relationship surfaced as a single resolvable handle** — "Primary contact: Jane Doe →". One related record rendered as a display value + link, not its whole field set. | Catalog **relationship field** (`field_kind = relationship`, `relation` jsonb) + `linkTarget` | No — points at another record's truth | The link target, not the value |
| **Relationship** (Q2) | The **typed edge itself** — the structural connection (this child ↔ this household; cardinality, role, direction). Rendering *several* of a related record's fields, or a *collection*. | `relationship_section` (to-one) / `repeater` (to-many), bound to a `RelationDescriptor` (contract §2, §6) | No — borrows related truth | Edited on the related record |
| **Computed value** (Q4) | A **read-only derived value**, resolved at read time by a compute key; never stored, never edited. | `compute_key` resolver / computed field (contract §5.7, §9 seam 1) | No — derived | Never |
| **Projection** | A **runtime-assembled presentation object** combining fields + references + relationships + computed across multiple records (e.g. a candidate card, an enrollment-child context). | The runtime bind/render step (contract §8); VM shape (e.g. `placement_candidate`) | No — assembled | Never (read view) |

**Reference vs Relationship (the subtle one):** a *reference* is the lightweight rendering of a **to-one** edge as one handle (value + link). A *relationship* is the edge in general — and when you want **more than one field** of the related record, or a **to-many** collection, you use a relationship block, not a reference field. A to-many edge is **never** a reference; it is a `repeater`.

**Decision tree (classify any datum X):**
```
Does X live as a column on THIS record and get edited here?           → FIELD
Else, does X point at exactly one other record?
    Show only its label + a link?                                     → REFERENCE  (relationship field + linkTarget)
    Show several of its fields / a summary block?                     → RELATIONSHIP (relationship_section)
Else, is X a set of related records?                                  → RELATIONSHIP (repeater)
Else, is X derived / aggregated / ranked, read-only?                  → COMPUTED   (compute_key)  [or, if multi-source view] PROJECTION
```

---

## 5–8. What belongs where

### Q5 — What belongs in the **field catalog** (`field_definitions`)
- **Own-record attributes** (system/business/custom) — the only things the catalog defines as values.
- **To-one reference handles** — relationship fields (`field_kind = relationship`, `relation` descriptor, optional `linkTarget`). The catalog declares *that the edge exists and how it's reached*; it does **not** copy the target's fields.
- **Computed values only as `is_computed`/`compute_key` rows** (form-hidden) when a derived value must sit inline in a field section; otherwise computed stays in runtime.
- **MUST NOT contain:** another record's fields flattened onto this entity, to-many collections, projections, or rankings. (Anti-flatten rule.)

### Q6 — What belongs in **layout configuration** (`LayoutDoc`)
- The **choice and placement** of fields, references, relationships, computed values, and widgets — by key. Layout chooses; it never stores values.
- **Relationships are represented structurally**, not as flat field lists: `relationship_section` for a to-one summary, `repeater` for a to-many collection, a reference field (with `linkTarget`) for a single handle.
- OCM-scoped child data appears **only via an enrollment-child context** block (`relationship_section`/`repeater`/`widget`) per the Child Model — never as child columns, never as raw table names.

### Q7 — What belongs in **widgets**
- **Multi-source rich blocks** a field grid can't express: lifecycle rail, needs-attention, BOS, placement/priority panel, household summary card.
- Widgets **read** computed/projected/related data and render; they **own no truth** and encode no rules (contract §5). Use a widget when the thing is neither a single field, a single relationship section, nor a simple collection.

### Q8 — What belongs in **runtime projections**
- **Cross-record presentation objects** assembled at read time: the enrollment-child context, the `placement_candidate` card VM, a household summary view. They gather fields + references + relationships + computed into one read-only shape.
- This is the **home for cross-entity aggregation and derived display**, which keeps the catalog clean and the layout declarative. Projections are **not** base entities, **not** catalog entity_types to "design a layout for," and introduce **no new runtime** — they are the existing bind/render step (contract §8).

---

## Worked examples — source of truth · layout representation · runtime representation

Each row classifies the datum and shows where it lives. "Layout" = the contract primitive a LayoutDoc uses; "Runtime" = how it resolves.

| Example | Classification | Source of truth | Layout representation | Runtime representation |
|---|---|---|---|---|
| **Primary contact** | Reference (to-one, role-filtered) | `persons` (the person) + household-person link role (`is_primary` on the household↔person join) | Reference field "Primary contact" with `linkTarget → person`, **or** a `relationship_section` (name/phone/email) on the household/child drawer | Resolve household → person where `role = primary`; render `person` label, never the join id |
| **Classroom** | Reference (to-one) | `locations` row, `location_type = room/classroom`, `parent_location_id = site` | Reference field (classroom **label**, not UUID) with `linkTarget → location`, inside the **enrollment-child context** | Resolve the enrollment/participation `location_id → locations`; label via `renderHint`. (OCM carries `location_id`/`program_room_cohort_key`; surfaced via enrollment-child context, not a child column) |
| **School / site** | Reference (to-one), often **derived** | `locations` row, `location_type = site` (the classroom's `parent_location_id`) | Reference field/`relationship_section` (site label + link) | Resolve classroom → `parent_location_id → locations` (one hop), or a projection if pre-assembled — **derived, not stored on the child** |
| **Room** | Reference (to-one) | `locations`, `location_type = room/unit`, `parent_location_id = site` | Reference field/`relationship_section` (label + link) | Same as classroom; one `location` entity, different role |
| **Parent address** | Relationship-derived (not a child field) | An address on a `locations` row (household/parent-bound) — addresses are **not** child columns | `relationship_section` (household/address) reached **through** the household relationship; never a child field grid | Resolve child → household → primary location/address; render label block |
| **Household** | Relationship (to-one) | `customers` (the household record) | `relationship_section` (household summary) **or** reference field (link) | Resolve child → `customer_member.customer_id → customers` |
| **Employee flag** | Field on `persons`; **referenced/computed** elsewhere | `persons.is_employee` (a person business field) | On the **person**: a boolean field. On a **child/waitlist** card: a referenced/computed value via household/enrollment-child context (often a widget input) | `persons.is_employee`; projected into placement priority — not a child column |
| **Program category** | Reference (to-one) / OCM-scoped | A program/`service_offerings` record, **or** the participation's `desired_program_type`/`program_room_cohort_key` (OCM) | Reference field (program **label**) or `relationship_section`, inside enrollment-child context | Resolve enrollment/OCM → program → label |
| **Enrollment status** | Computed / lifecycle | The enrollment lifecycle stage (`pipeline_stages`) or OCM `outcome_status_key` | `status` field (`renderHint: status`) on the **enrollment**; on a **child** card a computed/referenced status | Lifecycle seam (contract §9 seam 3); for the child, computed via enrollment-child context — never duplicated as a child column |
| **Waitlist ranking** | **Computed** (pure derived) | **No stored column** — produced by the placement/priority engine, ranked per cohort | Computed badge/field **inside** the waitlist queue card (the `placement_candidate` projection), or a placement **widget** | A `compute_key` resolver / runtime projection (e.g. `placementRowToCardVm`); **never** a stored field, **never** a catalog field |

---

## Illustration — "Location" is ONE entity surfaced through MANY relationships

The user's location examples (school/site, classroom, room, household address, parent address) are **not five fields and not five entities.** They are **one `location` entity** (per the entity model: `location_type` + `parent_location_id`, two-level hierarchy) reached through **different named relationships** from different records:

- `enrollment.classroom_location_id → location(room)` — classroom (reference)
- `room.parent_location_id → location(site)` — school/site (derived reference)
- `household.address_location_id → location(address)` — household address (relationship)
- parent address → the parent person's household/location (relationship-derived)

**Doctrine consequence:** do **not** mint `classroom`, `school`, `room`, `household_address`, `parent_address` as separate field definitions. Mint **relationships/references** to `location`, each with a role, and let derivation (site = classroom's parent) be computed. One entity, many edges — the catalog stays small, the layout stays expressive.

---

## Convergence guardrails (how this is enforced)

These hook directly into the [`convergence_review_rubric.md`](./convergence_review_rubric.md):

1. **Catalog growth is a smell.** A new field on entity X whose value actually lives on entity Y is a flattening violation → Gate B **FAIL/CONCERN**. Use a reference/relationship instead.
2. **No related-record fields in the catalog.** `*_name`, `*_email`, `*_label` columns that mirror a related record indicate a missing relationship.
3. **To-many is never a field.** Collections are `repeater` blocks, full stop (contract §6.3).
4. **Derived/ranked is never a stored field.** Waitlist rank, readiness, counts → `compute_key`/projection (contract §5.7, §9).
5. **Projections are read views, not entities.** A projection (e.g. `placement_candidate`) must be documented as a runtime presentation shape, never promoted to a product entity_type or given its own durable layout surface (ties to the Child Model "no separate inquiry-child product entity" line).
6. **References render labels, never ids/table names.** A reference shows the target's display value + link; exposing a UUID or raw table name is a Gate A/C finding.

---

## Summary — the model all future entity layouts follow

```
FIELD        attribute of THIS record            → field_definitions + LayoutFieldRef
REFERENCE    to-one edge as one handle           → relationship field (+ linkTarget)
RELATIONSHIP edge: to-one summary / to-many set  → relationship_section / repeater
COMPUTED     derived, read-only, by key          → compute_key resolver
PROJECTION   multi-source read view              → runtime VM (bind/render step)
WIDGET       rich multi-source block             → widget (closed registry)
```

Pick the **lowest rung that fits**: a value on this record is a field; a pointer is a reference; a borrowed field-set or collection is a relationship; a derived value is computed; a multi-source view is a projection or widget. Relationship data never collapses into field definitions, and the field catalog stays the catalog of *this entity's* truth — nothing more.

---

*Doctrine only. Uses existing Layout Contract V1 primitives; redesigns nothing. Apply to every future entity layout; enforced via the convergence review gates.*
