# Field Platform Consumer Convergence — Queue Rows Foundation

**Status:** Active — July 2026 (hardening pass complete)  
**Sprint:** First consumer convergence sprint  
**Staging baseline (rebase target):** `3d08a24d92f524e1a7501f72b935b1da40bb55be`  
**Predecessor:** [field-platform-consumer-audit.md](./field-platform-consumer-audit.md)

---

## Summary

This sprint establishes the **canonical data-provider model** and proves it through **Queue Rows** — the first live consumer migration off parallel static catalogs.

The hardening pass removed the static `anchorScalars` seed list and replaced it with **`canonicalQueueRowProviderDerivation.ts`**, which adapts existing platform sources. The seed layer classifies and enriches; it does **not** own field truth.

Data Model remains **FROZEN**. No other consumers migrated in this sprint.

---

## Dependency direction (required)

```text
Canonical field/entity/runtime sources
        ↓
canonicalQueueRowProviderDerivation.ts (adapter — not a catalog)
        ↓
canonicalDataProviderRegistry.ts
        ↓
consumerProviderCapabilities.ts
        ↓
Consumer picker / validator (compositionFieldAdapter, queueRecordValidatorAllowList)
        ↓
queueRowRuntimeResolution.ts → fieldResolverRegistry.ts (shared resolver architecture)
        ↓
Consumer renderer (queue record scoped resolve, collection presentation)
```

**Consumer code must not flow upward and redefine canonical provider truth.**

---

## Canonical source derivation map

| Provider refKey (examples) | Canonical source | Module |
| --- | --- | --- |
| `person.primary_contact_name` | Contact role catalog | `layoutEditorContactRoles.ts` |
| `person.primary_email` | Contact role catalog | `layoutEditorContactRoles.ts` |
| `children` (whole collection) | Children collection registry | `queueRowChildrenFieldRegistry.ts` |
| `children.count` | Collection projection registry | `queueRowChildrenFieldRegistry.ts` |
| `sibling.count` | Sibling collection registry | `queueRowSiblingFieldRegistry.ts` |
| `household.otherChildren` | Sibling/household registry | `queueRowSiblingFieldRegistry.ts` |
| `queue_row.work_summary` | Queue presentation + layout defaults | `fieldPickerContextCatalog.ts`, `queueRecordLayoutV3.ts` |
| `opportunity.current_work` | Computed field catalog (runtime signal) | `computedFieldCatalog.ts` |
| `child.age` | Computed field catalog (calculated/planned) | `computedFieldCatalog.ts` |
| `child.medical_summary` | Child summary registry (runtime projection) | `queueRowChildSummaryFieldRegistry.ts` |
| `child.status`, `child.program` | Queue presentation overrides + alias-safe enrichment | `fieldPickerContextCatalog.ts`, `platformFieldResolutionManifest.ts` |
| `waitlist.positionLabel` | Waitlist placement registry | `queueWaitlistPlacementField.ts` |
| Default layout scalars | Queue layout defaults | `queueRecordLayoutV3.ts` |
| Evidence group default keys | Composition evidence registry | `compositionEvidenceGroupRegistry.ts` |
| `person.preferred_language` (tenant) | field_definitions | `tenantLayoutFieldPickerCatalog.ts` |
| `contact.email` | Legacy compatibility only | `queueRowLegacyCompatibility.ts` |

**Removed anti-pattern:** ~60-entry static `anchorScalars` list in seeds — replaced by union of canonical ref-key sources above.

---

## Provider identity rules

1. **refKey is stable** — not derived from labels, categories, array indexes, or UI grouping.
2. **Alias reads preserve refKey** — e.g. `child.program` enriches from `inquiry_child.program_category_id` manifest metadata but keeps refKey `child.program` for saved layouts.
3. **Relationship leaves retain lineage** — `person.primary_contact_name` carries `relationship_id: person.contact_role.primary`.
4. **Collection projections retain lineage** — `children.count` carries `collection_ref: children`, `projection: count`.
5. **Runtime signals are not business fields** — `queue_row.work_summary` kind = `runtime_signal`, not `business_field`.
6. **Whole collections** — kind `collection`, shape `collection`; excluded from Queue Row picker/publish unless projected.

