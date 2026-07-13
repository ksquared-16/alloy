# Surface + Operational Field Consumer Convergence

**Status:** Complete — July 2026  
**Predecessor:** [identity-builder-canonical-field-convergence.md](./identity-builder-canonical-field-convergence.md)

---

## Answer

**If I create a new compatible field in `/settings/fields`, how many implemented consumer files must change?**

**Zero.**

---

## Global consumer matrix

| Consumer | Source | Persisted identity | Status |
| --- | --- | --- | --- |
| Identity / Focus Panel card + nested pickers | `assembleFocusPanelNestedProviders` | `refKey` | Complete (P0) |
| Queue row V2 library + zone pickers | `assembleQueueRowProviders` | `refKey` | Complete |
| Stage requirement palette labels | `assembleBusinessProcessProviders` | rule_id + canonical label | Complete |
| Work View conditions | operational predicates + `resolveCanonicalConditionOperands` | `field_key` / `refKey` | Complete |
| Work View sort | `resolveWorkViewSortFieldOptions` (sort capability filter) | `field_key` / `refKey` | Complete |
| Process / transition conditions | `resolveProcessConditionOperands` | `refKey` | Complete |
| Automation conditions | `resolveAutomationConditionOperands` | `refKey` | Foundation complete (UI stub) |
| Automation mutation targets | `resolveAutomationMutationTargets` | `refKey` | Foundation complete (UI stub) |
| Drawer layout pickers | `assembleDrawerProviders` + `resolveDrawerCanonicalFieldLabel` | `refKey` | Complete |
| Collection item fields | `buildChildrenCollectionItemFieldCatalog` | item field key / `refKey` | Complete |
| Legacy queue picker | `queueRecordFieldPickerCatalog` → canonical `queue_row` labels | `refKey` | Delegated |
| Header/tile metrics | Operational Calculations registry | metric id | Intentionally separate |

---

## Shared architecture

```text
/settings/fields
→ canonicalDataProviderRegistry
→ canonicalProviderDedup
→ assemble*Providers (consumer capability filter)
→ resolveCanonicalConditionOperands (conditions)
→ resolveWorkViewSortFieldOptions (sort capability)
→ resolveAutomationMutationTargets (writable capability)
→ consumer presentation adapters
→ persisted stable refKey
→ runtime canonical resolver (+ legacy compatibility boundary)
```

### Condition operand seam

`web/lib/fields/canonicalConditionOperands.ts` — shared by Work Views, process/transition conditions, and automation conditions. Consumers own operators, grouping, and UI grammar only.

### Metrics vs fields boundary

**Operational Calculations** (queue/workspace metrics, aggregates, ratios) remain outside the Field Platform. Metric definitions are not fields. Metric configuration that exposes **input field pickers** (grouping/date/value/filter dimensions) must use canonical providers when implemented.

---

## Registry classification (remaining)

| Registry | Class | Owns |
| --- | --- | --- |
| `WORK_VIEW_CONDITION_FIELD_DEFS` | C + F + D | Operational predicates, operators, option sources — not custom field metadata |
| `LEGACY_WORK_VIEW_SORT_KEY_ALIASES` | E | Compatibility only |
| `LIFECYCLE_FIELD_REQUIREMENT_CATALOG` | E + F | Named rules — labels via canonical merge |
| `fieldPickerContextCatalog` | B + D + E | Context groups, visibility — labels delegate to canonical |
| Drawer structural manifests | B + D | Sections/tabs/containers — fields from canonical assembly |
| `COLLECTION_ITEM_FIELD_CATALOG` | E (seed) | Legacy seed; active catalog from `collectionItemFieldCatalog.ts` |
| Automation shell UI | F | Product stub — field foundation complete |

---

## Validation

```bash
cd web && npm run test -- \
  tests/fields/globalCanonicalFieldConsumerConvergence.test.ts \
  tests/fields/surfaceOperationalFieldConsumerConvergence.test.ts \
  tests/lifecycle/workViewConditionFieldRegistry.test.ts \
  tests/lifecycle/workViewFilterValueControls.test.ts \
  tests/layout/queueRecordFieldPickerCatalog.test.ts \
  tests/fields/consumerCanonicalProviderAssembly.test.ts

cd web && npm run typecheck
```

---

## Remaining genuine gaps

- **Automation product UI** — shell is intentionally stubbed; canonical condition/mutation foundation is complete.
- **Work View runtime** — canonical custom-field evaluation requires tenant field definitions at evaluation time (optional param on evaluator).
- **Operational Calculations** — not field consumers; no change required unless metric input pickers are added.
