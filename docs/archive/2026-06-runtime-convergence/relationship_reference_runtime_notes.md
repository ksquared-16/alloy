# Relationship & Reference Runtime Notes (Phase 1)

**Status:** Active — Runtime Convergence Phase 1 foundation  
**Scope:** Opportunity drawer only; proof path + binding classification; no live cutover  
**Authority:** [layout_contract_v1.md](./layout_contract_v1.md), [runtime_convergence_execution_plan.md](./runtime_convergence_execution_plan.md)

---

## 1. Purpose

Phase 1 extends the Phase 0 layout runtime so an opportunity drawer **LayoutDoc** can express operational relationships without flattening related data into base child/opportunity fields and without creating a second presentation system.

Production rendering still uses existing drawer paths. Phase 1 adds:

- **Binding classification** — how each layout item resolves its value
- **Relation registry** — declarative descriptors for opportunity drawer relations
- **Proof layout** — `buildOpportunityDrawerRelationshipProofLayout()` for tests and future preview

Feature flags (`LAYOUT_RUNTIME_ENABLED`, `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED`) remain **off**. No operator-visible behavior changes.

---

## 2. Single runtime path (no duplicate system)

Layout Contract V1 defines five block kinds: `section`, `relationship_section`, `repeater`, `widget`, `queue`.

Sprint 1 **LayoutItem** kinds remain unchanged: `field`, `field_group`, `related_list`, `widget_placeholder`.

Phase 1 maps item kind + **binding metadata** onto contract block semantics:

| LayoutItem kind | Typical binding class | Contract block kind |
|---|---|---|
| `field` (anchor entity) | `base_field` | `section` |
| `field` (related entity) | `relationship_field` or `reference_field` | `relationship_section` |
| `field` (lifecycle compute) | `computed_projection` | `section` |
| `related_list` | `repeater` | `repeater` |
| `widget_placeholder` | `widget` | `widget` |

Binding metadata lives at `item.metadata.binding` (`LAYOUT_BINDING_METADATA_KEY = "binding"`). When absent, `classifyLayoutItemBinding()` infers from item kind and namespaced `refKey` (e.g. `person.*`, `child_inquiry.*`).

Runtime plan builder: `buildLayoutRuntimePlan()` → `bindings[]`, `bindingClassCounts`.

---

## 3. How relationship/reference values are represented

### 3.1 Base fields

Fields on the anchor record (`opportunities.*`) with binding class `base_field`. Rendered in contract `section` blocks.

### 3.2 Relationship fields

Fields resolved through a **single-hop Relation** (§6.1) to a related record — e.g. primary contact Person fields.

- **Layout:** `field` items with `metadata.binding.bindingClass = "relationship_field"`
- **Relation key:** stable authoring id (e.g. `primary_contact`), not a DB table name
- **Descriptor:** `OPPORTUNITY_DRAWER_RELATIONS` in `web/lib/layout/runtime/opportunityRelationRegistry.ts`
- **Contract block:** `relationship_section`

Example refKeys: `person.primary_contact_name`, `person.is_employee`.

### 3.3 Reference fields

Location and address reads that require **role disambiguation** — not a generic “location” column.

- **Layout:** `field` items with `bindingClass = "reference_field"` and `locationRole`
- **Contract block:** `relationship_section` (one related location record per role)

### 3.4 Computed / projection values

Lifecycle-owned values not stored as base opportunity fields (§9.1 seam 1).

- **Layout:** `field` items with `computeKey` (e.g. `enrollment.program_category`)
- **Binding class:** `computed_projection`
- Resolver ownership stays in lifecycle/enrollment services — layout only declares the key

### 3.5 Widgets

Existing `widget_placeholder` items; binding class `widget`. No change from Phase 0.

### 3.6 Repeaters

`related_list` items for to-many collections; binding class `repeater`; contract block `repeater`.

Enrollment children use `relationKey: enrollment_children` with `enrollmentChildContext: true`.

---

## 4. Location disambiguation by role/context

**Rule:** One generic “location” field is forbidden. Each displayed location MUST declare a **LocationReferenceRole**:

| Role | Meaning | Typical source |
|---|---|---|
| `site` | School / site | Enrollment placement → site location |
| `classroom` | Classroom | Placement / classroom assignment |
| `room` | Room within classroom | Room assignment |
| `household_address` | Customer/household address | `customer_locations` link |
| `person_address` | Contact/person address | `person_locations` link |

