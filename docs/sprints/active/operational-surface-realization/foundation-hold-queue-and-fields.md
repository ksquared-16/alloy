# Foundation HOLD — Live queue owner + /fields catalog (2026-07-24)

**Recommendation: HOLD** — Phases 8–13 remain incomplete until Priority 0 is proven in an authenticated browser.

## Exact reason live queue ignored published Default (code-proven)

1. **Stale per-row variant slots after publish**  
   `usePublishedQueueRowSlotsOverlay` only replaced **Default** compact slots.  
   `ProvisionedWorkUnitSurface` then `mergeCompactSlotsInheritDefault(staleRowConfig, newDefault)`.  
   Stage-matched rows kept **pre-publish** `contact` / `groupCount` `fieldKeys` whenever the variant had configured those slots — so Default “add Children Names / remove email” did not win.

2. **Overlay rematch fix (this commit)**  
   Overlay now loads the full published `QueueRecordLayoutConfigV3` and **rematches every row** via `resolveQueueRowCompactSlots` (Default + variants + inherit).  
   Also passes `processKey` from the committed snapshot (was hard-coded `null`).  
   `useQueueRowPublish` now always `dispatchQueueRowSurfacePublished` (standalone builder path).

3. **Still possible after rematch**  
   If a **stage/Work View variant was authored with a full column copy** (including email, without children), rematch correctly keeps that variant’s columns. Editing Default alone cannot rewrite variant-authored columns. Diagnostics expose which fieldKeys the live row uses.

## Surface / version mismatch

Resolution is by **`layoutKey`** (`queue_row_enrollment`) + `resolveSurfaceVariant`, not by comparing surfaceId strings alone.  
Runtime surface id: `queue-row-{departmentId}-{processId}` from `queueRowSurfaceIdForDepartment`.  
Builder catalog uses the same `queueRowSurfaceId(entry.id)`.  
D1 caches `qrl:{orgId}:{surfaceId}:{processKey}:{workViewId}`; publish invalidates `qrl:{orgId}:`.  
Overlay GET historically omitted `workViewId` (layout rows are typically unconstrained) — rematch uses the published doc’s variants client-side.

## Field picker source (Priority 1)

Identity / nested Surface Builder pickers:  
`assembleFocusPanelNestedProviders` ← canonical registry + **platform field catalog** + capability filter  
→ `identityPickerFieldCatalog` / `availableFieldsForNestedGroup`.

**Why DOB was missing / hard to select:**  
`canonicalProviderDedup` aliased `child.age` → `child.date_of_birth`, collapsing Age and DOB into one picker identity (often the calculated Age path).  
**Fix:** remove that alias; keep `child.dob` → `child.date_of_birth`; map tenant `dob` → `child.date_of_birth` in capability parity.

## Composite registration (Priority 2)

Registered as **platform computed fields** (Settings → Fields, non-editable ownership):

- `children.names`
- `children.count`
- `children.summary`

Same ecosystem as `family.children_summary` / `opportunity.current_work` — stable keys, labels, provider ownership, intended surfaces.

## Priority 3

`surfaceFieldExclusionDiagnostics.ts` — developer reasons: wrong grain, no read provider, no aggregate, not compact-effective, capability, no edit adapter.

## Browser evidence

| Check | Result |
|-------|--------|
| Toolkit server `/login` | **200** (slot 4 healthy after `alloy-dev-start`) |
| Authenticated Surfaces → publish → New Leads | **Blocked** — Cursor browser session cannot attach authenticated storage; slot4 `storage-state.json` is stale (Jul 22). |

**Operator action required:** re-auth slot 4, then verify with:

```js
window.__ALLOY_QUEUE_ROW_SURFACE_DIAG__
```

and DOM attrs on `ProvisionedWorkUnitSurface` / `CondensedQueueRow`:
`data-queue-row-slots-source`, `data-queue-row-vm-group`, `data-queue-row-vm-contact`, `data-queue-row-has-children-names`.

## Tests run

- `tests/adminV2/runtime/queuePublishRematchAndDobCatalog.test.ts` ✅
- `tests/adminV2/runtime/surfaceFieldExclusionDiagnostics.test.ts` ✅
- `tests/presentation/runtime/queueRowVariantResolve.test.ts` ✅
- `tests/adminV2/identityBuilderCanonicalFieldConvergence.test.ts` ✅
- `tests/fields/computedFieldCatalog.test.ts` ✅

Typecheck / production build / authenticated QA: **deferred** until live browser proof.

## Recommendation

**HOLD** — do not promote. Re-run Priority 0 acceptance after re-auth; only then re-certify Phases 8–13.
