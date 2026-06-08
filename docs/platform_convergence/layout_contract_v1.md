# Layout Contract — V1 (FROZEN)

**Status:** Frozen architecture contract. This is the source of truth for the remainder of the Platform Convergence Sprint.
**Scope:** The contract that runtime, lifecycle, queues, drawers, and AdminV2 converge onto.
**Nature:** Architecture-only. No implementation, no migrations, no code, no new platform concepts.
**Companions (non-normative):** [FIELD_CATALOG_LAYOUT_ALIGNMENT_V1.md](../FIELD_CATALOG_LAYOUT_ALIGNMENT_V1.md) (audit), [PLATFORM_CONVERGENCE_LAYOUT_SPEC_V1.md](../PLATFORM_CONVERGENCE_LAYOUT_SPEC_V1.md) (implementation plan). Where those differ from this document, **this document wins.**

---

## 0. Purpose, Principles, and Authority

### 0.1 What this contract freezes
This document fixes the **shape, semantics, and boundaries** of layout configuration so that every downstream consumer — the drawer runtime, queue/list runtime, lifecycle surfaces, and AdminV2 — can be built and refactored independently against a stable interface.

### 0.2 Principles (binding)
- **Convergence over invention.** Only existing, already-agreed concepts are frozen here. No new platform concepts are introduced.
- **One presentation layer.** There is exactly one layout system. No parallel or duplicate presentation layer may be created.
- **No new runtime systems.** Runtime gains a resolution path against this contract; it is not replaced.
- **No lifecycle redesign.** Lifecycle integrates through declared seams only (§9).
- **No VM redesign.** AdminV2/VM consumes this contract unchanged; the contract does not depend on VM internals.

### 0.3 Authority and terminology
- **MUST / MUST NOT / SHOULD / MAY** carry RFC-2119 weight.
- A **consumer** is any runtime that renders or interprets a LayoutDoc (drawer, list/queue, lifecycle surface, AdminV2).
- A **producer** is any author of a LayoutDoc (the seeded code registry, an org-level override, or an admin editor).
- The **catalog** is the field registry (`field_definitions` + `field_section_definitions` + `field_values` + `option_sets`). The LayoutDoc references the catalog; it does not redefine it.

---

## 1. The LayoutDoc Contract

### 1.1 Definition
A **LayoutDoc** is the single, self-contained, versioned description of how one entity type is presented in one surface. It is the only object a consumer needs to render a layout. It is a tree of **blocks** grouped into **tabs**, referencing **fields** by key in the catalog.

### 1.2 Identity
A LayoutDoc is uniquely identified by the tuple:

| Key | Meaning | Constraint |
|---|---|---|
| `org_id` | Tenant scope | Required. Every LayoutDoc is org-scoped. |
| `entity_type` | The entity it presents (e.g. opportunity/enrollment, person, location) | Required. MUST be a recognized entity type. |
| `surface` | Where it renders | Required. Enum: `drawer`, `queue` (aligned to `LAYOUT_SURFACES` in `web/lib/layout/layoutV2.ts`; the earlier draft term `list` ≡ `queue`). (Other surfaces are out of scope — §10.) |
| `queue_context` | Discriminator for `queue` surface (§3.4) | Required **only** when `surface = queue` and more than one queue variant exists for the entity type. Omitted/`null` for `drawer` and for the single default queue. |

For `surface = drawer`, `(org_id, entity_type, surface)` resolves to at most one **active** LayoutDoc. For `surface = queue`, identity is `(org_id, entity_type, surface, queue_context)` (§3.4) — a single entity type / lifecycle MAY have **multiple** active queue layout variants, each disambiguated by `queue_context`. (§7)

### 1.3 Normative structure
A LayoutDoc is a document with the following top-level shape (described, not coded):