---

## Relationship and collection lineage

| Concept | Kind | Owning entity | Target / role | Shape | Projections | Resolver owner | Queue Row supported | Unsupported |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Children** | collection | child | household children | collection | count, names, summary | `queueRowChildrenFieldRegistry.ts` | projections + legacy `children` object | whole collection in picker |
| **Siblings** | collection | queue_row | waitlist sibling context | scalar projections | count, names, enrolled, … | `queueRowSiblingFieldRegistry.ts` | waitlist projections | pipeline layouts |
| **Household Members / Other Children** | collection | queue_row | household | scalar (`otherChildren`) | — | `queueRowSiblingFieldRegistry.ts` | waitlist | pipeline |
| **Primary Contact** | relationship | person | primary role | scalar leaves | name, email, phone | `layoutEditorContactRoles.ts` | all leaves | relationship object |
| **Secondary Contact** | relationship | person | parents/secondary role | scalar leaves | name, email, phone | `layoutEditorContactRoles.ts` | all leaves | — |
| **Guardian** | relationship | person | parents role | scalar leaves | name, email, phone | `layoutEditorContactRoles.ts` | all leaves | — |
| **Emergency Contact** | relationship | person | emergency role | scalar leaves | name, email, phone | `layoutEditorContactRoles.ts` | all leaves | — |
| **Billing Contact** | relationship | person | billing role | scalar leaves | name, email, phone | `layoutEditorContactRoles.ts` | all leaves | — |
| **Current Classroom / Program** | business_field / inquiry_child | child / inquiry_child | enrollment grain | scalar | — | manifest + childcare catalog | scalar refs | — |
| **Current Work** | runtime_signal | opportunity / queue_row | work runtime | scalar | — | `computedFieldCatalog.ts`, queue scoped resolve | `queue_row.work_summary`, `opportunity.current_work` | — |
| **Documents** | runtime_signal | child | evidence summaries | scalar | documents_summary | `queueRowChildSummaryFieldRegistry.ts` | compact summary | full document objects |
| **Communications** | runtime_signal | child | comms thread | scalar | communications_summary | queue scoped resolve | summary projection | full thread in queue row |

---

## Queue Row capability gates

Eligibility is evaluated in `queueRowProviderEligibility.ts` — **not** a single boolean allow-list.

| Gate | Check |
| --- | --- |
| 1. Provider exists | Registry seed, tenant merge, or legacy compat |
| 2. Context availability | `availability.pipeline` / `availability.waitlist` |
| 3. Consumer kind support | `consumerProviderCapabilities.ts` |
| 4. Consumer shape support | scalar projections vs whole collection |
| 5. Resolver metadata | manifest phase, computed resolver_status, registry ownership |
| 6. Legacy rules | legacy-only refs excluded from picker |
| 7. Publish vs picker | whole `children` collection blocked from picker |

**Distinguishable exclusion reasons:** `unknown_provider`, `wrong_context`, `unsupported_kind`, `unsupported_shape`, `missing_resolver`, `legacy_only`, `whole_collection_without_renderer`, `consumer_capability_blocked`.

---

## Legacy compatibility matrix

| Legacy refKey | Original source | Canonical replacement | Resolves | Publishes | New pickers | Deprecation |
| --- | --- | --- | --- | --- | --- | --- |
| `contact.first_name` | `QUEUE_FIELD_CATALOG` | `person.primary_contact_name` | yes | yes | no | legacy_compat |
| `contact.last_name` | `QUEUE_FIELD_CATALOG` | `person.primary_contact_name` | yes | yes | no | legacy_compat |
| `contact.email` | `QUEUE_FIELD_CATALOG` | `person.primary_email` | yes | yes | no | legacy_compat |
| `contact.phone` | `QUEUE_FIELD_CATALOG` | `person.primary_phone` | yes | yes | no | legacy_compat |
| `person.date_of_birth` | `QUEUE_FIELD_CATALOG` | — | yes | yes | no | legacy_compat |
| `person.role_label` | `QUEUE_FIELD_CATALOG` | `person.role` | yes | yes | no | legacy_compat |
| `person.address_line` | `QUEUE_FIELD_CATALOG` | `person.address_line1` | yes | yes | no | deprecated_alias |