Relation keys in the opportunity registry: `enrollment_site_location`, `enrollment_classroom_location`, `enrollment_room_location`, `household_address`, `person_address`.

Each maps to `targetEntity: locations` with a distinct `locationRole`. Runtime resolution (future phase) walks the declared relation path; Phase 1 only freezes the layout representation.

---

## 5. Primary contact

Primary contact is a **Person relationship**, not a field on child identity.

- **Relation:** `primary_contact` → `persons`, cardinality `one`, FK `opportunities.primary_person_id`
- **Layout fields:** namespaced under `person.*` inside a relationship section
- **Employee flag:** `person.is_employee` is bound through the same relation — sourced from Person/guardian/associate, **not** from child or inquiry-child records

Secondary contact follows the same pattern via `secondary_contact` / `secondary_person_id`.

---

## 6. `is_employee` sourcing

`is_employee` belongs on **Person** (guardian, associate, staff contact). It MUST NOT appear as a base field on child identity or as a duplicated inquiry-child column outside enrollment-child context.

In the proof layout, `person.is_employee` is a `relationship_field` on relation `primary_contact`. Placement/billing configuration that depends on employee status resolves from Person at hydration time (Phase 3+).

---

## 7. Program category sourcing

Program category is **placement/program/location configuration**, not a duplicated child identity field.

- **Binding:** `computed_projection` with `computeKey: enrollment.program_category`
- **Source entity segment:** `enrollment` (lifecycle projection namespace)
- **Not:** a flat `child.*` or standalone inquiry-child product entity field

Related compute keys: `enrollment.placement_priority`, `enrollment.readiness_summary` (registry constants only in Phase 1).

---

## 8. Enrollment-child / OCM fields

Inquiry-child / OCM-shaped fields (`child_inquiry.*`) surface **only** inside the enrollment children **repeater**, scoped by `enrollmentChildContext: true` on relation `enrollment_children`.

They MUST NOT be promoted to standalone drawer sections as if `child_inquiry` were a first-class product entity. Operator-facing labels use catalog field labels — raw table names (OCM) are never shown.

---

## 9. Proof path

```ts
import { buildOpportunityDrawerRelationshipProofLayout, buildLayoutRuntimePlan } from "@/lib/layout/runtime";

const doc = buildOpportunityDrawerRelationshipProofLayout();
const plan = buildLayoutRuntimePlan(doc);
// plan.bindings — per-item binding classification
// plan.bindingClassCounts — aggregate by class
```

Tests: `web/tests/layout/relationshipReferenceRuntimePlan.test.ts`.

Extends `buildLeadDrawerDefaultDoc()` so the proof includes existing widgets, field groups, and base fields alongside relationship/reference items — demonstrating Layout Contract V1 expressiveness within one LayoutDoc.

---

## 10. Out of scope until Person/Child drawer convergence

| Area | Phase 1 status |
|---|---|
| Person drawer layout runtime | Not started (Phase 2+) |
| Child drawer layout runtime | Not started (Phase 2+) |
| Live opportunity drawer cutover | Phase 3+; flags off |
| Location runtime / new location system | Explicitly excluded |
| Standalone inquiry-child entity drawer | Explicitly excluded |
| Hydration/resolvers for compute keys | Lifecycle seam; keys declared only |
| Admin layout editor UX for binding metadata | Future |
| Queue relationship columns | Phase 4+ |
| Navigation / Admin cutover / seed data | Unchanged |

---

## 11. Files (Phase 1)

| File | Role |
|---|---|
| `web/lib/layout/runtime/valueBinding.ts` | Binding types, location roles, relation descriptor shape |
| `web/lib/layout/runtime/classifyLayoutItemBinding.ts` | Item → binding plan |
| `web/lib/layout/runtime/opportunityRelationRegistry.ts` | Opportunity drawer relation descriptors |
| `web/lib/layout/runtime/opportunityDrawerRelationshipProofLayout.ts` | Proof LayoutDoc builder |
| `web/lib/layout/runtime/layoutRuntimePlan.ts` | Extended plan with `bindings` |
| `web/tests/layout/relationshipReferenceRuntimePlan.test.ts` | Acceptance tests |