| Field | Type | Required | Meaning |
|---|---|---|---|
| `contract_version` | integer | yes | The version of *this contract* the doc conforms to. V1 = `1`. |
| `doc_version` | integer | yes | The published revision of this specific doc (§7). |
| `entity_type` | string | yes | Mirrors identity. |
| `surface` | enum | yes | `drawer` \| `queue`. |
| `queue_context` | QueueContext | yes (queue, when >1 variant) | Variant discriminator (§3.4). Absent ⇒ the default queue layout for the entity type. |
| `tabs` | ordered list of Tab | yes (drawer) | Present for `drawer`; ignored for `queue`. |
| `queue` | QueueLayout | yes (queue) | Present for `queue`; ignored for `drawer`. |
| `metadata` | object | no | Opaque, non-semantic annotations (labels, descriptions). MUST NOT affect rendering logic. |

A **Tab** is:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `key` | TabKey | yes | MUST be a member of the frozen Tab Registry (§4.2). |
| `label` | string | no | Display override; defaults to registry label. |
| `blocks` | ordered list of Block | yes | The blocks rendered in this tab (§2). |

### 1.4 LayoutDoc invariants (MUST hold for a doc to be valid)
1. **Closed vocabularies.** Every `tab.key` ∈ Tab Registry; every block `kind` ∈ Block Types (§2); every widget `widgetKey` ∈ Widget Registry (§5). Unknown members make the doc invalid.
2. **Unique keys.** Block `key`s are unique within a tab; tab `key`s are unique within a doc; field references are unique within a block.
3. **Catalog-resolvable references.** Every referenced `fieldKey` MUST resolve to an active catalog field for the doc's `entity_type` (or, for relationship/repeater blocks, the related entity type). A doc referencing a missing field is invalid.
4. **Self-containment.** A consumer MUST be able to render a LayoutDoc using only the doc + the catalog + the registries named here. A LayoutDoc MUST NOT depend on consumer-private state.
5. **Surface exclusivity.** A `drawer` doc has `tabs` and no `queue`; a `queue`-surface doc has a `queue` (QueueLayout) and no `tabs`.
6. **Locked governance.** Blocks/fields marked `locked` by the seeded default MUST be present and MUST NOT be removed or reordered by any override (§7.4).

### 1.5 What a LayoutDoc is NOT
- It is **not** a data document. It carries no record values.
- It is **not** the field catalog. It references fields; it never defines field type, storage, or validation.
- It is **not** a lifecycle definition. It exposes lifecycle seams (§9); it does not encode stage logic, transitions, or rules.
- It is **not** a component. It names approved widgets; it does not embed component code or props beyond a declared param contract.

---

## 2. Supported Layout Block Types (FROZEN — closed set)

A **Block** is a discriminated node with a `kind`. V1 freezes **exactly five** kinds. No sixth kind may be added without a contract version bump (§7.6).

| `kind` | Purpose | Binds to | Cardinality of data |
|---|---|---|---|
| `section` | A grid of fields from the **current** entity. | catalog fields of `entity_type` | one record |
| `relationship_section` | A grid of fields from a **single related** record. | a related entity via a Relation (§6) | one related record (to-one) |
| `repeater` | A repeating presentation of a **collection** of related records. | a related collection via a Relation (§6) | many related records (to-many) |
| `widget` | An approved rich, non-field-grid component placed by key. | Widget Registry (§5) | widget-defined |
| `queue` | An embedded list/table of records using a QueueLayout. | a QueueLayout (§3) | many records |

### 2.1 Common block fields (all kinds)
| Field | Required | Meaning |
|---|---|---|
| `kind` | yes | One of the five above. |
| `key` | yes | Stable identifier within the tab; survives reordering; basis for override merge. |
| `title` | no | Display title. |
| `sortOrder` | no | Ordering hint within the tab. |
| `locked` | no | If true (in seeded default), cannot be removed/reordered by override. |
| `visibleWhen` | no | A **declarative, read-only** visibility predicate over bound data (e.g. role equals child). MUST NOT have side effects. Expression grammar is bounded (equality/presence over bound fields and compute keys); arbitrary logic is out of scope (§10). |

### 2.2 Grid semantics (used by `section`, `relationship_section`, and per-item in `repeater`)
- A grid declares a **column count** (1–4) and an ordered list of **field references**.
- Field placement defaults to **flow by span** (each field declares `span` 1–4). This is the canonical path.
- An **explicit row/cell** arrangement MAY be declared for precise placement; when present it overrides flow. Rows and cells are layout-only and carry no data semantics.
- Rows and columns are **presentation primitives**, not data primitives. They MUST NOT imply grouping, filtering, or relationship.

