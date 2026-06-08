# Child Namespace Decision (final, canonical)

**Path:** `docs/platform_convergence/child_namespace_decision.md`
**Status:** Doctrine — the **single canonical namespace decision** for child concepts. Source of truth.
**Does not reopen:** [`child_model_convergence_audit.md`](./child_model_convergence_audit.md) §FINAL DECISION (frozen) or [`child_namespace_addendum.md`](./child_namespace_addendum.md) (approved). This document **ratifies and extends** them per layer and for future modules.
**Reconciliation:** This is the **one** canonical decision doc. It absorbs the FC-1 branch's ratification doc — the FC-1 **ND-1…ND-8** decisions are folded in as §9; there is no separate FC-1 decision file. (Resolves the FC-1 review's documentation-governance concern.)
**Scope:** Naming only. No code, no migrations, no implementation.

---

## 0. Foundations (carried forward, not re-decided)

| Meaning | Canonical name | Nature |
|---|---|---|
| **Operator-facing label** | **Child** (plural "Children" / "Enrollment children") | user-facing |
| **Durable model / entity** | **`customer_member`** | internal — durable child/household-member record (optionally `persons`-linked) |
| **Enrollment participation** | **OCM** (`opportunity_customer_members`) | internal — child's participation in an opportunity |
| **Technical / config projection** | **`inquiry_child`** | internal — field-catalog `entity_type` projection over OCM |
| **Layout context pattern** | **enrollment-child context** | internal — relationship_section / repeater / widget through which OCM child fields appear |

These five are the only sanctioned child names. Everything else is drift.

### Canonical refKey namespaces (frozen)

The layout/runtime refKey namespace set is exactly four (enforced in `web/lib/layout/layoutRefKeyAliases.ts`):

- **`child.*`** — durable child attributes (`customer_member`, optionally `person`)
- **`inquiry_child.*`** — OCM participation fields (enrollment-child context)
- **`person.*`** — person / contact fields
- **`opportunity.*`** — case / enrollment-record fields

**Deprecated namespace:** **`child_inquiry.*`** — legacy; alias-on-read only, rejected on write.

### ⚠️ `person` ≠ `child` (the bridge is temporary)

Durable `child.*` fields are **interim-bridged to `person` registry rows** only because `customer_member` is **not yet** a `field_definitions` allowlist `entity_type`. This bridge is a temporary catalog convenience — it does **NOT** mean person == child. Durable child truth remains `customer_member`. The bridge must be removed once `customer_member` (or a person child-profile) becomes the durable registry `entity_type`; the "NOT person == child" guard stays in code and docs until then.

---

## 1. Canonical namespace **per layer** (Q1)

| Layer | Operator sees | Canonical identifiers | Notes |
|---|---|---|---|
| **Layout Configuration** | **Child** | refKeys `child.*` (durable) and `inquiry_child.*` (OCM, **only inside an enrollment-child context** block) | No standalone "Inquiry Child" entity LayoutDoc. Never `child_inquiry.*`. Raw table names never shown. |
| **Field Catalog** | **Child** | `entity_type = inquiry_child` is canonical for **OCM-scoped** child fields (registry + native OCM manifest). Durable child attributes are bound to the **durable record** (`customer_member` / `persons`). | A durable-child-profile registry `entity_type` is a **future** grain decision (FC-0.5) — not minted now, and **never** as `child_inquiry`. |
| **Lifecycle** | **Child** | Palette/operator concept = **Child**; field **bindings/paths** resolve to `inquiry_child` registry + OCM. `lifecycleEntityFromFieldDefinitionEntityType` maps `inquiry_child` → Child. | Lifecycle expresses requirements/readiness against the **Child** concept; storage is OCM via `inquiry_child`. |
| **Forms** | **Child** (applicant/operator copy) | Form schema references the same canonical refKeys (`child.*` / `inquiry_child.*`); per-version `schema_json` selects which fields appear. | Applicant-facing forms say "Child" / the child's name. No `child_inquiry.*`, no table names, no opaque ids. |
| **Runtime** | **Child** | Binding `sourceEntity = "inquiry_child"` for OCM fields; durable child via the `child` relation (customer_member). Binding classes: `base_field` / `relationship_field` / `reference_field` / `computed_projection` / `widget` / `repeater`. | Runtime resolves OCM via enrollment-child relation/repeater, **guards opaque ids**, never surfaces table names or `inquiry_child`/`child_inquiry` in rendered output. |

