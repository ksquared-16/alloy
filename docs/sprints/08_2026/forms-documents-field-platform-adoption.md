# Forms / Documents — Field Platform Consumer Adoption Audit

**Status:** Audit complete — documentation only (no implementation)  
**Sprint type:** Canonical consumer-adoption audit  
**Branch:** `feat/field-platform-forms-documents-adoption`  
**Staging baseline:** `27e092bbf` (includes PR #121 canonical data-provider foundation)  
**Predecessor:** [field-platform-consumer-convergence.md](./field-platform-consumer-convergence.md)  
**Data Model:** **FROZEN** — no workspace changes in this sprint

---

## Executive summary

Forms and Documents share a **single intake field path**: `FormSchemaV1.fields[]` with per-field `field_source`, optional `document_composition` for presentation, and packet runtime via `shared_values`. The **live authoring picker** still reads the static **`OPERATIONAL_FORM_SYSTEM_FIELDS`** catalog. A registry-first path (`useFormSystemFieldPicker` → `buildFormSystemFieldPicker`) exists but is **not wired** into `DocumentCompositionEditor` / `useFormSchemaFieldAuthoring`.

A **parallel legacy track** (`document_field_definitions` / `document_field_values`) serves upload extraction by `doc_type` and is **not** integrated with Forms bindings or the canonical provider registry.

**Recommendation:** Migrate Forms and Documents **together in one adoption program** (shared editor, shared binding grain, shared publish validation). Splitting would duplicate picker wiring and binding adapters. Start with **P0 picker adoption**, then binding compatibility, then relationship/collection/repeatable semantics.

**Migration risk rating:** **Medium–High** — bindings are embedded in immutable published `schema_json`, entity vocabulary is dual (`guardian`/`child` vs `person`/`customer_member`), and Processing uses a third binding dialect.

---

## 1. Current architecture

Forms/Documents field architecture has **three partially overlapping tracks**:

| Track | Purpose | Source of truth | Field identity |
| --- | --- | --- | --- |
| **A — Forms-native intake** | Public forms, packets, document composition | `form_definition_versions.schema_json` | `field_source` on each `FormField` |
| **B — Packet orchestration** | Multi-step enrollment / POS packets | `form_packet_sessions.shared_values` + per-step submissions | Same `field_source`; dedupe via `packetFieldPlan` |
| **C — Legacy upload extraction** | AI/manual extraction on uploaded docs | `document_field_definitions` + `document_field_values` | Per-`doc_type` field keys (parallel schema) |

**Canonical data-provider foundation (PR #121)** applies to Queue Rows only today. Forms/Documents declare `forms` and `documents` surfaces in `consumerProviderCapabilities.ts` but **no UI reads `canonicalDataProviderRegistry`**.

### Architecture diagram

```text
field_definitions (org DB)
        ↓ (intended)
formFieldRegistryPicker / canonicalDataProviderRegistry
        ↓ (NOT wired in live editor)
OPERATIONAL_FORM_SYSTEM_FIELDS  ←── DocumentCompositionEditor (live)
        ↓
FormField.field_source → schema_json
        ↓
form_submissions.payload + packet shared_values
        ↓
Prefill / intake apply / Processing handoff

Parallel: document_field_definitions → document_field_values (upload track)
```

---

## 2. End-to-end field flow (15 stages)

| Stage | Source of truth | Key files |
| --- | --- | --- |
| **1. Field picker** | Static `OPERATIONAL_FORM_SYSTEM_FIELDS` (live); registry-first hook exists | `DocumentCompositionEditor.tsx`, `useFormSchemaFieldAuthoring.ts`, `formFieldRegistryPicker.ts`, `useFormSystemFieldPicker.ts` |
| **2. Search and grouping** | Forms-local entity groups | `formFieldAuthoringPresentation.ts` → `groupSystemFieldsForPicker()` |
| **3. Entity selection** | Forms UI grains: `guardian`, `child`, `enrollment`, `opportunity`, `customer` | `systemFieldRegistry.ts`, matrix `formsEntityTypeFromFieldDefinitionEntity()` |
| **4. Category display** | Composition blocks + forms optgroups — **not** Data Model categories | `documentComposition.ts`, `formFieldAuthoringPresentation.ts` |
| **5. Choice-option display** | Inline `static_options` in authoring; registry path reads `config.options` / `option_set_key` | `FormFieldAuthoringCard.tsx`, `fieldDefToFormRegistryEntry()` |
| **6. Field insertion** | `formFieldFromRegistryEntry()` → new `FormField` with `field_source` | `systemFieldToFormField.ts`, `useFormSchemaFieldAuthoring.ts` |
| **7. Stored binding format** | Embedded in `schema_json.fields[].field_source` | `schema.ts` (`formFieldSourceSchema`) |
| **8. Saved-form hydration** | Load draft/published version `schema_json`; resolve registry entry by legacy id | Admin API, `registryEntryForFormField()` |
| **9. Preview rendering** | `DocumentCompositionPreview` + `FormEngineRenderer` | `documentCompositionPreviewPresentation.ts` |
| **10. Published runtime rendering** | Frozen published `schema_json` | Public form routes |
| **11. Value prepopulation** | `resolveFormPrefillValues` from `field_source` → CRM rows | `prefill/canonicalPrefillMap.ts`, `prefill/resolveFormPrefillValues.ts` |
| **12. Submission storage** | `form_submissions.payload` `{ values, groups?, signatures?, meta? }` | `validateSubmission.ts` |
| **13. Processing mapping** | Walk `field_source` on schema; no `@/lib/fields` in Processing UI | `approveHandoff.ts`, `questionResolutionModel.ts` |
| **14. Document/packet output** | PDF slots, generated PDFs, packet review rollup | `pdf_mapping_json`, `createGeneratedPdfForSubmission.ts` |
| **15. Validation and publish guards** | `validateFormSchema`, POS binding gate | `validatePosConnectedFieldBinding.ts`, publish API routes |

---

## 3. Picker sources

| Source | Classification | Used by live picker? |
| --- | --- | --- |
| `OPERATIONAL_FORM_SYSTEM_FIELDS` | **Duplicate catalog to remove** (after registry wired) | **Yes** — primary live source |
| `field_definitions` via `/api/admin/field-definitions` | **Canonical source** | Hook only (`useFormSystemFieldPicker`) |
| `buildFormSystemFieldPicker()` | **Canonical adapter** | Tests + `canonicalFormsBuilderFields()` |
| `formFieldRegistryPicker.ts` | **Canonical adapter** | Not mounted in editor |
| `canonicalDataProviderRegistry` | **Canonical source** (platform) | Not consumed by Forms UI |
| `PROCESSING_BUILDER_CANONICAL_FIELDS` | **Duplicate catalog** | Processing form builder only |
| `canonicalBindingSuggestions` | **Canonical adapter** (inference) | PDF import / POS draft only |
| `CHILDCARE_STARTER_FIELD_CATALOG` | Canonical (layout) | Not forms picker |
| `document_field_definitions` | **Separate domain** (upload) | Legacy admin document-fields UI |

---

## 4. Resolver sources

| Resolver | Scope | Classification |
| --- | --- | --- |
| `fieldResolverRegistry` → `resolveForms` / `resolveDocuments` | Declares forms_registry ownership | **Canonical** (declared, lightly used) |
| `resolveFormPrefillValues` | Server prefill from CRM FK context | **Consumer runtime adapter** |
| `canonicalPrefillMap` | Maps `field_source` → column paths | **Canonical adapter** |
| `packetFieldPlan` | Dedupe identity from `field_source` | **Consumer runtime adapter** |
| `questionResolutionModel` | PDF question → `field_source` | **Consumer-local** (Processing dialect) |
| `extractBoundPerson` | Submission → person fields via schema walk | **Consumer runtime adapter** |
| `formFieldCaptureIndex` | Lifecycle coverage index | **Canonical adapter** (lifecycle bridge) |

Forms **do not** call `canonicalDataProviderRegistry` or `queueRowRuntimeResolution` at runtime. Resolution is **`field_source`-driven**, not provider-refKey-driven.

---

## 5. Renderer / control sources

| Concept | Implementation | Field Platform? |
| --- | --- | --- |
| Text, number, date, select, etc. | `FormField.type` + `FormEngineRenderer` | Control types — **not providers** |
| Signature | `type: "signature"` + `formSignatureConfigSchema` | **Composition block / control** |
| Text block / heading / divider | `document_composition` blocks | **Composition blocks** |
| Repeatable group | `type: "group"` + `repeat: { min, max }` | **Repeatable section provider** (schema-level, not registry) |
| Field region | `document_composition.field_region` | **Layout block** referencing field ids |
| PDF region map | `pdf_slot`, `pdf_mapping_json` | **Output mapping** — not field truth |

**Hard rule:** Headings, paragraphs, instructions, signatures, acknowledgements, page breaks, upload controls, consent blocks, and static text remain **composition blocks/controls** — they must **not** enter the Field Platform provider registry.

---

## 6. Storage formats

### 6.1 Form schema binding (primary)

**Table:** `form_definition_versions.schema_json` (JSONB)

```json
{
  "schema_version": 1,
  "fields": [{
    "id": "guardian_email",
    "type": "text",
    "label": "Guardian email",
    "field_source": {
      "entity_type": "guardian",
      "field_key": "guardian_email",
      "shared_value_key": "guardian_email",
      "crm_mapping_key": "guardian.email"
    }
  }],
  "document_composition": {
    "version": 1,
    "blocks": [{ "type": "field_region", "field_ids": ["guardian_email"] }]
  }
}
```

| Property | Assessment |
| --- | --- |
| Stable identity | **Partially** — `field_source.entity_type` + `field_key` stable; forms UI vocabulary differs from DB |
| Load after migration | **Yes with adapter** — preserve `field_source` shape; map picker to canonical providers |
| Adapter required | **Yes** — translate provider refKey ↔ legacy `field_source` at picker boundary |
| Destructive migration | **Not justified** in P0–P2 |

### 6.2 Repeatable group payload

```json
{
  "values": { "guardian_email": "a@b.com" },
  "groups": {
    "children": [{
      "instance_key": "row-1",
      "values": { "child_first_name": "Sam" }
    }]
  }
}
```

Bound to schema `type: "group"` nodes — **not** indexed Child 1 / Child 2 fields.

### 6.3 Packet session

| Column | Role |
| --- | --- |
| `form_packet_sessions.shared_values` | Cross-step answer bag (field-id keyed) |
| `form_packet_sessions.crm_snapshot` | FK continuity (person, customer, member, opportunity) |
| `launch_context.prefill_field_map` | Explicit prefill overrides |

Dedupe identity: `shared_value_key` → alias; else `entity_type:field_key` canonical (`packetFieldPlan.ts`).

### 6.4 Legacy document extraction

| Table | Shape |
| --- | --- |
| `document_field_definitions` | `(org_id, doc_type, field_key, field_label, field_type, …)` |
| `document_field_values` | Per-document typed value columns |

**Not interoperable** with `field_source` without explicit bridge (Entity Model gap).

### 6.5 Processing draft → form

POS recreation materializes `field_source` via `draftFormToFormSchemaV1.ts` after `questionResolutionModel` / `canonicalBindingSuggestions`. Dialect may use `guardian`/`child` or `person`/`customer_member` depending on path.

---

## 7. Entity model findings

| Question | Finding | Category |
| --- | --- | --- |
| Is `guardian` a real entity? | **No** — operator-facing alias for **`person`** in forms UI | **Entity Model** |
| Is `child` standalone? | **No** — alias spanning **`customer_member`** (identity) and **`inquiry_child`** (enrollment) | **Entity Model** |
| What owns household values? | **`customer`** entity (`customer.display_name`, etc.) | **Entity Model** |
| What owns enrollment values? | **`inquiry_child`** (+ `opportunity` for lead-level) | **Entity Model** |
| What owns contact responsibility? | **`person`** with relationship roles (primary, emergency, billing) | **Field Platform + Entity Model** |
| Current classroom / program? | **`inquiry_child.program*`** / placement fields — enrollment grain | **Consumer Adoption** |
| Multiple enrollments? | Per `inquiry_child` row; forms split identity vs enrollment keys | **Entity Model** |
| “Child this packet is about”? | `crm_snapshot.customer_member_id` + launch context | **Consumer Adoption** |
| “All children in household”? | Repeatable `groups` + `meta.intake.children[]` — not a flat field list | **Consumer Adoption** |

**Critical:** Display entity terminology (`guardian`, `child`, `enrollment`) is used as **storage identity in `field_source`**, while authoritative DB grain is `person` / `customer_member` / `inquiry_child`. The **`fieldRegistryReferenceMatrix`** bridges this but is **not applied uniformly** at publish/save.

---

## 8. Relationship and collection model

| Concept | Current representation | Must become |
| --- | --- | --- |
| Primary Contact Email | `field_source: { entity_type: "guardian", field_key: "guardian_email" }` | **Relationship-derived leaf** with lineage to primary contact role |
| Secondary / Emergency / Billing | Same pattern with guardian/enrollment aliases | **Relationship leaves** per role |
| One child | Scalar child fields bound to `customer_member` / `child` alias | **Business fields** on child grain |
| Multiple children | `type: "group"` + `repeat` + `payload.groups` | **Collection-bound repeatable section** |
| Siblings | Not first-class in forms schema today | **Collection provider** (future — mirror queue row sibling registry) |
| Household members | Customer + person fields; no collection block in UI | **Collection + repeatable section** (gap) |
| Packet cross-step dedupe | `shared_value_key` + canonical entity:field_key | Preserve; align keys with provider refKeys |

**Hard requirements validated in code:**

- Repeatable groups exist in `schema.ts` (`formRepeatRulesSchema`, group field type).
- `packetFieldPlan.ts` explicitly excludes structural/group fields from dedupe planning today.
- Composition editor **does not expose** repeatable group authoring in UI (demo seeds only).

---

## 9. Repeatable section model

| Layer | Mechanism |
| --- | --- |
| Schema | `FormField` with `type: "group"`, nested `fields[]`, optional `repeat: { min, max }` |
| Payload | `FormPayload.groups[groupId]: FormPayloadGroupRow[]` with `instance_key` |
| PDF paths | e.g. `groups.medications.0.values.med_name` |
| Composition UI | **Not exposed** — repeatable authoring is seed/demo level |
| Collection binding | **Missing explicit metadata** linking group → `children` collection provider |

**Required adoption outcome:** A repeatable child section must declare **collection lineage** (e.g. `collection_ref: "children"`, iteration context) — not fixed indexed fields.

---

## 10. Compatibility risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Dual entity vocabulary in saved `field_source` | **High** | Legacy adapter + matrix normalization at publish; do not rewrite published schemas |
| Editor not on registry-first picker | **High** | P0 wire `useFormSystemFieldPicker` |
| POS binding validator rejects guardian-scoped keys | **Medium** | Normalize to DB entity types at validate time |
| `registryEntryForField` only matches legacy catalog ids | **Medium** | Extend lookup via `registryEntryForFormField()` |
| `document_field_definitions` parallel schema | **Medium** | Document bridge strategy; no delete in P0 |
| Processing dialect split (`questionResolutionModel` vs suggestions) | **Medium** | Unify through matrix at draft materialization |
| Repeatable groups without collection metadata | **Medium** | P2 schema extension (adapter-only first) |
| Choice options inline vs `field_definitions.config` | **Low** | Read canonical options when binding to registry field |

---

## 11. Proposed consumer capability matrix

Current declaration (`FORMS_CAPABILITY` / `documents`):

- pickerKinds: `business_field`, `platform_field` only
- No relationships, collections, runtime signals

**Proposed `forms_documents` capability (phased — for audit, not implemented):**

### Phase P0 — Scalar business/platform adoption (matches current declaration)

| Kind | Picker | Publish | Notes |
| --- | --- | --- | --- |
| business_field | yes | yes | From `field_definitions` |
| platform_field | yes | yes | Native columns via registry |
| calculated_field | no | no | Exclude until write-target rules exist |
| runtime_signal | no | no | Display-only; not form capture |
| relationship | no | no | P2 |
| collection | no | no | P2 |

### Phase P2 — Relational and repeatable (target state)

| Kind | Picker | Publish | Notes |
| --- | --- | --- | --- |
| relationship (leaf) | yes | yes | e.g. Primary Contact → Email; lineage required |
| collection (projection) | no | no | Count/summary not form fields |
| repeatable section provider | yes | yes | **Not a provider kind** — separate `RepeatableSectionBinding` metadata linked to collection provider |
| whole collection | no | no | Section binds to collection; fields bind inside iteration |

### Form/document block concepts (never providers)

`heading`, `paragraph`, `instructions`, `signature`, `acknowledgement`, `divider`, `spacer`, `image`, `field_region`, `text_block`, upload controls, consent blocks.

---

## 12. Duplicate catalogs to remove (post-adoption)

| Catalog | Action |
| --- | --- |
| `OPERATIONAL_FORM_SYSTEM_FIELDS` | Demote to **legacy compatibility adapter** after picker wired |
| `PROCESSING_BUILDER_CANONICAL_FIELDS` | Derive from provider registry |
| Forms-local entity labels in `formFieldAuthoringPresentation.ts` | Replace with `configurationEntityCatalog` |
| Inline static select options when registry field has options | Read canonical `config.options` |

**Keep as adapters (not removed):**

- `fieldRegistryReferenceMatrix` — id/ref translation
- `field_source` embedded bindings — persisted format
- `document_composition` — presentation layer

---

## 13. Canonical platform gaps

| Gap | Category | Smallest fix |
| --- | --- | --- |
| No `buildFormsProviderSeeds()` derivation module | **Field Platform** | Mirror `canonicalQueueRowProviderDerivation.ts` for forms grains |
| Forms UI not reading `canonicalDataProviderRegistry` | **Consumer Adoption** | Wire picker |
| Repeatable section ↔ collection lineage type | **Field Platform** | Extend model with `RepeatableSectionBinding` |
| `document_field_definitions` parallel schema | **Entity Model** | Bridge doc or deprecation plan |
| Relationship leaves excluded from FORMS_CAPABILITY | **Field Platform** | Expand capability in P2 |
| Delete-safety scans skip form schemas | **Field Platform** | Extend delete-safety to form_definition_versions |
| Processing not in `fieldSurfaceAvailability` | **Consumer Adoption** | Register processing consumer |

---

## 14. Findings by audit category

### Consumer Adoption (primary)

- Live picker uses static catalog; registry-first path exists but unwired.
- Forms and Documents share one editor — must migrate together.
- Packet runtime is binding-compatible if `field_source` keys stay stable.
- Prefill and intake already walk `field_source` — good adapter seam.

### Entity Model

- `guardian` / `child` / `enrollment` are **presentation grains**, not storage entities.
- Child identity vs enrollment split (`customer_member` vs `inquiry_child`) must persist.
- `document_field_definitions` is a parallel schema for upload extraction.

### Field Platform

- `canonicalDataProviderRegistry` ready but forms-capability is scalar-only.
- Need forms-specific derivation (not queue row seeds).
- Relationship/collection provider kinds exist platform-wide but forms capability blocks them.

### Configuration Workspace Doctrine

- Forms picker groups do not use Data Model categories/entity catalog.
- Choice options often inline instead of canonical option sets.

---

## 15. Recommended implementation sequence

Evidence-based order (adjust after P0 spike):

| Phase | Scope | Rationale |
| --- | --- | --- |
| **P0 — Picker adoption** | Wire `useFormSystemFieldPicker` into `DocumentCompositionEditor` / `useFormSchemaFieldAuthoring`; add `buildFormsProviderSeeds()` or filter registry for forms grains | Unblocks org custom fields; removes live dependency on static catalog |
| **P1 — Binding compatibility** | Preserve `field_source` on save; adapter maps provider selection → existing shape; extend `registryEntryForFormField` | Zero destructive migration |
| **P1b — Publish validation** | Normalize entity types via matrix in `validatePosConnectedFieldBinding`; provider eligibility gate | Prevents invalid bindings |
| **P2 — Relationship leaves** | Allow relationship-derived scalars in picker; store lineage in `field_source` extension or `crm_mapping_key` convention | Primary Contact Email retains role lineage |
| **P2b — Repeatable sections** | Expose group/repeat in composition UI with collection binding metadata | Multi-child without indexed fields |
| **P3 — Resolver convergence** | Route prefill through provider-aware paths where applicable; keep form controls separate | Reduce duplicate resolution |
| **P4 — Processing + documents bridge** | Unify Processing builder + `questionResolutionModel` dialect; plan `document_field_definitions` bridge | Largest cross-surface blast radius |

**Do not start with Processing full migration** — Forms/Documents picker + binding compatibility first.

---

## 16. Exact proposed files to change (implementation — not done in audit)

### P0 — Picker

| File | Change |
| --- | --- |
| `web/components/admin/forms/documentComposition/DocumentCompositionEditor.tsx` | Replace static catalog prop with `useFormSystemFieldPicker()` |
| `web/lib/forms/useFormSchemaFieldAuthoring.ts` | Accept dynamic picker list; fix `registryEntryForField` lookup |
| `web/lib/fields/formFieldRegistryPicker.ts` | Bridge to `filterCanonicalDataProviders({ consumer: "forms" })` |
| `web/lib/fields/canonicalFormsProviderDerivation.ts` | **New** — forms-specific seed derivation (mirror queue pattern) |
| `web/lib/fields/consumerProviderCapabilities.ts` | Refine `forms` / `documents` capabilities |
| `web/lib/fields/canonicalBuilderFieldLibrary.ts` | Unify `canonicalFormsBuilderFields()` with registry |

### P1 — Binding compatibility

| File | Change |
| --- | --- |
| `web/lib/forms/systemFieldToFormField.ts` | Map provider → `field_source` with matrix |
| `web/lib/forms/schema.ts` | Optional lineage extension on `FormFieldSource` |
| `web/lib/forms/binding/validatePosConnectedFieldBinding.ts` | Normalize entity types via matrix |
| `web/lib/fields/fieldRegistryReferenceMatrix.ts` | Ensure forms id ↔ provider refKey round-trip |

### P2 — Relationship / collection

| File | Change |
| --- | --- |
| `web/lib/forms/documentCompositionAuthoring.ts` | Repeatable section authoring |
| `web/lib/forms/schema.ts` | Collection binding on group fields |
| `web/lib/pos/packet/packetFieldPlan.ts` | Include group/collection-aware dedupe |

### Tests (required)

| Test file | Coverage |
| --- | --- |
| `tests/fields/formFieldRegistryPicker.test.ts` | Extend for provider bridge |
| `tests/forms/documentCompositionEditor.test.tsx` | Picker uses registry |
| `tests/forms/adminGeneratedKeysAndSystemFields.test.ts` | Binding round-trip |
| `tests/fields/canonicalDataProviderRegistry.test.ts` | Forms consumer filter |
| **New** `tests/fields/formsProviderEligibility.test.ts` | Capability gates |
| **New** `tests/forms/formFieldSourceLineage.test.ts` | Relationship leaf lineage preserved |
| `tests/forms/formSchemaValidation.test.ts` | Publish guards |
| `tests/pos/packetFieldPlan.test.ts` | Dedupe with new binding keys |

---

## 17. Tests required (summary)

- Registry-first picker mounted in document editor (component test)
- Saved `field_source` shape unchanged after picker migration (compat test)
- Legacy `OPERATIONAL_FORM_SYSTEM_FIELDS` ids still resolve via adapter
- Org custom `field_definitions` appear in picker
- Relationship leaf selection preserves lineage metadata
- Repeatable group payload shape unchanged
- Packet `shared_values` dedupe still works
- POS publish validation accepts normalized bindings
- `canonicalDataProviderRegistry` forms filter excludes runtime signals and composition blocks

---

## 18. Explicit non-goals

- Redesign Forms or Documents UI
- Redesign Data Model workspace
- Full Processing migration
- Focus Panel or Communications token migration
- Delete `document_field_definitions` table
- Destructive rewrite of published `schema_json`
- Flatten collections or create Child 1 / Child 2 indexed fields
- Add signatures/headings/instructions as Field Platform providers
- Merge document composition into provider registry
- Create a second parallel Forms provider catalog
- Implementation before audit review (this document)

---

## 19. Forms vs Documents — together or separate?

**Recommendation: migrate together.**

| Reason | Detail |
| --- | --- |
| Shared editor | `DocumentCompositionEditor` serves Forms Builder and document composition |
| Shared binding grain | Identical `field_source` on `FormField` |
| Shared picker hook | Same `useFormSchemaFieldAuthoring` code path |
| Shared publish validation | Same `validateFormSchema` + POS binding |
| Documents-only delta | `document_composition` blocks are presentation — no separate provider catalog |

**Optional sub-pass:** Legacy upload `document_field_definitions` bridge may follow as **P4** after shared intake path converges.

---

## Appendix A — Field source classification table

| Source | Classification |
| --- | --- |
| `field_definitions` | Canonical source |
| `formFieldRegistryPicker` / `useFormSystemFieldPicker` | Canonical adapter |
| `fieldRegistryReferenceMatrix` | Canonical adapter |
| `OPERATIONAL_FORM_SYSTEM_FIELDS` | Duplicate catalog → legacy compat |
| `field_source` on schema | Consumer persistence format (stable) |
| `document_composition` blocks | Consumer-local presentation metadata |
| `document_field_definitions` | Separate domain (not a field provider) |
| `questionResolutionModel` | Consumer-local (Processing) |
| `canonicalBindingSuggestions` | Canonical adapter (inference) |
| `canonicalDataProviderRegistry` | Canonical source (unwired) |
| Signature / heading / text blocks | Separate domain concept (not a field) |
| Repeatable `group` fields | Repeatable section provider (schema) |
| Packet `shared_values` | Consumer runtime adapter |

---

## Appendix B — Runtime scenario matrix

| Scenario | Binding context | Resolver | Write target |
| --- | --- | --- | --- |
| Blank public lead form | No CRM FKs | None / defaults | `form_submissions.payload` |
| Known household form | `person_id`, `customer_id` in session | `resolveFormPrefillValues` | Payload + CRM apply |
| Single-child packet | `crm_snapshot.customer_member_id` | Prefill + shared_values | Payload + snapshot merge |
| Multi-child packet | Repeatable groups + intake meta | Group payload paths | `customer_members` via intake |
| PDF upload recreation | Processing case draft | `questionResolutionModel` | New form schema |
| Processing submission | Schema walk on `field_source` | `extractBoundPerson` | persons / members |
| Published document output | PDF mapping slots | Template fill | Generated PDF artifact |

---

## Appendix C — PR #121 promotion record

| Item | Value |
| --- | --- |
| PR | #121 merged 2026-07-10 |
| Merge commit | `27e092bbf0d06abcc5ebaae9a32ef64051035b97` |
| Rebased PR head (pre-merge) | `950200106` |
| Staging before merge | `331054a8a` (PR #122) |
| Post-merge staging | `27e092bbf` |
| CI (final) | typecheck pass, Vercel pass |

---

*Audit complete. No product code changed. Document not committed — awaiting review.*