### 2.3 Field reference semantics
A field reference points at a catalog field by `fieldKey` and MAY carry presentation overrides: `span`, `renderHint`, `editable`, `locked`, and `group` (`required` | `recommended`). A field reference MUST NOT redefine the field's type, storage, validation, or options — those live in the catalog only.

---

## 3. Queue Layout Contract

A **QueueLayout** is the frozen description of a record collection rendered as a list/table. It is used by: the `queue` surface, the `queue` block (§2), and — by adoption, not by a new system — AdminV2 work-unit queues (`QueueBlock`/`QueueVm`/`QueueService`, consuming `QueueRowContext`/`WorkUnitSurfaceContext`).

### 3.1 Structure (normative)
| Field | Required | Meaning |
|---|---|---|
| `key` | yes | Stable identifier. |
| `entity_type` | yes | The collection's entity type. |
| `columns` | yes | Ordered column descriptors (key, label, renderHint, sortable, locked). Reuses the existing column model; columns reference catalog fields or compute keys. |
| `defaultSort` | no | Column key + direction. |
| `filters` | no | Declarative field/operator/value predicates. Bounded grammar; no free-form query. |
| `groupBy` | no | A single field/compute key to group rows. |
| `rollup` | no | Count badge and/or named grouping summary. |

### 3.2 Invariants
1. A QueueLayout is **read-only presentation**: it describes columns, sort, filter, grouping, and rollup. It MUST NOT define mutation, pagination transport, or data-fetch strategy (those are runtime concerns, §8).
2. Every column and `groupBy`/`filter` reference MUST resolve to an active catalog field or a registered compute key.
3. The same QueueLayout shape is authoritative for all three consumers; consumers MUST NOT fork it. AdminV2 work-unit queues adopt this shape (the reserved `work_units.queue_definition` is the eventual persistence site); they MUST NOT define a competing queue descriptor.

### 3.3 Boundary
Queue **semantics of "what work belongs in this queue"** (the cohort/routing logic) are a lifecycle/work-unit concern referenced by `key`, not encoded in the QueueLayout. The QueueLayout describes presentation of a resolved collection only.

### 3.4 Queue layout variants & the context discriminator (V1 clarification)

`surface = queue` alone does **not** uniquely identify a queue layout. A single entity type — within a single lifecycle — MAY require **multiple, materially different queue layout variants** (e.g. an Enrollment lifecycle whose standard stage queues for *qualification / tour / enrolling* share one row layout, while the **waitlist** queue needs a different configured record layout). This is expressed by adding a **context discriminator** to queue identity. It is **still Layout Contract V1**: it changes *resolution*, not the closed block vocabulary (§2), the Tab Registry (§4.2), or the Widget Registry (§5).

#### 3.4.1 QueueContext (the discriminator)
A `queue_context` is an ordered set of optional keys that, together with `(org_id, entity_type, surface=queue)`, selects one queue layout variant:

| Key | Meaning | Example |
|---|---|---|
| `lifecycle_key` | The lifecycle the queue belongs to | `enrollment` |
| `stage_key` | A specific lifecycle stage | `qualification`, `tour`, `enrolling` |
| `work_unit_key` | A specific work unit / cohort owner | `north_campus_intake` |
| `queue_type` | The kind of queue when type — not stage — distinguishes it | `standard`, `waitlist` |
| `grain` | The granularity the variant is authored at | `lifecycle`, `stage`, `work_unit` |

All keys are optional; `queue_context` is a **selector**, not a record of cohort membership. Every key value is a stable identifier owned elsewhere (lifecycle/work-unit definitions) and is **referenced**, never defined, here.