**One rule across all layers:** show **Child**; store durable identity on **`customer_member`**; store enrollment participation on **OCM**; name OCM-scoped config/refKeys **`inquiry_child.*`** inside an **enrollment-child context**; durable child fields are **`child.*`**.

---

## 2. Operator-facing names (Q2)

Exactly one family of words is user-facing:

- **Child**, **Children**, **Enrollment children** (and the child's actual name).

That label is used **regardless** of which internal model backs the data (customer_member, OCM, or inquiry_child). It is uniform across Layout, Lifecycle, Forms, Settings, queues, and drawers.

---

## 3. Implementation-detail names (Q3)

Internal only — **never** rendered as operator copy:

- `customer_member` (durable record)
- `opportunity_customer_members` / **OCM** (participation table)
- `inquiry_child` (catalog `entity_type`, refKey namespace, `sourceEntity`)
- `enrollment-child context` (architecture term)
- relation keys, link tables, binding classes, opaque ids/FKs

Per the Child Model decision, **raw table names are never exposed**; `inquiry_child` is a config/technical identifier, not a product entity. (Runtime tests already assert rendered output contains neither `child_inquiry` nor `inquiry_child`.)

---

## 4. Deprecated names (Q4)

| Name | Where it lives | Status | Replacement | Bridge |
|---|---|---|---|---|
| **`child_inquiry.*`** (layout refKey namespace) | LayoutDocs, proof fixtures, defaults | **Deprecated** | `child.*` (durable) + `inquiry_child.*` (OCM) | alias-on-read; deprecate-on-write |
| **`sourceEntity: "child_inquiry"`** | runtime binding metadata | **Deprecated** | `sourceEntity: "inquiry_child"` | alias-on-read |
| **`child_inquiry` curated group / `entityKey`** ("Children Inquiry") | `fieldCatalog.ts`, entity-layouts field-catalog route, builder | **Deprecated (legacy, pre-existing)** | `inquiry_child` catalog group | bridged until the field-catalog convergence step renames it (`field_catalog_execution_plan.md`) |
| **Raw `opportunity_customer_members` / UUIDs in UX** | any operator surface | **Forbidden** | labels/handles via enrollment-child context | opaque-id guard at runtime |

`inquiry_child` (catalog entity_type) and "enrollment-child context" (pattern) are **not** deprecated — they are canonical internal names. Only the `child_inquiry` **namespace/group** is deprecated.

---

## 5. What new layout docs must use (Q5)

- **Durable child fields → `child.*`** (e.g. `child.name`, `child.date_of_birth`).
- **OCM participation fields → `inquiry_child.*`** (e.g. `inquiry_child.desired_start_date`, `inquiry_child.program_room_cohort_key`, `inquiry_child.outcome_status_key`) — **only** inside an **enrollment-child context** block (`relationship_section` / `repeater` / `widget`).
- **Operator labels → "Child" / "Enrollment children".**
- **Never** mint a new `child_inquiry.*` refKey, a standalone "Inquiry Child" entity LayoutDoc, or expose a raw table name / opaque id.
- Convergence review **fails-or-flags** any new `child_inquiry.*` (deprecate-on-write).

---

## 6. Future modules — attendance, billing, scheduling, enrollment (Q6)

**Governing principle:** `inquiry_child` is the **enrollment/inquiry** participation projection (over OCM) — it is **not** a general "child" namespace. Other modules are different lifecycle contexts with their **own** participation records; they must not overload `inquiry_child`.

| Module | Durable child reference | Module participation (its own context) | Operator label | Anti-pattern (forbidden) |
|---|---|---|---|---|
| **Enrollment** | `child.*` / `customer_member` | **`inquiry_child` over OCM** (existing) | Child | new `child_inquiry.*` |
| **Attendance** | `child.*` / `customer_member` | the module's own attendance/participation record, surfaced via an **attendance-child context** (relationship_section / repeater / widget), with its own `{entity_type}.*` refKeys | Child | reusing `inquiry_child.*` for attendance fields |
| **Billing / Tuition** | `child.*` / `customer_member` | the module's own billing/charge record, via a **billing-child context** | Child | overloading `inquiry_child`; raw table names |
| **Scheduling** | `child.*` / `customer_member` | the module's own schedule/assignment record, via a **scheduling-child context** | Child | a parallel `*_child` namespace that drifts |

Rules every future module follows (same as enrollment):
1. **Reference the durable child** as `child.*` (backed by `customer_member`). Operators always see **Child**.
2. **Module-specific data lives on the module's own participation entity** (its analogue of OCM) and is surfaced through a **module-child context** block — never flattened onto the child, never exposing the table name.
3. **Name module refKeys `{module_entity_type}.{field_key}`** aligned to that module's registry `entity_type`. Do **not** extend `inquiry_child` beyond enrollment, and do **not** invent ad-hoc `*_child` refKey namespaces (that is the `child_inquiry` mistake repeated).
4. Apply the [relationship/reference doctrine](./entity_relationship_reference_model.md): child = a **reference/relationship**; module participation = a **relationship/repeater/computed**; nothing flattened into child fields.

This keeps `inquiry_child` bounded to enrollment and prevents any module from turning a child-context projection into a god-namespace.

---

## 7. Migration guidance

This is a **naming convention**, not a migration event.

- **Alias-on-read.** `child_inquiry.* ≡ inquiry_child.*` is normalized at the refKey-parse / classification layer (already implemented: `classifyLayoutItemBinding` treats `child`, `inquiry_child`, and legacy `child_inquiry` as cross-entity fields). Old keys keep resolving.
- **Deprecate-on-write.** New LayoutDocs, defaults, fixtures, forms, and module layouts use the §5 canonical refKeys. Convergence review enforces this.
- **No data migration now.** No renaming of stored `field_definitions` keys, no schema change, no reseed. The `field_catalog_execution_plan.md` task (`child_inquiry` curated group → `inquiry_child`) remains the eventual catalog cleanup; until it lands, the alias bridges.
- **Curated builder group** (`fieldCatalog.ts` "Children Inquiry") stays behind the alias until that field-catalog step; new entries use canonical names.
- **Settings → Fields** continues to expose the `inquiry_child` `entity_type` (config surface); its operator label should read **Child** where shown (terminology cleanup is field-catalog scope, not a model change).

No production drawer/VM/queue behavior changes as a result of this decision.

---

## 8. FC-1 ratification decisions (ND-1…ND-8)

Folded in from the FC-1 implementation (`web/lib/layout/layoutRefKeyAliases.ts`); these are the operative, implementation-level decisions consistent with the doctrine above.

| # | Decision | Outcome |
|---|---|---|
| ND-1 | Deprecate `child_inquiry.*` on write | **Yes** — alias-on-read only |
| ND-2 | OCM participation refKey prefix | **`inquiry_child.*`** |
| ND-3 | Durable child refKey prefix | **`child.*`** (backed by `customer_member`; interim catalog bridge via `person` defs) |
| ND-4 | Registry `entity_type` for durable `child.*` picker | **Defer `customer_member`**; interim **`person`** child-profile rows |
| ND-5 | `child.name` in repeater columns | **Interim** relation-summary ref; alias from `child_inquiry.child_name` |
| ND-6 | Layout catalog group key for OCM fields | **`inquiry_child`** (canonical); operator label unchanged ("Child") |
| ND-7 | Alias implementation | **`web/lib/layout/layoutRefKeyAliases.ts`** (alias-on-read; `validateRefKeyForWrite` + `makeFieldItem` reject on write) |
| ND-8 | Waitlist priority/ranking in catalog | **Exclude** — compute/widget only (a computed value, never a field) |

FC-1 performs **no runtime cutover and no stored layout migration** (alias-on-read only; stored layout JSON is not rewritten).

---

## 9. One-line summary

> **Show "Child" everywhere.** Durable child = **`customer_member`**; enrollment participation = **OCM**; OCM config/refKeys = **`inquiry_child.*`** inside an **enrollment-child context**; durable child fields = **`child.*`**. **`child_inquiry.*` is deprecated** (alias-on-read, deprecate-on-write). Future modules reference the child as **`child.*`** and put module data on their **own** participation context — never extend `inquiry_child`.

---

*Final canonical naming doctrine. Ratifies the Child Namespace Addendum; does not reopen the Child Model. No entity, runtime, or migration introduced.*