**Trimmed from legacy list (now canonical providers):** all `person.primary_*`, `person.secondary_*`, `person.billing_*`, `person.emergency_*`, `household.otherChildren`.

---

## Resolver and renderer responsibilities

| Layer | Responsibility |
| --- | --- |
| `fieldResolverRegistry.ts` | Shared “can surface resolve field?” — queue_row delegates to `queueRowRuntimeResolution` |
| `queueRowRuntimeResolution.ts` | Orchestrates publish/eligibility gate (breaks validator cycle) |
| `queueRecordScopedResolve.ts` | Queue Row runtime value resolution |
| `queueRowChildrenFieldRegistry.ts` | Collection + active child field resolution |
| `collectionFieldPresentation.ts` | Collection rendering — no silent count flattening |
| `compositionFieldAdapter.ts` | Picker availability only — no hidden fetching |

**No second resolver system.** Queue Row rendering does not embed provider-specific logic in generic UI components.

---

## Remaining canonical-source gaps

| Gap | Status | Smallest correct source added |
| --- | --- | --- |
| Child summary projections (`child.medical_summary`, etc.) | Documented | `queueRowChildSummaryFieldRegistry.ts` |
| Full child summary resolver wiring | Future | Focus Panel evidence modules own read paths today |
| Calculated field formula builder | Planned | `computedFieldCatalog.ts` + concept audit |

---

## Validation results (hardening pass)

| Check | Result |
| --- | --- |
| Focused sprint tests (4 files) | **104/104 pass** |
| `tests/fields` | **417/418 pass** — 1 pre-existing failure |
| `tests/layout/queueRecordFieldPickerCatalog.test.ts` | pass |
| Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck`) | **pass** |

**Pre-existing failure (staging baseline confirmed):** `tests/fields/dataModelFinishPass.test.ts` — Focus Panel builder missing `availabilityConcept` wiring (out of sprint scope).

**Pre-existing staging layout noise:** broader `tests/layout` includes failures on current `origin/staging` (e.g. `builder.test.ts`, `adornment.test.ts`) unrelated to this sprint.

---

## Consumer migration rules (next consumers)

1. Declare capabilities in `consumerProviderCapabilities.ts`.
2. Filter registry via `filterCanonicalDataProviders` — do not fork catalogs.
3. Publish validation derives from `publishable*` helpers or consumer-specific eligibility module.
4. Legacy compat only for saved configs — never for new pickers.
5. Preserve relationship/collection lineage metadata in published configs.

**Next consumer after merge:** **Forms / Documents** (`useFormSystemFieldPicker` seam exists; UI not wired).

---

## Key files

| Module | Path |
| --- | --- |
| Provider model types | `web/lib/fields/canonicalDataProviderModel.ts` |
| Derivation adapter | `web/lib/fields/canonicalQueueRowProviderDerivation.ts` |
| Consumer capabilities | `web/lib/fields/consumerProviderCapabilities.ts` |
| Seeds re-export | `web/lib/fields/canonicalDataProviderSeeds.ts` |
| Provider registry | `web/lib/fields/canonicalDataProviderRegistry.ts` |
| Eligibility gates | `web/lib/fields/queueRowProviderEligibility.ts` |
| Legacy compat | `web/lib/fields/queueRowLegacyCompatibility.ts` |
| Runtime resolution gate | `web/lib/fields/queueRowRuntimeResolution.ts` |
| Child summary registry | `web/lib/layout/runtime/queueRowChildSummaryFieldRegistry.ts` |
| Builder library | `web/lib/fields/canonicalBuilderFieldLibrary.ts` |
| Surface Composer adapter | `web/lib/adminV2/settings/surfaces/compositionFieldAdapter.ts` |
| Publish validation | `web/lib/layout/queueRecordValidatorAllowList.ts` |

---

## Rollback considerations

- Revert PR restores static `QUEUE_FIELD_CATALOG` path in `compositionFieldAdapter.ts` and hand-maintained validator arrays.
- Saved layouts with legacy `contact.*` refs continue to work while legacy compat module is present.
- No DB migrations in this sprint — rollback is code-only.