#### 3.4.2 Variant rules
1. A lifecycle MAY register **N** queue layout variants, each a full LayoutDoc with `surface = queue` and a distinct `queue_context`.
2. Each variant uses the **same** `QueueLayout` shape (§3.1) and the **same** closed block vocabulary (§2). Variants differ in their configured columns/rows/blocks, not in their primitives.
3. **Waitlist is the canonical specialized variant:** `queue_context = { lifecycle_key: enrollment, queue_type: waitlist, grain: lifecycle }`. Its distinct rows are ordinary `relationship_section` / `repeater` / field blocks — no waitlist-specific block kind, no waitlist runtime, no separate waitlist presentation system.
4. There MUST be a **default** queue layout per entity type (omitted/`null` `queue_context`) used when no variant matches.

#### 3.4.3 Resolution precedence (deterministic, most-specific-wins)
A consumer resolving a list layout selects the **most specific** active variant whose `queue_context` keys all match the request context, in this precedence:

```
work_unit_key + stage_key  →  stage_key  →  queue_type  →  lifecycle_key  →  default (no context)
```

Ties at the same specificity are invalid authoring (a variant set MUST be unambiguous). `grain` records the authoring level and MUST be consistent with which keys are populated; it is a clarity/validation aid, not an independent selector. Resolution is read-only and deterministic.

#### 3.4.4 Invariants (extend §3.2)
4. A `queue_context` selects a variant; it MUST NOT encode cohort membership, routing, or eligibility (those remain the lifecycle/work-unit seam, §3.3 / §9).
5. Every `queue_context` key value MUST reference an identifier defined by lifecycle/work-unit/queue-type definitions; the contract does not define those vocabularies.
6. All variants of an entity type share the closed block vocabulary (§2) and QueueLayout shape (§3.1). Introducing a variant MUST NOT introduce a new block kind, widget key, or surface.
7. Exactly one variant resolves for a given request context (after precedence); the default variant guarantees a result.

#### 3.4.5 Production grounding (non-normative; reconciles to `runtime_convergence_inventory.md` §5)
The discriminator keys reference identifiers that already exist in code (the contract references, never defines them): `lifecycle_key`/`stage_key` ↔ `web/lib/lifecycle/enrollmentProcessStageQueueKeys.ts`; `work_unit_key` ↔ `work_units` rows; `queue_type` ↔ v1 `pipeline_with_attention` vs **waitlist** (`web/lib/orchestration/placement/waitlistQueueBlockSectionPlan.ts`, `queuePlacementWaitlistCandidatePresentation.ts`); `grain` ↔ `web/lib/ui-v2/queueGrainPresentation.ts` / `WorkUnitSurfaceContext`. Stored variant config lives in `work_units.queue_definition` (v1) and is normalized by `queueDefinitionV2Runtime.ts`; the resolved collection carries `QueueRowContext`. Convergence **absorbs** these into queue-layout variants — it does not fork `QueueService` or create a waitlist runtime.

#### 3.4.6 Not in scope (reaffirmed)
No new waitlist runtime. No separate waitlist presentation layer. No new block kinds for variants. `queue_context` is a selector only; cohort/routing logic stays a lifecycle seam (§9). This clarification is `contract_version = 1` (it adds a resolution discriminator, not a frozen-vocabulary change — cf. §7.6).

---

## 4. Drawer Layout Contract

### 4.1 Definition
A **drawer LayoutDoc** (`surface = drawer`) is an ordered set of **tabs**, each an ordered set of **blocks** (§2). It is the canonical record-detail presentation. The drawer runtime renders it; no second drawer/presentation layer may exist.

### 4.2 Tab Registry (FROZEN — closed set)
Tabs are drawn only from this frozen registry. Adding a tab key requires a contract version bump (§7.6).

| TabKey | Intent |
|---|---|
| `overview` | Summary / key facts. |
| `enrollment` | Enrollment record detail and planning. |
| `children` | Child collection and child detail. |
| `parents` | Parent/guardian contacts and preferences. |
| `documents` | Forms & documents. |
| `communications` | Messages / communication history. |
| `tasks` | Tasks for the record. |
| `related` | Generic related-record modules. |
| `financials` | Financial summary. |
| `payments` | Payments. |
| `ledger` | Ledger entries. |
| `activity` | Activity / audit stream. |
| `automation` | Automation / workflow surface. |

