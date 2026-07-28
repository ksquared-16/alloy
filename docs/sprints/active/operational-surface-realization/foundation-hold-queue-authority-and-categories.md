# Foundation HOLD — Live queue authority + /fields categories (2026-07-24)

**Recommendation: HOLD** until authenticated browser proves both P0s.

## P0A — Exact live queue authority failure

### Owner that was rendering the old row

Live Enrollment Work Units resolved published `entity_layouts` through `resolveSurfaceVariant` **with `workViewId`**, so a **legacy work-view-scoped** published sibling (or `pipeline_queue_row` when surface id fell back) could outrank the Surface Builder document for `queue_row_enrollment`.

Builder GET / overlay resolve **without** `workViewId`, so they correctly showed the newest Builder publish (children names/count). Live D1 did not.

Second fracture: `pipeline-queue-row` + `processKey=enrollment` still used layout key `pipeline_queue_row`, never `queue_row_enrollment`.

### Fix (this change)

1. For `queue_row_*` keys: pick **highest published version** — Work View/stage applicability is **in-doc variants only**.
2. `pipeline-queue-row` + processKey → resolve `queue_row_${processKey}`.
3. Publish in-place path **demotes** other published same-key rows.
4. Overlay publish events match **surfaceId OR processKey**; DOM diagnostics: `data-queue-surface-id|version|variant|source|column-keys`.

### Cache / invalidation

- Server: `invalidateConfigReadCache('qrl:{orgId}:')` on publish (already + demote siblings).
- Client: overlay rematch on mount + publish event (processKey-aware) — **no restart required**.

## P0B — Hardcoded composer categories

### Exact source

1. Tabs came from **provider `categoryKey`**, labeled via Configuration hub seeds / title-case — not `/fields` registry labels.
2. `platformFieldCatalog.buildInquiryChildPlatformFields` hard-coded `section_key: "enrollment"`, collapsing Inquiry Participation into Enrollment / General.
3. No Show-all tab; search filtered only the active category list construction.

### Fix

- Shared `assembleSurfaceComposerFieldCatalog` (Focus Panel + future composers).
- Inquiry platform fields → `inquiry_participation`.
- Projection enrich forces `inquiry_participation` category.
- Labels via `resolveFieldsSectionLabel` / Fields operator labels.
- Show all + search-across-all; category filter for a single tab.

## Browser evidence (required)

| Check | Status |
|--|--|
| Diagnostics on live queue | Code ready — needs re-auth |
| Publish → live refresh | Code ready — needs re-auth |
| Inquiry Participation tab | Unit-proven; browser owed |

```js
window.__ALLOY_QUEUE_ROW_SURFACE_DIAG__
```

## Tests

`tests/adminV2/runtime/liveQueueSurfaceAuthorityAndCategories.test.ts` + prior rematch/names suites.

## Recommendation

**HOLD** — do not push/merge until live acceptance passes.
