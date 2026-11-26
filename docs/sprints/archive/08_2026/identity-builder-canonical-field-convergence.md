# Identity Builder — Canonical Field Consumer Convergence

**Status:** P0 complete — July 2026  
**Consumer priority:** 1 (Focus Panel / Identity Surfaces)  
**Predecessor:** [field-platform-consumer-audit.md](./field-platform-consumer-audit.md)

---

## Answer

**If I create a new field in `/settings/fields`, how many Identity Builder files must change?**

**Zero.** Custom fields flow:

```text
/settings/fields
→ field_definitions (+ section_key category)
→ canonicalDataProviderRegistry / platformFieldCatalog
→ assembleFocusPanelNestedProviders (focus_panel consumer)
→ card + nested Identity pickers
→ persisted refKey
→ Identity runtime (labels, values, edit bindings)
→ canonical mutation path
```

---

## Previous architecture

| Layer | Source | Drift |
| --- | --- | --- |
| Nested picker | `queue_row` consumer filter | Wrong capability gate |
| Card picker | `CONCEPT_TREE` concept paths | Parallel field catalog |
| Focus Panel assembly | `assembleFocusPanelNestedProviders` | Unwired dead code |
| Platform natives | `platformFieldCatalog` | Not merged into picker |
| Categories | Evidence group keys / `general` | Ignored tenant `section_key` |
| Runtime labels | `CHILD_FOCUS_FIELD_DEFS`, local maps | Copied field metadata |
| Runtime edit | Hardcoded save matrices | Redefined mutation targets |
| Ghost fields | Default key fallback on `[]` | Removed fields reappeared |

---

## Final canonical architecture

```text
/settings/fields
        ↓
platformFieldCatalog + field_definitions (section_key → categoryKey)
        ↓
canonicalDataProviderRegistry + focusPanelProviderDedup
        ↓
assembleFocusPanelNestedProviders
        ↓
├─ focusPanelCardFieldPicker (summary cards)
└─ compositionFieldAdapter → nestedSurfaceEditorModel (nested surfaces)
        ↓
Persisted refKeys (+ presentation overrides only)
        ↓
identityCanonicalFieldMetadata (labels, categories, runtime bindings)
identityFieldMutationBinding (mutation value keys)
identitySurfaceCompose (value resolution)
        ↓
Operator runtime + canonical mutation APIs
```

Identity may **filter**, **group**, **hide**, and apply **layout presentation overrides** — it must not own field identity, provider, ownership, storage, choice options, or mutation semantics.

---

## Drift removed

1. Nested and card field pickers share `assembleFocusPanelNestedProviders`.
2. Card inspector uses `availableFieldsForFocusPanelCard` (canonical), not `CONCEPT_TREE`.
3. `CONCEPT_TREE` retained only for legacy condition authoring and read-time concept resolution.
4. Legacy concept paths reconcile to refKeys via `focusPanelConceptCompat.ts` (compat boundary only).
5. Tenant `section_key` flows through layout field load → provider `categoryKey` → picker grouping.
6. Program/Name aliases deduplicated at assembly via `focusPanelProviderDedup.ts`.
7. Runtime labels from `resolveCanonicalIdentityFieldLabel` (Settings rename propagates).
8. Runtime edit from `identityFieldMutationBinding` + canonical capability (no scalar field catalog).
9. Explicit empty `selectedFieldKeys: []` no longer falls back to default ghost fields.
10. Unresolved/deleted field state via `focusPanelCardFieldResolutionState`.

---

## Card-level catalog removal

| Before | After |
| --- | --- |
| `CONCEPT_TREE` drives field picker | Canonical provider assembly drives field picker |
| Concept paths persisted as field identity | Stable `refKey` persisted; concepts compat-only |
| `focusPanelCardReference` conceptOptions | refKey-first seeds with legacy concept fallback |

Structural layout concepts (section, roster, collection container) remain Identity-owned when they are not fields.

---

## Category propagation

Path:

```text
field_definitions.section_key
→ loadTenantLayoutFieldDefinitions
→ canonicalDataProviderRegistry.tenantProviders (categoryKey)
→ AvailableField.categoryKey
→ nestedSurfaceBuilderLibrary / card picker grouping (categoryDisplayLabel)
```

Identity does not infer categories from field names, provider names, or local maps.

---

## Program / Name deduplication

`focusPanelProviderDedup.ts` collapses alias refKeys (e.g. `child.display_name` → `child.first_name`, program category aliases → `inquiry_child.program`) to one picker row per canonical identity. Registry tests prove duplicate assembly cannot surface two rows for the same identity.