### 4.3 Drawer invariants
1. A tab's content is **entirely** its `blocks` list. There is no "special" tab whose content is implicit; legacy implicit content is a transitional fallback only and is not part of the contract surface.
2. Tab order is doc-defined; the registry defines membership, not order.
3. The same five block kinds (§2) are the only legal tab content. A tab MUST NOT contain anything outside the block vocabulary.
4. Which tabs an entity exposes is a property of its LayoutDoc, constrained by the registry.

---

## 5. Widget Contract

### 5.1 Definition
A **widget** is an approved, rich, non-field-grid presentation unit placed in a layout by `widgetKey`. Widgets exist so that complex surfaces (lifecycle rail, attention, BOS, documents, related records, pricing) are **placed declaratively** rather than hardcoded, while their internals remain ordinary components.

### 5.2 Widget Registry (FROZEN — closed set)
A `widget` block's `widgetKey` MUST be a member of this registry. Adding a key requires a contract version bump (§7.6).

| widgetKey | Responsibility (presentation only) |
|---|---|
| `lifecycle_rail` | Renders stage progression + readiness for the record. |
| `needs_attention` | Renders the attention count and grouped reasons. |
| `bos_recommendation` | Renders the next-best-step recommendation. |
| `lifecycle_actions` | Renders the available lifecycle actions. |
| `tasks_summary` | Renders task summary/count. |
| `documents` | Renders forms/documents for the record. |
| `related_records` | Renders related-record modules. |
| `pricing_breakdown` | Renders the (placeholder-level) tuition/pricing summary. |

### 5.3 Widget contract rules
1. **Closed vocabulary.** Unknown `widgetKey` invalidates the doc.
2. **Declared params only.** A widget block MAY carry `params`; each widget's params are a **declared, bounded contract** (scalars and bound-data references). A widget MUST NOT receive arbitrary code or component props through the doc.
3. **Presentation only.** A widget reads bound data and compute results (§9) and renders. It MUST NOT define lifecycle rules, perform writes as a side effect of rendering, or own canonical data.
4. **Stable key, swappable internals.** The `widgetKey` is the frozen surface. A widget's implementation MAY be refactored or re-homed (including into AdminV2) without changing this contract.
5. **No widget proliferation as an escape hatch.** Widgets are not a place to smuggle new block kinds. A presentation that is fundamentally a field grid, a related record, or a collection MUST use the appropriate block kind, not a widget.

---

## 6. Relationship & Repeater Contract

### 6.1 The Relation descriptor
Both `relationship_section` (to-one) and `repeater` (to-many) reference related data through a single declarative **Relation** descriptor. A Relation describes *how to reach* related records; it does not fetch or mutate them.

| Field | Required | Meaning |
|---|---|---|
| `targetEntity` | yes | The related entity type. |
| resolution | yes | Exactly one of: a foreign-key column on the current record, **or** a join through a named link table with local/target keys and an optional equality filter. |
| `cardinality` | yes | `one` (relationship_section) or `many` (repeater). |

### 6.2 Relationship section (to-one)
- Renders a field grid whose fields resolve against **one** related record.
- Cardinality MUST be `one`. If resolution yields more than one record, the consumer renders the contract-defined empty/ambiguous state; it MUST NOT silently pick one.
- A to-one relationship MAY also be represented as a single **relationship field** in the catalog (with link-to-drawer behavior). The two are complementary; a doc MUST NOT use both to present the same relation redundantly.

### 6.3 Repeater (to-many)
- Renders a **collection** of related records, each through a per-item grid, presented as `card`, `row`, or `table`.
- Cardinality MUST be `many`.
- A repeater MAY declare an empty state and a preview cap (collapse beyond N). These are presentation hints, not data limits.
- A repeater is the **only** sanctioned way to present a to-many collection inside a tab. To-many collections MUST NOT be flattened into fields, nor smuggled through widgets or sections.

### 6.4 Catalog boundary
- The catalog stores **to-one** relationship fields only. **To-many** relationships are a layout concern (repeater/relationship block) and are not catalog fields.
- Relations reference entities and link tables by name; the contract does not define or alter those tables.

---

## 7. Versioning & Publish Model

