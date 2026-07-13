---
owner: modules
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Field Concepts — Business Fields, Calculated Fields, Runtime Signals

**Status:** Active — July 2026  
**Reference workspace:** Settings → Data Model (`/settings/fields`)

Alloy separates three operator concepts. They are **not** interchangeable.

---

## Ownership, projection, and surface availability (doctrine)

**Settings → Fields models canonical data ownership.** Surfaces determine contextual availability. Consumers may project fields from one owner onto another subject. Projection does not change ownership.

Required flow:

```text
Canonical Owner
→ Canonical Field Definition
→ Canonical Provider
→ Optional Canonical Projection
→ Consumer Capability and Context
→ Presentation
```

Reject this fallacy:

```text
A field belongs to Child because operators see it on Child surfaces.
```

| Concept | Meaning |
| --- | --- |
| **Canonical owner** | Entity grain that owns the business fact (`customer_member`, `inquiry_child`, `person`, …) |
| **Storage grain** | Table/column or `field_values` target for that owner |
| **Provider** | Consumer-facing identity (`refKey`) derived from the field, not invented per UI |
| **Projection subject** | Subject a consumer views (e.g. Child Focus Panel) while the owner remains Enrollment |
| **Consumer availability** | Whether a resolver can supply the field on a surface/context |
| **Presentation label** | Operator-facing copy (`Current Program`) — never ownership |

Example: **Current Program** on a Child Focus Panel is an **Enrollment-owned** field (`inquiry_child.program_category_id` → OCM) projected onto the Child subject. Option masters (`location_program_categories`) remain Location/Program catalog ownership — not Child Profile.

---

## Business Fields

**Owned by the organization.**

Examples: Date of Birth, Gender, Program, Start Date, Meeting Date, Billing Date, Tour Date.

| Storage | Operator control |
| --- | --- |
| Platform templates (`field_definitions` with `is_system`) | Label, category, description; storage locked |
| Custom fields (`field_definitions` tenant rows) | Full lifecycle: create, edit, hide, archive, delete |

**Consumers:** Data Model, Forms, Surface Builder, Processing, Business Processes, Documents, Communications.

**Choice fields:** Single choice and Multiple choice business fields store their option list in `field_definitions.config.options` (canonical). All consumers read the same option set — no duplicate option management per consumer.

---

## Calculated Fields (planned)

**Not implemented yet.** Documented for operator clarity and consumer audit alignment.

Calculated fields are **operator-defined formulas** over business fields. They belong to the Data Model as first-class definitions — **not** Runtime Signals.

| Example | Formula source |
| --- | --- |
| Age | Date of Birth |
| Days Until Billing | Billing Date |
| Meeting Month | Meeting Date |
| Program Length | Start Date + End Date |

**Today:** catalog entries such as `child.age` and `opportunity.target_start_date` are resolver-backed projections classified as **Calculated (planned)** until the formula builder ships.

**Do not** build the Calculated Field builder in standalone Data Model sprints after July 2026 closeout. Scope formula authoring through Field Platform consumer adoption.

---

## Runtime Signals

**Owned by Alloy.** Platform projections — **not** configurable business fields.

Examples: Current Work, Days in Stage, Current Stage, Missing Required Information, Readiness, Attention, Queue Health.

| Property | Behavior |
| --- | --- |
| Storage | Not stored as business field values |
| Source | Runtime Signal registry / resolver catalog (`computedFieldCatalog.ts` today) |
| Data Model | View-only; filter **Runtime Signals** |
| Operators | Cannot create, rename, or delete |

**Consumers:** Surface Builder, Queue Builder, Focus Panel, Business Processes, Reporting — without appearing in business field pickers.

**Tour scheduled date:** classified as Runtime Signal — process projection of enrollment workflow state. Underlying tour date may exist as business data; the catalog entry surfaces runtime context.

---

## Classification audit (computed catalog)

| Kind | Count | Examples |
| --- | --- | --- |
| **Calculated (planned)** | 3 | Age, Age (months), Target start date |
| **Runtime Signal** | 21 | Current work, Days in stage, Primary phone, Readiness status |

Canonical audit: `web/lib/fields/fieldConceptModel.ts` → `COMPUTED_FIELD_CONCEPT_AUDIT`.

---

## Consumer readiness (audit prep)

Consumers should read business fields and choice options from:

- `field_definitions` + `fieldCatalogForSettings`
- `config.options` / `config.option_set_key` (legacy option sets)
- `configurationCategoryCatalog` for categories
- `configurationEntityCatalog` for entity labels

**Do not modify consumers in clarification sprint.** Verify only.

| Consumer | Readiness |
| --- | --- |
| Surface Builder | Field picker via catalog; category headers adopt doctrine incrementally |
| Forms | `formFieldRegistryPicker` reads field_definitions + options |
| Processing | Field requirements use catalog paths |
| Business Processes | Requirement pickers use field catalog |
| Documents | Field/category assignment via shared catalog |
| Communications | Entity labels via `EntityLabelsContext` |
| Focus Panel | Composer field library — separate consumer audit |

---

## Status after clarification sprint

| Layer | Status |
| --- | --- |
| **Data Model Workspace** | **FROZEN** |
| **Configuration Workspace Doctrine** | **REFERENCE IMPLEMENTATION** |
| **Field Platform** | **ACTIVE** |

Next phase: **Field Platform Consumer Convergence** (Queue Rows reference adoption complete — see `docs/sprints/archive/08_2026/field-platform-consumer-convergence.md`).

---

## Canonical data providers (July 2026)

The Field Platform distinguishes **provider kinds**:

| Kind | Examples |
| --- | --- |
| **Business field** | First Name, Tour Date, Program |
| **Platform field** | Created At, Record Owner |
| **Calculated field** | Age (planned), Target start date (planned) |
| **Runtime signal** | Current Work, Days in Stage, Missing Required Info |
| **Relationship** | Primary Contact → Email (leaf projection) |
| **Collection** | Children → count (projection) |

Relationships and collections are **not** scalar fields. Consumers declare supported capabilities via `consumerProviderCapabilities.ts`.

Implementation: `web/lib/fields/canonicalDataProviderModel.ts`, `canonicalDataProviderRegistry.ts`, **`canonicalQueueRowProviderDerivation.ts`** (adapter from canonical sources — not a replacement catalog).
