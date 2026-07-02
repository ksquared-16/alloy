# Experience Builder — Universal Composition Model

**Status**: Active doctrine  
**Applies to**: Focus Panel, Queue Row, Header, future Portal / Dashboard surfaces

---

## The Platform Promise

A field created in the field catalog becomes available anywhere appropriate — on a card, in a queue row, in a header tile — without engineering changes. Operators compose; engineers do not hard-code.

**V1 implementation status:** The hierarchy and named evidence group model described here are implemented. The dynamic custom-field catalog integration (operator creates a field → appears in builders automatically) is **deferred to Experience Builder V2**. See [What is deferred](#deferred--experience-builder-v2) below.

This document is the canonical definition of the composition hierarchy all surfaces share.

---

## Composition Hierarchy

```
Surface
└── Canvas
    └── Component  (Card | Queue Row Block | Header Tile | Portal Section | Dashboard Tile)
        └── Evidence Group  (named business section)
            └── Composition Item  (Field | Widget | Related List | Calculation | AI Summary)
                ├── Conditions  (visible_when, highlighted_when, read_only_when, collapsed_when)
                └── Actions     (link target, edit trigger, handoff)
```

### Levels defined

| Level | Definition |
|-------|-----------|
| **Surface** | The operator-configured screen region: Focus Panel, Queue, Header, Portal |
| **Canvas** | The compositional space within a surface. Operator drags/reorders Components here. |
| **Component** | One answerable unit placed on the canvas. Each Component answers exactly one operational question. |
| **Evidence Group** | A named business section inside a Component that groups related Composition Items. Groups are not abstract containers — they carry business names. |
| **Composition Item** | The smallest configurable unit: one field, one widget, one related list, one calculation. |
| **Conditions** | Per-item or per-group rules that control visibility, highlight, or editability. |
| **Actions** | Per-item behaviors: link to a record, trigger an edit, hand off to another Component. |

---

## Component Types

| Type | Surface(s) | Description |
|------|-----------|-------------|
| **Card** | Focus Panel | Answers one operational question about the current record. Supports Expanded depth with a centered backdrop. |
| **Queue Row Block** | Queue Row | One horizontal zone in the condensed row strip. Rendered per-record at scan speed. |
| **Header Tile** | Header | Persistent identity and status chip in the workspace header. |
| **Portal Section** | Parent/Staff Portal (future) | A configurable block in the family-facing portal. |
| **Dashboard Tile** | Operational Dashboard (future) | A summary tile in the director/admin dashboard view. |

**Cards do not own fields. Evidence Groups organize Composition Items.**

A card is a question and a container. Its Evidence Groups own the composition.

---

## Evidence Group Semantics

Evidence Groups are named business sections, not abstract containers. The following names are canonical across surfaces:

| Group Key | Label | Applies to |
|-----------|-------|-----------|
| `primary_contact` | Primary Contact | Household card, Household queue block |
| `additional_contacts` | Additional Contacts | Household card |
| `child_summary` | Child Summary | Children card, Children queue block |
| `placement` | Placement | Children card, Children queue block (waitlist) |
| `schedule` | Schedule | Children card |
| `billing_responsibility` | Billing Responsibility | Financial Configuration card |
| `tuition` | Tuition | Financial Configuration card |
| `medical` | Medical | Children card |
| `documents` | Documents | Children card |
| `readiness` | Readiness | Children card |
| `stage_disposition` | Stage & Disposition | Status queue block |
| `attention_signal` | Attention Signal | Attention queue block |
| `date_event` | Date & Event | Date queue block |
| `current_work` | Current Work | Current Work card |

**Group labels are user-facing. Group keys are internal identifiers.**

Abstract labels ("Evidence Group 1", "Group 1", "block_a") must never appear in operator-facing UI.

---

## Composition Item Types

| Type | Description | Example |
|------|-------------|---------|
| **Field** | A scalar value bound to a business concept or field key. | Primary Contact Name, Phone, Age |
| **Widget** | A pre-built interactive block (attention signal, work list). | Attention Widget, Follow-ups |
| **Related List** | A to-many relationship rendered as a compact list or count+expand. | Children list, Authorized Pickups |
| **Calculation** | A derived value computed at read time (not stored). | Balance, Tuition Rate |
| **AI Summary** | An AI-synthesized statement (future; treated as a Calculation for config purposes). | Enrollment readiness statement |

---

## Field Availability Rules

### Entity compatibility

Fields are available to a Component based on entity grain:

| Surface grain | Available entity namespaces |
|---------------|----------------------------|
| Opportunity (case) | `opportunity.*`, `person.*`, `customer.*`, `queue_row.*` |
| Customer Member (child/candidate) | `child.*`, `inquiry_child.*` |
| Person | `person.*` |

A field with `entity_type = "opportunity"` is available in the Household queue block and on Focus Panel cards bound to the Opportunity entity.

A field with `entity_type = "customer_member"` is available in the Children block and on Focus Panel cards bound to the Children entity.

### Owner constraint

Each Evidence Group has one owning Component. Fields are **editable only on the owning Component**. A field may appear read-only on other Components.

### Surface capability

Not all Composition Item types are valid on all surfaces:

| Type | Focus Panel | Queue Row | Header |
|------|------------|-----------|--------|
| Field | ✓ | ✓ | ✓ |
| Widget | ✓ (cards with Evidence archetype) | ✓ (attention zone) | — |
| Related List | ✓ (expanded state) | ✓ (children zone) | — |
| Calculation | ✓ | ✓ | ✓ |
| AI Summary | ✓ (future) | — | — |

### Field catalog → builder availability (V1 scope)

In V1, the builder inspector shows **platform-defined composition fields only** — the curated set in `compositionFieldAdapter.ts::QUEUE_FIELD_CATALOG`. These are the fields the queue row runtime already renders.

Operator-created custom fields from Settings → Fields are **not yet available in the builder** (deferred to V2 — see the Deferred section below). The rules that will govern V2 availability:

1. The field's `entity_type` must match the Evidence Group's entity namespace.
2. The field's `is_active` must be true and `is_visible_in_drawer` not false.
3. The surface's validator allow-list must include the generated refKey.

Until V2, do not describe the builder as "shows all created fields" — it shows composition fields only.

---

## Widget Availability Rules

Widgets are available when:

1. The widget's `relevantSurfaces` includes the target surface type.
2. The Component's archetype supports the widget category.

Widgets appear in the Composition Item picker as a separate section from Fields.

---

## Related List Rules

Related Lists are available on:
- Focus Panel cards when the card is in Expanded state (`includeInExpanded: true` on the Evidence Group).
- Queue Row Children/candidate zones via `repeated_record_block`.

A Related List always has a display mode: `compact_list`, `count_expand`, or `relationship_summary`.

---

## Calculation Rules

Calculations are derived at read time. Examples:

- Tuition rate (resolved from commercial grid at read time)
- Queue row group count (computed from enrollment count)
- Billing balance (derived from billing ledger)

Calculations are defined as fieldKey tokens with a `display: "money"` or `display: "pill"` rendering hint. The runtime resolves via the same field path system as Fields.

---

## Condition Rules

Conditions control per-item or per-group visibility and state:

| Kind | Applies to | Description |
|------|-----------|-------------|
| `visible_when` | Item, Group | Show only when the condition is met |
| `highlighted_when` | Item | Highlight (ring, color) when the condition is met |
| `read_only_when` | Item | Lock from editing when the condition is met |
| `collapsed_when` | Group | Default to collapsed when the condition is met |

Condition operators: `is`, `is_not`, `exists`, `not_exists`.

Queue Row conditions use the `LayoutCondition` grammar: `{ type: "exists" | "equals" | "not_equals" | "count_gt", path: string, value?: string }`.

Focus Panel conditions use the inspector grammar: `{ kind: FocusPanelConditionKind, concept: string, operator: FocusPanelConditionOperator, value?: string }`.

**Unification**: These two grammars describe the same semantics. A future unified condition grammar should merge them. Until then, each surface uses its own form.

---

## Action Rules

Per-item Actions:

| Action | Description |
|--------|-------------|
| `link` | Navigate to a linked record (opportunity drawer, person drawer, child drawer) |
| `edit` | Trigger an edit form for the owning card |
| `handoff` | Pass focus to another Component (cross-card coordination) |

Queue Row blocks support `link` actions on fields (`display: "link"` with a `link.target`).

Focus Panel cards support `edit` and `handoff` at the evidence group level.

---

## Surface Applications

### Focus Panel

```
Focus Panel Canvas
└── Household Card  (Question: "Who is this family?")
    ├── Primary Contact group
    │   ├── Name   [field]
    │   ├── Phone  [field]
    │   └── Email  [field]
    └── Additional Contacts group
        ├── Children summary    [related list]
        └── Secondary contact   [field]

└── Children Card  (Question: "Who are the children and where are they?")
    ├── Identity group
    │   ├── Name   [field]
    │   └── DOB    [field]
    ├── Placement group
    │   ├── Program   [field]
    │   ├── Room      [field]
    │   └── Schedule  [field]
    ├── Medical group     (empty until configured)
    └── Documents group   (empty until configured)
```

**Inspector structure**: Canvas → select card → Inspector opens with tabs: Question | Evidence Groups | Presentation | Editing | Expanded | Related | Conditions | Actions

**Evidence Groups tab**: Lists groups by name. Each group shows its Composition Items with add/remove/reorder controls and a field picker filtered to entity-compatible fields.

### Queue Row

```
Queue Row Canvas
└── Household Block  → "Primary Contact" evidence group
    ├── Household name    [field: customer.display_name]
    ├── Primary contact   [field: person.primary_contact_name]
    ├── Phone             [field: person.phone]
    └── Email             [field: person.email]

└── Children Block  → "Child Summary" evidence group
    ├── Name    [field: child.name]
    ├── DOB     [field: child.date_of_birth]
    └── Status  [field: child.status]

└── Status Block  → "Stage & Disposition" evidence group
    ├── Stage       [field: queue_row.stage_label]
    ├── Disposition [field: opportunity.status_label]
    └── Location    [field: opportunity.location]
```

**Inspector structure**: Canvas → select block → Inspector opens with: Block name | Evidence Groups (named) | Per-field toggles | Visibility condition | Actions config

**Waitlist placement condition**: Rather than a separate "waitlist builder," use row grain + conditions:
- Family/case row: show Household + Children + Status + Attention + Date blocks
- Child/candidate row: show Child Summary + Placement blocks
- Conditionally show placement fields when `placement_status == "waitlisted"`

### Header

```
Header Canvas
└── Identity Tile       [subject name, primary identifier]
└── Status Tile         [stage + disposition chip]
└── Assigned Employee   [field: opportunity.assigned_employee_name]
```

Header tiles are non-expandable; they are always compact. Evidence Groups are not applicable — Header tiles hold one or two Composition Items each.

### Financial Configuration Card

```
Financial Configuration Card  (Question: "Is billing configured and ready?")
├── Billing Responsibility group
│   └── Responsible party   [field]
├── Tuition group
│   └── Resolved rate       [calculation]
└── Placement group
    ├── Program    [field]
    ├── Room       [field]
    └── Schedule   [field]
```

### Future: Parent/Staff Portal

The same hierarchy applies. A Portal Section is a Component. It holds Evidence Groups with Composition Items. A parent portal section for "My Child's Placement" would show the Placement evidence group from the Children entity.

---

## Builder Drag/Drop Scope

Drag/drop applies at the **Component level** for top-level surfaces:
- Cards on the Focus Panel canvas
- Blocks on the Queue Row canvas
- Tiles on the Header canvas

At the Evidence Group and Field level, the inspector uses **explicit controls** (up/down arrows, remove buttons, add pickers) — not drag/drop. This is correct: operators rarely see the expanded group in the canvas context.

---

## Runtime Parity

The composition hierarchy must persist into the layout doc and be readable at runtime.

### Queue Row (FULLY WIRED)

```
Builder (QueueRowBuilderV2) 
→ stateFromConfig + buildConfigFromState
→ POST /api/admin/queue-row-layout/[surfaceId]
→ doc.metadata.queue_record_layout (QueueRecordLayoutConfigV3)
→ resolveQueueRecordLayoutConfig(doc)
→ OperationalQueueRecordRow → QueueRecordScopedColumn
→ field rendered or absent based on config.columns[].blocks[].fields[]
```

Queue row runtime is fully config-driven. If a field is removed from a block's `fields[]`, it is not rendered. This reference path is validated in `queueRowBuilderV2.test.ts`.

### Focus Panel (PARTIALLY WIRED)

The Focus Panel Inspector persists card config to `LayoutSection.metadata`. The runtime reads `config.evidenceGroups` via `configFields()` for profile-card rendering. However, the core card evidence assemblies (`buildHouseholdCardEvidence`, `buildChildrenCardEvidence`) are currently hardcoded — they read directly from `context.truth` using fixed field paths, not from config.

**Deferred**: Making card evidence assemblies config-driven requires a `CardFieldsConfig` intermediate type and refactoring each card's evidence builder. This is deferred to Experience Builder V3.

**Reference path today**: The profile/appearance/question/condition parts of the card config ARE live. The field list within evidence groups seeds default values but does not yet drive which fields the runtime extracts from the record.

---

---

## What is implemented in V1

| Capability | Status |
|-----------|--------|
| Composition hierarchy (Surface → Canvas → Component → Evidence Group → Composition Item → Conditions → Actions) | ✅ Doctrine + registry implemented |
| Named evidence group registry (`compositionEvidenceGroupRegistry.ts`) | ✅ All queue zones + Focus Panel cards |
| Composition field adapter (`compositionFieldAdapter.ts`) | ✅ Platform-defined fields only |
| Queue Row Builder V2 — named group inspector with per-field toggles | ✅ Live |
| Queue Row publish → LayoutDoc → runtime render path | ✅ Fully wired |
| Household Focus Panel named groups (Primary Contact, Additional Contacts) | ✅ Seeded in `defaultEvidenceGroupsForCard` |
| Focus Panel card evidence assemblies config-driven | ❌ Hardcoded — deferred to V3 |
| Dynamic custom field catalog integration | ❌ Deferred to V2 (see below) |

### What "composition fields" means in V1

The builder inspector shows **composition fields** — the platform-defined set of fields that `OperationalQueueRecordRow` already knows how to render. These are sourced from `QUEUE_FIELD_CATALOG` in `compositionFieldAdapter.ts`, a curated subset of the built-in queue layout default fields.

**Composition fields ≠ all created fields.** Operator-created custom fields from the field catalog are NOT shown in the V1 builder. The inspector label "Fields" refers to composition fields only.

---

## Deferred — Experience Builder V2

**Goal:** operator creates a field in Settings → Fields → it appears in compatible builders automatically.

**What needs to be built:**

1. **Adapter integration** — `compositionFieldAdapter.ts` must call `tenantLayoutFieldPickerCatalog.buildTenantLayoutCatalogFields(defs, surface)` and merge tenant fields into the available set, filtered by entity-namespace compatibility.

2. **Entity-namespace check** — the custom field's `entity_type` (from `TenantFieldDefinitionRow`) must match the evidence group's namespace (`opportunity`, `child`, `person`, etc.) before the field is offered.

3. **Validator allow-list extension** — the queue row validator allow-list (`queueRecordValidatorAllowList.ts`) must be extended to auto-include tenant field refKeys that pass entity-type compatibility. Until then, custom fields pass through the catalog query but cannot be published.

4. **Focus Panel evidence assembly** — `buildHouseholdCardEvidence`, `buildChildrenCardEvidence`, etc. must be refactored to read from `config.evidenceGroups[].fields[]` rather than fixed field paths. Requires a `CardFieldsConfig` intermediate type.

5. **Focus Panel concept catalog** — the `CONCEPT_TREE` in `focusPanelConceptCatalog.ts` is a **static, hand-maintained tree** of business concepts (Primary Contact, Children, Program, Stage & Status, …). It has no connection to `TenantFieldDefinitionRow` or the tenant field catalog. Adding a concept today means editing `CONCEPT_TREE` and its `resolveConceptValue` switch. Dynamic custom-concept availability is deferred to V2 alongside the adapter integration above.

Until V2 ships, operators who create custom fields that need to appear in builders should request refKey allow-list additions via platform support.

### Surface Builder Parity Correction (2026-07-01) — catalog expansion, NOT custom-field integration

The parity correction sprint (PR #63) expanded the **predefined composition catalog** — it did **not** wire operator-created custom fields into any builder. Specifically:

- Added waitlist/placement composition fields (`waitlist.positionLabel`, `waitlist.tierLabel`, `waitlist.waitSince`, `waitlist.siblingContext`, `overrides.flags`) to `QUEUE_FIELD_CATALOG`. These are platform-defined fields already present in `defaultWaitlistQueueLayoutV3()`, each guarded by a `visibleWhen: { type: "exists" }` condition so they render only when a persisted source exists.
- Extended the Focus Panel `CONCEPT_TREE` with additional **predefined** concepts (Primary Contact address fields; Stage & Status branch; Program placement leaves).

Both changes are **composition field catalog expansion**. The custom-field catalog integration described in items 1–5 above remains deferred to V2. Do not describe the builders as surfacing operator-created custom fields.

**Runtime label note:** the queue row column `label` (rename hook, `QueueRecordColumnConfig.label`) persists to the LayoutDoc and is reflected in the builder canvas preview. The **condensed** runtime row (`OperationalQueueRecordRow`) passes `hideColumnLabel`, so column labels are intentionally suppressed in the condensed grain; the label applies where a labeled column context renders it (`QueueRecordScopedColumn` with `hideColumnLabel` unset).

---

## Naming Standards

| Internal | User-facing |
|---------|-------------|
| `block` | Composition zone (builder context) |
| `field_group` | Evidence group |
| `fieldKey` | (hidden; user sees label only) |
| `evidenceGroups` | Evidence Groups |
| `blocks` | (hidden; user sees named groups) |
| `repeated_record_block` | Child list / Related list |
| `widget` | Widget |

Abstract labels are NEVER shown to operators:
- ~~"Evidence Group 1"~~ → "Primary Contact"
- ~~"Group 1"~~ → "Child Summary"
- ~~"block_a"~~ → (use zone label)
- ~~"fieldKeys"~~ → shown as "Fields"