### 7.1 Two version numbers, two purposes
- **`contract_version`** — the version of *this contract*. V1 = `1`. Changes only when the frozen vocabularies or invariants change (§7.6).
- **`doc_version`** — the published revision of a specific LayoutDoc. Increments on each publish.

### 7.2 Default + override + merge (the source-of-truth model)
- The **seeded default** LayoutDoc (authored in the code registry) is the guaranteed baseline for every identity (`(entity_type, surface)`, plus `queue_context` per variant for `queue` — §3.4).
- An **org override** LayoutDoc MAY exist per full identity (`(org_id, entity_type, surface)` for `drawer`; `(org_id, entity_type, surface, queue_context)` for `queue`). When present, it is the source of truth.
- The **effective** LayoutDoc a consumer renders is the merge of `default ⊕ override` **for the resolved identity** (for `queue`, after variant selection per §3.4.3), resolved deterministically by block/tab/field `key`.

### 7.3 Merge determinism
1. Merge is keyed by stable `key` at each level (tab, block, field).
2. Override values win per key; keys absent in the override inherit the default.
3. Merge order and result MUST be deterministic and idempotent.
4. Keys present in an override but unknown to the default are **ignored** (forward-compatibility), never errored.

### 7.4 Locked governance
- Tabs/blocks/fields marked `locked` in the seeded default MUST survive merge: an override MUST NOT remove, hide, or reorder them.
- This is the governance guarantee that prevents overrides from breaking required presentation.

### 7.5 Publish lifecycle
- A LayoutDoc is **draft** or **active**. At most one active doc exists per full identity — `(org_id, entity_type, surface)` for `drawer`, `(org_id, entity_type, surface, queue_context)` for `queue` (so multiple active queue variants coexist, one per `queue_context`; §3.4).
- Publishing promotes a draft to active and increments `doc_version`. Prior active versions are retained for rollback (retention is a runtime concern; the contract only requires that activation is atomic and reversible).
- Consumers always resolve the **active** effective doc.

### 7.6 Changing the frozen vocabularies
The Block Types (§2), Tab Registry (§4.2), and Widget Registry (§5.2) are **closed**. Any addition, removal, or semantic change to these sets, or to the LayoutDoc invariants (§1.4), is a **`contract_version` bump** and requires a new contract document (`layout_contract_v2.md`). It MUST NOT be done by editing a LayoutDoc.

---

## 8. Runtime Consumption Contract

This section fixes the **interface obligations** of any consumer. It does not prescribe implementation.

### 8.1 Consumer obligations (MUST)
1. **Resolve** the effective LayoutDoc by merging `default ⊕ override` for the full identity (§7.2–7.4), org-scoped. For `surface = queue`, first **select the queue variant** by `queue_context` precedence (§3.4.3), falling back to the default variant; then merge.
2. **Validate** the doc against the frozen vocabularies and invariants (§1.4). An invalid doc MUST fail closed (render the safe default), never render undefined behavior.
3. **Bind** data by field class — system/business from native columns, custom from field values, to-one relationships/source-paths by reference, computed via resolvers (§9). Binding is **read-only**.
4. **Render** strictly the declared blocks using the approved renderers/widgets. A consumer MUST NOT introduce presentation not expressed in the doc.
5. **Honor governance** — locked elements, closed vocabularies, surface exclusivity.

### 8.2 Consumer prohibitions (MUST NOT)
- MUST NOT mutate catalog, data, or layout as a side effect of rendering.
- MUST NOT create a second presentation path for any surface this contract covers.
- MUST NOT extend the block/tab/widget vocabularies locally.
- MUST NOT depend on another consumer's internal state to render.

### 8.3 Resolution ordering (normative sequence, not implementation)
`resolve effective doc → validate → bind data (read-only) → resolve computed (read-only) → render blocks`. The ordering is fixed; the mechanics are a runtime concern.

### 8.4 One contract, many consumers
The drawer runtime, list/queue runtime, lifecycle surfaces, and AdminV2 are all **consumers of the same contract**. AdminV2/VM adopts this contract as its input; the contract is independent of VM internals and MUST NOT be redesigned to fit a specific consumer.

