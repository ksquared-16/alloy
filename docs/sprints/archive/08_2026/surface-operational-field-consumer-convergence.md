# Surface + Operational Field Consumer Convergence

**Status:** In progress — July 2026  
**Predecessor:** [identity-builder-canonical-field-convergence.md](./identity-builder-canonical-field-convergence.md)

---

## Answer (target)

**If I create a new compatible field in `/settings/fields`, how many Surface Builder or Business Process consumer files must change?**

**Zero** — for queue row, card/tile (focus panel), and stage requirement palette consumers wired in this phase.

---

## Consumer inventory

| Consumer | Before | After |
| --- | --- | --- |
| Queue row V2 library | `focus_panel` assembly + hardcoded labels | `queue_row` assembly + canonical labels |
| Queue zone/group pickers | defaultFieldKeys + tenant merge only | Full `assembleQueueRowProviders` + seeds |
| Focus Panel / Identity | `focus_panel` assembly | Unchanged (P0) |
| Stage requirement palette | Copied catalog labels | Canonical labels via `business_process` assembly |
| Work View conditions | Typed operational registry | Unchanged (typed predicates — not refKey fields) |
| Header/tile metrics | Operational Calculations registry | Unchanged (by design — not field refKeys) |
| Automation field pickers | Not built | Pending |

---

## Architecture

```text
/settings/fields
→ canonicalDataProviderRegistry
→ canonicalProviderDedup (shared)
→ assembleQueueRowProviders | assembleFocusPanelNestedProviders | assembleBusinessProcessProviders
→ compositionFieldAdapter (consumer param)
→ Surface Builder / lifecycle palette consumers
```

---

## Drift removed (this phase)

1. Queue row pickers use `queue_row` consumer gate (not `focus_panel`).
2. Shared deduplication utility (`canonicalProviderDedup.ts`).
3. Platform catalog merge applies to queue_row and business_process assemblies.
4. Queue row library uses canonical provider labels (not `FIELD_LIBRARY_LABELS` override).
5. Stage requirement catalog labels resolve from canonical providers.

---

## Remaining gaps

- Work View condition registry (`workViewConditionFieldRegistry`) — typed operational fields
- Legacy queue picker (`queueRecordFieldPickerCatalog`) — parallel path
- Collection item field catalog (`COLLECTION_ITEM_FIELD_CATALOG`)
- Drawer layout pickers — parallel manifest catalog
- Automation mutation/condition field pickers — not built
- Header/OI metrics — calculations registry (intentional)

---

## Tests

```bash
cd web && npm run test -- \
  tests/fields/surfaceOperationalFieldConsumerConvergence.test.ts \
  tests/adminV2/compositionFieldAdapter.test.ts \
  tests/fields/consumerCanonicalProviderAssembly.test.ts
```