---

## Runtime parity

| Concern | Module |
| --- | --- |
| Label/category | `identityCanonicalFieldMetadata.ts` |
| Edit/mutation binding | `identityFieldMutationBinding.ts` |
| Value resolution | `identitySurfaceCompose.ts` (resolver maps — value paths, not catalogs) |
| Presentation alias refs | `contact.*` → `person.*` metadata lookup |

Choice, relationship, and collection fields resolve through canonical provider output; option sets are not copied into layout config.

---

## Ghost-field root cause and fix

**Cause:** `orderedFieldKeys` / `orderedChildEditFieldKeys` treated `[]` as “use defaults”, re-appending default program/room fields after explicit removal.

**Fix:** When a published config exists, honor empty group selections; defaults apply only when `config` is null (legacy/unconfigured).

---

## Legacy compatibility

- `legacyConceptToRefKey` / `reconcileCardFieldToCanonicalRef` at read/reconcile boundaries.
- `resolveConceptValue` for records still keyed by legacy demo paths until migrated.
- Conditions inspector may still reference concept paths (non-field structural conditions).

---

## Files changed

| File | Change |
| --- | --- |
| `compositionFieldAdapter.ts` | focus_panel assembly; `categoryKey` on `AvailableField` |
| `consumerCanonicalProviderAssembly.ts` | Platform catalog merge + dedup |
| `focusPanelProviderDedup.ts` | Alias deduplication |
| `canonicalDataProviderRegistry.ts` | `section_key` → `categoryKey` |
| `loadTenantLayoutFieldDefinitions.ts` | Select/map `section_key` |
| `tenantLayoutFieldPickerCatalog.ts` | `section_key` on row type |
| `nestedSurfaceBuilderLibrary.ts` | Canonical category grouping |
| `focusPanelCardFieldPicker.ts` | Card picker from canonical assembly |
| `focusPanelConceptCompat.ts` | Legacy concept → refKey; resolution state |
| `FocusPanelCardInspector.tsx` | Canonical field picker for card fields |
| `focusPanelCardConfigModel.ts` | refKey-first label/value resolution |
| `focusPanelCardReference.ts` | refKey seeds |
| `identityCanonicalFieldMetadata.ts` | Central metadata + runtime binding |
| `identityFieldMutationBinding.ts` | Mutation value-key map |
| `childIdentityFieldRuntime.ts` | Remove label catalog; no ghost defaults |
| `childFocusFieldPolicy.ts` | Canonical labels + mutation bindings |
| `householdContactFieldPolicy.ts` | Canonical labels + mutation bindings |
| `identitySurfaceCompose.ts` | Canonical runtime labels |
| `buildIdentityCardVM.ts` | Canonical label resolution |
| `NestedSurfaceGroupInspector.tsx` | Remove hardcoded field labels |

---

## Tests

```bash
cd web && npm run test -- \
  tests/adminV2/identityBuilderCanonicalFieldConvergence.test.ts \
  tests/adminV2/identityFocusPanelFieldConsumer.test.ts \
  tests/fields/consumerCanonicalProviderAssembly.test.ts \
  tests/fields/focusPanelProviderDedup.test.ts \
  tests/adminV2/nestedSurfaceEditorModel.test.ts \
  tests/adminV2/compositionFieldAdapter.test.ts
```

Coverage includes: provider assembly, category propagation, card/nested picker parity, dedup, legacy reconcile, runtime labels, edit bindings, explicit empty config, deleted-field state.

---

## Validation

Run focused tests above + `cd web && npm run typecheck` before merge.

---

## Remaining genuine gaps

| Item | Notes |
| --- | --- |
| `identitySurfaceCompose` value resolvers | Value-path maps remain (not field catalogs); relationship/collection resolvers may need expansion as new provider kinds ship |
| Condition picker | Still uses `CONCEPT_TREE` for non-field condition paths — acceptable compat surface |
| Full E2E acceptance fixture | Operator QA path Settings → Publish → Identity Builder → runtime edit |

---

## Acceptance demonstration (test fixture)

Fixture: Children entity, Program category, custom Choice field `custom_program_detail` with options A/B.

Proven in tests (`identityFocusPanelFieldConsumer.test.ts`, `identityBuilderCanonicalFieldConvergence.test.ts`):

- Appears in Children Summary / Context / Details pickers without Identity code changes
- Grouped under Program category via `section_key`
- Canonical label and rename propagation
- Persisted refKey edit policy resolves label via canonical metadata
- Native `child.first_name` parity through same assembly path