---

## 9. Lifecycle Integration Boundaries

Lifecycle integrates with layout through **declared seams only**. There is no lifecycle redesign and no lifecycle logic inside the LayoutDoc.

### 9.1 The four seams (the entire surface area)
1. **Computed values** — Lifecycle-derived metrics (e.g. attention count, task count, readiness, open-requirement count) are exposed to layout as **read-only computed values resolved by key**. They are not stored fields and not editable. Layout references them by key only.
2. **Required / Recommended fields** — Lifecycle "required information" maps to catalog fields flagged required (and recommended), surfaced by layout via field `group`. Completeness is computed (seam 1); the rules live in lifecycle, not layout.
3. **Stage & actions** — Stage progression and available actions are surfaced through the `lifecycle_rail` / `lifecycle_actions` / `bos_recommendation` widgets. The widgets render lifecycle state; they do not define transitions.
4. **Queue cohorts** — A queue's *membership/routing* is a lifecycle/work-unit concern referenced by `key`; the QueueLayout presents the resolved cohort only (§3.3). A lifecycle MAY expose multiple queue layout **variants** (e.g. standard stage queues vs. waitlist) selected by `queue_context` (§3.4); the variants are presentation, the cohort/routing behind each remains this lifecycle seam.

### 9.2 Boundary invariants
- Layout MUST NOT encode stage transitions, eligibility rules, automation conditions, or BOS logic. It references their **results** by key.
- Lifecycle MUST NOT define presentation. It produces fields, computed values, stages, actions, and cohorts that layout arranges.
- Operations (actions / tasks / automation) reference the **same** fields and compute keys; they do not introduce a separate data or presentation model.
- The operating model `Fields → Layouts → Lifecycles → Operations` is a one-directional dependency for *presentation*: layouts reference fields; lifecycle/operations reference fields and compute keys; nothing reaches back up to redefine a lower layer.

---

## 10. Explicitly Out of Scope for This Sprint

The following are **deliberately not solved** by this contract. Naming them here prevents scope creep and accidental invention.

1. **New runtime systems or a new VM.** AdminV2/VM is a consumer; it is not redesigned, and no new runtime is built.
2. **A second/duplicate presentation layer** for any covered surface. Forbidden.
3. **Lifecycle redesign** — stage models, transition rules, automation engines, BOS algorithms. Only the seams (§9) are in scope.
4. **Surfaces beyond `drawer` and `queue`.** Dashboards, public/booking forms, report builders, print/export layouts, entity list-table columns (Layer-0 `buildEntityTableColumns`, separate concern), AdminV2 company/department workspace composition — out of scope. (Note: AdminV2 *adopting* the QueueLayout and LayoutDoc is in scope as consumption; *composing new workspace surfaces* is not.)
5. **Arbitrary expression / query language.** `visibleWhen` and queue `filters` use a **bounded** grammar. A general rules/expression engine is out of scope.
6. **Multi-hop / graph field sourcing.** Cross-entity field reads are bounded to a single hop. Arbitrary join graphs are out of scope.
7. **A general computed-field engine.** Computed values are resolved by key from a fixed set of lifecycle-owned resolvers; user-authored computation is out of scope.
8. **Defining catalog entity types is not this contract's job.** The layout contract only *references* entity types and their catalog fields; it neither defines nor changes them. Per the ratified Child Model decision ([`child_model_convergence_audit.md`](./child_model_convergence_audit.md) §FINAL DECISION): durable child truth is the **Child / `customer_member`** record (optionally linked to `persons`); enrollment participation truth is **OCM** (`opportunity_customer_members`). **`inquiry_child` is a technical/config projection over OCM, kept at the data/runtime level but NOT a primary product-facing layout surface** — there is no standalone "Inquiry Child" entity LayoutDoc, and raw table names (OCM) are never exposed in UX. **OCM-scoped child fields surface in a layout only through an enrollment-child context** — a `relationship_section`, `repeater`, or `widget` (§2, §6) bound to the enrollment ↔ child participation — not as a free-standing entity layout. Household / program / room as distinct catalog entity types remain deferred.
9. **Real tuition/billing modeling.** Tuition is placeholder presentation only; pricing/charges/payments models are untouched.
10. **Migrations, persistence mechanics, retention, caching, transport, pagination, and any implementation detail.** This is an architecture contract; how consumers and stores realize it is decided per phase elsewhere.
11. **Consolidation of legacy person models** (`contacts`, `customer_members`). Enrollment uses the canonical person + role path; legacy models are not migrated or merged in this sprint.

---

## 11. Freeze Statement

The LayoutDoc structure (§1), the five Block Types (§2), the QueueLayout incl. variants & the context discriminator (§3), the Drawer/Tab Registry (§4), the Widget Registry (§5), the Relationship/Repeater contract (§6), the versioning/publish model (§7), the runtime consumption obligations (§8), and the lifecycle seams (§9) are **frozen for V1**.

Changes to any frozen vocabulary or invariant require a new contract version (§7.6). Until then, this document is the single source of truth that runtime, lifecycle, queues, drawers, and AdminV2 converge onto.

### Clarification log (within `contract_version = 1`)
- **C3 — Child Model decision applied (2026-06-06; doctrine clarification, no redesign):** Per [`child_model_convergence_audit.md`](./child_model_convergence_audit.md) §FINAL DECISION, **`inquiry_child` is a technical/config projection over OCM and is NOT a primary product-facing layout surface.** Layouts prefer the durable **Child / `customer_member`** concept; OCM-scoped child fields appear only via an **enrollment-child context** (`relationship_section`/`repeater`/`widget`, §2/§6), never as a standalone entity LayoutDoc and never by exposing the raw OCM table name. No separate inquiry-child runtime or presentation system; existing waitlist/readiness/lifecycle/child-grain dependencies are unchanged. Supersedes the C2(a-adjacent) note that called `inquiry_child` "the distinct child entity type." No frozen vocabulary changed; remains `contract_version = 1`. Touched: §10.8.
- **C2 — Reconciliation against shared convergence doc set (2026-06-06; naming/reference alignment only, no redesign):** Reconciled against `runtime_convergence_inventory.md`, `field_catalog_convergence_audit.md`, `seed_world_v1.md` now on staging. (a) **Surface naming:** the surface value `list` is renamed to **`queue`** to match production `LAYOUT_SURFACES` (`web/lib/layout/layoutV2.ts` = `drawer | queue`); entity list-table columns are a distinct Layer-0 concern, out of scope (§10.4). (b) **Block-kind ↔ production `DrawerSectionKind` bridge (non-normative):** contract `widget` ↔ `widget_placeholder`; `relationship_section`/`repeater` ↔ `related_list`; production `injected_system`, `workflow_virtual`, `header_region` are absorbed into contract `section`/`widget`. No change to the closed five block kinds (§2). (c) **Default/override chain:** the contract's "seeded default ⊕ org override" (§7.2) abstracts the production chain Layer-0 registry → `record_drawer_layouts` (org) → `record_layouts` (global) → `entity_layouts` (V2 destination). (d) **Reveal-contract meaning:** "reveal contracts" = AdminV2 runtime **section reveal/readiness gates** (`adminV2/runtime/contract/*`, `composedDrawerPayload/*`), absorbed as the §8 runtime readiness step keyed by block/tab/queue keys — protected doctrine, must not be weakened; record-open/deep-link is separate navigation (see `runtime_to_layout_mapping.md` → Reveal Contracts). No frozen vocabulary changed; remains `contract_version = 1`.
- **C1 — Queue layout variants & context discriminator (§3.4):** `surface = queue` is not sufficient to identify a queue layout. Queue identity gains an optional `queue_context` (`lifecycle_key`, `stage_key`, `work_unit_key`, `queue_type`, `grain`); a lifecycle MAY have multiple variants; waitlist is the canonical specialized variant expressed with the existing closed block vocabulary. Resolution-only change — no new block kinds, widgets, surfaces, runtime, or waitlist presentation system. Remains V1 (cf. §7.6). Touched: §1.2, §1.3, §3.4, §7.2, §7.5, §8.1, §9.1.

*End of Layout Contract V1 (frozen).*
